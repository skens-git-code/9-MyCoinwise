const mongoose = require('mongoose');

const categoryBudgetSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  limit: { type: Number, required: true, min: 0 },
  spent: { type: Number, default: 0, min: 0 },
  color: { type: String, default: '#0ea5e9', maxlength: 20 },
  icon: { type: String, default: '🏷️', maxlength: 10 }
}, { _id: false }); // Disable _id for subdocuments to save space if not needed

const budgetSchema = new mongoose.Schema({
  // ── Core ──────────────────────────────────────────────────────────────────
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 100, trim: true },
  type: { type: String, enum: ['monthly', 'weekly', 'custom'], default: 'monthly' },
  
  // ── Period ────────────────────────────────────────────────────────────────
  period_start: { type: Date, required: true },
  period_end: { type: Date, required: true },
  
  // ── Limits & Progress ─────────────────────────────────────────────────────
  total_limit: { type: Number, required: true, min: 0 },
  total_spent: { type: Number, default: 0, min: 0 }, // Denormalized for quick querying
  categories: { type: [categoryBudgetSchema], default: [] },
  
  // ── Features ──────────────────────────────────────────────────────────────
  rollover_enabled: { type: Boolean, default: false },
  rollover_amount: { type: Number, default: 0 }, // Amount rolled over from previous period
  warning_thresholds: { type: [Number], default: [50, 80, 100] }, // Percentages at which to warn
  template: { type: String, enum: ['student', 'family', 'travel', 'freelancer', null], default: null },
  
  // ── Status ────────────────────────────────────────────────────────────────
  is_active: { type: Boolean, default: true },
  auto_renew: { type: Boolean, default: true } // Whether to recreate automatically next month
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
budgetSchema.index({ user_id: 1, period_start: -1 });
budgetSchema.index({ user_id: 1, is_active: 1, period_start: -1 });

// ── Virtuals ──────────────────────────────────────────────────────────────────
budgetSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

budgetSchema.virtual('remaining').get(function() {
  return Math.max(0, this.total_limit + this.rollover_amount - this.total_spent);
});

budgetSchema.virtual('progress_percentage').get(function() {
  const totalAvailable = this.total_limit + this.rollover_amount;
  if (totalAvailable <= 0) return 0;
  return Math.min(100, Math.round((this.total_spent / totalAvailable) * 100));
});

module.exports = mongoose.model('Budget', budgetSchema);
