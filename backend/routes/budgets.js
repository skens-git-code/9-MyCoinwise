/**
 * budgets.js — Budget management routes
 *
 * Endpoints:
 *   GET    /api/budgets/:userId   List budgets with progress + rollover
 *   POST   /api/budgets           Create a budget
 *   PUT    /api/budgets/:id       Update a budget
 *   DELETE /api/budgets/:id       Delete a budget
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
 */

const express = require('express');
const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const checkOwnership = require('../middleware/ownership');
const { logger } = require('../utils/logger');

const router = express.Router();

/* ============================================================
 * Constants
 * ============================================================ */

const BUDGET_TYPES = new Set(['monthly', 'weekly', 'custom']);
const MAX_MONEY = 999_999_999.99;
const MIN_MONEY = 0.01;                       // Matches the schema's min for total_limit
const MAX_NAME_LENGTH = 100;
const DEFAULT_WARNING_THRESHOLDS = [50, 80, 100];

/* ============================================================
 * Helpers
 * ============================================================ */

/**
 * Parse a monetary value.
 * - `allowZero: false` enforces MIN_MONEY (0.01) as the lower bound.
 * - Returns null on any invalid input (empty, NaN, negative, out of range).
 */
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount)) return null;
  const floor = allowZero ? 0 : MIN_MONEY;
  if (amount < floor) return null;
  if (amount > MAX_MONEY) return null;
  return Number(amount.toFixed(2));
};

/**
 * Parse a date boundary from a `YYYY-MM-DD` string (or any ISO string).
 * `endOfDay` sets the time to 23:59:59.999.
 *
 * Note: `YYYY-MM-DD` is interpreted as a UTC-day boundary. This is
 * consistent with the frontend, which extracts the first 10 characters
 * of the ISO string when displaying these fields — so no shift occurs
 * on read-back.
 */
const parseDateBoundary = (value, endOfDay = false) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseBoolean = (value) =>
  value === true || value === 'true' || value === 1 || value === '1';

/**
 * Validate an array of warning thresholds.
 * Returns a clean number[] on success, or null on failure.
 * Matches the schema's validator (1–10 values, each in (0, 500]).
 */
const normalizeWarningThresholds = (value) => {
  if (value === undefined) return DEFAULT_WARNING_THRESHOLDS;
  if (!Array.isArray(value)) return null;
  if (value.length < 1 || value.length > 10) return null;
  const parsed = value.map((v) => Number(v));
  if (parsed.some((v) => !Number.isFinite(v) || v <= 0 || v > 500)) return null;
  return parsed;
};

/**
 * Normalize the categories array: trim names, coerce limits, drop
 * entries missing a name or with an invalid limit.
 */
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

/* ============================================================
 * Rollover computation
 * ============================================================ */

/**
 * Compute the rollover amount for a budget if its period has ended.
 * Mutates `budget.rollover_amount` in place.
 *
 * `presuppliedExpenses` — optional array of expense transactions with
 * `{ date, amount }`. When provided, rollover is computed without an
 * additional DB query. The caller is responsible for ensuring the
 * array covers at least the budget's period.
 */
const computeRollover = async (budget, presuppliedExpenses = null) => {
  if (!budget.rollover_enabled) {
    budget.rollover_amount = 0;
    return;
  }

  const now = new Date();
  const periodEnd = new Date(budget.period_end);

  if (periodEnd > now) {
    budget.rollover_amount = budget.rollover_amount || 0;
    return;
  }

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
    // Filter the pre-supplied array to this budget's period.
    const start = new Date(budget.period_start).getTime();
    const end = new Date(budget.period_end).getTime();
    expenses = expenses.filter((exp) => {
      const t = new Date(exp.date).getTime();
      return t >= start && t <= end;
    });
  }

  const totalSpent = expenses.reduce(
    (sum, exp) => sum + (Number(exp.amount) || 0),
    0
  );
  const available = Number(budget.total_limit || 0) + Number(budget.rollover_amount || 0);
  const remaining = Math.max(0, available - totalSpent);
  budget.rollover_amount = Number(remaining.toFixed(2));
};

/* ============================================================
 * Progress enrichment
 * ============================================================ */

const getBudgetProgress = (budget, expenses) => {
  const start = new Date(budget.period_start).getTime();
  const end = new Date(budget.period_end).getTime();

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

  const result = budget.toObject({ virtuals: true });
  result.total_spent = Number(totalSpent.toFixed(2));
  result.categories = (budget.categories || []).map((category) => ({
    ...(typeof category.toObject === 'function' ? category.toObject() : category),
    spent: Number(
      (categorySpent.get(String(category.name).trim().toLowerCase()) || 0).toFixed(2)
    ),
  }));

  const available = Number(budget.total_limit || 0) + Number(budget.rollover_amount || 0);

  // `remaining` and `progress_percentage` are intentionally clamped:
  //   - remaining never goes below 0
  //   - progress_percentage never exceeds 100
  // This matches the schema's virtual definitions. If your UI wants to
  // show overspending, remove the clamps here and in the schema together
  // (the frontend recomputes both from total_spent / total_limit anyway).
  result.remaining = Number(Math.max(0, available - result.total_spent).toFixed(2));
  result.progress_percentage = available > 0
    ? Math.min(100, Math.round((result.total_spent / available) * 100))
    : 0;

  return result;
};

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

