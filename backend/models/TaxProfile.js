/* —————————————————————————————————————
 * TaxProfile Model
 * Stores a user's tax profile for a given fiscal year and
 * jurisdiction, including filing status, deductions, credits,
 * and optional household sharing.
 *
 * Key behaviors:
 *   - Every profile is scoped to one user, one fiscal year, and
 *     one jurisdiction (IN or US).
 *   - `household_id` is optional and indexed sparsely so profiles
 *     without a household do not create index entries.
 *   - Deductions, credits, and pre-tax contributions are stored
 *     as embedded `moneyLineSchema` subdocuments.
 *   - `tax_id_last4` stores only the last 4 characters of a tax
 *     identifier and accepts letters or digits.
 *   - `_version` is a manual optimistic-concurrency counter.
 *
 * Indexes:
 *   - user_id + fiscal_year : look up a user's profiles per year.
 *   - user_id + jurisdiction: look up profiles by jurisdiction.
 *   - household_id (sparse) : household-scoped queries.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

/* —————————————————————————————————————
 * Money Line Subdocument
 * Embedded line item for deductions, credits, and contributions.
 * `_id` is disabled to keep subdocuments lightweight.
 * ————————————————————————————————————— */
const moneyLineSchema = new mongoose.Schema({
  // ── Display label for the line item ──
  label: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },

  // ── Monetary amount (non-negative) ──
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  // ── Category grouping ──
  category: {
    type: String,
    default: 'other',
    trim: true,
    maxlength: 80
  },

  // ── Line type (e.g. user_defined) ──
  type: {
    type: String,
    default: 'user_defined',
    trim: true,
    maxlength: 60
  },

  // ── Recurrence of the line item ──
  frequency: {
    type: String,
    default: 'annual',
    enum: ['annual', 'monthly', 'quarterly', 'one_time']
  },
}, { _id: false });

/* —————————————————————————————————————
 * Tax Profile Schema
 * Top-level tax profile document owned by a user.
 * ————————————————————————————————————— */
const taxProfileSchema = new mongoose.Schema({
  // ── Owning user reference ──
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ── Optional household owner (sparse index) ──
  household_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
    sparse: true
  },

  // ── Profile display name ──
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  // ── Tax jurisdiction ──
  jurisdiction: {
    type: String,
    required: true,
    enum: ['IN', 'US']
  },

  // ── Fiscal year the profile applies to ──
  fiscal_year: {
    type: Number,
    required: true,
    min: 2000,
    max: 2100
  },

  // ── Filing status ──
  filing_status: {
    type: String,
    enum: ['single', 'married_joint', 'married_separate', 'head_of_household'],
    default: 'single',
  },

  // ── Tax regime (varies by jurisdiction) ──
  tax_regime: {
    type: String,
    enum: ['new', 'old', 'federal'],
    default: 'new'
  },

  // ── Number of dependents ──
  dependents: {
    type: Number,
    default: 0,
    min: 0,
    max: 20
  },

  // ── Residency classification ──
  residency_status: {
    type: String,
    enum: ['resident', 'non_resident', 'part_year'],
    default: 'resident'
  },

  // ── ISO currency code (uppercase) ──
  currency: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 3
  },

  // ── Embedded pre-tax contribution lines ──
  pre_tax_contributions: {
    type: [moneyLineSchema],
    default: []
  },

  // ── Embedded itemized deduction lines ──
  itemized_deductions: {
    type: [moneyLineSchema],
    default: []
  },

  // ── Embedded tax credit lines ──
  tax_credits: {
    type: [moneyLineSchema],
    default: []
  },

  // ── Capital loss carryforward amount ──
  capital_loss_carryforward: {
    type: Number,
    default: 0,
    min: 0
  },

  // ── Whether the profile is visible to the household ──
  shared_with_household: {
    type: Boolean,
    default: false
  },

  // ── Last 4 characters of the tax identifier (letters or digits) ──
  tax_id_last4: {
    type: String,
    default: null,
    uppercase: true,
    match: /^[A-Z0-9]{4}$/
  },

  // ── Free-form user notes ──
  notes: {
    type: String,
    default: '',
    maxlength: 2000
  },

  // ── Active flag ──
  is_active: {
    type: Boolean,
    default: true
  },

  // ── Manual optimistic-concurrency version counter ──
  _version: {
    type: Number,
    default: 0,
    min: 0
  },

}, {
  // ── Auto-managed created_at / updated_at fields ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Lookup by user and fiscal year ──
taxProfileSchema.index({ user_id: 1, fiscal_year: 1 });

// ── Lookup by user and jurisdiction ──
taxProfileSchema.index({ user_id: 1, jurisdiction: 1 });

/* —————————————————————————————————————
 * Virtuals
 * ————————————————————————————————————— */

// ── Expose string _id as `id` ──
taxProfileSchema.virtual('id').get(function id() {
  return this._id.toHexString();
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('TaxProfile', taxProfileSchema);