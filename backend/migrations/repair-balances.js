/**
 * Schema v2 — repair persisted user balances.
 *
 * WHY THIS EXISTS
 * ---------------
 * `isFutureTransaction()` used to return `true` for a MISSING date, and the
 * balance queries in `routes/transactions.js` and `routes/auth.js` selected
 * `type amount currency account_id` WITHOUT `date`. Every row therefore looked
 * future-dated, `dedupeTransactions` dropped all of them, and the summed balance
 * came out 0. Because `syncUserBalance` PERSISTS its result, it overwrote each
 * affected user's stored `balance` with 0.
 *
 * The code bug is fixed (see `utils/transactionIntegrity.js` and the two
 * `.select(...)` call sites). This migration repairs the data: it recomputes
 * every user's balance from their transactions using the SAME rules as the
 * canonical helper, so stored values match what the app now derives.
 *
 * This logic is duplicated from `routes/transactions.js::getTransactionBalance`
 * on purpose: importing that module here would pull in the whole Express router,
 * and the helper is not exported independently. Both copies must stay in sync —
 * `test/security-integration.test.js` asserts the route path, and this migration
 * is exercised by `backend/scripts/verify-balance-repair.cjs`.
 */

const { logger } = require('../utils/logger');

// ── Must match routes/transactions.js ──
const FALLBACK_RATES_TO_INR = {
  INR: 1, USD: 83.5, EUR: 90.5, GBP: 106, JPY: 0.56,
  AUD: 55, CAD: 61.5, CHF: 94, CNY: 11.5, SGD: 62,
};

/** @returns {string} Uppercased currency code, defaulting to USD. */
const normalizeCurrency = (value, fallback = 'USD') => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || fallback;
};

/** Convert between currencies using the static fallback table. */
const convertToCurrency = (amount, fromCurrency, toCurrency) => {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return Number(amount) || 0;
  const fromRate = FALLBACK_RATES_TO_INR[from];
  const toRate = FALLBACK_RATES_TO_INR[to];
  if (!fromRate || !toRate) return Number(amount) || 0;
  return ((Number(amount) || 0) * fromRate) / toRate;
};

/**
 * Recompute one user's balance from their transactions.
 *
 * Mirrors `getTransactionBalance`: soft-deleted rows excluded, future-dated rows
 * excluded, duplicates collapsed, each row converted into the display currency
 * using its own currency (or the owning account's currency as a fallback).
 *
 * @param {object} Transaction Mongoose Transaction model.
 * @param {object} Account Mongoose Account model.
 * @param {object} user User lean document (`_id`, `currency`).
 * @returns {Promise<number>} Canonical balance, rounded to 2 decimals.
 */
async function computeBalance(Transaction, Account, user) {
  const userId = user._id;

  const [transactions, accounts] = await Promise.all([
    Transaction.find({ user_id: userId, is_deleted: { $ne: true } })
      .select('type amount currency account_id date')
      .lean(),
    Account.find({ user_id: userId }).select('_id currency').lean(),
  ]);

  const displayCurrency = normalizeCurrency(user.currency);
  const accountCurrencies = new Map(
    accounts.map((account) => [String(account._id), normalizeCurrency(account.currency, displayCurrency)])
  );

  // Same rules as dedupeTransactions(), inlined to keep this module dependency-free.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const seen = new Set();
  let balance = 0;

  for (const transaction of transactions) {
    if (transaction.is_deleted === true) continue;

    const date = transaction.date === null || transaction.date === undefined || transaction.date === ''
      ? null
      : new Date(transaction.date);

    // A missing/invalid date is NOT treated as future (matches the fixed helper).
    if (date && !Number.isNaN(date.getTime()) && date.getTime() > endOfToday.getTime()) continue;

    const key = [
      'manual',
      date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '',
      String(transaction.type || '').toLowerCase(),
      (Number(transaction.amount || 0)).toFixed(2),
      String(transaction.category || '').trim().toLowerCase(),
      '',
      normalizeCurrency(transaction.currency),
      String(transaction.account_id || ''),
    ].join('|');

    if (seen.has(key)) continue;
    seen.add(key);

    const sourceCurrency = normalizeCurrency(
      transaction.currency || accountCurrencies.get(String(transaction.account_id || '')),
      displayCurrency
    );
    const amount = convertToCurrency(transaction.amount, sourceCurrency, displayCurrency);
    balance += transaction.type === 'income' ? amount : -amount;
  }

  return Number(balance.toFixed(2));
}

/**
 * Recompute and persist every user's balance.
 *
 * Idempotent: running it twice produces the same values.
 *
 * @param {{ dryRun?: boolean }} [options] When `dryRun` is true nothing is written.
 * @returns {Promise<{ scanned: number, updated: number, changes: Array<object> }>}
 */
async function repairBalances({ dryRun = false } = {}) {
  const User = require('../models/User');
  const Transaction = require('../models/Transaction');
  const Account = require('../models/Account');

  const users = await User.find({}).select('_id username currency balance').lean();
  const changes = [];
  let updated = 0;

  for (const user of users) {
    const expected = await computeBalance(Transaction, Account, user);
    const current = Number(user.balance || 0);

    if (Math.abs(expected - current) < 0.005) continue;

    changes.push({ username: user.username, before: current, after: expected });
    if (!dryRun) {
      await User.updateOne({ _id: user._id }, { $set: { balance: expected } });
      updated += 1;
    }
  }

  logger.info(
    `Balance repair${dryRun ? ' (dry run)' : ''}: scanned ${users.length} user(s), ` +
    `${changes.length} mismatch(es), ${updated} updated.`
  );

  return { scanned: users.length, updated, changes };
}

module.exports = { repairBalances, computeBalance };
