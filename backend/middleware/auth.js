/* —————————————————————————————————————
 * JWT Authentication Middleware
 * Validates Bearer tokens, checks session revocation,
 * and attaches the authenticated user to req.user.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');

// ── Define authentication middleware ──
const authenticateRequest = async (req, res, next) => {
  try {
    // ── Extract token from Authorization header or cookie ──
    let bearerToken = null;
    const authorizationHeader = req.header('Authorization');
    if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
      bearerToken = authorizationHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      bearerToken = req.cookies.token;
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
      if (match) bearerToken = decodeURIComponent(match[1]);
    }

    if (!bearerToken) {
      return res.status(401).json({ error: 'No authentication token, authorization denied.' });
    }

    // ── Verify token signature and expiration with explicit algorithm whitelist ──
    const decodedToken = jwt.verify(bearerToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // ── Load user and session in a single DB round-trip via $lookup ──
    const userId = decodedToken.id || decodedToken._id;
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(401).json({ error: 'User associated with this token no longer exists.' });
    }
    const uid = new mongoose.Types.ObjectId(userId);

    let authenticatedUser = null;
    let activeSession = null;

    if (decodedToken.jti) {
      const results = await Session.aggregate([
        { $match: { token_id: decodedToken.jti, user_id: uid, is_active: true } },
        { $project: { _id: 1, last_active: 1, user_id: 1 } },
        {
          $lookup: {
            from: 'users',
            localField: 'user_id',
            foreignField: '_id',
            pipeline: [
              { $project: { _id: 1, session_version: 1, household_id: 1 } }
            ],
            as: 'user',
          },
        },
        { $unwind: '$user' },
      ]);

      if (results.length > 0) {
        activeSession = results[0];
        authenticatedUser = results[0].user;
      } else {
        // Check if session was explicitly deactivated / revoked
        const revokedSession = await Session.findOne({
          token_id: decodedToken.jti,
          user_id: uid,
          is_active: false,
        }).select('_id');

        if (revokedSession) {
          return res.status(401).json({ error: 'This session has been revoked. Please log in again.' });
        }

        // If not revoked, check if user exists to repair session or reject
        authenticatedUser = await User.findById(uid);
        if (!authenticatedUser) {
          return res.status(401).json({ error: 'User associated with this token no longer exists.' });
        }

        // Create missing session record
        activeSession = await Session.create({
          user_id: authenticatedUser._id,
          token_id: decodedToken.jti,
          device: 'Active session',
          ip: req.ip || req.headers['x-forwarded-for'] || '',
          user_agent: req.headers['user-agent'] || '',
          is_active: true,
        }).catch(() => null);
      }
    } else {
      // Legacy token without jti claim
      authenticatedUser = await User.findById(uid);
      if (!authenticatedUser) {
        return res.status(401).json({ error: 'User associated with this token no longer exists.' });
      }
    }

    // ── Reject revoked session versions ──
    const tokenSessionVersion = decodedToken.session_version || 0;
    if ((authenticatedUser.session_version || 0) > tokenSessionVersion) {
      return res.status(401).json({ error: 'Session has been revoked or expired. Please log in again.' });
    }

    // ── Refresh stale last_active timestamp (fire-and-forget) ──
    if (activeSession && (!activeSession.last_active || Date.now() - new Date(activeSession.last_active).getTime() > 60_000)) {
      Session.updateOne(
        { _id: activeSession._id },
        { $set: { last_active: new Date() } }
      ).catch(() => {});
    }

    // ── Repair missing household_id on root accounts (fire-and-forget) ──
    if (!authenticatedUser.household_id) {
      authenticatedUser.household_id = authenticatedUser._id;
      User.updateOne(
        { _id: authenticatedUser._id },
        { $set: { household_id: authenticatedUser._id } }
      ).catch(() => {});
    }

    // ── Attach authenticated user to request ──
    const userIdStr = String(authenticatedUser.id || authenticatedUser._id);
    req.userId = userIdStr;
    // SECURITY: spread the token claims FIRST so that server-derived values
    // always win. Previously `...decodedToken` came last, meaning a claim named
    // `id` or `household_id` would silently shadow the database-derived value —
    // and `household_id` is exactly what ownership checks depend on.
    req.user = {
      ...decodedToken,
      id: userIdStr,
      household_id: String(authenticatedUser.household_id || authenticatedUser._id),
      session_id: activeSession?._id ? String(activeSession._id) : null,
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