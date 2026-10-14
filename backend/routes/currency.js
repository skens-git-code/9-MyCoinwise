/* —————————————————————————————————————
 * Currency Routes (first-party, tracker-safe)
 * Public utility endpoints kept deliberately authentication-free: exchange
 * rates are public data, and requiring a token would add failure modes
 * (expired sessions, 401 storms) to something every page needs.
 *
 * Endpoints:
 *   GET /rates?base=USD   Exchange rates via server-side cache/upstream/fallback
 *
 * Privacy design:
 *   - The browser never contacts the third-party rate provider directly;
 *     Brave Shields / ad-blockers see only first-party calls to our own API.
 *   - No client data is sent upstream — just the base currency code.
 *   - `Cache-Control: public, max-age=300` is applied by server.js, so CDNs
 *     and browsers may cache the response; it contains no user data.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const { logger } = require('../utils/logger');
const { normalizeBase, resolveRates, SUPPORTED_BASES } = require('../services/fxRates');

// ── Create router ──
const router = express.Router();

/* —————————————————————————————————————
 * GET /rates
 * Resolve exchange rates for `?base=` (default USD).
 * ————————————————————————————————————— */
router.get('/rates', async (req, res) => {
  // ── Validate the base against the allowlist (blocks upstream URL tampering) ──
  const rawBase = req.query.base;
  const base = normalizeBase(rawBase === undefined ? 'USD' : rawBase);
  if (!base) {
    return res.status(400).json({
      error: 'Unsupported base currency.',
      supported: SUPPORTED_BASES,
    });
  }

  try {
    // ── Cache → upstream → stale → static fallback (never throws) ──
    const result = await resolveRates(base);
    return res.json(result);
  } catch (error) {
    logger.error('[Currency] rates error:', error);
    return res.status(500).json({ error: 'Could not load exchange rates.' });
  }
});

module.exports = router;
