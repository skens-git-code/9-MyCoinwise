const express = require('express');
const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const checkOwnership = require('../middleware/ownership');

const router = express.Router();
const BUDGET_TYPES = new Set(['monthly', 'weekly', 'custom']);
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : Number.EPSILON) || amount > 999999999.99) return null;
  return Number(amount.toFixed(2));
};

const parseDateBoundary = (value, endOfDay = false) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

const normalizeCategories = (categories) => (Array.isArray(categories) ? categories : []).map((category) => {
  const name = String(category?.name || '').trim();
  const limit = parseMoney(category?.limit, { allowZero: false });
  return {
    name,
    limit: limit || 0,
    color: category?.color || '#0ea5e9',
    icon: category?.icon || '🏷️'
  };
}).filter(category => category.name && category.limit > 0);

// ----- Rollover Computation -----
/**
 * Computes the rollover amount for a budget if its period has ended.
 * It calculates the remaining balance at the end of the period and carries it forward.
 * This should be called when fetching or after updating a budget.
 * The result is stored in budget.rollover_amount.
 */
const computeRollover = async (budget) => {
  if (!budget.rollover_enabled) {
    budget.rollover_amount = 0;
    return;
  }
  const now = new Date();
  const periodEnd = new Date(budget.period_end);
  // If period hasn't ended, rollover is not yet applied.
  if (periodEnd > now) {
    // Keep existing rollover_amount (if any) or set to 0.
    budget.rollover_amount = budget.rollover_amount || 0;
    return;
  }

  // Fetch transactions for this budget's period
  const expenses = await Transaction.find({
    user_id: budget.user_id,
    type: 'expense',
    is_deleted: { $ne: true },
    date: { $gte: budget.period_start, $lte: budget.period_end }
  }).lean();

  let totalSpent = 0;
  expenses.forEach(exp => {
    totalSpent += Number(exp.amount) || 0;
  });
  const available = budget.total_limit + (budget.rollover_amount || 0);
  const remaining = Math.max(0, available - totalSpent);
  budget.rollover_amount = Number(remaining.toFixed(2));
};

// ----- Progress Enrichment -----
const getBudgetProgress = (budget, expenses) => {
  const start = new Date(budget.period_start).getTime();
  const end = new Date(budget.period_end).getTime();
  const categorySpent = new Map();
  let totalSpent = 0;
  expenses.forEach((expense) => {
    const time = new Date(expense.date).getTime();
    if (time < start || time > end) return;
    const amount = Number(expense.amount) || 0;
    totalSpent += amount;
    const key = String(expense.category || '').trim().toLowerCase();
    categorySpent.set(key, (categorySpent.get(key) || 0) + amount);
  });
  const result = budget.toObject({ virtuals: true });
  result.total_spent = Number(totalSpent.toFixed(2));
  result.categories = (budget.categories || []).map((category) => ({
    ...(typeof category.toObject === 'function' ? category.toObject() : category),
    spent: Number((categorySpent.get(String(category.name).trim().toLowerCase()) || 0).toFixed(2))
  }));
  const available = Number(budget.total_limit || 0) + Number(budget.rollover_amount || 0);
  result.remaining = Number(Math.max(0, available - result.total_spent).toFixed(2));
  result.progress_percentage = available > 0 ? Math.min(100, Math.round((result.total_spent / available) * 100)) : 0;
  return result;
};

// ----- Load Transactions for Budgets -----
const loadProgressData = async (userId, budgets) => {
  if (!budgets.length) return [];
  const start = new Date(Math.min(...budgets.map(b => new Date(b.period_start).getTime())));
  const end = new Date(Math.max(...budgets.map(b => new Date(b.period_end).getTime())));
  return Transaction.find({
    user_id: userId,
    type: 'expense',
    is_deleted: { $ne: true },
    date: { $gte: start, $lte: end }
  }).select('date amount category').lean();
};

// ----- Routes -----

// GET: List budgets with progress and rollover applied
router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  try {
    const budgets = await Budget.find({ user_id: req.params.userId }).sort({ period_start: -1 });
    // Compute rollovers in parallel and only persist budgets whose rollover changed.
    const rolloverStates = budgets.map((budget) => ({
      budget,
      original: Number(budget.rollover_amount || 0),
    }));
    await Promise.all(rolloverStates.map(({ budget }) => computeRollover(budget)));
    await Promise.all(rolloverStates
      .filter(({ budget, original }) => Number(budget.rollover_amount || 0) !== original)
      .map(({ budget }) => budget.save()));
    const expenses = await loadProgressData(req.params.userId, budgets);
    const enrichedBudgets = budgets.map(budget => getBudgetProgress(budget, expenses));
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(enrichedBudgets);
  } catch (error) {
    console.error('Get budgets error:', error);
    res.status(500).json({ error: 'Unable to load budgets.' });
  }
});

