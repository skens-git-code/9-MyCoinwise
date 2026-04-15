// backend/services/marketDataService.js

// Simple in-memory cache (In production, replace with Redis)
const priceCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetches real-time prices for an array of ticker symbols.
 * @param {Array<String>} symbols - e.g., ['^NSEI', 'RELIANCE.NS', 'BTC-USD']
 * @returns {Object} - e.g., { '^NSEI': 22500.50, 'BTC-USD': 64000.00 }
 */
const getLivePrices = async (symbols) => {
  const results = {};
  const symbolsToFetch = [];

  // 1. Check Cache first
  const now = Date.now();
  symbols.forEach(symbol => {
    if (priceCache.has(symbol) && (now - priceCache.get(symbol).timestamp < CACHE_TTL_MS)) {
      results[symbol] = priceCache.get(symbol).price;
    } else {
      symbolsToFetch.push(symbol);
    }
  });

  if (symbolsToFetch.length === 0) return results;

  // 2. Fetch missing symbols
  try {
    // ---------------------------------------------------------
    // DEVELOPMENT MOCK (Replace this block in production)
    // ---------------------------------------------------------
    console.log(`[DEV] Mocking API call for: ${symbolsToFetch.join(', ')}`);
    const mockDb = {
      '^NSEI': 22450.00,       // Nifty 50
      'RELIANCE.NS': 2950.40,  // Reliance
      'HDFCBANK.NS': 1440.10,  // HDFC
      'BTC-USD': 5200000.00,   // Bitcoin in INR (approx)
      'AAPL': 175.50,          // Apple
      'ETH-USD': 250000.00     // Ethereum in INR
    };

    symbolsToFetch.forEach(symbol => {
      // Add slight randomness to simulate live market fluctuations
      const basePrice = mockDb[symbol] || 1000; 
      const variance = basePrice * 0.005 * (Math.random() > 0.5 ? 1 : -1);
      const livePrice = Number((basePrice + variance).toFixed(2));
      
      results[symbol] = livePrice;
      
      // Update Cache
      priceCache.set(symbol, { price: livePrice, timestamp: now });
    });
    // ---------------------------------------------------------

    /* PRODUCTION CODE (Uncomment when ready)
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const apiKey = process.env.FINNHUB_API_KEY;
    for (const symbol of symbolsToFetch) {
      const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
      const data = await response.json();
      results[symbol] = data.c; // 'c' is current price in Finnhub
      priceCache.set(symbol, { price: data.c, timestamp: now });
    }
    */

  } catch (error) {
    console.error("Market Data Service Error:", error);
  }

  return results;
};

module.exports = { getLivePrices };
