/* —————————————————————————————————————
 * NetWorthHistory Model
 * Stores periodic net worth snapshots per user so the UI can
 * chart financial progress over time.
 *
 * Snapshot fields:
 *   - total_assets      : sum of the user's assets at snapshot time
 *   - total_liabilities : sum of the user's liabilities at snapshot time
 *   - net_worth         : total_assets - total_liabilities
 *
 * Indexes:
 *   - user_id + snapshot_date (unique): one snapshot per user per date,
 *     preventing duplicate entries under concurrent writes.
 *
 * Uses default timestamps (createdAt / updatedAt).
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const netWorthHistorySchema = new mongoose.Schema({
  // ── Owning user reference ──
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },

  // ── Date the snapshot was taken (used for time-series queries) ──
  snapshot_date: { 
    type: Date, 
    required: true 
  },

  // ── Total value of the user's assets at snapshot time ──
  total_assets: { 
    type: Number, 
    required: true 
  },

  // ── Total value of the user's liabilities at snapshot time ──
  total_liabilities: { 
    type: Number, 
    required: true 
  },

  // ── Net worth = total_assets - total_liabilities ──
  net_worth: { 
    type: Number, 
    required: true 
  }
}, {
  // ── Auto-managed created_at / updated_at fields ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// ── Backward-compatible virtuals for legacy camelCase ──
netWorthHistorySchema.virtual('createdAt').get(function() { return this.created_at; });
netWorthHistorySchema.virtual('updatedAt').get(function() { return this.updated_at; });

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── One snapshot per user per date (prevents duplicates on concurrent writes) ──
netWorthHistorySchema.index({ user_id: 1, snapshot_date: 1 }, { unique: true });

// ── Standardize schema serialization and ObjectId validation ──
const { standardizeSchema } = require('../utils/schemaStandardizer');
standardizeSchema(netWorthHistorySchema);

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('NetWorthHistory', netWorthHistorySchema);