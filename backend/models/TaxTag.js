const mongoose = require('mongoose');

const taxTagSchema = new mongoose.Schema({
  transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, unique: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tax_profile_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxProfile', default: null },
  treatment: {
    type: String,
    enum: ['deductible', 'non_deductible', 'capital_gain', 'capital_loss', 'exempt', 'business_expense', 'medical', 'charity', 'retirement', 'education'],
    required: true,
  },
  portion: { type: Number, default: 100, min: 0, max: 100 },
  tax_amount: { type: Number, default: null, min: 0 },
  note: { type: String, default: '', maxlength: 500 },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

taxTagSchema.index({ user_id: 1, treatment: 1 });

module.exports = mongoose.model('TaxTag', taxTagSchema);
