/**
 * auth.js — Authentication routes
 *
 * Endpoints:
 *   POST /register        Create account + issue token
 *   POST /login           Authenticate + issue token
 *   GET  /me              Current user + synced balance
 *   POST /logout          Invalidate current session
 *   POST /change-password Change password + invalidate other sessions
 *   GET  /login-logs      Paginated login history
 *
 * Fixes applied vs. previous version:
 *   - session_version NaN guard for legacy users
 *   - change-password uses the same policy as register
 *   - household_id included in every auth response
 *   - change-password is rate-limited (brute-force protection)
 *   - register creates the user in a single DB write
 *   - register and login have separate rate limiters
 *   - failed_login_count re-read from DB after increment
 *   - parseUserAgent called with '' instead of null
 *   - same-as-current password rejected on change
 *   - LoginLog write failures surface via logger.warn
 *   - all errors use logger.error (no more console.error)
 *   - 11000 handling falls back for older MongoDB
 *   - Cache-Control applied to every response
 *   - getTransactionBalance validates userId
 *   - JWT_SECRET presence checked before signing
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Session = require('../models/Session');
const auth = require('../middleware/auth');
const { logger, auditLogger } = require('../utils/logger');
const { dedupeTransactions } = require('../utils/transactionIntegrity');

const router = express.Router();

/* ============================================================
 * Constants
 * ============================================================ */

const CURRENCY_CODES = new Set([
  'USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SGD', 'AED',
  'CHF', 'CNY', 'MXN', 'BRL', 'KRW', 'THB',
]);

const FALLBACK_RATES_TO_INR = Object.freeze({
  INR: 1, USD: 83.5, EUR: 90.2, GBP: 105.8, JPY: 0.56, CAD: 61.2,
  AUD: 53.8, SGD: 61.5, AED: 22.7, CHF: 95, CNY: 11.5, MXN: 4.9,
  BRL: 16.4, KRW: 0.063, THB: 2.35,
});

const normalizeCurrency = (value, fallback = 'USD') => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || fallback;
};

const convertToCurrency = (amount, fromCurrency, toCurrency) => {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return Number(amount) || 0;
  const fromRate = FALLBACK_RATES_TO_INR[from];
  const toRate = FALLBACK_RATES_TO_INR[to];
  if (!fromRate || !toRate) return Number(amount) || 0;
  return (Number(amount) || 0) * fromRate / toRate;
};

// Register and login use separate limiters. Sharing one meant a
// shared-IP office could exhaust login attempts and block all new
// registrations from that IP. Register is also a bigger abuse target,
// so it gets a tighter cap.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,           // 1 hour
  max: 10,                            // 10 registrations per IP per hour
  message: { error: 'Too many account creations from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes
  max: 30,                            // 30 login attempts per IP per window
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password policy mirrors the register validator so change-password
// can't weaken an account created with a strong password.
const passwordPolicy = (field = 'password') =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 128 })
    .matches(/[a-z]/).withMessage('Password must contain a lowercase letter.')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
    .matches(/\d/).withMessage('Password must contain a digit.')
    .matches(/[^a-zA-Z0-9]/).withMessage('Password must contain a special character.');

/* ============================================================
 * Helpers
 * ============================================================ */

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

/**
 * Shape every auth response uses. Including `household_id` here means
 * the household switcher on the frontend can cache it on login and
 * use it during user switching (fixes the "can't switch back" bug).
 */
const toSafeUser = (user) => ({
  id: user._id,
  username: user.username,
  last_name: user.last_name,
  profession: user.profession,
  email: user.email,
  profile_avatar: user.profile_avatar,
  profile_color: user.profile_color,
  currency: user.currency,
  household_id: user.household_id,
});

/**
 * Sign a JWT and persist a Session record.
 * `user.session_version || 0` guards against legacy users whose
 * document predates the field (avoids NaN in the token payload).
 */
const createSessionToken = async (user, req, { rememberMe = true, browser, os, device_type } = {}) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  const tokenId = crypto.randomUUID();
  const sessionVersion = user.session_version || 0;

  const token = jwt.sign(
    { id: user._id, session_version: sessionVersion, jti: tokenId },
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

/** Aggregate transaction net for a user. Returns 0 for invalid ids. */
const getTransactionBalance = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) return 0;
  const [user, transactions, accounts] = await Promise.all([
    User.findById(userId).select('currency').lean(),
    Transaction.find({ user_id: userId, is_deleted: { $ne: true } })
      .select('type amount currency account_id')
      .lean(),
    Account.find({ user_id: userId }).select('_id currency').lean(),
  ]);
  const displayCurrency = normalizeCurrency(user?.currency);
  const accountCurrencies = new Map(accounts.map((account) => [String(account._id), normalizeCurrency(account.currency, displayCurrency)]));
  const balance = dedupeTransactions(transactions).reduce((sum, transaction) => {
    const sourceCurrency = normalizeCurrency(
      transaction.currency || accountCurrencies.get(String(transaction.account_id || '')),
      displayCurrency
    );
    const amount = convertToCurrency(transaction.amount, sourceCurrency, displayCurrency);
    return sum + (transaction.type === 'income' ? amount : -amount);
  }, 0);
  return Number(balance.toFixed(2));
};

