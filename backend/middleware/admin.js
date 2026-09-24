/* —————————————————————————————————————
 * Tax Admin Authentication Middleware
 * Verifies the x-admin-token header against TAX_ADMIN_TOKEN.
 * ————————————————————————————————————— */

// ── Load logger utility ──
const { logger } = require('../utils/logger');

// ── Export middleware ──
module.exports = (req, res, next) => {
  // ── Read configured admin token ──
  const configuredAdminToken = String(process.env.TAX_ADMIN_TOKEN || '').trim();

  // ── Reject when token is not configured ──
  if (!configuredAdminToken) {
    logger.error('Tax admin endpoint blocked because TAX_ADMIN_TOKEN is not configured.');
    return res.status(503).json({ error: 'Tax administration is not configured.' });
  }

  // ── Read request admin token ──
  const requestAdminToken = String(req.header('x-admin-token') || '');

  // ── Reject when tokens do not match ──
  if (requestAdminToken !== configuredAdminToken) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  // ── Continue to next middleware ──
  return next();
};