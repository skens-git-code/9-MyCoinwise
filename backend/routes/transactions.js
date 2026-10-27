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
 *   DELETE /:id                  Hard delete (permanent)
 *   POST   /bulk-delete          Hard delete many (permanent)
 *
 * Key behaviors:
 *   - Statement parsing supports CSV, Excel (.xlsx), and PDF up to 10 MB
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
const { LRUCache } = require('lru-cache');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Account = require('../models/Account');
const checkOwnership = require('../middleware/ownership');
const auth = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { dedupeTransactions } = require('../utils/transactionIntegrity');
const { parseStatement, IMPORT_LIMIT } = require('../services/statementParser');

// ── Create router ──
const router = express.Router();

// ── Per-user maximum transaction cap ──
const USER_TRANSACTION_LIMIT = 1000;

/* —————————————————————————————————————
 * Constants
 * ————————————————————————————————————— */

// ── Allowed transaction types ──
const TRANSACTION_TYPES = new Set(['income', 'expense']);

// ── Enum mirrors of models/Transaction.js ──
// Kept in sync by hand so an invalid value is rejected with a 400 here instead of
// surfacing as an opaque 500 from a Mongoose ValidationError at insert time.
const PAYMENT_METHODS = new Set(['cash', 'card', 'upi', 'bank_transfer', 'wallet', 'cheque', 'other']);
const RECURRENCE_INTERVALS = new Set(['daily', 'weekly', 'monthly', 'yearly']);

