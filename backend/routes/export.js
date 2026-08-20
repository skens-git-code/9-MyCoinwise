const express = require('express');
const mongoose = require('mongoose');
const { param, query } = require('express-validator');
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
  max: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Export rate limit reached. Please wait a few minutes before requesting more exports.', code: 'RATE_LIMITED' },
});

router.use(exportLimiter);

// ---------- EXCEL EXPORT ----------
router.get(
  '/:userId',
  checkOwnership('userId'),
  [
    param('userId').isMongoId().withMessage('Invalid user ID.'),
    query('start').optional().isISO8601().toDate(),
    query('end').optional().isISO8601().toDate(),
  ],
  async (req, res) => {
    // Validation errors (if any) are handled by the route, but we can use express-validator's validationResult
    const { userId } = req.params;
    const { start, end } = req.query;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const currency = user.currency || 'USD';
      const currencySymbol = (CURRENCIES[currency] || CURRENCIES.USD).symbol;

      // Build query
      const query = { user_id: userId, is_deleted: { $ne: true } };
      if (start) query.date = { $gte: start };
      if (end) query.date = { ...query.date, $lte: end };
      if (start && end) query.date = { $gte: start, $lte: end };

      const transactions = await Transaction.find(query).sort({ date: -1 });

      const workbook = new excel.Workbook();
      workbook.creator = 'MyCoinwise';
      workbook.created = new Date();

      // Transactions sheet
      const ws = workbook.addWorksheet('Transactions', { pageSetup: { fitToPage: true } });
      ws.columns = [
        { header: 'ID', key: 'id', width: 28 },
        { header: 'Date', key: 'date', width: 22 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Category', key: 'category', width: 22 },
        { header: 'Note', key: 'note', width: 32 },
        { header: `Amount (${currency})`, key: 'amount', width: 16 },
      ];

      // Header styling
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
      headerRow.height = 22;

      let totalIncome = 0;
      let totalExpense = 0;

      transactions.forEach((t) => {
        const amount = parseFloat(t.amount);
        if (isNaN(amount)) return; // skip invalid
        if (t.type === 'income') totalIncome += amount;
        else totalExpense += amount;

        const row = ws.addRow({
          id: t._id.toString(),
          date: t.date.toISOString().split('T')[0], // YYYY-MM-DD
          type: t.type.toUpperCase(),
          category: t.category || 'Uncategorized',
          note: t.note || '',
          amount: `${currencySymbol}${amount.toFixed(2)}`,
        });
        row.getCell('amount').font = {
          bold: true,
          color: { argb: t.type === 'income' ? 'FF10B981' : 'FFEF4444' },
        };
      });

      // Apply borders
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });
      });

      // Summary sheet
      const summaryWs = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF059669' } } });
      summaryWs.addRow(['Metric', 'Value']);
      summaryWs.addRow(['Total Income', `${currencySymbol}${totalIncome.toFixed(2)}`]);
      summaryWs.addRow(['Total Expenses', `${currencySymbol}${totalExpense.toFixed(2)}`]);
      summaryWs.addRow(['Net', `${currencySymbol}${(totalIncome - totalExpense).toFixed(2)}`]);
      summaryWs.addRow(['Transaction Count', transactions.length]);
      summaryWs.getRow(1).font = { bold: true };
      summaryWs.getColumn(1).width = 20;
      summaryWs.getColumn(2).width = 25;

      const safeUsername = (user.username || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=MyCoinwise_${safeUsername}_${new Date().toISOString().split('T')[0]}.xlsx`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

      await workbook.xlsx.write(res);
    } catch (error) {
      console.error('Excel Export Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    }
  }
);

// ---------- JSON BACKUP ----------
router.get(
  '/backup/:userId',
  checkOwnership('userId'),
  [param('userId').isMongoId().withMessage('Invalid user ID.')],
  async (req, res) => {
    const { userId } = req.params;
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const [transactions, goals, subscriptions, events, wealthItems, netWorthHistory, budgets, accounts, calculations] =
        await Promise.all([
          Transaction.find({ user_id: userId, is_deleted: { $ne: true } }).lean(),
          Goal.find({ user_id: userId }).lean(),
          Subscription.find({ user_id: userId }).lean(),
          Event.find({ user_id: userId }).lean(),
          WealthItem.find({ user_id: userId }).lean(),
          NetWorthHistory.find({ user_id: userId }).lean(),
          Budget.find({ user_id: userId }).lean(),
          Account.find({ user_id: userId }).lean(),
          Calculation.find({ user_id: userId }).sort({ created_at: -1 }).lean(),
        ]);

      const backup = {
        version: 4,
        exportedAt: new Date().toISOString(),
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          currency: user.currency,
          theme: user.theme,
          monthly_goal: user.monthly_goal,
          // Add any other non‑sensitive fields
        },
        transactions,
        goals,
        subscriptions,
        events,
        wealthItems,
        netWorthHistory,
        budgets,
        accounts,
        calculations,
      };

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=MyCoinwise_backup_${new Date().toISOString().split('T')[0]}.json`);
      res.json(backup);
    } catch (error) {
      console.error('[Backup] export error:', error);
      res.status(500).json({ message: 'Failed to export backup.' });
    }
  }
);

module.exports = router;