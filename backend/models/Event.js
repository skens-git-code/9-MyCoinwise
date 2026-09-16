const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  type: { type: String, enum: ['bill', 'income', 'reminder', 'general'], default: 'general' },
  amount: { type: Number, default: null }, // Optional, for bills/income
  description: { type: String, trim: true },
  color: { type: String, default: '#6366f1' }, // UI Color representation
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Enable virtuals for front-end ID conversion (so _id becomes id)
eventSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  return obj;
};

/* Optimization: Add compound index on user_id and date for fast calendar queries and sorting */
eventSchema.index({ user_id: 1, date: 1 });

module.exports = mongoose.model('Event', eventSchema);
