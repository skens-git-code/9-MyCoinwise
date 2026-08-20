const express = require('express');
const { body, param, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');
const Subscription = require('../models/Subscription');
const Event = require('../models/Event');
const WealthItem = require('../models/WealthItem');
const NetWorthHistory = require('../models/NetWorthHistory');
const Budget = require('../models/Budget');
const Account = require('../models/Account');
const Calculation = require('../models/Calculation');
const Session = require('../models/Session');
const checkOwnership = require('../middleware/ownership');
const { logger, auditLogger } = require('../utils/logger');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for sensitive operations
const settingsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many settings update requests. Please try again later.' },
});

const deleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many account deletion attempts. Please try again later.' },
});

// ---------- Constants ----------
const CURRENCY_CODES = new Set(['USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SGD', 'AED', 'CHF', 'CNY', 'MXN', 'BRL', 'KRW', 'THB']);
const THEME_VALUES = new Set(['light', 'amoled']);
const HEX_COLOR = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

const DEFAULT_NOTIFICATION_PREFS = {
  emailReports: true,
  budgetAlerts: true,
  goalMilestones: true,
  unusualSpending: false,
  pushNotifications: true,
  weeklyDigest: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

const DEFAULT_ADVANCED_PREFS = {
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  firstDayOfWeek: 'Sunday',
  decimalSeparator: '.',
  compactMode: false,
  autoSave: true,
  animationsEnabled: true,
  showWeekNumbers: false,
};

// ---------- Helpers ----------
const normalizeBoolean = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const normalizeTime = (value, fallback) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? value : fallback);

const normalizeNotificationPrefs = (value = {}) => {
  const prefs = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    emailReports: normalizeBoolean(prefs.emailReports, DEFAULT_NOTIFICATION_PREFS.emailReports),
    budgetAlerts: normalizeBoolean(prefs.budgetAlerts, DEFAULT_NOTIFICATION_PREFS.budgetAlerts),
    goalMilestones: normalizeBoolean(prefs.goalMilestones, DEFAULT_NOTIFICATION_PREFS.goalMilestones),
    unusualSpending: normalizeBoolean(prefs.unusualSpending, DEFAULT_NOTIFICATION_PREFS.unusualSpending),
    pushNotifications: normalizeBoolean(prefs.pushNotifications, DEFAULT_NOTIFICATION_PREFS.pushNotifications),
    weeklyDigest: normalizeBoolean(prefs.weeklyDigest, DEFAULT_NOTIFICATION_PREFS.weeklyDigest),
    quietHoursEnabled: normalizeBoolean(prefs.quietHoursEnabled, DEFAULT_NOTIFICATION_PREFS.quietHoursEnabled),
    quietHoursStart: normalizeTime(prefs.quietHoursStart, DEFAULT_NOTIFICATION_PREFS.quietHoursStart),
    quietHoursEnd: normalizeTime(prefs.quietHoursEnd, DEFAULT_NOTIFICATION_PREFS.quietHoursEnd),
  };
};

const normalizeAdvancedPrefs = (value = {}) => {
  const prefs = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    dateFormat: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(prefs.dateFormat)
      ? prefs.dateFormat
      : DEFAULT_ADVANCED_PREFS.dateFormat,
    timeFormat: ['12h', '24h'].includes(prefs.timeFormat) ? prefs.timeFormat : DEFAULT_ADVANCED_PREFS.timeFormat,
    firstDayOfWeek: ['Sunday', 'Monday'].includes(prefs.firstDayOfWeek)
      ? prefs.firstDayOfWeek
      : DEFAULT_ADVANCED_PREFS.firstDayOfWeek,
    decimalSeparator: ['.', ','].includes(prefs.decimalSeparator)
      ? prefs.decimalSeparator
      : DEFAULT_ADVANCED_PREFS.decimalSeparator,
    compactMode: normalizeBoolean(prefs.compactMode, DEFAULT_ADVANCED_PREFS.compactMode),
    autoSave: normalizeBoolean(prefs.autoSave, DEFAULT_ADVANCED_PREFS.autoSave),
    animationsEnabled: normalizeBoolean(prefs.animationsEnabled, DEFAULT_ADVANCED_PREFS.animationsEnabled),
    showWeekNumbers: normalizeBoolean(prefs.showWeekNumbers, DEFAULT_ADVANCED_PREFS.showWeekNumbers),
  };
};

const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : Number.EPSILON) || amount > 999999999.99) return null;
  return Number(amount.toFixed(2));
};

