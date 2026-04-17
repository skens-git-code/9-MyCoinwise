// backend/routes/wealth.js
const express = require('express');
const https = require('https');
const router = express.Router();
const WealthItem = require('../models/WealthItem');
const NetWorthHistory = require('../models/NetWorthHistory');
const { getLivePrices } = require('../services/marketDataService');
const { takeSnapshot } = require('../services/snapshotEngine');
const auth = require('../middleware/auth');

// ─── Utility: Depreciation (Single Source of Truth — Backend Only) ────────────
const calculateDepreciation = (baseValue, acquisitionDate, rate = 0.15) => {
  if (!acquisitionDate) return baseValue;
  const yearsOwned = (Date.now() - new Date(acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
  return parseFloat((baseValue * Math.pow(1 - rate, Math.max(0, yearsOwned))).toFixed(2));
};

// ─── Utility: HTTPS request (avoids any global fetch quirks) ──────────────────
const httpsPost = (hostname, path, body) => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Failed to parse JSON response')); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

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
      let livePrice = null;

      if (item.asset_class === 'illiquid_asset') {
        currentValue = calculateDepreciation(item.base_value, item.acquisition_date);
      } else if (item.symbol && item.quantity && livePrices[item.symbol]) {
        livePrice = livePrices[item.symbol];
        currentValue = Number((item.quantity * livePrice).toFixed(2));
      } else {
        currentValue = item.base_value;
      }

      return { ...item._doc, current_value: currentValue, live_price: livePrice };
    });

    res.json(hydratedItems);
  } catch (error) {
    console.error('Wealth GET /items Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch wealth data.' });
  }
});

/**
 * @route  POST /api/wealth/items
 * @desc   Add a new asset or liability; enforces correct numeric types
 */
router.post('/items', auth, async (req, res) => {
  try {
    const { name, asset_class, base_value, symbol, quantity, interest_rate, acquisition_date } = req.body;

    if (!name || !asset_class || base_value === undefined || base_value === '') {
      return res.status(400).json({ error: 'Name, type, and base value are required.' });
    }

    const parsedBaseValue = parseFloat(base_value);
    if (isNaN(parsedBaseValue)) {
      return res.status(400).json({ error: 'Base value must be a valid number.' });
    }

    const newItem = new WealthItem({
      user_id: req.user.id,
      name: String(name).trim(),
      asset_class,
      base_value: parsedBaseValue,
      symbol: symbol ? String(symbol).trim().toUpperCase() : null,
      quantity: quantity !== '' && quantity != null ? parseFloat(quantity) : null,
      interest_rate: interest_rate !== '' && interest_rate != null ? parseFloat(interest_rate) : null,
      acquisition_date: acquisition_date ? new Date(acquisition_date) : new Date(),
    });

    const savedItem = await newItem.save();

    // Trigger async snapshot — never blocks or rejects the main response
    setImmediate(() => {
      takeSnapshot(req.user.id).catch(e =>
        console.warn(`Post-add snapshot skipped for user ${req.user.id}:`, e.message)
      );
    });

    res.status(201).json(savedItem);
  } catch (error) {
    console.error('Wealth POST /items Error:', error.message);
    res.status(400).json({ error: error.message || 'Could not save entry.' });
  }
});

/**
 * @route  DELETE /api/wealth/items/:id
 * @desc   Remove an item and trigger background snapshot
 */
router.delete('/items/:id', auth, async (req, res) => {
  try {
    const item = await WealthItem.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
    if (!item) return res.status(404).json({ error: 'Item not found or access denied.' });

    setImmediate(() => {
      takeSnapshot(req.user.id).catch(e =>
        console.warn(`Post-delete snapshot skipped for user ${req.user.id}:`, e.message)
      );
    });

    res.json({ message: 'Item deleted successfully.' });
  } catch (error) {
    console.error('Wealth DELETE Error:', error.message);
    res.status(500).json({ error: 'Server error during deletion.' });
  }
});

/**
 * @route  GET /api/wealth/history
 * @desc   Fetch net worth history, sorted ascending for charting
 */
router.get('/history', auth, async (req, res) => {
  try {
    const history = await NetWorthHistory.find({ user_id: req.user.id })
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
    console.error('Wealth GET /history Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch wealth history.' });
  }
});



/**
 * @route  POST /api/wealth/ai-insights
 * @desc   Gemini AI coach — securely server-side, correct model & API version
 */
router.post('/ai-insights', auth, async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      insight: 'AI Coach offline: GEMINI_API_KEY not configured on the server.',
    });
  }

  try {
    const { totalAssets = 0, liquidAssets = 0, physicalAssets = 0, liabilities = 0 } = req.body;
    const netWorth = totalAssets - liabilities;
    const debtRatio = totalAssets > 0
      ? ((liabilities / totalAssets) * 100).toFixed(1)
      : '0';

    const prompt = `You are MyCoinwise, a cyberpunk AI wealth advisor. Portfolio summary: Net Worth ₹${Math.round(netWorth)}, Total Assets ₹${Math.round(totalAssets)}, Liquid ₹${Math.round(liquidAssets)}, Physical ₹${Math.round(physicalAssets)}, Liabilities ₹${Math.round(liabilities)}, Debt-to-Asset: ${debtRatio}%. Write exactly 2 punchy, actionable financial insights. No markdown. No hedging. Be direct and specific.`;

    // FIX: Use /v1/ endpoint + gemini-2.5-flash (verified working model for this key)
    const result = await httpsPost(
      'generativelanguage.googleapis.com',
      `/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 0.75 },
      }
    );

    if (result.status === 429) {
      return res.json({
        insight: 'AI quota reached for today. Tip: With a ₹' + Math.round(netWorth) + ' net worth and ' + debtRatio + '% debt ratio, focus on increasing liquid assets first.',
      });
    }

    if (result.body?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const insight = result.body.candidates[0].content.parts[0].text.trim();
      return res.json({ insight });
    }

    throw new Error(`Gemini responded with status ${result.status}`);
  } catch (error) {
    console.error('AI Insights Error:', error.message);
    res.status(500).json({
      insight: 'Neural network temporarily offline. Your portfolio data is secure — check server logs for details.',
    });
  }
});

/**
 * @route  GET /api/wealth/ai-status
 * @desc   Health-check endpoint to verify Gemini AI connectivity
 */
router.get('/ai-status', auth, async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.json({ status: 'unconfigured', message: 'GEMINI_API_KEY missing from .env' });
  }

  try {
    const result = await httpsPost(
      'generativelanguage.googleapis.com',
      `/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 5 } }
    );

    if (result.status === 200 && result.body?.candidates) {
      return res.json({ status: 'online', model: 'gemini-2.5-flash', api: 'v1' });
    }
    if (result.status === 429) {
      return res.json({ status: 'quota_exceeded', model: 'gemini-2.5-flash', message: 'Rate limit hit — try again later.' });
    }

    res.json({ status: 'error', httpStatus: result.status, details: result.body?.error?.message });
  } catch (error) {
    res.json({ status: 'unreachable', message: error.message });
  }
});

module.exports = router;
