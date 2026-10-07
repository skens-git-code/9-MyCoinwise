/**
 * Validated environment configuration.
 *
 * This is the single source of truth for backend configuration. It MUST be the
 * first module required by any entry point: `.env` is loaded here, then every
 * variable is parsed and validated by envalid, and only the returned (coerced,
 * defaulted) values are exported.
 *
 * Historically `cleanEnv()` was called and its return value discarded, so the
 * validated values never actually drove anything — `process.env` was read
 * directly instead, and any variable missing from the schema was silently
 * unvalidated. Requiring this module fixes that.
 *
 * Requiring it is idempotent: the file is loaded and validated once by
 * `require`'s cache.
 */

const path = require('path');
const dotenv = require('dotenv');
const { cleanEnv, str, port, bool, num } = require('envalid');

// Absolute path (one level up from config/) so the backend starts correctly
// whether it is launched as `node server.js` (inside backend/), as
// `node backend/server.js` (from the repo root), or by a container supervisor.
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * @typedef {object} AppConfig
 * @property {string}  NODE_ENV
 * @property {number}  PORT
 * @property {string}  MONGO_URI
 * @property {string}  JWT_SECRET
 * @property {string}  GEMINI_API_KEY
 * @property {string}  GEMINI_MODEL
 * @property {string}  SENTRY_DSN
 * @property {string}  SMTP_HOST
 * @property {number}  SMTP_PORT
 * @property {boolean} SMTP_SECURE
 * @property {string}  SMTP_USER
 * @property {string}  SMTP_PASS
 * @property {string}  EMAIL_FROM
 * @property {number}  RESET_TOKEN_EXPIRY_MINUTES
 * @property {string}  FINNHUB_API_KEY
 * @property {string}  FRONTEND_URL
 * @property {string}  CLIENT_URL
 * @property {boolean} FEATURE_TAX_MODULE
 * @property {string}  TAX_FIELD_ENCRYPTION_KEY
 * @property {string}  TAX_ADMIN_TOKEN
 * @property {number}  MAX_EXPORT_ROWS
 * @property {number}  MAX_BACKUP_DOCS
 * @property {boolean} ENABLE_DIAGNOSTIC_ECHO
 * @property {number|boolean} TRUST_PROXY
 */

/** @type {AppConfig} */
const config = cleanEnv(process.env, {
  // ── Core ──────────────────────────────────────────────────────────────────
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
    desc: 'Runtime environment.',
  }),
  PORT: port({ default: 5001, desc: 'HTTP port the server listens on.' }),
  MONGO_URI: str({ desc: 'MongoDB connection string URI (required).' }),
  JWT_SECRET: str({ desc: 'Secret used to sign JSON Web Tokens (required).' }),

  // ── AI (Google Gemini) ────────────────────────────────────────────────────
  GEMINI_API_KEY: str({ default: '', desc: 'Gemini API key; blank disables AI features.' }),
  GEMINI_MODEL: str({ default: 'gemini-2.5-flash', desc: 'Gemini model id.' }),

  // ── Observability ─────────────────────────────────────────────────────────
  SENTRY_DSN: str({ default: '', desc: 'Sentry DSN; blank disables error reporting.' }),

  // ── Email (nodemailer) ────────────────────────────────────────────────────
  SMTP_HOST: str({ default: '', desc: 'SMTP host for outbound email.' }),
  SMTP_PORT: port({ default: 587, desc: 'SMTP port.' }),
  SMTP_SECURE: bool({ default: false, desc: 'Force TLS on the SMTP connection.' }),
  SMTP_USER: str({ default: '', desc: 'SMTP username.' }),
  SMTP_PASS: str({ default: '', desc: 'SMTP password.' }),
  EMAIL_FROM: str({ default: 'MyCoinwise <noreply@mycoinwise.app>', desc: 'Outbound sender.' }),

  // ── Auth token lifetime ───────────────────────────────────────────────────
  RESET_TOKEN_EXPIRY_MINUTES: num({ default: 60, desc: 'Password-reset token lifetime (minutes).' }),

  // ── Market data ───────────────────────────────────────────────────────────
  FINNHUB_API_KEY: str({ default: '', desc: 'Finnhub API key for market quotes.' }),

  // ── Frontend / CORS ───────────────────────────────────────────────────────
  FRONTEND_URL: str({ default: 'http://localhost:5173', desc: 'Primary frontend origin (added to the CORS allowlist).' }),
  CLIENT_URL: str({ default: '', desc: 'Additional allowed frontend origin.' }),

  // ── Tax Center ────────────────────────────────────────────────────────────
  // Defaults to off in production and on elsewhere, preserving the previous
  // `FEATURE_TAX_MODULE == null && NODE_ENV !== 'production'` behaviour.
  FEATURE_TAX_MODULE: bool({
    default: process.env.NODE_ENV === 'production' ? false : true,
    desc: 'Enable the Tax Center module.',
  }),
  TAX_FIELD_ENCRYPTION_KEY: str({ default: '', desc: '32-byte key encrypting tax document references at rest.' }),
  TAX_ADMIN_TOKEN: str({ default: '', desc: 'Token protecting the idempotent tax rule seed endpoint.' }),

  // ── Data operation bounds ─────────────────────────────────────────────────
  MAX_EXPORT_ROWS: num({ default: 50_000, desc: 'Maximum rows returned by an export.' }),
  MAX_BACKUP_DOCS: num({ default: 100_000, desc: 'Maximum documents per collection in a backup.' }),

  // ── Diagnostics ───────────────────────────────────────────────────────────
  ENABLE_DIAGNOSTIC_ECHO: bool({
    default: false,
    desc: 'Register the /api/__diagnostic echo route (test tooling only).',
  }),

  // ── Networking ────────────────────────────────────────────────────────────
  // `false` when running directly, `1` behind exactly one reverse proxy
  // (Render/Vercel/nginx). A permissive value lets clients spoof
  // X-Forwarded-For and therefore defeat IP-based rate limiting.
  TRUST_PROXY: str({
    default: 'false',
    desc: 'Express trust proxy value: "false", a hop count such as "1", or "loopback".',
  }),
});

/**
 * Parse `TRUST_PROXY` into a value Express accepts.
 *
 * @param {string} raw Configured value.
 * @returns {number|boolean|string} Hop count, boolean, or a named subnet.
 */
function parseTrustProxy(raw) {
  const value = String(raw).trim().toLowerCase();
  if (value === '' || value === 'false' || value === '0') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return raw;
}

module.exports = {
  config,
  trustProxy: parseTrustProxy(config.TRUST_PROXY),
  // Convenience flags used across the codebase.
  isProduction: config.NODE_ENV === 'production',
  isTest: config.NODE_ENV === 'test',
};
