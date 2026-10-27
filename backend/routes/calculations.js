/* —————————————————————————————————————
 * Calculator History Routes
 * CRUD endpoints for saved calculator history entries.
 *
 * Endpoints:
 *   GET    /:userId             List recent calculations
 *   POST   /                    Save or update a calculation
 *   DELETE /:userId             Clear all calculations for a user
 *   DELETE /:userId/:clientId   Delete a single calculation
 *
 * Key behaviors:
 *   - Router-level auth guard returns 401 when req.user is missing.
 *   - Cache-Control applied to every response, including errors.
 *   - POST uses upsert on (user_id, client_id) so re-syncing the
 *     same client entry updates rather than duplicates it.
 *   - Response shape strips _id / user_id / __v and exposes `id`.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const { body, validationResult, param } = require('express-validator');
const mongoose = require('mongoose');
const Calculation = require('../models/Calculation');
const checkOwnership = require('../middleware/ownership');
const { logger } = require('../utils/logger');

// ── Create router ──
const router = express.Router();

/* —————————————————————————————————————
 * Constants
 * ————————————————————————————————————— */

// ── Pagination limits ──
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

// ── Field length limits (mirror the schema) ──
const MAX_CLIENT_ID = 80;
const MAX_EXPRESSION = 500;
const MAX_RESULT = 120;
const NUMERIC_RESULT_BOUND = 1e15;

/* —————————————————————————————————————
 * Helpers
 * ————————————————————————————————————— */

// ── Normalize a calculation document for API responses ──
// Converts _id to `id` and strips user_id and __v.
const toResponseShape = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const { _id, user_id, __v, ...rest } = obj;
  return { ...rest, id: String(_id) };
};

// ── Parameter validation middleware: ensure userId is a valid ObjectId ──
const validateUserIdParam = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  return next();
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
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

/* —————————————————————————————————————
 * GET /:userId
 * List the user's recent calculations, newest first.
 * Supports limit and offset pagination.
 * ————————————————————————————————————— */
router.get('/:userId', validateUserIdParam, checkOwnership('userId'), async (req, res) => {
  // ── Ensure the request targets the authenticated user ──
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  // ── Parse pagination query parameters ──
  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, parsedLimit))
    : DEFAULT_LIMIT;

  const parsedOffset = Number.parseInt(req.query.offset, 10);
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

  try {
    // ── Load calculations, newest first, with offset and limit ──
    const calculations = await Calculation.find({ user_id: req.params.userId })
      .select('client_id expression result numeric_result angle_mode created_at updated_at')
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    // ── Map to the standard API response shape ──
    return res.json(calculations.map(toResponseShape));
  } catch (error) {
    logger.error('[Calculations] list error:', error);
    return res.status(500).json({ error: 'Could not load calculation history.' });
  }
});

/* —————————————————————————————————————
 * POST /
 * Save or update a calculation for the authenticated user.
 * ————————————————————————————————————— */
router.post(
  '/',
  [
    // ── Validate input ──
    body('client_id').isString().trim().notEmpty().isLength({ max: MAX_CLIENT_ID }),
    body('expression').isString().trim().notEmpty().isLength({ max: MAX_EXPRESSION }),
    body('result').isString().trim().notEmpty().isLength({ max: MAX_RESULT }),
    body('numeric_result')
      .isFloat({ min: -NUMERIC_RESULT_BOUND, max: NUMERIC_RESULT_BOUND })
      .withMessage(`Numeric result must be a valid float within ±${NUMERIC_RESULT_BOUND}.`),
    body('angle_mode').optional().isIn(['DEG', 'RAD']),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // ── Upsert by (user_id, client_id) ──
      // $setOnInsert is redundant with the filter clause but documents intent:
      // on upsert-insert, client_id and user_id come from the filter object.
      const result = await Calculation.findOneAndUpdate(
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
        { new: true, upsert: true, runValidators: true, includeResultMetadata: true }
      );

      const calculation = result && result.value ? result.value : result;
      const wasInsert = result && result.lastErrorObject ? !result.lastErrorObject.updatedExisting : false;

      return res.status(wasInsert ? 201 : 200).json(toResponseShape(calculation));
    } catch (error) {
      // ── Handle a duplicate-key race by updating the existing doc (last-write-wins) ──
      if (error?.code === 11000) {
        const retried = await Calculation.findOneAndUpdate(
          { user_id: req.userId, client_id: req.body.client_id },
          {
            $set: {
              expression: req.body.expression,
              result: req.body.result,
              numeric_result: Number(req.body.numeric_result),
              angle_mode: req.body.angle_mode || 'DEG',
            },
          },
          { new: true, runValidators: true }
        );
        if (retried) return res.status(200).json(toResponseShape(retried));
      }
      logger.error('[Calculations] create error:', error);
      return res.status(500).json({ error: 'Could not save calculation.' });
    }
  }
);

/* —————————————————————————————————————
 * DELETE /:userId
 * Clear all calculations for the given user.
 * ————————————————————————————————————— */
router.delete('/:userId', validateUserIdParam, checkOwnership('userId'), async (req, res) => {
  // ── Ensure the request targets the authenticated user ──
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    // ── Delete all calculations for the user ──
    const result = await Calculation.deleteMany({
      user_id: new mongoose.Types.ObjectId(req.params.userId),
    });
    return res.json({
      message: 'Calculation history cleared.',
      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    logger.error('[Calculations] clear error:', error);
    return res.status(500).json({ error: 'Could not clear calculation history.' });
  }
});

/* —————————————————————————————————————
 * DELETE /:userId/:clientId
 * Delete a single calculation identified by client_id.
 * ————————————————————————————————————— */
router.delete(
  '/:userId/:clientId',
  validateUserIdParam,
  checkOwnership('userId'),
  [param('clientId').isString().trim().notEmpty().isLength({ max: MAX_CLIENT_ID })],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // ── Ensure the request targets the authenticated user ──
    if (String(req.userId) !== String(req.params.userId)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      // ── Delete the targeted calculation ──
      const result = await Calculation.findOneAndDelete({
        user_id: new mongoose.Types.ObjectId(req.params.userId),
        client_id: req.params.clientId,
      });

      if (!result) {
        return res.status(404).json({ error: 'Calculation not found.' });
      }
      return res.json({
        message: 'Calculation deleted successfully.',
        deletedCount: 1,
      });
    } catch (error) {
      logger.error('[Calculations] delete single error:', error);
      return res.status(500).json({ error: 'Could not delete calculation.' });
    }
  }
);

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router ──
module.exports = router;