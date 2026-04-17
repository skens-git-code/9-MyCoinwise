const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// ─── POST /api/security/change-password ──────────────────────────────────────
// Body: { current: string, new: string }
router.post('/change-password', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { current, new: newPassword } = req.body;

    if (!current || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(userId).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const isMatch = await bcrypt.compare(current, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ message: 'New password must be different from the current password.' });
    }

    // The Mongoose pre-save hook will automatically hash the password
    user.password = newPassword;
    // We optionally increment session_version to force relogin on other devices, or let the user do it
    await user.save();

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[Security] change-password error:', err.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ─── POST /api/security/change-email ─────────────────────────────────────────
// Body: { currentPassword: string, newEmail: string }
router.post('/change-email', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { currentPassword, newEmail } = req.body;

    if (!currentPassword || !newEmail) {
      return res.status(400).json({ message: 'Current password and new email are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email format.' });
    }

    const user = await User.findById(userId).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    // Check if email is already in use by another account
    const existingUser = await User.findOne({ email: newEmail.toLowerCase() });
    if (existingUser && existingUser._id.toString() !== userId) {
      return res.status(409).json({ message: 'That email is already in use by another account.' });
    }

    user.email = newEmail.toLowerCase();
    await user.save();

    res.json({ success: true, message: 'Email address updated successfully.' });
  } catch (err) {
    console.error('[Security] change-email error:', err.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ─── GET /api/security/sessions ──────────────────────────────────────────────
// Returns simulated active sessions (real session tracking requires Redis / token store)
router.get('/sessions', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId).select('lastLogin createdAt');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Return the current session as the only "active" session
    // (For a full implementation you'd store session tokens in DB/Redis)
    const sessions = [
      {
        id: `session_${userId}_current`,
        device: req.headers['user-agent']?.split(' ').slice(-1)[0] || 'Browser',
        location: 'Current Device',
        lastActive: new Date().toISOString(),
        isCurrent: true,
      }
    ];

    res.json(sessions);
  } catch (err) {
    console.error('[Security] get-sessions error:', err.message);
    res.status(500).json({ message: 'Failed to fetch sessions.' });
  }
});

// ─── DELETE /api/security/sessions/:sessionId ────────────────────────────────
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    // For specific session logic, a more robust session tracking table is needed.
    // We will increment the session_version globally for now.
    const userId = req.user?.id || req.user?._id;
    await User.findByIdAndUpdate(userId, { $inc: { session_version: 1 } });
    res.json({ success: true, message: 'Session revoked. Please log in again.' });
  } catch (err) {
    console.error('[Security] revoke-session error:', err.message);
    res.status(500).json({ message: 'Failed to revoke session.' });
  }
});

// ─── DELETE /api/security/sessions ──────────────────────────────────────────
// Revoke all sessions (increments session_version)
router.delete('/sessions', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Increment session_version to invalidate ALL previously issued JWTs.
    user.session_version = (user.session_version || 0) + 1;
    await user.save();

    res.json({ success: true, message: 'All sessions successfully revoked. Please log in again.' });
  } catch (err) {
    console.error('[Security] revoke-all-sessions error:', err.message);
    res.status(500).json({ message: 'Failed to revoke sessions.' });
  }
});

module.exports = router;
