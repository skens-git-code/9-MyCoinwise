const mongoose = require('mongoose');

const bracketSchema = new mongoose.Schema({
  min: { type: Number, required: true, min: 0 },
  max: { type: Number, default: null, min: 0 },
  rate: { type: Number, required: true, min: 0, max: 1 },
  type: { type: String, default: 'ordinary', trim: true, maxlength: 40 },
}, { _id: false });

const taxRuleSetSchema = new mongoose.Schema({
  rule_key: { type: String, required: true, unique: true, trim: true, index: true },
  jurisdiction: { type: String, required: true, enum: ['IN', 'US'] },
  fiscal_year: { type: Number, required: true, min: 2000, max: 2100 },
  regime: { type: String, required: true, enum: ['new', 'old', 'federal'] },
  currency: { type: String, required: true, uppercase: true, maxlength: 3 },
  brackets: { type: [bracketSchema], required: true, validate: (v) => v.length > 0 },
  standard_deduction: { type: Number, default: 0, min: 0 },
  surcharge_thresholds: [{ min: Number, rate: Number, label: String }],
  cess_rate: { type: Number, default: 0, min: 0, max: 1 },
  rebate: { maxTaxableIncome: Number, maxCredit: Number, label: String },
  capital_gains: {
    short_term_rate: { type: Number, default: 0, min: 0, max: 1 },
    long_term_rate: { type: Number, default: 0, min: 0, max: 1 },
    holding_period_days: { type: Number, default: 365, min: 0 },
  },
  sales_tax_default: { type: Number, default: 0, min: 0, max: 1 },
  advance_tax_dates: [{ type: Date }],
  advance_tax_schedule: [{
    date: { type: Date, required: true },
    installment_percent: { type: Number, min: 0, max: 100 },
    cumulative_percent: { type: Number, min: 0, max: 100 },
  }],
  metadata: {
    source: String,
    effective_date: Date,
    notes: String,
    version: { type: String, default: '1.0.0' },
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

taxRuleSetSchema.index({ jurisdiction: 1, fiscal_year: 1, regime: 1 }, { unique: true });

module.exports = mongoose.model('TaxRuleSet', taxRuleSetSchema);
