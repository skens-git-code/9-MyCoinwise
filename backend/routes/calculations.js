/**
 * calculations.js — Calculator history routes
 *
 * Endpoints:
 *   GET    /api/calculations/:userId             List recent calculations
 *   POST   /api/calculations                     Save or update a calculation
 *   DELETE /api/calculations/:userId             Clear all calculations for a user
 *   DELETE /api/calculations/:userId/:clientId   Delete a single calculation
 */

const express = require('express');
const { body, validationResult, param } = require('express-validator');
const mongoose = require('mongoose');
const Calculation = require('../models/Calculation');
const checkOwnership = require('../middleware/ownership');
const { logger } = require('../utils/logger');

const router = express.Router();

/* ── Constants ─────────────────────────────────────────────── */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;
const MAX_CLIENT_ID = 80;
const MAX_EXPRESSION = 500;
const MAX_RESULT = 120;

/* ── Helpers ───────────────────────────────────────────────── */

const toResponseShape = (doc) => {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const { _id, user_id, __v, ...rest } = obj;
  return { ...rest, id: String(_id) };
};

/* ── Middleware ────────────────────────────────────────────── */

router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (!req.user || (!req.user.id && !req.user._id)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = req.user.id || req.user._id;
  return next();
});

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* ── GET /:userId ──────────────────────────────────────────── */

router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, parsedLimit))
    : DEFAULT_LIMIT;

  try {
    const calculations = await Calculation.find({ user_id: req.params.userId })
      .select('client_id expression result numeric_result angle_mode created_at updated_at')
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    return res.json(calculations.map(({ _id, ...calc }) => ({
      ...calc,
      id: String(_id),
    })));
  } catch (error) {
    logger.error('[Calculations] list error:', error);
    return res.status(500).json({ error: 'Could not load calculation history.' });
  }
});

/* ── POST / ────────────────────────────────────────────────── */

router.post(
  '/',
  [
    body('client_id').isString().trim().notEmpty().isLength({ max: MAX_CLIENT_ID }),
    body('expression').isString().trim().notEmpty().isLength({ max: MAX_EXPRESSION }),
    body('result').isString().trim().notEmpty().isLength({ max: MAX_RESULT }),
    body('numeric_result').isFloat({ min: -Number.MAX_VALUE, max: Number.MAX_VALUE }),
    body('angle_mode').optional().isIn(['DEG', 'RAD']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const calculation = await Calculation.findOneAndUpdate(
        { user_id: req.userId, client_id: req.body.client_id },
        {
          $set: {
            expression: req.body.expression,
            result: req.body.result,
            numeric_result: Number(req.body.numeric_result),
            angle_mode: req.body.angle_mode || 'DEG',
          },
          $setOnInsert: {
            user_id: req.userId,
            client_id: req.body.client_id,
          },
        },
        { new: true, upsert: true, runValidators: true }
      );

      return res.status(201).json(toResponseShape(calculation));
    } catch (error) {
      if (error?.code === 11000) {
        const existing = await Calculation.findOne({
          user_id: req.userId,
          client_id: req.body.client_id,
        }).lean();
        if (existing) return res.status(200).json(toResponseShape(existing));
      }
      logger.error('[Calculations] create error:', error);
      return res.status(500).json({ error: 'Could not save calculation.' });
    }
  }
);

/* ── DELETE /:userId ───────────────────────────────────────── */

router.delete('/:userId', checkOwnership('userId'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    await Calculation.deleteMany({
      user_id: new mongoose.Types.ObjectId(req.params.userId),
    });
    return res.json({ message: 'Calculation history cleared.' });
  } catch (error) {
    logger.error('[Calculations] clear error:', error);
    return res.status(500).json({ error: 'Could not clear calculation history.' });
  }
});

/* ── DELETE /:userId/:clientId ─────────────────────────────── */

router.delete(
  '/:userId/:clientId',
  checkOwnership('userId'),
  [param('clientId').isString().trim().notEmpty().isLength({ max: MAX_CLIENT_ID })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }
    if (String(req.userId) !== String(req.params.userId)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      const result = await Calculation.findOneAndDelete({
        user_id: new mongoose.Types.ObjectId(req.params.userId),
        client_id: req.params.clientId,
      });

      if (!result) {
        return res.status(404).json({ error: 'Calculation not found.' });
      }
      return res.json({ message: 'Calculation deleted successfully.' });
    } catch (error) {
      logger.error('[Calculations] delete single error:', error);
      return res.status(500).json({ error: 'Could not delete calculation.' });
    }
  }
);

module.exports = router;