/**
 * Budget.js — Mongoose schema for budgets and category sub-budgets
 *
 * Notes on naming:
 *   - `is_active: false` is exposed to the UI as "inactive".
 *   - The `id` virtual mirrors `_id` as a hex string so the frontend
 *     can rely on `budget.id` without needing `._id` fallbacks.
 *
 * Indexes:
 *   - `{ user_id, name, period_start }` unique — prevents duplicate
 *     budget names within the same period, even under concurrent writes.
 *   - `{ user_id, period_start }` — covers the default listing query.
 *   - `{ user_id, is_active, period_start }` — covers "active only" filter.
 *
 * Validators mirror `routes/budgets.js` so direct DB writes (migrations,
 * seed scripts, admin tools) enforce the same rules as the HTTP layer.
 */

const mongoose = require('mongoose');

/* ============================================================
 * Constants
 * ============================================================ */

const MAX_BUDGET_NAME_LENGTH = 100;
const MAX_CATEGORY_NAME_LENGTH = 80;
const MAX_LIMIT = 999_999_999.99;
const MAX_ROLLOVER = 999_999_999.99;

const ALLOWED_BUDGET_TYPES = ['monthly', 'weekly', 'custom'];
const ALLOWED_TEMPLATES = ['student', 'family', 'travel', 'freelancer'];

const HEX_COLOR = /^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

// Emoji can be up to 8 code units long for compound sequences
// (e.g. family emoji ZWJ sequences). 16 gives headroom while still
// rejecting obviously-wrong payloads.
const MAX_ICON_LENGTH = 16;

/* ============================================================
 * Subdocument: category budget
 * ============================================================ */

const categoryBudgetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_CATEGORY_NAME_LENGTH,
    },

    limit: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_LIMIT,
    },

    // Note: `spent` is denormalized. Kept min: 0 because refunds are
    // modeled as negative expenses on the transaction side, not by
    // reducing `spent` below zero. If your system allows category
    // refunds, remove `min: 0` and update this comment.
    spent: {
      type: Number,
      default: 0,
      min: 0,
    },

    color: {
      type: String,
      default: '#0ea5e9',
      validate: {
        validator: (v) => HEX_COLOR.test(v),
        message: 'Category color must be a valid hex color.',
      },
    },

    icon: {
      type: String,
      default: '🏷️',
      maxlength: MAX_ICON_LENGTH,
    },
  },
  { _id: false }
);

/* ============================================================
 * Main schema: budget
 * ============================================================ */

const budgetSchema = new mongoose.Schema(
  {
    /* ── Core ─────────────────────────────────────────────── */

    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // No `index: true` — covered by compound indexes below.
    },

    name: {
      type: String,
      required: true,
      maxlength: MAX_BUDGET_NAME_LENGTH,
      trim: true,
    },

    type: {
      type: String,
      enum: ALLOWED_BUDGET_TYPES,
      default: 'monthly',
    },

    /* ── Period ───────────────────────────────────────────── */

    period_start: {
      type: Date,
      required: true,
    },

    period_end: {
      type: Date,
      required: true,
      validate: {
        validator: function (v) {
          // `this` is the doc on create, or the query on update. For
          // update validators we can't see period_start, so accept if
          // either is missing — the route validates the pair together.
          return !this.period_start || !v || v >= this.period_start;
        },
        message: 'period_end must be on or after period_start.',
      },
    },

    /* ── Limits & Progress ────────────────────────────────── */

    total_limit: {
      type: Number,
      required: true,
      min: 0.01,          // Must be > 0; a zero-limit budget is meaningless.
      max: MAX_LIMIT,
    },

    // Denormalized for quick listing. Must be kept in sync whenever
    // transactions are created, edited, or deleted on this budget.
    // If your system recalculates from transactions instead, this
    // field is optional and can be removed.
    total_spent: {
      type: Number,
      default: 0,
      min: 0,
      max: MAX_LIMIT * 100, // Generous ceiling — spending can exceed the limit.
    },

    /* Original schema definition without single category support:
    categories: {
      type: [categoryBudgetSchema],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 100,
        message: 'A budget cannot have more than 100 categories.',
      },
    },
    // Issue: Schema only supported multi-category subdocument array. The frontend UI sends
    // a single category string ("category: category.trim()"), causing the category to be dropped on save.
    */
    category: {
      type: String,
      trim: true,
      default: null,
      maxlength: MAX_CATEGORY_NAME_LENGTH,
    },

    categories: {
      type: [categoryBudgetSchema],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 100,
        message: 'A budget cannot have more than 100 categories.',
      },
    },

    /* ── Features ─────────────────────────────────────────── */

    rollover_enabled: {
      type: Boolean,
      default: false,
    },

    rollover_amount: {
      type: Number,
      default: 0,
      min: -MAX_ROLLOVER,
      max: MAX_ROLLOVER,
      validate: {
        validator: function (v) {
          // Rollover only makes sense when the feature is enabled.
          // Setting a non-zero value without the flag is likely a bug.
          if (!this.rollover_enabled && v !== 0) return false;
          return true;
        },
        message: 'rollover_amount must be 0 when rollover_enabled is false.',
      },
    },

    warning_thresholds: {
      type: [Number],
      default: [50, 80, 100],
      validate: [
        {
          validator: (arr) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 10,
          message: 'warning_thresholds must contain between 1 and 10 values.',
        },
        {
          validator: (arr) =>
            arr.every((v) => Number.isFinite(v) && v > 0 && v <= 500),
          message: 'Each threshold must be a number between 1 and 500.',
        },
      ],
    },

    template: {
      type: String,
      enum: [...ALLOWED_TEMPLATES, null],
      default: null,
    },

    /* ── Status ───────────────────────────────────────────── */

    is_active: {
      type: Boolean,
      default: true,
    },

    auto_renew: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    // versionKey retained for optimistic concurrency — routes use
    // findOne → mutate → save which can race under concurrent requests.
  }
);

/* ============================================================
 * Indexes
 * ============================================================ */

// Case-insensitive unique name per user per period.
// `strength: 2` = case-insensitive, accent-sensitive.
budgetSchema.index(
  { user_id: 1, name: 1, period_start: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'user_name_period_unique_ci',
  }
);

// Default listing: filter by user, sort by newest period first.
budgetSchema.index(
  { user_id: 1, period_start: -1 },
  { name: 'user_period_desc' }
);

// Active-only listing: filter by user + active, sort by newest period.
budgetSchema.index(
  { user_id: 1, is_active: 1, period_start: -1 },
  { name: 'user_active_period_desc' }
);

/* ============================================================
 * Virtuals
 * ============================================================ */

budgetSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

/**
 * Remaining budget. Can be negative to signal overspending — the
 * frontend already renders that as "Over" with a red indicator.
 * Do NOT clamp at 0; hiding the overspend makes the UI lie.
 */
budgetSchema.virtual('remaining').get(function () {
  const limit = (this.total_limit || 0) + (this.rollover_amount || 0);
  return Number((limit - (this.total_spent || 0)).toFixed(2));
});

/**
 * Progress as an uncapped percentage. Values above 100 indicate
 * overspending. The frontend caps the *bar width* visually but
 * displays the real number.
 */
budgetSchema.virtual('progress_percentage').get(function () {
  const totalAvailable = (this.total_limit || 0) + (this.rollover_amount || 0);
  if (totalAvailable <= 0) return 0;
  return Number(((this.total_spent || 0) / totalAvailable * 100).toFixed(1));
});

/* ============================================================
 * Export
 * ============================================================ */

module.exports = mongoose.model('Budget', budgetSchema);