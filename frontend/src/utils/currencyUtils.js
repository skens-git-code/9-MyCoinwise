import { CURRENCIES } from '../services/api';

const LOCALE_MAP = {
  en: 'en-US',
  hi: 'hi-IN',
  mr: 'mr-IN',
  bgc: 'hi-IN',
  kn: 'kn-IN',
};

/**
 * Retrieves the display symbol for a given currency code.
 *
 * @param {string} currency - e.g. 'USD', 'INR', 'EUR'
 * @returns {string}
 */
export function getCurrencySymbol(currency = 'USD') {
  return CURRENCIES[currency]?.symbol || currency || '$';
}

/**
 * Retrieves metadata for a given currency code.
 *
 * @param {string} currency
 * @returns {{ symbol: string, name: string }}
 */
export function getCurrencyInfo(currency = 'USD') {
  return CURRENCIES[currency] || { symbol: currency || '$', name: currency || 'USD' };
}

/**
 * Formats a monetary amount with currency symbol and locale-sensitive decimal grouping.
 *
 * @param {number|string} amount
 * @param {string} currency - Currency ISO code (default: 'USD')
 * @param {string} localeOrLang - Locale or language code (e.g. 'en-US', 'hi-IN')
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'USD', localeOrLang = 'en-US') {
  const info = getCurrencyInfo(currency);
  const parsedAmount = Number(amount);
  const val = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const isNeg = val < 0;
  const defaultLocale = currency === 'INR' ? 'en-IN' : 'en-US';
  const resolvedLocale = currency === 'INR' ? 'en-IN' : (LOCALE_MAP[localeOrLang] || localeOrLang || defaultLocale);

  const numStr = Math.abs(val).toLocaleString(resolvedLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${isNeg ? '-' : ''}${info.symbol}${numStr}`;
}

/**
 * Splits a formatted currency string into parts for custom UI typography (e.g. smaller decimals).
 *
 * @param {number|string} amount
 * @param {string} currency
 * @param {string} localeOrLang
 * @returns {{ symbol: string, integer: string, decimal: string, isNegative: boolean, full: string }}
 */
export function formatCurrencyParts(amount, currency = 'USD', localeOrLang = 'en-US') {
  const info = getCurrencyInfo(currency);
  const parsedAmount = Number(amount);
  const val = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const isNegative = val < 0;
  const defaultLocale = currency === 'INR' ? 'en-IN' : 'en-US';
  const resolvedLocale = currency === 'INR' ? 'en-IN' : (LOCALE_MAP[localeOrLang] || localeOrLang || defaultLocale);

  const numStr = Math.abs(val).toLocaleString(resolvedLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const [integer, decimal = '00'] = numStr.split('.');

  return {
    symbol: info.symbol,
    integer,
    decimal,
    isNegative,
    full: `${isNegative ? '-' : ''}${info.symbol}${numStr}`,
  };
}

export { CURRENCIES };
