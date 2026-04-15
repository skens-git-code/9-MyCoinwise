const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  // ── Core ──────────────────────────────────────────────────────────────────
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:    { type: String, required: true, maxlength: 255, trim: true },
  amount:  { type: Number, required: true, min: 0 },
  cycle:   { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },
  color:   { type: String, default: '#7c3aed', maxlength: 20 },
  icon:    { type: String, default: '💳', maxlength: 10 },

  // ── Subscription Details ──────────────────────────────────────────────────
  url:             { type: String, default: null, maxlength: 1024 },
  notes:           { type: String, default: null, maxlength: 500 },
  payment_method:  { type: String, enum: ['card', 'bank_transfer', 'wallet', 'upi', 'other'], default: 'card' },
  currency:        { type: String, default: null, maxlength: 10 },

  // ── Billing Dates ─────────────────────────────────────────────────────────
  start_date:       { type: Date, default: Date.now },
  next_billing_date: { type: Date, default: null },
  trial_ends:       { type: Date, default: null },

  // ── Status ────────────────────────────────────────────────────────────────
  is_active:  { type: Boolean, default: true },
  is_paused:  { type: Boolean, default: false },
  cancelled_at: { type: Date, default: null }

}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
subscriptionSchema.index({ user_id: 1, is_active: 1 });
subscriptionSchema.index({ next_billing_date: 1 });

// ── Virtuals ──────────────────────────────────────────────────────────────────
subscriptionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

subscriptionSchema.virtual('annual_cost').get(function() {
  const multipliers = { daily: 365, weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };
  return this.amount * (multipliers[this.cycle] || 12);
});

subscriptionSchema.virtual('is_in_trial').get(function() {
  if (!this.trial_ends) return false;
  return this.trial_ends > new Date();
});

subscriptionSchema.virtual('days_until_billing').get(function() {
  if (!this.next_billing_date) return null;
  const diff = this.next_billing_date - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
