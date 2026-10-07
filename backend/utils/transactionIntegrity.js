/* —————————————————————————————————————
 * Transaction Integrity Utilities
 * Helpers for detecting duplicates and filtering transactions by
 * date. Used by balance calculations, import flows, and recurring
 * processing.
 *
 * Exports:
 *   - dedupeTransactions       : filter out duplicates and (optionally) future-dated rows.
 *   - isFutureTransaction      : check whether a date is after the end of today.
 *   - transactionIntegrityKey  : stable key for duplicate detection.
 * ————————————————————————————————————— */

// ── Normalize text for case-insensitive, whitespace-insensitive comparison ──
const normalizeText = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

// ── Extract a YYYY-MM-DD day key from a date value ──
// Returns an empty string when the date is invalid.
const dayKey = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

// ── Return true when the date is verifiably after the end of today ──
//
// BUG FIX (high severity): this used to return `true` for a MISSING or
// unparseable date, on the theory that callers could then "safely" drop them.
// But `dedupeTransactions` filters future rows out — and the balance queries in
// routes/transactions.js and routes/auth.js selected `type amount currency
// account_id` WITHOUT `date`. `new Date(undefined)` is an Invalid Date, so every
// transaction was classified as future, dropped by the dedupe, and the summed
// balance came out 0. Because `syncUserBalance` PERSISTS that value, it actively
// overwrote each user's stored balance with 0.
//
// The safe default is the opposite: only a date that is genuinely in the future
// is excluded. A missing date is a projection bug, and silently zeroing a
// balance is far worse than including a row whose date we failed to load.
const isFutureTransaction = (value, now = new Date()) => {
  if (value === null || value === undefined || value === '') return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return date.getTime() > endOfToday.getTime();
};

/* —————————————————————————————————————
 * Transaction Integrity Key
 * Produces a stable identity for a transaction so duplicates can be
 * detected across imports, recurring instances, and manual rows.
 *
 * Priority:
 *   1. Import fingerprint (bank statement imports).
 *   2. Recurrence instance key (generated recurring rows).
 *   3. Composite key from date, type, amount, category, merchant,
 *      currency, and account.
 * ————————————————————————————————————— */
const transactionIntegrityKey = (transaction) => {
  // ── Use the import fingerprint when present ──
  if (transaction?.import_fingerprint) return `import:${transaction.import_fingerprint}`;

  // ── Use the recurrence instance key when present ──
  if (transaction?.recurrence_instance_key) return `recurrence:${transaction.recurrence_instance_key}`;

  // ── Fall back to a composite manual key ──
  return [
    'manual',
    dayKey(transaction?.date),
    normalizeText(transaction?.type),
    Number(transaction?.amount || 0).toFixed(2),
    normalizeText(transaction?.category),
    normalizeText(transaction?.merchant || transaction?.note),
    normalizeText(transaction?.currency),
    String(transaction?.account_id || ''),
  ].join('|');
};

/* —————————————————————————————————————
 * Dedupe Transactions
 * Filters out duplicates and (optionally) future-dated rows.
 *
 * Behavior:
 *   - Rows with `is_deleted: true` are always excluded.
 *   - Future-dated rows are excluded when `excludeFuture` is true
 *     (the default). A row with a missing/invalid date is NOT treated as
 *     future (see `isFutureTransaction`), so an unprojected `date` can never
 *     silently empty a balance.
 *   - Duplicates are detected via `transactionIntegrityKey`; the
 *     first occurrence in iteration order wins.
 * ————————————————————————————————————— */
const dedupeTransactions = (transactions = [], { excludeFuture = true } = {}) => {
  const seen = new Set();
  return transactions.filter((transaction) => {
    // ── Skip missing or soft-deleted rows ──
    if (!transaction || transaction.is_deleted === true) return false;

    // ── Skip future-dated rows when requested ──
    if (excludeFuture && isFutureTransaction(transaction.date)) return false;

    // ── Skip duplicates by integrity key ──
    const key = transactionIntegrityKey(transaction);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export helpers ──
module.exports = { dedupeTransactions, isFutureTransaction, transactionIntegrityKey };