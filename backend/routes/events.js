/**
 * events.js — Calendar event routes
 *
 * Endpoints:
 *   GET    /api/events/:userId   List events for a user (sorted by date)
 *   POST   /api/events           Create an event
 *   PUT    /api/events/:id       Update an event
 *   DELETE /api/events/:id       Delete an event
 *
 * Response shapes (unchanged from client contract):
 *   GET    → bare array of event documents
 *   POST   → bare event document (201)
 *   PUT    → bare event document
 *   DELETE → { message }
 *
 * Fixes vs. the previous version:
 *   - Router-level auth guard (POST/PUT/DELETE read req.user.id
 *     without checking req.user exists).
 *   - Defense-in-depth ownership check on GET.
 *   - ObjectId validation on PUT/DELETE — invalid IDs now return 400
 *     instead of falling through to a 500.
 *   - Normalized user-id comparison (handles ObjectId vs string).
 *   - POST/PUT validate `type`, `color`, `description`.
 *   - Rejected amount values now return 400 instead of being silently
 *     dropped.
 *   - Cache-Control middleware applied to every response.
 *   - Consistent logger usage (was console.error).
 *   - TITLE / DESCRIPTION / COLOR lengths bounded.
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const checkOwnership = require('../middleware/ownership');
const { logger } = require('../utils/logger');

const router = express.Router();

/* ============================================================
 * Constants
 * ============================================================ */

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_AMOUNT = 999_999_999.99;

// Allowed event types. Adjust to match the model enum if one exists.
const ALLOWED_TYPES = new Set([
  'income', 'expense', 'bill', 'reminder', 'payment', 'meeting', 'other',
]);

const HEX_COLOR = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

/* ============================================================
 * Helpers
 * ============================================================ */

/**
 * Parse a monetary amount from request input.
 * Returns a two-decimal number, or null if invalid.
 * Rejects booleans, arrays, and objects that JS would coerce silently.
 */
const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount)) return null;
  const floor = allowZero ? 0 : 0.01;
  if (amount < floor || amount > MAX_AMOUNT) return null;
  return Number(amount.toFixed(2));
};

const parseBoolean = (value) =>
  value === true || value === 'true' || value === 1 || value === '1';

/** Normalize a user-id comparison across ObjectId and string types. */
const sameId = (a, b) => {
  if (a == null || b == null) return false;
  return String(a) === String(b);
};

const toObjectId = (value) => {
  if (!value || !mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

/**
 * Validate an optional `type` field.
 * Returns the normalized type or null if invalid.
 */
const normalizeType = (value) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!ALLOWED_TYPES.has(normalized)) return null;
  return normalized;
};

/* ============================================================
 * Router-level middleware
 * ============================================================ */

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

/* ============================================================
 * GET /:userId — List events for a user
 * ============================================================ */

router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  // Defense-in-depth: reject if the requesting user doesn't match the
  // path param, even if checkOwnership is misconfigured.
  if (!sameId(req.userId, req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    const events = await Event.find({ user_id: req.params.userId })
      .sort({ date: 1 });
    return res.json(events);
  } catch (error) {
    logger.error('[Events] list error:', error);
    return res.status(500).json({ error: 'Unable to load events.' });
  }
});

/* ============================================================
 * POST / — Create an event
 * ============================================================ */

