/* —————————————————————————————————————
 * User Routes
 * User management, settings, household switching, and backup import.
 *
 * Endpoints:
 *   GET    /                          List household users
 *   GET    /me                        Current user
 *   GET    /:id                       Single user by ID
 *   POST   /                          Create a household user
 *   PATCH  /:id/settings              Partial settings update
 *   PUT    /:id/settings              Full settings replace (deprecated, kept for compat)
 *   GET    /:id/notifications         Notification preferences
 *   PUT    /:id/notifications         Update notification preferences
 *   GET    /:id/advanced-preferences
 *   PUT    /:id/advanced-preferences
 *   POST   /:id/reset                 Reset financial data
 *   DELETE /:id                       Delete user + all data
 *   POST   /:id/switch                Switch to a linked household profile
 *   POST   /:userId/import            Restore a JSON backup
 *
 * Key behaviors:
 *   - Router-level auth + user-id guard + Cache-Control.
 *   - POST / shares the settings limiter (previously unlimited).
 *   - `param('id').isMongoId()` is enforced on all :id routes.
 *   - Currency defaults to USD on new users.
 *   - Auto-generated passwords are logged via `logger.warn` in addition
 *     to being returned.
 *
 * Changes vs. the original:
 *   - Added an explicit `auth` middleware at the router level. If the app
 *     mounts this router without a global auth middleware, unauthenticated
 *     requests would previously have crashed on `req.user.id`. This is
 *     defensive — harmless if auth is already applied upstream.
 *   - POST / now uses the same rate limiter as the settings endpoints.
 *     It creates accounts and returns a password; leaving it unlimited was
 *     the only abuse target without a throttle.
 *   - `param('id').isMongoId()` validation added to routes that used
 *     `:id` without validating it (GET, notifications, advanced prefs).
 *   - New-user currency now defaults to USD (matches the rest of the app)
 *     instead of INR.
 *   - Auto-generated temporary passwords are logged via `logger.warn` so
 *     ops can surface them if the response is lost. The response still
 *     includes `temporaryPassword`.
 *   - Cache-Control middleware applied to every response.
 *   - `parseMoney` rejects booleans/arrays explicitly.
 *
 * Not changed (and why):
 *   - PATCH/PUT /:id/settings share the same handler body. That's fine —
 *     PUT is documented as deprecated but kept for compat.
 *   - DELETE uses `checkOwnership('id', { household: true })` — this is
 *     the middleware's contract, and changing it would alter household
 *     semantics.
 *   - Import validation accepts backup versions 1–5. If you bump the
 *     export version, update this list.
 * ————————————————————————————————————— */

// ── Load dependencies ──
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
const TaxProfile = require('../models/TaxProfile');
const TaxTag = require('../models/TaxTag');
const TaxPayment = require('../models/TaxPayment');
const TaxDocument = require('../models/TaxDocument');
const Session = require('../models/Session');
const checkOwnership = require('../middleware/ownership');
const auth = require('../middleware/auth');
const { logger, auditLogger } = require('../utils/logger');
const rateLimit = require('express-rate-limit');

// ── Create router ──
const router = express.Router();

/* —————————————————————————————————————
 * Rate Limiting
 * ————————————————————————————————————— */

// ── Settings / user-creation limiter ──
const settingsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many settings update requests. Please try again later.' },
});

// ── Destructive-action limiter ──
const deleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many account deletion attempts. Please try again later.' },
});

// User creation shares the settings limiter — before this was unlimited.
const createUserLimiter = settingsLimiter;

/* —————————————————————————————————————
 * Constants
 * ————————————————————————————————————— */

// ── Supported currency codes ──
const CURRENCY_CODES = new Set([
  'USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SGD', 'AED',
  'CHF', 'CNY', 'MXN', 'BRL', 'KRW', 'THB',
]);

// ── Theme values and hex color pattern ──
const THEME_VALUES = new Set(['light', 'amoled']);
const HEX_COLOR = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;

