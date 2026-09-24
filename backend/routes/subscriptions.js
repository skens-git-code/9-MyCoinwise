/* —————————————————————————————————————
 * Subscription Routes
 * CRUD endpoints for user subscriptions with filters.
 *
 * Endpoints:
 *   GET    /:userId           List subscriptions (with filters)
 *   GET    /single/:id        Single subscription by ID
 *   POST   /                  Create a subscription
 *   PUT    /:id               Update a subscription
 *   DELETE /:id               Delete a subscription
 *
 * Changes vs. the original:
 *   - Duplicate name check on POST (matches accounts.js).
 *   - URL protocol restricted to http/https (isURL() alone accepts
 *     javascript: and data: URLs).
 *   - Invalid `cancelled_at` now returns 400 instead of silently
 *     nulling the field.
 *   - `next_billing_date` / `trial_ends` validation now checks against
 *     the effective start date on the doc (previously only checked if
 *     `start_date` was already set).
 *   - `logger.error` replaces console.error.
 *   - Cache-Control middleware on every response.
 *   - 11000 duplicate-key handler for future unique indexes.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const Subscription = require('../models/Subscription');
const checkOwnership = require('../middleware/ownership');
const { logger } = require('../utils/logger');

// ── Create router ──
const router = express.Router();

/* —————————————————————————————————————
 * Constants
 * ————————————————————————————————————— */

// ── Allowed billing cycles ──
const SUBSCRIPTION_CYCLES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

// ── Allowed payment methods ──
// Note: an earlier version omitted 'card', 'upi', and 'wallet', which are
// used by models/Subscription.js and the frontend, causing 400 responses
// on otherwise valid client requests.
const PAYMENT_METHODS = [
  'card', 'bank_transfer', 'wallet', 'upi', 'other',
  'credit_card', 'debit_card', 'paypal', 'google_pay', 'apple_pay', 'cash',
];

// ── Normalize incoming payment methods to the schema enum ──
// Maps aliases like 'credit_card' / 'apple_pay' → 'card', etc.
const normalizePaymentMethod = (pm) => {
  if (!pm) return 'card';
  const val = String(pm).trim().toLowerCase();
  if (['card', 'credit_card', 'debit_card', 'apple_pay', 'google_pay'].includes(val)) return 'card';
  if (val === 'bank_transfer') return 'bank_transfer';
  if (['wallet', 'paypal'].includes(val)) return 'wallet';
  if (val === 'upi') return 'upi';
  return 'other';
};

// ── Field length and numeric limits ──
const MAX_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 500;
const MAX_ICON_LENGTH = 40;
const MAX_MONEY = 999_999_999.99;

// ── Hex color pattern ──
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/* —————————————————————————————————————
 * Helpers
 * ————————————————————————————————————— */

// ── Parse a monetary amount; null on invalid input ──
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount)) return null;
  const floor = allowZero ? 0 : 0.01;
  if (amount < floor || amount > MAX_MONEY) return null;
  return Number(amount.toFixed(2));
};

// ── Coerce common truthy values into a boolean ──
const parseBoolean = (value) => {
  if (value === undefined || value === null) return undefined;
  return value === true || value === 'true' || value === 1 || value === '1';
};

// ── Escape user input before building a RegExp ──
const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Only allow http/https URLs ──
// `isURL()` alone accepts `javascript:`, `data:`, and `file:` schemes.
const isSafeUrl = (value) => {
  if (!value) return true;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/* —————————————————————————————————————
 * Router Middleware
 * ————————————————————————————————————— */

// ── Disable caching on every response ──
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* —————————————————————————————————————
 * GET /:userId
 * List subscriptions for a user, with optional filters:
 *   - active, paused, cycle
 * ————————————————————————————————————— */
router.get(
  '/:userId',
  checkOwnership('userId'),
  [
    // ── Validate user ID and optional filters ──
    param('userId').isMongoId().withMessage('Invalid user ID.'),
    query('active').optional().isBoolean().toBoolean(),
    query('paused').optional().isBoolean().toBoolean(),
    query('cycle').optional().isIn(SUBSCRIPTION_CYCLES),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Build the filter from optional query params ──
      const filter = { user_id: req.params.userId };
      if (req.query.active !== undefined) filter.is_active = req.query.active;
      if (req.query.paused !== undefined) filter.is_paused = req.query.paused;
      if (req.query.cycle) filter.cycle = req.query.cycle;

      // ── Load subscriptions, oldest first ──
      const subscriptions = await Subscription.find(filter).sort({ created_at: 1 });
      return res.json(subscriptions);
    } catch (error) {
      logger.error('[Subscriptions] list error:', error);
      return res.status(500).json({ error: 'Unable to load subscriptions.' });
    }
  }
);

/* —————————————————————————————————————
 * GET /single/:id
 * Fetch a single subscription by ID, scoped to the authenticated user.
 * ————————————————————————————————————— */
