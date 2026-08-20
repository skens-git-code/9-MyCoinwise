const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

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

    let session = null;
    if (verified.jti) {
      session = await Session.findOne({
        token_id: verified.jti,
        user_id: user._id,
      }).select('+token_id');

      // Only reject if the session was explicitly deactivated/revoked
      if (session && session.is_active === false) {
        return res.status(401).json({ error: 'This session has been revoked. Please log in again.' });
      }

      // If session record does not exist yet (e.g. legacy/reconnected token), heal on the fly
      if (!session) {
        session = await Session.create({
          user_id: user._id,
          token_id: verified.jti,
          device: 'Active session',
          ip: req.ip || req.headers['x-forwarded-for'] || '',
          user_agent: req.headers['user-agent'] || '',
          is_active: true,
        }).catch(() => null);
      } else if (!session.last_active || Date.now() - session.last_active.getTime() > 60_000) {
        Session.updateOne({ _id: session._id }, { $set: { last_active: new Date() } }).catch(() => {});
      }
    }

    // Add user string object to request object to not break previous routes expecting req.user.id
    req.user = {
      id: String(user.id || user._id),
      household_id: String(user.household_id || user._id),
      session_id: session?._id ? String(session._id) : null,
      ...verified,
    };

    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is invalid or expired.' });
  }
};

module.exports = auth;
