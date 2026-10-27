/* —————————————————————————————————————
 * Ownership Authorization Middleware
 * Factory that verifies a target resource belongs to
 * the authenticated user or their household.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');
const { isValidObjectId } = require('../utils/schemaStandardizer');

// ── Create ownership-check middleware ──
const checkOwnership = (idParamName = 'userId', ownershipOptions = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user || (!req.user.id && !req.user._id)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const requesterId = req.user.id || req.user._id;
      // ── Resolve target ID from route params ──
      const targetId = req.params[idParamName] || req.params.id;

      // ── Skip when no target ID is present ──
      if (!targetId) return next();

      // ── Verify ownership through a model ──
      if (ownershipOptions.model) {
        if (!isValidObjectId(targetId)) {
          return res.status(400).json({ error: 'Invalid resource ID.' });
        }

        const ownerField = ownershipOptions.ownerField || 'user_id';
        const ownedResource = await ownershipOptions.model.findOne({
          _id: targetId,
          [ownerField]: requesterId,
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

        if (!isValidObjectId(targetId)) {
          return res.status(400).json({ error: 'Invalid user ID.' });
        }

        const targetUserRecord = await User.findById(targetId).select('household_id').lean();
        if (!targetUserRecord) {
          return res.status(404).json({ error: 'User not found.' });
        }

        const targetHouseholdId = String(targetUserRecord.household_id || targetUserRecord._id || '');
        const currentHouseholdId = String(req.user.household_id || requesterId);

        if (targetHouseholdId !== currentHouseholdId) {
          return res.status(403).json({ error: 'Access denied: profile is not linked to your household.' });
        }

        return next();
      }

      // ── Verify direct user match ──
      if (!isValidObjectId(targetId)) {
        return res.status(400).json({ error: 'Invalid user ID.' });
      }

      if (String(targetId) !== String(requesterId)) {
        return res.status(403).json({ error: 'Access denied: You do not have permission to access or modify this resource.' });
      }

      // ── Continue to next middleware ──
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

// ── Export middleware factory ──
module.exports = checkOwnership;