// backend/routes/wealth.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const axios = require('axios');
const router = express.Router();
const WealthItem = require('../models/WealthItem');
const NetWorthHistory = require('../models/NetWorthHistory');
const { getLivePrices } = require('../services/marketDataService');
const { takeSnapshot } = require('../services/snapshotEngine');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// ─── Rate limiting for AI endpoint ──────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each user to 20 AI requests per window
  keyGenerator: (req) => req.user.id, // Use user ID as key
  message: { error: 'Too many AI requests. Please try again later.' },
});

// ─── Depreciation configuration per asset class ─────────────────────────────
// These rates can be moved to environment variables or a database table.
const DEPRECIATION_RATES = {
  illiquid_asset: 0.15, // Real estate, physical assets
  vehicle: 0.20,        // Vehicles (if we add this class later)
  equipment: 0.25,      // Machinery/equipment
  // Default fallback
  default: 0.15,
};

// ─── Valid asset classes (align with frontend) ─────────────────────────────
const VALID_ASSET_CLASSES = [
  'liquid_asset',
  'illiquid_asset',
  'business_equity',
  'retirement',
  'liability',
];

// ─── Helper: Calculate depreciation with class‑specific rate ────────────────
const calculateDepreciation = (baseValue, acquisitionDate, assetClass = 'illiquid_asset') => {
  if (!acquisitionDate || !baseValue) return baseValue;
  const date = new Date(acquisitionDate);
  if (isNaN(date.getTime())) return baseValue; // Invalid date → no depreciation

  const yearsOwned = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
  const rate = DEPRECIATION_RATES[assetClass] || DEPRECIATION_RATES.default;
  const depreciated = baseValue * Math.pow(1 - rate, Math.max(0, yearsOwned));
  return parseFloat(depreciated.toFixed(2));
};

// ─── Helper: Parse and validate money (non‑negative, max 2 decimals) ───────
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : Number.EPSILON) || amount > 999999999.99) return null;
  return Number(amount.toFixed(2));
};

// ─── Helper: Validate date string ────────────────────────────────────────────
const isValidDateString = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
};

// ─── Helper: AI prompt with user's currency ──────────────────────────────────
const buildAIPrompt = (metrics, currencySymbol = '₹') => {
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

// ─── Gemini API call using axios with timeout and retry ─────────────────────
const fetchGeminiInsight = async (prompt, retries = 2) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 120,
      temperature: 0.75,
    },
  };

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(url, payload, {
        timeout: 15000, // 15 seconds
        headers: { 'Content-Type': 'application/json' },
      });

      const candidates = response.data?.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('No candidates returned from Gemini.');
      }
      const text = candidates[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini.');
      return text.trim();
    } catch (error) {
      lastError = error;
      // If rate‑limited (429), do not retry immediately
      if (error.response?.status === 429) {
        throw new Error('Gemini rate limit exceeded.');
      }
      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError || new Error('Failed to fetch AI insight after retries.');
};

// ─── Simple in‑memory cache for AI responses ──────────────────────────────
const aiCache = new Map();
const AI_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── ROUTES ────────────────────────────────────────────────────────────────────

/**
 * @route  GET /api/wealth/items
 * @desc   Fetch all portfolio items, fully hydrated with live prices and depreciation
 */
router.get('/items', auth, async (req, res) => {
  try {
    const items = await WealthItem.find({ user_id: req.user.id });

    const symbolsToFetch = items
      .filter(item => item.symbol && item.quantity)
      .map(item => item.symbol);

    const livePrices = symbolsToFetch.length > 0
      ? await getLivePrices(symbolsToFetch)
      : {};

    const hydratedItems = items.map(item => {
      let currentValue;

      if (item.asset_class === 'illiquid_asset' || item.asset_class === 'business_equity') {
        // Apply depreciation for illiquid assets if no manual override
        if (item.current_value_override !== null && item.current_value_override !== undefined) {
          currentValue = item.current_value_override;
        } else {
          currentValue = calculateDepreciation(
            item.base_value,
            item.acquisition_date,
            item.asset_class
          );
        }
      } else if (item.symbol && item.quantity && livePrices[item.symbol]) {
        currentValue = Number((item.quantity * livePrices[item.symbol]).toFixed(2));
      } else {
        currentValue = item.base_value;
      }

      return {
        ...item._doc,
        current_value: currentValue,
        live_price: livePrices[item.symbol] || null,
      };
    });

    res.json(hydratedItems);
  } catch (error) {
    console.error('[Wealth] GET /items error:', error);
    res.status(500).json({ error: 'Failed to fetch wealth data.' });
  }
});

