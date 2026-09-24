/* —————————————————————————————————————
 * India Tax Rules — FY 2024
 * Exports the built-in India tax rule sets for fiscal year 2024,
 * covering both the new and old regimes.
 *
 * Each rule set includes:
 *   - Brackets (min / max / rate)
 *   - Standard deduction
 *   - Section 87A rebate
 *   - Capital gains rates and holding period
 *   - Cess rate and default sales tax
 *   - Advance tax dates and installment schedule
 *   - Metadata (source, effective date, version, notes)
 *
 * These values are upserted into the TaxRuleSet collection by the
 * seed script and consumed by the tax engine.
 * ————————————————————————————————————— */

// ── Advance tax due dates for FY 2024 (India) ──
const indiaAdvanceDates = [
  new Date('2024-06-15T00:00:00.000Z'),
  new Date('2024-09-15T00:00:00.000Z'),
  new Date('2024-12-15T00:00:00.000Z'),
  new Date('2025-03-15T00:00:00.000Z'),
];

// ── Advance tax installment schedule ──
// Each entry pairs a due date with the percentage due at that
// installment and the cumulative percentage up to that date.
const indiaAdvanceSchedule = [
  { date: indiaAdvanceDates[0], installment_percent: 15, cumulative_percent: 15 },
  { date: indiaAdvanceDates[1], installment_percent: 30, cumulative_percent: 45 },
  { date: indiaAdvanceDates[2], installment_percent: 30, cumulative_percent: 75 },
  { date: indiaAdvanceDates[3], installment_percent: 25, cumulative_percent: 100 },
];

// ── Shared fields for both regimes ──
// These values are identical across the new and old regimes for
// FY 2024 and are spread into each exported rule set below.
const base = {
  jurisdiction: 'IN',
  fiscal_year: 2024,
  currency: 'INR',
  capital_gains: { short_term_rate: 0.15, long_term_rate: 0.10, holding_period_days: 365 },
  cess_rate: 0.04,
  sales_tax_default: 0.18,
  advance_tax_dates: indiaAdvanceDates,
  advance_tax_schedule: indiaAdvanceSchedule,
  metadata: {
    source: 'https://www.incometax.gov.in/',
    effective_date: new Date('2024-04-01T00:00:00.000Z'),
    version: '2024.1',
    notes: 'Simplified estimate rules. Verify current Finance Act rules with a qualified professional.',
  },
};

/* —————————————————————————————————————
 * Exported Rule Sets
 * ————————————————————————————————————— */
module.exports = [
  /* ── New Regime (IN-2024-NEW) ── */
  {
    ...base,
    rule_key: 'IN-2024-NEW',
    regime: 'new',
    standard_deduction: 75000,
    brackets: [
      { min: 0, max: 300000, rate: 0 },
      { min: 300000, max: 700000, rate: 0.05 },
      { min: 700000, max: 1000000, rate: 0.10 },
      { min: 1000000, max: 1200000, rate: 0.15 },
      { min: 1200000, max: 1500000, rate: 0.20 },
      { min: 1500000, max: null, rate: 0.30 },
    ],
    // Section 87A rebate for the new regime
    rebate: { maxTaxableIncome: 700000, maxCredit: 25000, label: 'Section 87A rebate' },
  },

  /* ── Old Regime (IN-2024-OLD) ── */
  {
    ...base,
    rule_key: 'IN-2024-OLD',
    regime: 'old',
    standard_deduction: 50000,
    brackets: [
      { min: 0, max: 250000, rate: 0 },
      { min: 250000, max: 500000, rate: 0.05 },
      { min: 500000, max: 1000000, rate: 0.20 },
      { min: 1000000, max: null, rate: 0.30 },
    ],
    // Section 87A rebate for the old regime
    rebate: { maxTaxableIncome: 500000, maxCredit: 12500, label: 'Section 87A rebate' },
  },
];