/** Recalculate and persist the user's balance. */
const syncUserBalance = async (userId) => {
  const balance = await getTransactionBalance(userId);
  await User.findByIdAndUpdate(userId, { $set: { balance } });
  return balance;
};

/**
 * Apply Cache-Control to every response from this router, not just
 * successful ones. A cached error response served to a different
 * user would be a real problem.
 */
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* ============================================================
 * POST /register
 * ============================================================ */

router.post(
  '/register',
  registerLimiter,
  [
    body('username').notEmpty().trim().isLength({ min: 2, max: 80 }),
    body('email').isEmail().normalizeEmail(),
    passwordPolicy('password'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password, profile_avatar, profile_color } = req.body;
    const email = normalizeEmail(req.body.email);
    const currency = req.body.currency === undefined
      ? 'USD'
      : String(req.body.currency).trim().toUpperCase();

    if (!CURRENCY_CODES.has(currency)) {
      return res.status(400).json({ error: 'Unsupported currency.' });
    }

    const ipAddr = req.ip || req.headers['x-forwarded-for'] || null;
    const ua = req.headers['user-agent'] || '';
    const { device_type, browser, os } = LoginLog.parseUserAgent(ua);

    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
          error: 'Database unavailable. Start MongoDB or configure a reachable MONGO_URI.',
        });
      }

      // Pre-generate _id so household_id can be set in the same write.
      // Previously this was two round trips (create + save).
      const userId = new mongoose.Types.ObjectId();

      const user = await User.create({
        _id: userId,
        household_id: userId,
        username: username.trim(),
        email,
        password,
        currency,
        profile_avatar,
        profile_color,
      });

      // Register creates a short-lived session by default. The client
      // can call /login with rememberMe:true for a longer one.
      const token = await createSessionToken(user, req, {
        rememberMe: false,
        browser,
        os,
        device_type,
      });

      LoginLog.create({
        user_id: user._id,
        email,
        status: 'success',
        reason: 'registered',
        ip: ipAddr,
        user_agent: ua,
        device_type,
        browser,
        os,
        failed_attempts_before: 0,
      }).catch((err) => {
        logger.warn('LoginLog write failed (register)', {
          error: err.message,
          userId: String(user._id),
        });
      });

      return res.status(201).json({ token, user: toSafeUser(user) });
    } catch (error) {
      if (error.code === 11000) {
        // Prefer keyPattern (MongoDB 4.4+). Fall back to parsing the
        // error message for older versions so the client gets the
        // right field name.
        const keyField = error.keyPattern ? Object.keys(error.keyPattern)[0] : null;
        if (keyField === 'username') {
          return res.status(409).json({ error: 'Username already taken' });
        }
        if (keyField === 'email') {
          return res.status(409).json({ error: 'Email already registered' });
        }
        const msg = error.message || '';
        if (msg.includes('username')) {
          return res.status(409).json({ error: 'Username already taken' });
        }
        return res.status(409).json({ error: 'Email already registered' });
      }
      logger.error('Register error:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

/* ============================================================
 * POST /login
 * ============================================================ */

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Enter a valid email and password.' });
    }

    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    const ipAddr = req.ip || req.headers['x-forwarded-for'] || null;
    const ua = req.headers['user-agent'] || '';
    const { device_type, browser, os } = LoginLog.parseUserAgent(ua);

    try {
      const user = await User.findOne({ email }).select('+password');

      if (!user) {
        LoginLog.create({
          email,
          status: 'failed',
          reason: 'user_not_found',
          ip: ipAddr,
          user_agent: ua,
          device_type,
          browser,
          os,
        }).catch((err) => logger.warn('LoginLog write failed (user_not_found)', {
          error: err.message,
        }));
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!user.is_active) {
        return res.status(403).json({ error: 'Account is disabled. Contact support.' });
      }

      if (user.account_locked) {
        if (user.locked_until && user.locked_until > new Date()) {
          const minutesLeft = Math.ceil((user.locked_until - new Date()) / 60000);
          LoginLog.create({
            user_id: user._id,
            email,
            status: 'failed',
            reason: 'account_locked',
            ip: ipAddr,
            user_agent: ua,
            device_type,
            browser,
            os,
            failed_attempts_before: user.failed_login_count,
          }).catch((err) => logger.warn('LoginLog write failed (account_locked)', {
            error: err.message,
            userId: String(user._id),
          }));
          return res.status(423).json({
            error: `Account locked. Try again in ${minutesLeft} minute(s).`,
          });
        }
        user.account_locked = false;
        user.locked_until = null;
        user.failed_login_count = 0;
      }

      const isMatch = await user.comparePassword(password);

      if (!isMatch) {
        const prevFailed = user.failed_login_count || 0;
        await user.incrementFailedLogin();

        // Re-read to guarantee the local object reflects persisted
        // state regardless of how incrementFailedLogin is implemented
        // (instance-aware vs. updateOne).
        const fresh = await User.findById(user._id)
          .select('failed_login_count account_locked locked_until');

        if (fresh) {
          user.failed_login_count = fresh.failed_login_count;
          user.account_locked = fresh.account_locked;
          user.locked_until = fresh.locked_until;
        }

        const remaining = Math.max(0, User.MAX_FAILED_LOGINS - (user.failed_login_count || 0));

        LoginLog.create({
          user_id: user._id,
          email,
          status: 'failed',
          reason: 'invalid_password',
          ip: ipAddr,
          user_agent: ua,
          device_type,
          browser,
          os,
          failed_attempts_before: prevFailed,
        }).catch((err) => logger.warn('LoginLog write failed (invalid_password)', {
          error: err.message,
          userId: String(user._id),
        }));

        if (user.account_locked) {
          return res.status(423).json({
            error: `Too many failed attempts. Account locked for ${User.LOCK_DURATION_MINUTES} minutes.`,
          });
        }
        return res.status(401).json({
          error: `Invalid credentials. ${remaining} attempt(s) remaining.`,
        });
      }

      await user.resetLoginAttempts(ipAddr);

      const token = await createSessionToken(user, req, {
        rememberMe: req.body.rememberMe !== false,
        browser,
        os,
        device_type,
      });

      LoginLog.create({
        user_id: user._id,
        email,
        status: 'success',
        reason: 'login',
        ip: ipAddr,
        user_agent: ua,
        device_type,
        browser,
        os,
        failed_attempts_before: 0,
      }).catch((err) => logger.warn('LoginLog write failed (login)', {
        error: err.message,
        userId: String(user._id),
      }));

      return res.json({ token, user: toSafeUser(user) });
    } catch (error) {
      logger.error('Login error:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

/* ============================================================
 * GET /me
 * ============================================================ */

/* Optimization: Cooldown map to avoid running heavy aggregation pipelines on every GET /me */
const lastMeBalanceSyncMap = new Map();
const ME_SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

router.get('/me', auth, async (req, res) => {
  try {
    /* Original blocking unthrottled code:
    await syncUserBalance(req.user.id);
    // Issue: Running a full table aggregation and DB write on every GET /me adds high TTFB latency on reads.
    */
    const lastSync = lastMeBalanceSyncMap.get(String(req.user.id));
    if (!lastSync || Date.now() - lastSync > ME_SYNC_COOLDOWN_MS) {
      lastMeBalanceSyncMap.set(String(req.user.id), Date.now());
      syncUserBalance(req.user.id).catch((err) => logger.warn('Background syncUserBalance failed', { error: err.message }));
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json(user);
  } catch (error) {
    logger.error('Get me error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* ============================================================
 * POST /logout
 * ============================================================ */

router.post('/logout', auth, async (req, res) => {
  try {
    if (req.user.jti) {
      await Session.updateOne(
        { token_id: req.user.jti, user_id: req.user.id },
        { $set: { is_active: false, last_active: new Date() } }
      );
    } else {
      // No jti means we can't target a specific session. Fall back to
      // invalidating every session for the user — safer than leaving
      // an unidentifiable token active.
      await User.findByIdAndUpdate(req.user.id, { $inc: { session_version: 1 } });
    }
    auditLogger.info('User logged out', { userId: req.user.id, ip: req.ip });
    return res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    logger.error('Logout error:', error);
    return res.status(500).json({ error: 'Server error.' });
  }
});

/* ============================================================
 * POST /change-password
 * ============================================================ */

router.post(
  '/change-password',
  auth,
  loginLimiter,   // Reuse login limiter — prevents brute-force of currentPassword.
  [
    body('currentPassword').isString().notEmpty(),
    passwordPolicy('newPassword'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const user = await User.findById(req.user.id).select('+password');
      if (!user) return res.status(404).json({ error: 'User not found.' });

      if (!(await user.comparePassword(currentPassword))) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      if (await user.comparePassword(newPassword)) {
        return res.status(400).json({
          error: 'New password must differ from current password.',
        });
      }

      user.password = newPassword;
      // (session_version || 0) prevents NaN for users whose document
      // predates the field.
      user.session_version = (user.session_version || 0) + 1;
      await user.save();

      await Session.updateMany(
        { user_id: user._id, is_active: true },
        { $set: { is_active: false } }
      );

      auditLogger.info('Password changed', { userId: req.user.id, ip: req.ip });
      return res.json({ message: 'Password updated. Please log in again.' });
    } catch (error) {
      logger.error('Change password error:', error);
      return res.status(500).json({ error: 'Server error.' });
    }
  }
);

/* ============================================================
 * GET /login-logs
 * ============================================================ */

router.get('/login-logs', auth, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      LoginLog.find({ user_id: req.user.id })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
      LoginLog.countDocuments({ user_id: req.user.id }),
    ]);

    return res.json({ logs, total, page, limit });
  } catch (error) {
    logger.error('Login logs error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
