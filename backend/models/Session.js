/* —————————————————————————————————————
 * Session Model
 * Tracks active login sessions per user so tokens can be
 * revoked, listed, and expired.
 *
 * Key behaviors:
 *   - `token_id` maps to the JWT `jti` claim and is unique
 *     across all sessions.
 *   - `token_id` is `select: false` — it must be explicitly
 *     requested in queries (`.select('+token_id')`).
 *   - `is_active: false` marks a session as revoked.
 *   - `versionKey` is disabled (no `__v` field).
 *
 * Indexes:
 *   - user_id + is_active + last_active (desc): session listing
 *     and cleanup of stale sessions.
 * ————————————————————————————————————— */

// ── Load mongoose ──
const mongoose = require('mongoose');

// ── Define schema ──
const sessionSchema = new mongoose.Schema({
  // ── Owning user reference ──
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ── JWT identifier (jti) — hidden from queries by default ──
  token_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    select: false
  },

  // ── Human-readable device label ──
  device: {
    type: String,
    default: 'Unknown device',
    maxlength: 160
  },

  // ── Client IP at session start ──
  ip: {
    type: String,
    default: '',
    maxlength: 100
  },

  // ── Raw User-Agent header at session start ──
  user_agent: {
    type: String,
    default: '',
    maxlength: 1000
  },

  // ── Last activity timestamp, used for staleness checks ──
  last_active: {
    type: Date,
    default: Date.now,
    index: true
  },

  // ── Session creation timestamp ──
  created_at: {
    type: Date,
    default: Date.now
  },

  // ── Active flag; false means the session is revoked ──
  is_active: {
    type: Boolean,
    default: true,
    index: true
  },
}, {
  // ── Schema options ──
  // No __v — sessions are append-only and not concurrently versioned
  versionKey: false,
});

/* —————————————————————————————————————
 * Indexes
 * ————————————————————————————————————— */

// ── Fast lookup of a user's active sessions, newest activity first ──
sessionSchema.index({ user_id: 1, is_active: 1, last_active: -1 });

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Register and export the model ──
module.exports = mongoose.model('Session', sessionSchema);