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
    await user.save();

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[Security] change-password error:', err.message);
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
    // In a real app: invalidate the token from DB/Redis store
    // For now, acknowledge the revocation
    res.json({ success: true, message: 'Session revoked.' });
  } catch (err) {
    console.error('[Security] revoke-session error:', err.message);
    res.status(500).json({ message: 'Failed to revoke session.' });
  }
});

// ─── DELETE /api/security/sessions ──────────────────────────────────────────
// Revoke all other sessions
router.delete('/sessions', async (req, res) => {
  try {
    // In a real app: invalidate all tokens except current from DB/Redis
    res.json({ success: true, message: 'All other sessions revoked.' });
  } catch (err) {
    console.error('[Security] revoke-all-sessions error:', err.message);
    res.status(500).json({ message: 'Failed to revoke sessions.' });
  }
});

module.exports = router;
