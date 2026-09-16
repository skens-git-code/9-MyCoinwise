/**
 * security.js — Security-related routes
 *
 * Endpoints:
 *   POST   /api/security/change-password        Change password, revoke all sessions
 *   POST   /api/security/change-email           Change email, revoke all sessions
 *   GET    /api/security/sessions               List active sessions
 *   DELETE /api/security/sessions/:sessionId    Revoke a specific session
 *   DELETE /api/security/sessions               Revoke all sessions except current
 *
 * Fixes vs. the original:
 *   - try/catch around every async handler (Express 4 does not catch
 *     async rejections — a thrown error would hang the request).
 *   - change-password enforces the same policy as register (8+ chars,
 *     lower + upper + digit + special). Previously only length was checked.
 *   - change-email uses a case-insensitive uniqueness check.
 *   - Cache-Control on every response.
 *   - ObjectId validation on DELETE /sessions/:id.
 *   - Consistent { error } response shape.
 *   - Shared logger instead of console.error.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Session = require('../models/Session');
const auth = require('../middleware/auth');
const { logger } = require('../utils/logger');

/* ============================================================
 * Constants
 * ============================================================ */

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

/* ============================================================
 * Middleware
 * ============================================================ */

// Rate limit (20 per 15 min) applied to all security endpoints.
const securityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many security requests. Please try again later.' },
});
router.use(securityLimiter);

// Cache-Control on every response — session data must not be cached.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* ============================================================
 * Helpers
 * ============================================================ */

/** Escape user input before embedding it in a RegExp. */
const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Return an error string if the password violates policy,
 * or null when it passes.
 */
const passwordPolicyError = (password) => {
  if (typeof password !== 'string') return 'Password must be a string.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
  if (!/\d/.test(password)) return 'Password must contain a digit.';
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain a special character.';
  return null;
};

/* ============================================================
 * POST /api/security/change-password
 * ============================================================ */

router.post('/change-password', auth, async (req, res) => {
  try {
    const { current, new: newPassword } = req.body || {};

    if (!current || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required.' });
    }

    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isMatch = await bcrypt.compare(current, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({
        error: 'New password must be different from the current password.',
      });
    }

    // Pre-save hook hashes the password.
    user.password = newPassword;
    user.session_version = (user.session_version || 0) + 1;
    await user.save();

    // Revoke all sessions. The current one is included — the client
    // must log in again with the new password.
    await Session.deleteMany({ user_id: user._id });

    return res.json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
    });
  } catch (err) {
    logger.error('[Security] change-password error:', err);
    return res.status(500).json({ error: 'Failed to change password.' });
  }
});

/* ============================================================
 * POST /api/security/change-email
 * ============================================================ */

router.post('/change-email', auth, async (req, res) => {
  try {
    const { currentPassword, newEmail } = req.body || {};

    if (!currentPassword || !newEmail) {
      return res.status(400).json({
        error: 'Current password and new email are required.',
      });
    }

    const trimmedEmail = String(newEmail).trim();
    if (trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email format.' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const normalizedEmail = trimmedEmail.toLowerCase();

    // Case-insensitive duplicate check. Guards against legacy records
    // stored with mixed case.
    const existingUser = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegExp(normalizedEmail)}$`, 'i') },
    });
    if (existingUser && !existingUser._id.equals(user._id)) {
      return res.status(409).json({
        error: 'That email is already in use by another account.',
      });
    }

    user.email = normalizedEmail;
    user.session_version = (user.session_version || 0) + 1;
    await user.save();

    await Session.deleteMany({ user_id: user._id });

    return res.json({
      success: true,
      email: normalizedEmail,
      message: 'Email address updated successfully. Please log in again.',
    });
  } catch (err) {
    logger.error('[Security] change-email error:', err);
    return res.status(500).json({ error: 'Failed to change email.' });
  }
});

/* ============================================================
 * GET /api/security/sessions
 * ============================================================ */

router.get('/sessions', auth, async (req, res) => {
  try {
    const sessions = await Session.find({
      user_id: req.user.id,
      is_active: true,
    })
      .sort({ created_at: -1 })
      .select('+token_id')
      .lean();

    return res.json(sessions.map((session) => ({
      id: String(session._id),
      device: session.device || 'Unknown device',
      ip: session.ip || '',
      createdAt: session.created_at,
      lastActive: session.last_active || session.created_at,
      isCurrent: Boolean(req.user.jti && session.token_id === req.user.jti),
    })));
  } catch (err) {
    logger.error('[Security] get-sessions error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sessions.' });
  }
});

/* ============================================================
 * DELETE /api/security/sessions/:sessionId
 * ============================================================ */

router.delete('/sessions/:sessionId', auth, async (req, res) => {
  try {
    // Guard against invalid ObjectId — otherwise Mongoose throws a
    // CastError that would bubble up as an unhandled rejection.
    if (!mongoose.isValidObjectId(req.params.sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID.' });
    }

    const session = await Session.findOne({
      _id: req.params.sessionId,
      user_id: req.user.id,
      is_active: true,
    });
    if (!session) {
      return res.status(404).json({ error: 'Session not found or already revoked.' });
    }

    session.is_active = false;
    session.last_active = new Date();
    await session.save();

    return res.json({ success: true, message: 'Session revoked successfully.' });
  } catch (err) {
    logger.error('[Security] revoke-session error:', err.message);
    return res.status(500).json({ error: 'Failed to revoke session.' });
  }
});

/* ============================================================
 * DELETE /api/security/sessions
 * Revoke all sessions except the current one.
 * ============================================================ */

router.delete('/sessions', auth, async (req, res) => {
  try {
    const filter = { user_id: req.user.id, is_active: true };
    if (req.user.jti) {
      filter.token_id = { $ne: req.user.jti };
    }

    await Session.updateMany(
      filter,
      { $set: { is_active: false, last_active: new Date() } }
    );

    // Legacy tokens without a session record are revoked by bumping the
    // session version. Only done when there's no current jti — otherwise
    // the caller would invalidate their own active session.
    if (!req.user.jti) {
      await User.findByIdAndUpdate(req.user.id, { $inc: { session_version: 1 } });
    }

    return res.json({
      success: true,
      message: 'All other sessions revoked.',
    });
  } catch (err) {
    logger.error('[Security] revoke-all-sessions error:', err.message);
    return res.status(500).json({ error: 'Failed to revoke sessions.' });
  }
});

module.exports = router;