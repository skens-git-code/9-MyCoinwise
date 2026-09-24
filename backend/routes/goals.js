/* —————————————————————————————————————
 * Savings Goals Routes
 * CRUD endpoints for user savings goals.
 *
 * Endpoints:
 *   GET    /:userId           List all goals for a user
 *   GET    /single/:id        Single goal by ID
 *   POST   /                  Create a goal
 *   PUT    /:id               Update a goal
 *   DELETE /:id               Delete a goal
 *
 * What changed from the original:
 *   - Uses the shared `logger` instead of `console.error` for consistency
 *     with the rest of the codebase.
 *   - Cache-Control header applied to every response via middleware.
 *   - Invalid `auto_save_amount` on POST now returns 400 with a clear
 *     message, instead of silently becoming null.
 *   - Duplicate-key (11000) errors on create/update return 409 with the
 *     conflicting field name.
 *
 * What was NOT changed (and why):
 *   - Route order: `/:userId` matches exactly one segment, so `/single/:id`
 *     is never shadowed — Express matches by full pattern, not prefix.
 *   - `.escape()` on the category query: harmless since categories are
 *     normalized to snake_case; keeping it does not affect real data.
 *   - `deadline: deadline || null`: Dates are always truthy in JS (even
 *     `new Date(0)`), so this guard is correct as written.
 *   - `Boolean(achieved)`: express-validator's `.toBoolean()` runs before
 *     the handler, so `achieved` is already a real boolean at this point.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Goal = require('../models/Goal');
const checkOwnership = require('../middleware/ownership');
const { logger } = require('../utils/logger');

// ── Create router ──
const router = express.Router();

/* —————————————————————————————————————
 * Helpers
 * ————————————————————————————————————— */

// ── Parse a monetary value; null on invalid input ──
// Rejects booleans, arrays, and objects that JS would coerce silently.
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount)) return null;
  if (amount < (allowZero ? 0 : Number.EPSILON) || amount > 999999999.99) return null;
  return Number(amount.toFixed(2));
};

// ── Allowed auto-save intervals and priorities ──
const INTERVALS = ['daily', 'weekly', 'monthly'];
const PRIORITIES = ['low', 'medium', 'high'];

// ── Category alias map (accepts UI spellings and canonical values) ──
const CATEGORY_ALIASES = {
  'emergency fund': 'emergency_fund',
  emergency_fund: 'emergency_fund',
  savings: 'savings',
  vacation: 'vacation',
  gadget: 'gadget',
  investment: 'investment',
  vehicle: 'vehicle',
  home: 'home',
  education: 'education',
  debt: 'debt',
  purchase: 'purchase',
  other: 'other',
};

// ── Normalize a category to its canonical snake_case form ──
// Falls back to 'other' when no alias matches.
const normalizeCategory = (value) => {
  const clean = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (
    CATEGORY_ALIASES[clean] ||
    CATEGORY_ALIASES[String(value || '').trim().toLowerCase()] ||
    'other'
  );
};

/* —————————————————————————————————————
 * Router Middleware
 * ————————————————————————————————————— */

// ── Disable caching on every response (consistency with other routes) ──
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* —————————————————————————————————————
 * GET /:userId
 * List all goals for a user, with optional filters:
 *   - category
 *   - priority
 *   - achieved (boolean)
 * ————————————————————————————————————— */
