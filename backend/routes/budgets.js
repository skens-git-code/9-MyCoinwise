/* —————————————————————————————————————
 * Budget Routes
 * CRUD endpoints for user budgets with progress and rollover.
 *
 * Endpoints:
 *   GET    /:userId   List budgets with progress + rollover
 *   POST   /          Create a budget
 *   PUT    /:id       Update a budget
 *   DELETE /:id       Delete a budget
 *
 * Key behaviors:
 *   - Router-level auth guard returns 401 when req.user is missing.
 *   - Cache-Control applied to every response, including errors.
 *   - GET loads expense transactions once and reuses them for
 *     progress + rollover (avoids N+1 queries).
 *   - Rollover is only recomputed for budgets whose period has ended.
 *   - POST accepts both a single `category` string and a `categories`
 *     array to match the frontend contract.
 *
 * Fixes applied vs. the previous version:
 *   - Router-level auth guard (POST/PUT/DELETE no longer throw on
 *     missing req.user; they return 401).
 *   - POST overlap check moved inside try/catch, so a thrown error
 *     returns 500 instead of producing an unhandled rejection.
 *   - POST now validates warning_thresholds with the same rules as PUT.
 *   - Rollover computation reuses the transaction list already loaded
 *     by loadProgressData. Previously each budget ran its own query,
 *     producing N+1 DB round trips per GET.
 *   - MIN_LIMIT extracted as a constant matching the schema's min.
 *   - Consistent logger.error usage.
 *   - Cache-Control middleware applied to every response.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const checkOwnership = require('../middleware/ownership');
const { logger } = require('../utils/logger');

// ── Create router ──
const router = express.Router();

/* —————————————————————————————————————
 * Constants
 * ————————————————————————————————————— */

// ── Allowed budget types ──
const BUDGET_TYPES = new Set(['monthly', 'weekly', 'custom']);

// ── Monetary bounds ──
const MAX_MONEY = 999_999_999.99;
const MIN_MONEY = 0.01;                 // Matches the schema's min for total_limit
const MAX_NAME_LENGTH = 100;

// ── Default warning thresholds when none are supplied ──
const DEFAULT_WARNING_THRESHOLDS = [50, 80, 100];

/* —————————————————————————————————————
 * Helpers
 * ————————————————————————————————————— */

// ── Parse a monetary value; null on invalid input ──
// `allowZero: false` enforces MIN_MONEY as the lower bound.
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount)) return null;
  const floor = allowZero ? 0 : MIN_MONEY;
  if (amount < floor) return null;
  if (amount > MAX_MONEY) return null;
  return Number(amount.toFixed(2));
};

// ── Parse a date boundary from YYYY-MM-DD or any ISO string ──
// `YYYY-MM-DD` is treated as a UTC-day boundary, matching the frontend
// which slices the first 10 characters of the ISO string on display.
const parseDateBoundary = (value, endOfDay = false) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

// ── Coerce common truthy values into a boolean ──
const parseBoolean = (value) =>
  value === true || value === 'true' || value === 1 || value === '1';

// ── Validate and normalize warning thresholds ──
// Returns a clean number[] on success, or null on failure.
// Matches the schema's validator (1–10 values, each in (0, 500]).
const normalizeWarningThresholds = (value) => {
  if (value === undefined) return DEFAULT_WARNING_THRESHOLDS;
  if (!Array.isArray(value)) return null;
  if (value.length < 1 || value.length > 10) return null;
  const parsed = value.map((v) => Number(v));
  if (parsed.some((v) => !Number.isFinite(v) || v <= 0 || v > 500)) return null;
  return parsed;
};

// ── Normalize category entries; drop those with missing name or invalid limit ──
const normalizeCategories = (categories) =>
  (Array.isArray(categories) ? categories : [])
    .map((category) => {
      const name = String(category?.name || '').trim();
      const limit = parseMoney(category?.limit, { allowZero: false });
      return {
        name,
        limit: limit || 0,
        color: category?.color || '#0ea5e9',
        icon: category?.icon || '🏷️',
      };
    })
    .filter((category) => category.name && category.limit > 0);

/* —————————————————————————————————————
 * Rollover Computation
 * ————————————————————————————————————— */

