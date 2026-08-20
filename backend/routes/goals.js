const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const Goal = require('../models/Goal');
const checkOwnership = require('../middleware/ownership');

const router = express.Router();

// ---------- Helpers ----------
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : Number.EPSILON) || amount > 999999999.99) return null;
  return Number(amount.toFixed(2));
};

const INTERVALS = ['daily', 'weekly', 'monthly'];
const PRIORITIES = ['low', 'medium', 'high'];
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
const normalizeCategory = (value) => {
  const clean = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return CATEGORY_ALIASES[clean] || CATEGORY_ALIASES[String(value || '').trim().toLowerCase()] || 'other';
};

// ---------- GET: List all goals for a user ----------
router.get(
  '/:userId',
  checkOwnership('userId'),
  [
    param('userId').isMongoId().withMessage('Invalid user ID.'),
    query('category').optional().isString().trim().escape(),
    query('priority').optional().isIn(PRIORITIES),
    query('achieved').optional().isBoolean().toBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const filter = { user_id: req.params.userId };
      if (req.query.category) filter.category = req.query.category;
      if (req.query.priority) filter.priority = req.query.priority;
      if (req.query.achieved !== undefined) filter.is_completed = req.query.achieved;

      const goals = await Goal.find(filter).sort({ created_at: 1 });
      res.json(goals);
    } catch (error) {
      console.error('[Goals] list error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ---------- GET: Single goal by ID ----------
router.get(
  '/single/:id',
  checkOwnership('id', { model: Goal, paramName: 'id' }), // checks the goal's user_id
  [
    param('id').isMongoId().withMessage('Invalid goal ID.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const goal = await Goal.findOne({ _id: req.params.id, user_id: req.user.id });
      if (!goal) return res.status(404).json({ error: 'Goal not found.' });
      res.json(goal);
    } catch (error) {
      console.error('[Goals] get error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ---------- POST: Create a new goal ----------
router.post(
  '/',
  [
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, target, saved = 0, color, icon, deadline, priority, category, notes, auto_save_amount, auto_save_interval } = req.body;

    const targetNum = parseMoney(target, { allowZero: false });
    if (targetNum === null) {
      return res.status(400).json({ error: 'Target must be a positive number with at most 2 decimal places.' });
    }

    const savedNum = parseMoney(saved, { allowZero: true });
    if (savedNum === null) {
      return res.status(400).json({ error: 'Already saved amount must be a non‑negative number.' });
    }
    if (savedNum > targetNum) {
      return res.status(400).json({ error: 'Already saved cannot exceed target.' });
    }

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
      auto_save_amount: auto_save_amount !== undefined ? parseMoney(auto_save_amount, { allowZero: true }) : null,
      auto_save_interval: auto_save_interval || null,
      is_completed: savedNum >= targetNum,
      completed_at: savedNum >= targetNum ? new Date() : null,
    };

    try {
      const goal = await Goal.create(goalData);
      res.status(201).json({ id: goal._id, message: 'Goal created', goal });
    } catch (error) {
      console.error('[Goals] create error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ---------- PUT: Update a goal ----------
router.put(
  '/:id',
  checkOwnership('id', { model: Goal, paramName: 'id' }),
  [
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const goal = await Goal.findOne({ _id: req.params.id, user_id: req.user.id });
      if (!goal) return res.status(404).json({ error: 'Goal not found.' });

      const {
        name, target, saved, color, icon, deadline, priority,
        category, notes, auto_save_amount, auto_save_interval, achieved,
      } = req.body;

      // Update fields
      if (name !== undefined) goal.name = String(name).trim();
      if (target !== undefined) {
        const targetNum = parseMoney(target, { allowZero: false });
        if (targetNum === null) return res.status(400).json({ error: 'Target must be a positive number.' });
        goal.target = targetNum;
      }
      if (saved !== undefined) {
        const savedNum = parseMoney(saved, { allowZero: true });
        if (savedNum === null) return res.status(400).json({ error: 'Saved amount must be a non‑negative number.' });
        goal.saved = savedNum;
      }
      if (color !== undefined) goal.color = color;
      if (icon !== undefined) goal.icon = icon;
      if (deadline !== undefined) {
        if (deadline === null || deadline === '') {
          goal.deadline = null;
        } else {
          const d = new Date(deadline);
          if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid deadline date.' });
          goal.deadline = d;
        }
      }
      if (priority !== undefined) {
        if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority.' });
        goal.priority = priority;
      }
      if (category !== undefined) {
        goal.category = normalizeCategory(category);
      }
      if (notes !== undefined) {
        goal.notes = notes ? String(notes).trim().slice(0, 1000) : '';
      }
      if (auto_save_amount !== undefined) {
        goal.auto_save_amount = auto_save_amount !== null ? parseMoney(auto_save_amount, { allowZero: true }) : null;
      }
      if (auto_save_interval !== undefined) {
        if (auto_save_interval !== null && !INTERVALS.includes(auto_save_interval)) {
          return res.status(400).json({ error: 'Invalid auto‑save interval.' });
        }
        goal.auto_save_interval = auto_save_interval || null;
      }

      // Handle completion status
      if (achieved !== undefined) {
        goal.is_completed = Boolean(achieved);
        if (achieved) {
          goal.completed_at = goal.completed_at || new Date();
        } else {
          goal.completed_at = null;
        }
      }

      // Validate: saved cannot exceed target
      if (goal.saved > goal.target) {
        return res.status(400).json({ error: 'Saved amount cannot exceed target.' });
      }

      await goal.save();
      res.json({ message: 'Goal updated', goal });
    } catch (error) {
      console.error('[Goals] update error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// ---------- DELETE: Remove a goal ----------
router.delete(
  '/:id',
  checkOwnership('id', { model: Goal, paramName: 'id' }),
  [
    param('id').isMongoId().withMessage('Invalid goal ID.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const goal = await Goal.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
      if (!goal) return res.status(404).json({ error: 'Goal not found.' });
      res.json({ message: 'Goal deleted' });
    } catch (error) {
      console.error('[Goals] delete error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

module.exports = router;
