const mongoose = require('mongoose');

const taxPaymentSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tax_profile_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxProfile', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, uppercase: true, maxlength: 3 },
  payment_date: { type: Date, required: true, index: true },
  payment_type: { type: String, enum: ['advance_tax', 'tds', 'quarterly', 'self_assessment', 'other'], required: true },
  reference: { type: String, default: '', maxlength: 100, trim: true },
  notes: { type: String, default: '', maxlength: 500 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('TaxPayment', taxPaymentSchema);
