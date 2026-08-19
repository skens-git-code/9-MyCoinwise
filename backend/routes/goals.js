const express = require('express');
const mongoose = require('mongoose');
const Goal = require('../models/Goal');
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
    const goals = await Goal.find({ user_id: req.params.userId }).sort({ created_at: 1 });
    res.json(goals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/', async (req, res) => {
  const { name, target, saved, color, icon, deadline, priority, category, notes, auto_save_amount, auto_save_interval } = req.body;
  const user_id = req.user.id;
  try {
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Goal name is required.' });
    const targetNum = parseMoney(target, { allowZero: false });
    if (targetNum === null) return res.status(400).json({ error: 'Target must be a positive number with at most 2 decimal places.' });
    const savedNum = saved !== undefined && saved !== '' ? parseMoney(saved, { allowZero: true }) : 0;
    if (savedNum === null) return res.status(400).json({ error: 'Already saved amount must be a non-negative number.' });
    if (savedNum > targetNum) return res.status(400).json({ error: 'Already saved amount cannot exceed target.' });

    const goalData = { user_id, name: String(name).trim(), target: targetNum, saved: savedNum, color, icon };

    if (deadline) goalData.deadline = new Date(deadline);
    if (priority) goalData.priority = String(priority).toLowerCase().trim();
    if (category) goalData.category = String(category).toLowerCase().trim();
    if (notes) goalData.notes = String(notes).trim().substring(0, 1000);
    if (auto_save_amount !== undefined) goalData.auto_save_amount = auto_save_amount;
    if (auto_save_interval) goalData.auto_save_interval = auto_save_interval;

    const goal = await Goal.create(goalData);
    res.json({ id: goal._id, message: 'Goal created', goal });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (goal.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const { saved, name, target, color, icon, deadline, priority, category, notes, auto_save_amount, auto_save_interval } = req.body;
    if (saved !== undefined) {
      const savedNum = parseMoney(saved);
      if (savedNum === null) return res.status(400).json({ error: 'Saved amount must be a non-negative number.' });
      goal.saved = savedNum;
    }
    if (name !== undefined) goal.name = String(name).trim();
    if (target !== undefined) {
      const targetNum = parseMoney(target, { allowZero: false });
      if (targetNum === null) return res.status(400).json({ error: 'Target must be a positive number.' });
      goal.target = targetNum;
    }
    if (goal.saved > goal.target) return res.status(400).json({ error: 'Saved amount cannot exceed target.' });
    if (color !== undefined) goal.color = color;
    if (icon !== undefined) goal.icon = icon;
    if (deadline !== undefined) {
      const parsedDeadline = new Date(deadline);
      if (Number.isNaN(parsedDeadline.getTime())) return res.status(400).json({ error: 'Invalid deadline.' });
      goal.deadline = parsedDeadline;
    }
    if (priority !== undefined) goal.priority = priority;
    if (category !== undefined) goal.category = category;
    if (notes !== undefined) goal.notes = notes;
    if (auto_save_amount !== undefined) {
      const autoAmount = parseMoney(auto_save_amount);
      if (autoAmount === null) return res.status(400).json({ error: 'Auto-save amount must be non-negative.' });
      goal.auto_save_amount = autoAmount;
    }
    if (auto_save_interval !== undefined) goal.auto_save_interval = auto_save_interval;
    await goal.save();
    res.json({ message: 'Goal updated', goal });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (goal.user_id.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    await Goal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
