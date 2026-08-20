const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Session = require('../models/Session');
const auth = require('../middleware/auth');

// Rate limit (20 per 15 min) applied to all security endpoints
const securityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many security requests. Please try again later.' },
});
router.use(securityLimiter);

// ─── POST /api/security/change-password ──────────────────────────────
router.post('/change-password', auth, async (req, res) => {
  const { current, new: newPassword } = req.body;
  if (!current || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  const user = await User.findById(req.user.id).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const isMatch = await bcrypt.compare(current, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Current password is incorrect.' });
  }
  if (await bcrypt.compare(newPassword, user.password)) {
    return res.status(400).json({ message: 'New password must be different from the current password.' });
  }

  // Update password (pre‑save hook will hash it)
  user.password = newPassword;
  user.session_version = (user.session_version || 0) + 1;
  await user.save();

  // Revoke all sessions (optional – you could also delete all Session documents)
  await Session.deleteMany({ user_id: user._id });

  res.json({ success: true, message: 'Password changed successfully. All sessions have been invalidated.' });
});

// ─── POST /api/security/change-email ──────────────────────────────────
router.post('/change-email', auth, async (req, res) => {
  const { currentPassword, newEmail } = req.body;
  if (!currentPassword || !newEmail) {
    return res.status(400).json({ message: 'Current password and new email are required.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return res.status(400).json({ message: 'Please provide a valid email format.' });
  }

  const user = await User.findById(req.user.id).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Current password is incorrect.' });
  }

  const normalizedEmail = newEmail.toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser && !existingUser._id.equals(user._id)) {
    return res.status(409).json({ message: 'That email is already in use by another account.' });
  }

  user.email = normalizedEmail;
  user.session_version = (user.session_version || 0) + 1;
  await user.save();

  // Revoke all sessions
  await Session.deleteMany({ user_id: user._id });

  res.json({ success: true, message: 'Email address updated successfully. All sessions have been invalidated.' });
});

// ─── GET /api/security/sessions ──────────────────────────────────────
router.get('/sessions', auth, async (req, res) => {
  try {
    const sessions = await Session.find({ user_id: req.user.id, is_active: true })
      .sort({ created_at: -1 })
      .select('+token_id')
      .lean();
    res.json(sessions.map((session) => ({
      id: String(session._id),
      device: session.device || 'Unknown device',
      ip: session.ip || '',
      createdAt: session.created_at,
      lastActive: session.last_active,
      isCurrent: Boolean(req.user.jti && session.token_id === req.user.jti),
    })));
  } catch (err) {
    console.error('[Security] get-sessions error:', err.message);
    res.status(500).json({ message: 'Failed to fetch sessions.' });
  }
});

// ─── DELETE /api/security/sessions/:sessionId ─────────────────────────
router.delete('/sessions/:sessionId', auth, async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.sessionId,
      user_id: req.user.id,
      is_active: true,
    });
    if (!session) {
      return res.status(404).json({ message: 'Session not found or already revoked.' });
    }

    // Mark as inactive or delete
    session.is_active = false;
    await session.save();

    // Optionally, you could also add the JWT to a blacklist if you have a token store.
    res.json({ success: true, message: 'Session revoked successfully.' });
  } catch (err) {
    console.error('[Security] revoke-session error:', err.message);
    res.status(500).json({ message: 'Failed to revoke session.' });
  }
});

// ─── DELETE /api/security/sessions ────────────────────────────────────
// Revoke all sessions (logout everywhere)
router.delete('/sessions', auth, async (req, res) => {
  try {
    const filter = { user_id: req.user.id, is_active: true };
    if (req.user.jti) {
      filter.token_id = { $ne: req.user.jti };
    }
    await Session.updateMany(filter, { $set: { is_active: false } });
    // Legacy tokens without a session record are revoked by the version bump.
    if (!req.user.jti) await User.findByIdAndUpdate(req.user.id, { $inc: { session_version: 1 } });
    res.json({ success: true, message: 'All sessions revoked. Please log in again.' });
  } catch (err) {
    console.error('[Security] revoke-all-sessions error:', err.message);
    res.status(500).json({ message: 'Failed to revoke sessions.' });
  }
});

module.exports = router;
