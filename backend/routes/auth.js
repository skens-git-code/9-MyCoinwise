const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const auth = require('../middleware/auth');
const { logger, auditLogger } = require('../utils/logger');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many authentication attempts, please try again later.' }
});

const CURRENCY_CODES = new Set(['USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SGD', 'AED', 'CHF', 'CNY', 'MXN', 'BRL', 'KRW', 'THB']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const createSessionToken = async (user, req, { rememberMe = true, browser, os, device_type } = {}) => {
  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    { id: user._id, session_version: user.session_version || 0, jti: tokenId },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? '30d' : '1d' }
  );
  const device = [browser, os, device_type].filter(Boolean).join(' · ') || 'Unknown device';
  await Session.create({
    user_id: user._id,
    token_id: tokenId,
    device,
    ip: req.ip || req.headers['x-forwarded-for'] || '',
    user_agent: req.headers['user-agent'] || '',
  });
  return token;
};

const getTransactionBalance = async (userId) => {
  const [result] = await Transaction.aggregate([
    { $match: { user_id: new mongoose.Types.ObjectId(userId), is_deleted: { $ne: true } } },
    {
      $group: {
        _id: null,
        income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
        expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } }
      }
    }
  ]);
  return Number(((result?.income || 0) - (result?.expense || 0)).toFixed(2));
};

const syncUserBalance = async (userId) => {
  const balance = await getTransactionBalance(userId);
  await User.findByIdAndUpdate(userId, { $set: { balance } });
  return balance;
};

router.use(authLimiter);

router.post('/register', [
  body('username').notEmpty().trim().isLength({ min: 2, max: 80 }),
  body('email').isEmail().normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .matches(/[a-z]/)
    .matches(/[A-Z]/)
    .matches(/\d/)
    .matches(/[^a-zA-Z0-9]/)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password, profile_avatar, profile_color } = req.body;
  const email = normalizeEmail(req.body.email);
  const currency = req.body.currency === undefined ? 'USD' : String(req.body.currency).trim().toUpperCase();
  if (!CURRENCY_CODES.has(currency)) {
    return res.status(400).json({ error: 'Unsupported currency.' });
  }
  const ipAddr = req.ip || req.headers['x-forwarded-for'] || null;
  const ua = req.headers['user-agent'] || null;
  const { device_type, browser, os } = LoginLog.parseUserAgent(ua);

  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database unavailable. Start MongoDB or configure a reachable MONGO_URI.' });
    }
    const user = await User.create({ username: username.trim(), email, password, currency, profile_avatar, profile_color });
    user.household_id = user._id;
    await user.save();
    const token = await createSessionToken(user, req, { browser, os, device_type });

    await LoginLog.create({
      user_id: user._id, email, status: 'success', reason: 'registered',
      ip: ipAddr, user_agent: ua, device_type, browser, os,
      failed_attempts_before: 0
    }).catch(() => { });

    res.status(201).json({ token, user: {
      id: user._id,
      username: user.username,
      last_name: user.last_name,
      profession: user.profession,
      email: user.email,
      profile_avatar: user.profile_avatar,
      profile_color: user.profile_color,
    } });
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.username) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter a valid email and password.' });

  const email = normalizeEmail(req.body.email);
  const password = req.body.password;

  const ipAddr = req.ip || req.headers['x-forwarded-for'] || null;
  const ua = req.headers['user-agent'] || null;
  const { device_type, browser, os } = LoginLog.parseUserAgent(ua);

  try {
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      await LoginLog.create({ email, status: 'failed', reason: 'user_not_found', ip: ipAddr, user_agent: ua, device_type, browser, os }).catch(() => { });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled. Contact support.' });
    }

    if (user.account_locked) {
      if (user.locked_until && user.locked_until > new Date()) {
        const minutesLeft = Math.ceil((user.locked_until - new Date()) / 60000);
        await LoginLog.create({
          user_id: user._id, email, status: 'failed', reason: 'account_locked',
          ip: ipAddr, user_agent: ua, device_type, browser, os,
          failed_attempts_before: user.failed_login_count
        }).catch(() => { });
        return res.status(423).json({ error: `Account locked. Try again in ${minutesLeft} minute(s).` });
      }
      user.account_locked = false;
      user.locked_until = null;
      user.failed_login_count = 0;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const prevFailed = user.failed_login_count;
      await user.incrementFailedLogin();
      const remaining = Math.max(0, User.MAX_FAILED_LOGINS - user.failed_login_count);

      await LoginLog.create({
        user_id: user._id, email, status: 'failed', reason: 'invalid_password',
        ip: ipAddr, user_agent: ua, device_type, browser, os,
        failed_attempts_before: prevFailed
      }).catch(() => { });

      if (user.account_locked) {
        return res.status(423).json({ error: `Too many failed attempts. Account locked for ${User.LOCK_DURATION_MINUTES} minutes.` });
      }
      return res.status(401).json({ error: `Invalid credentials. ${remaining} attempt(s) remaining.` });
    }

    await user.resetLoginAttempts(ipAddr);
    const token = await createSessionToken(user, req, {
      rememberMe: req.body.rememberMe !== false,
      browser,
      os,
      device_type,
    });

    await LoginLog.create({
      user_id: user._id, email, status: 'success', reason: 'login',
      ip: ipAddr, user_agent: ua, device_type, browser, os,
      failed_attempts_before: 0
    }).catch(() => { });

    res.json({ token, user: {
      id: user._id,
      username: user.username,
      last_name: user.last_name,
      profession: user.profession,
      email: user.email,
      profile_avatar: user.profile_avatar,
      profile_color: user.profile_color,
    } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    await syncUserBalance(req.user.id);
    const user = await User.findById(req.user.id);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', auth, async (req, res) => {
  try {
    if (req.user.jti) {
      await Session.updateOne(
        { token_id: req.user.jti, user_id: req.user.id },
        { $set: { is_active: false, last_active: new Date() } }
      );
    } else {
      await User.findByIdAndUpdate(req.user.id, { $inc: { session_version: 1 } });
    }
    auditLogger.info('User logged out', { userId: req.user.id, ip: req.ip });
    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'Current password and a new password of at least 6 characters are required.' });
  }
  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!(await user.comparePassword(currentPassword))) return res.status(401).json({ error: 'Current password is incorrect.' });
    user.password = newPassword;
    user.session_version += 1;
    await user.save();
    await Session.updateMany({ user_id: user._id, is_active: true }, { $set: { is_active: false } });
    auditLogger.info('Password changed', { userId: req.user.id, ip: req.ip });
    res.json({ message: 'Password updated. Please log in again.' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/login-logs', auth, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const logs = await LoginLog.find({ user_id: req.user.id })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');

    const total = await LoginLog.countDocuments({ user_id: req.user.id });
    res.json({ logs, total, page, limit });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