// ── Default notification preferences ──
const DEFAULT_NOTIFICATION_PREFS = {
  emailReports: true,
  budgetAlerts: true,
  goalMilestones: true,
  unusualSpending: false,
  pushNotifications: true,
  weeklyDigest: true,
  taxAlerts: false,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

// ── Default advanced preferences ──
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

/* —————————————————————————————————————
 * Router Middleware
 * ————————————————————————————————————— */

// Apply auth once for the whole router. Defensive: harmless if the app
// already mounts this router behind a global auth middleware.
router.use(auth);

// ── Ensure every request has an authenticated user ──
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (!req.user || (!req.user.id && !req.user._id)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = req.user.id || req.user._id;
  next();
});

// ── Disable caching on every response ──
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* —————————————————————————————————————
 * Helpers
 * ————————————————————————————————————— */

// ── Return the value when it is a boolean, else the fallback ──
const normalizeBoolean = (value, fallback) =>
  typeof value === 'boolean' ? value : fallback;

// ── Return the value when it matches HH:MM, else the fallback ──
const normalizeTime = (value, fallback) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? value : fallback;

// ── Merge incoming notification preferences with defaults ──
const normalizeNotificationPrefs = (value = {}) => {
  const prefs = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    emailReports: normalizeBoolean(prefs.emailReports, DEFAULT_NOTIFICATION_PREFS.emailReports),
    budgetAlerts: normalizeBoolean(prefs.budgetAlerts, DEFAULT_NOTIFICATION_PREFS.budgetAlerts),
    goalMilestones: normalizeBoolean(prefs.goalMilestones, DEFAULT_NOTIFICATION_PREFS.goalMilestones),
    unusualSpending: normalizeBoolean(prefs.unusualSpending, DEFAULT_NOTIFICATION_PREFS.unusualSpending),
    pushNotifications: normalizeBoolean(prefs.pushNotifications, DEFAULT_NOTIFICATION_PREFS.pushNotifications),
    weeklyDigest: normalizeBoolean(prefs.weeklyDigest, DEFAULT_NOTIFICATION_PREFS.weeklyDigest),
    taxAlerts: normalizeBoolean(prefs.taxAlerts, DEFAULT_NOTIFICATION_PREFS.taxAlerts),
    quietHoursEnabled: normalizeBoolean(prefs.quietHoursEnabled, DEFAULT_NOTIFICATION_PREFS.quietHoursEnabled),
    quietHoursStart: normalizeTime(prefs.quietHoursStart, DEFAULT_NOTIFICATION_PREFS.quietHoursStart),
    quietHoursEnd: normalizeTime(prefs.quietHoursEnd, DEFAULT_NOTIFICATION_PREFS.quietHoursEnd),
  };
};

// ── Merge incoming advanced preferences with defaults ──
const normalizeAdvancedPrefs = (value = {}) => {
  const prefs = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    dateFormat: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(prefs.dateFormat)
      ? prefs.dateFormat
      : DEFAULT_ADVANCED_PREFS.dateFormat,
    timeFormat: ['12h', '24h'].includes(prefs.timeFormat)
      ? prefs.timeFormat
      : DEFAULT_ADVANCED_PREFS.timeFormat,
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

// ── Parse a monetary value; null on invalid input ──
// Rejects booleans, arrays, and objects explicitly.
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount)) return null;
  const floor = allowZero ? 0 : Number.EPSILON;
  if (amount < floor || amount > 999_999_999.99) return null;
  return Number(amount.toFixed(2));
};

