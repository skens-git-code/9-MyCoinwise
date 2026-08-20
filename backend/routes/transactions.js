const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Account = require('../models/Account');
const checkOwnership = require('../middleware/ownership');

const router = express.Router();

const TRANSACTION_TYPES = new Set(['income', 'expense']);

const parseTransactionAmount = (value) => {
  const amount = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) return null;
  if (Math.round(amount * 100) !== amount * 100) return null;
  return amount;
};

const parseTransactionDate = (value) => {
  if (value === undefined || value === null || value === '') return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const validateTransactionPayload = (payload) => {
  const { type, category, amount, date, note, merchant, tags, payment_method, account_id, is_recurring, recurrence_interval, recurrence_ends_at, is_split, split_details } = payload;
  const numericAmount = parseTransactionAmount(amount);
  if (!TRANSACTION_TYPES.has(type)) return { error: 'Type must be income or expense.' };
  if (typeof category !== 'string' || !category.trim() || category.trim().length > 80) {
    return { error: 'A valid category is required.' };
  }
  if (numericAmount === null) return { error: 'Amount must be a positive number with at most 2 decimals.' };
  const parsedDate = parseTransactionDate(date);
  if (!parsedDate) return { error: 'Date must be valid.' };
  if (note !== undefined && note !== null && String(note).length > 500) {
    return { error: 'Note must be 500 characters or fewer.' };
  }
  if (account_id !== undefined && account_id !== null && account_id !== '' && !mongoose.isValidObjectId(account_id)) {
    return { error: 'Account ID is invalid.' };
  }
  
  const parsedPayload = { numericAmount, parsedDate };
  if (merchant !== undefined) parsedPayload.merchant = merchant ? String(merchant).trim() : null;
  if (tags !== undefined) parsedPayload.tags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [];
  if (payment_method !== undefined) parsedPayload.payment_method = payment_method;
  if (account_id !== undefined) parsedPayload.account_id = account_id || null;
  
  if (is_recurring !== undefined) parsedPayload.is_recurring = Boolean(is_recurring);
  if (recurrence_interval !== undefined) parsedPayload.recurrence_interval = recurrence_interval;
  if (recurrence_ends_at !== undefined) parsedPayload.recurrence_ends_at = recurrence_ends_at ? new Date(recurrence_ends_at) : null;
  
  if (is_split !== undefined) parsedPayload.is_split = Boolean(is_split);
  if (split_details !== undefined && Array.isArray(split_details)) {
    parsedPayload.split_details = split_details.map(s => ({
      person: String(s.person).trim(),
      amount: parseTransactionAmount(s.amount) || 0,
      paid: Boolean(s.paid)
    }));
  }

  return parsedPayload;
};

const getTransactionBalance = async (userId) => {
  const [result] = await Transaction.aggregate([
    { $match: { user_id: new mongoose.Types.ObjectId(userId), is_deleted: { $ne: true } } },
    {
      $group: {
        _id: null,
        income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
        expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } }
      }
    }
  ]);
  return Number(((result?.income || 0) - (result?.expense || 0)).toFixed(2));
};

const syncUserBalance = async (userId) => {
  const balance = await getTransactionBalance(userId);
  await User.findByIdAndUpdate(userId, { $set: { balance } });
  return balance;
};

const syncAccountBalances = async (accountIds = []) => {
  const uniqueIds = [...new Set(accountIds.filter(Boolean).map(String))];
  await Promise.all(uniqueIds.map(async (accountId) => {
    const account = await Account.findById(accountId).select('initial_balance');
    if (!account) return;
    const [result] = await Transaction.aggregate([
      { $match: { account_id: new mongoose.Types.ObjectId(accountId), is_deleted: { $ne: true } } },
      { $group: { _id: '$account_id', income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } }, expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } } } },
    ]);
    const balance = Number((Number(account.initial_balance || 0) + (result?.income || 0) - (result?.expense || 0)).toFixed(2));
    await Account.findByIdAndUpdate(accountId, { $set: { current_balance: balance } });
  }));
};

const nextOccurrence = (date, interval) => {
  const next = new Date(date);
  if (interval === 'daily') next.setDate(next.getDate() + 1);
  else if (interval === 'weekly') next.setDate(next.getDate() + 7);
  else if (interval === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (interval === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else return null;
  return next;
};

const processRecurringForUser = async (userId) => {
  const now = new Date();
  const templates = await Transaction.find({
    user_id: userId,
    is_recurring: true,
    is_deleted: { $ne: true },
    recurrence_interval: { $ne: null }
  }).select('+recurrence_instance_key');

  let created = 0;
  const affectedAccountIds = new Set();
  for (const template of templates) {
    if (template.account_id) affectedAccountIds.add(String(template.account_id));
    let occurrence = nextOccurrence(template.date, template.recurrence_interval);
    let safety = 0;
    while (occurrence && occurrence <= now && safety < 240) {
      if (template.recurrence_ends_at && occurrence > template.recurrence_ends_at) break;
      const instanceKey = `${template._id.toString()}:${occurrence.toISOString().slice(0, 10)}`;
      const exists = await Transaction.exists({ user_id: userId, recurrence_instance_key: instanceKey });
      if (!exists) {
        await Transaction.create({
          user_id: userId,
          type: template.type,
          category: template.category,
          amount: template.amount,
          date: occurrence,
          note: template.note,
          currency: template.currency,
          payment_method: template.payment_method,
          location: template.location,
          tags: template.tags,
          merchant: template.merchant,
          account_id: template.account_id,
          receipt_url: template.receipt_url,
          is_one_time: true,
          parent_transaction_id: template._id,
          recurrence_instance_key: instanceKey,
          audit_logs: [{ action: 'Generated recurring transaction', timestamp: new Date() }]
        });
        created += 1;
      }
      occurrence = nextOccurrence(occurrence, template.recurrence_interval);
      safety += 1;
    }
  }
  if (created > 0) {
    await syncUserBalance(userId);
    await syncAccountBalances([...affectedAccountIds]);
  }
  return created;
};

router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    await processRecurringForUser(req.params.userId);
    const limit = Math.min(2000, Math.max(1, Number.parseInt(req.query.limit, 10) || 2000));
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user_id: req.params.userId, is_deleted: { $ne: true } })
      .sort({ date: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/process-recurring', async (req, res) => {
  try {
    const created = await processRecurringForUser(req.user.id);
    res.json({ created, message: created ? `Generated ${created} recurring transaction(s).` : 'Recurring transactions are up to date.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process recurring transactions.' });
  }
});

