/* —————————————————————————————————————
 * TaxDocument Model
 * Stores uploaded tax-related documents (W-2, 1099, receipts, etc.)
 * linked to a user and their tax profile.
 *
 * Key behaviors:
 *   - Documents always belong to a user AND a tax profile.
 *   - file_size is capped at 10 MB to protect storage.
 *   - `file_url` holds the storage path or signed URL — not the file itself.
 *   - `amount` and `issue_date` are optional so non-monetary docs can be stored.
 *
 * Indexes:
 *   - user_id       : fast lookup of a user's documents.
 *   - tax_profile_id: fast lookup of a profile's documents.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const taxDocumentSchema = new mongoose.Schema({
  // ── Owning user reference ──
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ── Tax profile the document belongs to ──
  tax_profile_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxProfile',
    required: true,
    index: true
  },

  // ── Document category (used for filtering and reporting) ──
  document_type: {
    type: String,
    enum: ['w2', '1099', 'form16', 't4', 't5', 'receipt', 'invoice', 'other'],
    required: true
  },

  // ── Human-readable label shown in the UI ──
  label: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  // ── Storage path or signed URL to the uploaded file ──
  file_url: {
    type: String,
    required: true,
    maxlength: 4096
  },

  // ── File size in bytes (max 10 MB) ──
  file_size: {
    type: Number,
    required: true,
    min: 0,
    max: 10 * 1024 * 1024
  },

  // ── MIME type of the uploaded file ──
  mime_type: {
    type: String,
    required: true,
    maxlength: 120
  },

  // ── Date the document was issued (optional) ──
  issue_date: {
    type: Date,
    default: null
  },

  // ── Monetary amount tied to the document (optional) ──
  amount: {
    type: Number,
    default: null,
    min: 0
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
module.exports = mongoose.model('TaxDocument', taxDocumentSchema);