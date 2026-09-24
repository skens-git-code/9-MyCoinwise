/* —————————————————————————————————————
 * Ownership Authorization Middleware
 * Factory that verifies a target resource belongs to
 * the authenticated user or their household.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Create ownership-check middleware ──
const checkOwnership = (idParamName = 'userId', ownershipOptions = {}) => {
  return async (req, res, next) => {
    // ── Resolve target ID from route params ──
    const targetId = req.params[idParamName] || req.params.id;

    // ── Skip when no target ID is present ──
    if (!targetId) return next();

    // ── Verify ownership through a model ──
    if (ownershipOptions.model) {
      if (!mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ error: 'Invalid resource ID.' });
      }

      const ownerField = ownershipOptions.ownerField || 'user_id';
      const ownedResource = await ownershipOptions.model.findOne({
        _id: targetId,
        [ownerField]: req.user.id,
      }).select('_id').lean();

      if (!ownedResource) {
        return res.status(404).json({ error: 'Resource not found.' });
      }

      req.ownedResource = ownedResource;
      return next();
    }

    // ── Verify household access ──
    if (ownershipOptions.household) {
      const User = require('../models/User');

      if (!mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ error: 'Invalid user ID.' });
      }

      const targetUserRecord = await User.findById(targetId).select('household_id').lean();
      const targetHouseholdId = String(targetUserRecord?.household_id || targetUserRecord?._id || '');
      const currentHouseholdId = String(req.user.household_id || req.user.id);

      if (!targetUserRecord || targetHouseholdId !== currentHouseholdId) {
        return res.status(403).json({ error: 'Access denied: profile is not linked to your household.' });
      }

      return next();
    }

    // ── Verify direct user match ──
    if (String(targetId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to access or modify this resource.' });
    }

    // ── Continue to next middleware ──
    next();
  };
};

// ── Export middleware factory ──
module.exports = checkOwnership;