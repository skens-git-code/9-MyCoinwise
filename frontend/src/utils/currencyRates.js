import { API_URL } from '../services/api';

const FALLBACK_RATES_TO_INR = Object.freeze({
  INR: 1,
  USD: 83.5,
  EUR: 90.2,
  GBP: 105.8,
  JPY: 0.56,
  CAD: 61.2,
  AUD: 53.8,
  SGD: 61.5,
  AED: 22.7,
  CHF: 95,
  CNY: 11.5,
  MXN: 4.9,
  BRL: 16.4,
  KRW: 0.063,
  THB: 2.35,
});

const CACHE_KEY = 'mcw-fx-rates-to-inr-v2';
const CACHE_TTL_MS = 30 * 60 * 1000;

const normalizeCurrency = (currency, fallback = 'INR') => {
  const normalized = String(currency || '').trim().toUpperCase();
  return normalized || fallback;
};

export const getFallbackRatesToInr = () => ({ ...FALLBACK_RATES_TO_INR });

export const readCachedRatesToInr = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!cached?.rates || Date.now() - Number(cached.timestamp) >= CACHE_TTL_MS) {
      return null;
    }
    return cached.rates;
  } catch {
    return null;
  }
};

export const fetchRatesToInr = async (signal) => {
  // Tracker-safe order: our own first-party API first (never flagged by
  // Brave Shields / ad-blockers), direct third-party provider as fallback.
  const candidates = [
    `${API_URL}/currency/rates?base=INR`,
    'https://api.exchangerate-api.com/v4/latest/INR',
  ];
  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Exchange-rate request failed: ${response.status}`);
      const payload = await response.json();
      const rates = parseRatesPayload(payload);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, timestamp: Date.now() }));
      } catch {
        // Cached rates are an optimization only.
      }
      return rates;
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError || new Error('Exchange-rate request failed.');
};

const parseRatesPayload = (payload) => {
  // The provider — and our backend, which proxies it — returns "foreign
  // units per 1 base" with base=INR, e.g. { INR: 1, USD: 0.012 }.
  // `convertCurrency` and the bundled fallback both use the reciprocal
  // convention — INR per 1 unit — so normalize (invert) here. This is the
  // single point where live rates are converted to the stored shape.
  if (!payload || !payload.rates || typeof payload.rates !== 'object') {
    throw new Error('Invalid rates payload');
  }
  const out = { INR: 1 };
  for (const [code, value] of Object.entries(payload.rates)) {
    const key = String(code || '').trim().toUpperCase();
    const numeric = Number(value);
    if (key && key !== 'INR' && Number.isFinite(numeric) && numeric > 0) {
      out[key] = 1 / numeric;
    }
  }
  if (Object.keys(out).length <= 1) {
    throw new Error('Invalid rates payload');
  }
  return out;
};

export const convertCurrency = (amount, fromCurrency, toCurrency, ratesToInr = FALLBACK_RATES_TO_INR) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return 0;

  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return numericAmount;

  const fromRate = Number(ratesToInr[from]);
  const toRate = Number(ratesToInr[to]);
  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
    return null;
  }

  return numericAmount * fromRate / toRate;
};

export const resolveCurrency = (currency, fallback = 'INR') => normalizeCurrency(currency, fallback);
