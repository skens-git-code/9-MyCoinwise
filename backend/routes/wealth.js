// backend/routes/wealth.js
/**
 * wealth.js — Portfolio items, net-worth history, and AI insights
 *
 * Endpoints:
 *   GET    /api/wealth/items            Hydrated items (live prices + depreciation)
 *   POST   /api/wealth/items            Create item
 *   PUT    /api/wealth/items/:id        Update item
 *   DELETE /api/wealth/items/:id        Delete item
 *   GET    /api/wealth/history          Net-worth history (last 24 snapshots)
 *   POST   /api/wealth/ai-insights      Gemini AI coach
 *   GET    /api/wealth/ai-status        AI connectivity health check
 *
 * Fixes vs. the previous version:
 *   1. API key sent via header instead of query string (was leaking the
 *      key into server logs, proxies, and error objects).
 *   2. POST /items no longer coerces `null` quantity / interest_rate /
 *      current_value_override into NaN. The previous ternary checked
 *      `!== undefined && !== ''` but not `!== null`, so a JSON body
 *      containing `{ quantity: null }` produced `NaN` and triggered a
 *      Mongoose validation error.
 *   3. getLivePrices() failure now degrades gracefully. Before, one
 *      market-data hiccup failed the entire GET /items response.
 *   4. AI fallback response returned as 200 so the client displays the
 *      server's message instead of overwriting it with its own. Was
 *      previously sent with a 500 that the axios client treated as an
 *      error and discarded.
 *   5. Retry logic only retries on 5xx / network errors, not on 4xx
 *      (a 400 from Gemini would have been retried twice for no reason).
 *   6. In-memory AI cache now has a periodic cleanup so entries do not
 *      accumulate forever on long-running servers.
 *   7. Removed dead code (`parseMoney`, `isValidDateString`, and the
 *      `vehicle` / `equipment` entries in DEPRECIATION_RATES that had no
 *      matching asset class).
 *   8. Uses the shared `logger` instead of `console.error`/`console.warn`.
 *   9. Router-level auth middleware (was per-route).
 *  10. Cache-Control on every response.
 *  11. Rate limiter key coerced to string for consistency.
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const axios = require('axios');
const router = express.Router();
const WealthItem = require('../models/WealthItem');
const NetWorthHistory = require('../models/NetWorthHistory');
const User = require('../models/User');
const { getLivePrices } = require('../services/marketDataService');
const { takeSnapshot } = require('../services/snapshotEngine');
const auth = require('../middleware/auth');
const { logger } = require('../utils/logger');
const rateLimit = require('express-rate-limit');

/* ============================================================
 * Rate limiting
 * ============================================================ */

/* Original buggy code:
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => String(req.user?.id || req.user?._id || req.ip),
  message: { error: 'Too many AI requests. Please try again later.' },
});
// Issue: express-rate-limit v7+ throws ERR_ERL_KEY_GEN_IPV6 when returning bare req.ip in keyGenerator without keyGeneratorIpFallback: false.
*/
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => String(req.user?.id || req.user?._id || 'authenticated_user'),
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many AI requests. Please try again later.' },
});

/* ============================================================
 * Constants
 * ============================================================ */

const VALID_ASSET_CLASSES = [
  'liquid_asset',
  'illiquid_asset',
  'business_equity',
  'retirement',
  'liability',
];

// Annual depreciation per asset class. Rates reflect typical asset
// behaviour and can be externalised to env vars if needed.
const DEPRECIATION_RATES = {
  illiquid_asset: 0.15,
  default: 0.15,
};

const AI_CACHE_TTL_MS = 5 * 60 * 1000;
const AI_CACHE_CLEANUP_MS = 60 * 1000;

/* ============================================================
 * Helpers
 * ============================================================ */

const calculateDepreciation = (baseValue, acquisitionDate, assetClass = 'illiquid_asset') => {
  if (!acquisitionDate || baseValue == null) return baseValue;
  const date = new Date(acquisitionDate);
  if (Number.isNaN(date.getTime())) return baseValue;

  const yearsOwned = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
  const rate = DEPRECIATION_RATES[assetClass] || DEPRECIATION_RATES.default;
  const depreciated = baseValue * Math.pow(1 - rate, Math.max(0, yearsOwned));
  return parseFloat(depreciated.toFixed(2));
};

