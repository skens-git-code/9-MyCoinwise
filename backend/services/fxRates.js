/**
 * Foreign-exchange rate service.
 *
 * WHY THIS EXISTS
 * ---------------
 * Browsers with tracker protection (Brave Shields, uBlock Origin) treat
 * direct third-party API calls as suspect, and a hard dependency on
 * `api.exchangerate-api.com` from the browser meant conversions silently
 * depended on a host the client may block. This service runs server-side:
 * the browser only ever talks to our own first-party `/api/currency`
 * endpoint, which Brave and friends do not flag as a tracker.
 *
 * Layers, cheapest first:
 *   1. Fresh in-memory cache (shared across users, 5-minute TTL).
 *   2. Live upstream fetch (exchangerate-api v4, no key required).
 *   3. Stale cache (served with `stale: true` when upstream is down).
 *   4. Bundled static fallback table (last resort, clearly labelled).
 */

const axios = require('axios');

// ── Static fallback: units of each currency per 1 INR ──
// Kept in sync with the frontend's bundled table. Values are approximate
// and only used when both cache and upstream are unavailable.
const FALLBACK_TO_INR = Object.freeze({
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

const SUPPORTED_BASES = Object.freeze(Object.keys(FALLBACK_TO_INR));

const UPSTREAM_URL = 'https://api.exchangerate-api.com/v4/latest';
const CACHE_TTL_MS = 5 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8000;

// ── Shared in-memory cache: base -> { rates, updatedAt } ──
// Shape of `rates` mirrors the upstream v4 payload: foreign units per 1 base.
const cache = new Map();

/**
 * Normalize a user-supplied base currency to the supported allowlist.
 *
 * @param {unknown} value Raw `?base=` query value.
 * @returns {string|null} Uppercase code, or null when unsupported.
 */
function normalizeBase(value) {
  const code = String(value || '').trim().toUpperCase();
  return SUPPORTED_BASES.includes(code) ? code : null;
}

/**
 * Convert a per-INR table into per-`base` rates (upstream v4 shape).
 *
 * @param {Record<string, number>} toInr Units of each currency per 1 INR.
 * @param {string} base Supported base code.
 * @returns {Record<string, number>} Foreign units per 1 `base`.
 */
function toBaseRates(toInr, base) {
  const baseRate = Number(toInr[base]);
  if (!Number.isFinite(baseRate) || baseRate <= 0) return { [base]: 1 };
  const out = {};
  for (const [code, rate] of Object.entries(toInr)) {
    const numeric = Number(rate);
    if (Number.isFinite(numeric) && numeric > 0) out[code] = numeric / baseRate;
  }
  out[base] = 1;
  return out;
}

/**
 * Parse an upstream v4 payload into per-base rates.
 *
 * @param {unknown} payload Decoded JSON from the upstream provider.
 * @param {string} base Base the payload was requested with.
 * @returns {Record<string, number>|null} Rates, or null when unusable.
 */
function parseUpstreamPayload(payload, base) {
  const raw = payload && typeof payload === 'object' ? payload.rates : null;
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [code, rate] of Object.entries(raw)) {
    const normalized = String(code || '').trim().toUpperCase();
    const numeric = Number(rate);
    if (normalized && Number.isFinite(numeric) && numeric > 0) out[normalized] = numeric;
  }
  if (Object.keys(out).length === 0) return null;
  out[base] = 1;
  return out;
}

/**
 * Read the cache entry for a base, fresh or stale.
 *
 * @param {string} base Supported base code.
 * @returns {{ rates: object, updatedAt: number, fresh: boolean }|null}
 */
function readCache(base) {
  const entry = cache.get(base);
  if (!entry) return null;
  return {
    rates: entry.rates,
    updatedAt: entry.updatedAt,
    fresh: Date.now() - entry.updatedAt < CACHE_TTL_MS,
  };
}

/**
 * Fetch live rates upstream. The HTTP client is injectable for tests.
 *
 * @param {string} base Supported base code.
 * @param {(url: string, opts: object) => Promise<{ data: unknown }>} [httpGet]
 * @returns {Promise<Record<string, number>>} Parsed per-base rates.
 */
async function fetchLiveRates(base, httpGet) {
  const get = httpGet || ((url, opts) => axios.get(url, opts));
  const response = await get(`${UPSTREAM_URL}/${base}`, { timeout: UPSTREAM_TIMEOUT_MS });
  const parsed = parseUpstreamPayload(response?.data, base);
  if (!parsed) throw new Error('Upstream exchange-rate response was empty.');
  return parsed;
}

/**
 * Resolve rates for a base through cache → upstream → stale → fallback.
 *
 * Never throws for a supported base: the worst case is the clearly-labelled
 * static fallback table.
 *
 * @param {string} base Supported base code.
 * @param {(url: string, opts: object) => Promise<{ data: unknown }>} [httpGet]
 * @returns {Promise<{ base: string, rates: object, updatedAt: string, source: string, stale?: boolean }>}
 */
async function resolveRates(base, httpGet) {
  const cached = readCache(base);
  if (cached?.fresh) {
    return {
      base,
      rates: cached.rates,
      updatedAt: new Date(cached.updatedAt).toISOString(),
      source: 'cache',
    };
  }

  try {
    const rates = await fetchLiveRates(base, httpGet);
    const updatedAt = Date.now();
    cache.set(base, { rates, updatedAt });
    return { base, rates, updatedAt: new Date(updatedAt).toISOString(), source: 'live' };
  } catch {
    if (cached) {
      return {
        base,
        rates: cached.rates,
        updatedAt: new Date(cached.updatedAt).toISOString(),
        source: 'cache',
        stale: true,
      };
    }
    return {
      base,
      rates: toBaseRates(FALLBACK_TO_INR, base),
      updatedAt: new Date(0).toISOString(),
      source: 'fallback',
    };
  }
}

/** Clear the in-memory cache (tests). */
function clearCache() {
  cache.clear();
}

module.exports = {
  SUPPORTED_BASES,
  FALLBACK_TO_INR,
  CACHE_TTL_MS,
  normalizeBase,
  toBaseRates,
  parseUpstreamPayload,
  readCache,
  fetchLiveRates,
  resolveRates,
  clearCache,
};