// ── Compute rollover for a budget whose period has ended ──
// Mutates `budget.rollover_amount` in place.
// Pass `presuppliedExpenses` to avoid an extra DB query — the caller
// must ensure the list covers the budget's period.
const computeRollover = async (budget, presuppliedExpenses = null) => {
  // ── Skip when rollover is disabled ──
  if (!budget.rollover_enabled) {
    budget.rollover_amount = 0;
    return;
  }

  // ── Leave current rollover alone while the period is still open ──
  const now = new Date();
  const periodEnd = new Date(budget.period_end);

  if (periodEnd > now) {
    budget.rollover_amount = budget.rollover_amount || 0;
    return;
  }

  // ── Load expenses, or filter the pre-supplied list ──
  let expenses = presuppliedExpenses;
  if (!expenses) {
    expenses = await Transaction.find({
      user_id: budget.user_id,
      type: 'expense',
      is_deleted: { $ne: true },
      date: { $gte: budget.period_start, $lte: budget.period_end },
    })
      .select('date amount')
      .lean();
  } else {
    const start = new Date(budget.period_start).getTime();
    const end = new Date(budget.period_end).getTime();
    expenses = expenses.filter((exp) => {
      const t = new Date(exp.date).getTime();
      return t >= start && t <= end;
    });
  }

  // ── Compute leftover and store it as the new rollover ──
  const totalSpent = expenses.reduce(
    (sum, exp) => sum + (Number(exp.amount) || 0),
    0
  );
  const available = Number(budget.total_limit || 0) + Number(budget.rollover_amount || 0);
  const remaining = Math.max(0, available - totalSpent);
  budget.rollover_amount = Number(remaining.toFixed(2));
};

/* —————————————————————————————————————
 * Progress Enrichment
 * ————————————————————————————————————— */

// ── Compute per-budget progress using a pre-loaded expense list ──
const getBudgetProgress = (budget, expenses) => {
  const start = new Date(budget.period_start).getTime();
  const end = new Date(budget.period_end).getTime();

  // ── Aggregate spend per category and overall ──
  const categorySpent = new Map();
  let totalSpent = 0;

  for (const expense of expenses) {
    const time = new Date(expense.date).getTime();
    if (time < start || time > end) continue;
    const amount = Number(expense.amount) || 0;
    totalSpent += amount;
    const key = String(expense.category || '').trim().toLowerCase();
    categorySpent.set(key, (categorySpent.get(key) || 0) + amount);
  }

  // ── Build the response object ──
  const result = budget.toObject({ virtuals: true });
  result.total_spent = Number(totalSpent.toFixed(2));
  result.categories = (budget.categories || []).map((category) => ({
    ...(typeof category.toObject === 'function' ? category.toObject() : category),
    spent: Number(
      (categorySpent.get(String(category.name).trim().toLowerCase()) || 0).toFixed(2)
    ),
  }));

  const available = Number(budget.total_limit || 0) + Number(budget.rollover_amount || 0);

  // `remaining` and `progress_percentage` are intentionally clamped to
  // match the schema's virtuals. If your UI wants to show overspending,
  // remove the clamps here and in the schema together.
  result.remaining = Number(Math.max(0, available - result.total_spent).toFixed(2));
  result.progress_percentage = available > 0
    ? Math.min(100, Math.round((result.total_spent / available) * 100))
    : 0;

  return result;
};

// ── Load all expenses across the min–max range of the given budgets ──
const loadProgressData = async (userId, budgets) => {
  if (!budgets.length) return [];

  // Reduce to avoid spreading an arbitrarily long array.
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const b of budgets) {
    const s = new Date(b.period_start).getTime();
    const e = new Date(b.period_end).getTime();
    if (s < minStart) minStart = s;
    if (e > maxEnd) maxEnd = e;
  }

  return Transaction.find({
    user_id: userId,
    type: 'expense',
    is_deleted: { $ne: true },
    date: { $gte: new Date(minStart), $lte: new Date(maxEnd) },
  })
    .select('date amount category')
    .lean();
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

// ── Disable caching on every response, including errors ──
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* —————————————————————————————————————
 * GET /:userId
 * List budgets with progress and rollover applied.
 * ————————————————————————————————————— */