/**
 * Normalise an optional numeric field.
 * Treats undefined, null, and empty string as "not provided".
 * Returns a finite number, or null when the field should be cleared.
 * Throws on invalid non-empty input so the caller can map to a 400.
 */
const normalizeOptionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(num)) throw new Error('Invalid numeric value');
  return num;
};

const buildAIPrompt = (metrics, currencySymbol = '$') => {
  const { totalAssets, liquidAssets, physicalAssets, liabilities } = metrics;
  const netWorth = totalAssets - liabilities;
  const debtRatio = totalAssets > 0 ? ((liabilities / totalAssets) * 100).toFixed(1) : '0';

  return `You are MyCoinwise, a cyberpunk AI wealth advisor. Portfolio summary:
Net Worth ${currencySymbol}${Math.round(netWorth).toLocaleString()},
Total Assets ${currencySymbol}${Math.round(totalAssets).toLocaleString()},
Liquid ${currencySymbol}${Math.round(liquidAssets).toLocaleString()},
Physical ${currencySymbol}${Math.round(physicalAssets).toLocaleString()},
Liabilities ${currencySymbol}${Math.round(liabilities).toLocaleString()},
Debt-to-Asset: ${debtRatio}%.

Write exactly 2 punchy, actionable financial insights. No markdown. No hedging. Be direct and specific.`;
};

const CURRENCY_SYMBOLS = {
  INR: '₹', EUR: '€', GBP: '£', USD: '$',
  JPY: '¥', CAD: 'CA$', AUD: 'A$', SGD: 'S$',
  AED: 'د.إ', CHF: 'Fr', CNY: '¥', MXN: '$',
  BRL: 'R$', KRW: '₩', THB: '฿',
};

/* ============================================================
 * Gemini API
 * ============================================================ */

const fetchGeminiInsight = async (prompt, retries = 2) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 120,
      temperature: 0.75,
    },
  };

  const options = {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-goog-api-key': apiKey,
    },
  };

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await axios.post(url, payload, options);
      const candidates = response.data?.candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error('No candidates returned from Gemini.');
      }
      const text = candidates[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Empty response from Gemini.');
      }
      return text.trim();
    } catch (error) {
      lastError = error;
      const status = error.response?.status;

      // 4xx (except 429) means the request was malformed — retrying
      // would produce the same result. Fail immediately.
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw error;
      }
      if (status === 429) {
        throw new Error('Gemini rate limit exceeded.');
      }
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError || new Error('Failed to fetch AI insight after retries.');
};

/* ============================================================
 * AI response cache
 * ============================================================ */

const aiCache = new Map();

// Periodic cleanup so entries don't accumulate forever. Without this,
// a long-running server would eventually exhaust memory for users with
// changing metrics.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of aiCache.entries()) {
    if (now - value.timestamp >= AI_CACHE_TTL_MS) aiCache.delete(key);
  }
}, AI_CACHE_CLEANUP_MS).unref(); // `.unref()` so the timer doesn't keep the process alive

/* ============================================================
 * Router middleware
 * ============================================================ */

router.use(auth);

router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (!req.user || (!req.user.id && !req.user._id)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = req.user.id || req.user._id;
  next();
});

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* ============================================================
 * GET /items — Hydrated portfolio items
 * ============================================================ */

