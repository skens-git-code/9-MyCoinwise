/**
 * exports.js — Data export routes (Excel + JSON backup)
 *
 * Endpoints:
 *   GET /api/exports/:userId            Excel export of transactions
 *   GET /api/exports/backup/:userId     Full JSON backup of all user data
 *
 * Fixes applied vs. the previous version:
 *   - validationResult is now actually checked — previously the
 *     express-validator rules were dead code; invalid user IDs fell
 *     through to Mongoose and produced CastErrors.
 *   - Local `query` variable no longer shadows the express-validator
 *     `query` import.
 *   - Explicit auth middleware applied at the router level.
 *   - Consistent logger usage (was console.error).
 *   - Local date used in filenames — no more UTC shift.
 *   - All soft-deletable collections filtered by is_deleted.
 *   - Streaming-safe guards: skips rows with invalid dates or
 *     non-finite amounts, but still reports the actual exported count.
 *   - Row cap on Excel export to avoid freezing the server on huge
 *     datasets (default 50 000 rows; override via MAX_EXPORT_ROWS).
 *   - Backup response filtered to remove __v and other internal fields.
 */

const express = require('express');
const mongoose = require('mongoose');
const { param, query: queryValidator, validationResult } = require('express-validator');
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
const TaxProfile = require('../models/TaxProfile');
const TaxTag = require('../models/TaxTag');
const TaxPayment = require('../models/TaxPayment');
const TaxDocument = require('../models/TaxDocument');
const checkOwnership = require('../middleware/ownership');
const auth = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

/* ============================================================
 * Constants
 * ============================================================ */

const CURRENCIES = {
  USD: { symbol: '$',   code: 'USD' },
  INR: { symbol: '₹',   code: 'INR' },
  EUR: { symbol: '€',   code: 'EUR' },
  GBP: { symbol: '£',   code: 'GBP' },
  JPY: { symbol: '¥',   code: 'JPY' },
  CAD: { symbol: 'CA$', code: 'CAD' },
  AUD: { symbol: 'A$',  code: 'AUD' },
  SGD: { symbol: 'S$',  code: 'SGD' },
  AED: { symbol: 'د.إ', code: 'AED' },
  CHF: { symbol: 'Fr',  code: 'CHF' },
  CNY: { symbol: '¥',   code: 'CNY' },
  MXN: { symbol: '$',   code: 'MXN' },
  BRL: { symbol: 'R$',  code: 'BRL' },
  KRW: { symbol: '₩',   code: 'KRW' },
  THB: { symbol: '฿',   code: 'THB' },
};

const MAX_EXPORT_ROWS = Number(process.env.MAX_EXPORT_ROWS) || 50_000;
const MAX_BACKUP_DOCS_PER_COLLECTION = Number(process.env.MAX_BACKUP_DOCS) || 100_000;

/* ============================================================
 * Middleware
 * ============================================================ */

const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Export rate limit reached. Please wait a few minutes before requesting more exports.',
    code: 'RATE_LIMITED',
  },
});

router.use(exportLimiter);
router.use(auth);

// Cache-Control on every response (including errors).
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* ============================================================
 * Helpers
 * ============================================================ */

/** Local YYYY-MM-DD (no UTC shift for users east/west of UTC). */
const localDateStamp = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Strip internal-only fields from a Mongoose lean() document. */
const stripInternalFields = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;
  const { __v, ...rest } = doc;
  return rest;
};

/* ============================================================
 * GET /:userId — Excel export of transactions
 * ============================================================ */

