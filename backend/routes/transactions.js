/* —————————————————————————————————————
 * Transaction Routes
 * Management, statement import, and recurring processing.
 *
 * Endpoints:
 *   POST   /statement/preview    Parse + classify a bank CSV
 *   POST   /statement/import     Import selected rows
 *   GET    /:userId              List (processes recurring first)
 *   POST   /process-recurring    Force-process recurring
 *   POST   /                     Create
 *   PUT    /:id                  Update
 *   DELETE /:id                  Soft delete
 *   POST   /bulk-delete          Soft delete many
 *
 * Key behaviors:
 *   - Statement parsing supports CSV (comma or semicolon) up to 5 MB
 *     and 1000 rows per request.
 *   - Recurring instances are created via an atomic upsert keyed on
 *     `recurrence_instance_key`, so concurrent requests cannot
 *     produce duplicates.
 *   - GET /:userId throttles recurring processing with a 15-minute
 *     per-user cooldown to avoid heavy loops on every read.
 *   - Balances are re-synced (user + affected accounts) after every
 *     mutation.
 *
 * Fixes applied vs. the original:
 *   CRITICAL
 *   - parseTransactionAmount no longer uses a raw float comparison to
 *     enforce 2 decimal places. The original check
 *       `Math.round(amount * 100) !== amount * 100`
 *     rejected most normal amounts (12.34, 0.10, 5.55, …) because of
 *     IEEE 754 imprecision. Now uses an epsilon comparison.
 *   HIGH
 *   - Router-level auth guard. Without it, POST /statement/* and
 *     POST /process-recurring read req.user.id unguarded and would
 *     throw if authentication was ever skipped upstream.
 *   - processRecurringForUser is now race-safe. The original did
 *     `exists()` then `create()`, allowing two concurrent GETs to
 *     generate duplicate instances of the same recurrence. Now uses
 *     an atomic upsert keyed on recurrence_instance_key.
 *   MEDIUM
 *   - syncAccountBalances runs in parallel and validates ObjectIds.
 *     The original could pass an invalid id to `new ObjectId(...)`
 *     and crash.
 *   - audit_logs is initialised defensively on PUT. The original
 *     crashed if the field was missing on legacy documents.
 *   - Ownership comparisons use String() on both sides. The original
 *     compared `t.user_id.toString() !== req.user.id`, which fails
 *     when req.user.id is an ObjectId rather than a string.
 *   - Statement preview and import now apply ownership on the
 *     fingerprint query, and empty-string fingerprints are rejected
 *     up front.
 *   LOW
 *   - logger.error instead of console.error for consistency.
 *   - Cache-Control middleware on every response.
 *   - Response shapes aligned across mutation endpoints.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Account = require('../models/Account');
const checkOwnership = require('../middleware/ownership');
const auth = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { dedupeTransactions } = require('../utils/transactionIntegrity');

// ── Create router ──
const router = express.Router();

/* —————————————————————————————————————
 * Constants
 * ————————————————————————————————————— */

// ── Allowed transaction types ──
const TRANSACTION_TYPES = new Set(['income', 'expense']);

// ── Statement import limits ──
const IMPORT_LIMIT = 1000;
const MAX_AMOUNT = 999_999_999.99;

// ── Safety cap on recurring instances generated per template ──
const RECURRING_SAFETY_CAP = 240;

// ── Fallback FX rates to INR (used when no live rate is available) ──
const FALLBACK_RATES_TO_INR = Object.freeze({
  INR: 1, USD: 83.5, EUR: 90.2, GBP: 105.8, JPY: 0.56, CAD: 61.2,
  AUD: 53.8, SGD: 61.5, AED: 22.7, CHF: 95, CNY: 11.5, MXN: 4.9,
  BRL: 16.4, KRW: 0.063, THB: 2.35,
});

/* —————————————————————————————————————
 * Text / Amount / Date Parsing Helpers
 * ————————————————————————————————————— */

// ── Collapse whitespace and trim ──
const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

// ── Normalize a string for fuzzy merchant matching ──
const normalizeForMatch = (value) =>
  cleanText(value).toLowerCase().replace(/[^a-z0-9@]/g, '');

// ── Parse an amount out of a raw statement cell ──
// Handles currency symbols, thousands separators, parenthesised
// negatives, and blank/null markers.
const parseStatementAmount = (value) => {
  const raw = cleanText(value).replace(/[₹$€£,\s]/g, '');
  if (!raw || raw === '-' || raw.toLowerCase() === 'null') return null;
  const normalized = raw.replace(/^\((.*)\)$/, '-$1');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount !== 0 ? Math.abs(amount) : null;
};

// ── Validate and normalize a transaction amount ──
// Enforces at most two decimals using an epsilon tolerance (see the
// CRITICAL fix note in the header).
const parseTransactionAmount = (value) => {
  const amount =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;

  // Reject values with more than two decimal places using an epsilon
  // tolerance so legitimate amounts like 12.34 are accepted.
  const scaled = amount * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) return null;

  return Math.round(scaled) / 100;
};