router.get(
  '/single/:id',
  checkOwnership('id', { model: Subscription, paramName: 'id' }),
  [param('id').isMongoId().withMessage('Invalid subscription ID.')],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Load the subscription, scoped to the authenticated user ──
      const subscription = await Subscription.findOne({
        _id: req.params.id,
        user_id: req.user.id,
      });
      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found.' });
      }
      return res.json(subscription);
    } catch (error) {
      logger.error('[Subscriptions] get error:', error);
      return res.status(500).json({ error: 'Unable to load subscription.' });
    }
  }
);

/* —————————————————————————————————————
 * POST /
 * Create a new subscription for the authenticated user.
 * ————————————————————————————————————— */
router.post(
  '/',
  [
    // ── Validate request body ──
    body('name')
      .isString().trim().notEmpty()
      .isLength({ max: MAX_NAME_LENGTH })
      .withMessage('Subscription name is required.'),
    body('amount').isFloat({ min: 0.01 })
      .withMessage('Amount must be a positive number.'),
    body('cycle').optional().isIn(SUBSCRIPTION_CYCLES),
    body('color').optional().isString().trim().matches(HEX_COLOR),
    body('icon').optional().isString().trim().isLength({ max: MAX_ICON_LENGTH }),
    body('url').optional({ nullable: true, checkFalsy: true }).isURL(),
    body('notes').optional({ nullable: true, checkFalsy: true }).isString().trim()
      .isLength({ max: MAX_NOTES_LENGTH }),
    body('payment_method').optional().isIn(PAYMENT_METHODS),
    body('start_date').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
    body('next_billing_date').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
    body('trial_ends').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      name, amount, cycle, color, icon, url, notes,
      payment_method, start_date, next_billing_date, trial_ends,
    } = req.body;

    // ── Parse amount ──
    const amountNum = parseMoney(amount, { allowZero: false });
    if (amountNum === null) {
      return res.status(400).json({
        error: 'Amount must be a positive number with at most 2 decimals.',
      });
    }

    // ── Enforce http/https URL protocol ──
    if (!isSafeUrl(url)) {
      return res.status(400).json({ error: 'URL must use http or https.' });
    }

    try {
      const normalizedName = name.trim();

      // Duplicate name check (matches accounts.js pattern).
      const duplicate = await Subscription.exists({
        user_id: req.user.id,
        name: new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i'),
      });
      if (duplicate) {
        return res.status(409).json({
          error: 'A subscription with this name already exists.',
        });
      }

      // ── Assemble the subscription payload ──
      const subscriptionData = {
        user_id: req.user.id,
        name: normalizedName,
        amount: amountNum,
        cycle: cycle || 'monthly',
        color: color || '#3b82f6',
        icon: icon || '💳',
        url: url ? String(url).trim() : null,

        // Note: an earlier version defaulted to 'credit_card', which
        // violates the Subscription schema enum ['card', ...]. The
        // normalizePaymentMethod helper maps aliases into the enum.
        payment_method: normalizePaymentMethod(payment_method),

        next_billing_date: next_billing_date || null,
        trial_ends: trial_ends || null,
        is_active: true,
        is_paused: false,
      };

      // ── Persist the new subscription ──
      const subscription = await Subscription.create(subscriptionData);
      return res.status(201).json({
        id: subscription._id,
        message: 'Subscription created',
        subscription,
      });
    } catch (error) {
      // ── Map duplicate-key errors to a friendly message ──
      if (error?.code === 11000) {
        const field = error.keyPattern
          ? Object.keys(error.keyPattern)[0]
          : 'field';
        return res.status(409).json({
          error: `A subscription with this ${field} already exists.`,
        });
      }
      logger.error('[Subscriptions] create error:', error);
      return res.status(500).json({ error: 'Unable to create subscription.' });
    }
  }
);

/* —————————————————————————————————————
 * PUT /:id
 * Update a subscription owned by the authenticated user.
 * ————————————————————————————————————— */
