/* —————————————————————————————————————
 * Budget Model
 * Mongoose schema for budgets and category sub-budgets.
 *
 * Naming note:
 *   is_active === false is surfaced to the UI as "inactive".
 *
 * Indexes:
 *   - user_name_period_unique_ci : unique, case-insensitive name per user per period.
 *   - user_period_desc           : default listing query.
 *   - user_active_period_desc    : "active only" listing query.
 *
 * Validators mirror routes/budgets.js so direct DB writes (migrations,
 * seed scripts, admin tools) enforce the same rules as the HTTP layer.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define constants ──

// Name length limits
const MAX_BUDGET_NAME_LENGTH = 100;
const MAX_CATEGORY_NAME_LENGTH = 80;

// Numeric limits
const MAX_LIMIT = 999_999_999.99;
const MAX_ROLLOVER = 999_999_999.99;

// Allowed enum values
const ALLOWED_BUDGET_TYPES = ['monthly', 'weekly', 'custom'];
const ALLOWED_TEMPLATES = ['student', 'family', 'travel', 'freelancer'];

// Validation patterns
const HEX_COLOR_PATTERN = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

// Emoji can be up to 8 code units long for compound sequences
// (e.g. family emoji ZWJ sequences). 16 gives headroom.
const MAX_ICON_LENGTH = 16;

/* —————————————————————————————————————
 * Category Budget Subdocument
 * Embedded sub-budget with its own limit, spend, and styling.
 * ————————————————————————————————————— */
const categoryBudgetSchema = new mongoose.Schema(
  {
    // ── Category name ──
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_CATEGORY_NAME_LENGTH,
    },

    // ── Category limit ──
    limit: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_LIMIT,
    },

    // ── Denormalized spend amount ──
    // Refunds are modeled as negative expenses elsewhere, so `spent` never drops below 0.
    spent: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Category color ──
    color: {
      type: String,
      default: '#0ea5e9',
      validate: {
        validator: (value) => HEX_COLOR_PATTERN.test(value),
        message: 'Category color must be a valid hex color.',
      },
    },

    // ── Category icon ──
    icon: {
      type: String,
      default: '🏷️',
      maxlength: MAX_ICON_LENGTH,
    },
  },
  { _id: false }
);

/* —————————————————————————————————————
 * Main Budget Schema
 * Top-level budget document owned by a user.
 * ————————————————————————————————————— */
const budgetSchema = new mongoose.Schema(
  {
    // ── Core fields ──

    // Owning user reference
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Display name
    name: {
      type: String,
      required: true,
      maxlength: MAX_BUDGET_NAME_LENGTH,
      trim: true,
    },

    // Budget cadence
    type: {
      type: String,
      enum: ALLOWED_BUDGET_TYPES,
      default: 'monthly',
    },

    // ── Period fields ──

    // Period start date
    period_start: {
      type: Date,
      required: true,
    },

    // Period end date
    period_end: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          // `this` is the doc on create, or the query on update.
          // For updates we cannot see period_start, so accept when either is missing.
          return !this.period_start || !value || value >= this.period_start;
        },
        message: 'period_end must be on or after period_start.',
      },
    },

    // ── Limit and progress ──

    // Total budget limit
    total_limit: {
      type: Number,
      required: true,
      min: 0.01,
      max: MAX_LIMIT,
    },

    // Denormalized spent total, kept in sync with transactions
    total_spent: {
      type: Number,
      default: 0,
      min: 0,
      max: MAX_LIMIT * 100,
    },

    // Single-category string support for the frontend
    category: {
      type: String,
      trim: true,
      default: null,
      maxlength: MAX_CATEGORY_NAME_LENGTH,
    },

    // Multi-category sub-budget list
    categories: {
      type: [categoryBudgetSchema],
      default: [],
      validate: {
        validator: (list) => Array.isArray(list) && list.length <= 100,
        message: 'A budget cannot have more than 100 categories.',
      },
    },

    // ── Feature flags ──

    // Rollover toggle
    rollover_enabled: {
      type: Boolean,
      default: false,
    },

    // Rollover amount
    rollover_amount: {
      type: Number,
      default: 0,
      min: -MAX_ROLLOVER,
      max: MAX_ROLLOVER,
      validate: {
        validator: function (value) {
          // Rollover only makes sense when the feature is enabled.
          if (!this.rollover_enabled && value !== 0) return false;
          return true;
        },
        message: 'rollover_amount must be 0 when rollover_enabled is false.',
      },
    },

    // Warning thresholds (percentages)
    warning_thresholds: {
      type: [Number],
      default: [50, 80, 100],
      validate: [
        {
          validator: (list) => Array.isArray(list) && list.length >= 1 && list.length <= 10,
          message: 'warning_thresholds must contain between 1 and 10 values.',
        },
        {
          validator: (list) =>
            list.every((value) => Number.isFinite(value) && value > 0 && value <= 500),
          message: 'Each threshold must be a number between 1 and 500.',
        },
      ],
    },

    // Optional template preset
    template: {
      type: String,
      enum: [...ALLOWED_TEMPLATES, null],
      default: null,
    },

    // ── Status fields ──

    // Active flag (false = "inactive" in the UI)
    is_active: {
      type: Boolean,
      default: true,
    },

    // Auto-renew toggle
    auto_renew: {
      type: Boolean,
      default: true,
    },
  },
  {
    // ── Schema options ──
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    // versionKey retained for optimistic concurrency.
  }
);

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// Unique, case-insensitive budget name per user per period
budgetSchema.index(
  { user_id: 1, name: 1, period_start: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'user_name_period_unique_ci',
  }
);

// Default listing: newest period first
budgetSchema.index(
  { user_id: 1, period_start: -1 },
  { name: 'user_period_desc' }
);

// Active-only listing: newest period first
budgetSchema.index(
  { user_id: 1, is_active: 1, period_start: -1 },
  { name: 'user_active_period_desc' }
);

/* —————————————————————————————————————
 * Virtuals
 * ————————————————————————————————————— */

// ── Expose string _id as `id` ──
budgetSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// ── Remaining budget (may be negative on overspend) ──
budgetSchema.virtual('remaining').get(function () {
  const totalAvailable = (this.total_limit || 0) + (this.rollover_amount || 0);
  return Number((totalAvailable - (this.total_spent || 0)).toFixed(2));
});

// ── Uncapped progress percentage (values above 100 mean overspent) ──
budgetSchema.virtual('progress_percentage').get(function () {
  const totalAvailable = (this.total_limit || 0) + (this.rollover_amount || 0);
  if (totalAvailable <= 0) return 0;
  return Number(((this.total_spent || 0) / totalAvailable * 100).toFixed(1));
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export model ──
module.exports = mongoose.model('Budget', budgetSchema);