// ─── Load env vars FIRST (before any module that reads process.env) ─────────
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const { logger, auditLogger } = require('./utils/logger');
const mongoose = require('./db');
const excel = require('exceljs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── Mongoose Models ────────────────────────────────────────────────────────
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Goal = require('./models/Goal');
const Subscription = require('./models/Subscription');
const Event = require('./models/Event');
const LoginLog = require('./models/LoginLog');
const WealthItem = require('./models/WealthItem');
const NetWorthHistory = require('./models/NetWorthHistory');

// ─── Middleware ─────────────────────────────────────────────────────────────
const auth = require('./middleware/auth');
const checkOwnership = require('./middleware/ownership');
const wealthRoutes = require('./routes/wealth');
const cashflowRoutes = require('./routes/cashflow');
const aiRoutes = require('./routes/ai');
const securityRoutes = require('./routes/security');

const TRANSACTION_TYPES = new Set(['income', 'expense']);
const THEME_VALUES = new Set(['light', 'amoled']);
const CURRENCY_CODES = new Set(['USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SGD', 'AED', 'CHF', 'CNY', 'MXN', 'BRL', 'KRW', 'THB']);
const HEX_COLOR = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

const parseTransactionAmount = (value) => {
  const amount = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) return null;
  if (Math.round(amount * 100) !== amount * 100) return null;
  return amount;
};

const parseTransactionDate = (value) => {
  if (value === undefined || value === null || value === '') return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getTransactionBalance = async (userId) => {
  const [result] = await Transaction.aggregate([
    { $match: { user_id: new mongoose.Types.ObjectId(userId), is_deleted: { $ne: true } } },
    { $group: {
      _id: null,
      income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
      expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } }
    } }
  ]);
  return Number(((result?.income || 0) - (result?.expense || 0)).toFixed(2));
};

const syncUserBalance = async (userId) => {
  const balance = await getTransactionBalance(userId);
  await User.findByIdAndUpdate(userId, { $set: { balance } });
  return balance;
};

const validateTransactionPayload = ({ type, category, amount, date, note }) => {
  const numericAmount = parseTransactionAmount(amount);
  if (!TRANSACTION_TYPES.has(type)) return { error: 'Type must be income or expense.' };
  if (typeof category !== 'string' || !category.trim() || category.trim().length > 80) {
    return { error: 'A valid category is required.' };
  }
  if (numericAmount === null) return { error: 'Amount must be a positive number with at most 2 decimals.' };
  const parsedDate = parseTransactionDate(date);
  if (!parsedDate) return { error: 'Date must be valid.' };
  if (note !== undefined && note !== null && String(note).length > 500) {
    return { error: 'Note must be 500 characters or fewer.' };
  }
  return { numericAmount, parsedDate };
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : Number.EPSILON) || amount > 999999999.99) return null;
  if (Math.round(amount * 100) !== amount * 100) return null;
  return Number(amount.toFixed(2));
};

const buildSettingsUpdate = (payload = {}) => {
  const updates = {};
  if (payload.username !== undefined) updates.username = String(payload.username).trim();
  if (payload.last_name !== undefined) {
    const lastName = String(payload.last_name).trim();
    if (lastName.length > 80) return { error: 'Last name must be 80 characters or fewer.' };
    updates.last_name = lastName;
  }
  if (payload.email !== undefined) {
    const email = normalizeEmail(payload.email);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return { error: 'A valid email is required.' };
    updates.email = email;
  }
  if (payload.theme !== undefined) {
    if (!THEME_VALUES.has(payload.theme)) return { error: 'Theme must be light or amoled.' };
    updates.theme = payload.theme;
  }
  if (payload.monthly_goal !== undefined) {
    const monthlyGoal = parseMoney(payload.monthly_goal);
    if (monthlyGoal === null) return { error: 'Monthly goal must be a valid non-negative amount with at most 2 decimals.' };
    updates.monthly_goal = monthlyGoal;
  }
  if (payload.currency !== undefined) {
    const currency = String(payload.currency).trim().toUpperCase();
    if (!CURRENCY_CODES.has(currency)) return { error: 'Unsupported currency.' };
    updates.currency = currency;
  }
  if (payload.profile_avatar !== undefined) {
    if (typeof payload.profile_avatar !== 'string' || payload.profile_avatar.length > 4000000) {
      return { error: 'Profile avatar is invalid or too large.' };
    }
    updates.profile_avatar = payload.profile_avatar;
  }
  if (payload.profile_color !== undefined) {
    if (typeof payload.profile_color !== 'string' || !HEX_COLOR.test(payload.profile_color)) {
      return { error: 'Profile color must be a valid hex color.' };
    }
    updates.profile_color = payload.profile_color;
  }
  return { updates };
};