router.put(
  '/:id',
  checkOwnership('id', { model: Subscription, paramName: 'id' }),
  [
    // ── Validate path param and optional body fields ──
    param('id').isMongoId().withMessage('Invalid subscription ID.'),
    body('name').optional().isString().trim().notEmpty()
      .isLength({ max: MAX_NAME_LENGTH }),
    body('amount').optional().isFloat({ min: 0.01 }).toFloat(),
    body('cycle').optional().isIn(SUBSCRIPTION_CYCLES),
    body('color').optional().isString().trim().matches(HEX_COLOR),
    body('icon').optional().isString().trim().isLength({ max: MAX_ICON_LENGTH }),
    body('url').optional({ nullable: true, checkFalsy: true }).isURL(),
    body('notes').optional({ nullable: true, checkFalsy: true }).isString().trim()
      .isLength({ max: MAX_NOTES_LENGTH }),
    body('payment_method').optional().isIn(PAYMENT_METHODS),
    body('start_date').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
    body('next_billing_date').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
    body('trial_ends').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
    body('is_active').optional().isBoolean().toBoolean(),
    body('is_paused').optional().isBoolean().toBoolean(),
    body('cancelled_at').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Load the subscription, scoped to the authenticated user ──
      const subscription = await Subscription.findOne({
        _id: req.params.id,
        user_id: req.user.id,
      });
      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found.' });
      }

      const {
        name, amount, cycle, color, icon, url, notes, payment_method,
        start_date, next_billing_date, trial_ends,
        is_active, is_paused, cancelled_at,
      } = req.body;

      // Duplicate name check (excluding self).
      if (name !== undefined) {
        const normalizedName = name.trim();
        const duplicate = await Subscription.exists({
          _id: { $ne: subscription._id },
          user_id: req.user.id,
          name: new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i'),
        });
        if (duplicate) {
          return res.status(409).json({
            error: 'A subscription with this name already exists.',
          });
        }
        subscription.name = normalizedName;
      }

      // ── Update amount ──
      if (amount !== undefined) {
        const amountNum = parseMoney(amount, { allowZero: false });
        if (amountNum === null) {
          return res.status(400).json({ error: 'Amount must be positive.' });
        }
        subscription.amount = amountNum;
      }

      // ── Update simple fields ──
      if (cycle !== undefined) subscription.cycle = cycle;
      if (color !== undefined) subscription.color = color;
      if (icon !== undefined) subscription.icon = icon;

      // ── Update URL (re-checked for protocol safety) ──
      if (url !== undefined) {
        if (!isSafeUrl(url)) {
          return res.status(400).json({ error: 'URL must use http or https.' });
        }
        subscription.url = url ? String(url).trim() : null;
      }

      // ── Update notes ──
      if (notes !== undefined) {
        subscription.notes = notes ? String(notes).trim().slice(0, MAX_NOTES_LENGTH) : '';
      }

      // Note: unnormalized payment_method could store values outside
      // the schema enum. normalizePaymentMethod keeps it aligned.
      if (payment_method !== undefined) subscription.payment_method = normalizePaymentMethod(payment_method);

      // ── Update start date ──
      if (start_date !== undefined) {
        subscription.start_date = start_date || null;
      }

      // Effective start date for cross-field checks — use the incoming
      // value when present, otherwise the existing one.
      const effectiveStart = start_date !== undefined
        ? start_date
        : subscription.start_date;

      // ── Update next billing date (must be on/after start) ──
      if (next_billing_date !== undefined) {
        if (next_billing_date && effectiveStart && next_billing_date < effectiveStart) {
          return res.status(400).json({
            error: 'Next billing date must be on or after the start date.',
          });
        }
        subscription.next_billing_date = next_billing_date || null;
      }

      // ── Update trial end (must be on/before start) ──
      if (trial_ends !== undefined) {
        // Trial ends on or before the paid start date. If the field is
        // cleared, accept.
        if (trial_ends && effectiveStart && trial_ends > effectiveStart) {
          return res.status(400).json({
            error: 'Trial end must be on or before the start date.',
          });
        }
        subscription.trial_ends = trial_ends || null;
      }

      // ── Update status flags ──
      if (is_active !== undefined) subscription.is_active = parseBoolean(is_active);
      if (is_paused !== undefined) subscription.is_paused = parseBoolean(is_paused);

      // ── Update cancellation date (null/empty clears it) ──
      if (cancelled_at !== undefined) {
        if (cancelled_at === null || cancelled_at === '') {
          subscription.cancelled_at = null;
        } else {
          const d = new Date(cancelled_at);
          if (Number.isNaN(d.getTime())) {
            return res.status(400).json({ error: 'Invalid cancellation date.' });
          }
          subscription.cancelled_at = d;
        }
      }

      // ── Persist changes ──
      await subscription.save();
      return res.json({ message: 'Subscription updated', subscription });
    } catch (error) {
      // ── Map duplicate-key errors to a friendly message ──
      if (error?.code === 11000) {
        const field = error.keyPattern
          ? Object.keys(error.keyPattern)[0]
          : 'field';
        return res.status(409).json({
          error: `A subscription with this ${field} already exists.`,
        });
      }
      logger.error('[Subscriptions] update error:', error);
      return res.status(500).json({ error: 'Unable to update subscription.' });
    }
  }
);

/* —————————————————————————————————————
 * DELETE /:id
 * Delete a subscription owned by the authenticated user.
 * ————————————————————————————————————— */
router.delete(
  '/:id',
  checkOwnership('id', { model: Subscription, paramName: 'id' }),
  [param('id').isMongoId().withMessage('Invalid subscription ID.')],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Find and delete in a single atomic operation ──
      const subscription = await Subscription.findOneAndDelete({
        _id: req.params.id,
        user_id: req.user.id,
      });
      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found.' });
      }
      return res.json({ message: 'Subscription deleted' });
    } catch (error) {
      logger.error('[Subscriptions] delete error:', error);
      return res.status(500).json({ error: 'Unable to delete subscription.' });
    }
  }
);

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router ──
module.exports = router;