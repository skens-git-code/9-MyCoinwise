const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const Subscription = require('../models/Subscription');
const checkOwnership = require('../middleware/ownership');

const router = express.Router();

const SUBSCRIPTION_CYCLES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
const PAYMENT_METHODS = ['credit_card', 'debit_card', 'bank_transfer', 'paypal', 'google_pay', 'apple_pay', 'cash', 'other'];

// ---------- Helpers ----------
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : Number.EPSILON) || amount > 999999999.99) return null;
  return Number(amount.toFixed(2));
};

const parseBoolean = (value) => {
  if (value === undefined || value === null) return undefined;
  return value === true || value === 'true' || value === 1 || value === '1';
};

// ---------- GET: List subscriptions (with filters) ----------
router.get(
  '/:userId',
  checkOwnership('userId'),
  [
    param('userId').isMongoId().withMessage('Invalid user ID.'),
    query('active').optional().isBoolean().toBoolean(),
    query('paused').optional().isBoolean().toBoolean(),
    query('cycle').optional().isIn(SUBSCRIPTION_CYCLES),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const filter = { user_id: req.params.userId };
      if (req.query.active !== undefined) filter.is_active = req.query.active;
      if (req.query.paused !== undefined) filter.is_paused = req.query.paused;
      if (req.query.cycle) filter.cycle = req.query.cycle;

      const subscriptions = await Subscription.find(filter).sort({ created_at: 1 });
      res.json(subscriptions);
    } catch (error) {
      console.error('[Subscriptions] list error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ---------- GET: Single subscription by ID ----------
router.get(
  '/single/:id',
  checkOwnership('id', { model: Subscription, paramName: 'id' }), // custom middleware
  [
    param('id').isMongoId().withMessage('Invalid subscription ID.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const subscription = await Subscription.findOne({ _id: req.params.id, user_id: req.user.id });
      if (!subscription) return res.status(404).json({ error: 'Subscription not found.' });
      res.json(subscription);
    } catch (error) {
      console.error('[Subscriptions] get error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ---------- POST: Create a new subscription ----------
router.post(
  '/',
  [
    body('name').isString().trim().notEmpty().withMessage('Subscription name is required.'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number.'),
    body('cycle').optional().isIn(SUBSCRIPTION_CYCLES).withMessage('Invalid billing cycle.'),
    body('color').optional().isString().trim().matches(/^#[0-9a-f]{6}$/i).withMessage('Invalid hex color.'),
    body('icon').optional().isString().trim().isLength({ max: 40 }),
    body('url').optional().isURL().withMessage('Must be a valid URL.'),
    body('notes').optional().isString().trim().isLength({ max: 500 }),
    body('payment_method').optional().isIn(PAYMENT_METHODS).withMessage('Invalid payment method.'),
    body('start_date').optional({ nullable: true }).isISO8601().toDate(),
    body('next_billing_date').optional({ nullable: true }).isISO8601().toDate(),
    body('trial_ends').optional({ nullable: true }).isISO8601().toDate(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, amount, cycle, color, icon, url, notes, payment_method, start_date, next_billing_date, trial_ends } = req.body;

    const amountNum = parseMoney(amount, { allowZero: false });
    if (amountNum === null) {
      return res.status(400).json({ error: 'Amount must be a positive number with at most 2 decimals.' });
    }

    const subData = {
      user_id: req.user.id,
      name: name.trim(),
      amount: amountNum,
      cycle: cycle || 'monthly',
      color: color || '#10b981',
      icon: icon || '📱',
      is_active: true,
      is_paused: false,
    };

    if (url) subData.url = url.trim();
    if (notes) subData.notes = notes.trim();
    if (payment_method) subData.payment_method = payment_method;
    if (start_date) subData.start_date = start_date;
    if (next_billing_date) {
      if (start_date && next_billing_date < start_date) {
        return res.status(400).json({ error: 'Next billing date must be after the start date.' });
      }
      subData.next_billing_date = next_billing_date;
    }
    if (trial_ends) {
      if (start_date && trial_ends > start_date) {
        return res.status(400).json({ error: 'Trial end must be before the start date.' });
      }
      subData.trial_ends = trial_ends;
    }

    try {
      const sub = await Subscription.create(subData);
      res.status(201).json({ id: sub._id, message: 'Subscription created', sub });
    } catch (error) {
      console.error('[Subscriptions] create error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ---------- PUT: Update a subscription ----------
router.put(
  '/:id',
  checkOwnership('id', { model: Subscription, paramName: 'id' }),
  [
    param('id').isMongoId().withMessage('Invalid subscription ID.'),
    body('name').optional().isString().trim().notEmpty(),
    body('amount').optional().isFloat({ min: 0.01 }).toFloat(),
    body('cycle').optional().isIn(SUBSCRIPTION_CYCLES),
    body('color').optional().isString().trim().matches(/^#[0-9a-f]{6}$/i),
    body('icon').optional().isString().trim().isLength({ max: 40 }),
    body('url').optional().isURL(),
    body('notes').optional().isString().trim().isLength({ max: 500 }),
    body('payment_method').optional().isIn(PAYMENT_METHODS),
    body('start_date').optional({ nullable: true }).isISO8601().toDate(),
    body('next_billing_date').optional({ nullable: true }).isISO8601().toDate(),
    body('trial_ends').optional({ nullable: true }).isISO8601().toDate(),
    body('is_active').optional().isBoolean().toBoolean(),
    body('is_paused').optional().isBoolean().toBoolean(),
    body('cancelled_at').optional({ nullable: true }).isISO8601().toDate(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const subscription = await Subscription.findOne({ _id: req.params.id, user_id: req.user.id });
      if (!subscription) return res.status(404).json({ error: 'Subscription not found.' });

      const {
        name, amount, cycle, color, icon, url, notes, payment_method,
        start_date, next_billing_date, trial_ends,
        is_active, is_paused, cancelled_at,
      } = req.body;

      // Update fields
      if (name !== undefined) subscription.name = name.trim();
      if (amount !== undefined) {
        const amountNum = parseMoney(amount, { allowZero: false });
        if (amountNum === null) return res.status(400).json({ error: 'Amount must be positive.' });
        subscription.amount = amountNum;
      }
      if (cycle !== undefined) subscription.cycle = cycle;
      if (color !== undefined) subscription.color = color;
      if (icon !== undefined) subscription.icon = icon;
      if (url !== undefined) subscription.url = url ? url.trim() : null;
      if (notes !== undefined) subscription.notes = notes ? notes.trim() : '';
      if (payment_method !== undefined) subscription.payment_method = payment_method;
      if (start_date !== undefined) subscription.start_date = start_date || null;
      if (next_billing_date !== undefined) {
        if (next_billing_date && subscription.start_date && next_billing_date < subscription.start_date) {
          return res.status(400).json({ error: 'Next billing date must be after the start date.' });
        }
        subscription.next_billing_date = next_billing_date || null;
      }
      if (trial_ends !== undefined) {
        if (trial_ends && subscription.start_date && trial_ends > subscription.start_date) {
          return res.status(400).json({ error: 'Trial end must be before the start date.' });
        }
        subscription.trial_ends = trial_ends || null;
      }
      if (is_active !== undefined) subscription.is_active = parseBoolean(is_active);
      if (is_paused !== undefined) subscription.is_paused = parseBoolean(is_paused);
      if (cancelled_at !== undefined) {
        if (cancelled_at && !isNaN(new Date(cancelled_at).getTime())) {
          subscription.cancelled_at = new Date(cancelled_at);
        } else {
          subscription.cancelled_at = null;
        }
      }

      await subscription.save();
      res.json({ message: 'Subscription updated', subscription });
    } catch (error) {
      console.error('[Subscriptions] update error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ---------- DELETE: Remove a subscription ----------
router.delete(
  '/:id',
  checkOwnership('id', { model: Subscription, paramName: 'id' }),
  [
    param('id').isMongoId().withMessage('Invalid subscription ID.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const subscription = await Subscription.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
      if (!subscription) return res.status(404).json({ error: 'Subscription not found.' });
      res.json({ message: 'Subscription deleted' });
    } catch (error) {
      console.error('[Subscriptions] delete error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

module.exports = router;