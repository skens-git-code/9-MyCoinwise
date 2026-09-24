/* —————————————————————————————————————
 * US Federal Tax Rules — FY 2024
 * Exports the built-in US federal tax rule set for fiscal year 2024.
 *
 * Scope:
 *   - Single-filer federal brackets only.
 *   - State tax and AMT are NOT included.
 *
 * Includes:
 *   - Brackets (min / max / rate)
 *   - Standard deduction
 *   - Capital gains rates and holding period
 *   - Cess rate and default sales tax
 *   - Quarterly advance tax due dates
 *   - Metadata (source, effective date, version, notes)
 *
 * These values are upserted into the TaxRuleSet collection by the
 * seed script and consumed by the tax engine.
 * ————————————————————————————————————— */

module.exports = [
  /* ── Federal Rule Set (US-2024-FED) ── */
  {
    // ── Identity ──
    rule_key: 'US-2024-FED',
    jurisdiction: 'US',
    fiscal_year: 2024,
    regime: 'federal',
    currency: 'USD',

    // ── Standard deduction for a single filer ──
    standard_deduction: 14600,

    // ── Federal income tax brackets (single filer, 2024) ──
    // `max: null` marks the top bracket (no upper bound).
    brackets: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11600, max: 47150, rate: 0.12 },
      { min: 47150, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, max: null, rate: 0.37 },
    ],

    // ── Capital gains rates and long-term holding period ──
    capital_gains: {
      short_term_rate: 0.22,
      long_term_rate: 0.15,
      holding_period_days: 365,
    },

    // ── No cess in the US; no default sales tax at the federal level ──
    cess_rate: 0,
    sales_tax_default: 0,

    // ── Quarterly estimated tax due dates for tax year 2024 ──
    advance_tax_dates: [
      new Date('2024-04-15T00:00:00.000Z'),
      new Date('2024-06-15T00:00:00.000Z'),
      new Date('2024-09-15T00:00:00.000Z'),
      new Date('2025-01-15T00:00:00.000Z'),
    ],

    // ── Provenance and versioning ──
    metadata: {
      source: 'https://www.irs.gov/filing/federal-income-tax-rates-and-brackets',
      effective_date: new Date('2024-01-01T00:00:00.000Z'),
      version: '2024.1',
      notes: '2024 single-filer federal brackets only; state tax and AMT are not included.',
    },
  },
];