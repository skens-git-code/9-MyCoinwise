/* —————————————————————————————————————
 * Account Routes
 * CRUD endpoints for user financial accounts.
 *
 * Response shapes (kept as-is for the client contract):
 *   GET    → bare array
 *   POST   → { account, message }
 *   PUT    → { account, message }
 *   DELETE → { message }
 *
 * Access control:
 *   - Every request must be authenticated (req.user set upstream).
 *   - Ownership is verified via checkOwnership on GET /:userId and
 *     by scoping every query to req.userId on the other routes.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const mongoose = require('mongoose');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const checkOwnership = require('../middleware/ownership');
const { logger } = require('../utils/logger');

// ── Create router ──
const router = express.Router();

/* —————————————————————————————————————
 * Constants
 * ————————————————————————————————————— */

// ── Length / range limits ──
const MAX_BALANCE = 999_999_999.99;
const MAX_NAME_LENGTH = 100;
const MAX_TYPE_LENGTH = 50;
const MAX_ICON_LENGTH = 40;

// ── Allowed values ──
const ALLOWED_ICONS = new Set(['Wallet', 'CreditCard', 'Landmark', 'Coins']);
const CANONICAL_TYPES = new Set([
  'bank', 'wallet', 'credit_card', 'investment', 'cash', 'other',
]);
const CUSTOM_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;

const CURRENCY_CODES = new Set([
  'USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SGD', 'AED',
  'CHF', 'CNY', 'MXN', 'BRL', 'KRW', 'THB',
]);

// ── Hex color pattern (3 or 6 digit) ──
const HEX_COLOR = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

/* —————————————————————————————————————
 * Helpers
 * ————————————————————————————————————— */

// ── Escape user input before building a regex ──
const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Parse and validate an account balance (returns null if invalid) ──
const parseAccountBalance = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount)) return null;
  if (Math.abs(amount) > MAX_BALANCE) return null;
  return Number(amount.toFixed(2));
};

// ── Coerce common truthy representations into a boolean ──
const parseBoolean = (value) =>
  value === true || value === 'true' || value === 1 || value === '1';

// ── Validate account fields; returns an error string or null ──
const validateAccountFields = ({ name, type, currency, color, icon } = {}) => {
  if (name !== undefined) {
    if (typeof name !== 'string') return 'Account name must be a string.';
    const trimmed = name.trim();
    if (!trimmed) return 'Account name is required.';
    if (trimmed.length > MAX_NAME_LENGTH) {
      return `Account name must be ${MAX_NAME_LENGTH} characters or fewer.`;
    }
  }
  if (type !== undefined) {
    if (typeof type !== 'string') return 'Account type must be a string.';
    const normalized = type.trim().toLowerCase();
    if (!normalized) return 'Account type cannot be empty.';
    if (normalized.length > MAX_TYPE_LENGTH) return 'Account type is too long.';
    if (!CANONICAL_TYPES.has(normalized) && !CUSTOM_TYPE_PATTERN.test(normalized)) {
      return 'Account type is invalid.';
    }
  }
  if (currency !== undefined) {
    const code = String(currency).trim().toUpperCase();
    if (!CURRENCY_CODES.has(code)) return 'Currency is invalid.';
  }
  if (color !== undefined) {
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
      return 'Color must be a valid hex color.';
    }
  }
  if (icon !== undefined) {
    if (typeof icon !== 'string') return 'Icon must be a string.';
    if (icon.length > MAX_ICON_LENGTH) return 'Icon is too long.';
    if (!ALLOWED_ICONS.has(icon)) return 'Icon is invalid.';
  }
  return null;
};

// ── Normalize account type to lowercase ──
const normalizeType = (type) => {
  if (type === undefined) return undefined;
  return type.trim().toLowerCase();
};

// ── Safely convert a value into an ObjectId (null if invalid) ──
const toObjectId = (value) => {
  if (!value || !mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

// ── Convert Mongo errors (e.g. duplicates) into HTTP responses ──
const handleMongoError = (error, res, fallbackMessage) => {
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      error: `An account with this ${field} already exists.`,
    });
  }
  logger.error(fallbackMessage, error);
  return res.status(500).json({ error: fallbackMessage });
};

/* —————————————————————————————————————
 * Router Middleware
 * ————————————————————————————————————— */

// ── Require authentication and expose req.userId ──
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (!req.user || (!req.user.id && !req.user._id)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = req.user.id || req.user._id;
  return next();
});

// ── Disable caching for all account responses ──
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* —————————————————————————————————————
 * GET /:userId
 * List all accounts for a user with transaction counts.
 * ————————————————————————————————————— */
router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  // ── Validate user ID ──
  const userId = toObjectId(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user ID.' });

  // ── Ensure the request targets the authenticated user ──
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    // ── Load accounts, active first, newest next ──
    const accounts = await Account.find({ user_id: userId })
      .sort({ is_active: -1, created_at: -1 })
      .lean();

    if (accounts.length === 0) return res.json([]);

    // ── Aggregate non-deleted transaction counts per account ──
    const accountIds = accounts.map((a) => a._id);
    const counts = await Transaction.aggregate([
      {
        $match: {
          account_id: { $in: accountIds },
          is_deleted: { $ne: true },
        },
      },
      { $group: { _id: '$account_id', count: { $sum: 1 } } },
    ]);

    // ── Merge counts into account records ──
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    const result = accounts.map((acc) => ({
      ...acc,
      transaction_count: countMap.get(String(acc._id)) || 0,
    }));

    return res.json(result);
  } catch (error) {
    logger.error('Get accounts error:', error);
    return res.status(500).json({ error: 'Unable to load accounts.' });
  }
});