const buildSettingsUpdate = (payload = {}) => {
  const updates = {};
  if (payload.username !== undefined) {
    const username = String(payload.username).trim();
    if (!username || username.length > 80) return { error: 'First name must be between 1 and 80 characters.' };
    updates.username = username;
  }
  if (payload.last_name !== undefined) {
    const lastName = String(payload.last_name).trim();
    if (lastName.length > 80) return { error: 'Last name must be 80 characters or fewer.' };
    updates.last_name = lastName;
  }
  if (payload.profession !== undefined) {
    if (typeof payload.profession !== 'string' || payload.profession.trim().length > 80) {
      return { error: 'Profession must be 80 characters or fewer.' };
    }
    updates.profession = payload.profession.trim() || 'Trader';
  }
  if (payload.email !== undefined) {
    const email = String(payload.email).trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return { error: 'A valid email is required.' };
    updates.email = email;
  }
  if (payload.theme !== undefined) {
    if (!THEME_VALUES.has(payload.theme)) return { error: 'Theme must be light or amoled.' };
    updates.theme = payload.theme;
  }
  if (payload.monthly_goal !== undefined) {
    const monthlyGoal = parseMoney(payload.monthly_goal);
    if (monthlyGoal === null) {
      return { error: 'Monthly goal must be a valid non-negative amount with at most 2 decimals.' };
    }
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
  if (payload.notification_prefs !== undefined) {
    if (!payload.notification_prefs || typeof payload.notification_prefs !== 'object' || Array.isArray(payload.notification_prefs)) {
      return { error: 'Notification preferences are invalid.' };
    }
    updates.notification_prefs = normalizeNotificationPrefs(payload.notification_prefs);
  }
  if (payload.advanced_prefs !== undefined) {
    if (!payload.advanced_prefs || typeof payload.advanced_prefs !== 'object' || Array.isArray(payload.advanced_prefs)) {
      return { error: 'Advanced preferences are invalid.' };
    }
    updates.advanced_prefs = normalizeAdvancedPrefs(payload.advanced_prefs);
  }
  return { updates };
};

// ---------- Data Deletion Helpers ----------
const USER_DATA_MODELS = [
  Transaction,
  Goal,
  Subscription,
  Event,
  WealthItem,
  NetWorthHistory,
  LoginLog,
  Session,
  Budget,
  Account,
  Calculation,
];

const deleteUserAndData = async (userId) => {
  let userObjectId;
  try {
    userObjectId = new mongoose.Types.ObjectId(userId);
  } catch {
    userObjectId = userId;
  }
  const userQuery = { $or: [{ user_id: userObjectId }, { user_id: String(userId) }] };

  try {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      for (const Model of USER_DATA_MODELS) {
        await Model.deleteMany(userQuery, { session });
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
  } catch (sessionErr) {
    if (sessionErr.status === 404) throw sessionErr;
    // Fallback: delete individually without transaction
    for (const Model of USER_DATA_MODELS) {
      await Model.deleteMany(userQuery);
    }
    const deleted = await User.findByIdAndDelete(userId);
    if (!deleted) throw Object.assign(new Error('User not found.'), { status: 404 });
  }
};

// ============================================================
// ROUTES
// ============================================================

// ---------- GET household users ----------
router.get('/', async (req, res) => {
  try {
    const householdId = req.user.household_id || req.user.id;
    const users = await User.find({
      $or: [{ household_id: householdId }, { _id: req.user.id }],
    })
      .select('username last_name profession email email_verified created_at balance theme monthly_goal currency profile_avatar profile_color household_id')
      .sort({ _id: 1 });
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(users);
  } catch (error) {
    logger.error('[Users] list household users error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- GET current user (single object) ----------
router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('username last_name profession email email_verified created_at balance theme monthly_goal currency profile_avatar profile_color notification_prefs advanced_prefs');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    logger.error('[Users] get /me error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- GET a specific user (by ID) ----------
router.get('/:id', checkOwnership('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    logger.error('[Users] get by id error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- ADMIN ONLY: Create a new user ----------
// This endpoint is meant for admins to create user accounts.
// It should be protected with an admin middleware.
// For now, we add a placeholder `isAdmin` middleware check.
// In a real implementation, you would have a role field in the User model.
router.post(
  '/',
  // isAdmin, // <-- Add this middleware to restrict access
  [
    body('username').notEmpty().trim(),
    body('last_name').optional().isString().trim().isLength({ max: 80 }),
    body('profession').optional().isString().trim().isLength({ max: 80 }),
    body('email').isEmail().normalizeEmail(),
    body('currency').optional().isString(),
    body('password').optional().isString().isLength({ min: 8 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, last_name = '', profession = 'Trader', email, password, currency = 'INR', profile_avatar = '😊', profile_color = '#059669' } = req.body;

    try {
      // If password not provided, generate a temporary one
      const userPassword = password || crypto.randomBytes(16).toString('hex');
      const user = await User.create({
        username,
        last_name,
        profession: profession || 'Trader',
        email,
        password: userPassword,
        balance: 0,
        currency,
        profile_avatar,
        profile_color,
        household_id: req.user.household_id || req.user.id,
      });
      res.status(201).json({
        id: user._id,
        username: user.username,
        last_name: user.last_name,
        profession: user.profession,
        email: user.email,
        temporaryPassword: !password ? userPassword : undefined, // only return if auto-generated
        message: 'User created successfully',
      });
    } catch (error) {
      if (error.code === 11000) {
        if (error.keyPattern && error.keyPattern.username) {
          return res.status(409).json({ error: 'Username already exists' });
        }
        return res.status(409).json({ error: 'Email already exists' });
      }
      logger.error('[Users] create user error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ---------- PATCH: Update settings (partial update) ----------
// Unified endpoint for both PATCH and PUT
router.patch(
  '/:id/settings',
  checkOwnership('id'),
  settingsLimiter,
  [
    param('id').isMongoId().withMessage('Invalid user ID.'),
    body('username').optional().notEmpty().trim(),
    body('last_name').optional().isString().trim().isLength({ max: 80 }),
    body('profession').optional().isString().trim().isLength({ max: 80 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('theme').optional().isIn(['light', 'amoled']),
    body('currency').optional().isString(),
    body('monthly_goal').optional().isFloat({ min: 0 }),
    body('profile_avatar').optional().isString(),
    body('profile_color').optional().matches(HEX_COLOR),
    body('notification_prefs').optional().isObject(),
    body('advanced_prefs').optional().isObject(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const result = buildSettingsUpdate(req.body);
    if (result.error) return res.status(400).json({ error: result.error });

    try {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: result.updates },
        { new: true, runValidators: true }
      );
      if (!user) return res.status(404).json({ error: 'User not found' });

      auditLogger.info('User settings updated', { userId: req.user.id, targetId: req.params.id, ip: req.ip });

      res.json({ message: 'Settings updated successfully', user });
    } catch (error) {
      logger.error('[Users] patch settings error:', error);
      res.status(error.code === 11000 ? 409 : 500).json({
        error: error.code === 11000 ? 'Email is already in use.' : 'Internal Server Error'
      });
    }
  }
);

// ---------- PUT: Update settings (full replace) ----------
// We deprecate this in favour of PATCH, but keep for backwards compatibility
router.put(
  '/:id/settings',
  checkOwnership('id'),
  settingsLimiter,
  [
    param('id').isMongoId().withMessage('Invalid user ID.'),
    body('username').optional().notEmpty().trim(),
    body('last_name').optional().isString().trim().isLength({ max: 80 }),
    body('profession').optional().isString().trim().isLength({ max: 80 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('theme').optional().isIn(['light', 'amoled']),
    body('currency').optional().isString(),
    body('monthly_goal').optional().isFloat({ min: 0 }),
    body('profile_avatar').optional().isString(),
    body('profile_color').optional().matches(HEX_COLOR),
    body('notification_prefs').optional().isObject(),
    body('advanced_prefs').optional().isObject(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const result = buildSettingsUpdate(req.body);
    if (result.error) return res.status(400).json({ error: result.error });

    try {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: result.updates },
        { new: true, runValidators: true }
      );
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ message: 'Settings updated successfully', user });
    } catch (error) {
      logger.error('[Users] put settings error:', error);
      res.status(error.code === 11000 ? 409 : 500).json({
        error: error.code === 11000 ? 'Email is already in use.' : 'Internal Server Error'
      });
    }
  }
);

// ---------- GET notification preferences ----------
router.get('/:id/notifications', checkOwnership('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id, 'notification_prefs');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(normalizeNotificationPrefs(user.notification_prefs || DEFAULT_NOTIFICATION_PREFS));
  } catch (error) {
    logger.error('[Users] get notifications error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- PUT notification preferences ----------
router.put('/:id/notifications', checkOwnership('id'), settingsLimiter, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { notification_prefs: normalizeNotificationPrefs(req.body) } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Notification preferences updated', prefs: user.notification_prefs });
  } catch (error) {
    logger.error('[Users] update notifications error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- GET advanced preferences ----------
router.get('/:id/advanced-preferences', checkOwnership('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id, 'advanced_prefs');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(normalizeAdvancedPrefs(user.advanced_prefs || DEFAULT_ADVANCED_PREFS));
  } catch (error) {
    logger.error('[Users] get advanced prefs error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- PUT advanced preferences ----------
router.put('/:id/advanced-preferences', checkOwnership('id'), settingsLimiter, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { advanced_prefs: normalizeAdvancedPrefs(req.body) } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Advanced preferences updated', prefs: user.advanced_prefs });
  } catch (error) {
    logger.error('[Users] update advanced prefs error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- RESET financial data ----------
router.post(
  '/:id/reset',
  checkOwnership('id'),
  deleteLimiter,
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const userId = new mongoose.Types.ObjectId(req.params.id);
      await Promise.all([
        Transaction.deleteMany({ user_id: userId }),
        Goal.deleteMany({ user_id: userId }),
        Subscription.deleteMany({ user_id: userId }),
        Event.deleteMany({ user_id: userId }),
        WealthItem.deleteMany({ user_id: userId }),
        NetWorthHistory.deleteMany({ user_id: userId }),
        Budget.deleteMany({ user_id: userId }),
        Account.deleteMany({ user_id: userId }),
        Calculation.deleteMany({ user_id: userId }),
      ]);
      await User.findByIdAndUpdate(userId, { $set: { balance: 0 } });
      auditLogger.info('User financial data reset', { userId: req.user.id, targetId: req.params.id, ip: req.ip });
      res.json({ message: 'All financial data has been reset.' });
    } catch (error) {
      logger.error('[Users] reset account error:', error);
      res.status(500).json({ error: 'Unable to reset account data.' });
    }
  }
);

// ---------- DELETE user account ----------
router.delete(
  '/:id',
  checkOwnership('id', { household: true }),
  deleteLimiter,
  [
    param('id').isMongoId().withMessage('Invalid user ID.'),
  ],
  async (req, res) => {
    try {
      const userId = req.params.id;
      await deleteUserAndData(userId);

      auditLogger.info('User deleted account', { userId: req.user.id, targetId: userId, ip: req.ip });

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      logger.error('[Users] delete user error:', error);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error' });
    }
  }
);

// ---------- POST: Switch linked household user ----------
router.post('/:id/switch', [param('id').isMongoId().withMessage('Invalid user ID.')], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const householdId = req.user.household_id || req.user.id;
    const target = await User.findOne({
      _id: req.params.id,
      $or: [{ household_id: householdId }, { _id: req.user.id }],
      is_active: true,
    });
    if (!target) return res.status(403).json({ error: 'You can only switch to a linked household profile.' });

    const tokenId = crypto.randomUUID();
    const token = jwt.sign(
      { id: target._id, session_version: target.session_version || 0, jti: tokenId },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    await Session.create({
      user_id: target._id,
      token_id: tokenId,
      device: 'Household profile switch',
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      user_agent: req.headers['user-agent'] || '',
    });

    res.json({ token, user: {
      id: target._id,
      username: target.username,
      last_name: target.last_name,
      profession: target.profession,
      email: target.email,
      profile_avatar: target.profile_avatar,
      profile_color: target.profile_color,
    } });
  } catch (error) {
    logger.error('[Users] switch user error:', error);
    res.status(500).json({ error: 'Unable to switch household profile.' });
  }
});

// ---------- IMPORT backup ----------
// Restore a JSON backup created by /api/export/backup/:userId.
// We add a check to ensure the backup data does not contain documents with different user_ids.
router.post(
  '/:userId/import',
  checkOwnership('userId'),
  [
    param('userId').isMongoId().withMessage('Invalid user ID.'),
  ],
  async (req, res) => {
    const backup = req.body;
    if (!backup || typeof backup !== 'object' || Array.isArray(backup) || ![1, 2, 3].includes(backup.version)) {
      return res.status(400).json({ message: 'Unsupported or malformed backup format.' });
    }

    const collections = [
      ['transactions', Transaction],
      ['goals', Goal],
      ['subscriptions', Subscription],
      ['events', Event],
      ['wealthItems', WealthItem],
      ['netWorthHistory', NetWorthHistory],
      ['budgets', Budget],
      ['accounts', Account],
      ['calculations', Calculation],
    ];

    // Validate arrays
    for (const [key] of collections) {
      if (backup[key] !== undefined && !Array.isArray(backup[key])) {
        return res.status(400).json({ message: `Malformed backup: "${key}" must be an array.` });
      }
    }

    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.params.userId);
    const ownerQuery = { user_id: userObjectId };

    let session;
    const restore = async (options = {}) => {
      for (const [key, Model] of collections) {
        if (!Array.isArray(backup[key])) continue;
        const documents = backup[key].map(({ _id, id, user_id, __v, ...document }) => ({
          ...document,
          user_id: userObjectId,
        }));
        await Model.deleteMany(ownerQuery, options);
        if (documents.length) await Model.insertMany(documents, { ...options, ordered: true });
      }
    };

    try {
      try {
        session = await mongoose.startSession();
        session.startTransaction();
        await restore({ session });
        await session.commitTransaction();
      } catch (transactionError) {
        if (session) await session.abortTransaction().catch(() => {});
        // Fallback to non-transactional restore
        await restore();
      }
      res.json({ success: true, message: 'Backup restored successfully.' });
    } catch (error) {
      logger.error('[Users] import error:', error);
      res.status(400).json({ message: error.message || 'Backup could not be restored.' });
    } finally {
      if (session) await session.endSession();
    }
  }
);

module.exports = router;
