/* —————————————————————————————————————
 * Request Sanitization Middleware
 *
 * Strips MongoDB operator keys (`$`-prefixed) and dotted keys from incoming
 * request data to block NoSQL-injection payloads such as `?$where=...` or
 * `{ "email": { "$ne": null } }`.
 *
 * WHY THIS IS A MODULE RATHER THAN INLINE IN server.js
 * ---------------------------------------------------
 * Express 5 exposes `req.query` as a lazy getter that re-parses the query string
 * on every access. `express-mongo-sanitize` removes keys by mutating the object
 * it is handed *in place* (`_sanitize()` does `delete obj[key]`) and does not
 * return a replacement, so mutating `req.query` directly is silently discarded
 * and handlers read the original, unsanitized query. This was a real bypass:
 * `?$where=<js>` reached route handlers verbatim.
 *
 * The fix is to snapshot the query, sanitize the copy, and redefine the property
 * on the request. Keeping that logic in its own module lets
 * `test/request-sanitize.test.js` exercise the exact shipped code without
 * starting a server.
 * ————————————————————————————————————— */

const mongoSanitize = require('express-mongo-sanitize');

/**
 * Error carrying an explicit HTTP status so middleware can fail with a specific
 * code instead of surfacing as a blanket 500.
 */
class HttpError extends Error {
  /**
   * @param {number} status HTTP status code to return.
   * @param {string} message Client-safe message.
   */
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Deep-clone a value with a JSON fallback for older runtimes.
 *
 * @param {unknown} value Value to clone.
 * @returns {unknown} Independent copy.
 */
function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/**
 * Sanitize a parsed query object and return the cleaned copy.
 *
 * Exported separately so it can be unit-tested without an Express request.
 *
 * @param {object} query Parsed query object (may be a getter result).
 * @returns {object} Sanitized copy; operator keys removed.
 */
function sanitizeQuery(query) {
  const copy = clone(query);
  mongoSanitize.sanitize(copy);
  return copy;
}

/**
 * Express middleware: sanitize `req.body`, `req.params` and `req.query`.
 *
 * Side effects: replaces `req.query` with an own, writable data property holding
 * the sanitized copy, because the Express 5 getter cannot be mutated in place.
 *
 * @param {import('express').Request} req Incoming request.
 * @param {import('express').Response} res Outgoing response.
 * @param {import('express').NextFunction} next Continuation.
 * @returns {void}
 */
function sanitizeRequest(req, res, next) {
  try {
    // `req.body` and `req.params` are ordinary properties and mutate in place.
    if (req.body && typeof req.body === 'object') mongoSanitize.sanitize(req.body);
    if (req.params && typeof req.params === 'object') mongoSanitize.sanitize(req.params);

    const rawQuery = req.query;
    if (rawQuery && typeof rawQuery === 'object') {
      Object.defineProperty(req, 'query', {
        value: sanitizeQuery(rawQuery),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    next();
  } catch {
    next(new HttpError(400, 'Malformed request parameters'));
  }
}

module.exports = { sanitizeRequest, sanitizeQuery, HttpError };
