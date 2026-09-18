const mongoose = require('mongoose');

const moneyLineSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true, maxlength: 120 },
  amount: { type: Number, required: true, min: 0 },
  category: { type: String, default: 'other', trim: true, maxlength: 80 },
  type: { type: String, default: 'user_defined', trim: true, maxlength: 60 },
  frequency: { type: String, default: 'annual', enum: ['annual', 'monthly', 'quarterly', 'one_time'] },
}, { _id: false });

const taxProfileSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  household_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true, sparse: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  jurisdiction: { type: String, required: true, enum: ['IN', 'US'] },
  fiscal_year: { type: Number, required: true, min: 2000, max: 2100 },
  filing_status: {
    type: String,
    enum: ['single', 'married_joint', 'married_separate', 'head_of_household'],
    default: 'single',
  },
  tax_regime: { type: String, enum: ['new', 'old', 'federal'], default: 'new' },
  dependents: { type: Number, default: 0, min: 0, max: 20 },
  residency_status: { type: String, enum: ['resident', 'non_resident', 'part_year'], default: 'resident' },
  currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
  pre_tax_contributions: { type: [moneyLineSchema], default: [] },
  itemized_deductions: { type: [moneyLineSchema], default: [] },
  tax_credits: { type: [moneyLineSchema], default: [] },
  capital_loss_carryforward: { type: Number, default: 0, min: 0 },
  shared_with_household: { type: Boolean, default: false },
  // Store only the last four characters; PANs contain letters as well as digits.
  tax_id_last4: { type: String, default: null, uppercase: true, match: /^[A-Z0-9]{4}$/ },
  notes: { type: String, default: '', maxlength: 2000 },
  is_active: { type: Boolean, default: true },
  _version: { type: Number, default: 0, min: 0 },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

taxProfileSchema.index({ user_id: 1, fiscal_year: 1 });
taxProfileSchema.index({ user_id: 1, jurisdiction: 1 });

taxProfileSchema.virtual('id').get(function id() {
  return this._id.toHexString();
});

module.exports = mongoose.model('TaxProfile', taxProfileSchema);
