/* —————————————————————————————————————
 * TaxRuleSet Model
 * Stores the versioned tax rules (brackets, deductions, rates,
 * schedules) for a given jurisdiction, fiscal year, and regime.
 *
 * Key behaviors:
 *   - Each rule set is uniquely identified by rule_key and by the
 *     combination (jurisdiction, fiscal_year, regime).
 *   - Brackets are embedded and must contain at least one entry.
 *   - Surcharge, rebate, capital gains, and advance tax schedules
 *     are stored inline because they are always read with the ruleset.
 *
 * Indexes:
 *   - rule_key (unique)                          : direct lookup.
 *   - jurisdiction + fiscal_year + regime (unique): canonical resolver.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

/* —————————————————————————————————————
 * Bracket Subdocument
 * A single tax bracket (min, optional max, rate).
 * `_id` is disabled to keep subdocuments lightweight.
 * ————————————————————————————————————— */
const bracketSchema = new mongoose.Schema({
  // ── Lower bound of the bracket (inclusive) ──
  min: {
    type: Number,
    required: true,
    min: 0
  },

  // ── Upper bound of the bracket (null = no upper limit) ──
  max: {
    type: Number,
    default: null,
    min: 0
  },

  // ── Tax rate as a fraction (0–1) ──
  rate: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },

  // ── Bracket type (e.g. ordinary) ──
  type: {
    type: String,
    default: 'ordinary',
    trim: true,
    maxlength: 40
  },
}, { _id: false });

/* —————————————————————————————————————
 * Tax Rule Set Schema
 * Top-level ruleset document keyed by jurisdiction + year + regime.
 * ————————————————————————————————————— */
const taxRuleSetSchema = new mongoose.Schema({
  // ── Stable unique key identifying this ruleset ──
  rule_key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },

  // ── Jurisdiction the rules apply to ──
  jurisdiction: {
    type: String,
    required: true,
    enum: ['IN', 'US']
  },

  // ── Fiscal year the rules apply to ──
  fiscal_year: {
    type: Number,
    required: true,
    min: 2000,
    max: 2100
  },

  // ── Tax regime the rules apply to ──
  regime: {
    type: String,
    required: true,
    enum: ['new', 'old', 'federal']
  },

  // ── ISO currency code (uppercase) ──
  currency: {
    type: String,
    required: true,
    uppercase: true,
    maxlength: 3
  },

  // ── Ordered list of brackets (must be non-empty) ──
  brackets: {
    type: [bracketSchema],
    required: true,
    validate: (v) => v.length > 0
  },

  // ── Standard deduction amount ──
  standard_deduction: {
    type: Number,
    default: 0,
    min: 0
  },

  // ── Surcharge thresholds (e.g. India cess tiers) ──
  surcharge_thresholds: [{
    min: Number,
    rate: Number,
    label: String
  }],

  // ── Cess rate as a fraction (0–1) ──
  cess_rate: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },

  // ── Rebate rule (income ceiling and credit amount) ──
  rebate: {
    maxTaxableIncome: Number,
    maxCredit: Number,
    label: String
  },

  // ── Capital gains configuration ──
  capital_gains: {
    // ── Short-term capital gains rate (fraction) ──
    short_term_rate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    // ── Long-term capital gains rate (fraction) ──
    long_term_rate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    // ── Minimum holding period (days) for long-term treatment ──
    holding_period_days: {
      type: Number,
      default: 365,
      min: 0
    },
  },

  // ── Default sales tax rate as a fraction (0–1) ──
  sales_tax_default: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },

  // ── Simple list of advance tax due dates ──
  advance_tax_dates: [{ type: Date }],

  // ── Structured advance tax schedule with installment percentages ──
  advance_tax_schedule: [{
    // ── Due date of the installment ──
    date: {
      type: Date,
      required: true
    },
    // ── Percentage of tax due in this installment (0–100) ──
    installment_percent: {
      type: Number,
      min: 0,
      max: 100
    },
    // ── Cumulative percentage due up to this installment (0–100) ──
    cumulative_percent: {
      type: Number,
      min: 0,
      max: 100
    },
  }],

  // ── Provenance and versioning of the rule set ──
  metadata: {
    // ── Source of the rule data (e.g. official gazette) ──
    source: String,
    // ── Date the rules took effect ──
    effective_date: Date,
    // ── Free-form notes ──
    notes: String,
    // ── Rule set version identifier ──
    version: {
      type: String,
      default: '1.0.0'
    },
  },

}, {
  // ── Auto-managed created_at / updated_at fields ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Canonical resolver: one ruleset per jurisdiction + year + regime ──
taxRuleSetSchema.index({ jurisdiction: 1, fiscal_year: 1, regime: 1 }, { unique: true });

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('TaxRuleSet', taxRuleSetSchema);