// ── Amount bounds ──
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
// CRITICAL fix note in the header). Rejects sub-paisa amounts (e.g. 1e-8).
const parseTransactionAmount = (value) => {
  const amount =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;

  // Reject values with more than two decimal places using an epsilon
  // tolerance so legitimate amounts like 12.34 or MAX_AMOUNT (999,999,999.99)
  // are accepted despite IEEE 754 float drift (~2.4e-5 for MAX_AMOUNT * 100).
  // Also reject sub-paisa amounts (e.g. 1e-8) where rounded <= 0.
  const scaled = amount * 100;
  const rounded = Math.round(scaled);
  const tolerance = Math.max(1e-4, Math.abs(scaled) * 1e-12);
  if (Math.abs(scaled - rounded) > tolerance || rounded <= 0) return null;

  return rounded / 100;
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

// ── Return true when the date is more than 1 day in the future ──
// Allows a 1-day grace period to accommodate client timezones up to UTC+14 (e.g., Kiribati)
// without rejecting valid local-date transactions submitted by users east of UTC.
const isFutureDate = (date) => {
  if (!date) return false;
  const endOfGracePeriod = new Date();
  endOfGracePeriod.setDate(endOfGracePeriod.getDate() + 1);
  endOfGracePeriod.setHours(23, 59, 59, 999);
  return date.getTime() > endOfGracePeriod.getTime();
};

// ── Normalize a currency code (uppercase, default fallback) ──
const normalizeCurrency = (value, fallback = 'INR') => {
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
  const linesSample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const delimiter =
    (linesSample.match(/;/g) || []).length >
    (linesSample.match(/,/g) || []).length
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
// Handles DD/MM/YYYY vs MM/DD/YYYY ambiguity: Indian bank statements predominantly
// use DD/MM/YYYY. When one number exceeds 12, it is unambiguously the day.
// Includes round-trip validation to prevent invalid days (e.g., 05/45/2024) from rolling over.
const toIsoDay = (value, preferredFormat = 'DMY') => {
  const source = cleanText(value);
  if (!source) return null;
  const match = source.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) {
    const direct = new Date(source);
    return Number.isNaN(direct.getTime()) ? null : direct.toISOString().slice(0, 10);
  }
  const [, first, second, yearRaw] = match;
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
  const n1 = Number(first);
  const n2 = Number(second);
  let dayNum, monthNum;
  if (n1 > 12 && n2 <= 12) {
    dayNum = n1;
    monthNum = n2;
  } else if (n2 > 12 && n1 <= 12) {
    dayNum = n2;
    monthNum = n1;
  } else {
    // Both <= 12: use preferred format hint ('MDY' for US, 'DMY' default for India)
    if (String(preferredFormat).toUpperCase() === 'MDY') {
      dayNum = n2;
      monthNum = n1;
    } else {
      dayNum = n1;
      monthNum = n2;
    }
  }
  const parsed = new Date(Date.UTC(year, monthNum - 1, dayNum, 12));
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip validation to prevent silent date rollover
  if (parsed.getUTCFullYear() !== year) return null;
  if (parsed.getUTCMonth() !== monthNum - 1) return null;
  if (parsed.getUTCDate() !== dayNum) return null;
  return parsed.toISOString().slice(0, 10);
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
    bank_name, sender_name, receiver_name,
    budget_category, budget_id,
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
  if (isFutureDate(parsedDate)) return { error: 'Transaction date cannot be more than 1 day in the future.' };
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
  if (payment_method !== undefined) {
    // Validate against the model enum so a bad value returns 400 rather than an
    // opaque 500 from a Mongoose ValidationError.
    if (!PAYMENT_METHODS.has(payment_method)) {
      parsed.error = `Invalid payment_method. Allowed: ${[...PAYMENT_METHODS].join(', ')}`;
      return parsed;
    }
    parsed.payment_method = payment_method;
  }
  if (account_id !== undefined) parsed.account_id = account_id || null;
  if (transaction_number !== undefined) {
    parsed.transaction_number = transaction_number ? String(transaction_number).trim() : null;
  }
  if (bank_name !== undefined) {
    parsed.bank_name = bank_name ? String(bank_name).trim().slice(0, 100) : null;
  }
  if (sender_name !== undefined) {
    parsed.sender_name = sender_name ? String(sender_name).trim().slice(0, 150) : null;
  }
  if (receiver_name !== undefined) {
    parsed.receiver_name = receiver_name ? String(receiver_name).trim().slice(0, 150) : null;
  }
  if (budget_category !== undefined) {
    parsed.budget_category = budget_category ? String(budget_category).trim().slice(0, 80) : null;
  }
  if (budget_id !== undefined) {
    if (budget_id && !mongoose.isValidObjectId(budget_id)) {
      return { error: 'Budget ID is invalid.' };
    }
    parsed.budget_id = budget_id || null;
  }
  if (is_recurring !== undefined) parsed.is_recurring = Boolean(is_recurring);
  if (recurrence_interval !== undefined) {
    if (recurrence_interval !== null && !RECURRENCE_INTERVALS.has(recurrence_interval)) {
      parsed.error = `Invalid recurrence_interval. Allowed: ${[...RECURRENCE_INTERVALS].join(', ')}`;
      return parsed;
    }
    parsed.recurrence_interval = recurrence_interval;
  }
  if (recurrence_ends_at !== undefined) {
    if (recurrence_ends_at === null || recurrence_ends_at === '') {
      parsed.recurrence_ends_at = null;
    } else {
      const endsAt = new Date(recurrence_ends_at);
      if (Number.isNaN(endsAt.getTime())) {
        return { error: 'Recurrence end date must be valid.' };
      }
      if (parsedDate && endsAt.getTime() <= parsedDate.getTime()) {
        return { error: 'Recurrence end date must be after the transaction date.' };
      }
      parsed.recurrence_ends_at = endsAt;
    }
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

const getTransactionBalance = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) return 0;
  const [user, transactions, accounts] = await Promise.all([
    User.findById(userId).select('currency').lean(),
    Transaction.find({
      $or: [
        { user_id: new mongoose.Types.ObjectId(String(userId)) },
        { user_id: String(userId) },
      ],
      is_deleted: { $ne: true },
    })
      .select('type amount currency account_id date import_fingerprint recurrence_instance_key category merchant note')
      .lean(),
    Account.find({ user_id: userId }).select('_id currency').lean(),
  ]);
  const displayCurrency = normalizeCurrency(user?.currency);
  const accountCurrencies = new Map(
    (accounts || []).map((account) => [String(account._id), normalizeCurrency(account.currency, displayCurrency)])
  );
  const balance = dedupeTransactions(transactions, { excludeFuture: true }).reduce((sum, transaction) => {
    const sourceCurrency = normalizeCurrency(
      transaction.currency || accountCurrencies.get(String(transaction.account_id || '')),
      displayCurrency
    );
    const amount = convertToCurrency(transaction.amount, sourceCurrency, displayCurrency);
    const type = String(transaction.type || '').trim().toLowerCase();
    return sum + (type === 'income' ? amount : type === 'expense' ? -amount : 0);
  }, 0);
  return Number(balance.toFixed(2));
};

// ── Calculate signed amount in user's display currency ──
const getTransactionSignedAmountForUser = async (
  userId,
  transaction,
  displayCurrency = null
) => {
  if (!transaction || !Number.isFinite(transaction.amount)) return 0;
  let currency = displayCurrency;
  if (!currency) {
    const user = await User.findById(userId).select('currency').lean();
    currency = normalizeCurrency(user?.currency);
  }
  const sourceCurrency = normalizeCurrency(transaction.currency, currency);
  const convertedAmount = convertToCurrency(transaction.amount, sourceCurrency, currency);
  const type = String(transaction.type || '').trim().toLowerCase();
  return type === 'income' ? convertedAmount : type === 'expense' ? -convertedAmount : 0;
};

// ── Incremental balance update for a user (O(1)) ──
// signedDelta is only applied if the transaction date is today or earlier.
// Future-dated transactions (allowed up to the 1-day grace window) are not
// counted until their day arrives — matching getTransactionBalance,
// which uses excludeFuture: true.
const adjustUserBalanceIncrementally = async (userId, signedDelta, txnDate = null) => {
  if (!mongoose.isValidObjectId(userId)) return 0;
  if (txnDate && txnDate.getTime() > Date.now()) {
    // Do not adjust the cached balance for future transactions yet.
    const user = await User.findById(userId).select('balance').lean();
    return Number((user?.balance || 0).toFixed(2));
  }
  if (!Number.isFinite(signedDelta) || Math.abs(signedDelta) < 1e-9) {
    const user = await User.findById(userId).select('balance').lean();
    return Number((user?.balance || 0).toFixed(2));
  }
  const delta = Math.round(signedDelta * 100) / 100;
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $inc: { balance: delta } },
    { new: true }
  ).select('balance').lean();
  return Number((updatedUser?.balance || 0).toFixed(2));
};

