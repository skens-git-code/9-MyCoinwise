/**
 * Budget Model & Schema Unit Tests
 * Verifies schema validators, partial unique index, rollover hook, category sums, and virtuals.
 */

'use strict';

const assert = require('assert');
const mongoose = require('mongoose');
const Budget = require('../models/Budget');

console.log('🧪 Running Budget Model Schema & Validator Tests...');

// Helper to create a valid budget document for in-memory validation
const createTestBudget = (overrides = {}) => {
  return new Budget({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Test Budget',
    type: 'monthly',
    currency: 'USD',
    period_start: new Date('2025-01-01T00:00:00Z'),
    period_end: new Date('2025-01-31T23:59:59Z'),
    total_limit: 1000,
    is_active: true,
    ...overrides,
  });
};

// 1. Partial Unique Index definition
const indexes = Budget.schema.indexes();
const activeUniqueIndex = indexes.find(
  ([fields, options]) => options && options.name === 'user_name_period_unique_ci_active'
);

assert(activeUniqueIndex, 'Index user_name_period_unique_ci_active should be defined on Budget schema');
const [idxFields, idxOpts] = activeUniqueIndex;
assert.strictEqual(idxFields.user_id, 1);
assert.strictEqual(idxFields.name, 1);
assert.strictEqual(idxFields.period_start, 1);
assert.strictEqual(idxOpts.unique, true);
assert.deepStrictEqual(idxOpts.partialFilterExpression, { is_active: true }, 'Unique index must apply only to active budgets');
console.log('  ✅ 1. Partial unique index configured for active budgets only');

// 2. Currency field defaults and validation
const defaultBudget = createTestBudget({ currency: undefined });
assert.strictEqual(defaultBudget.currency, 'USD', 'Currency should default to USD');

const customCurrencyBudget = createTestBudget({ currency: 'inr' });
assert.strictEqual(customCurrencyBudget.currency, 'INR', 'Currency should uppercase value');
console.log('  ✅ 2. Currency defaults and casing verified');

// 3. Period end date must be on or after start date
const invalidPeriodBudget = createTestBudget({
  period_start: new Date('2025-02-01T00:00:00Z'),
  period_end: new Date('2025-01-01T00:00:00Z'),
});
const periodErr = invalidPeriodBudget.validateSync();
assert(periodErr && periodErr.errors && periodErr.errors.period_end, 'Should invalidate period_end when period_end < period_start');
console.log('  ✅ 3. Period date order validation verified');

// 4. Rollover amount must be 0 when rollover_enabled is false
const invalidRolloverBudget = createTestBudget({
  rollover_enabled: false,
  rollover_amount: 150,
});
const rolloverErr = invalidRolloverBudget.validateSync();
assert(rolloverErr && rolloverErr.errors && rolloverErr.errors.rollover_amount, 'Should invalidate rollover_amount when rollover_enabled is false');
console.log('  ✅ 4. Rollover amount validation against rollover_enabled verified');

// 5. Category limit sum cannot exceed total_limit
const invalidCategoryBudget = createTestBudget({
  total_limit: 500,
  categories: [
    { name: 'Dining', limit: 300 },
    { name: 'Groceries', limit: 300 },
  ],
});
const categoryErr = invalidCategoryBudget.validateSync();
assert(categoryErr && categoryErr.errors && categoryErr.errors.categories, 'Should invalidate categories when sum exceeds total_limit');

const validCategoryBudget = createTestBudget({
  total_limit: 600,
  categories: [
    { name: 'Dining', limit: 300 },
    { name: 'Groceries', limit: 300 },
  ],
});
assert.strictEqual(validCategoryBudget.validateSync(), undefined, 'Valid category sum should pass validation');
console.log('  ✅ 5. Category limit sum validation verified');

// 6. Category icon emoji validation
const validIconBudget = createTestBudget({
  categories: [{ name: 'Travel', limit: 100, icon: '✈️' }],
});
assert.strictEqual(validIconBudget.validateSync(), undefined, 'Valid emoji icon should pass');

const invalidIconBudget = createTestBudget({
  categories: [{ name: 'Travel', limit: 100, icon: 'not_an_emoji' }],
});
const iconErr = invalidIconBudget.validateSync();
assert(iconErr && iconErr.errors['categories.0.icon'], 'Should invalidate non-emoji icon');
console.log('  ✅ 6. Category icon emoji validator verified');

// 7. Virtuals 'remaining' and 'progress_percentage' respect rollover_enabled
const budgetWithDisabledRollover = createTestBudget({
  total_limit: 1000,
  rollover_enabled: false,
  rollover_amount: 200, // even if legacy value exists
  total_spent: 400,
});
// When rollover_enabled is false, rollover_amount is ignored in remaining and progress
assert.strictEqual(budgetWithDisabledRollover.remaining, 600, 'Remaining should ignore rollover_amount when rollover_enabled is false');
assert.strictEqual(budgetWithDisabledRollover.progress_percentage, 40, 'Progress percentage should ignore rollover_amount when rollover_enabled is false');

const budgetWithActiveRollover = createTestBudget({
  total_limit: 1000,
  rollover_enabled: true,
  rollover_amount: 200,
  total_spent: 600,
});
assert.strictEqual(budgetWithActiveRollover.remaining, 600, 'Remaining should include rollover_amount when rollover_enabled is true');
assert.strictEqual(budgetWithActiveRollover.progress_percentage, 50, 'Progress percentage should include rollover_amount when rollover_enabled is true');
console.log('  ✅ 7. Virtuals remaining & progress_percentage respect rollover_enabled flag');

console.log('🎉 ALL BUDGET MODEL & SCHEMA TESTS PASSED CLEANLY!\n');
