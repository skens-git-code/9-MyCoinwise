const express = require('express');
const mongoose = require('mongoose');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction'); // assume you have this
const checkOwnership = require('../middleware/ownership');

const router = express.Router();
const ACCOUNT_TYPES = new Set(['bank', 'wallet', 'credit_card', 'investment', 'cash', 'other']);
const CURRENCY_CODES = new Set(['USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SGD', 'AED', 'CHF', 'CNY', 'MXN', 'BRL', 'KRW', 'THB']);
const HEX_COLOR = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- Helpers ----------
const parseAccountBalance = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(amount) || Math.abs(amount) > 999999999.99) return null;
  return Number(amount.toFixed(2));
};

const parseBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

const validateAccountFields = ({ name, type, currency, color, icon } = {}) => {
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 100)) {
    return 'Account name is required and must be 100 characters or fewer.';
  }
  if (type !== undefined && !ACCOUNT_TYPES.has(type)) return 'Account type is invalid.';
  if (currency !== undefined && !CURRENCY_CODES.has(String(currency).trim().toUpperCase())) return 'Currency is invalid.';
  if (color !== undefined && (typeof color !== 'string' || !HEX_COLOR.test(color))) return 'Color must be a valid hex color.';
  if (icon !== undefined && (typeof icon !== 'string' || icon.length > 40)) return 'Icon is invalid.';
  return null;
};

// ---------- GET: List accounts with transaction count ----------
router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  try {
    const accounts = await Account.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(req.params.userId) } },
      {
        $lookup: {
          from: 'transactions',
          let: { accountId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$account_id', '$$accountId'] }, is_deleted: { $ne: true } } },
            { $project: { _id: 1 } },
          ],
          as: 'transactions',
        },
      },
      {
        $addFields: {
          transaction_count: { $size: '$transactions' },
        },
      },
      { $project: { transactions: 0 } }, // remove the raw transactions array
      { $sort: { is_active: -1, created_at: -1 } },
    ]);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(accounts);
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Unable to load accounts.' });
  }
});

// ---------- POST: Create account ----------
router.post('/', async (req, res) => {
  const { name, type, currency, initial_balance, color, icon } = req.body || {};
  const validationError = validateAccountFields({ name, type, currency, color, icon });
  const openingBalance = parseAccountBalance(initial_balance);
  if (validationError) return res.status(400).json({ error: validationError });
  if (openingBalance === null) {
    return res.status(400).json({ error: 'Initial balance must be a valid amount with at most two decimal places.' });
  }

  try {
    const normalizedName = name.trim();
    const duplicate = await Account.exists({
      user_id: req.user.id,
      name: new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i'),
    });
    if (duplicate) return res.status(409).json({ error: 'An account with this name already exists.' });

    const account = await Account.create({
      user_id: req.user.id,
      name: normalizedName,
      type: type || 'bank',
      currency: String(currency || 'USD').trim().toUpperCase(),
      initial_balance: openingBalance,
      current_balance: openingBalance,
      color: color || '#3b82f6',
      icon: icon || 'Wallet',
      is_active: true,
    });

    // Return the new account with transaction_count = 0
    const accountWithCount = { ...account.toObject(), transaction_count: 0 };
    res.status(201).json({ account: accountWithCount, message: 'Account created' });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(error.code === 11000 ? 409 : 500).json({
      error: error.code === 11000 ? 'An account with this name already exists.' : 'Unable to create account.',
    });
  }
});

// ---------- PUT: Update account ----------
router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid account ID.' });
  }

  const validationError = validateAccountFields(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const account = await Account.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const { name, type, currency, is_active, color, icon } = req.body;

    // --- Name ---
    if (name !== undefined) {
      const normalizedName = name.trim();
      const duplicate = await Account.exists({
        _id: { $ne: account._id },
        user_id: req.user.id,
        name: new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i'),
      });
      if (duplicate) return res.status(409).json({ error: 'An account with this name already exists.' });
      account.name = normalizedName;
    }

    // --- Type ---
    if (type !== undefined) account.type = type;

    // --- Currency ---
    if (currency !== undefined) {
      const newCurrency = String(currency).trim().toUpperCase();
      // Prevent currency change if the account has transactions
      const txCount = await Transaction.countDocuments({ account_id: account._id, is_deleted: { $ne: true } });
      if (txCount > 0 && newCurrency !== account.currency) {
        return res.status(400).json({
          error: `Cannot change currency because this account has ${txCount} transaction(s).`
        });
      }
      account.currency = newCurrency;
    }

    // --- Active status (maps to frontend's archived) ---
    if (is_active !== undefined) {
      account.is_active = parseBoolean(is_active);
    }

    // --- Color & Icon ---
    if (color !== undefined) account.color = color;
    if (icon !== undefined) account.icon = icon;

    await account.save();

    // Fetch updated account with transaction count
    const updatedAccount = await Account.aggregate([
      { $match: { _id: account._id } },
      {
        $lookup: {
          from: 'transactions',
          let: { accountId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$account_id', '$$accountId'] }, is_deleted: { $ne: true } } },
            { $project: { _id: 1 } },
          ],
          as: 'transactions',
        },
      },
      { $addFields: { transaction_count: { $size: '$transactions' } } },
      { $project: { transactions: 0 } },
    ]);

    res.json({ account: updatedAccount[0], message: 'Account updated' });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(error.code === 11000 ? 409 : 500).json({
      error: error.code === 11000 ? 'An account with this name already exists.' : 'Unable to update account.',
    });
  }
});

// ---------- DELETE: Account (with transaction check) ----------
router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid account ID.' });
  }

  try {
    const account = await Account.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    // Check for existing transactions
    const txCount = await Transaction.countDocuments({ account_id: account._id, is_deleted: { $ne: true } });
    if (txCount > 0) {
      return res.status(409).json({
        error: `Cannot delete account because it has ${txCount} transaction(s). Reassign or delete them first.`,
      });
    }

    await account.deleteOne();
    res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Unable to delete account.' });
  }
});

module.exports = router;
