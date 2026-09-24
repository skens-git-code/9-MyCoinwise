/* —————————————————————————————————————
 * LoginLog Model
 * Stores authentication audit entries (successes, failures,
 * suspicious activity) with device, geo, and request metadata.
 *
 * Key behaviors:
 *   - TTL index auto-deletes entries after 90 days.
 *   - Risk score is auto-adjusted in pre-save.
 *   - Post-save emits `suspicious_login` / `multiple_failed_logins`
 *     events for security monitoring.
 *   - `timestamps: false` — created_at is defined manually.
 *
 * Indexes:
 *   - TTL on created_at (90 days).
 *   - Compound indexes for per-user, per-email, per-IP, and
 *     security-analytics queries.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const mongoose = require('mongoose');
const net = require('net');

// ── Define schema ──
const loginLogSchema = new mongoose.Schema({
  /* —————————————————————————————————————
   * Core Fields
   * ————————————————————————————————————— */

  // ── Owning user reference (null for pre-auth failures) ──
  // Note: an earlier design used an async validator here that called
  // User.exists() on every write. That was removed — it added an extra
  // DB roundtrip to auth endpoints and could fail during user transitions.
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true,
  },

  // ── Email associated with the attempt ──
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    maxlength: [255, 'Email too long'],
    index: true
  },

  // ── Outcome of the attempt ──
  status: { 
    type: String, 
    enum: {
      values: ['success', 'failed'],
      message: 'Status must be success or failed'
    },
    required: [true, 'Status is required'],
    index: true
  },

  // ── Reason code describing what happened ──
  reason: { 
    type: String, 
    enum: {
      values: [
        'login', 
        'registered', 
        'invalid_password', 
        'user_not_found', 
        'account_locked', 
        'token_refresh',
        'email_not_verified',
        'too_many_attempts',
        'suspicious_activity',
        'session_expired',
        'invalid_token'
      ],
      message: 'Invalid reason code'
    },
    default: null,
    index: true
  },

  /* —————————————————————————————————————
   * Security Intelligence
   * ————————————————————————————————————— */

  // ── Client IP (IPv4 or IPv6) ──
  ip: { 
    type: String, 
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true;
        const cleaned = String(v).replace(/^::ffff:/i, '').split(',')[0].trim();
        return net.isIP(v) !== 0 || net.isIP(cleaned) !== 0;
      },
      message: 'Invalid IP address format'
    }
  },

  // ── Flag set by risk rules ──
  is_suspicious: { 
    type: Boolean, 
    default: false,
    index: true
  },

  // ── Failed attempts count prior to this entry ──
  failed_attempts_before: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 100
  },

  // ── Computed risk score (0-100) ──
  risk_score: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 100
  },

  // ── Whether 2FA is required for this attempt ──
  requires_2fa: { 
    type: Boolean, 
    default: false 
  },

  // ── Whether 2FA was successfully verified ──
  mfa_verified: { 
    type: Boolean, 
    default: null 
  },

  /* —————————————————————————————————————
   * Device & Location
   * ————————————————————————————————————— */

  // ── Raw User-Agent header ──
  user_agent: { 
    type: String, 
    default: null,
    maxlength: [500, 'User agent too long']
  },

  // ── Parsed device type ──
  device_type: { 
    type: String, 
    enum: {
      values: ['mobile', 'tablet', 'desktop', 'unknown', 'bot'],
      message: 'Invalid device type'
    },
    default: 'unknown',
    index: true
  },

  // ── Parsed browser name ──
  browser: { 
    type: String, 
    default: null,
    maxlength: 50
  },

  // ── Parsed browser version ──
  browser_version: { 
    type: String, 
    default: null 
  },

  // ── Parsed operating system ──
  os: { 
    type: String, 
    default: null,
    maxlength: 50
  },

  // ── Parsed OS version ──
  os_version: { 
    type: String, 
    default: null 
  },

  // ── ISO 3166-1 alpha-2 country code ──
  country: { 
    type: String, 
    default: null,
    uppercase: true,
    maxlength: 2
  },

  // ── ISO 3166-1 alpha-3 country code ──
  country_code_3: { 
    type: String, 
    default: null,
    maxlength: 3
  },

  // ── Region / state name ──
  region: { 
    type: String, 
    default: null 
  },

  // ── City name ──
  city: { 
    type: String, 
    default: null 
  },

  // ── Postal code ──
  postal_code: { 
    type: String, 
    default: null 
  },

  // ── Latitude (-90 to 90) ──
  latitude: { 
    type: Number, 
    default: null,
    min: -90,
    max: 90
  },

  // ── Longitude (-180 to 180) ──
  longitude: { 
    type: Number, 
    default: null,
    min: -180,
    max: 180
  },

  // ── IANA timezone name ──
  timezone: { 
    type: String, 
    default: null 
  },

  // ── Internet service provider ──
  isp: { 
    type: String, 
    default: null 
  },

  // ── Organization owning the IP ──
  organization: { 
    type: String, 
    default: null 
  },

  /* —————————————————————————————————————
   * Session & Authentication
   * ————————————————————————————————————— */

  // ── Session identifier ──
  session_id: { 
    type: String, 
    default: null,
    maxlength: 255
  },

  // ── JWT jti / token identifier ──
  token_id: { 
    type: String, 
    default: null
  },

  // ── Authentication method used ──
  auth_method: { 
    type: String, 
    enum: ['password', 'oauth', '2fa', 'magic_link', 'social', 'api_key'],
    default: 'password'
  },

  // ── Duration of the login flow, in seconds ──
  login_duration_seconds: { 
    type: Number, 
    default: null,
    min: 0
  },

  /* —————————————————————————————————————
   * Request & Response Metadata
   * ————————————————————————————————————— */

  // ── Correlation ID for the request ──
  request_id: { 
    type: String, 
    default: null,
    index: true
  },

  // ── Server response time in milliseconds ──
  response_time_ms: { 
    type: Number, 
    default: null,
    min: 0
  },

  // ── HTTP method of the request ──
  http_method: { 
    type: String, 
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    default: 'POST'
  },

  // ── Endpoint path ──
  endpoint: { 
    type: String, 
    default: null,
    maxlength: 255
  },

  /* —————————————————————————————————————
   * Additional Context
   * ————————————————————————————————————— */

  // ── Referer header ──
  referer: { 
    type: String, 
    default: null,
    maxlength: 500
  },

  // ── Origin of the attempt ──
  source: { 
    type: String, 
    enum: ['web', 'mobile_app', 'api', 'admin', 'cron', 'webhook'],
    default: 'web',
    index: true
  },

  // ── Free-form notes (appended to by markAsSuspicious) ──
  notes: { 
    type: String, 
    default: null,
    maxlength: 500
  },

  // ── IP that created the audit entry ──
  created_by_ip: { 
    type: String, 
    default: null 
  },

  // ── Timestamp set in pre-save when the entry is finalized ──
  processed_at: { 
    type: Date, 
    default: null 
  },

  // ── Entry creation timestamp (used by TTL index) ──
  created_at: { 
    type: Date, 
    default: Date.now
  }
}, {
  // ── Schema options ──
  timestamps: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── TTL: auto-delete entries older than 90 days ──
loginLogSchema.index({ created_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

// ── Common query paths ──
loginLogSchema.index({ user_id: 1, created_at: -1 });
loginLogSchema.index({ email: 1, created_at: -1 });
loginLogSchema.index({ ip: 1, created_at: -1 });
loginLogSchema.index({ status: 1, created_at: -1 });
loginLogSchema.index({ is_suspicious: 1, created_at: -1 });

// ── Security analytics ──
loginLogSchema.index({ user_id: 1, status: 1, created_at: -1 });
loginLogSchema.index({ ip: 1, status: 1, created_at: -1 });
loginLogSchema.index({ country: 1, status: 1 });
loginLogSchema.index({ device_type: 1, browser: 1 });

// ── Session tracking ──
loginLogSchema.index({ session_id: 1 });
loginLogSchema.index({ token_id: 1 });

// ── Rate limiting & monitoring ──
loginLogSchema.index({ email: 1, status: 1, created_at: -1 });
loginLogSchema.index({ ip: 1, status: 'failed', created_at: -1 });
loginLogSchema.index({ created_at: -1, is_suspicious: 1 });

/* —————————————————————————————————————
 * Middleware
 * ————————————————————————————————————— */

// ── Pre-save: compute risk score and normalize fields ──
loginLogSchema.pre('save', function(next) {
  // ── Boost risk for flagged suspicious entries ──
  if (this.is_suspicious) {
    this.risk_score = Math.min(100, (this.risk_score || 0) + 50);
  }

  // ── Boost risk when prior failures exceed threshold ──
  if (this.status === 'failed' && this.failed_attempts_before > 5) {
    this.risk_score = Math.min(100, (this.risk_score || 0) + 30);
  }

  // ── Mark processed timestamp ──
  this.processed_at = new Date();

  // ── Normalize email ──
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
  }

  // ── Truncate oversized user agent ──
  if (this.user_agent && this.user_agent.length > 500) {
    this.user_agent = this.user_agent.substring(0, 500);
  }

  next();
});

// ── Post-save: emit real-time security events ──
loginLogSchema.post('save', async function(doc) {
  // ── Emit event for suspicious successful logins ──
  if (doc.is_suspicious && doc.status === 'success') {
    if (mongoose.connection.emit) {
      mongoose.connection.emit('suspicious_login', {
        user_id: doc.user_id,
        email: doc.email,
        ip: doc.ip,
        country: doc.country,
        created_at: doc.created_at
      });
    }
  }

  // ── Emit event when failed attempts hit the threshold ──
  if (doc.status === 'failed' && doc.failed_attempts_before >= 5) {
    if (mongoose.connection.emit) {
      mongoose.connection.emit('multiple_failed_logins', {
        email: doc.email,
        ip: doc.ip,
        attempts: doc.failed_attempts_before
      });
    }
  }
});

/* —————————————————————————————————————
 * Virtuals
 * ————————————————————————————————————— */

// ── True when the entry is less than 5 minutes old ──
loginLogSchema.virtual('is_recent').get(function() {
  const minutesAgo = (new Date() - this.created_at) / (1000 * 60);
  return minutesAgo <= 5;
});

// ── Human-readable time since creation ──
loginLogSchema.virtual('time_ago').get(function() {
  const diff = new Date() - this.created_at;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
});

// ── Risk bucket derived from risk_score ──
loginLogSchema.virtual('risk_level').get(function() {
  if (this.risk_score >= 70) return 'high';
  if (this.risk_score >= 40) return 'medium';
  if (this.risk_score >= 10) return 'low';
  return 'none';
});

/* —————————————————————————————————————
 * Instance Methods
 * ————————————————————————————————————— */

// ── Flag the entry as suspicious and append a reason note ──
loginLogSchema.methods.markAsSuspicious = async function(reason) {
  this.is_suspicious = true;
  this.risk_score = Math.min(100, (this.risk_score || 0) + 40);
  if (reason && this.notes) {
    this.notes = `${this.notes}; Suspicious: ${reason}`;
  } else if (reason) {
    this.notes = `Suspicious: ${reason}`;
  }
  return await this.save();
};

// ── Apply geo-location enrichment data ──
loginLogSchema.methods.enrichWithGeoData = async function(geoData) {
  if (geoData) {
    this.country = geoData.country_code || this.country;
    this.country_code_3 = geoData.country_code3;
    this.region = geoData.region;
    this.city = geoData.city;
    this.postal_code = geoData.postal;
    this.latitude = geoData.latitude;
    this.longitude = geoData.longitude;
    this.timezone = geoData.timezone;
    this.isp = geoData.isp;
    this.organization = geoData.org;
  }
  return await this.save();
};

/* —————————————————————————————————————
 * Static Methods
 * ————————————————————————————————————— */

// ── Parse a User-Agent string into device, browser, and OS fields ──
loginLogSchema.statics.parseUserAgent = function(ua) {
  if (!ua) return { device_type: 'unknown', browser: null, browser_version: null, os: null, os_version: null };

  // ── Device type detection ──
  const isMobile  = /Mobile|Android|iPhone|iPod|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  const isTablet  = /iPad|Tablet|Kindle|Silk/i.test(ua);
  const isBot      = /bot|crawler|spider|scraper/i.test(ua);

  let device_type = 'unknown';
  if (isBot) device_type = 'bot';
  else if (isTablet) device_type = 'tablet';
  else if (isMobile) device_type = 'mobile';
  else device_type = 'desktop';

  // ── Browser detection with version ──
  let browser = 'Other';
  let browser_version = null;
  let versionMatch;

  if ((versionMatch = ua.match(/Edg\/(\d+\.\d+)/i))) {
    browser = 'Edge';
    browser_version = versionMatch[1];
  } else if ((versionMatch = ua.match(/Chrome\/(\d+\.\d+)/i)) && !ua.includes('Edg')) {
    browser = 'Chrome';
    browser_version = versionMatch[1];
  } else if ((versionMatch = ua.match(/Firefox\/(\d+\.\d+)/i))) {
    browser = 'Firefox';
    browser_version = versionMatch[1];
  } else if ((versionMatch = ua.match(/Version\/(\d+\.\d+).*Safari/i))) {
    browser = 'Safari';
    browser_version = versionMatch[1];
  } else if ((versionMatch = ua.match(/MSIE (\d+\.\d+)/i)) || (versionMatch = ua.match(/Trident.*rv:(\d+\.\d+)/i))) {
    browser = 'Internet Explorer';
    browser_version = versionMatch[1];
  }

  // ── OS detection with version ──
  let os = 'Unknown';
  let os_version = null;

  if ((versionMatch = ua.match(/Windows NT (\d+\.\d+)/i))) {
    os = 'Windows';
    const winVersions = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    os_version = winVersions[versionMatch[1]] || versionMatch[1];
  } else if ((versionMatch = ua.match(/Mac OS X (\d+[._]\d+)/i))) {
    os = 'macOS';
    os_version = versionMatch[1].replace('_', '.');
  } else if ((versionMatch = ua.match(/Android (\d+\.\d+)/i))) {
    os = 'Android';
    os_version = versionMatch[1];
  } else if ((versionMatch = ua.match(/iPhone OS (\d+[._]\d+)/i))) {
    os = 'iOS';
    os_version = versionMatch[1].replace('_', '.');
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }

  return { device_type, browser, browser_version, os, os_version };
};

// ── Count failed attempts for an email or IP within a time window ──
loginLogSchema.statics.getFailedAttempts = async function(identifier, minutes = 15) {
  const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);

  const emailAttempts = await this.countDocuments({
    email: identifier,
    status: 'failed',
    created_at: { $gte: cutoffTime }
  });

  const ipAttempts = await this.countDocuments({
    ip: identifier,
    status: 'failed',
    created_at: { $gte: cutoffTime }
  });

  return { emailAttempts, ipAttempts, total: Math.max(emailAttempts, ipAttempts) };
};

// ── Fetch paginated login history for a user ──
loginLogSchema.statics.getUserLoginHistory = async function(userId, limit = 50, skip = 0) {
  return await this.find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// ── Fetch recent suspicious logins for monitoring ──
loginLogSchema.statics.getSuspiciousLogins = async function(hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  return await this.find({
    is_suspicious: true,
    created_at: { $gte: cutoffTime }
  })
  .sort({ created_at: -1 })
  .populate('user_id', 'email name')
  .lean();
};

// ── Aggregate login statistics for the dashboard ──
loginLogSchema.statics.getLoginStats = async function(hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  const stats = await this.aggregate([
    { $match: { created_at: { $gte: cutoffTime } } },
    { $group: {
      _id: null,
      total_logins: { $sum: 1 },
      successful_logins: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
      failed_logins: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
      suspicious_logins: { $sum: { $cond: ['$is_suspicious', 1, 0] } },
      unique_ips: { $addToSet: '$ip' },
      unique_users: { $addToSet: '$user_id' },
      unique_emails: { $addToSet: '$email' }
    }},
    { $project: {
      total_logins: 1,
      successful_logins: 1,
      failed_logins: 1,
      suspicious_logins: 1,
      success_rate: { 
        $multiply: [
          { $divide: ['$successful_logins', { $max: ['$total_logins', 1] }] },
          100
        ]
      },
      unique_ips_count: { $size: '$unique_ips' },
      unique_users_count: { $size: '$unique_users' },
      unique_emails_count: { $size: '$unique_emails' }
    }}
  ]);

  return stats[0] || {
    total_logins: 0,
    successful_logins: 0,
    failed_logins: 0,
    suspicious_logins: 0,
    success_rate: 0,
    unique_ips_count: 0,
    unique_users_count: 0,
    unique_emails_count: 0
  };
};

// ── Manually delete logs older than the retention window ──
loginLogSchema.statics.cleanupOldLogs = async function(daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await this.deleteMany({
    created_at: { $lt: cutoffDate }
  });

  return result.deletedCount;
};

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('LoginLog', loginLogSchema);