const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // ── Core ──────────────────────────────────────────────────────────────────
  user_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:     { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true, maxlength: 80, trim: true },
  amount:   { type: Number, required: true, min: 0 },
  date:     { type: Date, default: Date.now, index: true },
  note:     { type: String, default: null, maxlength: 500 },
  account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },

  // ── Enhanced Financial Details ─────────────────────────────────────────────
  currency:        { type: String, default: null, maxlength: 10 },
  payment_method:  { type: String, enum: ['cash', 'card', 'upi', 'bank_transfer', 'wallet', 'cheque', 'other'], default: 'other' },
  location:        { type: String, default: null, maxlength: 255, trim: true },
  tags:            { type: [String], default: [] },
  merchant:        { type: String, default: null, maxlength: 150, trim: true },

  // ── Split Details ────────────────────────────────────────────────────────
  is_split:        { type: Boolean, default: false },
  split_details:   [{
    person: { type: String, maxlength: 100 },
    amount: { type: Number, min: 0 },
    paid:   { type: Boolean, default: false }
  }],

  // ── Audit History ────────────────────────────────────────────────────────
  audit_logs:      [{
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    details: { type: mongoose.Schema.Types.Mixed }
  }],

  // ── Receipt & Attachments ──────────────────────────────────────────────────
  receipt_url: { type: String, default: null, maxlength: 1024 },

  // ── Recurring Transaction Support ─────────────────────────────────────────
  is_recurring:          { type: Boolean, default: false },
  is_one_time:           { type: Boolean, default: false },
  recurrence_interval:   { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly', null], default: null },
  recurrence_ends_at:    { type: Date, default: null },
  parent_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  recurrence_instance_key: { type: String, default: null, select: false },

  // ── Metadata ──────────────────────────────────────────────────────────────
  is_deleted: { type: Boolean, default: false }   // Soft delete

}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
transactionSchema.index({ user_id: 1, date: -1 });
transactionSchema.index({ user_id: 1, type: 1 });
transactionSchema.index({ user_id: 1, category: 1 });
transactionSchema.index({ user_id: 1, account_id: 1, is_deleted: 1 });
transactionSchema.index({ tags: 1 });
transactionSchema.index(
  { user_id: 1, recurrence_instance_key: 1 },
  { unique: true, sparse: true }
);

// ── Virtual ───────────────────────────────────────────────────────────────────
transactionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

module.exports = mongoose.model('Transaction', transactionSchema);