// ── Recalculate and persist the user's cached balance (Reconciliation) ──
const syncUserBalance = async (userId) => {
  const balance = await getTransactionBalance(userId);
  await User.findByIdAndUpdate(userId, { $set: { balance } });
  return balance;
};

// ── Recalculate current_balance for the given accounts ──
// Runs in parallel; skips invalid ids instead of throwing.
// Converts each transaction's amount into the account's currency so mixed-currency
// accounts reconcile with accurate balances matching incremental adjustments.
const syncAccountBalances = async (userId, accountIds = []) => {
  if (!userId) throw new Error('syncAccountBalances requires a userId.');
  if (!mongoose.isValidObjectId(userId)) return;

  const uniqueIds = [...new Set(accountIds.filter(Boolean).map(String))].filter(
    (id) => mongoose.isValidObjectId(id)
  );

  await Promise.all(
    uniqueIds.map(async (accountId) => {
      const account = await Account.findOne({
        _id: accountId,
        user_id: userId,
      }).select('initial_balance currency');
      if (!account) return;

      const accountCurrency = normalizeCurrency(account.currency);

      const transactions = await Transaction.find({
        account_id: accountId,
        user_id: userId,
        is_deleted: { $ne: true },
        date: { $lte: new Date() }, // keep account balance consistent with user balance
      }).select('type amount currency').lean();

      let income = 0;
      let expense = 0;

      for (const t of transactions) {
        const txCurrency = normalizeCurrency(t.currency, accountCurrency);
        const amt = convertToCurrency(Number(t.amount) || 0, txCurrency, accountCurrency);
        const lowerType = String(t.type || '').toLowerCase();
        if (lowerType === 'income') {
          income += amt;
        } else if (lowerType === 'expense') {
          expense += amt;
        }
      }

      const balance = Number(
        (
          Number(account.initial_balance || 0) +
          income -
          expense
        ).toFixed(2)
      );
      await Account.updateOne(
        { _id: accountId, user_id: userId },
        { $set: { current_balance: balance } }
      );
    })
  );
};

/* —————————————————————————————————————
 * Recurring Transactions
 * ————————————————————————————————————— */

