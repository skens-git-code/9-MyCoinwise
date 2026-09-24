/* —————————————————————————————————————
 * Event Model
 * Stores user calendar events such as bills, income,
 * reminders, and general entries.
 *
 * Used for:
 *   - Rendering calendar views
 *   - Tracking bill / income amounts
 *   - Color-coding events in the UI
 *
 * Indexes:
 *   - user_id + date : fast calendar queries per user, sorted by date
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const eventSchema = new mongoose.Schema({
  // ── Owning user reference ──
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // ── Event title shown on the calendar ──
  title: {
    type: String,
    required: true,
    trim: true
  },

  // ── Date the event occurs on ──
  date: {
    type: Date,
    required: true
  },

  // ── Event category ──
  type: {
    type: String,
    enum: ['bill', 'income', 'reminder', 'general'],
    default: 'general'
  },

  // ── Optional monetary amount (used by bills and income) ──
  amount: {
    type: Number,
    default: null
  },

  // ── Optional longer description ──
  description: {
    type: String,
    trim: true
  },

  // ── UI color used to render the event ──
  color: {
    type: String,
    default: '#6366f1'
  },
}, {
  // ── Auto-managed created_at / updated_at fields ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

/* —————————————————————————————————————
 * Serialization
 * ————————————————————————————————————— */

// ── Convert _id → id and strip internal fields for API responses ──
eventSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  return obj;
};

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Fast calendar queries: filter by user, sorted by date ──
eventSchema.index({ user_id: 1, date: 1 });

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('Event', eventSchema);