router.get('/items', async (req, res) => {
  try {
    const items = await WealthItem.find({ user_id: req.userId });

    // Build the list of symbols to fetch prices for. Duplicate symbols
    // are de-duplicated by the market data service (or here if not).
    const symbolsToFetch = [
      ...new Set(
        items
          .filter((item) => item.symbol && item.quantity)
          .map((item) => item.symbol)
      ),
    ];

    // Market data is best-effort. A transient failure in the external
    // provider must not blank the entire portfolio view.
    let livePrices = {};
    if (symbolsToFetch.length > 0) {
      try {
        livePrices = (await getLivePrices(symbolsToFetch)) || {};
      } catch (err) {
        logger.warn('[Wealth] getLivePrices failed; serving base values', {
          userId: String(req.userId),
          error: err.message,
        });
        livePrices = {};
      }
    }

    const hydratedItems = items.map((item) => {
      let currentValue;

      if (item.asset_class === 'illiquid_asset' || item.asset_class === 'business_equity') {
        if (item.current_value_override != null) {
          currentValue = item.current_value_override;
        } else {
          currentValue = calculateDepreciation(
            item.base_value,
            item.acquisition_date,
            item.asset_class
          );
        }
      } else if (item.symbol && item.quantity && livePrices[item.symbol] != null) {
        currentValue = Number((item.quantity * livePrices[item.symbol]).toFixed(2));
      } else {
        currentValue = item.base_value;
      }

      return {
        ...item.toObject(),
        current_value: currentValue,
        live_price: livePrices[item.symbol] ?? null,
      };
    });

    return res.json(hydratedItems);
  } catch (error) {
    logger.error('[Wealth] GET /items error:', error);
    return res.status(500).json({ error: 'Failed to fetch wealth data.' });
  }
});

/* ============================================================
 * POST /items — Create
 * ============================================================ */

router.post(
  '/items',
  [
    body('name').isString().trim().notEmpty().withMessage('Name is required.'),
    body('asset_class').isIn(VALID_ASSET_CLASSES).withMessage('Invalid asset class.'),
    body('base_value').isFloat({ min: 0.01 }).withMessage('Base value must be a positive number.'),
    body('symbol').optional().isString().trim().isLength({ max: 20 }),
    body('quantity').optional({ nullable: true }).isFloat({ min: 0 })
      .withMessage('Quantity must be a non-negative number.'),
    body('interest_rate').optional({ nullable: true }).isFloat({ min: 0, max: 100 })
      .withMessage('Interest rate must be between 0 and 100.'),
    body('acquisition_date').optional({ nullable: true }).isISO8601().toDate()
      .withMessage('Invalid date format.'),
    /* Original POST /items validation without note:
    body('current_value_override').optional({ nullable: true }).isFloat({ min: 0 })
      .withMessage('Override must be a non-negative number.'),
    // Issue: Omitted 'note' validator, dropping notes entered in UI on wealth items.
    */
    body('current_value_override').optional({ nullable: true }).isFloat({ min: 0 })
      .withMessage('Override must be a non-negative number.'),
    body('note').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 1000 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    /* Original POST destructuring without note:
    const {
      name,
      asset_class,
      base_value,
      symbol,
      quantity,
      interest_rate,
      acquisition_date,
      current_value_override,
    } = req.body;
    // Issue: note field was not extracted from req.body.
    */
    const {
      name,
      asset_class,
      base_value,
      symbol,
      quantity,
      interest_rate,
      acquisition_date,
      current_value_override,
      note,
    } = req.body;

    try {
      const newItem = new WealthItem({
        user_id: req.userId,
        name: name.trim(),
        asset_class,
        base_value: Number(base_value),
        symbol: symbol ? symbol.trim().toUpperCase() : null,
        // FIX: normalizeOptionalNumber treats null/''/undefined as null
        // and returns the number otherwise. The previous ternary coerced
        // `null` into NaN, failing Mongoose validation for JSON bodies
        // that explicitly sent null.
        quantity: normalizeOptionalNumber(quantity),
        interest_rate: normalizeOptionalNumber(interest_rate),
        /* Original instantiation without note:
        acquisition_date: acquisition_date ? new Date(acquisition_date) : new Date(),
        current_value_override: normalizeOptionalNumber(current_value_override),
        // Issue: note was omitted from WealthItem instantiation.
        */
        acquisition_date: acquisition_date ? new Date(acquisition_date) : new Date(),
        current_value_override: normalizeOptionalNumber(current_value_override),
        note: note ? String(note).trim().slice(0, 1000) : '',
      });

      const savedItem = await newItem.save();

      // Snapshot is fire-and-forget so the request returns quickly.
      setImmediate(() => {
        takeSnapshot(req.userId).catch((e) => {
          logger.warn('[Wealth] Snapshot failed after POST', {
            userId: String(req.userId),
            error: e.message,
          });
        });
      });

      return res.status(201).json(savedItem);
    } catch (error) {
      logger.error('[Wealth] POST /items error:', error);
      return res.status(400).json({ error: error.message || 'Could not save entry.' });
    }
  }
);