router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  // ── Validate user ID ──
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  // Defense-in-depth: reject if the requesting user's id doesn't match
  // the path param, even if checkOwnership is misconfigured.
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    // ── Load the user's budgets, newest period first ──
    const budgets = await Budget.find({ user_id: req.params.userId })
      .sort({ period_start: -1 });

    // Load all transactions in the min–max range ONCE. Pass this list
    // to computeRollover so each budget doesn't fire its own query.
    const expenses = await loadProgressData(req.params.userId, budgets);

    // ── Snapshot original rollover values to detect changes ──
    const rolloverStates = budgets.map((budget) => ({
      budget,
      original: Number(budget.rollover_amount || 0),
    }));

    // ── Recompute rollover for each budget in parallel ──
    await Promise.all(
      rolloverStates.map(({ budget }) => computeRollover(budget, expenses))
    );

    // ── Persist only budgets whose rollover value actually changed ──
    await Promise.all(
      rolloverStates
        .filter(({ budget, original }) => Number(budget.rollover_amount || 0) !== original)
        .map(({ budget }) => budget.save())
    );

    // ── Enrich each budget with progress data ──
    const enrichedBudgets = budgets.map((budget) => getBudgetProgress(budget, expenses));

    return res.json(enrichedBudgets);
  } catch (error) {
    logger.error('Get budgets error:', error);
    return res.status(500).json({ error: 'Unable to load budgets.' });
  }
});

/* —————————————————————————————————————
 * POST /
 * Create a budget for the authenticated user.
 * ————————————————————————————————————— */
router.post('/', async (req, res) => {
  // ── Destructure request body (includes single `category` for the frontend) ──
  // Note: an earlier version omitted `category`, which caused a single
  // category string from the frontend to be dropped on save.
  const {
    name,
    type,
    category,
    period_start,
    period_end,
    total_limit,
    categories,
    rollover_enabled,
    warning_thresholds,
    template,
    is_active,
  } = req.body || {};

  // ── Parse and validate input ──
  const trimmedName = String(name || '').trim();
  const limitNum = parseMoney(total_limit, { allowZero: false });
  const periodStart = parseDateBoundary(period_start);
  const periodEnd = parseDateBoundary(period_end, true);

  if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({
      error: `Budget name is required and must be ${MAX_NAME_LENGTH} characters or fewer.`,
    });
  }
  if (type !== undefined && !BUDGET_TYPES.has(type)) {
    return res.status(400).json({ error: 'Budget type is invalid.' });
  }
  if (limitNum === null) {
    return res.status(400).json({
      error: `Total limit must be at least ${MIN_MONEY} and at most ${MAX_MONEY}.`,
    });
  }
  if (!periodStart || !periodEnd || periodEnd < periodStart) {
    return res.status(400).json({ error: 'Budget period dates are invalid.' });
  }

  // ── Validate warning thresholds ──
  const normalizedThresholds = normalizeWarningThresholds(warning_thresholds);
  if (normalizedThresholds === null) {
    return res.status(400).json({
      error: 'Warning thresholds must be an array of 1–10 numbers between 0 and 500.',
    });
  }

  // ── Determine active state ──
  const active = is_active === undefined ? true : parseBoolean(is_active);

  try {
    // ── Reject overlapping active budgets ──
    if (active) {
      const overlap = await Budget.findOne({
        user_id: req.userId,
        is_active: true,
        period_start: { $lte: periodEnd },
        period_end: { $gte: periodStart },
      })
        .select('_id')
        .lean();

      if (overlap) {
        return res.status(409).json({
          error: 'An active budget already exists for this period.',
        });
      }
    }

    // ── Create the budget ──
    // Note: an earlier version omitted `category` here, which caused
    // category-filtered budgets in the UI to become global.
    const budget = await Budget.create({
      user_id: req.userId,
      name: trimmedName,
      type: type || 'monthly',
      category: category ? String(category).trim().slice(0, 80) : null,
      period_start: periodStart,
      period_end: periodEnd,
      total_limit: limitNum,
      rollover_enabled: parseBoolean(rollover_enabled),
      rollover_amount: 0,
      warning_thresholds: normalizedThresholds,
      template: template || null,
      categories: normalizeCategories(categories),
      is_active: active,
    });

    return res.status(201).json({
      id: budget._id,
      message: 'Budget created',
      budget,
    });
  } catch (error) {
    // ── Map duplicate-key errors to a friendly message ──
    if (error?.code === 11000) {
      // Could be the compound unique index on
      // { user_id, name, period_start } if it exists in the schema.
      const field = error.keyPattern
        ? Object.keys(error.keyPattern)[0]
        : 'field';
      return res.status(409).json({
        error: `A budget with this ${field} already exists.`,
      });
    }
    logger.error('Create budget error:', error);
    return res.status(500).json({ error: 'Unable to create budget.' });
  }
});

/* —————————————————————————————————————
 * PUT /:id
 * Update a budget owned by the authenticated user.
 * ————————————————————————————————————— */