// ── Parse a transaction date (defaults to now when absent) ──
// `YYYY-MM-DD` is interpreted as a noon-local date so timezone shifts
// never move it to the previous/next day.
const parseTransactionDate = (value) => {
  if (value === undefined || value === null || value === '') return new Date();
  const dateOnly = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(year, month - 1, day, 12);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) return null;
    return date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// ── Return true when the date is after the end of today ──
const isFutureDate = (date) => {
  if (!date) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return date.getTime() > endOfToday.getTime();
};

// ── Normalize a currency code (uppercase, default fallback) ──
const normalizeCurrency = (value, fallback = 'USD') => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || fallback;
};

// ── Convert an amount between currencies using fallback rates ──
const convertToCurrency = (amount, fromCurrency, toCurrency) => {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return Number(amount) || 0;
  const fromRate = FALLBACK_RATES_TO_INR[from];
  const toRate = FALLBACK_RATES_TO_INR[to];
  if (!fromRate || !toRate) return Number(amount) || 0;
  return (Number(amount) || 0) * fromRate / toRate;
};

/* —————————————————————————————————————
 * CSV Parsing
 * ————————————————————————————————————— */

// ── Parse CSV text into a 2D array of trimmed cells ──
// Auto-detects comma vs. semicolon delimiter, honours quoted fields
// with "" escapes, and strips a leading BOM.
const parseCsv = (content) => {
  const rows = [];
  let row = [], field = '', quoted = false;
  const text = String(content || '').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter =
    (firstLine.match(/;/g) || []).length >
    (firstLine.match(/,/g) || []).length
      ? ';'
      : ',';

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

// ── Normalize a header cell for column matching ──
const headerKey = (value) => cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Find the first header index matching one of the given names ──
const findColumn = (headers, names) => headers.findIndex((h) => names.includes(h));

// ── Convert a date cell into an ISO YYYY-MM-DD string ──
// Handles DD/MM/YYYY vs MM/DD/YYYY ambiguity by assuming the larger
// number is the day when it exceeds 12.
const toIsoDay = (value) => {
  const source = cleanText(value);
  if (!source) return null;
  const match = source.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) {
    const direct = new Date(source);
    return Number.isNaN(direct.getTime()) ? null : direct.toISOString().slice(0, 10);
  }
  const [, first, second, yearRaw] = match;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  const day = Number(first) > 12 ? first : second;
  const month = Number(first) > 12 ? second : first;
  const parsed = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

/* —————————————————————————————————————
 * Classification Rules
 * ————————————————————————————————————— */

// ── Payment-method detection rules (ordered by precedence) ──
const PAYMENT_RULES = [
  ['upi', /\bupi\b|@\w+|gpay|google pay|phonepe|phone pe|bhim/],
  ['card', /\b(pos|card|visa|mastercard|rupay|amex)\b/],
  ['bank_transfer', /\b(neft|imps|rtgs|ach|ecs|bank transfer)\b/],
  ['wallet', /paytm|mobikwik|freecharge|amazon pay/],
];

// ── Category detection rules (ordered by precedence) ──
const CATEGORY_RULES = [
  ['Groceries', /grocery|supermarket|mart|bigbasket|blinkit|zepto|dmart/],
  ['Food', /restaurant|cafe|coffee|swiggy|zomato|food|dining/],
  ['Transport', /uber|ola|metro|fuel|petrol|diesel|parking|rapido/],
  ['Shopping', /amazon|flipkart|myntra|meesho|store/],
  ['Bills', /electricity|water bill|gas bill|broadband|mobile recharge|jio|airtel|vi /],
  ['Subscriptions', /netflix|spotify|youtube|prime|hotstar|subscription/],
  ['Health', /hospital|clinic|pharmacy|medical|apollo/],
  ['Rent', /\brent\b/],
  ['Travel', /airline|hotel|irctc|makemytrip|booking\.com/],
  ['Education', /school|college|course|udemy|coursera/],
  ['Investment', /mutual fund|zerodha|groww|sip|investment/],
];

// ── Extract UPI handle / IFSC / account number from a description ──
const extractBankDetails = (description) => {
  const upiHandle = description.match(/@([a-z0-9._-]+)/i)?.[1];
  const ifsc = description.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/i)?.[0];
  const account = description.match(
    /(?:a\/c|account)\s*(?:no\.?|#)?\s*(\*{2,}\d{3,6}|\d{4,})/i
  )?.[1];
  return (
    cleanText(
      [
        upiHandle && `UPI: @${upiHandle}`,
        ifsc && `IFSC: ${ifsc}`,
        account && `A/C: ${account}`,
      ]
        .filter(Boolean)
        .join(' · ')
    ) || null
  );
};

// ── Extract a merchant name from a raw description ──
const extractMerchant = (description) => {
  const value = cleanText(description)
    .replace(/\b(upi|imps|neft|rtgs|pos|dr|cr|debit|credit|transfer|payment|txn|transaction)\b/gi, ' ')
    .replace(/\b\d{8,}\b/g, ' ');
  const parts = value
    .split(/[\/:|,-]+/)
    .map(cleanText)
    .filter((part) => part && !/^\d+$/.test(part));
  const candidate =
    parts.find((part) => part.length > 2 && !/^(to|from|ref|by|at|via)$/i.test(part)) ||
    value;
  return cleanText(candidate).slice(0, 150) || 'Bank transaction';
};

// ── Classify a single CSV row into a normalized transaction ──
// Returns null when the row is unusable (missing description, amount,
// or date).
const classifyStatementRow = (row, columns, merchantCategories) => {
  const description = cleanText(
    row[columns.description] ||
      row[columns.narration] ||
      row[columns.particulars] ||
      ''
  );
  const debit = parseStatementAmount(row[columns.debit]);
  const credit = parseStatementAmount(row[columns.credit]);
  const genericAmount = parseStatementAmount(row[columns.amount]);
  const typeHint = cleanText(row[columns.type]).toLowerCase();
  const isIncome =
    credit !== null ||
    (!debit && /credit|\bcr\b|deposit|received/.test(typeHint + description.toLowerCase()));
  const amount = debit ?? credit ?? genericAmount;
  if (!description || !amount || amount <= 0) return null;

  const merchant = extractMerchant(description);
  const normalizedMerchant = normalizeForMatch(merchant);
  const savedCategory = merchantCategories.get(normalizedMerchant);
  const categoryRule = CATEGORY_RULES.find(([, rule]) =>
    rule.test(description.toLowerCase())
  );
  const category = isIncome
    ? /(salary|payroll)/i.test(description)
      ? 'Salary'
      : 'Other'
    : savedCategory || categoryRule?.[0] || 'Other';
  const paymentMethod =
    PAYMENT_RULES.find(([, rule]) => rule.test(description.toLowerCase()))?.[0] ||
    'bank_transfer';
  const date = toIsoDay(row[columns.date] || row[columns.valueDate]);
  if (!date) return null;
  const reference = cleanText(row[columns.reference] || row[columns.ref] || '');
  const fingerprint = crypto
    .createHash('sha256')
    .update(
      [
        date,
        isIncome ? 'income' : 'expense',
        amount.toFixed(2),
        normalizedMerchant,
        normalizeForMatch(reference),
      ].join('|')
    )
    .digest('hex');

  return {
    date,
    type: isIncome ? 'income' : 'expense',
    amount,
    category,
    merchant,
    payment_method: paymentMethod,
    counterparty_bank: extractBankDetails(description),
    external_reference: reference || null,
    note: description.slice(0, 500),
    import_fingerprint: fingerprint,
    confidence: savedCategory ? 'high' : categoryRule ? 'medium' : 'low',
  };
};

/* —————————————————————————————————————
 * Payload Validation
 * ————————————————————————————————————— */

// ── Validate and normalize a transaction payload ──
// Returns { error } on failure, or a normalized object of parsed
// fields on success.
const validateTransactionPayload = (payload) => {
  const {
    type, category, amount, date, note, merchant, tags, payment_method,
    account_id, is_recurring, recurrence_interval, recurrence_ends_at,
    is_split, split_details, transaction_number, currency,
  } = payload;

  const numericAmount = parseTransactionAmount(amount);
  if (!TRANSACTION_TYPES.has(type)) return { error: 'Type must be income or expense.' };
  if (typeof category !== 'string' || !category.trim() || category.trim().length > 80) {
    return { error: 'A valid category is required.' };
  }
  if (numericAmount === null) {
    return { error: 'Amount must be a positive number with at most 2 decimals.' };
  }
  const parsedDate = parseTransactionDate(date);
  if (!parsedDate) return { error: 'Date must be valid.' };
  if (isFutureDate(parsedDate)) return { error: 'Transaction date cannot be in the future.' };
  if (currency !== undefined && currency !== null && currency !== '' && !/^[A-Z]{3}$/i.test(String(currency).trim())) {
    return { error: 'Currency must be a valid 3-letter code.' };
  }
  if (note !== undefined && note !== null && String(note).length > 500) {
    return { error: 'Note must be 500 characters or fewer.' };
  }
  if (
    account_id !== undefined &&
    account_id !== null &&
    account_id !== '' &&
    !mongoose.isValidObjectId(account_id)
  ) {
    return { error: 'Account ID is invalid.' };
  }

  // ── Build normalized output ──
  const parsed = { numericAmount, parsedDate };
  if (currency !== undefined) parsed.currency = normalizeCurrency(currency);
  if (merchant !== undefined) parsed.merchant = merchant ? String(merchant).trim() : null;
  if (tags !== undefined) {
    parsed.tags = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [];
  }
  if (payment_method !== undefined) parsed.payment_method = payment_method;
  if (account_id !== undefined) parsed.account_id = account_id || null;
  if (transaction_number !== undefined) {
    parsed.transaction_number = transaction_number ? String(transaction_number).trim() : null;
  }
  if (is_recurring !== undefined) parsed.is_recurring = Boolean(is_recurring);
  if (recurrence_interval !== undefined) parsed.recurrence_interval = recurrence_interval;
  if (recurrence_ends_at !== undefined) {
    parsed.recurrence_ends_at = recurrence_ends_at ? new Date(recurrence_ends_at) : null;
  }
  if (is_split !== undefined) parsed.is_split = Boolean(is_split);
  if (split_details !== undefined && Array.isArray(split_details)) {
    parsed.split_details = split_details.map((s) => ({
      person: String(s.person).trim(),
      amount: parseTransactionAmount(s.amount) || 0,
      paid: Boolean(s.paid),
    }));
  }
  return parsed;
};

/* —————————————————————————————————————
 * Balance Sync
 * ————————————————————————————————————— */

// ── Aggregate the user's net transaction balance ──
// Returns 0 for invalid user IDs.
const getTransactionBalance = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) return 0;
  const [user, transactions, accounts] = await Promise.all([
    User.findById(userId).select('currency').lean(),
    Transaction.find({ user_id: userId, is_deleted: { $ne: true } })
      .select('type amount currency account_id')
      .lean(),
    Account.find({ user_id: userId }).select('_id currency').lean(),
  ]);
  const displayCurrency = normalizeCurrency(user?.currency);
  const accountCurrencies = new Map(accounts.map((account) => [String(account._id), normalizeCurrency(account.currency, displayCurrency)]));
  const balance = dedupeTransactions(transactions).reduce((sum, transaction) => {
    const sourceCurrency = normalizeCurrency(
      transaction.currency || accountCurrencies.get(String(transaction.account_id || '')),
      displayCurrency
    );
    const amount = convertToCurrency(transaction.amount, sourceCurrency, displayCurrency);
    return sum + (transaction.type === 'income' ? amount : -amount);
  }, 0);
  return Number(balance.toFixed(2));
};

