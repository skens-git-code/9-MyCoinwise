const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Check if Authorization header exists
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token, authorization denied.' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No authentication token, authorization denied.' });
    }

    // Verify token
    const verified = jwt.verify(token, process.env.JWT_SECRET);

    // Validate session_version to catch revoked tokens
    const user = await User.findById(verified.id || verified._id);
    if (!user) {
      return res.status(401).json({ error: 'User associated with this token no longer exists.' });
    }

    // If the token contains a session_version and it doesn't match the DB, it's revoked.
    // If it doesn't contain a session_version, we can choose to reject or allow. For backward compat, we allow 0.
    const tokenVersion = verified.session_version || 0;
    if (user.session_version > tokenVersion) {
      return res.status(401).json({ error: 'Session has been revoked or expired. Please log in again.' });
    }

    // Add user string object to request object to not break previous routes expecting req.user.id
    req.user = { id: user.id || user._id, ...verified };

    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid or expired.' });
  }
};

module.exports = auth;