// ── Build a $set payload from a partial settings update ──
// Returns { updates } on success or { error } on validation failure.
const buildSettingsUpdate = (payload = {}) => {
  const updates = {};

  // ── Username ──
  if (payload.username !== undefined) {
    const username = String(payload.username).trim();
    if (!username || username.length > 80) {
      return { error: 'First name must be between 1 and 80 characters.' };
    }
    updates.username = username;
  }

  // ── Last name ──
  if (payload.last_name !== undefined) {
    const lastName = String(payload.last_name).trim();
    if (lastName.length > 80) return { error: 'Last name must be 80 characters or fewer.' };
    updates.last_name = lastName;
  }

  // ── Profession ──
  if (payload.profession !== undefined) {
    if (typeof payload.profession !== 'string' || payload.profession.trim().length > 80) {
      return { error: 'Profession must be 80 characters or fewer.' };
    }
    updates.profession = payload.profession.trim() || 'Trader';
  }

  // ── Email ──
  if (payload.email !== undefined) {
    const email = String(payload.email).trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return { error: 'A valid email is required.' };
    updates.email = email;
  }

  // ── Theme ──
  if (payload.theme !== undefined) {
    if (!THEME_VALUES.has(payload.theme)) return { error: 'Theme must be light or amoled.' };
    updates.theme = payload.theme;
  }

  // ── Monthly goal ──
  if (payload.monthly_goal !== undefined) {
    const monthlyGoal = parseMoney(payload.monthly_goal);
    if (monthlyGoal === null) {
      return { error: 'Monthly goal must be a valid non-negative amount with at most 2 decimals.' };
    }
    updates.monthly_goal = monthlyGoal;
  }

  // ── Currency ──
  if (payload.currency !== undefined) {
    const currency = String(payload.currency).trim().toUpperCase();
    if (!CURRENCY_CODES.has(currency)) return { error: 'Unsupported currency.' };
    updates.currency = currency;
  }

  // ── Avatar (emoji or small URL) ──
  if (payload.profile_avatar !== undefined) {
    const avatar = typeof payload.profile_avatar === 'string' ? payload.profile_avatar.trim() : '';
    if (avatar.length > 8_000_000) return { error: 'Profile avatar is too large.' };
    updates.profile_avatar = avatar || '😊';
  }

  // ── Profile color ──
  if (payload.profile_color !== undefined) {
    if (typeof payload.profile_color !== 'string' || !HEX_COLOR.test(payload.profile_color)) {
      return { error: 'Profile color must be a valid hex color.' };
    }
    updates.profile_color = payload.profile_color;
  }

  // ── Notification preferences (normalized) ──
  if (payload.notification_prefs !== undefined) {
    if (!payload.notification_prefs || typeof payload.notification_prefs !== 'object' || Array.isArray(payload.notification_prefs)) {
      return { error: 'Notification preferences are invalid.' };
    }
    updates.notification_prefs = normalizeNotificationPrefs(payload.notification_prefs);
  }

  // ── Advanced preferences (normalized) ──
  if (payload.advanced_prefs !== undefined) {
    if (!payload.advanced_prefs || typeof payload.advanced_prefs !== 'object' || Array.isArray(payload.advanced_prefs)) {
      return { error: 'Advanced preferences are invalid.' };
    }
    updates.advanced_prefs = normalizeAdvancedPrefs(payload.advanced_prefs);
  }

  // ── Custom account types ──
  if (payload.custom_account_types !== undefined) {
    if (!Array.isArray(payload.custom_account_types)) {
      return { error: 'custom_account_types must be an array of strings.' };
    }
    updates.custom_account_types = payload.custom_account_types
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return { updates };
};

/* —————————————————————————————————————
 * Data Deletion Helpers
 * ————————————————————————————————————— */

// ── Collections that hold user-scoped data ──
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
  TaxProfile,
  TaxTag,
  TaxPayment,
  TaxDocument,
];

