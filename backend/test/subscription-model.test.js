/**
 * Subscription Model & Schema Unit Tests
 * Verifies partial unique index, url protocol sanitization, icon emoji length,
 * status flag coherence, currency defaults, and virtual properties.
 */

'use strict';

const assert = require('assert');
const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');

console.log('🧪 Running Subscription Model & Schema Tests...');

async function runTests() {
  // ─────────────────────────────────────────────────────────────
  // 1. Partial Unique Index definition
  // ─────────────────────────────────────────────────────────────
  const indexes = Subscription.schema.indexes();
  const liveUniqueIndex = indexes.find(
    ([fields, options]) => options && options.name === 'user_sub_name_unique_live'
  );

  assert(liveUniqueIndex, 'Index user_sub_name_unique_live should be defined on Subscription schema');
  const [idxFields, idxOpts] = liveUniqueIndex;
  assert.strictEqual(idxFields.user_id, 1);
  assert.strictEqual(idxFields.name, 1);
  assert.strictEqual(idxOpts.unique, true);
  assert.deepStrictEqual(
    idxOpts.partialFilterExpression,
    { cancelled_at: null, is_active: true },
    'Partial unique index must apply only to live (active and uncancelled) subscriptions'
  );
  console.log('  ✅ 1. Partial unique index configured for live subscriptions only');

  // ─────────────────────────────────────────────────────────────
  // 2. URL Field Normalization & Validation
  // ─────────────────────────────────────────────────────────────
  const subWithPlainUrl = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Streaming Service',
    amount: 9.99,
    url: 'netflix.com',
  });
  assert.strictEqual(subWithPlainUrl.url, 'https://netflix.com', 'URL setter should prepend https:// if missing');
  assert.strictEqual(subWithPlainUrl.validateSync(), undefined, 'Valid https URL should pass validation');

  const subWithJsUrl = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Evil Service',
    amount: 5,
    url: 'javascript:alert(1)',
  });
  const errJs = subWithJsUrl.validateSync();
  assert(errJs && errJs.errors && errJs.errors.url, 'URL starting with javascript: must fail validation');
  console.log('  ✅ 2. URL protocol enforcement and normalization verified');

  // ─────────────────────────────────────────────────────────────
  // 3. Icon Length (Compound Emoji up to 16 UTF-16 code units)
  // ─────────────────────────────────────────────────────────────
  const familyEmoji = '👨\u200D👩\u200D👧\u200D👦';
  assert(familyEmoji.length > 10, 'Family emoji sequence must exceed 10 code units');

  const subWithEmoji = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Family Plan',
    amount: 25,
    icon: familyEmoji,
  });
  const errEmoji = subWithEmoji.validateSync();
  assert.strictEqual(errEmoji, undefined, 'Icon should accept compound emojis up to 16 code units');
  console.log('  ✅ 3. Icon length supports compound emoji sequences (maxlength: 16)');

  // ─────────────────────────────────────────────────────────────
  // 4. Status Flag Coherence (pre-validate hook & path validators)
  // ─────────────────────────────────────────────────────────────
  // Case A: Synchronous validation rejects conflicting cancelled_at + is_active
  const conflictingSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Conflicting Service',
    amount: 10,
    is_active: true,
    cancelled_at: new Date(),
  });
  const errConflict = conflictingSub.validateSync();
  assert(errConflict && errConflict.errors && errConflict.errors.is_active, 'Sync validation must reject cancelled subscription with is_active = true');

  // Case B: Async validate hook auto-coerces cancelled subscription to inactive and unpaused
  const cancelledSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Cancelled Service',
    amount: 10,
    is_active: true,
    is_paused: true,
    cancelled_at: new Date(),
  });
  await cancelledSub.validate();
  assert.strictEqual(cancelledSub.is_active, false, 'Pre-validate hook must coerce is_active to false when cancelled_at is set');
  assert.strictEqual(cancelledSub.is_paused, false, 'Pre-validate hook must coerce is_paused to false when cancelled_at is set');

  // Case C: A paused subscription must have is_active = true
  const pausedSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Paused Gym',
    amount: 40,
    is_active: false,
    is_paused: true,
  });
  await pausedSub.validate();
  assert.strictEqual(pausedSub.is_active, true, 'Pre-validate hook must ensure paused subscription is marked active');
  console.log('  ✅ 4. Status flag coherence rules verified (path validators + pre-validate coercion)');

  // ─────────────────────────────────────────────────────────────
  // 5. Currency Defaults, Uppercasing, and Validation
  // ─────────────────────────────────────────────────────────────
  const defaultCurSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Default Currency',
    amount: 15,
  });
  assert.strictEqual(defaultCurSub.currency, 'USD', 'Currency should default to USD');

  const lowercaseCurSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'INR Service',
    amount: 500,
    currency: 'inr',
  });
  assert.strictEqual(lowercaseCurSub.currency, 'INR', 'Currency must be coerced to uppercase');

  const invalidCurSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Bad Currency',
    amount: 10,
    currency: 'US_DOLLARS',
  });
  const errCur = invalidCurSub.validateSync();
  assert(errCur && errCur.errors && errCur.errors.currency, 'Invalid currency string must fail validation');
  console.log('  ✅ 5. Currency default, uppercasing, and 3-letter validation verified');

  // ─────────────────────────────────────────────────────────────
  // 6. Color Hex Validation & Name Maxlength
  // ─────────────────────────────────────────────────────────────
  const badColorSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Bad Color',
    amount: 10,
    color: 'not-a-color',
  });
  const errColor = badColorSub.validateSync();
  assert(errColor && errColor.errors && errColor.errors.color, 'Invalid color string must fail validation');

  const longNameSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'A'.repeat(101),
    amount: 10,
  });
  const errName = longNameSub.validateSync();
  assert(errName && errName.errors && errName.errors.name, 'Name exceeding 100 characters must fail validation');
  console.log('  ✅ 6. Hex color validation and name length constraint verified');

  // ─────────────────────────────────────────────────────────────
  // 7. Virtuals (annual_cost, is_in_trial, days_until_billing)
  // ─────────────────────────────────────────────────────────────
  // annual_cost rounding
  const roundingSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Rounding Test',
    amount: 10.99,
    cycle: 'monthly',
  });
  assert.strictEqual(roundingSub.annual_cost, 131.88, 'annual_cost must be rounded to 2 decimal places');

  // is_in_trial checks cancelled_at
  const futureTrial = new Date();
  futureTrial.setDate(futureTrial.getDate() + 14);

  const activeTrialSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Trial Active',
    amount: 15,
    trial_ends: futureTrial,
  });
  assert.strictEqual(activeTrialSub.is_in_trial, true, 'Active subscription with future trial_ends is in trial');

  const cancelledTrialSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Trial Cancelled',
    amount: 15,
    trial_ends: futureTrial,
    cancelled_at: new Date(),
  });
  await cancelledTrialSub.validate();
  assert.strictEqual(cancelledTrialSub.is_in_trial, false, 'Cancelled subscription is never in trial');

  // days_until_billing: 3 hours from now on the same calendar day returns 0 (bills today)
  const now = new Date();
  const inThreeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const sameDaySub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Same Day Billing',
    amount: 10,
    next_billing_date: inThreeHours,
  });
  if (inThreeHours.getDate() === now.getDate()) {
    assert.strictEqual(sameDaySub.days_until_billing, 0, 'Billing in 3 hours today should show 0 days remaining (due today)');
  }

  // Tomorrow returns 1
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0);
  const tomorrowSub = new Subscription({
    user_id: new mongoose.Types.ObjectId(),
    name: 'Tomorrow Billing',
    amount: 10,
    next_billing_date: tomorrow,
  });
  assert.strictEqual(tomorrowSub.days_until_billing, 1, 'Billing tomorrow should return 1 day remaining');
  console.log('  ✅ 7. Virtuals (annual_cost rounded, is_in_trial guarded, days_until_billing calendar-accurate) verified');

  console.log('🎉 ALL SUBSCRIPTION MODEL & SCHEMA TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Subscription model test failed:', err);
  process.exit(1);
});