/* ============================================================
 * Router-level middleware
 * ============================================================ */

// Every route on this router requires an authenticated user.
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (!req.user || (!req.user.id && !req.user._id)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = req.user.id || req.user._id;
  return next();
});

// Cache-Control on every response, including errors.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* ============================================================
 * GET /:userId — List budgets with progress and rollover
 * ============================================================ */

router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  // Defense-in-depth: reject if the requesting user's id doesn't match
  // the path param, even if checkOwnership is misconfigured.
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    const budgets = await Budget.find({ user_id: req.params.userId })
      .sort({ period_start: -1 });

    // Load all transactions in the min-max range ONCE. Pass this list
    // to computeRollover so each budget doesn't fire its own query.
    const expenses = await loadProgressData(req.params.userId, budgets);

    // Compute rollovers against the shared expense list.
    const rolloverStates = budgets.map((budget) => ({
      budget,
      original: Number(budget.rollover_amount || 0),
    }));

    await Promise.all(
      rolloverStates.map(({ budget }) => computeRollover(budget, expenses))
    );

    // Persist only budgets whose rollover value actually changed.
    await Promise.all(
      rolloverStates
        .filter(({ budget, original }) => Number(budget.rollover_amount || 0) !== original)
        .map(({ budget }) => budget.save())
    );

    const enrichedBudgets = budgets.map((budget) => getBudgetProgress(budget, expenses));

    return res.json(enrichedBudgets);
  } catch (error) {
    logger.error('Get budgets error:', error);
    return res.status(500).json({ error: 'Unable to load budgets.' });
  }
});

/* ============================================================
 * POST / — Create a budget
 * ============================================================ */

router.post('/', async (req, res) => {
  /* Original body destructuring omitting single category:
  const {
    name,
    type,
    period_start,
    period_end,
    total_limit,
    categories,
    rollover_enabled,
    warning_thresholds,
    template,
    is_active,
  } = req.body || {};
  // Issue: The frontend sends a single 'category' string, but backend only extracted 'categories' array.
  */
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

  const normalizedThresholds = normalizeWarningThresholds(warning_thresholds);
  if (normalizedThresholds === null) {
    return res.status(400).json({
      error: 'Warning thresholds must be an array of 1–10 numbers between 0 and 500.',
    });
  }

  const active = is_active === undefined ? true : parseBoolean(is_active);

  try {
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

    /* Original budget creation omitting category field:
    const budget = await Budget.create({
      user_id: req.userId,
      name: trimmedName,
      type: type || 'monthly',
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
    // Issue: Dropped single 'category' on save, causing category-filtered budgets in UI to become global.
    */
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
    if (error?.code === 11000) {
      // Duplicate-key. Could be the compound unique index on
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

/* ============================================================
 * PUT /:id — Update a budget
 * ============================================================ */

router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid budget ID.' });
  }

  try {
    const budget = await Budget.findOne({
      _id: req.params.id,
      user_id: req.userId,
    });
    if (!budget) return res.status(404).json({ error: 'Budget not found.' });

    /* Original PUT destructuring without category:
    const {
      name,
      type,
      total_limit,
      period_start,
      period_end,
      categories,
      rollover_enabled,
      warning_thresholds,
      is_active,
      auto_renew,
    } = req.body || {};
    // Issue: Category was not extracted or updated in PUT handler.
    */
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

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ error: 'Budget name is invalid.' });
      }
      budget.name = trimmedName;
    }

    if (type !== undefined) {
      if (!BUDGET_TYPES.has(type)) {
        return res.status(400).json({ error: 'Budget type is invalid.' });
      }
      budget.type = type;
    }

    if (total_limit !== undefined) {
      const limitNum = parseMoney(total_limit, { allowZero: false });
      if (limitNum === null) {
        return res.status(400).json({
          error: `Total limit must be at least ${MIN_MONEY} and at most ${MAX_MONEY}.`,
        });
      }
      budget.total_limit = limitNum;
    }

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

    if (rollover_enabled !== undefined) {
      budget.rollover_enabled = parseBoolean(rollover_enabled);
      if (!budget.rollover_enabled) {
        budget.rollover_amount = 0;
      }
    }

    if (warning_thresholds !== undefined) {
      const normalized = normalizeWarningThresholds(warning_thresholds);
      if (normalized === null) {
        return res.status(400).json({
          error: 'Warning thresholds must be an array of 1–10 numbers between 0 and 500.',
        });
      }
      budget.warning_thresholds = normalized;
    }

    if (is_active !== undefined) budget.is_active = parseBoolean(is_active);
    if (auto_renew !== undefined) budget.auto_renew = parseBoolean(auto_renew);

    /* Original categories update without category:
    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        return res.status(400).json({ error: 'Categories must be an array.' });
      }
      budget.categories = normalizeCategories(categories);
    }
    // Issue: Did not update single category string on budget update.
    */
    if (category !== undefined) {
      budget.category = category ? String(category).trim().slice(0, 80) : null;
    }

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

/* ============================================================
 * DELETE /:id — Delete a budget
 * ============================================================ */

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid budget ID.' });
  }

  try {
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

module.exports = router;