router.get(
  '/:userId',
  checkOwnership('userId'),
  [
    param('userId').isMongoId().withMessage('Invalid user ID.'),
    queryValidator('start').optional().isISO8601().toDate(),
    queryValidator('end').optional().isISO8601().toDate(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const { start, end } = req.query;

    try {
      const user = await User.findById(userId).lean();
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const currency = user.currency || 'USD';
      const currencySymbol = (CURRENCIES[currency] || CURRENCIES.USD).symbol;

      // Build the transaction query. `dateRange` avoids shadowing the
      // express-validator `query` import.
      const dateRange = {};
      if (start) dateRange.$gte = start;
      if (end) dateRange.$lte = end;

      const filter = {
        user_id: userId,
        is_deleted: { $ne: true },
      };
      if (start || end) filter.date = dateRange;

      // Cap the export size to protect the server from very large
      // datasets. The +1 is used to detect overflow and warn the user.
      const transactions = await Transaction.find(filter)
        .sort({ date: -1 })
        .limit(MAX_EXPORT_ROWS + 1);

      const truncated = transactions.length > MAX_EXPORT_ROWS;
      const rowsToExport = truncated ? transactions.slice(0, MAX_EXPORT_ROWS) : transactions;

      const workbook = new excel.Workbook();
      workbook.creator = 'MyCoinwise';
      workbook.created = new Date();

      /* ── Transactions sheet ─────────────────────────────── */

      const ws = workbook.addWorksheet('Transactions', {
        pageSetup: { fitToPage: true },
      });
      ws.columns = [
        { header: 'ID',               key: 'id',       width: 28 },
        { header: 'Date',             key: 'date',     width: 22 },
        { header: 'Type',             key: 'type',     width: 12 },
        { header: 'Category',         key: 'category', width: 22 },
        { header: 'Note',             key: 'note',     width: 32 },
        { header: `Amount (${currency})`, key: 'amount', width: 16 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
      headerRow.height = 22;

      let totalIncome = 0;
      let totalExpense = 0;
      let exportedCount = 0;

      for (const t of rowsToExport) {
        const amount = Number(t.amount);
        if (!Number.isFinite(amount)) continue;

        const dateObj = t.date instanceof Date ? t.date : new Date(t.date);
        if (Number.isNaN(dateObj.getTime())) continue;

        if (t.type === 'income') totalIncome += amount;
        else if (t.type === 'expense') totalExpense += amount;
        exportedCount += 1;

        const row = ws.addRow({
          id: t._id.toString(),
          date: localDateStamp(dateObj),
          type: String(t.type || '').toUpperCase(),
          category: t.category || 'Uncategorized',
          note: t.note || '',
          amount: `${currencySymbol}${amount.toFixed(2)}`,
        });

        row.getCell('amount').font = {
          bold: true,
          color: { argb: t.type === 'income' ? 'FF10B981' : 'FFEF4444' },
        };
      }

      // Light borders on every cell.
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top:    { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left:   { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right:  { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });
      });

      /* ── Summary sheet ──────────────────────────────────── */

      const summaryWs = workbook.addWorksheet('Summary', {
        properties: { tabColor: { argb: 'FF059669' } },
      });
      summaryWs.addRow(['Metric', 'Value']);
      summaryWs.addRow(['Total Income', `${currencySymbol}${totalIncome.toFixed(2)}`]);
      summaryWs.addRow(['Total Expenses', `${currencySymbol}${totalExpense.toFixed(2)}`]);
      summaryWs.addRow(['Net', `${currencySymbol}${(totalIncome - totalExpense).toFixed(2)}`]);
      summaryWs.addRow(['Transactions Exported', exportedCount]);
      if (truncated) {
        summaryWs.addRow([
          'Note',
          `Export truncated at ${MAX_EXPORT_ROWS} rows. Apply a date filter to export the rest.`,
        ]);
      }
      summaryWs.getRow(1).font = { bold: true };
      summaryWs.getColumn(1).width = 22;
      summaryWs.getColumn(2).width = 40;

      const safeUsername = String(user.username || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `MyCoinwise_${safeUsername}_${localDateStamp()}.xlsx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      );

      await workbook.xlsx.write(res);
      return res.end();
    } catch (error) {
      logger.error('[Excel Export] error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Unable to generate export.' });
      }
      // Headers already sent — cannot send a JSON error. End the stream.
      return res.end();
    }
  }
);

/* ============================================================
 * GET /backup/:userId — Full JSON backup
 * ============================================================ */

router.get(
  '/backup/:userId',
  checkOwnership('userId'),
  [param('userId').isMongoId().withMessage('Invalid user ID.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;

    try {
      const user = await User.findById(userId).lean();
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // Soft-deleted rows are excluded where the model supports it.
      // Collections without an is_deleted field are returned in full.
      const [
        transactions,
        goals,
        subscriptions,
        events,
        wealthItems,
        netWorthHistory,
        budgets,
        accounts,
        calculations,
        taxProfiles,
        taxTags,
        taxPayments,
        taxDocuments,
      ] = await Promise.all([
        Transaction.find({ user_id: userId, is_deleted: { $ne: true } })
          .limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Goal.find({ user_id: userId, is_deleted: { $ne: true } })
          .limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Subscription.find({ user_id: userId, is_deleted: { $ne: true } })
          .limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Event.find({ user_id: userId, is_deleted: { $ne: true } })
          .limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        WealthItem.find({ user_id: userId, is_deleted: { $ne: true } })
          .limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        NetWorthHistory.find({ user_id: userId, is_deleted: { $ne: true } })
          .limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Budget.find({ user_id: userId })
          .limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Account.find({ user_id: userId })
          .limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Calculation.find({ user_id: userId })
          .sort({ created_at: -1 })
          .limit(MAX_BACKUP_DOCS_PER_COLLECTION)
          .lean(),
        TaxProfile.find({ user_id: userId }).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        TaxTag.find({ user_id: userId }).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        TaxPayment.find({ user_id: userId }).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        TaxDocument.find({ user_id: userId }).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
      ]);

      const backup = {
        version: 5,
        exportedAt: new Date().toISOString(),
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          currency: user.currency,
          theme: user.theme,
          monthly_goal: user.monthly_goal,
          household_id: user.household_id,
        },
        transactions: transactions.map(stripInternalFields),
        goals: goals.map(stripInternalFields),
        subscriptions: subscriptions.map(stripInternalFields),
        events: events.map(stripInternalFields),
        wealthItems: wealthItems.map(stripInternalFields),
        netWorthHistory: netWorthHistory.map(stripInternalFields),
        budgets: budgets.map(stripInternalFields),
        accounts: accounts.map(stripInternalFields),
        calculations: calculations.map(stripInternalFields),
        taxProfiles: taxProfiles.map(stripInternalFields),
        taxTags: taxTags.map(stripInternalFields),
        taxPayments: taxPayments.map(stripInternalFields),
        taxDocuments: taxDocuments.map(stripInternalFields),
      };

      const filename = `MyCoinwise_backup_${localDateStamp()}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      );

      return res.json(backup);
    } catch (error) {
      logger.error('[Backup] export error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Unable to export backup.' });
      }
      return res.end();
    }
  }
);

module.exports = router;
