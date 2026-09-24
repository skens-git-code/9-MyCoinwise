/* —————————————————————————————————————
 * Transaction Integrity Utilities
 * Helpers for detecting duplicate transactions and filtering
 * future-dated rows. Used by balance calculations, import flows,
 * recurring processing, and the dashboard.
 *
 * Exports:
 *   - dedupeTransactions      : Filter out duplicates and (optionally) future-dated rows.
 *   - isFutureTransaction     : True when a date is after the end of today.
 *   - transactionIntegrityKey : Stable identity for a transaction.
 * ————————————————————————————————————— */

// ── Normalize text for case-insensitive, whitespace-insensitive comparison ──
const normalizeText = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

// ── Extract a YYYY-MM-DD day key from a date value ──
// String inputs already in `YYYY-MM-DD…` form are returned as-is,
// so no UTC shift is introduced. Otherwise, the value is parsed via
// `new Date()` and converted to an ISO day key.
const dayKey = (value) => {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

// ── True when the date is after the end of today ──
// Invalid dates are treated as future (returns true) so callers can
// safely filter them out.
export const isFutureTransaction = (value, now = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
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
export const transactionIntegrityKey = (transaction) => {
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
 *     (the default).
 *   - Duplicates are detected via `transactionIntegrityKey`; the
 *     first occurrence in iteration order wins.
 * ————————————————————————————————————— */
export const dedupeTransactions = (transactions = [], { excludeFuture = true } = {}) => {
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