/* ============================================================
 * PUT /items/:id — Update
 * ============================================================ */

router.put(
  '/items/:id',
  [
    param('id').isMongoId().withMessage('Invalid item ID.'),
    body('name').optional().isString().trim().notEmpty(),
    body('asset_class').optional().isIn(VALID_ASSET_CLASSES),
    body('base_value').optional().isFloat({ min: 0.01 }),
    body('symbol').optional().isString().trim().isLength({ max: 20 }),
    body('quantity').optional({ nullable: true }).isFloat({ min: 0 }),
    body('interest_rate').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body('acquisition_date').optional({ nullable: true }).isISO8601().toDate(),
    /* Original PUT validation without note:
    body('current_value_override').optional({ nullable: true }).isFloat({ min: 0 }),
    // Issue: PUT endpoint omitted note validation.
    */
    body('current_value_override').optional({ nullable: true }).isFloat({ min: 0 }),
    body('note').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 1000 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const item = await WealthItem.findOne({ _id: req.params.id, user_id: req.userId });
      if (!item) return res.status(404).json({ error: 'Item not found or access denied.' });

      /* Original PUT destructuring without note:
      const {
        name,
        asset_class,
        base_value,
        symbol,
        quantity,
        interest_rate,
        acquisition_date,
        current_value_override,
      } = req.body;
      // Issue: note field was not extracted on PUT.
      */
      const {
        name,
        asset_class,
        base_value,
        symbol,
        quantity,
        interest_rate,
        acquisition_date,
        current_value_override,
        note,
      } = req.body;

      if (name !== undefined) item.name = name.trim();
      if (asset_class !== undefined) item.asset_class = asset_class;
      if (base_value !== undefined) item.base_value = Number(base_value);
      if (symbol !== undefined) item.symbol = symbol ? symbol.trim().toUpperCase() : null;
      if (quantity !== undefined) item.quantity = normalizeOptionalNumber(quantity);
      if (interest_rate !== undefined) item.interest_rate = normalizeOptionalNumber(interest_rate);
      if (acquisition_date !== undefined) {
        item.acquisition_date = acquisition_date ? new Date(acquisition_date) : null;
      }
      /* Original PUT update logic omitting note:
      if (current_value_override !== undefined) {
        item.current_value_override = normalizeOptionalNumber(current_value_override);
      }
      // Issue: note field was never updated on existing items.
      */
      if (current_value_override !== undefined) {
        item.current_value_override = normalizeOptionalNumber(current_value_override);
      }
      if (note !== undefined) {
        item.note = note ? String(note).trim().slice(0, 1000) : '';
      }

      const updated = await item.save();

      setImmediate(() => {
        takeSnapshot(req.userId).catch((e) => {
          logger.warn('[Wealth] Snapshot failed after PUT', {
            userId: String(req.userId),
            error: e.message,
          });
        });
      });

      return res.json(updated);
    } catch (error) {
      logger.error('[Wealth] PUT /items error:', error);
      return res.status(400).json({ error: error.message || 'Could not update entry.' });
    }
  }
);

/* ============================================================
 * DELETE /items/:id
 * ============================================================ */

router.delete(
  '/items/:id',
  [param('id').isMongoId().withMessage('Invalid item ID.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const item = await WealthItem.findOneAndDelete({
        _id: req.params.id,
        user_id: req.userId,
      });
      if (!item) return res.status(404).json({ error: 'Item not found or access denied.' });

      setImmediate(() => {
        takeSnapshot(req.userId).catch((e) => {
          logger.warn('[Wealth] Snapshot failed after DELETE', {
            userId: String(req.userId),
            error: e.message,
          });
        });
      });

      return res.json({ message: 'Item deleted successfully.' });
    } catch (error) {
      logger.error('[Wealth] DELETE /items error:', error);
      return res.status(500).json({ error: 'Server error during deletion.' });
    }
  }
);