router.post('/', async (req, res) => {
  const user_id = req.user.id;
  try {
    const validation = validateTransactionPayload(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    if (validation.account_id) {
      const account = await Account.exists({ _id: validation.account_id, user_id });
      if (!account) return res.status(400).json({ error: 'Selected account was not found.' });
    }
    
    const txData = {
      user_id, 
      type: req.body.type, 
      category: req.body.category.trim(), 
      amount: validation.numericAmount,
      date: validation.parsedDate, 
      note: req.body.note ? String(req.body.note).trim() : null,
      merchant: validation.merchant,
      tags: validation.tags,
      payment_method: validation.payment_method,
      account_id: validation.account_id || null,
      is_recurring: validation.is_recurring,
      recurrence_interval: validation.recurrence_interval,
      recurrence_ends_at: validation.recurrence_ends_at,
      is_split: validation.is_split,
      split_details: validation.split_details,
      audit_logs: [{ action: 'Created', timestamp: new Date() }]
    };

    const transaction = await Transaction.create(txData);
    const balance = await syncUserBalance(user_id);
    await syncAccountBalances([transaction.account_id]);
    res.status(201).json({ transaction, balance, message: 'Transaction added' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid transaction ID' });
  }
  try {
    const t = await Transaction.findOne({ _id: req.params.id, is_deleted: { $ne: true } });
    if (!t) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (t.user_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const next = { ...req.body };
    if (next.type === undefined) next.type = t.type;
    if (next.category === undefined) next.category = t.category;
    if (next.amount === undefined) next.amount = t.amount;
    if (next.date === undefined) next.date = t.date;
    if (next.account_id === undefined) next.account_id = t.account_id;

    const validation = validateTransactionPayload(next);
    if (validation.error) return res.status(400).json({ error: validation.error });
    if (validation.account_id) {
      const account = await Account.exists({ _id: validation.account_id, user_id: req.user.id });
      if (!account) return res.status(400).json({ error: 'Selected account was not found.' });
    }

    const previousAccountId = t.account_id;

    t.type = next.type;
    t.amount = validation.numericAmount;
    t.category = next.category.trim();
    t.note = next.note !== undefined ? (next.note ? String(next.note).trim() : null) : t.note;
    t.date = validation.parsedDate;
    t.account_id = validation.account_id || null;
    
    if (validation.merchant !== undefined) t.merchant = validation.merchant;
    if (validation.tags !== undefined) t.tags = validation.tags;
    if (validation.payment_method !== undefined) t.payment_method = validation.payment_method;
    if (validation.is_recurring !== undefined) t.is_recurring = validation.is_recurring;
    if (validation.recurrence_interval !== undefined) t.recurrence_interval = validation.recurrence_interval;
    if (validation.recurrence_ends_at !== undefined) t.recurrence_ends_at = validation.recurrence_ends_at;
    if (validation.is_split !== undefined) t.is_split = validation.is_split;
    if (validation.split_details !== undefined) t.split_details = validation.split_details;
    
    t.audit_logs.push({ action: 'Updated', timestamp: new Date() });
    await t.save();

    const balance = await syncUserBalance(t.user_id);
    await syncAccountBalances([previousAccountId, t.account_id]);
    res.json({ transaction: t, balance, message: 'Transaction updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid transaction ID' });
  }
  try {
    const t = await Transaction.findById(req.params.id);
    if (!t) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (t.user_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    t.is_deleted = true;
    await t.save();
    const balance = await syncUserBalance(t.user_id);
    await syncAccountBalances([t.account_id]);

    res.json({ balance, message: 'Transaction deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Array of transaction IDs is required' });
  }

  try {
    const validIds = ids.filter(id => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid transaction IDs provided' });
    }

    const affectedAccountIds = await Transaction.find({
      _id: { $in: validIds },
      user_id: req.user.id,
      is_deleted: { $ne: true },
    }).distinct('account_id');

    const result = await Transaction.updateMany(
      { _id: { $in: validIds }, user_id: req.user.id },
      { $set: { is_deleted: true } }
    );

    const balance = await syncUserBalance(req.user.id);
    await syncAccountBalances(affectedAccountIds);
    res.json({ balance, deletedCount: result.modifiedCount, message: `${result.modifiedCount} transactions deleted` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