/* —————————————————————————————————————
 * POST /
 * Create a new account for the authenticated user.
 * ————————————————————————————————————— */
router.post('/', async (req, res) => {
  // ── Read and validate input ──
  const { name, type, currency, initial_balance, color, icon } = req.body || {};

  const validationError = validateAccountFields({ name, type, currency, color, icon });
  if (validationError) return res.status(400).json({ error: validationError });

  // ── Parse opening balance ──
  const openingBalance = parseAccountBalance(initial_balance);
  if (openingBalance === null) {
    return res.status(400).json({
      error: 'Initial balance must be a valid amount with at most two decimal places.',
    });
  }

  try {
    // ── Reject duplicate names (case-insensitive) per user ──
    const normalizedName = name.trim();
    const duplicate = await Account.exists({
      user_id: req.userId,
      name: new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i'),
    });
    if (duplicate) {
      return res.status(409).json({ error: 'An account with this name already exists.' });
    }

    // ── Create the account ──
    const account = await Account.create({
      user_id: req.userId,
      name: normalizedName,
      type: normalizeType(type) || 'bank',
      currency: String(currency || 'USD').trim().toUpperCase(),
      initial_balance: openingBalance,
      current_balance: openingBalance,
      color: color || '#3b82f6',
      icon: icon || 'Wallet',
      is_active: true,
    });

    return res.status(201).json({
      account: { ...account.toObject(), transaction_count: 0 },
      message: 'Account created',
    });
  } catch (error) {
    return handleMongoError(error, res, 'Unable to create account.');
  }
});

/* —————————————————————————————————————
 * PUT /:id
 * Update an existing account owned by the authenticated user.
 * ————————————————————————————————————— */
router.put('/:id', async (req, res) => {
  // ── Validate account ID ──
  const accountId = toObjectId(req.params.id);
  if (!accountId) return res.status(400).json({ error: 'Invalid account ID.' });

  // ── Validate fields that were provided ──
  const validationError = validateAccountFields(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    // ── Load the account, scoped to the authenticated user ──
    const account = await Account.findOne({ _id: accountId, user_id: req.userId });
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const { name, type, currency, is_active, color, icon } = req.body;

    // ── Update name (reject duplicates) ──
    if (name !== undefined) {
      const normalizedName = name.trim();
      const duplicate = await Account.exists({
        _id: { $ne: account._id },
        user_id: req.userId,
        name: new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i'),
      });
      if (duplicate) {
        return res.status(409).json({ error: 'An account with this name already exists.' });
      }
      account.name = normalizedName;
    }

    // ── Update type ──
    if (type !== undefined) account.type = normalizeType(type);

    // ── Update currency (only when there are no linked transactions) ──
    if (currency !== undefined) {
      const newCurrency = String(currency).trim().toUpperCase();
      if (newCurrency !== account.currency) {
        const txCount = await Transaction.countDocuments({
          account_id: account._id,
          is_deleted: { $ne: true },
        });
        if (txCount > 0) {
          return res.status(400).json({
            error: `Cannot change currency because this account has ${txCount} transaction(s).`,
          });
        }
        account.currency = newCurrency;
      }
    }

    // ── Update remaining fields ──
    if (is_active !== undefined) account.is_active = parseBoolean(is_active);
    if (color !== undefined) account.color = color;
    if (icon !== undefined) account.icon = icon;

    await account.save();

    // ── Attach fresh transaction count for the response ──
    const [countResult] = await Transaction.aggregate([
      {
        $match: { account_id: account._id, is_deleted: { $ne: true } },
      },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);

    const updated = account.toObject();
    updated.transaction_count = countResult?.count || 0;

    return res.json({ account: updated, message: 'Account updated' });
  } catch (error) {
    return handleMongoError(error, res, 'Unable to update account.');
  }
});

/* —————————————————————————————————————
 * DELETE /:id
 * Delete an account — only when it has no linked transactions.
 * ————————————————————————————————————— */
router.delete('/:id', async (req, res) => {
  // ── Validate account ID ──
  const accountId = toObjectId(req.params.id);
  if (!accountId) return res.status(400).json({ error: 'Invalid account ID.' });

  try {
    // ── Load the account, scoped to the authenticated user ──
    const account = await Account.findOne({ _id: accountId, user_id: req.userId });
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    // ── Block deletion if non-deleted transactions still reference it ──
    const txCount = await Transaction.countDocuments({
      account_id: account._id,
      is_deleted: { $ne: true },
    });
    if (txCount > 0) {
      return res.status(409).json({
        error: `Cannot delete account because it has ${txCount} transaction(s). Reassign or delete them first.`,
      });
    }

    await account.deleteOne();
    return res.json({ message: 'Account deleted' });
  } catch (error) {
    logger.error('Delete account error:', error);
    return res.status(500).json({ error: 'Unable to delete account.' });
  }
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router ──
module.exports = router;