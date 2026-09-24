/* —————————————————————————————————————
 * Calculation Model
 * Stores calculator history entries for each user.
 *
 * Used for:
 *   - Displaying recent calculations
 *   - Syncing offline calculations via client_id
 *   - Replaying expressions with the correct angle mode
 *
 * Indexes:
 *   - user_id + created_at (desc) : recent history per user
 *   - user_id + client_id (unique): prevents duplicate synced entries
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const calculationSchema = new mongoose.Schema({
  // ── Owning user ──
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ── Client-side ID used for deduplication when syncing ──
  client_id: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },

  // ── Original expression entered by the user ──
  expression: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },

  // ── Display result (string form) ──
  result: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },

  // ── Numeric result used for sorting or comparisons ──
  numeric_result: {
    type: Number,
    required: true,
    min: -Number.MAX_VALUE,
    max: Number.MAX_VALUE
  },

  // ── Angle mode used when the expression was evaluated ──
  angle_mode: {
    type: String,
    enum: ['DEG', 'RAD'],
    default: 'DEG'
  }
}, {
  // ── Auto-managed created_at / updated_at fields ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Fast lookup of a user's most recent calculations ──
calculationSchema.index({ user_id: 1, created_at: -1 });

// ── Prevents storing the same client submission twice ──
calculationSchema.index({ user_id: 1, client_id: 1 }, { unique: true });

/* —————————————————————————————————————
 * Serialization
 * ————————————————————————————————————— */

// ── Convert _id → id and remove internal fields for API responses ──
calculationSchema.methods.toJSON = function() {
  const value = this.toObject();
  value.id = value._id;
  delete value._id;
  delete value.__v;
  return value;
};

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('Calculation', calculationSchema);