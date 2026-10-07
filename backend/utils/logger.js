/**
 * Logger utility — shared Winston logger instances.
 *
 * Exports:
 *  - `logger`      : general application logging to the console.
 *  - `auditLogger` : security/audit events appended to `backend/audit.log`.
 *
 * Behaviour:
 *  - `logger` level is `info` in production, `debug` otherwise. Note that the
 *    level is resolved at module load time, so `.env` must be loaded first.
 *  - `logger` emits colorized simple text to the console.
 *  - `auditLogger` always writes JSON lines to `backend/audit.log`.
 *  - Error stacks are captured via `errors({ stack: true })`.
 */

const path = require('path');
const winston = require('winston');
// Importing the validated config guarantees .env is loaded before the level is
// resolved below. Note the level is read at module load time.
const { isProduction } = require('../config/env');

/**
 * General-purpose application logger.
 *
 * @type {import('winston').Logger}
 */
const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * Audit logger for security-relevant events.
 *
 * Side effect: appends to `backend/audit.log`. The path is resolved against this
 * module rather than the process CWD so the log always lands in the backend
 * directory, whichever directory the process was started from.
 *
 * @type {import('winston').Logger}
 */
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '..', 'audit.log') }),
  ],
});

module.exports = { logger, auditLogger };