/* ============================================================
 * GET /history — Net-worth snapshots
 * ============================================================ */

router.get('/history', async (req, res) => {
  try {
    const { start, end } = req.query;
    const filter = { user_id: req.userId };

    if (start) {
      const startDate = new Date(start);
      if (!Number.isNaN(startDate.getTime())) {
        filter.snapshot_date = { ...filter.snapshot_date, $gte: startDate };
      }
    }
    if (end) {
      const endDate = new Date(end);
      if (!Number.isNaN(endDate.getTime())) {
        filter.snapshot_date = { ...filter.snapshot_date, $lte: endDate };
      }
    }

    const history = await NetWorthHistory.find(filter)
      .sort({ snapshot_date: 1 })
      .limit(24);

    return res.json(
      history.map((h) => ({
        month: new Date(h.snapshot_date).toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        }),
        netWorth: h.net_worth,
        totalAssets: h.total_assets,
        totalLiabilities: h.total_liabilities,
      }))
    );
  } catch (error) {
    logger.error('[Wealth] GET /history error:', error);
    return res.status(500).json({ error: 'Failed to fetch wealth history.' });
  }
});

/* ============================================================
 * POST /ai-insights
 * ============================================================ */

router.post(
  '/ai-insights',
  aiLimiter,
  [
    body('totalAssets').optional().isFloat({ min: 0 }).toFloat(),
    body('liquidAssets').optional().isFloat({ min: 0 }).toFloat(),
    body('physicalAssets').optional().isFloat({ min: 0 }).toFloat(),
    body('liabilities').optional().isFloat({ min: 0 }).toFloat(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        insight: 'AI Coach offline: GEMINI_API_KEY not configured on the server.',
        offline: true,
      });
    }

    try {
      const user = await User.findById(req.userId).select('currency').lean();
      const currencySymbol = CURRENCY_SYMBOLS[user?.currency] || '$';

      const totalAssets = Number(req.body.totalAssets) || 0;
      const liquidAssets = Number(req.body.liquidAssets) || 0;
      const physicalAssets = Number(req.body.physicalAssets) || 0;
      const liabilities = Number(req.body.liabilities) || 0;

      const metrics = { totalAssets, liquidAssets, physicalAssets, liabilities };
      const cacheKey = [
        req.userId,
        totalAssets,
        liquidAssets,
        physicalAssets,
        liabilities,
        currencySymbol,
      ].join('_');

      const cached = aiCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < AI_CACHE_TTL_MS) {
        return res.json({ insight: cached.insight, cached: true });
      }

      const prompt = buildAIPrompt(metrics, currencySymbol);
      const insight = await fetchGeminiInsight(prompt);

      aiCache.set(cacheKey, { insight, timestamp: Date.now() });

      return res.json({ insight, cached: false });
    } catch (error) {
      logger.error('[Wealth] AI Insights Error:', error.message);

      const fallback =
        'Your portfolio is diversified. Consider reviewing your asset allocation to ensure it aligns with your risk tolerance.';

      // FIX: return 200 with the fallback so axios-based clients
      // (which throw on 4xx/5xx) display the server's message instead
      // of discarding it and showing their own generic fallback.
      return res.status(200).json({ insight: fallback, fallback: true });
    }
  }
);

/* ============================================================
 * GET /ai-status — Health check
 * ============================================================ */

router.get('/ai-status', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ status: 'unconfigured', message: 'GEMINI_API_KEY missing from .env' });
  }

  try {
    await fetchGeminiInsight('ping', 1);
    return res.json({
      status: 'online',
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    });
  } catch (error) {
    const status = /rate limit/i.test(error.message) ? 'quota_exceeded' : 'error';
    return res.json({ status, message: error.message });
  }
});

module.exports = router;