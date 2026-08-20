const mongoose = require('mongoose');

const checkOwnership = (paramName = 'userId', options = {}) => {
  return async (req, res, next) => {
    // Determine the target ID from req.params based on the provided param name
    const targetId = req.params[paramName] || req.params.id;
    
    // If there is no target ID in the params, let the route handle it
    if (!targetId) return next();
    
    if (options.model) {
      if (!mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ error: 'Invalid resource ID.' });
      }
      const ownerField = options.ownerField || 'user_id';
      const resource = await options.model.findOne({
        _id: targetId,
        [ownerField]: req.user.id,
      }).select('_id').lean();
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found.' });
      }
      req.ownedResource = resource;
      return next();
    }

    if (options.household) {
      const User = require('../models/User');
      if (!mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ error: 'Invalid user ID.' });
      }
      const targetUser = await User.findById(targetId).select('household_id').lean();
      const targetHousehold = String(targetUser?.household_id || targetUser?._id || '');
      const currentHousehold = String(req.user.household_id || req.user.id);
      if (!targetUser || targetHousehold !== currentHousehold) {
        return res.status(403).json({ error: 'Access denied: profile is not linked to your household.' });
      }
      return next();
    }

    // Ensure the requested user ID matches the authenticated user's ID.
    if (String(targetId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to access or modify this resource.' });
    }
    
    next();
  };
};

module.exports = checkOwnership;