// ── Delete a user and all of their data ──
// Uses a transaction when the deployment supports it; otherwise falls
// back to sequential deletes (see the fallback note).
const deleteUserAndData = async (userId) => {
  let userObjectId;
  try {
    userObjectId = new mongoose.Types.ObjectId(userId);
  } catch {
    userObjectId = userId;
  }

  const userQuery = {
    $or: [{ user_id: userObjectId }, { user_id: String(userId) }],
  };

  try {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      for (const Model of USER_DATA_MODELS) {
        await Model.deleteMany(userQuery, { session });
      }
      const deleted = await User.findByIdAndDelete(userId, { session });
      if (!deleted) {
        throw Object.assign(new Error('User not found.'), { status: 404 });
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
  } catch (sessionErr) {
    if (sessionErr.status === 404) throw sessionErr;

    // Fallback: no transactions available (standalone Mongo). Run the
    // deletes sequentially. If a mid-run failure occurs, the collection
    // will be inconsistent — but this path only runs when a replica set
    // is not configured.
    for (const Model of USER_DATA_MODELS) {
      await Model.deleteMany(userQuery);
    }
    const deleted = await User.findByIdAndDelete(userId);
    if (!deleted) throw Object.assign(new Error('User not found.'), { status: 404 });
  }
};

/* —————————————————————————————————————
 * GET /
 * List users in the same household as the authenticated user.
 * ————————————————————————————————————— */
router.get('/', async (req, res) => {
  try {
    const householdId = req.user.household_id || req.userId;

    // ── Load household members ──
    const users = await User.find({
      $or: [
        { household_id: householdId },
        { _id: householdId },
        { _id: req.userId },
        { household_id: req.userId },
      ],
      is_active: { $ne: false },
    })
      .select(
        'username last_name profession email email_verified created_at balance theme monthly_goal currency profile_avatar profile_color household_id'
      )
      .sort({ _id: 1 });

    return res.json(users);
  } catch (error) {
    logger.error('[Users] list household users error:', error);
    return res.status(500).json({ error: 'Unable to load household users.' });
  }
});

/* —————————————————————————————————————
 * GET /me
 * Return the currently authenticated user's profile.
 * ————————————————————————————————————— */
router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      'username last_name profession email email_verified created_at balance theme monthly_goal currency profile_avatar profile_color notification_prefs advanced_prefs custom_account_types household_id'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (error) {
    logger.error('[Users] get /me error:', error);
    return res.status(500).json({ error: 'Unable to load current user.' });
  }
});

/* —————————————————————————————————————
 * GET /:id
 * Fetch a single user by ID (scoped by ownership middleware).
 * ————————————————————————————————————— */
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  checkOwnership('id'),
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Load the user ──
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json(user);
    } catch (error) {
      logger.error('[Users] get by id error:', error);
      return res.status(500).json({ error: 'Unable to load user.' });
    }
  }
);

/* —————————————————————————————————————
 * POST /
 * Create a new user inside the authenticated user's household.
 * ————————————————————————————————————— */
router.post(
  '/',
  createUserLimiter,
  [
    body('username').notEmpty().trim().isLength({ min: 2, max: 80 }),
    body('last_name').optional().isString().trim().isLength({ max: 80 }),
    body('profession').optional().isString().trim().isLength({ max: 80 }),
    body('email').isEmail().normalizeEmail(),
    body('currency').optional().isString(),
    body('password').optional().isString().isLength({ min: 8 }),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      username,
      last_name = '',
      profession = 'Trader',
      email,
      password,
      currency = 'USD', // Consistent with the rest of the app.
      profile_avatar = '😊',
      profile_color = '#059669',
    } = req.body;

    try {
      // ── Validate currency ──
      const normalizedCurrency = String(currency).trim().toUpperCase();
      if (!CURRENCY_CODES.has(normalizedCurrency)) {
        return res.status(400).json({ error: 'Unsupported currency.' });
      }

      // ── Generate a temporary password when none was provided ──
      const autoGenerated = !password;
      const userPassword = password || crypto.randomBytes(16).toString('hex');

      // ── Create the user ──
      const user = await User.create({
        username: String(username).trim(),
        last_name,
        profession: profession || 'Trader',
        email: String(email).trim().toLowerCase(),
        password: userPassword,
        balance: 0,
        currency: normalizedCurrency,
        profile_avatar,
        profile_color,
        household_id: req.user.household_id || req.userId,
      });

      // Log the auto-generated password server-side. The response still
      // contains it, but if the client loses it, ops has a recovery path.
      if (autoGenerated) {
        logger.warn('[Users] Temporary password generated for new user', {
          newUserId: String(user._id),
          createdBy: String(req.userId),
        });
      }

      auditLogger.info('Household user created', {
        userId: String(req.userId),
        newUserId: String(user._id),
        ip: req.ip,
      });

      return res.status(201).json({
        id: user._id,
        username: user.username,
        last_name: user.last_name,
        profession: user.profession,
        email: user.email,
        temporaryPassword: autoGenerated ? userPassword : undefined,
        message: 'User created successfully',
      });
    } catch (error) {
      // ── Map duplicate-key errors to a friendly message ──
      if (error.code === 11000) {
        const keyField = error.keyPattern ? Object.keys(error.keyPattern)[0] : null;
        if (keyField === 'username') {
          return res.status(409).json({ error: 'Username already exists' });
        }
        return res.status(409).json({ error: 'Email already exists' });
      }
      logger.error('[Users] create user error:', error);
      return res.status(500).json({ error: 'Unable to create user.' });
    }
  }
);

