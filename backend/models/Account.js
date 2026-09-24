/* —————————————————————————————————————
 * Account Model
 * Mongoose schema for financial accounts.
 *
 * Naming note:
 *   is_active === false is surfaced to the UI as "archived".
 *
 * Indexes:
 *   - user_account_name_unique_ci : unique, case-insensitive name per user.
 *   - user_active_created         : supports the primary listing query.
 *
 * Validators mirror routes/accounts.js so direct DB writes enforce
 * the same rules as the HTTP layer.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define constants ──

// Allowed built-in account types
const ACCOUNT_TYPES = ['bank', 'wallet', 'credit_card', 'investment', 'cash', 'other'];

// Allowed icon names for the UI
const ALLOWED_ICONS = ['Wallet', 'CreditCard', 'Landmark', 'Coins'];

// Maximum absolute balance allowed on any account
const MAX_BALANCE = 999_999_999.99;

// Validation patterns
const HEX_COLOR_PATTERN = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3,4}$/;
const CUSTOM_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;

// ── Define schema ──
const accountSchema = new mongoose.Schema(
  {
    // ── Owning user reference ──
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Display name ──
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },

    // ── Account type (built-in or custom) ──
    type: {
      type: String,
      default: 'bank',
      trim: true,
      lowercase: true,
      validate: {
        validator: (value) => ACCOUNT_TYPES.includes(value) || CUSTOM_TYPE_PATTERN.test(value),
        message: 'Account type is invalid.',
      },
    },

    // ── ISO currency code ──
    currency: {
      type: String,
      required: true,
      default: 'USD',
      uppercase: true,
      trim: true,
      validate: {
        validator: (value) => CURRENCY_CODE_PATTERN.test(value),
        message: 'Currency must be a 3–4 letter ISO code.',
      },
    },

    // ── Starting balance ──
    initial_balance: {
      type: Number,
      default: 0,
      min: -MAX_BALANCE,
      max: MAX_BALANCE,
    },

    // ── Current balance ──
    current_balance: {
      type: Number,
      default: 0,
      min: -MAX_BALANCE,
      max: MAX_BALANCE,
    },

    // ── Active flag (false = "archived" in the UI) ──
    is_active: {
      type: Boolean,
      default: true,
    },

    // ── Display color ──
    color: {
      type: String,
      default: '#3b82f6',
      validate: {
        validator: (value) => HEX_COLOR_PATTERN.test(value),
        message: 'Color must be a valid hex color.',
      },
    },

    // ── Display icon ──
    icon: {
      type: String,
      default: 'Wallet',
      validate: {
        validator: (value) => ALLOWED_ICONS.includes(value),
        message: `Icon must be one of: ${ALLOWED_ICONS.join(', ')}.`,
      },
    },
  },
  {
    // ── Schema options ──
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Define indexes ──

// Unique, case-insensitive account name per user
accountSchema.index(
  { user_id: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'user_account_name_unique_ci',
  }
);

// Primary listing query support
accountSchema.index(
  { user_id: 1, is_active: -1, created_at: -1 },
  { name: 'user_active_created' }
);

// ── Define virtuals ──

// Expose string form of _id as `id`
accountSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// ── Export model ──
module.exports = mongoose.model('Account', accountSchema);