// ─── Environment Validation ─────────────────────────────────────────────────
if (!process.env.MONGO_URI) {
  console.error('FATAL ERROR: MONGO_URI is not defined in the environment variables.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in the environment variables.');
  process.exit(1);
}

const app = express();

// ─── CORS — allow deployed frontend + local dev ─────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://9-budget-tracker.vercel.app',      // hardcoded Vercel fallback
  process.env.FRONTEND_URL,                   // preferred env var name
  process.env.CLIENT_URL,                     // alternate name (some guides use this)
].filter(Boolean).map((value) => {
  try { return new URL(value).origin; } catch { return null; }
}).filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // Handle all preflight OPTIONS requests explicitly
app.use(morgan('dev'));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '5mb' })); // reduced limit from 50mb for security
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.get('/api/health', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'OK' : 'DEGRADED',
    database: databaseReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/wealth', wealthRoutes);
app.use('/api/cashflow', cashflowRoutes);

// ─── AUTHENTICATION ROUTES ──────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many authentication attempts, please try again later.' }
});
app.use('/api/auth', authLimiter);

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  message: { error: 'Too many write requests. Please try again later.' }
});

app.post('/api/auth/register', [
  body('username').notEmpty().trim().isLength({ min: 2, max: 80 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
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
    const token = jwt.sign({ id: user._id, session_version: user.session_version }, process.env.JWT_SECRET, { expiresIn: '7d' });

    await LoginLog.create({
      user_id: user._id, email, status: 'success', reason: 'registered',
      ip: ipAddr, user_agent: ua, device_type, browser, os,
      failed_attempts_before: 0
    }).catch(() => { });

    res.status(201).json({ token, user: { id: user._id, username, email } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});



app.post('/api/auth/login', [
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

    // User not found
    if (!user) {
      await LoginLog.create({ email, status: 'failed', reason: 'user_not_found', ip: ipAddr, user_agent: ua, device_type, browser, os }).catch(() => { });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Account inactive
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled. Contact support.' });
    }

    // Account locked — check if lock expired
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
      // Lock expired — reset
      user.account_locked = false;
      user.locked_until = null;
      user.failed_login_count = 0;
    }

    // Wrong password
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

    // ✅ Successful login
    await user.resetLoginAttempts(ipAddr);
    const token = jwt.sign({ id: user._id, session_version: user.session_version }, process.env.JWT_SECRET, { expiresIn: '7d' });

    await LoginLog.create({
      user_id: user._id, email, status: 'success', reason: 'login',
      ip: ipAddr, user_agent: ua, device_type, browser, os,
      failed_attempts_before: 0
    }).catch(() => { });

    res.json({ token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    await syncUserBalance(req.user.id);
    const user = await User.findById(req.user.id);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $inc: { session_version: 1 } });
    auditLogger.info('User logged out', { userId: req.user.id, ip: req.ip });
    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/auth/change-password', auth, async (req, res) => {
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
    auditLogger.info('Password changed', { userId: req.user.id, ip: req.ip });
    res.json({ message: 'Password updated. Please log in again.' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// View login logs for current user (auth protected)
app.get('/api/auth/login-logs', auth, async (req, res) => {
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

// ─── CURRENCY HELPERS ────────────────────────────────────────────────────────
const CURRENCIES = {
  USD: { symbol: '$', code: 'USD' },
  INR: { symbol: '₹', code: 'INR' },
  EUR: { symbol: '€', code: 'EUR' },
  GBP: { symbol: '£', code: 'GBP' },
  JPY: { symbol: '¥', code: 'JPY' },
  CAD: { symbol: 'CA$', code: 'CAD' },
  AUD: { symbol: 'A$', code: 'AUD' },
  SGD: { symbol: 'S$', code: 'SGD' },
  AED: { symbol: 'د.إ', code: 'AED' },
  CHF: { symbol: 'Fr', code: 'CHF' },
  CNY: { symbol: '¥', code: 'CNY' },
  MXN: { symbol: '$', code: 'MXN' },
  BRL: { symbol: 'R$', code: 'BRL' },
  KRW: { symbol: '₩', code: 'KRW' },
  THB: { symbol: '฿', code: 'THB' },
};

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// ─── PROTECT ALL SUBSEQUENT ROUTES ───────────────────────────────────────────
app.use('/api', writeLimiter);
app.use('/api/users', auth);
app.use('/api/transactions', auth);
app.use('/api/goals', auth);
app.use('/api/subscriptions', auth);
app.use('/api/events', auth);
app.use('/api/export', auth);
app.use('/api/ai', auth, aiRoutes);
app.use('/api/security', auth, securityRoutes);

// 1. Get all users (for user switcher - keeping for backward compat if needed, but really shouldn't be used now)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({ _id: req.user.id }, 'username last_name email balance theme monthly_goal currency profile_avatar profile_color').sort({ _id: 1 });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Switch user endpoint - returns new JWT for target user
app.post('/api/users/:id/switch', auth, checkOwnership('id'), async (req, res) => {
  try {
    const targetId = req.params.id;
    const targetUser = await User.findById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });
    const newToken = jwt.sign({ id: targetId, session_version: targetUser.session_version }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: newToken });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. Get single user
app.get('/api/users/:id', checkOwnership('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Create new user (family member — generates a default password)
app.post('/api/users', [
  body('username').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('currency').optional().isString()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, email, password, currency = 'INR', profile_avatar = '😊', profile_color = '#059669' } = req.body;
  try {
    // Use provided password or generate a secure random default
    const userPassword = password || require('crypto').randomBytes(16).toString('hex');
    const user = await User.create({ username, email, password: userPassword, balance: 0, currency, profile_avatar, profile_color });
    res.status(201).json({ id: user._id, message: 'User created' });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email already exists' });
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const USER_DATA_MODELS = [Transaction, Goal, Subscription, Event, WealthItem, NetWorthHistory, LoginLog];

const deleteUserAndData = async (userId) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    for (const Model of USER_DATA_MODELS) {
      await Model.deleteMany({ user_id: userId }, { session });
    }
    const deleted = await User.findByIdAndDelete(userId, { session });
    if (!deleted) throw Object.assign(new Error('User not found.'), { status: 404 });
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    throw error;
  } finally {
    await session.endSession();
  }
};

// 3.5 Delete user and all owned data atomically
app.delete('/api/users/:id', checkOwnership('id'), async (req, res) => {
  try {
    const userId = req.params.id;
    await deleteUserAndData(userId);
    
    auditLogger.info('User deleted account', { userId: req.user.id, targetId: userId, ip: req.ip });
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error' });
  }
});

// 4. Update user settings (Atomic PATCH)
app.patch('/api/users/:id/settings', checkOwnership('id'), [
  body('username').optional().notEmpty().trim(),
  body('last_name').optional().isString().trim().isLength({ max: 80 }),
  body('email').optional().isEmail().normalizeEmail()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const settings = buildSettingsUpdate(req.body);
  if (settings.error) return res.status(400).json({ error: settings.error });
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { $set: settings.updates }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ message: 'Settings updated atomically successfully', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Legacy PUT route mapped simply for backwards-compatibility or replaced altogether
app.put('/api/users/:id/settings', checkOwnership('id'), [
  body('username').optional().notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const settings = buildSettingsUpdate(req.body);
  if (settings.error) return res.status(400).json({ error: settings.error });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updated = await User.findByIdAndUpdate(req.params.id, { $set: settings.updates }, { new: true, runValidators: true });
    res.json({ message: 'Settings updated successfully', user: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.5. Notifications Preferences
app.get('/api/users/:id/notifications', checkOwnership('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id, 'notification_prefs');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const prefs = user.notification_prefs;
    res.json(prefs || {
      emailReports: true, budgetAlerts: true, goalMilestones: true, unusualSpending: false,
      pushNotifications: true, weeklyDigest: true, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/users/:id/notifications', checkOwnership('id'), async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { notification_prefs: req.body });
    res.json({ message: 'Notification preferences updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.6 Advanced Preferences
app.get('/api/users/:id/advanced-preferences', checkOwnership('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id, 'advanced_prefs');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const prefs = user.advanced_prefs;
    res.json(prefs || {
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      firstDayOfWeek: 'Sunday',
      decimalSeparator: '.',
      compactMode: false,
      autoSave: true,
      animationsEnabled: true,
      showWeekNumbers: false
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/users/:id/advanced-preferences', checkOwnership('id'), async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { advanced_prefs: req.body });
    res.json({ message: 'Advanced preferences updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 5. Get user transactions
app.get('/api/transactions/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    const limit = Math.min(2000, Math.max(1, Number.parseInt(req.query.limit, 10) || 2000));
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user_id: req.params.userId, is_deleted: { $ne: true } })
      .sort({ date: -1, _id: -1 })
      .skip(skip)
      .limit(limit);
    
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 6. Add transaction
app.post('/api/transactions', async (req, res) => {
  const { type, category, amount, date, note } = req.body;
  const user_id = req.user.id;
  try {
    const validation = validateTransactionPayload({ type, category, amount, date, note });
    if (validation.error) return res.status(400).json({ error: validation.error });
    const txData = {
      user_id, type, category: category.trim(), amount: validation.numericAmount,
      date: validation.parsedDate, note: note ? String(note).trim() : null
    };

    const transaction = await Transaction.create(txData);

    const balance = await syncUserBalance(user_id);

    res.status(201).json({ transaction, balance, message: 'Transaction added' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 7. Edit transaction (amount, category, note, date, type)
app.put('/api/transactions/:id', async (req, res) => {
  const { amount, category, note, date, type } = req.body;
  try {
    const t = await Transaction.findOne({ _id: req.params.id, is_deleted: { $ne: true } });
    if (!t) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (t.user_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const next = {
      type: type === undefined ? t.type : type,
      category: category === undefined ? t.category : category,
      amount: amount === undefined ? t.amount : amount,
      date: date === undefined ? t.date : date,
      note: note === undefined ? t.note : note
    };
    const validation = validateTransactionPayload(next);
    if (validation.error) return res.status(400).json({ error: validation.error });

    t.type = next.type;
    t.amount = validation.numericAmount;
    t.category = next.category.trim();
    t.note = next.note ? String(next.note).trim() : null;
    t.date = validation.parsedDate;
    await t.save();

    const balance = await syncUserBalance(t.user_id);

    res.json({ transaction: t, balance, message: 'Transaction updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 8. Delete transaction
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const t = await Transaction.findById(req.params.id);
    if (!t) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (t.user_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    t.is_deleted = true;
    await t.save();
    const balance = await syncUserBalance(t.user_id);

    res.json({ balance, message: 'Transaction deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 9. Reset user data
app.post('/api/users/:id/reset', checkOwnership('id'), async (req, res) => {
  try {
    const userId = req.params.id;
    await Transaction.deleteMany({ user_id: userId });
    await Goal.deleteMany({ user_id: userId });
    await Subscription.deleteMany({ user_id: userId });
    await Event.deleteMany({ user_id: userId });
    await WealthItem.deleteMany({ user_id: userId });
    await NetWorthHistory.deleteMany({ user_id: userId });
    await User.findByIdAndUpdate(userId, { balance: 0 });
    
    auditLogger.info('User reset account', { userId: req.user.id, targetId: userId, ip: req.ip });
    
    res.json({ message: 'Account reset successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- GOALS API ---

// G1. Get all goals for a user
app.get('/api/goals/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    const goals = await Goal.find({ user_id: req.params.userId }).sort({ created_at: 1 });
    res.json(goals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// G2. Add a new goal
app.post('/api/goals', async (req, res) => {
  const { name, target, saved, color, icon, deadline, priority, category, notes, auto_save_amount, auto_save_interval } = req.body;
  const user_id = req.user.id;
  try {
    const goalData = { user_id, name, target, saved: saved || 0, color, icon };

    if (deadline) goalData.deadline = new Date(deadline);
    if (priority) goalData.priority = priority;
    if (category) goalData.category = category;
    if (notes) goalData.notes = notes;
    if (auto_save_amount !== undefined) goalData.auto_save_amount = auto_save_amount;
    if (auto_save_interval) goalData.auto_save_interval = auto_save_interval;

    const goal = await Goal.create(goalData);
    res.json({ id: goal._id, message: 'Goal created', goal });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// G3. Update goal saved amount
app.put('/api/goals/:id', async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (goal.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const { saved, name, target, color, icon, deadline, priority, category, notes, auto_save_amount, auto_save_interval } = req.body;
    if (saved !== undefined) {
      const savedNum = parseMoney(saved);
      if (savedNum === null) return res.status(400).json({ error: 'Saved amount must be a non-negative number.' });
      goal.saved = savedNum;
    }
    if (name !== undefined) goal.name = String(name).trim();
    if (target !== undefined) {
      const targetNum = parseMoney(target, { allowZero: false });
      if (targetNum === null) return res.status(400).json({ error: 'Target must be a positive number.' });
      goal.target = targetNum;
    }
    if (goal.saved > goal.target) return res.status(400).json({ error: 'Saved amount cannot exceed target.' });
    if (color !== undefined) goal.color = color;
    if (icon !== undefined) goal.icon = icon;
    if (deadline !== undefined) {
      const parsedDeadline = new Date(deadline);
      if (Number.isNaN(parsedDeadline.getTime())) return res.status(400).json({ error: 'Invalid deadline.' });
      goal.deadline = parsedDeadline;
    }
    if (priority !== undefined) goal.priority = priority;
    if (category !== undefined) goal.category = category;
    if (notes !== undefined) goal.notes = notes;
    if (auto_save_amount !== undefined) {
      const autoAmount = parseMoney(auto_save_amount);
      if (autoAmount === null) return res.status(400).json({ error: 'Auto-save amount must be non-negative.' });
      goal.auto_save_amount = autoAmount;
    }
    if (auto_save_interval !== undefined) goal.auto_save_interval = auto_save_interval;
    await goal.save();
    res.json({ message: 'Goal updated', goal });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// G4. Delete a goal
app.delete('/api/goals/:id', async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (goal.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    await Goal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- SUBSCRIPTIONS API ---

// S1. Get all subscriptions for a user
app.get('/api/subscriptions/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    const subs = await Subscription.find({ user_id: req.params.userId }).sort({ created_at: 1 });
    res.json(subs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// S2. Add a new subscription
app.post('/api/subscriptions', async (req, res) => {
  const { name, amount, cycle, color, icon, url, notes, payment_method, start_date, next_billing_date, trial_ends } = req.body;
  const user_id = req.user.id;
  try {
    const subData = { user_id, name, amount, cycle: cycle || 'monthly', color, icon };

    // Add optional advanced fields if they exist
    if (url) subData.url = url;
    if (notes) subData.notes = notes;
    if (payment_method) subData.payment_method = payment_method;
    if (start_date) subData.start_date = new Date(start_date);
    if (next_billing_date) subData.next_billing_date = new Date(next_billing_date);
    if (trial_ends) subData.trial_ends = new Date(trial_ends);

    const sub = await Subscription.create(subData);
    res.json({ id: sub._id, message: 'Subscription created', sub });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// S3. Delete a subscription
app.delete('/api/subscriptions/:id', async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    if (sub.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    await Subscription.findByIdAndDelete(req.params.id);
    res.json({ message: 'Subscription deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 8. Calendar Events endpoints
app.get('/api/events/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    const events = await Event.find({ user_id: req.params.userId }).sort({ date: 1 });
    res.json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/events', [
  body('title').notEmpty().trim(),
  body('date').isISO8601()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, date, type, amount, description, color } = req.body;
  const user_id = req.user.id;
  try {
    const eventData = { user_id, title, date: new Date(date) };
    if (type) eventData.type = type;
    if (amount !== undefined) eventData.amount = amount;
    if (description) eventData.description = description;
    if (color) eventData.color = color;

    const event = await Event.create(eventData);
    res.status(201).json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    if (req.body.title) event.title = req.body.title;
    if (req.body.date) event.date = new Date(req.body.date);
    if (req.body.type) event.type = req.body.type;
    if (req.body.amount !== undefined) event.amount = req.body.amount;
    if (req.body.description !== undefined) event.description = req.body.description;
    if (req.body.color) event.color = req.body.color;

    await event.save();
    res.json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Event deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 9. Export logic Excel
app.get('/api/export/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId) || {};
    const currency = user.currency || 'USD';
    const currencySymbol = (CURRENCIES[currency] || CURRENCIES.USD).symbol;

    const transactions = await Transaction.find({ user_id: req.params.userId, is_deleted: { $ne: true } }).sort({ date: -1 });

    const workbook = new excel.Workbook();
    workbook.creator = 'MyCoinwise';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Transactions', { pageSetup: { fitToPage: true } });
    ws.columns = [
      { header: 'ID', key: 'id', width: 28 },
      { header: 'Date', key: 'date', width: 22 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Category', key: 'category', width: 22 },
      { header: 'Note', key: 'note', width: 32 },
      { header: `Amount (${currency})`, key: 'amount', width: 16 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    headerRow.height = 22;

    transactions.forEach(t => {
      const row = ws.addRow({
        id: t._id.toString(),
        date: new Date(t.date).toLocaleString('en-IN'),
        type: t.type.toUpperCase(),
        category: t.category,
        note: t.note || '',
        amount: `${currencySymbol}${parseFloat(t.amount).toFixed(2)}`,
      });
      row.getCell('amount').font = {
        bold: true,
        color: { argb: t.type === 'income' ? 'FF10B981' : 'FFEF4444' }
      };
    });

    ws.eachRow(row => row.eachCell(cell => {
      cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=MyCoinwise_${user.username || 'Report'}.xlsx`);
    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// JSON backup/restore for the authenticated user's own data.
// Restore is deliberately allow-listed and never accepts or overwrites a user document.
app.get('/api/users/:userId/export', checkOwnership('userId'), async (req, res) => {
  try {
    const userId = req.params.userId;
    const [transactions, goals, subscriptions, events, wealthItems, netWorthHistory] = await Promise.all([
      Transaction.find({ user_id: userId }).lean(),
      Goal.find({ user_id: userId }).lean(),
      Subscription.find({ user_id: userId }).lean(),
      Event.find({ user_id: userId }).lean(),
      WealthItem.find({ user_id: userId }).lean(),
      NetWorthHistory.find({ user_id: userId }).lean(),
    ]);
    res.json({ version: 1, exportedAt: new Date().toISOString(), transactions, goals, subscriptions, events, wealthItems, netWorthHistory });
  } catch (error) {
    console.error('[Backup] export error:', error);
    res.status(500).json({ message: 'Failed to export backup.' });
  }
});

app.post('/api/users/:userId/import', checkOwnership('userId'), async (req, res) => {
  try {
    const userId = req.params.userId;
    const backup = req.body;
    if (!backup || backup.version !== 1) return res.status(400).json({ message: 'Unsupported backup format.' });

    const collections = [
      ['transactions', Transaction], ['goals', Goal], ['subscriptions', Subscription],
      ['events', Event], ['wealthItems', WealthItem], ['netWorthHistory', NetWorthHistory],
    ];
    const operations = collections.map(async ([key, Model]) => {
      if (!Array.isArray(backup[key])) return;
      const documents = backup[key].map(({ _id, user_id, ...document }) => ({ ...document, user_id: userId }));
      await Model.deleteMany({ user_id: userId });
      if (documents.length) await Model.insertMany(documents, { ordered: true });
    });
    await Promise.all(operations);
    await syncUserBalance(userId);
    res.json({ success: true, message: 'Backup restored successfully.' });
  } catch (error) {
    console.error('[Backup] import error:', error);
    res.status(400).json({ message: 'Backup could not be restored.' });
  }
});

// ─── ERROR HANDLER MIDDLEWARE ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(err.stack);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  logger.info(`🚀 MyCoinwise API running on port ${PORT}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});
