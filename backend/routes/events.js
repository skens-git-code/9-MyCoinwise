const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const checkOwnership = require('../middleware/ownership');

const router = express.Router();

const parseMoney = (value, { allowZero = true } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : Number.EPSILON) || amount > 999999999.99) return null;
  const rounded = Math.round(amount * 100) / 100;
  return Number(rounded.toFixed(2));
};

router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    const events = await Event.find({ user_id: req.params.userId }).sort({ date: 1 });
    res.json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/', [
  body('title').notEmpty().trim(),
  body('date').isISO8601()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, date, type, amount, description, color } = req.body;
  const user_id = req.user.id;
  try {
    const eventData = { user_id, title: title.trim(), date: new Date(date) };
    if (type) eventData.type = type;
    if (amount !== undefined && amount !== '') {
      const parsedAmount = parseMoney(amount);
      if (parsedAmount !== null) eventData.amount = parsedAmount;
    }
    if (description) eventData.description = String(description).trim();
    if (color) eventData.color = color;

    const event = await Event.create(eventData);
    res.status(201).json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    if (req.body.title) event.title = String(req.body.title).trim();
    if (req.body.date && !isNaN(new Date(req.body.date).getTime())) event.date = new Date(req.body.date);
    if (req.body.type) event.type = req.body.type;
    if (req.body.amount !== undefined) {
      event.amount = req.body.amount !== '' ? parseMoney(req.body.amount) : null;
    }
    if (req.body.description !== undefined) event.description = String(req.body.description).trim();
    if (req.body.color) event.color = req.body.color;

    await event.save();
    res.json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: 'Event deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
