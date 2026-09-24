/* —————————————————————————————————————
 * Subscription Model
 * Stores recurring subscription entries per user, including
 * billing cycle, payment method, and next billing date.
 *
 * Key behaviors:
 *   - Duplicate names per user are prevented (case-insensitive).
 *   - Virtuals expose annual cost, trial status, and days until billing.
 *   - `is_paused` and `cancelled_at` track non-active states, while
 *     `is_active` remains the primary toggle.
 *
 * Indexes:
 *   - user_id + name (unique, case-insensitive): prevents duplicates.
 *   - user_id + is_active: listing active subscriptions.
 *   - next_billing_date: reminder / renewal queries.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const subscriptionSchema = new mongoose.Schema({
  /* —————————————————————————————————————
   * Core Fields
   * ————————————————————————————————————— */

  // ── Owning user reference ──
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ── Subscription display name ──
  name: {
    type: String,
    required: true,
    maxlength: 255,
    trim: true
  },

  // ── Recurring charge amount ──
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  // ── Billing cycle ──
  cycle: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
    default: 'monthly'
  },

  // ── UI color for the subscription card ──
  color: {
    type: String,
    default: '#0ea5e9',
    maxlength: 20
  },

  // ── UI icon for the subscription card ──
  icon: {
    type: String,
    default: '💳',
    maxlength: 10
  },

  /* —————————————————————————————————————
   * Subscription Details
   * ————————————————————————————————————— */

  // ── Service URL (management page or signup) ──
  url: {
    type: String,
    default: null,
    maxlength: 1024
  },

  // ── Free-form notes ──
  notes: {
    type: String,
    default: null,
    maxlength: 500
  },

  // ── Payment method used for the charge ──
  payment_method: {
    type: String,
    enum: ['card', 'bank_transfer', 'wallet', 'upi', 'other'],
    default: 'card'
  },

  // ── Billing currency code ──
  currency: {
    type: String,
    default: null,
    maxlength: 10
  },

  /* —————————————————————————————————————
   * Billing Dates
   * ————————————————————————————————————— */

  // ── Subscription start date ──
  start_date: {
    type: Date,
    default: Date.now
  },

  // ── Next scheduled billing date (used for reminders) ──
  next_billing_date: {
    type: Date,
    default: null
  },

  // ── Trial end date, when applicable ──
  trial_ends: {
    type: Date,
    default: null
  },

  /* —————————————————————————————————————
   * Status Flags
   * ————————————————————————————————————— */

  // ── Primary active toggle ──
  is_active: {
    type: Boolean,
    default: true
  },

  // ── Temporary pause flag ──
  is_paused: {
    type: Boolean,
    default: false
  },

  // ── Timestamp when the subscription was cancelled ──
  cancelled_at: {
    type: Date,
    default: null
  }

}, {
  // ── Auto-managed created_at / updated_at fields ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Listing active subscriptions per user ──
subscriptionSchema.index({ user_id: 1, is_active: 1 });

// ── Upcoming billing / renewal queries ──
subscriptionSchema.index({ next_billing_date: 1 });

// ── Unique, case-insensitive name per user ──
subscriptionSchema.index(
  { user_id: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 }, name: 'user_sub_name_unique' }
);

/* —————————————————————————————————————
 * Virtuals
 * ————————————————————————————————————— */

// ── Expose string _id as `id` ──
subscriptionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// ── Annualized cost derived from amount × cycle multiplier ──
subscriptionSchema.virtual('annual_cost').get(function() {
  const multipliers = { daily: 365, weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };
  return this.amount * (multipliers[this.cycle] || 12);
});

// ── True while the trial window is still open ──
subscriptionSchema.virtual('is_in_trial').get(function() {
  if (!this.trial_ends) return false;
  return this.trial_ends > new Date();
});

// ── Days remaining until next billing (never negative) ──
subscriptionSchema.virtual('days_until_billing').get(function() {
  if (!this.next_billing_date) return null;
  const diff = this.next_billing_date - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('Subscription', subscriptionSchema);