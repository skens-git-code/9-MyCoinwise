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

const CACHE_KEY = 'mcw-fx-rates-to-inr';
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
  const response = await fetch('https://api.exchangerate-api.com/v4/latest/INR', { signal });
  if (!response.ok) throw new Error(`Exchange-rate request failed: ${response.status}`);

  const payload = await response.json();
  const rates = Object.entries(payload?.rates || {}).reduce((result, [code, rate]) => {
    const numericRate = Number(rate);
    if (Number.isFinite(numericRate) && numericRate > 0) {
      result[normalizeCurrency(code)] = 1 / numericRate;
    }
    return result;
  }, { INR: 1 });

  if (Object.keys(rates).length <= 1) throw new Error('Exchange-rate response was empty.');

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, timestamp: Date.now() }));
  } catch {
    // Cached rates are an optimization only.
  }
  return rates;
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
