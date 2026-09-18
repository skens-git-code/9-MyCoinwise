const normalizeText = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const dayKey = (value) => {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

export const isFutureTransaction = (value, now = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return date.getTime() > endOfToday.getTime();
};

export const transactionIntegrityKey = (transaction) => {
  if (transaction?.import_fingerprint) return `import:${transaction.import_fingerprint}`;
  if (transaction?.recurrence_instance_key) return `recurrence:${transaction.recurrence_instance_key}`;
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

export const dedupeTransactions = (transactions = [], { excludeFuture = true } = {}) => {
  const seen = new Set();
  return transactions.filter((transaction) => {
    if (!transaction || transaction.is_deleted === true) return false;
    if (excludeFuture && isFutureTransaction(transaction.date)) return false;
    const key = transactionIntegrityKey(transaction);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
