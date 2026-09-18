const mongoose = require('mongoose');

const taxDocumentSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tax_profile_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxProfile', required: true, index: true },
  document_type: { type: String, enum: ['w2', '1099', 'form16', 't4', 't5', 'receipt', 'invoice', 'other'], required: true },
  label: { type: String, required: true, trim: true, maxlength: 200 },
  file_url: { type: String, required: true, maxlength: 4096 },
  file_size: { type: Number, required: true, min: 0, max: 10 * 1024 * 1024 },
  mime_type: { type: String, required: true, maxlength: 120 },
  issue_date: { type: Date, default: null },
  amount: { type: Number, default: null, min: 0 },
  notes: { type: String, default: '', maxlength: 500 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('TaxDocument', taxDocumentSchema);
