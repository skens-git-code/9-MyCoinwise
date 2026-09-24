/* —————————————————————————————————————
 * Transaction Model
 * Stores all income and expense entries, including bank-imported
 * items, splits, receipts, and recurring instances.
 *
 * Key behaviors:
 *   - Soft delete via `is_deleted` — records are never hard-deleted.
 *   - `import_fingerprint` deduplicates bank statement imports.
 *   - Recurring instances are uniquely identified per user via
 *     `recurrence_instance_key` (partial unique index).
 *   - Splits and audit logs are embedded subdocuments.
 *
 * Indexes:
 *   - Listings : user + date, user + type, user + category.
 *   - Filtering: user + account + is_deleted.
 *   - Dedup    : user + import_fingerprint (sparse).
 *   - Tag      : tags.
 *   - Recurrence: user + recurrence_instance_key (partial unique).
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const transactionSchema = new mongoose.Schema({
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

  // ── Transaction direction ──
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },

  // ── Category label ──
  category: {
    type: String,
    required: true,
    maxlength: 80,
    trim: true
  },

  // ── Transaction amount (non-negative) ──
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  // ── Transaction date ──
  date: {
    type: Date,
    default: Date.now,
    index: true
  },

  // ── Optional user note ──
  note: {
    type: String,
    default: null,
    maxlength: 500
  },

  // ── Optional linked account ──
  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    default: null,
    index: true
  },

  /* —————————————————————————————————————
   * Financial Details
   * ————————————————————————————————————— */

  // ── Optional external transaction number (cheque, ref no., etc.) ──
  transaction_number: {
    type: String,
    default: null,
    trim: true,
    maxlength: 100
  },

  // ── Optional currency code ──
  currency: {
    type: String,
    default: null,
    maxlength: 10
  },

  // ── Payment method used ──
  payment_method: {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer', 'wallet', 'cheque', 'other'],
    default: 'other'
  },

  // ── Free-form location ──
  location: {
    type: String,
    default: null,
    maxlength: 255,
    trim: true
  },

  // ── Free-form tags for filtering ──
  tags: {
    type: [String],
    default: []
  },

  // ── Merchant name ──
  merchant: {
    type: String,
    default: null,
    maxlength: 150,
    trim: true
  },

  /* —————————————————————————————————————
   * Bank Import Metadata
   * The original statement file is never retained. These normalized
   * fields let the app explain an imported item and safely identify
   * it on a later import.
   * ————————————————————————————————————— */

  // ── Source of the import (e.g. "hdfc_csv") ──
  import_source: {
    type: String,
    default: null,
    maxlength: 40
  },

  // ── Fingerprint used to deduplicate re-imports ──
  import_fingerprint: {
    type: String,
    default: null,
    maxlength: 64,
    index: true
  },

  // ── External reference from the statement ──
  external_reference: {
    type: String,
    default: null,
    maxlength: 150,
    trim: true
  },

  // ── Counterparty bank name ──
  counterparty_bank: {
    type: String,
    default: null,
    maxlength: 200,
    trim: true
  },

  /* —————————————————————————————————————
   * Split Details
   * ————————————————————————————————————— */

  // ── Whether this transaction has any splits ──
  is_split: {
    type: Boolean,
    default: false
  },

  // ── Embedded split entries ──
  split_details: [{
    // ── Person the split is with ──
    person: {
      type: String,
      maxlength: 100
    },
    // ── Amount owed by that person ──
    amount: {
      type: Number,
      min: 0
    },
    // ── Whether the split has been settled ──
    paid: {
      type: Boolean,
      default: false
    }
  }],

  /* —————————————————————————————————————
   * Audit History
   * ————————————————————————————————————— */

  // ── Embedded audit trail of changes ──
  audit_logs: [{
    // ── Action performed ──
    action: {
      type: String,
      required: true
    },
    // ── When it happened ──
    timestamp: {
      type: Date,
      default: Date.now
    },
    // ── Free-form details ──
    details: {
      type: mongoose.Schema.Types.Mixed
    }
  }],

  /* —————————————————————————————————————
   * Receipt & Attachments
   * ————————————————————————————————————— */

  // ── URL of an attached receipt image or PDF ──
  receipt_url: {
    type: String,
    default: null,
    maxlength: 1024
  },

  /* —————————————————————————————————————
   * Recurring Transaction Support
   * ————————————————————————————————————— */

  // ── Marks the parent as part of a recurrence series ──
  is_recurring: {
    type: Boolean,
    default: false
  },

  // ── Marks the transaction as explicitly non-recurring ──
  is_one_time: {
    type: Boolean,
    default: false
  },

  // ── Recurrence cadence ──
  recurrence_interval: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', null],
    default: null
  },

  // ── When the recurrence series ends ──
  recurrence_ends_at: {
    type: Date,
    default: null
  },

  // ── Parent transaction for generated instances ──
  parent_transaction_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },

  // ── Deterministic key identifying a recurrence instance (hidden by default) ──
  recurrence_instance_key: {
    type: String,
    select: false
  },

  /* —————————————————————————————————————
   * Soft Delete
   * ————————————————————————————————————— */

  // ── Soft-delete flag — records are never hard-deleted ──
  is_deleted: {
    type: Boolean,
    default: false
  }

}, {
  // ── Schema options ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Listing: newest first per user ──
transactionSchema.index({ user_id: 1, date: -1 });

// ── Listing: filter by income/expense ──
transactionSchema.index({ user_id: 1, type: 1 });

// ── Listing: filter by category ──
transactionSchema.index({ user_id: 1, category: 1 });

// ── Listing: filter by account, excluding soft-deleted ──
transactionSchema.index({ user_id: 1, account_id: 1, is_deleted: 1 });

// ── Import deduplication (only when a fingerprint is present) ──
transactionSchema.index({ user_id: 1, import_fingerprint: 1 }, { sparse: true });

// ── Tag lookups ──
transactionSchema.index({ tags: 1 });

// ── Recurrence: one instance per user + key (only when key is a string) ──
transactionSchema.index(
  { user_id: 1, recurrence_instance_key: 1 },
  {
    unique: true,
    partialFilterExpression: { recurrence_instance_key: { $exists: true, $type: 'string' } }
  }
);

/* —————————————————————————————————————
 * Virtuals
 * ————————————————————————————————————— */

// ── Expose string _id as `id` ──
transactionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('Transaction', transactionSchema);