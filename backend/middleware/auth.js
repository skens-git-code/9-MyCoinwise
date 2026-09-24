/* —————————————————————————————————————
 * JWT Authentication Middleware
 * Validates Bearer tokens, checks session revocation,
 * and attaches the authenticated user to req.user.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

// ── Define authentication middleware ──
const authenticateRequest = async (req, res, next) => {
  try {
    // ── Read Authorization header ──
    const authorizationHeader = req.header('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token, authorization denied.' });
    }

    // ── Extract Bearer token ──
    const bearerToken = authorizationHeader.split(' ')[1];

    if (!bearerToken) {
      return res.status(401).json({ error: 'No authentication token, authorization denied.' });
    }

    // ── Verify token signature and expiration ──
    const decodedToken = jwt.verify(bearerToken, process.env.JWT_SECRET);

    // ── Load user and validate session version ──
    const authenticatedUser = await User.findById(decodedToken.id || decodedToken._id);
    if (!authenticatedUser) {
      return res.status(401).json({ error: 'User associated with this token no longer exists.' });
    }

    // ── Reject revoked session versions ──
    const tokenSessionVersion = decodedToken.session_version || 0;
    if (authenticatedUser.session_version > tokenSessionVersion) {
      return res.status(401).json({ error: 'Session has been revoked or expired. Please log in again.' });
    }

    // ── Validate or repair server-side session ──
    let activeSession = null;
    if (decodedToken.jti) {
      activeSession = await Session.findOne({
        token_id: decodedToken.jti,
        user_id: authenticatedUser._id,
      }).select('+token_id');

      // ── Reject explicitly deactivated sessions ──
      if (activeSession && activeSession.is_active === false) {
        return res.status(401).json({ error: 'This session has been revoked. Please log in again.' });
      }

      // ── Create missing session record ──
      if (!activeSession) {
        activeSession = await Session.create({
          user_id: authenticatedUser._id,
          token_id: decodedToken.jti,
          device: 'Active session',
          ip: req.ip || req.headers['x-forwarded-for'] || '',
          user_agent: req.headers['user-agent'] || '',
          is_active: true,
        }).catch(() => null);
      } else if (!activeSession.last_active || Date.now() - activeSession.last_active.getTime() > 60_000) {
        // ── Refresh stale last_active timestamp ──
        Session.updateOne(
          { _id: activeSession._id },
          { $set: { last_active: new Date() } }
        ).catch(() => {});
      }
    }

    // ── Repair missing household_id on root accounts ──
    if (!authenticatedUser.household_id) {
      authenticatedUser.household_id = authenticatedUser._id;
      User.updateOne(
        { _id: authenticatedUser._id },
        { $set: { household_id: authenticatedUser._id } }
      ).catch(() => {});
    }

    // ── Attach authenticated user to request ──
    req.user = {
      id: String(authenticatedUser.id || authenticatedUser._id),
      household_id: String(authenticatedUser.household_id || authenticatedUser._id),
      session_id: activeSession?._id ? String(activeSession._id) : null,
      ...decodedToken,
    };

    // ── Continue to next middleware ──
    next();
  } catch (err) {
    // ── Reject invalid or expired tokens ──
    res.status(401).json({ error: 'Token is invalid or expired.' });
  }
};

// ── Export middleware ──
module.exports = authenticateRequest;