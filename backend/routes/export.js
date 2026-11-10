/* —————————————————————————————————————
 * Data Export Routes (Excel + CSV + JSON backup)
 * Generates streaming downloadable exports of a user's financial data.
 *
 * Endpoints:
 *   GET /backup/:userId Full JSON backup of all user data
 *   GET /:userId        Streaming Excel (.xlsx) or CSV export of transactions
 *
 * Key behaviors:
 *   - Router-level rate limit (exportLimiter) and auth apply to all.
 *   - Static /backup/:userId route is registered before dynamic /:userId.
 *   - Both CSV and Excel exports stream directly from a Mongoose cursor
 *     with client-disconnect abort handling for O(1) memory usage.
 *   - Mixed-currency transactions are converted into the user's display
 *     currency when computing Excel Summary totals.
 *   - CSV and Excel cell values are hardened against formula injection.
 * ————————————————————————————————————— */

const express = require('express');
const { config } = require('../config/env');
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
const { CURRENCIES, normalizeCurrency, convertToCurrency } = require('../utils/currency');

const router = express.Router();

// ── Hard caps on export sizes with defensive fallbacks ──
const MAX_EXPORT_ROWS = Number(config.MAX_EXPORT_ROWS) > 0 ? Number(config.MAX_EXPORT_ROWS) : 50_000;
const MAX_BACKUP_DOCS_PER_COLLECTION = Number(config.MAX_BACKUP_DOCS) > 0 ? Number(config.MAX_BACKUP_DOCS) : 100_000;

/* —————————————————————————————————————
 * Router Middleware
 * ————————————————————————————————————— */