// ── Recalculate and persist the user's cached balance ──
const syncUserBalance = async (userId) => {
  const balance = await getTransactionBalance(userId);
  await User.findByIdAndUpdate(userId, { $set: { balance } });
  return balance;
};

// ── Recalculate current_balance for the given accounts ──
// Runs in parallel; skips invalid ids instead of throwing.
const syncAccountBalances = async (accountIds = []) => {
  const uniqueIds = [...new Set(accountIds.filter(Boolean).map(String))].filter(
    (id) => mongoose.isValidObjectId(id)
  );

  await Promise.all(
    uniqueIds.map(async (accountId) => {
      const account = await Account.findById(accountId).select('initial_balance');
      if (!account) return;

      const [result] = await Transaction.aggregate([
        {
          $match: {
            account_id: new mongoose.Types.ObjectId(accountId),
            is_deleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: '$account_id',
            income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
            expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
          },
        },
      ]);

      const balance = Number(
        (
          Number(account.initial_balance || 0) +
          (result?.income || 0) -
          (result?.expense || 0)
        ).toFixed(2)
      );
      await Account.findByIdAndUpdate(accountId, { $set: { current_balance: balance } });
    })
  );
};

/* —————————————————————————————————————
 * Recurring Transactions
 * ————————————————————————————————————— */

