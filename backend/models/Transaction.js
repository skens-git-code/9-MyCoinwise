const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // ── Core ──────────────────────────────────────────────────────────────────
  user_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:     { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true, maxlength: 80, trim: true },
  amount:   { type: Number, required: true, min: 0 },
  date:     { type: Date, default: Date.now, index: true },
  note:     { type: String, default: null, maxlength: 500 },

  // ── Enhanced Financial Details ─────────────────────────────────────────────
  currency:        { type: String, default: null, maxlength: 10 },
  payment_method:  { type: String, enum: ['cash', 'card', 'upi', 'bank_transfer', 'wallet', 'cheque', 'other'], default: 'other' },
  location:        { type: String, default: null, maxlength: 255, trim: true },
  tags:            { type: [String], default: [] },

  // ── Receipt & Attachments ──────────────────────────────────────────────────
  receipt_url: { type: String, default: null, maxlength: 1024 },

  // ── Recurring Transaction Support ─────────────────────────────────────────
  is_recurring:          { type: Boolean, default: false },
  recurrence_interval:   { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly', null], default: null },
  recurrence_ends_at:    { type: Date, default: null },
  parent_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },

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
transactionSchema.index({ tags: 1 });

// ── Virtual ───────────────────────────────────────────────────────────────────
transactionSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

module.exports = mongoose.model('Transaction', transactionSchema);