/**
 * @route  POST /api/wealth/items
 * @desc   Add a new asset or liability with full validation
 */
router.post(
  '/items',
  auth,
  [
    body('name').isString().trim().notEmpty().withMessage('Name is required.'),
    body('asset_class').isIn(VALID_ASSET_CLASSES).withMessage('Invalid asset class.'),
    body('base_value').isFloat({ min: 0.01 }).withMessage('Base value must be a positive number.'),
    body('symbol').optional().isString().trim().isLength({ max: 20 }),
    body('quantity').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Quantity must be a non‑negative number.'),
    body('interest_rate').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('Interest rate must be between 0 and 100.'),
    body('acquisition_date').optional({ nullable: true }).isISO8601().toDate().withMessage('Invalid date format.'),
    body('current_value_override').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Override must be a non‑negative number.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, asset_class, base_value, symbol, quantity, interest_rate, acquisition_date, current_value_override } = req.body;

    try {
      const newItem = new WealthItem({
        user_id: req.user.id,
        name: name.trim(),
        asset_class,
        base_value: parseFloat(base_value),
        symbol: symbol ? symbol.trim().toUpperCase() : null,
        quantity: quantity !== undefined && quantity !== '' ? parseFloat(quantity) : null,
        interest_rate: interest_rate !== undefined && interest_rate !== '' ? parseFloat(interest_rate) : null,
        acquisition_date: acquisition_date ? new Date(acquisition_date) : new Date(),
        current_value_override: current_value_override !== undefined && current_value_override !== ''
          ? parseFloat(current_value_override)
          : null,
      });

      const savedItem = await newItem.save();

      // Trigger snapshot asynchronously
      setImmediate(() => {
        takeSnapshot(req.user.id).catch(e =>
          console.warn(`[Wealth] Snapshot failed after POST for user ${req.user.id}:`, e.message)
        );
      });

      res.status(201).json(savedItem);
    } catch (error) {
      console.error('[Wealth] POST /items error:', error);
      res.status(400).json({ error: error.message || 'Could not save entry.' });
    }
  }
);

/**
 * @route  PUT /api/wealth/items/:id
 * @desc   Update an existing asset or liability with validation
 */
