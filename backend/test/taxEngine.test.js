/* —————————————————————————————————————
 * Tax Engine Tests
 * Node-assert based tests for the pure tax calculation functions.
 *
 * Coverage:
 *   - India new regime: brackets, rebate, and boundary cases.
 *   - US federal regime: brackets and standard deduction.
 *   - Capital gains classification (short-term vs. long-term) and tax.
 *   - Annual estimate orchestration: deductions, payments, balance due.
 *   - Invalid inputs return null.
 *
 * Run:
 *   node <path-to>/taxEngine.test.js
 * ————————————————————————————————————— */

// ── Load dependencies ──
const assert = require('assert');
const {
  calculateIncomeTax,
  calculateCapitalGains,
  estimateAnnualTax,
} = require('../services/taxEngine');
const indiaRules = require('../services/taxRules/india-2024');
const usRules = require('../services/taxRules/us-federal-2024');

// ── Minimal profile factory for tests ──
// Builds a profile with empty deductions and credits so results are
// driven purely by the rule set and the inputs under test.
const profile = (jurisdiction, fiscal_year, tax_regime) => ({
  jurisdiction,
  fiscal_year,
  tax_regime,
  pre_tax_contributions: [],
  itemized_deductions: [],
  tax_credits: [],
});

// ── Shared fixtures ──
const indiaNew = profile('IN', 2024, 'new');
const indiaRule = indiaRules.find((rule) => rule.regime === 'new');

/* —————————————————————————————————————
 * India New Regime — Income Tax
 * ————————————————————————————————————— */

// ── 1,000,000 gross → 925,000 taxable (75k standard deduction) ──
const indiaMillion = calculateIncomeTax({ grossIncome: 1000000, ruleSet: indiaRule, profile: indiaNew });
assert.strictEqual(indiaMillion.taxableIncome, 925000);
assert.strictEqual(indiaMillion.total, 44200);

// ── Rebate zeroes out liability at or below the 700k threshold ──
assert.strictEqual(calculateIncomeTax({ grossIncome: 300000, ruleSet: indiaRule, profile: indiaNew }).total, 0);
assert.strictEqual(calculateIncomeTax({ grossIncome: 300001, ruleSet: indiaRule, profile: indiaNew }).taxBeforeCredits, 0);
assert.strictEqual(calculateIncomeTax({ grossIncome: 700000, ruleSet: indiaRule, profile: indiaNew }).total, 0);

// ── Invalid inputs return null ──
assert.strictEqual(calculateIncomeTax({ grossIncome: -1, ruleSet: indiaRule, profile: indiaNew }), null);
assert.strictEqual(calculateIncomeTax({ grossIncome: 100, ruleSet: usRules[0], profile: indiaNew }), null);

/* —————————————————————————————————————
 * US Federal Regime — Income Tax
 * ————————————————————————————————————— */

const usResult = calculateIncomeTax({
  grossIncome: 75000,
  ruleSet: usRules[0],
  profile: profile('US', 2024, 'federal'),
});
assert.strictEqual(usResult.taxableIncome, 60400);
assert.strictEqual(usResult.total, 8341);

/* —————————————————————————————————————
 * Capital Gains — Classification and Tax
 * Short-term (held < 365 days) uses the short-term rate; long-term
 * uses the long-term rate.
 * ————————————————————————————————————— */

const gains = calculateCapitalGains({
  ruleSet: indiaRule,
  holdings: [
    { _id: 'short', name: 'Short', base_value: 100000, sale_price: 120000, acquisition_date: '2024-01-01', sold_at: '2024-04-10' },
    { _id: 'long', name: 'Long', base_value: 100000, sale_price: 120000, acquisition_date: '2022-01-01', sold_at: '2024-04-10' },
  ],
});
assert.strictEqual(gains.holdings[0].classification, 'short_term');
assert.strictEqual(gains.holdings[1].classification, 'long_term');
assert.strictEqual(gains.total, 5000);
assert.strictEqual(gains.holdings[0].tax, 3000);
assert.strictEqual(gains.holdings[1].tax, 2000);

/* —————————————————————————————————————
 * Annual Estimate — Orchestrator
 * Combines income tax, tagged deductions, and payments into a single
 * estimate. Verifies the resulting balance due.
 * ————————————————————————————————————— */

const annual = estimateAnnualTax({
  profile: indiaNew,
  ruleSet: indiaRule,
  transactions: [{ type: 'income', amount: 1000000 }],
  taggedTransactions: [{ tag: { treatment: 'charity', portion: 50 }, transaction: { _id: 'tx', amount: 10000 } }],
  payments: [{ amount: 1000 }],
  holdings: [],
});
assert.strictEqual(annual.hasTaxableActivity, true);
assert.strictEqual(annual.paymentsMade, 1000);
assert.strictEqual(annual.balanceDue, 42680);

// ── All assertions passed ──
console.log('taxEngine tests passed');