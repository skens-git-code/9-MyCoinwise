/**
 * TaxDocument Model
 *
 * Defines the schema for tax-related documents (e.g., W-2, 1099, Form 16, receipts)
 * associated with a specific user and tax profile.
 *
 * Constraints & Business Logic:
 *   - Ownership: Each document is strictly bound to a user and a tax profile.
 *   - Storage: File size is capped at 10 MB to enforce storage constraints.
 *   - File Reference: `file_url` stores the storage path or signed URL, not the binary data.
 *   - Optional Fields: `amount` and `issue_date` are optional to support non-monetary documentation.
 *
 * Indexes:
 *   - user_id: Optimized for querying documents by user.
 *   - tax_profile_id: Optimized for querying documents by tax profile.
 *   - (user_id, created_at): Compound index for chronological document retrieval.
 */

// Dependency: Mongoose ODM
const mongoose = require('mongoose');

// Schema Definition
const taxDocumentSchema = new mongoose.Schema({
  
  // Ownership: Associated User
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Ownership: Associated Tax Profile
  tax_profile_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxProfile',
    required: true,
    index: true
  },

  // Categorization: Document Type
  // Note: Enum supports multi-jurisdictional tax forms (US: W-2/1099, IN: Form 16, CA: T4/T5).
  document_type: {
    type: String,
    enum: ['w2', '1099', 'form16', 't4', 't5', 'receipt', 'invoice', 'other'],
    required: true
  },

  // UI Display: User-defined descriptive label
  label: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  // Storage: Path or signed URL (encrypted with AES-256-GCM at rest)
  file_url: {
    type: String,
    required: true,
    maxlength: 8192
  },

  // Constraint: File size in bytes (Max: 10 MB)
  file_size: {
    type: Number,
    required: true,
    min: 0,
    max: 10 * 1024 * 1024
  },

  // File Metadata: MIME type
  mime_type: {
    type: String,
    required: true,
    maxlength: 120
  },

  // Financial Context: Issue date (optional)
  issue_date: {
    type: Date,
    default: null
  },

  // Financial Context: Associated monetary amount (optional)
  amount: {
    type: Number,
    default: null,
    min: 0
  },

  // Annotations: User-provided notes
  notes: {
    type: String,
    default: '',
    maxlength: 500
  },

}, {
  // Audit: Automated timestamp tracking
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Database Indexing: Compound index for efficient chronological retrieval
taxDocumentSchema.index({ user_id: 1, created_at: -1 });

// Utility: Standardize schema serialization and ObjectId validation
const { standardizeSchema } = require('../utils/schemaStandardizer');
standardizeSchema(taxDocumentSchema);

// Export: Register and export the Mongoose model
module.exports = mongoose.model('TaxDocument', taxDocumentSchema);