// ─── Validated environment FIRST ────────────────────────────────────────────
// config/env.js loads dotenv (absolute path) and runs cleanEnv(); importing it
// here guarantees validated values before any other module reads process.env.
const { config, trustProxy, isProduction } = require('./config/env');

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const { randomUUID: uuidv4 } = require('crypto');
const { logger } = require('./utils/logger');
const { mongoose, connectToMongo } = require('./db');
const { runMigrations } = require('./migrations');
const Sentry = require('@sentry/node');

// ─── Middleware ─────────────────────────────────────────────────────────────
const auth = require('./middleware/auth');
const { sanitizeRequest, HttpError } = require('./middleware/sanitizeRequest');
const wealthRoutes = require('./routes/wealth');
const cashflowRoutes = require('./routes/cashflow');
const aiRoutes = require('./routes/ai');
const securityRoutes = require('./routes/security');
const taxRoutes = require('./routes/tax');

// ─── Sentry (only when a DSN is configured) ─────────────────────────────────
if (config.SENTRY_DSN) {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: 0.2,
    beforeSend(event) {
      /** Recursively redact credential-bearing keys before the event leaves the process. */
      const scrub = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const k of ['password', 'currentPassword', 'newPassword', 'token', 'authorization', 'cookie']) {
          if (obj[k]) obj[k] = '[REDACTED]';
        }
        for (const val of Object.values(obj)) {
          if (val && typeof val === 'object') scrub(val);
        }
      };
      scrub(event.request?.data);
      scrub(event.request?.headers);
      return event;
    },
  });
}

const app = express();

// ─── Trust proxy ────────────────────────────────────────────────────────────
// Defaults to false (no proxy). Set TRUST_PROXY=1 behind exactly one reverse
// proxy. A permissive setting would let clients forge X-Forwarded-For and
// bypass IP-based rate limiting.
app.set('trust proxy', trustProxy);

