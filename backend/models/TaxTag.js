/* —————————————————————————————————————
 * TaxTag Model
 * Links a Transaction to a tax treatment (deductible, capital gain,
 * exempt, etc.) and optionally to a TaxProfile.
 *
 * Key behaviors:
 *   - One tag per transaction (transaction_id is unique).
 *   - `portion` allows partial tagging (e.g. 50% business use).
 *   - `tax_amount` is optional and used when the tag carries a
 *     specific monetary value.
 *   - Only `created_at` is tracked — tags are considered immutable,
 *     so `updated_at` is disabled.
 *
 * Indexes:
 *   - transaction_id (unique) : one tag per transaction.
 *   - user_id                 : fast lookup of a user's tags.
 *   - user_id + treatment     : filter tags by treatment per user.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const taxTagSchema = new mongoose.Schema({
  // ── Transaction the tag applies to (one tag per transaction) ──
  transaction_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true,
    unique: true,
    index: true
  },

  // ── Owning user reference ──
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ── Optional tax profile the tag is scoped to ──
  tax_profile_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxProfile',
    default: null
  },

  // ── Tax treatment category ──
  treatment: {
    type: String,
    enum: [
      'deductible',
      'non_deductible',
      'capital_gain',
      'capital_loss',
      'exempt',
      'business_expense',
      'medical',
      'charity',
      'retirement',
      'education'
    ],
    required: true,
  },

  // ── Percentage of the transaction included (0–100) ──
  portion: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },

  // ── Optional monetary tax amount tied to the tag ──
  tax_amount: {
    type: Number,
    default: null,
    min: 0
  },

  // ── Free-form user note ──
  note: {
    type: String,
    default: '',
    maxlength: 500
  },

}, {
  // ── Only created_at is stored; tags are immutable ──
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Filter a user's tags by treatment ──
taxTagSchema.index({ user_id: 1, treatment: 1 });

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('TaxTag', taxTagSchema);