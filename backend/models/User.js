/* —————————————————————————————————————
 * User Model
 * Stores identity, financial profile, security state, and
 * preferences for each account.
 *
 * Key behaviors:
 *   - Passwords are hashed with bcrypt (cost 12) in pre-save.
 *   - Brute-force lock: MAX_FAILED_LOGINS attempts trigger a
 *     LOCK_DURATION_MINUTES lockout via `locked_until`.
 *   - `session_version` is bumped to invalidate all issued JWTs.
 *   - Sensitive fields use `select: false` and must be explicitly
 *     requested (e.g. `.select('+password')`).
 *   - Reset tokens are stored as SHA-256 hashes, not raw values.
 *   - `MAX_FAILED_LOGINS` and `LOCK_DURATION_MINUTES` are also
 *     exported on the model for reuse by routes.
 *
 * Indexes:
 *   - email (unique)              : login lookup.
 *   - household_id                : household member queries.
 *   - reset_password_token (sparse): password reset lookup.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

// ── Brute-force lock constants ──
const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MINUTES = 30;

// ── Define schema ──
const userSchema = new mongoose.Schema({
  /* —————————————————————————————————————
   * Core Identity
   * ————————————————————————————————————— */

  // ── Display name (first name / handle) ──
  username: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },

  // ── Last name ──
  last_name: {
    type: String,
    default: '',
    trim: true,
    maxlength: 80
  },

  // ── Profession shown on the profile ──
  profession: {
    type: String,
    default: 'Trader',
    trim: true,
    maxlength: 80
  },

  // ── Household root user (self-reference) ──
  household_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },

  // ── Login email (unique, lowercase) ──
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  // ── Hashed password (hidden by default) ──
  password: {
    type: String,
    required: true,
    select: false
  },

  // ── Contact phone number ──
  phone: {
    type: String,
    default: null,
    trim: true
  },

  // ── Date of birth ──
  date_of_birth: {
    type: Date,
    default: null
  },

  /* —————————————————————————————————————
   * Financial Profile
   * ————————————————————————————————————— */

  // ── Cached account balance ──
  balance: {
    type: Number,
    default: 0.00
  },

  // ── Monthly savings goal ──
  monthly_goal: {
    type: Number,
    default: 0.00
  },

  // ── Preferred currency ──
  currency: {
    type: String,
    default: 'INR',
    maxlength: 10
  },

  /* —————————————————————————————————————
   * Appearance
   * ————————————————————————————————————— */

  // ── UI theme preference ──
  theme: {
    type: String,
    enum: ['light', 'amoled'],
    default: 'light'
  },

  // ── Emoji avatar ──
  profile_avatar: {
    type: String,
    default: '😊'
  },

  // ── Profile accent color ──
  profile_color: {
    type: String,
    default: '#0ea5e9',
    maxlength: 20
  },

  /* —————————————————————————————————————
   * Account Status
   * ————————————————————————————————————— */

  // ── Master account enabled flag ──
  is_active: {
    type: Boolean,
    default: true
  },

  // ── Whether the email has been verified ──
  email_verified: {
    type: Boolean,
    default: false
  },

  // ── Email verification token (hidden) ──
  email_verify_token: {
    type: String,
    default: null,
    select: false
  },

  // ── Email verification expiry (hidden) ──
  email_verify_expires: {
    type: Date,
    default: null,
    select: false
  },

  /* —————————————————————————————————————
   * Security — Brute-force Protection
   * ————————————————————————————————————— */

  // ── Consecutive failed login counter ──
  failed_login_count: {
    type: Number,
    default: 0
  },

  // ── Whether the account is currently locked ──
  account_locked: {
    type: Boolean,
    default: false
  },

  // ── Timestamp after which the lock expires ──
  locked_until: {
    type: Date,
    default: null
  },

  /* —————————————————————————————————————
   * Security — Session Tracking
   * ————————————————————————————————————— */

  // ── Timestamp of the last successful login ──
  last_login: {
    type: Date,
    default: null
  },

  // ── IP of the last successful login ──
  last_login_ip: {
    type: String,
    default: null
  },

  // ── Incremented to invalidate all issued JWTs ──
  session_version: {
    type: Number,
    default: 0
  },

  /* —————————————————————————————————————
   * Security — Password Reset
   * ————————————————————————————————————— */

  // ── When the password was last changed ──
  password_changed_at: {
    type: Date,
    default: null
  },

  // ── Hashed reset token (hidden) ──
  reset_password_token: {
    type: String,
    default: null,
    select: false
  },

  // ── Reset token expiry (hidden) ──
  reset_password_expires: {
    type: Date,
    default: null,
    select: false
  },

  /* —————————————————————————————————————
   * Preferences
   * ————————————————————————————————————— */

  // ── User-defined account type labels ──
  custom_account_types: {
    type: [String],
    default: []
  },

  // ── Notification preferences ──
  notification_prefs: {
    type: Object,
    default: {
      emailReports:     true,
      budgetAlerts:     true,
      goalMilestones:   true,
      unusualSpending:  false,
      pushNotifications: true,
      weeklyDigest:     true,
      taxAlerts:        false,
      quietHoursEnabled: false,
      quietHoursStart:  '22:00',
      quietHoursEnd:    '08:00'
    }
  },

  /* —————————————————————————————————————
   * Two-Factor Auth (future-ready)
   * ————————————————————————————————————— */

  // ── 2FA enabled flag ──
  two_factor_enabled: {
    type: Boolean,
    default: false
  },

  // ── TOTP shared secret (hidden) ──
  two_factor_secret: {
    type: String,
    default: null,
    select: false
  },

  /* —————————————————————————————————————
   * Advanced Preferences
   * ————————————————————————————————————— */

  // ── Display and formatting preferences ──
  advanced_prefs: {
    type: Object,
    default: {
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      firstDayOfWeek: 'Sunday',
      decimalSeparator: '.',
      compactMode: false,
      autoSave: true,
      animationsEnabled: true,
      showWeekNumbers: false
    }
  }

}, {
  // ── Auto-managed created_at / updated_at fields ──
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Password reset token lookup (only when token is present) ──
userSchema.index({ reset_password_token: 1 }, { sparse: true });

/* —————————————————————————————————————
 * Middleware
 * ————————————————————————————————————— */

// ── Pre-save: hash password when it changes ──
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.password_changed_at = new Date();
    next();
  } catch (err) {
    next(err);
  }
});

