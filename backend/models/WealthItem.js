/* —————————————————————————————————————
 * WealthItem Model
 * Stores a single item in a user's net-worth tracker — assets
 * (liquid, illiquid, equity, retirement) and liabilities — with
 * optional Pro fields for market-linked and depreciating assets.
 *
 * Key behaviors:
 *   - `asset_class` determines whether the item is an asset or a
 *     liability in net worth calculations.
 *   - `current_value_override` lets the user pin a manual current
 *     value instead of using `base_value`.
 *   - Sale fields (`sold_at`, `sale_price`, `sale_fees`) are
 *     nullable so pre-existing items remain unaffected.
 *   - Uses default timestamps (`createdAt` / `updatedAt`).
 *
 * Indexes:
 *   - user_id : avoids collection scans on wealth item queries.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const wealthItemSchema = new mongoose.Schema({
  // ── Owning user reference ──
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },

  // ── Item display name ──
  name: { 
    type: String, 
    required: true,
    trim: true
  },

  // ── Asset/liability class (drives net worth grouping) ──
  asset_class: { 
    type: String, 
    enum: ['liquid_asset', 'illiquid_asset', 'business_equity', 'retirement', 'liability'],
    required: true 
  },

  // ── Base value used for net worth (or as fallback when no override) ──
  base_value: { 
    type: Number, 
    required: true 
  },

  /* —————————————————————————————————————
   * Optional Pro Fields
   * ————————————————————————————————————— */

  // ── Quantity held (stocks, crypto, etc.) ──
  quantity: { 
    type: Number, 
    default: null 
  },

  // ── Ticker symbol (e.g. 'AAPL') ──
  symbol: { 
    type: String, 
    default: null 
  },

  // ── Interest rate (for debts) ──
  interest_rate: { 
    type: Number, 
    default: null 
  },

  // ── Acquisition date (used for depreciation) ──
  acquisition_date: { 
    type: Date, 
    default: Date.now 
  },

  // ── Manual current value that overrides base_value when set ──
  current_value_override: { 
    type: Number, 
    default: null, 
    min: 0 
  },

  /* —————————————————————————————————————
   * Tax Reporting Fields
   * All nullable so existing items remain unaffected.
   * ————————————————————————————————————— */

  // ── Date the item was sold ──
  sold_at: { 
    type: Date, 
    default: null 
  },

  // ── Sale price ──
  sale_price: { 
    type: Number, 
    default: null, 
    min: 0 
  },

  // ── Fees paid on the sale ──
  sale_fees: { 
    type: Number, 
    default: 0, 
    min: 0 
  },

  // ── Free-form user note ──
  note: { 
    type: String, 
    default: '', 
    maxlength: 1000, 
    trim: true 
  }

}, {
  // ── Auto-managed createdAt / updatedAt fields ──
  timestamps: true 
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Fast per-user lookups (avoids COLLSCAN on /api/wealth/items) ──
wealthItemSchema.index({ user_id: 1 });

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('WealthItem', wealthItemSchema);