// POST: Create a new budget
router.post('/', async (req, res) => {
  const { name, type, period_start, period_end, total_limit, categories, rollover_enabled, warning_thresholds, template, is_active } = req.body || {};
  const trimmedName = String(name || '').trim();
  const limitNum = parseMoney(total_limit, { allowZero: false });
  const periodStart = parseDateBoundary(period_start);
  const periodEnd = parseDateBoundary(period_end, true);

  if (!trimmedName || trimmedName.length > 100) {
    return res.status(400).json({ error: 'Budget name is required and must be 100 characters or fewer.' });
  }
  if (type !== undefined && !BUDGET_TYPES.has(type)) {
    return res.status(400).json({ error: 'Budget type is invalid.' });
  }
  if (limitNum === null) {
    return res.status(400).json({ error: 'Total limit must be a positive number.' });
  }
  if (!periodStart || !periodEnd || periodEnd < periodStart) {
    return res.status(400).json({ error: 'Budget period dates are invalid.' });
  }

  // Optional: Check for overlapping active budgets
  const active = is_active === undefined ? true : parseBoolean(is_active);
  if (active) {
    const overlap = await Budget.findOne({
      user_id: req.user.id,
      is_active: true,
      period_start: { $lte: periodEnd },
      period_end: { $gte: periodStart },
    }).select('_id').lean();
    if (overlap) return res.status(409).json({ error: 'An active budget already exists for this period.' });
  }

  try {
    const budget = await Budget.create({
      user_id: req.user.id,
      name: trimmedName,
      type: type || 'monthly',
      period_start: periodStart,
      period_end: periodEnd,
      total_limit: limitNum,
      rollover_enabled: parseBoolean(rollover_enabled),
      rollover_amount: 0, // initial
      warning_thresholds: Array.isArray(warning_thresholds) ? warning_thresholds : [50, 80, 100],
      template: template || null,
      categories: normalizeCategories(categories),
      is_active: active,
    });
    res.status(201).json({ id: budget._id, message: 'Budget created', budget });
  } catch (error) {
    console.error('Create budget error:', error);
    res.status(500).json({ error: 'Unable to create budget.' });
  }
});

// PUT: Update a budget
router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid budget ID.' });
  }
  try {
    const budget = await Budget.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!budget) return res.status(404).json({ error: 'Budget not found.' });

    const { name, type, total_limit, period_start, period_end, categories, rollover_enabled, warning_thresholds, is_active, auto_renew } = req.body || {};

    // Update fields
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName || trimmedName.length > 100) {
        return res.status(400).json({ error: 'Budget name is invalid.' });
      }
      budget.name = trimmedName;
    }
    if (type !== undefined) {
      if (!BUDGET_TYPES.has(type)) return res.status(400).json({ error: 'Budget type is invalid.' });
      budget.type = type;
    }
    if (total_limit !== undefined) {
      const limitNum = parseMoney(total_limit, { allowZero: false });
      if (limitNum === null) return res.status(400).json({ error: 'Total limit must be a positive number.' });
      budget.total_limit = limitNum;
    }
    if (period_start !== undefined || period_end !== undefined) {
      const nextStart = period_start === undefined ? budget.period_start : parseDateBoundary(period_start);
      const nextEnd = period_end === undefined ? budget.period_end : parseDateBoundary(period_end, true);
      if (!nextStart || !nextEnd || nextEnd < nextStart) {
        return res.status(400).json({ error: 'Budget period dates are invalid.' });
      }
      // Optionally check overlap with other active budgets (excluding self)
      const overlap = await Budget.findOne({
        _id: { $ne: budget._id },
        user_id: req.user.id,
        is_active: true,
        $or: [
          { period_start: { $lte: nextEnd }, period_end: { $gte: nextStart } }
        ]
      });
      if (overlap) {
        return res.status(409).json({ error: 'Another active budget overlaps with this period.' });
      }
      budget.period_start = nextStart;
      budget.period_end = nextEnd;
    }
    if (rollover_enabled !== undefined) {
      budget.rollover_enabled = parseBoolean(rollover_enabled);
      if (!budget.rollover_enabled) {
        budget.rollover_amount = 0;
      }
    }
    if (warning_thresholds !== undefined) {
      if (!Array.isArray(warning_thresholds) || warning_thresholds.some(value => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
        return res.status(400).json({ error: 'Warning thresholds must be percentages from 0 to 100.' });
      }
      budget.warning_thresholds = warning_thresholds.map(Number);
    }
    if (is_active !== undefined) budget.is_active = parseBoolean(is_active);
    if (auto_renew !== undefined) budget.auto_renew = parseBoolean(auto_renew);
    if (categories !== undefined) {
      if (!Array.isArray(categories)) return res.status(400).json({ error: 'Categories must be an array.' });
      budget.categories = normalizeCategories(categories);
    }

    // Re‑compute rollover if period changed or rollover_enabled toggled
    await computeRollover(budget);

    await budget.save();
    res.json({ message: 'Budget updated', budget });
  } catch (error) {
    console.error('Update budget error:', error);
    res.status(500).json({ error: 'Unable to update budget.' });
  }
});

// DELETE: Delete a budget
router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid budget ID.' });
  }
  try {
    const deleted = await Budget.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
    if (!deleted) return res.status(404).json({ error: 'Budget not found.' });
    res.json({ message: 'Budget deleted' });
  } catch (error) {
    console.error('Delete budget error:', error);
    res.status(500).json({ error: 'Unable to delete budget.' });
  }
});

module.exports = router;
