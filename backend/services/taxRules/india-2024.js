const indiaAdvanceDates = [
  new Date('2024-06-15T00:00:00.000Z'),
  new Date('2024-09-15T00:00:00.000Z'),
  new Date('2024-12-15T00:00:00.000Z'),
  new Date('2025-03-15T00:00:00.000Z'),
];
const indiaAdvanceSchedule = [
  { date: indiaAdvanceDates[0], installment_percent: 15, cumulative_percent: 15 },
  { date: indiaAdvanceDates[1], installment_percent: 30, cumulative_percent: 45 },
  { date: indiaAdvanceDates[2], installment_percent: 30, cumulative_percent: 75 },
  { date: indiaAdvanceDates[3], installment_percent: 25, cumulative_percent: 100 },
];

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

module.exports = [
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
    rebate: { maxTaxableIncome: 700000, maxCredit: 25000, label: 'Section 87A rebate' },
  },
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
    rebate: { maxTaxableIncome: 500000, maxCredit: 12500, label: 'Section 87A rebate' },
  },
];
