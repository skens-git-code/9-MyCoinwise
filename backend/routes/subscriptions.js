const express = require('express');
const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const checkOwnership = require('../middleware/ownership');

const router = express.Router();

const SUBSCRIPTION_CYCLES = new Set(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']);

const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : Number.EPSILON) || amount > 999999999.99) return null;
  const rounded = Math.round(amount * 100) / 100;
  return Number(rounded.toFixed(2));
};

router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    const subs = await Subscription.find({ user_id: req.params.userId }).sort({ created_at: 1 });
    res.json(subs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/', async (req, res) => {
  const { name, amount, cycle, color, icon, url, notes, payment_method, start_date, next_billing_date, trial_ends } = req.body;
  const user_id = req.user.id;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Subscription name is required.' });
  }

  const parsedAmount = parseMoney(amount, { allowZero: false });
  if (parsedAmount === null) {
    return res.status(400).json({ error: 'Amount must be a positive number with at most 2 decimals.' });
  }

  const subCycle = cycle && SUBSCRIPTION_CYCLES.has(cycle) ? cycle : 'monthly';

  try {
    const subData = {
      user_id,
      name: name.trim(),
      amount: parsedAmount,
      cycle: subCycle,
      color: color || '#10b981',
      icon: icon || '📱'
    };

    if (url) subData.url = String(url).trim();
    if (notes) subData.notes = String(notes).trim();
    if (payment_method) subData.payment_method = payment_method;
    if (start_date && !isNaN(new Date(start_date).getTime())) subData.start_date = new Date(start_date);
    if (next_billing_date && !isNaN(new Date(next_billing_date).getTime())) subData.next_billing_date = new Date(next_billing_date);
    if (trial_ends && !isNaN(new Date(trial_ends).getTime())) subData.trial_ends = new Date(trial_ends);

    const sub = await Subscription.create(subData);
    res.status(201).json({ id: sub._id, message: 'Subscription created', sub });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    if (sub.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    if (req.body.name !== undefined) {
      if (!req.body.name || typeof req.body.name !== 'string' || !req.body.name.trim()) {
        return res.status(400).json({ error: 'Subscription name cannot be empty.' });
      }
      sub.name = req.body.name.trim();
    }

    if (req.body.amount !== undefined) {
      const parsedAmount = parseMoney(req.body.amount, { allowZero: false });
      if (parsedAmount === null) return res.status(400).json({ error: 'Amount must be positive.' });
      sub.amount = parsedAmount;
    }

    if (req.body.cycle !== undefined) {
      if (!SUBSCRIPTION_CYCLES.has(req.body.cycle)) {
        return res.status(400).json({ error: 'Invalid subscription billing cycle.' });
      }
      sub.cycle = req.body.cycle;
    }

    const optionalFields = ['color', 'icon', 'url', 'notes', 'payment_method', 'is_active', 'is_paused', 'cancelled_at'];
    optionalFields.forEach(f => {
      if (req.body[f] !== undefined) sub[f] = req.body[f];
    });

    if (req.body.start_date !== undefined) sub.start_date = req.body.start_date ? new Date(req.body.start_date) : null;
    if (req.body.next_billing_date !== undefined) sub.next_billing_date = req.body.next_billing_date ? new Date(req.body.next_billing_date) : null;
    if (req.body.trial_ends !== undefined) sub.trial_ends = req.body.trial_ends ? new Date(req.body.trial_ends) : null;

    await sub.save();
    res.json({ message: 'Subscription updated', sub });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/:id', async (req, res) => {
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

module.exports = router;
