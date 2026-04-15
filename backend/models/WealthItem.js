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
    enum: ['liquid_asset', 'illiquid_asset', 'liability'], 
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
  acquisition_date: { type: Date, default: Date.now } // For depreciation
}, { timestamps: true });

module.exports = mongoose.model('WealthItem', wealthItemSchema);
