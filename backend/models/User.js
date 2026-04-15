const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MINUTES = 30;

const userSchema = new mongoose.Schema({
  // ── Core Identity ──────────────────────────────────────────────────────────
  username:  { type: String, required: true, trim: true, maxlength: 80 },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true, select: false },
  phone:     { type: String, default: null, trim: true },
  date_of_birth: { type: Date, default: null },

  // ── Financial Profile ──────────────────────────────────────────────────────
  balance:      { type: Number, default: 0.00 },
  monthly_goal: { type: Number, default: 0.00 },
  currency:     { type: String, default: 'USD', maxlength: 10 },

  // ── Appearance ─────────────────────────────────────────────────────────────
  theme:          { type: String, enum: ['dark', 'light', 'amoled'], default: 'dark' },
  profile_avatar: { type: String, default: '😊', maxlength: 10 },
  profile_color:  { type: String, default: '#7c3aed', maxlength: 20 },

  // ── Account Status ─────────────────────────────────────────────────────────
  is_active:       { type: Boolean, default: true },
  email_verified:  { type: Boolean, default: false },
  email_verify_token:   { type: String, default: null, select: false },
  email_verify_expires: { type: Date,   default: null, select: false },

  // ── Security — Brute-force Protection ──────────────────────────────────────
  failed_login_count: { type: Number, default: 0 },
  account_locked:     { type: Boolean, default: false },
  locked_until:       { type: Date, default: null },

  // ── Security — Session Tracking ────────────────────────────────────────────
  last_login:    { type: Date, default: null },
  last_login_ip: { type: String, default: null },

  // ── Security — Password Reset ──────────────────────────────────────────────
  password_changed_at:    { type: Date, default: null },
  reset_password_token:   { type: String, default: null, select: false },
  reset_password_expires: { type: Date,   default: null, select: false },

  // ── Preferences ────────────────────────────────────────────────────────────
  notification_prefs: {
    type: Object,
    default: {
      emailReports:     true,
      budgetAlerts:     true,
      goalMilestones:   true,
      unusualSpending:  false,
      pushNotifications: true,
      weeklyDigest:     true,
      quietHoursEnabled: false,
      quietHoursStart:  '22:00',
      quietHoursEnd:    '08:00'
    }
  },

  // ── Two-Factor Auth (future-ready) ─────────────────────────────────────────
  two_factor_enabled: { type: Boolean, default: false },
  two_factor_secret:  { type: String, default: null, select: false }

}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ reset_password_token: 1 }, { sparse: true });

// ── Pre-save: Hash password ───────────────────────────────────────────────────
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.password_changed_at = new Date();
    next();
  } catch (err) {
    next(err);
  }
});

// ── Instance Methods ──────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isLocked = function() {
  if (!this.account_locked) return false;
  if (this.locked_until && this.locked_until < new Date()) {
    // Lock expired — will be cleared on next save
    return false;
  }
  return true;
};

userSchema.methods.incrementFailedLogin = async function() {
  this.failed_login_count += 1;
  if (this.failed_login_count >= MAX_FAILED_LOGINS) {
    this.account_locked = true;
    this.locked_until = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
  }
  return this.save({ validateBeforeSave: false });
};

userSchema.methods.resetLoginAttempts = async function(ip) {
  this.failed_login_count = 0;
  this.account_locked     = false;
  this.locked_until       = null;
  this.last_login         = new Date();
  this.last_login_ip      = ip || null;
  return this.save({ validateBeforeSave: false });
};

userSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.reset_password_token   = crypto.createHash('sha256').update(token).digest('hex');
  this.reset_password_expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return token; // Return raw token to send in email
};

// ── Virtual: id ───────────────────────────────────────────────────────────────
userSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

module.exports = mongoose.model('User', userSchema);
module.exports.MAX_FAILED_LOGINS    = MAX_FAILED_LOGINS;
module.exports.LOCK_DURATION_MINUTES = LOCK_DURATION_MINUTES;
