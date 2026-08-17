const checkOwnership = (paramName = 'userId') => {
  return (req, res, next) => {
    // Determine the target ID from req.params based on the provided param name
    const targetId = req.params[paramName] || req.params.id;
    
    // If there is no target ID in the params, let the route handle it
    if (!targetId) return next();
    
    // Ensure the requested target ID matches the authenticated user's ID
    if (targetId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to access or modify this resource.' });
    }
    
    next();
  };
};

module.exports = checkOwnership;
