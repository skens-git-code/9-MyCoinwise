const mongoose = require('mongoose');

const netWorthHistorySchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  snapshot_date: { 
    type: Date, 
    required: true 
  },
  total_assets: { 
    type: Number, 
    required: true 
  },
  total_liabilities: { 
    type: Number, 
    required: true 
  },
  net_worth: { 
    type: Number, 
    required: true 
  }
}, { timestamps: true });

// Ensure one snapshot per user per month
netWorthHistorySchema.index({ user_id: 1, snapshot_date: 1 }, { unique: true });

module.exports = mongoose.model('NetWorthHistory', netWorthHistorySchema);