router.put(
  '/items/:id',
  auth,
  [
    param('id').isMongoId().withMessage('Invalid item ID.'),
    body('name').optional().isString().trim().notEmpty(),
    body('asset_class').optional().isIn(VALID_ASSET_CLASSES),
    body('base_value').optional().isFloat({ min: 0.01 }),
    body('symbol').optional().isString().trim().isLength({ max: 20 }),
    body('quantity').optional({ nullable: true }).isFloat({ min: 0 }),
    body('interest_rate').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body('acquisition_date').optional({ nullable: true }).isISO8601().toDate(),
    body('current_value_override').optional({ nullable: true }).isFloat({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const item = await WealthItem.findOne({ _id: req.params.id, user_id: req.user.id });
      if (!item) return res.status(404).json({ error: 'Item not found or access denied.' });

      const { name, asset_class, base_value, symbol, quantity, interest_rate, acquisition_date, current_value_override } = req.body;

      if (name !== undefined) item.name = name.trim();
      if (asset_class !== undefined) item.asset_class = asset_class;
      if (base_value !== undefined) item.base_value = parseFloat(base_value);
      if (symbol !== undefined) item.symbol = symbol ? symbol.trim().toUpperCase() : null;
      if (quantity !== undefined) {
        item.quantity = quantity !== '' && quantity != null ? parseFloat(quantity) : null;
      }
      if (interest_rate !== undefined) {
        item.interest_rate = interest_rate !== '' && interest_rate != null ? parseFloat(interest_rate) : null;
      }
      if (acquisition_date !== undefined) {
        item.acquisition_date = acquisition_date ? new Date(acquisition_date) : null;
      }
      if (current_value_override !== undefined) {
        item.current_value_override = current_value_override !== '' && current_value_override != null
          ? parseFloat(current_value_override)
          : null;
      }

      const updated = await item.save();

      setImmediate(() => {
        takeSnapshot(req.user.id).catch(e =>
          console.warn(`[Wealth] Snapshot failed after PUT for user ${req.user.id}:`, e.message)
        );
      });

      res.json(updated);
    } catch (error) {
      console.error('[Wealth] PUT /items error:', error);
      res.status(400).json({ error: error.message || 'Could not update entry.' });
    }
  }
);

/**
 * @route  DELETE /api/wealth/items/:id
 * @desc   Remove an item and trigger snapshot
 */
router.delete(
  '/items/:id',
  auth,
  [
    param('id').isMongoId().withMessage('Invalid item ID.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const item = await WealthItem.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
      if (!item) return res.status(404).json({ error: 'Item not found or access denied.' });

      setImmediate(() => {
        takeSnapshot(req.user.id).catch(e =>
          console.warn(`[Wealth] Snapshot failed after DELETE for user ${req.user.id}:`, e.message)
        );
      });

      res.json({ message: 'Item deleted successfully.' });
    } catch (error) {
      console.error('[Wealth] DELETE /items error:', error);
      res.status(500).json({ error: 'Server error during deletion.' });
    }
  }
);

/**
 * @route  GET /api/wealth/history
 * @desc   Fetch net worth history with optional date range
 */
router.get(
  '/history',
  auth,
  [
    // Optional query parameters for date range
    // e.g. ?start=2024-01-01&end=2024-12-31
  ],
  async (req, res) => {
    try {
      const { start, end } = req.query;
      const filter = { user_id: req.user.id };
      if (start) {
        const startDate = new Date(start);
        if (!isNaN(startDate.getTime())) filter.snapshot_date = { $gte: startDate };
      }
      if (end) {
        const endDate = new Date(end);
        if (!isNaN(endDate.getTime())) {
          filter.snapshot_date = { ...filter.snapshot_date, $lte: endDate };
        }
      }

      const history = await NetWorthHistory.find(filter)
        .sort({ snapshot_date: 1 })
        .limit(24);

      res.json(
        history.map(h => ({
          month: new Date(h.snapshot_date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          netWorth: h.net_worth,
          totalAssets: h.total_assets,
          totalLiabilities: h.total_liabilities,
        }))
      );
    } catch (error) {
      console.error('[Wealth] GET /history error:', error);
      res.status(500).json({ error: 'Failed to fetch wealth history.' });
    }
  }
);

/**
 * @route  POST /api/wealth/ai-insights
 * @desc   Gemini AI coach with caching, rate limiting, and user currency
 */
router.post(
  '/ai-insights',
  auth,
  aiLimiter,
  [
    body('totalAssets').optional().isFloat({ min: 0 }).toFloat(),
    body('liquidAssets').optional().isFloat({ min: 0 }).toFloat(),
    body('physicalAssets').optional().isFloat({ min: 0 }).toFloat(),
    body('liabilities').optional().isFloat({ min: 0 }).toFloat(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        insight: 'AI Coach offline: GEMINI_API_KEY not configured on the server.',
      });
    }

    try {
      // Get user's currency setting (from User model)
      const user = await require('../models/User').findById(req.user.id).select('currency');
      const currencySymbol = user?.currency === 'INR' ? '₹' :
                            user?.currency === 'EUR' ? '€' :
                            user?.currency === 'GBP' ? '£' :
                            user?.currency === 'USD' ? '$' : '$';

      const { totalAssets = 0, liquidAssets = 0, physicalAssets = 0, liabilities = 0 } = req.body;
      const metrics = { totalAssets, liquidAssets, physicalAssets, liabilities };

      // Build cache key using a hash of the metrics + currency
      const cacheKey = `${req.user.id}_${totalAssets}_${liquidAssets}_${physicalAssets}_${liabilities}_${currencySymbol}`;

      // Check cache
      if (aiCache.has(cacheKey)) {
        const cached = aiCache.get(cacheKey);
        if (Date.now() - cached.timestamp < AI_CACHE_TTL) {
          return res.json({ insight: cached.insight, cached: true });
        }
        aiCache.delete(cacheKey);
      }

      const prompt = buildAIPrompt(metrics, currencySymbol);
      const insight = await fetchGeminiInsight(prompt);

      // Store in cache
      aiCache.set(cacheKey, { insight, timestamp: Date.now() });

      res.json({ insight, cached: false });
    } catch (error) {
      console.error('[Wealth] AI Insights Error:', error.message);
      const fallback = 'Your portfolio is diversified. Consider reviewing your asset allocation to ensure it aligns with your risk tolerance.';
      res.status(500).json({ insight: fallback, error: 'AI temporarily unavailable.' });
    }
  }
);

/**
 * @route  GET /api/wealth/ai-status
 * @desc   Health‑check for Gemini AI connectivity
 */
router.get('/ai-status', auth, async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ status: 'unconfigured', message: 'GEMINI_API_KEY missing from .env' });
  }

  try {
    const testPrompt = 'ping';
    await fetchGeminiInsight(testPrompt, 1);
    res.json({ status: 'online', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
  } catch (error) {
    const status = error.message.includes('rate limit') ? 'quota_exceeded' : 'error';
    res.json({ status, message: error.message });
  }
});

module.exports = router;