// ─── 1. Request ID ──────────────────────────────────────────────────────────
// Registered FIRST so that every response — including ones rejected later by
// CORS, the rate limiters, or auth — carries a correlation id.
app.use((req, res, next) => {
  // `x-request-id` is attacker-controlled: it may arrive as an array (duplicate
  // headers) and may be arbitrarily long or contain control characters.
  let incoming = req.headers['x-request-id'];
  if (Array.isArray(incoming)) incoming = incoming[0];
  if (typeof incoming === 'string') {
    incoming = incoming.trim().replace(/[^\w.:-]/g, '').slice(0, 64);
  }
  req.id = incoming || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ─── 2. Logging ─────────────────────────────────────────────────────────────
morgan.token('id', (req) => req.id);
app.use(morgan(':id :method :url :status :res[content-length] - :response-time ms', {
  // Keep high-frequency health probes out of production logs so real traffic is
  // not buried. The predicate previously read `() => isProduction && false`,
  // which is always false and therefore never skipped anything.
  skip: (req) => isProduction && req.originalUrl === '/api/health',
}));

// ─── 3. Security headers ────────────────────────────────────────────────────
app.use(helmet());

// ─── 4. Compression ─────────────────────────────────────────────────────────
app.use(compression());
app.set('etag', 'strong');

// ─── 5. CORS ────────────────────────────────────────────────────────────────
// Exact-match allowlist: no wildcards, no substring tests.
const allowedOrigins = Array.from(new Set(
  [config.FRONTEND_URL, config.CLIENT_URL]
    .filter(Boolean)
    .map((value) => {
      try { return new URL(value).origin; } catch { return null; }
    })
    .filter(Boolean)
));

const corsOptions = {
  /**
   * Allow non-browser callers (no Origin header) and exactly-listed origins.
   * Anything else is rejected with 403 — never 500.
   *
   * @param {string|undefined} origin Request Origin header.
   * @param {(err: Error|null, allow?: boolean) => void} callback CORS callback.
   */
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new HttpError(403, 'Origin not allowed by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  optionsSuccessStatus: 200,
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// ─── 6. Cache-Control policy ────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/api/health') {
    // Health must never be cached: it reports live DB state and is polled by
    // uptime monitors, and a cached 503/200 would be actively misleading.
    res.setHeader('Cache-Control', 'no-store');
  } else if (req.path.startsWith('/api/currency') || req.path.startsWith('/api/rates')) {
    res.setHeader('Cache-Control', 'public, max-age=300');
  } else if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ─── 7. Body parsers ────────────────────────────────────────────────────────
// Kept small globally; the two bulk routes (JSON backup restore and bank
// statement import) re-parse with a larger limit further down.
const DEFAULT_BODY_LIMIT = '100kb';
app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
// `extended: false` — no nested/array form bodies are used anywhere.
app.use(express.urlencoded({ extended: false, limit: DEFAULT_BODY_LIMIT }));

// ─── 8. NoSQL-injection sanitization ────────────────────────────────────────
// Lives in middleware/sanitizeRequest.js, which documents why Express 5 needs
// the `Object.defineProperty` treatment for `req.query`. Unit-tested by
// test/request-sanitize.test.js.
app.use(sanitizeRequest);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'OK' : 'DEGRADED',
    database: databaseReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
});

// Diagnostic echo used by `test/security-integration.test.js` to prove the
// sanitization middleware genuinely persists the sanitized query onto the request.
//
// Gated twice on purpose:
//   1. ENABLE_DIAGNOSTIC_ECHO must be explicitly set (defaults to false), and
//   2. it is hard-disabled in production regardless of that value,
// so the route can never be reached from a deployed environment.
if (config.ENABLE_DIAGNOSTIC_ECHO && !isProduction) {
  app.get('/api/__diagnostic/echo-query', (req, res) => {
    res.json({ query: req.query });
  });
}

const isDev = !isProduction;

// ─── 9. Rate limiters ───────────────────────────────────────────────────────
// NOTE: express-rate-limit's draft-8 `standardHeaders` requires a UNIQUE
// `identifier` per limiter, otherwise shared RateLimit headers collide with a
// ValidationError. Every limiter below therefore carries an explicit name.
//
// These stores are in-memory, so limits are PER INSTANCE. A multi-instance
// deployment needs a shared store (e.g. Redis via rate-limit-redis).

/** @param {object} options express-rate-limit options plus a required `identifier`. */
const makeLimiter = (options) => rateLimit({
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...options,
});

// Brute-force protection for authentication. Successful logins are not counted.
const authLimiter = makeLimiter({
  identifier: 'auth',
  windowMs: 5 * 60 * 1000,
  max: isDev ? 1000 : 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

// Baseline ceiling for every /api request — a cheap global safety net that also
// covers the unauthenticated surface (e.g. password-reset endpoints).
const apiLimiter = makeLimiter({
  identifier: 'api',
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10_000 : 600,
  message: { error: 'Too many requests. Please slow down and try again later.' },
});

// Mutating requests only.
const writeLimiter = makeLimiter({
  identifier: 'write',
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  message: { error: 'Too many write requests. Please try again later.' },
});

// Exports and backups are expensive and produce large payloads.
const exportLimiter = makeLimiter({
  identifier: 'export',
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Export rate limit reached. Please wait before requesting more exports.' },
});

// AI calls cost real money per request, so they get the tightest budget.
const aiLimiter = makeLimiter({
  identifier: 'ai',
  windowMs: 15 * 60 * 1000,
  max: isDev ? 200 : 20,
  message: { error: 'AI request limit reached. Please wait before requesting more insights.' },
});

// The Tax Center exposes sensitive financial data.
const taxLimiter = makeLimiter({
  identifier: 'tax',
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 120,
  message: { error: 'Tax request limit reached. Please wait and try again.' },
});

// ─── 10. Routes ──────────────────────────────────────────────────────────────
// IP-level limiting is applied BEFORE authentication so that unauthenticated
// floods are cheap to reject and never reach JWT verification or the database.

// Public: authentication endpoints are the main brute-force target.
const authRoutes = require('./routes/auth');
app.use('/api/auth', authLimiter, authRoutes);

// Bulk routes raise the body limit only for the paths that genuinely need it.
// Mounted before the generic routers so the larger parser wins for these paths.
const BULK_BODY_LIMIT = '10mb';
app.use(
  [
    '/api/users/:userId/import',
    '/api/transactions/statement/import',
  ],
  express.json({ limit: BULK_BODY_LIMIT })
);

// Protected routers: apiLimiter (cheap, IP-level) → auth (JWT + session) → writeLimiter (mutations).
app.use('/api/users', apiLimiter, auth, writeLimiter, require('./routes/users'));
app.use('/api/transactions', apiLimiter, auth, writeLimiter, require('./routes/transactions'));
app.use('/api/goals', apiLimiter, auth, writeLimiter, require('./routes/goals'));
app.use('/api/subscriptions', apiLimiter, auth, writeLimiter, require('./routes/subscriptions'));
app.use('/api/events', apiLimiter, auth, writeLimiter, require('./routes/events'));
app.use('/api/export', apiLimiter, auth, exportLimiter, require('./routes/export'));
app.use('/api/budgets', apiLimiter, auth, writeLimiter, require('./routes/budgets'));
app.use('/api/accounts', apiLimiter, auth, writeLimiter, require('./routes/accounts'));
app.use('/api/calculations', apiLimiter, auth, writeLimiter, require('./routes/calculations'));

// Sensitive / expensive surfaces get their own budget as well as the baseline.
app.use('/api/tax', apiLimiter, taxLimiter, auth, taxRoutes);
app.use('/api/wealth', apiLimiter, auth, wealthRoutes);
app.use('/api/cashflow', apiLimiter, auth, cashflowRoutes);
app.use('/api/ai', apiLimiter, aiLimiter, auth, aiRoutes);
app.use('/api/security', apiLimiter, auth, securityRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// ─── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // If a response has already started streaming, delegate to Express, which
  // destroys the socket. Writing headers again here would throw.
  if (res.headersSent) return next(err);

  if (config.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  // Full detail (including stack) is logged server-side but never returned.
  const status = err.status || err.statusCode || 500;
  logger.error(`[${req.id}] (${status}) ${err.stack || err.message}`);

  // SECURITY: 'Origin not allowed by CORS policy' is a 4xx, so it is returned
  // as-is; only genuine 5xx detail is masked in production.
  const message = (isProduction && status >= 500)
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  res.status(status).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
});

// ─── Start server ────────────────────────────────────────────────────────────
const PORT = config.PORT;
let server;

/**
 * Reconcile Tax Center indexes after the module schema changed.
 *
 * An early prototype created a UNIQUE `user_id` index on TaxProfile, which
 * incorrectly prevented one user from keeping multiple tax profiles. That index
 * must be dropped before `syncIndexes()` can recreate the correct one.
 *
 * @returns {Promise<void>} Resolves when indexes are reconciled.
 */
async function reconcileTaxIndexes() {
  const TaxProfile = require('./models/TaxProfile');
  const TaxRuleSet = require('./models/TaxRuleSet');
  const TaxTag = require('./models/TaxTag');
  const TaxPayment = require('./models/TaxPayment');
  const TaxDocument = require('./models/TaxDocument');

  await TaxProfile.collection.dropIndex('user_id_1').catch((dropErr) => {
    // 27 IndexNotFound      — the legacy index is simply not there: fine.
    // 26 NamespaceNotFound  — the collection itself does not exist yet (fresh
    //                         database): also fine, syncIndexes() will create it.
    const ignorable = [26, 27];
    if (!ignorable.includes(dropErr?.code) && dropErr?.codeName !== 'IndexNotFound'
      && dropErr?.codeName !== 'NamespaceNotFound') {
      throw dropErr;
    }
  });

  // Always runs, even if the drop above failed benignly.
  await Promise.all([
    TaxProfile.syncIndexes(),
    TaxRuleSet.syncIndexes(),
    TaxTag.syncIndexes(),
    TaxPayment.syncIndexes(),
    TaxDocument.syncIndexes(),
  ]);
}

connectToMongo()
  .then(async () => {
    // ── One-time migrations (versioned, not every boot) ──
    try {
      await runMigrations();
    } catch (migErr) {
      logger.error(`Migration failed: ${migErr.message}`);
      throw migErr;
    }

    // ── Tax index reconciliation ──
    try {
      await reconcileTaxIndexes();
    } catch (taxIndexErr) {
      logger.warn(`Could not reconcile tax indexes: ${taxIndexErr.message}`);
    }

    // ── Development convenience: seed tax rule sets ──
    // Production uses the protected seed script/admin endpoint so rule changes
    // stay an explicit release step. Guarded by NODE_ENV, so it can never run
    // in production.
    if (!isProduction) {
      try {
        const TaxRuleSet = require('./models/TaxRuleSet');
        const indiaRules = require('./services/taxRules/india-2024');
        const usRules = require('./services/taxRules/us-federal-2024');
        for (const rule of [...indiaRules, ...usRules]) {
          await TaxRuleSet.updateOne(
            { rule_key: rule.rule_key },
            { $set: rule },
            { upsert: true, runValidators: true }
          );
        }
        logger.info('Tax rule sets are available for local development.');
      } catch (seedErr) {
        logger.warn(`Could not seed development tax rules: ${seedErr.message}`);
      }
    }

    server = app.listen(PORT, () => {
      logger.info(`🚀 MyCoinwise API running on port ${PORT}`);
    });

    // Without this, a port clash (a very common local failure — a stale server
    // still holding the port) surfaces as an unhandled 'error' event and a raw
    // stack trace instead of an actionable message.
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Stop the process using it, or start with PORT=<free port>.`);
      } else if (err.code === 'EACCES') {
        logger.error(`Permission denied binding port ${PORT}. Use an unprivileged port (>= 1024).`);
      } else {
        logger.error(`HTTP server error: ${err.message}`);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    // Fail fast and loud: the API cannot serve any authenticated request
    // without MongoDB, so starting a half-working server would be worse than
    // not starting at all. Documented in README "Known Limitations".
    logger.error(`Failed to start server due to DB connection error: ${err.message}`);
    logger.error('The API will not start without a reachable MongoDB. Fix MONGO_URI or start MongoDB, then retry.');
    process.exit(1);
  });

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const SHUTDOWN_FORCE_TIMEOUT_MS = 10_000;
let isShuttingDown = false;

/**
 * Close the HTTP server and the MongoDB connection, then exit.
 * Idempotent: repeated signals are ignored, and a forced exit fires if cleanup
 * does not finish within {@link SHUTDOWN_FORCE_TIMEOUT_MS}.
 *
 * @param {string} signal Name of the signal or event that triggered shutdown.
 * @param {number} [exitCode=0] Process exit code to use on success.
 * @param {Error} [cause] Error that triggered the shutdown, when applicable.
 */
const shutdown = (signal, exitCode = 0, cause) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (cause) {
    logger.error(`${signal}: ${cause.stack || cause.message}`);
  } else {
    logger.info(`${signal} received: closing HTTP server`);
  }

  // Never hang forever waiting on an in-flight keep-alive connection.
  const forceExit = setTimeout(() => {
    logger.warn(`Graceful shutdown exceeded ${SHUTDOWN_FORCE_TIMEOUT_MS}ms; forcing exit.`);
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, SHUTDOWN_FORCE_TIMEOUT_MS);
  forceExit.unref();

  const closeMongo = () => {
    mongoose.connection.close(false)
      .then(() => {
        logger.info('MongoDB connection closed');
        process.exit(exitCode);
      })
      .catch((err) => {
        logger.error(`Error closing MongoDB: ${err.message}`);
        process.exit(1);
      });
  };

  if (server) {
    // Node >= 18: drop idle keep-alive sockets so close() can actually finish.
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close(() => {
      logger.info('HTTP server closed');
      closeMongo();
    });
  } else {
    closeMongo();
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// An unhandled rejection mid-request can leave the process in an undefined
// state; log it with full detail and shut down rather than serving bad data.
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  shutdown('unhandledRejection', 1, err);
});

process.on('uncaughtException', (err) => {
  shutdown('uncaughtException', 1, err);
});