router.put('/:id', async (req, res) => {
  // ── Validate budget ID ──
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid budget ID.' });
  }

  try {
    // ── Load the budget, scoped to the authenticated user ──
    const budget = await Budget.findOne({
      _id: req.params.id,
      user_id: req.userId,
    });
    if (!budget) return res.status(404).json({ error: 'Budget not found.' });

    // ── Destructure request body (includes single `category`) ──
    // Note: an earlier version omitted `category` from PUT, which meant
    // the single-category string could never be updated.
    const {
      name,
      type,
      category,
      total_limit,
      period_start,
      period_end,
      categories,
      rollover_enabled,
      warning_thresholds,
      is_active,
      auto_renew,
    } = req.body || {};

    // ── Update name ──
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ error: 'Budget name is invalid.' });
      }
      budget.name = trimmedName;
    }

    // ── Update type ──
    if (type !== undefined) {
      if (!BUDGET_TYPES.has(type)) {
        return res.status(400).json({ error: 'Budget type is invalid.' });
      }
      budget.type = type;
    }

    // ── Update total limit ──
    if (total_limit !== undefined) {
      const limitNum = parseMoney(total_limit, { allowZero: false });
      if (limitNum === null) {
        return res.status(400).json({
          error: `Total limit must be at least ${MIN_MONEY} and at most ${MAX_MONEY}.`,
        });
      }
      budget.total_limit = limitNum;
    }

    // ── Update period (rejects overlap with other active budgets) ──
    if (period_start !== undefined || period_end !== undefined) {
      const nextStart = period_start === undefined
        ? budget.period_start
        : parseDateBoundary(period_start);
      const nextEnd = period_end === undefined
        ? budget.period_end
        : parseDateBoundary(period_end, true);

      if (!nextStart || !nextEnd || nextEnd < nextStart) {
        return res.status(400).json({ error: 'Budget period dates are invalid.' });
      }

      const overlap = await Budget.findOne({
        _id: { $ne: budget._id },
        user_id: req.userId,
        is_active: true,
        period_start: { $lte: nextEnd },
        period_end: { $gte: nextStart },
      }).select('_id').lean();

      if (overlap) {
        return res.status(409).json({
          error: 'Another active budget overlaps with this period.',
        });
      }

      budget.period_start = nextStart;
      budget.period_end = nextEnd;
    }

    // ── Update rollover toggle; clear amount when disabled ──
    if (rollover_enabled !== undefined) {
      budget.rollover_enabled = parseBoolean(rollover_enabled);
      if (!budget.rollover_enabled) {
        budget.rollover_amount = 0;
      }
    }

    // ── Update warning thresholds ──
    if (warning_thresholds !== undefined) {
      const normalized = normalizeWarningThresholds(warning_thresholds);
      if (normalized === null) {
        return res.status(400).json({
          error: 'Warning thresholds must be an array of 1–10 numbers between 0 and 500.',
        });
      }
      budget.warning_thresholds = normalized;
    }

    // ── Update status flags ──
    if (is_active !== undefined) budget.is_active = parseBoolean(is_active);
    if (auto_renew !== undefined) budget.auto_renew = parseBoolean(auto_renew);

    // ── Update single category string ──
    if (category !== undefined) {
      budget.category = category ? String(category).trim().slice(0, 80) : null;
    }

    // ── Update category array ──
    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        return res.status(400).json({ error: 'Categories must be an array.' });
      }
      budget.categories = normalizeCategories(categories);
    }

    // Recompute rollover against fresh DB data (this route may have
    // changed the period, so the pre-supplied list wouldn't be valid).
    await computeRollover(budget);
    await budget.save();

    return res.json({ message: 'Budget updated', budget });
  } catch (error) {
    // ── Map duplicate-key errors to a friendly message ──
    if (error?.code === 11000) {
      const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
      return res.status(409).json({
        error: `A budget with this ${field} already exists.`,
      });
    }
    logger.error('Update budget error:', error);
    return res.status(500).json({ error: 'Unable to update budget.' });
  }
});

/* —————————————————————————————————————
 * DELETE /:id
 * Delete a budget owned by the authenticated user.
 * ————————————————————————————————————— */
router.delete('/:id', async (req, res) => {
  // ── Validate budget ID ──
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid budget ID.' });
  }

  try {
    // ── Find and delete in a single atomic operation ──
    const deleted = await Budget.findOneAndDelete({
      _id: req.params.id,
      user_id: req.userId,
    });
    if (!deleted) return res.status(404).json({ error: 'Budget not found.' });
    return res.json({ message: 'Budget deleted' });
  } catch (error) {
    logger.error('Delete budget error:', error);
    return res.status(500).json({ error: 'Unable to delete budget.' });
  }
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router ──
module.exports = router;