/* —————————————————————————————————————
 * Instance Methods
 * ————————————————————————————————————— */

// ── Compare a candidate password with the stored hash ──
userSchema.methods.comparePassword = async function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Return true if the account is currently locked ──
userSchema.methods.isLocked = function() {
  if (!this.account_locked) return false;
  if (this.locked_until && this.locked_until < new Date()) {
    // Lock expired — will be cleared on next save
    return false;
  }
  return true;
};

// ── Increment failed logins and lock if the threshold is reached ──
userSchema.methods.incrementFailedLogin = async function() {
  this.failed_login_count += 1;
  if (this.failed_login_count >= MAX_FAILED_LOGINS) {
    this.account_locked = true;
    this.locked_until = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
  }
  return this.save({ validateBeforeSave: false });
};

// ── Clear lock state and record a successful login ──
userSchema.methods.resetLoginAttempts = async function(ip) {
  this.failed_login_count = 0;
  this.account_locked     = false;
  this.locked_until       = null;
  this.last_login         = new Date();
  this.last_login_ip      = ip || null;
  return this.save({ validateBeforeSave: false });
};

// ── Generate a password reset token; store only its SHA-256 hash ──
userSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.reset_password_token   = crypto.createHash('sha256').update(token).digest('hex');
  this.reset_password_expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return token; // Return raw token to send in email
};

/* —————————————————————————————————————
 * Virtuals
 * ————————————————————————————————————— */

// ── Expose string _id as `id` ──
userSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('User', userSchema);

// ── Re-export security constants for route handlers ──
module.exports.MAX_FAILED_LOGINS = MAX_FAILED_LOGINS;
module.exports.LOCK_DURATION_MINUTES = LOCK_DURATION_MINUTES;