// ── Compute the next occurrence date for a given interval ──
const nextOccurrence = (date, interval) => {
  const next = new Date(date);
  if (interval === 'daily') next.setDate(next.getDate() + 1);
  else if (interval === 'weekly') next.setDate(next.getDate() + 7);
  else if (interval === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (interval === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else return null;
  return next;
};

// ── Materialise overdue occurrences of recurring transactions ──
// Uses an atomic upsert keyed on `recurrence_instance_key`, so two
// concurrent requests cannot create the same instance twice. A unique
// index on { user_id, recurrence_instance_key } in models/Transaction.js
// strengthens the guarantee at the DB level.
const processRecurringForUser = async (userId) => {
  const now = new Date();
  const templates = await Transaction.find({
    user_id: userId,
    is_recurring: true,
    is_deleted: { $ne: true },
    recurrence_interval: { $ne: null },
  }).select('+recurrence_instance_key');

  let created = 0;
  const affectedAccountIds = new Set();

  for (const template of templates) {
    if (template.account_id) affectedAccountIds.add(String(template.account_id));

    let occurrence = nextOccurrence(template.date, template.recurrence_interval);
    let safety = 0;

    while (occurrence && occurrence <= now && safety < RECURRING_SAFETY_CAP) {
      if (template.recurrence_ends_at && occurrence > template.recurrence_ends_at) break;

      const instanceKey = `${template._id.toString()}:${occurrence
        .toISOString()
        .slice(0, 10)}`;

      try {
        const result = await Transaction.updateOne(
          { user_id: userId, recurrence_instance_key: instanceKey },
          {
            $setOnInsert: {
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
              transaction_number: template.transaction_number,
              account_id: template.account_id,
              receipt_url: template.receipt_url,
              is_one_time: true,
              is_recurring: false,
              recurrence_interval: null,
              parent_transaction_id: template._id,
              recurrence_instance_key: instanceKey,
              audit_logs: [
                { action: 'Generated recurring transaction', timestamp: new Date() },
              ],
            },
          },
          { upsert: true }
        );

        if (result.upsertedCount > 0) created += 1;
      } catch (err) {
        // Duplicate key on recurrence_instance_key: another request
        // won the race. Not an error.
        if (err?.code !== 11000) throw err;
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

/* —————————————————————————————————————
 * Recurring Cooldown
 * Prevents running heavy upsert loops on every single GET request.
 * ————————————————————————————————————— */
const lastRecurringProcessMap = new Map();
const RECURRING_CHECK_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

// ── Return true when the cooldown for this user has elapsed ──
const shouldProcessRecurring = (userId) => {
  const key = String(userId);
  const last = lastRecurringProcessMap.get(key);
  const now = Date.now();
  if (!last || now - last > RECURRING_CHECK_COOLDOWN_MS) {
    lastRecurringProcessMap.set(key, now);
    return true;
  }
  return false;
};

/* —————————————————————————————————————
 * Router Middleware
 * ————————————————————————————————————— */

// ── Auth + user-id guard + Cache-Control applied to every route ──
router.use(auth);

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

/* —————————————————————————————————————
 * POST /statement/preview
 * Parse and classify a bank statement CSV.
 * ————————————————————————————————————— */
router.post('/statement/preview', async (req, res) => {
  try {
    // ── Guard size and shape of the uploaded content ──
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (!content || Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Upload a CSV statement smaller than 5 MB.' });
    }

    // ── Parse rows and enforce the import cap ──
    const csvRows = parseCsv(content);
    if (csvRows.length < 2 || csvRows.length > IMPORT_LIMIT + 1) {
      return res.status(400).json({
        error: `Statement must contain between 1 and ${IMPORT_LIMIT} transactions.`,
      });
    }

    // ── Resolve column indexes ──
    const headers = csvRows[0].map(headerKey);
    const columns = {
      date: findColumn(headers, ['date', 'transactiondate', 'txndate']),
      valueDate: findColumn(headers, ['valuedate', 'valuedt']),
      description: findColumn(headers, ['description', 'transactiondetails', 'details']),
      narration: findColumn(headers, ['narration']),
      particulars: findColumn(headers, ['particulars']),
      debit: findColumn(headers, ['debit', 'debitamount', 'withdrawal', 'withdrawalamt']),
      credit: findColumn(headers, ['credit', 'creditamount', 'deposit', 'depositamt']),
      amount: findColumn(headers, ['amount', 'transactionamount']),
      type: findColumn(headers, ['type', 'transactiontype', 'drcr']),
      reference: findColumn(headers, ['referenceno', 'reference', 'transactionid', 'utr', 'chqrefno']),
      ref: findColumn(headers, ['refno', 'ref']),
    };
    if (
      (columns.date < 0 && columns.valueDate < 0) ||
      (columns.description < 0 && columns.narration < 0 && columns.particulars < 0)
    ) {
      return res.status(400).json({
        error: 'Could not find date and description columns. Export the statement as CSV from your bank.',
      });
    }

    // ── Load user history to inform classification and dedup ──
    const historical = await Transaction.find({
      user_id: req.userId,
      is_deleted: { $ne: true },
    })
      .select('merchant category note date type amount import_fingerprint')
      .sort({ date: -1 })
      .limit(5000)
      .lean();

    const merchantCategories = new Map();
    const existingFingerprints = new Set();
    const existingKeys = new Set();

    for (const tx of historical) {
      const merchant = normalizeForMatch(tx.merchant || tx.note);
      if (
        merchant &&
        tx.category &&
        tx.category !== 'Other' &&
        !merchantCategories.has(merchant)
      ) {
        merchantCategories.set(merchant, tx.category);
      }
      if (tx.import_fingerprint) existingFingerprints.add(tx.import_fingerprint);
      const day = new Date(tx.date).toISOString().slice(0, 10);
      existingKeys.add(
        [day, tx.type, Number(tx.amount).toFixed(2), merchant].join('|')
      );
    }

    // ── Classify each row and flag duplicates ──
    const seen = new Set();
    const transactions = csvRows
      .slice(1)
      .map((row, index) => {
        const transaction = classifyStatementRow(row, columns, merchantCategories);
        if (!transaction) return null;
        const fallbackKey = [
          transaction.date,
          transaction.type,
          transaction.amount.toFixed(2),
          normalizeForMatch(transaction.merchant),
        ].join('|');
        const duplicate =
          seen.has(transaction.import_fingerprint) ||
          existingFingerprints.has(transaction.import_fingerprint) ||
          existingKeys.has(fallbackKey);
        seen.add(transaction.import_fingerprint);
        return { id: `row-${index + 1}`, ...transaction, duplicate };
      })
      .filter(Boolean);

    if (!transactions.length) {
      return res.status(400).json({ error: 'No valid transactions were found in this statement.' });
    }

    return res.json({
      transactions,
      summary: {
        detected: transactions.length,
        duplicates: transactions.filter((t) => t.duplicate).length,
        categorized: transactions.filter((t) => t.category !== 'Other').length,
      },
    });
  } catch (error) {
    logger.error('Statement preview failed:', error);
    return res.status(500).json({ error: 'Could not analyze this statement.' });
  }
});

/* —————————————————————————————————————
 * POST /statement/import
 * Import selected statement rows into the user's wallet.
 * ————————————————————————————————————— */
router.post('/statement/import', async (req, res) => {
  try {
    // ── Validate the request payload ──
    const requested = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
    if (!requested.length || requested.length > IMPORT_LIMIT) {
      return res.status(400).json({
        error: `Select between 1 and ${IMPORT_LIMIT} transactions to add.`,
      });
    }

    // ── Look up fingerprints already present for this user ──
    const fingerprints = requested
      .map((item) => String(item.import_fingerprint || ''))
      .filter(Boolean);

    const existing = new Set(
      (
        await Transaction.find({
          user_id: req.userId,
          import_fingerprint: { $in: fingerprints },
        })
          .select('import_fingerprint')
          .lean()
      ).map((tx) => tx.import_fingerprint)
    );

    // ── Filter and normalize the batch ──
    const batchKeys = new Set();
    const accepted = [];
    const owner = await User.findById(req.userId).select('currency').lean();
    const defaultCurrency = normalizeCurrency(owner?.currency);
    let skipped = 0;

    for (const item of requested) {
      const validation = validateTransactionPayload(item);
      const merchant = cleanText(item.merchant).slice(0, 150) || null;
      const fingerprint = String(item.import_fingerprint || '').slice(0, 64);
      const key = [
        validation.parsedDate?.toISOString().slice(0, 10),
        item.type,
        validation.numericAmount?.toFixed(2),
        normalizeForMatch(merchant || item.note),
      ].join('|');

      if (
        validation.error ||
        !fingerprint ||
        existing.has(fingerprint) ||
        batchKeys.has(key)
      ) {
        skipped += 1;
        continue;
      }

      batchKeys.add(key);
      accepted.push({
        user_id: req.userId,
        type: item.type,
        category: cleanText(item.category).slice(0, 80),
        amount: validation.numericAmount,
        currency: validation.currency || defaultCurrency,
        date: validation.parsedDate,
        note: cleanText(item.note).slice(0, 500) || null,
        merchant,
        payment_method: ['cash', 'card', 'upi', 'bank_transfer', 'wallet', 'cheque', 'other'].includes(
          item.payment_method
        )
          ? item.payment_method
          : 'bank_transfer',
        counterparty_bank: cleanText(item.counterparty_bank).slice(0, 200) || null,
        external_reference: cleanText(item.external_reference).slice(0, 150) || null,
        import_fingerprint: fingerprint,
        import_source: 'bank_statement',
        audit_logs: [{ action: 'Imported from bank statement', timestamp: new Date() }],
      });
    }

    if (!accepted.length) {
      return res.json({
        created: 0,
        skipped,
        message: 'All selected transactions were already imported or invalid.',
      });
    }

    // ── Second-pass dedup against existing rows in the same window ──
    const dates = accepted.map((tx) => tx.date.getTime());
    const existingTransactions = await Transaction.find({
      user_id: req.userId,
      is_deleted: { $ne: true },
      date: {
        $gte: new Date(Math.min(...dates) - 24 * 60 * 60 * 1000),
        $lte: new Date(Math.max(...dates) + 24 * 60 * 60 * 1000),
      },
    })
      .select('date type amount merchant note')
      .lean();

    const existingKeys = new Set(
      existingTransactions.map((tx) =>
        [
          new Date(tx.date).toISOString().slice(0, 10),
          tx.type,
          Number(tx.amount).toFixed(2),
          normalizeForMatch(tx.merchant || tx.note),
        ].join('|')
      )
    );

    const newTransactions = accepted.filter((tx) => {
      const key = [
        tx.date.toISOString().slice(0, 10),
        tx.type,
        tx.amount.toFixed(2),
        normalizeForMatch(tx.merchant || tx.note),
      ].join('|');
      if (existingKeys.has(key)) {
        skipped += 1;
        return false;
      }
      return true;
    });

    if (!newTransactions.length) {
      return res.json({
        created: 0,
        skipped,
        message: 'All selected transactions were already in your wallet.',
      });
    }

    // ── Insert and refresh balances ──
    const created = await Transaction.insertMany(newTransactions, { ordered: false });
    const balance = await syncUserBalance(req.userId);
    return res.status(201).json({
      created: created.length,
      skipped,
      balance,
      message: `${created.length} transaction(s) added to wallet.`,
    });
  } catch (error) {
    logger.error('Statement import failed:', error);
    return res.status(500).json({ error: 'Could not import the selected transactions.' });
  }
});

/* —————————————————————————————————————
 * GET /:userId
 * List a user's transactions, newest first.
 * ————————————————————————————————————— */
router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  // ── Validate and authorize the target user ──
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    // Note: an earlier version ran full recurring processing and
    // balance syncs on every GET, causing a heavy read-path
    // bottleneck. Now throttled to once per 15 minutes per user.
    if (shouldProcessRecurring(req.params.userId)) {
      await processRecurringForUser(req.params.userId);
    }

    // ── Paginate and load non-deleted transactions ──
    const limit = Math.min(
      2000,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 2000)
    );
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({
      user_id: req.params.userId,
      is_deleted: { $ne: true },
    })
      .sort({ date: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    return res.json(dedupeTransactions(transactions.map((transaction) => transaction.toObject())));
  } catch (error) {
    logger.error('[Transactions] list error:', error);
    return res.status(500).json({ error: 'Unable to load transactions.' });
  }
});

/* —————————————————————————————————————
 * POST /process-recurring
 * Force-process recurring transactions for the authenticated user.
 * ————————————————————————————————————— */
router.post('/process-recurring', async (req, res) => {
  try {
    // ── Reset the cooldown since this was an explicit request ──
    lastRecurringProcessMap.set(String(req.userId), Date.now());

    // ── Process and report ──
    const created = await processRecurringForUser(req.userId);
    return res.json({
      created,
      message: created
        ? `Generated ${created} recurring transaction(s).`
        : 'Recurring transactions are up to date.',
    });
  } catch (error) {
    logger.error('[Transactions] process-recurring error:', error);
    return res.status(500).json({ error: 'Failed to process recurring transactions.' });
  }
});

/* —————————————————————————————————————
 * POST /
 * Create a new transaction.
 * ————————————————————————————————————— */
router.post('/', async (req, res) => {
  try {
    // ── Validate the payload ──
    const validation = validateTransactionPayload(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });

    // ── Resolve the account (when provided) ──
    let selectedAccount = null;
    if (validation.account_id) {
      selectedAccount = await Account.findOne({
        _id: validation.account_id,
        user_id: req.userId,
      }).select('currency').lean();
      if (!selectedAccount) {
        return res.status(400).json({ error: 'Selected account was not found.' });
      }
    }

    // ── Determine the effective currency ──
    const owner = await User.findById(req.userId).select('currency').lean();
    const transactionCurrency = normalizeCurrency(
      validation.currency || selectedAccount?.currency || owner?.currency
    );

    // ── Persist the transaction ──
    const transaction = await Transaction.create({
      user_id: req.userId,
      type: req.body.type,
      category: req.body.category.trim(),
      amount: validation.numericAmount,
      currency: transactionCurrency,
      date: validation.parsedDate,
      note: req.body.note ? String(req.body.note).trim() : null,
      merchant: validation.merchant,
      tags: validation.tags,
      payment_method: validation.payment_method,
      transaction_number: validation.transaction_number,
      account_id: validation.account_id || null,
      is_recurring: validation.is_recurring,
      recurrence_interval: validation.recurrence_interval,
      recurrence_ends_at: validation.recurrence_ends_at,
      is_split: validation.is_split,
      split_details: validation.split_details,
      audit_logs: [{ action: 'Created', timestamp: new Date() }],
    });

    // ── Refresh cached balances ──
    const balance = await syncUserBalance(req.userId);
    await syncAccountBalances([transaction.account_id]);

    return res.status(201).json({ transaction, balance, message: 'Transaction added' });
  } catch (error) {
    logger.error('[Transactions] create error:', error);
    return res.status(500).json({ error: 'Unable to create transaction.' });
  }
});

/* —————————————————————————————————————
 * PUT /:id
 * Update a transaction owned by the authenticated user.
 * ————————————————————————————————————— */
router.put('/:id', async (req, res) => {
  // ── Validate transaction ID ──
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid transaction ID' });
  }

  try {
    // ── Load the transaction ──
    const t = await Transaction.findOne({
      _id: req.params.id,
      is_deleted: { $ne: true },
    });
    if (!t) return res.status(404).json({ error: 'Transaction not found' });

    // ── Verify ownership (String vs String handles ObjectId ids) ──
    if (String(t.user_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Merge incoming fields with existing values so partial updates
    // still pass full-payload validation.
    const next = { ...req.body };
    if (next.type === undefined) next.type = t.type;
    if (next.category === undefined) next.category = t.category;
    if (next.amount === undefined) next.amount = t.amount;
    if (next.date === undefined) next.date = t.date;
    if (next.account_id === undefined) next.account_id = t.account_id;

    const validation = validateTransactionPayload(next);
    if (validation.error) return res.status(400).json({ error: validation.error });

    // ── Resolve the (possibly changed) account ──
    let selectedAccount = null;
    if (validation.account_id) {
      selectedAccount = await Account.findOne({
        _id: validation.account_id,
        user_id: req.userId,
      }).select('currency').lean();
      if (!selectedAccount) {
        return res.status(400).json({ error: 'Selected account was not found.' });
      }
    }

    // ── Determine the effective currency ──
    const owner = await User.findById(req.userId).select('currency').lean();
    const transactionCurrency = normalizeCurrency(
      validation.currency || selectedAccount?.currency || t.currency || owner?.currency
    );

    const previousAccountId = t.account_id;

    // ── Apply the changes ──
    t.type = next.type;
    t.amount = validation.numericAmount;
    t.currency = transactionCurrency;
    t.category = next.category.trim();
    t.note =
      next.note !== undefined ? (next.note ? String(next.note).trim() : null) : t.note;
    t.date = validation.parsedDate;
    t.account_id = validation.account_id || null;

    if (validation.merchant !== undefined) t.merchant = validation.merchant;
    if (validation.tags !== undefined) t.tags = validation.tags;
    if (validation.payment_method !== undefined) t.payment_method = validation.payment_method;
    if (validation.transaction_number !== undefined) t.transaction_number = validation.transaction_number;
    if (validation.is_recurring !== undefined) t.is_recurring = validation.is_recurring;
    if (validation.recurrence_interval !== undefined) t.recurrence_interval = validation.recurrence_interval;
    if (validation.recurrence_ends_at !== undefined) t.recurrence_ends_at = validation.recurrence_ends_at;
    if (validation.is_split !== undefined) t.is_split = validation.is_split;
    if (validation.split_details !== undefined) t.split_details = validation.split_details;

    // Defensive: legacy documents may not have audit_logs yet.
    if (!Array.isArray(t.audit_logs)) t.audit_logs = [];
    t.audit_logs.push({ action: 'Updated', timestamp: new Date() });

    await t.save();

    // ── Refresh cached balances (old and new account) ──
    const balance = await syncUserBalance(req.userId);
    await syncAccountBalances([previousAccountId, t.account_id]);

    return res.json({ transaction: t, balance, message: 'Transaction updated' });
  } catch (error) {
    logger.error('[Transactions] update error:', error);
    return res.status(500).json({ error: 'Unable to update transaction.' });
  }
});

/* —————————————————————————————————————
 * DELETE /:id
 * Soft delete a transaction owned by the authenticated user.
 * ————————————————————————————————————— */
router.delete('/:id', async (req, res) => {
  // ── Validate transaction ID ──
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid transaction ID' });
  }

  try {
    // ── Load and authorize ──
    const t = await Transaction.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaction not found' });

    if (String(t.user_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // ── Soft delete and refresh balances ──
    t.is_deleted = true;
    await t.save();

    const balance = await syncUserBalance(req.userId);
    await syncAccountBalances([t.account_id]);

    return res.json({ balance, message: 'Transaction deleted' });
  } catch (error) {
    logger.error('[Transactions] delete error:', error);
    return res.status(500).json({ error: 'Unable to delete transaction.' });
  }
});

/* —————————————————————————————————————
 * POST /bulk-delete
 * Soft delete many transactions owned by the authenticated user.
 * ————————————————————————————————————— */
router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body || {};

  // ── Validate the request shape ──
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Array of transaction IDs is required' });
  }

  try {
    // ── Filter to valid ObjectIds ──
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid transaction IDs provided' });
    }

    // ── Snapshot affected accounts before updating ──
    const affectedAccountIds = await Transaction.find({
      _id: { $in: validIds },
      user_id: req.userId,
      is_deleted: { $ne: true },
    }).distinct('account_id');

    // ── Soft delete in one updateMany ──
    const result = await Transaction.updateMany(
      { _id: { $in: validIds }, user_id: req.userId },
      { $set: { is_deleted: true } }
    );

    // ── Refresh balances ──
    const balance = await syncUserBalance(req.userId);
    await syncAccountBalances(affectedAccountIds);

    return res.json({
      balance,
      deletedCount: result.modifiedCount,
      message: `${result.modifiedCount} transactions deleted`,
    });
  } catch (error) {
    logger.error('[Transactions] bulk-delete error:', error);
    return res.status(500).json({ error: 'Unable to delete transactions.' });
  }
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router ──
module.exports = router;