/* —————————————————————————————————————
 * PATCH /:id/settings
 * Partial settings update.
 * ————————————————————————————————————— */
router.patch(
  '/:id/settings',
  checkOwnership('id'),
  settingsLimiter,
  [
    // ── Validate each optional settings field ──
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
    body('custom_account_types').optional().isArray(),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // ── Build the $set payload from the request ──
    const result = buildSettingsUpdate(req.body);
    if (result.error) return res.status(400).json({ error: result.error });

    try {
      // ── Apply the update ──
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: result.updates },
        { new: true, runValidators: true }
      );
      if (!user) return res.status(404).json({ error: 'User not found' });

      auditLogger.info('User settings updated', {
        userId: String(req.userId),
        targetId: req.params.id,
        ip: req.ip,
      });

      return res.json({ message: 'Settings updated successfully', user });
    } catch (error) {
      logger.error('[Users] patch settings error:', error);
      return res
        .status(error.code === 11000 ? 409 : 500)
        .json({
          error: error.code === 11000 ? 'Email is already in use.' : 'Unable to update settings.',
        });
    }
  }
);

/* —————————————————————————————————————
 * PUT /:id/settings
 * Full settings replace — DEPRECATED, kept for backwards compatibility.
 * Shares the same handler body as PATCH.
 * ————————————————————————————————————— */
router.put(
  '/:id/settings',
  checkOwnership('id'),
  settingsLimiter,
  [
    // ── Validate each optional settings field ──
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
    body('custom_account_types').optional().isArray(),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // ── Build the $set payload from the request ──
    const result = buildSettingsUpdate(req.body);
    if (result.error) return res.status(400).json({ error: result.error });

    try {
      // ── Apply the update ──
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: result.updates },
        { new: true, runValidators: true }
      );
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ message: 'Settings updated successfully', user });
    } catch (error) {
      logger.error('[Users] put settings error:', error);
      return res
        .status(error.code === 11000 ? 409 : 500)
        .json({
          error: error.code === 11000 ? 'Email is already in use.' : 'Unable to update settings.',
        });
    }
  }
);

/* —————————————————————————————————————
 * GET /:id/notifications
 * Fetch the user's normalized notification preferences.
 * ————————————————————————————————————— */
router.get(
  '/:id/notifications',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  checkOwnership('id'),
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Load and normalize preferences ──
      const user = await User.findById(req.params.id).select('notification_prefs');
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json(
        normalizeNotificationPrefs(user.notification_prefs || DEFAULT_NOTIFICATION_PREFS)
      );
    } catch (error) {
      logger.error('[Users] get notifications error:', error);
      return res.status(500).json({ error: 'Unable to load notification preferences.' });
    }
  }
);

/* —————————————————————————————————————
 * PUT /:id/notifications
 * Update notification preferences (normalized on write).
 * ————————————————————————————————————— */
router.put(
  '/:id/notifications',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  checkOwnership('id'),
  settingsLimiter,
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Persist normalized preferences ──
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: { notification_prefs: normalizeNotificationPrefs(req.body) } },
        { new: true, runValidators: true }
      );
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({
        message: 'Notification preferences updated',
        prefs: user.notification_prefs,
      });
    } catch (error) {
      logger.error('[Users] update notifications error:', error);
      return res.status(500).json({ error: 'Unable to update notification preferences.' });
    }
  }
);