router.post(
  '/',
  [
    body('title')
      .isString().trim().notEmpty()
      .isLength({ max: MAX_TITLE_LENGTH }),
    body('date').isISO8601(),
    body('type').optional().isString(),
    body('description').optional().isString().isLength({ max: MAX_DESCRIPTION_LENGTH }),
    body('color').optional().isString(),
    body('amount').optional({ nullable: true }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, date, type, amount, description, color } = req.body;

    // Validate optional fields explicitly so we can return a clear
    // 400 rather than silently dropping the value.
    const normalizedType = normalizeType(type);
    if (normalizedType === null) {
      return res.status(400).json({
        error: `Event type must be one of: ${[...ALLOWED_TYPES].join(', ')}.`,
      });
    }

    if (color !== undefined && !HEX_COLOR.test(String(color))) {
      return res.status(400).json({ error: 'Color must be a valid hex color.' });
    }

    // Amount is optional. If provided and non-empty, it must parse.
    let parsedAmount;
    if (amount !== undefined && amount !== '' && amount !== null) {
      parsedAmount = parseMoney(amount);
      if (parsedAmount === null) {
        return res.status(400).json({
          error: 'Amount must be a non-negative number with at most two decimal places.',
        });
      }
    }

    try {
      const eventData = {
        user_id: req.userId,
        title: String(title).trim(),
        date: new Date(date),
      };

      if (normalizedType !== undefined) eventData.type = normalizedType;
      if (parsedAmount !== undefined) eventData.amount = parsedAmount;
      if (description !== undefined) eventData.description = String(description).trim();
      if (color !== undefined) eventData.color = String(color);

      const event = await Event.create(eventData);
      return res.status(201).json(event);
    } catch (error) {
      logger.error('[Events] create error:', error);
      return res.status(500).json({ error: 'Unable to create event.' });
    }
  }
);

/* ============================================================
 * PUT /:id — Update an event
 * ============================================================ */

router.put('/:id', async (req, res) => {
  const eventId = toObjectId(req.params.id);
  if (!eventId) {
    return res.status(400).json({ error: 'Invalid event ID.' });
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    if (!sameId(event.user_id, req.userId)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const { title, date, type, amount, description, color } = req.body;

    if (title !== undefined) {
      const trimmedTitle = String(title).trim();
      if (!trimmedTitle || trimmedTitle.length > MAX_TITLE_LENGTH) {
        return res.status(400).json({
          error: `Title must be 1–${MAX_TITLE_LENGTH} characters.`,
        });
      }
      event.title = trimmedTitle;
    }

    if (date !== undefined) {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Date is invalid.' });
      }
      event.date = parsed;
    }

    if (type !== undefined) {
      const normalizedType = normalizeType(type);
      if (normalizedType === null) {
        return res.status(400).json({
          error: `Event type must be one of: ${[...ALLOWED_TYPES].join(', ')}.`,
        });
      }
      event.type = normalizedType;
    }

    if (amount !== undefined) {
      if (amount === '' || amount === null) {
        event.amount = null;
      } else {
        const parsedAmount = parseMoney(amount);
        if (parsedAmount === null) {
          return res.status(400).json({
            error: 'Amount must be a non-negative number with at most two decimal places.',
          });
        }
        event.amount = parsedAmount;
      }
    }

    if (description !== undefined) {
      const trimmedDesc = String(description).trim();
      if (trimmedDesc.length > MAX_DESCRIPTION_LENGTH) {
        return res.status(400).json({
          error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
        });
      }
      event.description = trimmedDesc;
    }

    if (color !== undefined) {
      if (!HEX_COLOR.test(String(color))) {
        return res.status(400).json({ error: 'Color must be a valid hex color.' });
      }
      event.color = String(color);
    }

    await event.save();
    return res.json(event);
  } catch (error) {
    logger.error('[Events] update error:', error);
    return res.status(500).json({ error: 'Unable to update event.' });
  }
});

/* ============================================================
 * DELETE /:id — Delete an event
 * ============================================================ */

router.delete('/:id', async (req, res) => {
  const eventId = toObjectId(req.params.id);
  if (!eventId) {
    return res.status(400).json({ error: 'Invalid event ID.' });
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    if (!sameId(event.user_id, req.userId)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    await event.deleteOne();
    return res.json({ message: 'Event deleted' });
  } catch (error) {
    logger.error('[Events] delete error:', error);
    return res.status(500).json({ error: 'Unable to delete event.' });
  }
});

module.exports = router;