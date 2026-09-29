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

console.log('✅ ALL 7 TRANSACTION TIMEZONE & GRACE PERIOD TESTS PASSED CLEANLY!\n');
process.exit(0);
