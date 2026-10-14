/* —————————————————————————————————————
 * Telemetry Routes (first-party, tracker-safe)
 * Public utility endpoints kept authentication-free on purpose: error
 * reports are most needed exactly when auth is broken (expired sessions,
 * failed logins), so gating them behind a token would silence them.
 *
 * Endpoints:
 *   POST /sentry-tunnel   Forward a Sentry envelope to our own Sentry project
 *
 * Privacy & abuse design:
 *   - The browser never contacts `*.ingest.sentry.io` directly. Brave
 *     Shields / EasyPrivacy flag that host as a tracker and drop the
 *     request; our own first-party API host is not flagged, so reports
 *     arrive while the user sees zero third-party connections.
 *   - Anti-relay: the envelope's embedded DSN must match the server's
 *     configured SENTRY_DSN (same ingest host + project). Envelopes aimed
 *     at anyone else's project are rejected, so this endpoint cannot be
 *     abused as an open relay that burns somebody else's quota.
 *   - Bodies are capped by the global 100kb JSON limit plus an explicit
 *     byte check; envelope bodies are never logged (they may contain
 *     breadcrumbs with page URLs).
 *   - Disabled with 503 when the server has no SENTRY_DSN configured.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const axios = require('axios');
const { config } = require('../config/env');
const { logger } = require('../utils/logger');

// ── Create router ──
const router = express.Router();

// ── Envelope constraints ──
const MAX_ENVELOPE_BYTES = 100 * 1024;
const UPSTREAM_TIMEOUT_MS = 10000;
const ENVELOPE_CONTENT_TYPE = 'application/x-sentry-envelope';

/**
 * Parse a Sentry DSN into its ingest host and project id.
 *
 * @param {string} dsn e.g. https://publicKey@o0.ingest.sentry.io/0
 * @returns {{ host: string, projectId: string }|null}
 */
function parseDsn(dsn) {
  try {
    const url = new URL(String(dsn || '').trim());
    if (!/^https?:$/.test(url.protocol) || !url.username || !url.hostname) return null;
    const projectId = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!projectId || projectId.includes('/')) return null;
    return { host: url.hostname.toLowerCase(), projectId };
  } catch {
    return null;
  }
}

/**
 * Build the upstream envelope ingest URL for a parsed DSN.
 *
 * @param {{ host: string, projectId: string }} parts Parsed DSN parts.
 * @returns {string} Envelope endpoint URL.
 */
function envelopeTargetUrl(parts) {
  return `https://${parts.host}/api/${parts.projectId}/envelope/`;
}

/**
 * Verify that a raw envelope body is addressed to our own Sentry project.
 *
 * A Sentry envelope starts with a JSON header line that carries the sender's
 * DSN. Only envelopes whose DSN host + project match the server's configured
 * SENTRY_DSN are forwarded; everything else is rejected as a relay attempt.
 *
 * @param {string|Buffer} body Raw request body.
 * @param {{ host: string, projectId: string }} ours Server DSN parts.
 * @returns {boolean} True when the envelope targets our project.
 */
function isEnvelopeForDsn(body, ours) {
  try {
    const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
    const firstLine = text.split('\n', 1)[0];
    if (!firstLine) return false;
    const header = JSON.parse(firstLine);
    if (!header || typeof header !== 'object' || !header.dsn) return false;
    const theirs = parseDsn(header.dsn);
    return Boolean(theirs) && theirs.host === ours.host && theirs.projectId === ours.projectId;
  } catch {
    return false;
  }
}

/* —————————————————————————————————————
 * POST /sentry-tunnel
 * Validate and forward a browser Sentry envelope to our ingest endpoint.
 * ————————————————————————————————————— */
router.post(
  '/sentry-tunnel',
  // ── Envelopes are text, not JSON: capture the raw body ──
  express.text({ type: ENVELOPE_CONTENT_TYPE, limit: '100kb' }),
  async (req, res) => {
    // ── Tunnel disabled without a server-side DSN ──
    const ours = parseDsn(config.SENTRY_DSN);
    if (!ours) {
      return res.status(503).json({ error: 'Error reporting is not configured.' });
    }

    // ── Reject empty / oversized payloads ──
    const body = typeof req.body === 'string' ? req.body : '';
    if (!body || Buffer.byteLength(body, 'utf8') > MAX_ENVELOPE_BYTES) {
      return res.status(400).json({ error: 'Invalid envelope payload.' });
    }

    // ── Anti-relay: envelope must target our own project ──
    if (!isEnvelopeForDsn(body, ours)) {
      return res.status(400).json({ error: 'Envelope does not match this project.' });
    }

    try {
      // ── Forward verbatim; never log the body (may contain page URLs) ──
      const upstream = await axios.post(envelopeTargetUrl(ours), body, {
        headers: { 'Content-Type': ENVELOPE_CONTENT_TYPE },
        timeout: UPSTREAM_TIMEOUT_MS,
        maxBodyLength: MAX_ENVELOPE_BYTES,
        validateStatus: () => true,
      });
      return res.status(upstream.status >= 200 && upstream.status < 500 ? 200 : 502).json({ ok: true });
    } catch (error) {
      logger.error('[Telemetry] sentry-tunnel forward error:', error?.message || error);
      return res.status(502).json({ error: 'Could not forward error report.' });
    }
  }
);

module.exports = router;
module.exports.parseDsn = parseDsn;
module.exports.envelopeTargetUrl = envelopeTargetUrl;
module.exports.isEnvelopeForDsn = isEnvelopeForDsn;