// ── Compute the next occurrence date for a given interval ──
const nextOccurrence = (date, interval) => {
  const next = new Date(date);
  if (interval === 'daily') {
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (interval === 'weekly') {
    next.setDate(next.getDate() + 7);
    return next;
  }
  if (interval === 'monthly') {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
    return next;
  }
  if (interval === 'yearly') {
    const month = next.getMonth();
    const day = next.getDate();
    next.setFullYear(next.getFullYear() + 1);
    if (next.getMonth() !== month) {
      // Handle Feb 29 on leap year shifting to Mar 1 on non-leap year: snap to Feb 28
      next.setDate(0);
    }
    return next;
  }
  return null;
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
  let userTxCount = await Transaction.countDocuments({
    user_id: userId,
    is_deleted: { $ne: true },
  });

  for (const template of templates) {
    if (userTxCount >= USER_TRANSACTION_LIMIT) break;
    if (template.account_id) affectedAccountIds.add(String(template.account_id));

    let occurrence = nextOccurrence(template.date, template.recurrence_interval);
    let safety = 0;

    while (occurrence && occurrence <= now && safety < RECURRING_SAFETY_CAP) {
      if (userTxCount >= USER_TRANSACTION_LIMIT) break;
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

        if (result.upsertedCount > 0) {
          created += 1;
          userTxCount += 1;
        }
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
    await syncAccountBalances(userId, [...affectedAccountIds]);
  }
  return created;
};

/* —————————————————————————————————————
 * Recurring Cooldown
 * Prevents running heavy upsert loops on every single GET request.
 * ————————————————————————————————————— */
// Max 10,000 entries prevents unbounded memory growth.
const lastRecurringProcessMap = new LRUCache({ max: 10000, ttl: 5 * 60 * 1000 });
const RECURRING_CHECK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes (Stage 3.1.5 non-blocking)

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
 * Parse and classify bank statement files (CSV, Excel, PDF).
 * Automatically extracts credited/debited amounts, transaction IDs,
 * bank names, sender names, and receiver names.
 * ————————————————————————————————————— */
router.post('/statement/preview', async (req, res) => {
  try {
    const content = req.body?.content;
    const fileData = req.body?.fileData;
    const filename = req.body?.filename || 'statement.csv';
    const password = req.body?.password || null;

    if (!content && !fileData) {
      return res.status(400).json({ error: 'Upload a statement file.' });
    }

    // ── Load user history to inform classification and dedup ──
    const userTransactions = await Transaction.find({
      user_id: req.userId,
      is_deleted: { $ne: true },
    })
      .select('merchant receiver_name sender_name bank_name category note date type amount import_fingerprint account_id')
      .sort({ date: -1 })
      .limit(5000)
      .lean();

    const currentTxCount = await Transaction.countDocuments({
      user_id: req.userId,
      is_deleted: { $ne: true },
    });

    const accountId = req.body?.account_id || req.query?.account_id || req.body?.accountId || req.query?.accountId || null;

    const parsed = await parseStatement({
      content,
      fileData,
      filename,
      userTransactions,
      password,
      dateFormat: req.body?.dateFormat || req.query?.dateFormat,
      accountId,
    });

    return res.json({
      transactions: parsed.transactions,
      summary: {
        ...parsed.summary,
        warnings: parsed.summary?.warnings || [],
        truncated: parsed.summary?.truncated || false,
        currentTxCount,
        maxLimit: USER_TRANSACTION_LIMIT,
        remainingSlots: Math.max(0, USER_TRANSACTION_LIMIT - currentTxCount),
      },
    });
  } catch (error) {
    logger.error('Statement preview failed:', error);
    return res.status(400).json({
      error: error.message || 'Could not analyze this statement.',
      code: error.code || undefined,
      ocr_required: error.ocr_required || false,
    });
  }
});

/* —————————————————————————————————————
 * POST /statement/import
 * Import selected statement rows into the user's wallet.
 * Enforces the strict 1,000 transactions limit per user.
 * ————————————————————————————————————— */
router.post('/statement/import', async (req, res) => {
  try {
    // ── Enforce 1,000 transactions limit per user ──
    const currentCount = await Transaction.countDocuments({
      user_id: req.userId,
      is_deleted: { $ne: true },
    });

    if (currentCount >= USER_TRANSACTION_LIMIT) {
      return res.status(400).json({
        error: `You have reached the maximum limit of ${USER_TRANSACTION_LIMIT} transactions per user. Please delete older transactions to import more.`,
      });
    }

    const remainingSlots = Math.max(0, USER_TRANSACTION_LIMIT - currentCount);

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
      const safePaymentMethod = PAYMENT_METHODS.has(item.payment_method)
        ? item.payment_method
        : 'bank_transfer';
      const safeItem = {
        ...item,
        payment_method: safePaymentMethod,
      };
      const validation = validateTransactionPayload(safeItem);
      const merchant = cleanText(item.merchant || item.receiver_name).slice(0, 150) || null;
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

      if (accepted.length >= remainingSlots) {
        skipped += 1;
        continue;
      }

      batchKeys.add(key);
      const itemAccountId = validation.account_id || (mongoose.isValidObjectId(item.account_id) ? item.account_id : null);
      accepted.push({
        user_id: req.userId,
        account_id: itemAccountId,
        type: item.type,
        category: cleanText(item.category).slice(0, 80),
        amount: validation.numericAmount,
        currency: validation.currency || defaultCurrency,
        date: validation.parsedDate,
        note: cleanText(item.note).slice(0, 500) || null,
        merchant,
        bank_name: cleanText(item.bank_name).slice(0, 100) || null,
        sender_name: cleanText(item.sender_name).slice(0, 150) || null,
        receiver_name: cleanText(item.receiver_name).slice(0, 150) || null,
        payment_method: safePaymentMethod,
        counterparty_bank: cleanText(item.counterparty_bank).slice(0, 200) || null,
        transaction_number: cleanText(item.transaction_number || item.external_reference).slice(0, 100) || null,
        external_reference: cleanText(item.external_reference || item.transaction_number).slice(0, 150) || null,
        import_fingerprint: fingerprint,
        import_source: cleanText(item.import_source || 'bank_statement').slice(0, 40),
        audit_logs: [{ action: 'Imported from bank statement', timestamp: new Date() }],
      });
    }

    if (!accepted.length) {
      return res.json({
        created: 0,
        skipped,
        message: currentCount >= USER_TRANSACTION_LIMIT
          ? `Reached the ${USER_TRANSACTION_LIMIT} transaction limit.`
          : 'All selected transactions were already imported or invalid.',
      });
    }

    // ── Second-pass dedup against existing rows in the same window (scoped to account) ──
    const dates = accepted.map((tx) => tx.date.getTime());
    const existingTransactions = await Transaction.find({
      user_id: req.userId,
      is_deleted: { $ne: true },
      date: {
        $gte: new Date(Math.min(...dates) - 24 * 60 * 60 * 1000),
        $lte: new Date(Math.max(...dates) + 24 * 60 * 60 * 1000),
      },
    })
      .select('date type amount merchant note account_id')
      .lean();

    const existingKeys = new Set(
      existingTransactions.map((tx) =>
        [
          String(tx.account_id || ''),
          new Date(tx.date).toISOString().slice(0, 10),
          tx.type,
          Number(tx.amount).toFixed(2),
          normalizeForMatch(tx.merchant || tx.note),
        ].join('|')
      )
    );

    const newTransactions = accepted.filter((tx) => {
      const key = [
        String(tx.account_id || ''),
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
    let created = [];
    try {
      created = await Transaction.insertMany(newTransactions, { ordered: false });
    } catch (insertError) {
      if (Array.isArray(insertError.insertedDocs)) {
        created = insertError.insertedDocs;
      }
      logger.warn(
        { userId: req.userId, err: insertError.message },
        'Statement import: insertMany encountered partial failure'
      );
    }

    const insertFailures = newTransactions.length - created.length;
    if (insertFailures > 0) {
      skipped += insertFailures;
      logger.warn(
        { userId: req.userId, insertFailures },
        'Statement import: insertMany partially failed'
      );
    }

    const balance = await syncUserBalance(req.userId);

    // Sync current_balance for all accounts touched by this import
    const affectedAccountIds = [
      ...new Set(created.map((tx) => tx.account_id).filter(Boolean).map(String)),
    ];
    if (affectedAccountIds.length > 0) {
      await syncAccountBalances(req.userId, affectedAccountIds);
    }

    return res.status(201).json({
      created: created.length,
      skipped,
      balance,
      message: `${created.length} transaction(s) added to wallet.${skipped ? ` (${skipped} skipped)` : ''}`,
    });
  } catch (error) {
    logger.error('Statement import failed:', error);
    return res.status(500).json({ error: 'Could not import the selected transactions.' });
  }
});

// ── Cursor Pagination Helpers (Sub-PR 3.1) ──
const encodeCursor = (doc) => {
  if (!doc || !doc.date || !doc._id) return null;
  const payload = {
    date: doc.date instanceof Date ? doc.date.toISOString() : new Date(doc.date).toISOString(),
    _id: String(doc._id),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
};

const decodeCursor = (cursorStr) => {
  if (!cursorStr || typeof cursorStr !== 'string') return null;
  try {
    const raw = Buffer.from(cursorStr, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Cursor must be a JSON object');
    }
    const { date, _id } = parsed;
    if (!date || !_id || !mongoose.isValidObjectId(_id)) {
      throw new Error('Invalid cursor shape');
    }
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error('Invalid cursor date');
    }
    return {
      date: parsedDate,
      _id: new mongoose.Types.ObjectId(_id),
    };
  } catch {
    const error = new Error('Malformed or invalid pagination cursor.');
    error.statusCode = 400;
    throw error;
  }
};

/* —————————————————————————————————————
 * GET /:userId
 * List a user's transactions with cursor pagination.
 * Supports ?legacy=true for backward compatibility.
 * ————————————————————————————————————— */
router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  // ── Validate and authorize the target user ──
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  // ── Handle legacy query parameter for backward compatibility ──
  if (req.query.legacy === 'true' || req.query.legacy === '1') {
    try {
      if (shouldProcessRecurring(req.params.userId)) {
        try {
          await processRecurringForUser(req.params.userId);
        } catch (err) {
          logger.error('[Transactions] Recurring process error:', err);
        }
      }

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

      return res.json(dedupeTransactions(transactions.map((transaction) => transaction.toObject()), { excludeFuture: false }));
    } catch (error) {
      logger.error('[Transactions] legacy list error:', error);
      return res.status(500).json({ error: 'Unable to load transactions.' });
    }
  }

  // ── Cursor-based pagination (Sub-PR 3.1) ──
  let cursorObj = null;
  if (req.query.cursor) {
    try {
      cursorObj = decodeCursor(req.query.cursor);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Malformed or invalid pagination cursor.' });
    }
  }

  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 50)
  );

  try {
    if (shouldProcessRecurring(req.params.userId)) {
      try {
        await processRecurringForUser(req.params.userId);
      } catch (err) {
        logger.error('[Transactions] Recurring process error:', err);
      }
    }

    // `{ $ne: true }` (not `false`) for consistency with every other query in the
    // codebase: documents created before `is_deleted` existed have the field
    // missing, so `false` silently hid them from listings while balances and
    // exports still counted them.
    const query = {
      user_id: req.params.userId,
      is_deleted: { $ne: true },
    };

    if (cursorObj) {
      query.$or = [
        { date: { $lt: cursorObj.date } },
        { date: cursorObj.date, _id: { $lt: cursorObj._id } },
      ];
    }

    const docs = await Transaction.find(query)
      .sort({ date: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = docs.length > limit;
    const rawItems = hasMore ? docs.slice(0, limit) : docs;
    const items = dedupeTransactions(rawItems, { excludeFuture: false });
    const lastItem = items.length > 0 ? items[items.length - 1] : null;
    const nextCursor = (hasMore && lastItem) ? encodeCursor(lastItem) : null;

    const responsePayload = {
      items,
      nextCursor,
      hasMore,
    };

    // Total count is optional per spec (only computed when explicitly requested via ?total=true)
    if (req.query.total === 'true' || req.query.include_total === 'true') {
      responsePayload.total = await Transaction.countDocuments({
        user_id: req.params.userId,
        is_deleted: { $ne: true },
      });
    }

    return res.json(responsePayload);
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

    // ── Enforce 1,000 transactions limit per user ──
    const userTxCount = await Transaction.countDocuments({
      user_id: req.userId,
      is_deleted: { $ne: true },
    });
    if (userTxCount >= USER_TRANSACTION_LIMIT) {
      return res.status(400).json({
        error: `Maximum limit of ${USER_TRANSACTION_LIMIT} transactions per user reached. Please delete older transactions to create new ones.`,
      });
    }

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

    const generatedTxNumber = validation.transaction_number ||
      `CW-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

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
      bank_name: validation.bank_name || null,
      sender_name: validation.sender_name || null,
      receiver_name: validation.receiver_name || null,
      tags: validation.tags,
      payment_method: validation.payment_method,
      transaction_number: generatedTxNumber,
      account_id: validation.account_id || null,
      budget_category: validation.budget_category !== undefined ? validation.budget_category : (req.body.budget_category ? String(req.body.budget_category).trim().slice(0, 80) : null),
      budget_id: validation.budget_id || null,
      is_recurring: validation.is_recurring,
      recurrence_interval: validation.recurrence_interval,
      recurrence_ends_at: validation.recurrence_ends_at,
      is_split: validation.is_split,
      split_details: validation.split_details,
      audit_logs: [{ action: 'Created', timestamp: new Date() }],
    });

    // ── Refresh cached balances incrementally (O(1)) ──
    const userDisplayCurrency = normalizeCurrency(owner?.currency);
    const signedAmount = await getTransactionSignedAmountForUser(
      req.userId,
      transaction,
      userDisplayCurrency
    );
    const balance = await adjustUserBalanceIncrementally(req.userId, signedAmount, transaction.date);
    if (transaction.account_id && transaction.date.getTime() <= Date.now()) {
      const accountCurrency = normalizeCurrency(selectedAccount?.currency, userDisplayCurrency);
      const convertedToAccount = convertToCurrency(transaction.amount, transactionCurrency, accountCurrency);
      const accountDelta = transaction.type === 'income' ? convertedToAccount : -convertedToAccount;
      // Scoped by user_id: `account_id` is ownership-verified above, but the
      // filter keeps the write safe even if that check ever regresses.
      await Account.updateOne(
        { _id: transaction.account_id, user_id: req.userId },
        { $inc: { current_balance: Math.round(accountDelta * 100) / 100 } }
      );
    }

    return res.status(201).json({ transaction, balance, message: 'Transaction added' });
  } catch (error) {
    logger.error('[Transactions] create error:', error);
    if (error?.name === 'ValidationError') {
      const details = Object.values(error.errors || {}).map((e) => e.message).filter(Boolean);
      return res.status(400).json({ error: details[0] || 'Invalid transaction data.', details });
    }
    if (error?.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid transaction data format.' });
    }
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

    const previousDate = t.date;
    const previousAccountId = t.account_id;
    const oldType = t.type;
    const oldAmount = t.amount;
    const oldCurrency = t.currency;

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
    if (validation.bank_name !== undefined) t.bank_name = validation.bank_name;
    if (validation.sender_name !== undefined) t.sender_name = validation.sender_name;
    if (validation.receiver_name !== undefined) t.receiver_name = validation.receiver_name;
    if (validation.tags !== undefined) t.tags = validation.tags;
    if (validation.payment_method !== undefined) t.payment_method = validation.payment_method;
    if (validation.transaction_number !== undefined) t.transaction_number = validation.transaction_number;
    if (validation.is_recurring !== undefined) t.is_recurring = validation.is_recurring;
    if (validation.recurrence_interval !== undefined) t.recurrence_interval = validation.recurrence_interval;
    if (validation.recurrence_ends_at !== undefined) t.recurrence_ends_at = validation.recurrence_ends_at;
    if (validation.is_split !== undefined) t.is_split = validation.is_split;
    if (validation.split_details !== undefined) t.split_details = validation.split_details;
    if (validation.budget_category !== undefined) t.budget_category = validation.budget_category;
    if (validation.budget_id !== undefined) t.budget_id = validation.budget_id;

    // Defensive: legacy documents may not have audit_logs yet.
    if (!Array.isArray(t.audit_logs)) t.audit_logs = [];
    t.audit_logs.push({ action: 'Updated', timestamp: new Date() });

    await t.save();

    // ── Refresh cached balances incrementally (O(1)) ──
    const userDisplayCurrency = normalizeCurrency(owner?.currency);
    const oldWasPast = previousDate.getTime() <= Date.now();
    const newIsPast = t.date.getTime() <= Date.now();

    const oldSigned = await getTransactionSignedAmountForUser(
      req.userId,
      {
        type: oldType,
        amount: oldAmount,
        currency: oldCurrency,
      },
      userDisplayCurrency
    );
    const newSigned = await getTransactionSignedAmountForUser(
      req.userId,
      t,
      userDisplayCurrency
    );

    const effOldSigned = oldWasPast ? oldSigned : 0;
    const effNewSigned = newIsPast ? newSigned : 0;
    const delta = effNewSigned - effOldSigned;
    const balance = await adjustUserBalanceIncrementally(req.userId, delta, null);

    // Update account balances incrementally with currency conversion and past/future transition tracking
    const oldAccId = previousAccountId ? String(previousAccountId) : null;
    const newAccId = t.account_id ? String(t.account_id) : null;

    let oldAccountCurrency = userDisplayCurrency;
    if (oldAccId) {
      if (oldAccId === newAccId && selectedAccount) {
        oldAccountCurrency = normalizeCurrency(selectedAccount.currency, userDisplayCurrency);
      } else {
        const oldAccDoc = await Account.findOne({ _id: oldAccId, user_id: req.userId }).select('currency').lean();
        oldAccountCurrency = normalizeCurrency(oldAccDoc?.currency, userDisplayCurrency);
      }
    }
    const newAccountCurrency = normalizeCurrency(selectedAccount?.currency, userDisplayCurrency);

    const oldConverted = convertToCurrency(oldAmount, oldCurrency, oldAccountCurrency);
    const oldAccSigned = oldType === 'income' ? oldConverted : -oldConverted;

    const newConverted = convertToCurrency(t.amount, t.currency, newAccountCurrency);
    const newAccSigned = t.type === 'income' ? newConverted : -newConverted;

    if (oldAccId === newAccId && oldAccId) {
      const effOldAcc = oldWasPast ? oldAccSigned : 0;
      const effNewAcc = newIsPast ? newAccSigned : 0;
      const accDelta = Math.round((effNewAcc - effOldAcc) * 100) / 100;
      if (accDelta !== 0) {
        await Account.updateOne(
          { _id: oldAccId, user_id: req.userId },
          { $inc: { current_balance: accDelta } }
        );
      }
    } else {
      if (oldAccId && oldWasPast) {
        // SECURITY: the PREVIOUS account id comes from the stored document and
        // was never ownership-checked, so it must be scoped here.
        await Account.updateOne(
          { _id: oldAccId, user_id: req.userId },
          { $inc: { current_balance: Math.round(-oldAccSigned * 100) / 100 } }
        );
      }
      if (newAccId && newIsPast) {
        await Account.updateOne(
          { _id: newAccId, user_id: req.userId },
          { $inc: { current_balance: Math.round(newAccSigned * 100) / 100 } }
        );
      }
    }

    return res.json({ transaction: t, balance, message: 'Transaction updated' });
  } catch (error) {
    logger.error('[Transactions] update error:', error);
    if (error?.name === 'ValidationError') {
      const details = Object.values(error.errors || {}).map((e) => e.message).filter(Boolean);
      return res.status(400).json({ error: details[0] || 'Invalid transaction data.', details });
    }
    if (error?.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid transaction data format.' });
    }
    return res.status(500).json({ error: 'Unable to update transaction.' });
  }
});

/* —————————————————————————————————————
 * DELETE /:id
 * Permanently delete a transaction owned by the authenticated user.
 * The document is fully removed from the database.
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

    // ── Adjust balances before permanent removal ──
    const oldSigned = await getTransactionSignedAmountForUser(req.userId, t);

    if (t.account_id && t.date.getTime() <= Date.now()) {
      const accountDoc = await Account.findOne({ _id: t.account_id, user_id: req.userId }).select('currency').lean();
      const accountCurrency = normalizeCurrency(accountDoc?.currency, t.currency);
      const converted = convertToCurrency(t.amount, t.currency, accountCurrency);
      const accDelta = t.type === 'income' ? -converted : converted;
      await Account.updateOne(
        { _id: t.account_id, user_id: req.userId },
        { $inc: { current_balance: Math.round(accDelta * 100) / 100 } }
      );
    }

    // ── Permanently remove the document ──
    await Transaction.deleteOne({ _id: t._id, user_id: req.userId });

    const balance = await adjustUserBalanceIncrementally(req.userId, -oldSigned, t.date);

    return res.json({ balance, message: 'Transaction permanently deleted' });
  } catch (error) {
    logger.error('[Transactions] delete error:', error);
    return res.status(500).json({ error: 'Unable to delete transaction.' });
  }
});

/* —————————————————————————————————————
 * POST /bulk-delete
 * Permanently delete many transactions owned by the authenticated user.
 * All matched documents are fully removed from the database.
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

    // ── Snapshot affected accounts before removal ──
    const affectedAccountIds = await Transaction.find({
      _id: { $in: validIds },
      user_id: req.userId,
    }).distinct('account_id');

    // ── Permanently delete all matching documents ──
    const result = await Transaction.deleteMany(
      { _id: { $in: validIds }, user_id: req.userId }
    );

    // ── Refresh balances ──
    const balance = await syncUserBalance(req.userId);
    await syncAccountBalances(req.userId, affectedAccountIds);

    return res.json({
      balance,
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} transactions permanently deleted`,
    });
  } catch (error) {
    logger.error('[Transactions] bulk-delete error:', error);
    return res.status(500).json({ error: 'Unable to delete transactions.' });
  }
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router and reconciliation helpers ──
router.syncUserBalance = syncUserBalance;
router.adjustUserBalanceIncrementally = adjustUserBalanceIncrementally;
router.encodeCursor = encodeCursor;
router.decodeCursor = decodeCursor;
router.isFutureDate = isFutureDate;
router.validateTransactionPayload = validateTransactionPayload;
router.parseTransactionAmount = parseTransactionAmount;
router.getTransactionSignedAmountForUser = getTransactionSignedAmountForUser;
router.nextOccurrence = nextOccurrence;
router.toIsoDay = toIsoDay;
module.exports = router;