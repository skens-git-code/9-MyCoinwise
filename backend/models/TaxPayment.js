/* —————————————————————————————————————
 * TaxPayment Model
 * Records tax payments made by a user against a tax profile,
 * such as advance tax, TDS, quarterly payments, and
 * self-assessment.
 *
 * Key behaviors:
 *   - Every payment belongs to a user AND a tax profile.
 *   - `currency` is stored as a 3-letter uppercase ISO code.
 *   - `payment_date` is indexed to support chronological listings
 *     and reporting.
 *
 * Indexes:
 *   - user_id        : fast lookup of a user's payments.
 *   - tax_profile_id : fast lookup of a profile's payments.
 *   - payment_date   : chronological queries and reports.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const taxPaymentSchema = new mongoose.Schema({
  // ── Owning user reference ──
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ── Tax profile the payment is associated with ──
  tax_profile_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxProfile',
    required: true,
    index: true
  },

  // ── Payment amount (must be greater than zero) ──
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },

  // ── ISO 4217 3-letter currency code ──
  currency: {
    type: String,
    required: true,
    uppercase: true,
    maxlength: 3
  },

  // ── Date the payment was made ──
  payment_date: {
    type: Date,
    required: true,
    index: true
  },

  // ── Category of the tax payment ──
  payment_type: {
    type: String,
    enum: ['advance_tax', 'tds', 'quarterly', 'self_assessment', 'other'],
    required: true
  },

  // ── External reference (challan no., transaction ID, etc.) ──
  reference: {
    type: String,
    default: '',
    maxlength: 100,
    trim: true
  },

  // ── Free-form user notes ──
  notes: {
    type: String,
    default: '',
    maxlength: 500
  },

}, {
  // ── Auto-managed created_at / updated_at fields ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('TaxPayment', taxPaymentSchema);