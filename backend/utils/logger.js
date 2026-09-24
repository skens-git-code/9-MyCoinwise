/* —————————————————————————————————————
 * Logger Utility
 * Exposes two Winston loggers:
 *   - logger      : general application logging (console output).
 *   - auditLogger : security/audit events written to audit.log.
 *
 * Key behaviors:
 *   - Log level is `info` in production, `debug` otherwise.
 *   - The general logger emits JSON in non-console transports and
 *     colorized simple text to the console.
 *   - The audit logger always writes JSON to a file transport.
 *   - Error stacks are captured via `errors({ stack: true })`.
 * ————————————————————————————————————— */

// ── Load winston ──
const winston = require('winston');

/* —————————————————————————————————————
 * Application Logger
 * Console-only logger used across routes, middleware, and services.
 * ————————————————————————————————————— */
const logger = winston.createLogger({
  // ── Level: info in production, debug elsewhere ──
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

  // ── Format: JSON with timestamp and error stacks ──
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),

  // ── Transports: console only ──
  transports: [
    new winston.transports.Console({
      // ── Console output uses colorized simple text for readability ──
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/* —————————————————————————————————————
 * Audit Logger
 * Separate logger for security-relevant events. Writes JSON lines
 * to audit.log for later review or forwarding.
 * ————————————————————————————————————— */
const auditLogger = winston.createLogger({
  // ── Audit events are always logged at info level ──
  level: 'info',

  // ── Format: JSON with timestamp ──
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),

  // ── Transports: file only ──
  transports: [
    new winston.transports.File({ filename: 'audit.log' })
  ]
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export both loggers ──
module.exports = { logger, auditLogger };