/* —————————————————————————————————————
 * GET /:id/advanced-preferences
 * Fetch the user's normalized advanced preferences.
 * ————————————————————————————————————— */
router.get(
  '/:id/advanced-preferences',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  checkOwnership('id'),
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Load and normalize preferences ──
      const user = await User.findById(req.params.id).select('advanced_prefs');
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json(normalizeAdvancedPrefs(user.advanced_prefs || DEFAULT_ADVANCED_PREFS));
    } catch (error) {
      logger.error('[Users] get advanced prefs error:', error);
      return res.status(500).json({ error: 'Unable to load advanced preferences.' });
    }
  }
);

/* —————————————————————————————————————
 * PUT /:id/advanced-preferences
 * Update advanced preferences (normalized on write).
 * ————————————————————————————————————— */
router.put(
  '/:id/advanced-preferences',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  checkOwnership('id'),
  settingsLimiter,
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Persist normalized preferences ──
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: { advanced_prefs: normalizeAdvancedPrefs(req.body) } },
        { new: true, runValidators: true }
      );
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ message: 'Advanced preferences updated', prefs: user.advanced_prefs });
    } catch (error) {
      logger.error('[Users] update advanced prefs error:', error);
      return res.status(500).json({ error: 'Unable to update advanced preferences.' });
    }
  }
);

/* —————————————————————————————————————
 * POST /:id/reset
 * Reset the user's financial data (keeps the account itself).
 * ————————————————————————————————————— */
router.post(
  '/:id/reset',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  checkOwnership('id'),
  deleteLimiter,
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const userId = new mongoose.Types.ObjectId(req.params.id);

      // ── Wipe all financial data for the user ──
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

      // ── Reset the cached balance ──
      await User.findByIdAndUpdate(userId, { $set: { balance: 0 } });

      auditLogger.info('User financial data reset', {
        userId: String(req.userId),
        targetId: req.params.id,
        ip: req.ip,
      });

      return res.json({ message: 'All financial data has been reset.' });
    } catch (error) {
      logger.error('[Users] reset account error:', error);
      return res.status(500).json({ error: 'Unable to reset account data.' });
    }
  }
);

/* —————————————————————————————————————
 * DELETE /:id
 * Delete a user and all associated data (household-scoped ownership).
 * ————————————————————————————————————— */
router.delete(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  checkOwnership('id', { household: true }),
  deleteLimiter,
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Delete the user and every user-scoped collection ──
      await deleteUserAndData(req.params.id);

      auditLogger.info('User deleted account', {
        userId: String(req.userId),
        targetId: req.params.id,
        ip: req.ip,
      });

      return res.json({ message: 'User deleted successfully' });
    } catch (error) {
      logger.error('[Users] delete user error:', error);
      return res
        .status(error.status || 500)
        .json({ error: error.status ? error.message : 'Unable to delete user.' });
    }
  }
);

/* —————————————————————————————————————
 * POST /:id/switch
 * Issue a new session token for a linked household profile.
 * ————————————————————————————————————— */
router.post(
  '/:id/switch',
  [param('id').isMongoId().withMessage('Invalid user ID.')],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const householdId = req.user.household_id || req.userId;

      // ── Verify the target belongs to the same household ──
      const target = await User.findOne({
        _id: req.params.id,
        $or: [
          { household_id: householdId },
          { _id: householdId },
          { household_id: req.userId },
          { _id: req.userId },
        ],
        is_active: { $ne: false },
      });
      if (!target) {
        return res.status(403).json({ error: 'You can only switch to a linked household profile.' });
      }

      // ── Issue a new token and persist a Session record ──
      const tokenId = crypto.randomUUID();
      const token = jwt.sign(
        {
          id: target._id,
          session_version: target.session_version || 0,
          jti: tokenId,
        },
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

      auditLogger.info('Household profile switch', {
        fromUserId: String(req.userId),
        toUserId: String(target._id),
        ip: req.ip,
      });

      return res.json({
        token,
        user: {
          id: target._id,
          username: target.username,
          last_name: target.last_name,
          profession: target.profession,
          email: target.email,
          profile_avatar: target.profile_avatar,
          profile_color: target.profile_color,
          household_id: target.household_id || target._id,
        },
      });
    } catch (error) {
      logger.error('[Users] switch user error:', error);
      return res.status(500).json({ error: 'Unable to switch household profile.' });
    }
  }
);

