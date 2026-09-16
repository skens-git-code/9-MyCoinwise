/**
 * Account.js — Mongoose schema for financial accounts
 *
 * Naming: `is_active: false` is exposed to the UI as "archived".
 *
 * Indexes:
 *   - { user_id, name } unique (case-insensitive) — prevents duplicate
 *     account names per user, even under concurrent writes.
 *   - { user_id, is_active, created_at } — covers the primary listing.
 *
 * Validators mirror routes/accounts.js so direct DB writes enforce the
 * same rules as the HTTP layer.
 */

const mongoose = require('mongoose');

/* ── Constants ─────────────────────────────────────────────── */

const ACCOUNT_TYPES = ['bank', 'wallet', 'credit_card', 'investment', 'cash', 'other'];
const ALLOWED_ICONS = ['Wallet', 'CreditCard', 'Landmark', 'Coins'];
const MAX_BALANCE = 999_999_999.99;

const HEX_COLOR = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;
const CURRENCY_CODE = /^[A-Z]{3,4}$/;
const CUSTOM_TYPE = /^[a-z][a-z0-9_]{0,49}$/;

/* ── Schema ────────────────────────────────────────────────── */

const accountSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },

    type: {
      type: String,
      default: 'bank',
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => ACCOUNT_TYPES.includes(v) || CUSTOM_TYPE.test(v),
        message: 'Account type is invalid.',
      },
    },

    currency: {
      type: String,
      required: true,
      default: 'USD',
      uppercase: true,
      trim: true,
      validate: {
        validator: (v) => CURRENCY_CODE.test(v),
        message: 'Currency must be a 3–4 letter ISO code.',
      },
    },

    initial_balance: {
      type: Number,
      default: 0,
      min: -MAX_BALANCE,
      max: MAX_BALANCE,
    },

    current_balance: {
      type: Number,
      default: 0,
      min: -MAX_BALANCE,
      max: MAX_BALANCE,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    color: {
      type: String,
      default: '#3b82f6',
      validate: {
        validator: (v) => HEX_COLOR.test(v),
        message: 'Color must be a valid hex color.',
      },
    },

    icon: {
      type: String,
      default: 'Wallet',
      validate: {
        validator: (v) => ALLOWED_ICONS.includes(v),
        message: `Icon must be one of: ${ALLOWED_ICONS.join(', ')}.`,
      },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ── Indexes ───────────────────────────────────────────────── */

accountSchema.index(
  { user_id: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'user_account_name_unique_ci',
  }
);

accountSchema.index(
  { user_id: 1, is_active: -1, created_at: -1 },
  { name: 'user_active_created' }
);

/* ── Virtuals ──────────────────────────────────────────────── */

accountSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

module.exports = mongoose.model('Account', accountSchema);