const mongoose = require('mongoose');

const calculationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  client_id: { type: String, required: true, trim: true, maxlength: 80 },
  expression: { type: String, required: true, trim: true, maxlength: 500 },
  result: { type: String, required: true, trim: true, maxlength: 120 },
  numeric_result: { type: Number, required: true, min: -Number.MAX_VALUE, max: Number.MAX_VALUE },
  angle_mode: { type: String, enum: ['DEG', 'RAD'], default: 'DEG' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

calculationSchema.index({ user_id: 1, created_at: -1 });
calculationSchema.index({ user_id: 1, client_id: 1 }, { unique: true });

calculationSchema.methods.toJSON = function() {
  const value = this.toObject();
  value.id = value._id;
  delete value._id;
  delete value.__v;
  return value;
};

/* Original duplicate index declaration:
// Add to models/Calculation.js
calculationSchema.index(
  { user_id: 1, client_id: 1 },
  { unique: true, name: 'user_client_unique' }
);
// Issue: Duplicate index on { user_id: 1, client_id: 1 } (already declared on line 15),
// creating redundant MongoDB index and build warnings.
*/

module.exports = mongoose.model('Calculation', calculationSchema);
