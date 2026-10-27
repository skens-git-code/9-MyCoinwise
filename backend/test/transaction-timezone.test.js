/**
 * Unit Test Suite: Transaction Date Timezone Grace Period (Bug #1B)
 *
 * Verifies that:
 * 1. Today's date (local / UTC) succeeds
 * 2. Tomorrow's date (+1 day, e.g. client timezone up to UTC+14) succeeds
 * 3. Day after tomorrow (+2 days in the future) is strictly rejected
 * 4. Far future dates (+10 days) are strictly rejected
 * 5. Full validateTransactionPayload returns descriptive error for > 1 day in the future
 */

const assert = require('assert');
const { isFutureDate, validateTransactionPayload } = require('../routes/transactions');

console.log('🧪 Running Transaction Timezone & Grace Period Tests (Bug #1B)...');

// Test 1: Today's date is never considered future
const today = new Date();
assert.strictEqual(isFutureDate(today), false, "Today's date must not be future");

// Test 2: Date +14 hours ahead (simulating Tokyo/Sydney/Kiribati relative to UTC)
const tzClientAhead = new Date(Date.now() + 14 * 60 * 60 * 1000);
assert.strictEqual(
  isFutureDate(tzClientAhead),
  false,
  'Client in timezone UTC+14 (e.g. +14h ahead) must be accepted within grace period'
);

// Test 3: Date tomorrow at noon (+24 hours) is accepted within the 1-day grace period
const tomorrowNoon = new Date();
tomorrowNoon.setDate(tomorrowNoon.getDate() + 1);
tomorrowNoon.setHours(12, 0, 0, 0);
assert.strictEqual(
  isFutureDate(tomorrowNoon),
  false,
  'Date tomorrow at noon must be accepted within 1-day grace period'
);

// Test 4: Date +2 days ahead is strictly rejected
const twoDaysAhead = new Date();
twoDaysAhead.setDate(twoDaysAhead.getDate() + 2);
twoDaysAhead.setHours(12, 0, 0, 0);
assert.strictEqual(
  isFutureDate(twoDaysAhead),
  true,
  'Date 2 days ahead must be rejected as future'
);

// Test 5: Date +10 days ahead is strictly rejected
const farFuture = new Date();
farFuture.setDate(farFuture.getDate() + 10);
assert.strictEqual(
  isFutureDate(farFuture),
  true,
  'Date 10 days ahead must be rejected as future'
);

// Test 6: validateTransactionPayload integration
const twoDaysAheadDateStr = twoDaysAhead.toISOString().slice(0, 10);
const payloadRejected = validateTransactionPayload({
  type: 'expense',
  category: 'Food',
  amount: '25.00',
  date: twoDaysAheadDateStr,
});
assert(payloadRejected.error, 'Payload with date 2 days ahead must return an error');
assert.strictEqual(
  payloadRejected.error,
  'Transaction date cannot be more than 1 day in the future.'
);

// Test 7: validateTransactionPayload with valid tomorrow date succeeds
const tomorrowDateStr = tomorrowNoon.toISOString().slice(0, 10);
const payloadAccepted = validateTransactionPayload({
  type: 'expense',
  category: 'Food',
  amount: '25.00',
  date: tomorrowDateStr,
});
assert.strictEqual(
  payloadAccepted.error,
  undefined,
  'Payload with date within 1-day grace period must not return an error'
);
assert.strictEqual(payloadAccepted.numericAmount, 25.00);

// Test 8: parseTransactionAmount accepts MAX_AMOUNT (999,999,999.99)
const { parseTransactionAmount, nextOccurrence, toIsoDay } = require('../routes/transactions');
assert.strictEqual(
  parseTransactionAmount(999999999.99),
  999999999.99,
  'parseTransactionAmount must accept MAX_AMOUNT 999999999.99'
);
assert.strictEqual(
  parseTransactionAmount('999999999.99'),
  999999999.99,
  'parseTransactionAmount must accept string MAX_AMOUNT 999999999.99'
);
assert.strictEqual(
  parseTransactionAmount(999999999.991),
  null,
  'parseTransactionAmount must reject more than 2 decimal places'
);
assert.strictEqual(
  parseTransactionAmount(1000000000),
  null,
  'parseTransactionAmount must reject amount > MAX_AMOUNT'
);

// Test 9: nextOccurrence clamps month overflow properly
const jan31 = new Date(Date.UTC(2025, 0, 31, 12));
const nextMonthly = nextOccurrence(jan31, 'monthly');
assert.strictEqual(nextMonthly.getUTCMonth(), 1, 'Jan 31 next month must be February');
assert.strictEqual(nextMonthly.getUTCDate(), 28, 'Jan 31 next month in 2025 must be Feb 28');

const feb29Leap = new Date(Date.UTC(2024, 1, 29, 12));
const nextYearly = nextOccurrence(feb29Leap, 'yearly');
assert.strictEqual(nextYearly.getUTCFullYear(), 2025, 'Year must advance to 2025');
assert.strictEqual(nextYearly.getUTCMonth(), 1, 'Month must stay February');
assert.strictEqual(nextYearly.getUTCDate(), 28, 'Feb 29 next year must clamp to Feb 28 on non-leap year');

// Test 10: toIsoDay parses Indian DD/MM format and rejects invalid rolling days
assert.strictEqual(toIsoDay('05/06/2024'), '2024-06-05', '05/06/2024 must parse as 5th June in Indian format');
assert.strictEqual(toIsoDay('25/01/2024'), '2024-01-25', '25/01/2024 must parse as 25th January');
assert.strictEqual(toIsoDay('01/25/2024'), '2024-01-25', '01/25/2024 must parse as 25th January');
assert.strictEqual(toIsoDay('05/45/2024'), null, '05/45/2024 must be rejected rather than rolling over to June');

// Test 11: validateTransactionPayload validates recurrence_ends_at is after transaction date
const recurrencePast = validateTransactionPayload({
  type: 'expense',
  category: 'Bills',
  amount: '100.00',
  date: '2026-06-01',
  is_recurring: true,
  recurrence_interval: 'monthly',
  recurrence_ends_at: '2026-05-01',
});
assert(recurrencePast.error, 'recurrence_ends_at before transaction date must be rejected');
assert.strictEqual(
  recurrencePast.error,
  'Recurrence end date must be after the transaction date.'
);

const recurrenceFuture = validateTransactionPayload({
  type: 'expense',
  category: 'Bills',
  amount: '100.00',
  date: '2026-06-01',
  is_recurring: true,
  recurrence_interval: 'monthly',
  recurrence_ends_at: '2026-07-01',
});
assert.strictEqual(recurrenceFuture.error, undefined, 'recurrence_ends_at after transaction date must be accepted');

console.log('✅ ALL 11 TRANSACTION TIMEZONE, AMOUNT & RECURRENCE TESTS PASSED CLEANLY!\n');
process.exit(0);