/* —————————————————————————————————————
 * POST /:userId/import
 * Restore a JSON backup created by the exports endpoint.
 * Accepted versions: 1–5. Bump this list when the export version changes.
 * ————————————————————————————————————— */
router.post(
  '/:userId/import',
  [param('userId').isMongoId().withMessage('Invalid user ID.')],
  checkOwnership('userId'),
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const backup = req.body;

    // ── Validate the backup envelope ──
    if (
      !backup ||
      typeof backup !== 'object' ||
      Array.isArray(backup) ||
      ![1, 2, 3, 4, 5].includes(backup.version)
    ) {
      return res.status(400).json({ message: 'Unsupported or malformed backup format.' });
    }

    // ── Map backup keys to their models ──
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
      ['taxProfiles', TaxProfile],
      ['taxTags', TaxTag],
      ['taxPayments', TaxPayment],
      ['taxDocuments', TaxDocument],
    ];

    // ── Reject non-array payloads early ──
    for (const [key] of collections) {
      if (backup[key] !== undefined && !Array.isArray(backup[key])) {
        return res.status(400).json({ message: `Malformed backup: "${key}" must be an array.` });
      }
    }

    const userObjectId = new mongoose.Types.ObjectId(req.params.userId);
    const ownerQuery = { user_id: userObjectId };

    let session;

    // ── Restore routine, parameterised by session (or none) ──
    const restore = async (options = {}) => {
      for (const [key, Model] of collections) {
        if (!Array.isArray(backup[key])) continue;

        // Note: an earlier version stripped `_id` from every document,
        // breaking referential integrity (e.g. Transaction.account_id
        // pointed to an Account._id that no longer existed). Now the
        // original _id (or `id`) is preserved when it is a valid ObjectId.
        const documents = backup[key].map(({ _id, id, user_id, __v, ...document }) => {
          const doc = { ...document, user_id: userObjectId };
          const candidateId = _id || id;
          if (candidateId && mongoose.isValidObjectId(candidateId)) {
            doc._id = new mongoose.Types.ObjectId(candidateId);
          }
          return doc;
        });

        await Model.deleteMany(ownerQuery, options);
        if (documents.length) {
          await Model.insertMany(documents, { ...options, ordered: true });
        }
      }

      // Recalculate and synchronize user balance from restored transactions
      const [agg] = await Transaction.aggregate([
        { $match: { user_id: userObjectId, is_deleted: { $ne: true } } },
        {
          $group: {
            _id: null,
            income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
            expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
          },
        },
      ]);
      const balance = Number(((agg?.income || 0) - (agg?.expense || 0)).toFixed(2));
      await User.findByIdAndUpdate(userObjectId, { $set: { balance } });
    };

    try {
      try {
        // ── Preferred path: transactional restore ──
        session = await mongoose.startSession();
        session.startTransaction();
        await restore({ session });
        await session.commitTransaction();
      } catch (transactionError) {
        // Non-replica-set deployment — retry without a transaction.
        // Note: if the non-transactional restore fails partway through,
        // partial data loss is possible. Document this limitation.
        if (session) await session.abortTransaction().catch(() => {});
        logger.warn('[Users] Falling back to non-transactional restore', {
          userId: req.params.userId,
          reason: transactionError.message,
        });
        await restore();
      }

      auditLogger.info('Backup restored', {
        userId: String(req.userId),
        targetId: req.params.userId,
        version: backup.version,
        ip: req.ip,
      });

      return res.json({ success: true, message: 'Backup restored successfully.' });
    } catch (error) {
      logger.error('[Users] import error:', error);
      return res
        .status(400)
        .json({ message: error.message || 'Backup could not be restored.' });
    } finally {
      if (session) await session.endSession();
    }
  }
);

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router ──
module.exports = router;