const mongoose = require('mongoose');

const wealthItemSchema = new mongoose.Schema({
  // user_id links this asset to the specific logged-in user
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  asset_class: { 
    type: String, 
    enum: ['liquid_asset', 'illiquid_asset', 'business_equity', 'retirement', 'liability'],
    required: true 
  },
  base_value: { 
    type: Number, 
    required: true 
  },
  // Optional fields for Pro features
  quantity: { type: Number, default: null }, // For stocks/crypto
  symbol: { type: String, default: null },   // e.g., 'AAPL'
  interest_rate: { type: Number, default: null }, // For debts
  acquisition_date: { type: Date, default: Date.now }, // For depreciation
  current_value_override: { type: Number, default: null, min: 0 },
  // Tax reporting fields. Nullable so existing assets remain unchanged.
  sold_at: { type: Date, default: null },
  sale_price: { type: Number, default: null, min: 0 },
  sale_fees: { type: Number, default: 0, min: 0 },
  note: { type: String, default: '', maxlength: 1000, trim: true }
}, { timestamps: true });

/* Optimization: Add index on user_id to avoid full collection scans (COLLSCAN) on /api/wealth/items */
wealthItemSchema.index({ user_id: 1 });

module.exports = mongoose.model('WealthItem', wealthItemSchema);
