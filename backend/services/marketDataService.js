/* —————————————————————————————————————
 * Market Data Service
 * Fetches live prices for ticker symbols with an in-memory cache.
 *
 * Key behaviors:
 *   - Prices are cached for 15 minutes to reduce API calls.
 *   - In development, a mock database simulates live prices with
 *     small random fluctuations.
 *   - A production code block (Finnhub API) is included but commented
 *     out and can be enabled when ready.
 *
 * Exports:
 *   getLivePrices(symbols) → { [symbol]: price }
 * ————————————————————————————————————— */

// ── LRU price cache (max 500 symbols) prevents unbounded memory growth ──
const { LRUCache } = require('lru-cache');
const { isProduction } = require('../config/env');
const priceCache = new LRUCache({ max: 500, ttl: 15 * 60 * 1000 });
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ── Development-only mock quotes ──
// These are FIXTURES, never real data. They are only ever served when
// NODE_ENV !== 'production', so a deployed instance can never report a
// fabricated portfolio value. Unknown symbols resolve to no price so callers
// fall back to the user's `base_value` instead of a bogus constant.
const DEV_MOCK_PRICES = {
  '^NSEI': 22450.00,       // Nifty 50
  'RELIANCE.NS': 2950.40,  // Reliance
  'HDFCBANK.NS': 1440.10,  // HDFC
  'BTC-USD': 5200000.00,   // Bitcoin in INR (approx)
  'AAPL': 175.50,          // Apple
  'ETH-USD': 250000.00     // Ethereum in INR
};

// ── Fetch live prices for an array of ticker symbols ──
// @param {Array<String>} symbols - e.g., ['^NSEI', 'RELIANCE.NS', 'BTC-USD']
// @returns {Object} - e.g., { '^NSEI': 22500.50, 'BTC-USD': 64000.00 }
const getLivePrices = async (symbols) => {
  const results = {};
  const symbolsToFetch = [];

  // ── 1. Check the cache first ──
  const now = Date.now();
  symbols.forEach(symbol => {
    if (priceCache.has(symbol) && (now - priceCache.get(symbol).timestamp < CACHE_TTL_MS)) {
      results[symbol] = priceCache.get(symbol).price;
    } else {
      symbolsToFetch.push(symbol);
    }
  });

  if (symbolsToFetch.length === 0) return results;

  // ── 2. Fetch missing symbols ──
  // In production there is no live provider wired up yet, so return no prices
  // (empty result) rather than inventing values. Callers already treat a
  // missing price as "use base_value".
  if (isProduction) {
    return results;
  }

  try {
    // ── Development mock (never runs in production) ──
    symbolsToFetch.forEach(symbol => {
      const basePrice = DEV_MOCK_PRICES[symbol];
      if (!Number.isFinite(basePrice)) return; // unknown symbol → no price

      // Add slight randomness to simulate live market fluctuations
      const variance = basePrice * 0.005 * (Math.random() > 0.5 ? 1 : -1);
      const livePrice = Number((basePrice + variance).toFixed(2));

      results[symbol] = livePrice;

      // ── Update cache ──
      priceCache.set(symbol, { price: livePrice, timestamp: now });
    });

    // ── Production provider (enable when a key is configured) ──
    /*
    const axios = require('axios');
    const apiKey = process.env.FINNHUB_API_KEY;
    for (const symbol of symbolsToFetch) {
      const response = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
      const price = Number(response.data?.c);
      if (Number.isFinite(price) && price > 0) {
        results[symbol] = price;
        priceCache.set(symbol, { price, timestamp: now });
      }
    }
    */

  } catch (error) {
    console.error("Market Data Service Error:", error);
  }

  return results;
};

// ── Export ──
module.exports = { getLivePrices };