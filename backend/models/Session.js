const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token_id: { type: String, required: true, unique: true, index: true, select: false },
  device: { type: String, default: 'Unknown device', maxlength: 160 },
  ip: { type: String, default: '', maxlength: 100 },
  user_agent: { type: String, default: '', maxlength: 500 },
  last_active: { type: Date, default: Date.now, index: true },
  created_at: { type: Date, default: Date.now },
  is_active: { type: Boolean, default: true, index: true },
}, {
  versionKey: false,
});

sessionSchema.index({ user_id: 1, is_active: 1, last_active: -1 });

module.exports = mongoose.model('Session', sessionSchema);