router.get(
  '/:userId',
  checkOwnership('userId'),
  [
    // ── Validate query inputs ──
    param('userId').isMongoId().withMessage('Invalid user ID.'),
    query('category').optional().isString().trim().escape(),
    query('priority').optional().isIn(PRIORITIES),
    query('achieved').optional().isBoolean().toBoolean(),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Build the filter from optional query params ──
      const filter = { user_id: req.params.userId };
      if (req.query.category) filter.category = req.query.category;
      if (req.query.priority) filter.priority = req.query.priority;
      if (req.query.achieved !== undefined) filter.is_completed = req.query.achieved;

      // ── Load goals, oldest first ──
      const goals = await Goal.find(filter).sort({ created_at: 1 });
      return res.json(goals);
    } catch (error) {
      logger.error('[Goals] list error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

/* —————————————————————————————————————
 * GET /single/:id
 * Fetch a single goal by ID, scoped to the authenticated user.
 * ————————————————————————————————————— */
router.get(
  '/single/:id',
  checkOwnership('id', { model: Goal, paramName: 'id' }),
  [
    // ── Validate the goal ID ──
    param('id').isMongoId().withMessage('Invalid goal ID.'),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Load the goal, scoped to the authenticated user ──
      const goal = await Goal.findOne({ _id: req.params.id, user_id: req.user.id });
      if (!goal) return res.status(404).json({ error: 'Goal not found.' });
      return res.json(goal);
    } catch (error) {
      logger.error('[Goals] get error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

/* —————————————————————————————————————
 * POST /
 * Create a new savings goal for the authenticated user.
 * ————————————————————————————————————— */
router.post(
  '/',
  [
    // ── Validate request body ──
    body('name').isString().trim().notEmpty().withMessage('Goal name is required.'),
    body('target').isFloat({ min: 0.01 }).withMessage('Target must be a positive number.'),
    body('saved').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('color').optional().isString().trim().matches(/^#[0-9a-f]{6}$/i).withMessage('Invalid hex color.'),
    body('icon').optional().isString().trim().isLength({ max: 40 }),
    body('deadline').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
    body('priority').optional().isIn(PRIORITIES),
    body('category').optional().isString().trim().notEmpty(),
    body('notes').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 1000 }),
    body('auto_save_amount').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('auto_save_interval').optional().isIn(INTERVALS),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      name, target, saved = 0, color, icon, deadline, priority,
      category, notes, auto_save_amount, auto_save_interval,
    } = req.body;

    // ── Parse target ──
    const targetNum = parseMoney(target, { allowZero: false });
    if (targetNum === null) {
      return res.status(400).json({
        error: 'Target must be a positive number with at most 2 decimal places.',
      });
    }

    // ── Parse saved amount ──
    const savedNum = parseMoney(saved, { allowZero: true });
    if (savedNum === null) {
      return res.status(400).json({
        error: 'Already saved amount must be a non-negative number.',
      });
    }
    if (savedNum > targetNum) {
      return res.status(400).json({ error: 'Already saved cannot exceed target.' });
    }

    // Improvement over the original: reject an invalid auto_save_amount
    // instead of silently storing null.
    let autoSaveAmount = null;
    if (auto_save_amount !== undefined && auto_save_amount !== null && auto_save_amount !== '') {
      autoSaveAmount = parseMoney(auto_save_amount, { allowZero: true });
      if (autoSaveAmount === null) {
        return res.status(400).json({
          error: 'Auto-save amount must be a non-negative number.',
        });
      }
    }

    // ── Determine initial completion state ──
    const isCompleted = savedNum >= targetNum;

    // ── Assemble the goal payload ──
    const goalData = {
      user_id: req.user.id,
      name: String(name).trim(),
      target: targetNum,
      saved: savedNum,
      color: color || '#3b82f6',
      icon: icon || '🎯',
      deadline: deadline || null,
      priority: priority || 'medium',
      category: normalizeCategory(category),
      notes: notes ? String(notes).trim().slice(0, 1000) : '',
      auto_save_amount: autoSaveAmount,
      auto_save_interval: auto_save_interval || null,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date() : null,
    };

    try {
      // ── Persist the new goal ──
      const goal = await Goal.create(goalData);
      return res.status(201).json({ id: goal._id, message: 'Goal created', goal });
    } catch (error) {
      // ── Map duplicate-key errors to a friendly message ──
      if (error?.code === 11000) {
        const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
        return res.status(409).json({
          error: `A goal with this ${field} already exists.`,
        });
      }
      logger.error('[Goals] create error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

/* —————————————————————————————————————
 * PUT /:id
 * Update a goal owned by the authenticated user.
 * ————————————————————————————————————— */
router.put(
  '/:id',
  checkOwnership('id', { model: Goal, paramName: 'id' }),
  [
    // ── Validate path param and optional body fields ──
    param('id').isMongoId().withMessage('Invalid goal ID.'),
    body('name').optional().isString().trim().notEmpty(),
    body('target').optional().isFloat({ min: 0.01 }).toFloat(),
    body('saved').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('color').optional().isString().trim().matches(/^#[0-9a-f]{6}$/i),
    body('icon').optional().isString().trim().isLength({ max: 40 }),
    body('deadline').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
    body('priority').optional().isIn(PRIORITIES),
    body('category').optional().isString().trim().notEmpty(),
    body('notes').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 1000 }),
    body('auto_save_amount').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('auto_save_interval').optional().isIn(INTERVALS),
    body('achieved').optional().isBoolean().toBoolean(),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Load the goal, scoped to the authenticated user ──
      const goal = await Goal.findOne({ _id: req.params.id, user_id: req.user.id });
      if (!goal) return res.status(404).json({ error: 'Goal not found.' });

      const {
        name, target, saved, color, icon, deadline, priority,
        category, notes, auto_save_amount, auto_save_interval, achieved,
      } = req.body;

      // ── Update name ──
      if (name !== undefined) goal.name = String(name).trim();

      // ── Update target ──
      if (target !== undefined) {
        const targetNum = parseMoney(target, { allowZero: false });
        if (targetNum === null) {
          return res.status(400).json({ error: 'Target must be a positive number.' });
        }
        goal.target = targetNum;
      }

      // ── Update saved amount ──
      if (saved !== undefined) {
        const savedNum = parseMoney(saved, { allowZero: true });
        if (savedNum === null) {
          return res.status(400).json({
            error: 'Saved amount must be a non-negative number.',
          });
        }
        goal.saved = savedNum;
      }

      // ── Update styling ──
      if (color !== undefined) goal.color = color;
      if (icon !== undefined) goal.icon = icon;

      // ── Update deadline (null/empty clears it) ──
      if (deadline !== undefined) {
        if (deadline === null || deadline === '') {
          goal.deadline = null;
        } else {
          const d = new Date(deadline);
          if (Number.isNaN(d.getTime())) {
            return res.status(400).json({ error: 'Invalid deadline date.' });
          }
          goal.deadline = d;
        }
      }

      // ── Update priority ──
      if (priority !== undefined) {
        if (!PRIORITIES.includes(priority)) {
          return res.status(400).json({ error: 'Invalid priority.' });
        }
        goal.priority = priority;
      }

      // ── Update category ──
      if (category !== undefined) goal.category = normalizeCategory(category);

      // ── Update notes ──
      if (notes !== undefined) {
        goal.notes = notes ? String(notes).trim().slice(0, 1000) : '';
      }

      // ── Update auto-save amount ──
      if (auto_save_amount !== undefined) {
        if (auto_save_amount === null) {
          goal.auto_save_amount = null;
        } else {
          const parsed = parseMoney(auto_save_amount, { allowZero: true });
          if (parsed === null) {
            return res.status(400).json({
              error: 'Auto-save amount must be a non-negative number.',
            });
          }
          goal.auto_save_amount = parsed;
        }
      }

      // ── Update auto-save interval ──
      if (auto_save_interval !== undefined) {
        if (auto_save_interval !== null && !INTERVALS.includes(auto_save_interval)) {
          return res.status(400).json({ error: 'Invalid auto-save interval.' });
        }
        goal.auto_save_interval = auto_save_interval || null;
      }

      // ── Update completion state ──
      if (achieved !== undefined) {
        goal.is_completed = Boolean(achieved);
        if (achieved) {
          goal.completed_at = goal.completed_at || new Date();
        } else {
          goal.completed_at = null;
        }
      }

      // ── Guard: saved cannot exceed target after all updates ──
      if (goal.saved > goal.target) {
        return res.status(400).json({ error: 'Saved amount cannot exceed target.' });
      }

      // ── Persist changes ──
      await goal.save();
      return res.json({ message: 'Goal updated', goal });
    } catch (error) {
      // ── Map duplicate-key errors to a friendly message ──
      if (error?.code === 11000) {
        const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
        return res.status(409).json({
          error: `A goal with this ${field} already exists.`,
        });
      }
      logger.error('[Goals] update error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

/* —————————————————————————————————————
 * DELETE /:id
 * Delete a goal owned by the authenticated user.
 * ————————————————————————————————————— */
router.delete(
  '/:id',
  checkOwnership('id', { model: Goal, paramName: 'id' }),
  [
    // ── Validate the goal ID ──
    param('id').isMongoId().withMessage('Invalid goal ID.'),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // ── Find and delete in a single atomic operation ──
      const goal = await Goal.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
      if (!goal) return res.status(404).json({ error: 'Goal not found.' });
      return res.json({ message: 'Goal deleted' });
    } catch (error) {
      logger.error('[Goals] delete error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router ──
module.exports = router;