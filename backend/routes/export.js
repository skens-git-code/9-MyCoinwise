const express = require('express');
const mongoose = require('mongoose');
const excel = require('exceljs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');
const Subscription = require('../models/Subscription');
const Event = require('../models/Event');
const WealthItem = require('../models/WealthItem');
const NetWorthHistory = require('../models/NetWorthHistory');
const Budget = require('../models/Budget');
const Account = require('../models/Account');
const Calculation = require('../models/Calculation');
const checkOwnership = require('../middleware/ownership');

const router = express.Router();

const CURRENCIES = {
  USD: { symbol: '$', code: 'USD' },
  INR: { symbol: '₹', code: 'INR' },
  EUR: { symbol: '€', code: 'EUR' },
  GBP: { symbol: '£', code: 'GBP' },
  JPY: { symbol: '¥', code: 'JPY' },
  CAD: { symbol: 'CA$', code: 'CAD' },
  AUD: { symbol: 'A$', code: 'AUD' },
  SGD: { symbol: 'S$', code: 'SGD' },
  AED: { symbol: 'د.إ', code: 'AED' },
  CHF: { symbol: 'Fr', code: 'CHF' },
  CNY: { symbol: '¥', code: 'CNY' },
  MXN: { symbol: '$', code: 'MXN' },
  BRL: { symbol: 'R$', code: 'BRL' },
  KRW: { symbol: '₩', code: 'KRW' },
  THB: { symbol: '฿', code: 'THB' },
};

const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 heavy export calls per 15 minutes per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Export rate limit reached. Please wait a few minutes before requesting more exports.', code: 'RATE_LIMITED' }
});

router.use(exportLimiter);

router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId) || {};
    const currency = user.currency || 'USD';
    const currencySymbol = (CURRENCIES[currency] || CURRENCIES.USD).symbol;

    const transactions = await Transaction.find({ user_id: req.params.userId, is_deleted: { $ne: true } }).sort({ date: -1 });

    const workbook = new excel.Workbook();
    workbook.creator = 'MyCoinwise';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Transactions', { pageSetup: { fitToPage: true } });
    ws.columns = [
      { header: 'ID', key: 'id', width: 28 },
      { header: 'Date', key: 'date', width: 22 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Category', key: 'category', width: 22 },
      { header: 'Note', key: 'note', width: 32 },
      { header: `Amount (${currency})`, key: 'amount', width: 16 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    headerRow.height = 22;

    transactions.forEach(t => {
      const row = ws.addRow({
        id: t._id.toString(),
        date: new Date(t.date).toLocaleString('en-IN'),
        type: t.type.toUpperCase(),
        category: t.category,
        note: t.note || '',
        amount: `${currencySymbol}${parseFloat(t.amount).toFixed(2)}`,
      });
      row.getCell('amount').font = {
        bold: true,
        color: { argb: t.type === 'income' ? 'FF10B981' : 'FFEF4444' }
      };
    });

    ws.eachRow(row => row.eachCell(cell => {
      cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    }));

    const safeUsername = (user.username || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=MyCoinwise_${safeUsername}.xlsx`);

    await workbook.xlsx.write(res);
  } catch (error) {
    console.error('Excel Export Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

router.get('/backup/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    const userId = req.params.userId;
    const [transactions, goals, subscriptions, events, wealthItems, netWorthHistory, budgets, accounts, calculations] = await Promise.all([
      Transaction.find({ user_id: userId }).lean(),
      Goal.find({ user_id: userId }).lean(),
      Subscription.find({ user_id: userId }).lean(),
      Event.find({ user_id: userId }).lean(),
      WealthItem.find({ user_id: userId }).lean(),
      NetWorthHistory.find({ user_id: userId }).lean(),
      Budget.find({ user_id: userId }).lean(),
      Account.find({ user_id: userId }).lean(),
      Calculation.find({ user_id: userId }).sort({ created_at: -1 }).lean(),
    ]);
    res.json({ version: 3, exportedAt: new Date().toISOString(), transactions, goals, subscriptions, events, wealthItems, netWorthHistory, budgets, accounts, calculations });
  } catch (error) {
    console.error('[Backup] export error:', error);
    res.status(500).json({ message: 'Failed to export backup.' });
  }
});

module.exports = router;