const exportLimiter = rateLimit({
  identifier: 'export-router',
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

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

/* —————————————————————————————————————
 * Helpers
 * ————————————————————————————————————— */

const localDateStamp = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const stripInternalFields = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;
  const { __v, ...rest } = doc;
  return rest;
};

const NUMERIC_LIKE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Neutralizes spreadsheet formula injection (including leading-whitespace payloads
 * like "  =CMD()") while preserving plain negative numbers, and escapes RFC 4180 quotes.
 */
const escapeCsv = (val) => {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  const trimmedStart = str.trimStart();
  if (/^[=+\-@\t\r]/.test(trimmedStart) && !NUMERIC_LIKE.test(trimmedStart)) {
    str = `'${trimmedStart}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * Neutralizes spreadsheet formula payloads in Excel string cells and bounds length.
 */
const sanitizeExcelCell = (val, maxLen = 500) => {
  if (val === null || val === undefined) return '';
  let str = String(val).slice(0, maxLen);
  const trimmedStart = str.trimStart();
  if (/^[=+\-@\t\r]/.test(trimmedStart) && !NUMERIC_LIKE.test(trimmedStart)) {
    str = `'${trimmedStart}`;
  }
  return str;
};

/* —————————————————————————————————————
 * GET /backup/:userId
 * Registered before /:userId so "/backup/:id" is never shadowed.
 * Full JSON backup of every user-owned collection.
 * ————————————————————————————————————— */
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

      const activeFilter = { user_id: userId, is_deleted: { $ne: true } };

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
        Transaction.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Goal.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Subscription.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Event.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        WealthItem.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        NetWorthHistory.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Budget.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Account.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        Calculation.find(activeFilter).sort({ created_at: -1 }).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        TaxProfile.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        TaxTag.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        TaxPayment.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
        TaxDocument.find(activeFilter).limit(MAX_BACKUP_DOCS_PER_COLLECTION).lean(),
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

/* —————————————————————————————————————
 * GET /:userId
 * Streaming Excel (.xlsx) or CSV export of transactions for a user,
 * with an optional date range (start / end ISO strings).
 * ————————————————————————————————————— */
router.get(
  '/:userId',
  checkOwnership('userId'),
  [
    param('userId').isMongoId().withMessage('Invalid user ID.'),
    queryValidator('format').optional().isIn(['csv', 'xlsx']).withMessage('Format must be csv or xlsx.'),
    queryValidator('start').optional().isISO8601().toDate(),
    queryValidator('end').optional().isISO8601().toDate(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const { start, end, format = 'xlsx' } = req.query;

    let cursor = null;
    let clientAborted = false;

    const onClientAbort = () => {
      if (!res.writableFinished) {
        clientAborted = true;
      }
      if (cursor && typeof cursor.close === 'function') {
        cursor.close().catch(() => { });
      }
    };
    res.on('close', onClientAbort);

    try {
      const user = await User.findById(userId).lean();
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const displayCurrency = normalizeCurrency(user.currency, 'INR');
      const currencySymbol = (CURRENCIES[displayCurrency] || CURRENCIES.INR).symbol;
      const safeUsername = String(user.username || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');

      const dateRange = {};
      if (start) dateRange.$gte = start;
      if (end) dateRange.$lte = end;

      const filter = {
        user_id: userId,
        is_deleted: { $ne: true },
      };
      if (start || end) filter.date = dateRange;

      cursor = Transaction.find(filter)
        .sort({ date: -1 })
        .limit(MAX_EXPORT_ROWS + 1)
        .lean()
        .cursor();

      // ── Streaming CSV export (constant O(1) memory) ──
      if (format === 'csv') {
        const filename = `MyCoinwise_${safeUsername}_${localDateStamp()}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        );

        const headers = ['ID', 'Date', 'Type', 'Category', 'Amount', 'Currency', 'Note'];
        res.write(`\uFEFF${headers.map(escapeCsv).join(',')}\r\n`);

        let count = 0;
        let truncated = false;

        for await (const t of cursor) {
          if (clientAborted || res.writableEnded) break;

          if (count >= MAX_EXPORT_ROWS) {
            truncated = true;
            break;
          }

          if (!t || !t._id) continue;

          const amount = Number(t.amount);
          if (!Number.isFinite(amount)) continue;

          const dateObj = t.date instanceof Date ? t.date : new Date(t.date);
          if (Number.isNaN(dateObj.getTime())) continue;

          const txCurrency = normalizeCurrency(t.currency, displayCurrency);
          count += 1;

          res.write(
            [
              escapeCsv(t._id.toString()),
              escapeCsv(localDateStamp(dateObj)),
              escapeCsv(String(t.type || '').toUpperCase()),
              escapeCsv(t.category || 'Uncategorized'),
              escapeCsv(amount.toFixed(2)),
              escapeCsv(txCurrency),
              escapeCsv(t.note || ''),
            ].join(',') + '\r\n'
          );
        }

        if (truncated && !clientAborted && !res.writableEnded) {
          res.write(
            [
              escapeCsv('TRUNCATED'),
              escapeCsv(localDateStamp()),
              escapeCsv('INFO'),
              escapeCsv('Notice'),
              escapeCsv('0.00'),
              escapeCsv(displayCurrency),
              escapeCsv(`Export truncated at ${MAX_EXPORT_ROWS} rows. Apply a date filter to export the rest.`),
            ].join(',') + '\r\n'
          );
        }

        if (!res.writableEnded) res.end();
        return undefined;
      }

      // ── Streaming Excel (.xlsx) export via WorkbookWriter ──
      const filename = `MyCoinwise_${safeUsername}_${localDateStamp()}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      );

      const workbook = new excel.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
      });
      workbook.creator = 'MyCoinwise';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('Transactions', {
        pageSetup: { fitToPage: true },
      });
      ws.columns = [
        { header: 'ID', key: 'id', width: 28 },
        { header: 'Date', key: 'date', width: 18 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Category', key: 'category', width: 22 },
        { header: 'Currency', key: 'origCurrency', width: 12 },
        { header: 'Note', key: 'note', width: 36, style: { alignment: { wrapText: true } } },
        { header: `Amount (${displayCurrency})`, key: 'amount', width: 18 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
      headerRow.height = 22;
      headerRow.commit();

      const cellBorder = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      let totalIncome = 0;
      let totalExpense = 0;
      let exportedCount = 0;
      let truncated = false;

      for await (const t of cursor) {
        if (clientAborted || res.writableEnded) break;

        if (exportedCount >= MAX_EXPORT_ROWS) {
          truncated = true;
          break;
        }

        if (!t || !t._id) continue;

        const rawAmount = Number(t.amount);
        if (!Number.isFinite(rawAmount)) continue;

        const dateObj = t.date instanceof Date ? t.date : new Date(t.date);
        if (Number.isNaN(dateObj.getTime())) continue;

        const txCurrency = normalizeCurrency(t.currency, displayCurrency);
        const convertedAmount = convertToCurrency(rawAmount, txCurrency, displayCurrency);

        const tType = String(t.type || '').trim().toLowerCase();
        if (tType === 'income') totalIncome += convertedAmount;
        else if (tType === 'expense') totalExpense += convertedAmount;
        exportedCount += 1;

        const row = ws.addRow({
          id: t._id.toString(),
          date: localDateStamp(dateObj),
          type: String(t.type || '').toUpperCase(),
          category: sanitizeExcelCell(t.category || 'Uncategorized', 80),
          origCurrency: txCurrency,
          note: sanitizeExcelCell(t.note || '', 500),
          amount: `${currencySymbol}${convertedAmount.toFixed(2)}`,
        });

        row.getCell('amount').font = {
          bold: true,
          color: { argb: tType === 'income' ? 'FF10B981' : 'FFEF4444' },
        };
        row.eachCell((cell) => {
          cell.border = cellBorder;
        });
        row.commit();
      }

      if (!clientAborted && !res.writableEnded) {
        await ws.commit();

        const summaryWs = workbook.addWorksheet('Summary', {
          properties: { tabColor: { argb: 'FF059669' } },
        });
        summaryWs.columns = [
          { width: 24 },
          { width: 42 },
        ];
        const sumHeader = summaryWs.addRow(['Metric', `Value (${displayCurrency})`]);
        sumHeader.font = { bold: true };
        sumHeader.commit();

        summaryWs.addRow(['Total Income', `${currencySymbol}${totalIncome.toFixed(2)}`]).commit();
        summaryWs.addRow(['Total Expenses', `${currencySymbol}${totalExpense.toFixed(2)}`]).commit();
        summaryWs.addRow(['Net', `${currencySymbol}${(totalIncome - totalExpense).toFixed(2)}`]).commit();
        summaryWs.addRow(['Transactions Exported', exportedCount]).commit();
        if (truncated) {
          summaryWs.addRow([
            'Note',
            `Export truncated at ${MAX_EXPORT_ROWS} rows. Apply a date filter to export the rest.`,
          ]).commit();
        }
        await summaryWs.commit();
        await workbook.commit();
      }

      if (!res.writableEnded) res.end();
      return undefined;
    } catch (error) {
      logger.error('[Excel Export] error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Unable to generate export.' });
      }
      if (!res.writableEnded) res.end();
      return undefined;
    } finally {
      res.off('close', onClientAbort);
      if (cursor && typeof cursor.close === 'function') {
        await cursor.close().catch(() => { });
      }
    }
  }
);

router.escapeCsv = escapeCsv;
router.sanitizeExcelCell = sanitizeExcelCell;
module.exports = router;
