/* —————————————————————————————————————
 * Currency Utilities
 * Shared currency normalization and fallback FX conversion helpers
 * used across transactions, balance reconciliation, and exports.
 * ————————————————————————————————————— */

const { logger } = require('./logger');

const FALLBACK_RATES_TO_INR = Object.freeze({
  INR: 1, USD: 83.5, EUR: 90.2, GBP: 105.8, JPY: 0.56, CAD: 61.2,
  AUD: 53.8, SGD: 61.5, AED: 22.7, CHF: 95, CNY: 11.5, MXN: 4.9,
  BRL: 16.4, KRW: 0.063, THB: 2.35,
});

const CURRENCIES = Object.freeze({
  USD: { symbol: '$',   code: 'USD' },
  INR: { symbol: '₹',   code: 'INR' },
  EUR: { symbol: '€',   code: 'EUR' },
  GBP: { symbol: '£',   code: 'GBP' },
  JPY: { symbol: '¥',   code: 'JPY' },
  CAD: { symbol: 'CA$', code: 'CAD' },
  AUD: { symbol: 'A$',  code: 'AUD' },
  SGD: { symbol: 'S$',  code: 'SGD' },
  AED: { symbol: 'د.إ', code: 'AED' },
  CHF: { symbol: 'Fr',  code: 'CHF' },
  CNY: { symbol: '¥',   code: 'CNY' },
  MXN: { symbol: '$',   code: 'MXN' },
  BRL: { symbol: 'R$',  code: 'BRL' },
  KRW: { symbol: '₩',   code: 'KRW' },
  THB: { symbol: '฿',   code: 'THB' },
});

const warnedPairs = new Set();

const normalizeCurrency = (value, fallback = 'INR') => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || fallback;
};

const convertToCurrency = (amount, fromCurrency, toCurrency) => {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  const numeric = Number(amount) || 0;
  if (from === to) return numeric;

  const fromRate = FALLBACK_RATES_TO_INR[from];
  const toRate = FALLBACK_RATES_TO_INR[to];
  if (!fromRate || !toRate) {
    const pairKey = `${from}->${to}`;
    if (!warnedPairs.has(pairKey) && warnedPairs.size < 50) {
      warnedPairs.add(pairKey);
      logger.warn('Unsupported currency conversion fallback', { fromCurrency: from, toCurrency: to });
    }
    return numeric;
  }
  return (numeric * fromRate) / toRate;
};

module.exports = {
  FALLBACK_RATES_TO_INR,
  CURRENCIES,
  normalizeCurrency,
  convertToCurrency,
};

