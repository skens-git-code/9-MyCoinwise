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

// ── Hex color pattern for subscription card ──
const HEX_COLOR_PATTERN = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

// ── Maximum lengths aligned with Budget and LoginLog models ──
const MAX_NAME_LENGTH = 100;
const MAX_ICON_LENGTH = 16;

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

  // ── Subscription display name (max 100 chars, matching Budget) ──
  name: {
    type: String,
    required: true,
    maxlength: MAX_NAME_LENGTH,
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

  // ── UI color for the subscription card (strictly validated hex) ──
  color: {
    type: String,
    default: '#0ea5e9',
    validate: {
      validator: (v) => !v || HEX_COLOR_PATTERN.test(v),
      message: 'Color must be a valid hex color.',
    },
  },

  // ── UI icon for the subscription card (16 code units for compound/family emoji) ──
  icon: {
    type: String,
    default: '💳',
    maxlength: MAX_ICON_LENGTH
  },

  /* —————————————————————————————————————
   * Subscription Details
   * ————————————————————————————————————— */

  // ── Service URL (management page or signup; strictly http/https) ──
  url: {
    type: String,
    default: null,
    maxlength: 1024,
    set: (v) => {
      if (!v) return null;
      const trimmed = String(v).trim();
      if (!trimmed) return null;
      // If an explicit protocol/scheme exists, keep it as-is for the validator
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
        return trimmed;
      }
      // If no protocol was provided (e.g. 'netflix.com'), default to https://
      return `https://${trimmed}`;
    },
    validate: {
      validator: (v) => v == null || v === '' || /^https?:\/\//i.test(v),
      message: 'URL must start with http:// or https://',
    },
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

  // ── Billing currency code (ISO 4217 3-letter, defaults to USD) ──
  currency: {
    type: String,
    default: 'USD',
    uppercase: true,
    trim: true,
    validate: {
      validator: (v) => v == null || v === '' || /^[A-Z]{3}$/.test(v),
      message: 'Currency must be a 3-letter ISO 4217 code.',
    },
  },

  // ── Optional references to realizing transactions (cash flow reconciliation) ──
  linked_transaction_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }],

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
    default: true,
    validate: {
      validator: function(v) {
        // A cancelled subscription cannot be active
        if (v === true && (this?.cancelled_at || this?.getUpdate?.()?.cancelled_at)) return false;
        return true;
      },
      message: 'A cancelled subscription cannot be marked active.',
    },
  },

  // ── Temporary pause flag ──
  is_paused: {
    type: Boolean,
    default: false,
    validate: {
      validator: function(v) {
        // A cancelled subscription cannot be paused
        if (v === true && (this?.cancelled_at || this?.getUpdate?.()?.cancelled_at)) return false;
        return true;
      },
      message: 'A cancelled subscription cannot be paused.',
    },
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
 * Lifecycle Hooks
 * ————————————————————————————————————— */

// ── Ensure status flag coherence before validation ──
subscriptionSchema.pre('validate', function(next) {
  // A cancelled subscription cannot be active or paused
  if (this.cancelled_at) {
    this.is_active = false;
    this.is_paused = false;
  }
  // A paused subscription must be active-but-paused
  if (this.is_paused && !this.cancelled_at) {
    this.is_active = true;
  }
  next();
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Listing active subscriptions per user ──
subscriptionSchema.index({ user_id: 1, is_active: 1 });

// ── Upcoming billing / renewal queries per user ──
subscriptionSchema.index({ user_id: 1, next_billing_date: 1 });
subscriptionSchema.index({ next_billing_date: 1 });

// ── Partial unique, case-insensitive name per user for live subscriptions ──
// Allows cancelled subscriptions to coexist with fresh re-subscriptions
subscriptionSchema.index(
  { user_id: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { cancelled_at: null, is_active: true },
    collation: { locale: 'en', strength: 2 },
    name: 'user_sub_name_unique_live',
  }
);

/* —————————————————————————————————————
 * Virtuals
 * ————————————————————————————————————— */

// ── Expose string _id as `id` ──
subscriptionSchema.virtual('id').get(function() {
  return this._id ? this._id.toHexString() : '';
});

// ── Annualized cost derived from amount × cycle multiplier (rounded to 2 decimals) ──
subscriptionSchema.virtual('annual_cost').get(function() {
  const multipliers = { daily: 365, weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };
  const cost = (this.amount || 0) * (multipliers[this.cycle] || 12);
  return Number(cost.toFixed(2));
});

// ── True while the trial window is open and the subscription is not cancelled ──
subscriptionSchema.virtual('is_in_trial').get(function() {
  if (!this.trial_ends) return false;
  if (this.cancelled_at) return false;
  return this.trial_ends > new Date();
});

// ── Calendar days remaining until next billing (never negative; 0 if billing today) ──
subscriptionSchema.virtual('days_until_billing').get(function() {
  if (!this.next_billing_date) return null;
  const now = new Date();
  if (this.next_billing_date <= now) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const billingDay = new Date(
    this.next_billing_date.getFullYear(),
    this.next_billing_date.getMonth(),
    this.next_billing_date.getDate()
  );
  const diffDays = Math.round((billingDay - today) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// ── Standardize schema serialization and ObjectId validation ──
const { standardizeSchema } = require('../utils/schemaStandardizer');
standardizeSchema(subscriptionSchema);

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('Subscription', subscriptionSchema);