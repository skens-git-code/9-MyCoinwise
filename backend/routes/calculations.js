const express = require('express');
const { body, validationResult, param } = require('express-validator');
const mongoose = require('mongoose');
const Calculation = require('../models/Calculation');
const checkOwnership = require('../middleware/ownership');

const router = express.Router();

// ---------- GET: List calculations with limit ----------
router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  try {
    const calculations = await Calculation.find({ user_id: req.params.userId })
      .select('client_id expression result numeric_result angle_mode created_at updated_at')
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();
    res.json(calculations.map(({ _id, ...calculation }) => ({
      ...calculation,
      id: String(_id),
    })));
  } catch (error) {
    console.error('[Calculations] list error:', error);
    res.status(500).json({ error: 'Could not load calculation history.' });
  }
});

// ---------- POST: Save or update a calculation ----------
router.post(
  '/',
  [
    body('client_id').isString().trim().notEmpty().isLength({ max: 80 }),
    body('expression').isString().trim().notEmpty().isLength({ max: 500 }),
    body('result').isString().trim().notEmpty().isLength({ max: 120 }),
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
        { user_id: req.user.id, client_id: req.body.client_id },
        {
          $set: {
            expression: req.body.expression,
            result: req.body.result,
            numeric_result: Number(req.body.numeric_result),
            angle_mode: req.body.angle_mode || 'DEG',
          },
          $setOnInsert: { user_id: req.user.id, client_id: req.body.client_id },
        },
        { new: true, upsert: true, runValidators: true }
      );
      res.status(201).json(calculation);
    } catch (error) {
      console.error('[Calculations] create error:', error);
      res.status(500).json({ error: 'Could not save calculation.' });
    }
  }
);

// ---------- DELETE: Clear all calculations for a user ----------
router.delete('/:userId', checkOwnership('userId'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  try {
    await Calculation.deleteMany({ user_id: new mongoose.Types.ObjectId(req.params.userId) });
    res.json({ message: 'Calculation history cleared.' });
  } catch (error) {
    console.error('[Calculations] clear error:', error);
    res.status(500).json({ error: 'Could not clear calculation history.' });
  }
});

// ---------- DELETE: Remove a single calculation by client_id ----------
router.delete(
  '/:userId/:clientId',
  checkOwnership('userId'),
  [
    param('clientId').isString().trim().notEmpty().isLength({ max: 80 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    try {
      const result = await Calculation.findOneAndDelete({
        user_id: req.params.userId,
        client_id: req.params.clientId,
      });
      if (!result) {
        return res.status(404).json({ error: 'Calculation not found.' });
      }
      res.json({ message: 'Calculation deleted successfully.' });
    } catch (error) {
      console.error('[Calculations] delete single error:', error);
      res.status(500).json({ error: 'Could not delete calculation.' });
    }
  }
);

module.exports = router;
