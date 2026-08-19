const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 100, trim: true },
  type: { type: String, enum: ['bank', 'wallet', 'credit_card', 'investment', 'cash', 'other'], default: 'bank' },
  currency: { type: String, required: true, maxlength: 10, default: 'USD' },
  initial_balance: { type: Number, default: 0 },
  current_balance: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
  color: { type: String, default: '#3b82f6' }, // For UI display
  icon: { type: String, default: 'Wallet' }, // For UI display
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

accountSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

module.exports = mongoose.model('Account', accountSchema);
