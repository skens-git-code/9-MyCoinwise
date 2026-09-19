const { logger } = require('../utils/logger');

module.exports = (req, res, next) => {
  const configured = String(process.env.TAX_ADMIN_TOKEN || '').trim();
  if (!configured) {
    logger.error('Tax admin endpoint blocked because TAX_ADMIN_TOKEN is not configured.');
    return res.status(503).json({ error: 'Tax administration is not configured.' });
  }
  if (String(req.header('x-admin-token') || '') !== configured) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  return next();
};
