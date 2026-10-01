// ─── Load env vars FIRST (before any module that reads process.env) ─────────
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid'); // Install with: npm install uuid
const { logger } = require('./utils/logger');
const { mongoose, connectToMongo } = require('./db');

// ─── Middleware ─────────────────────────────────────────────────────────────
const auth = require('./middleware/auth');
const wealthRoutes = require('./routes/wealth');
const cashflowRoutes = require('./routes/cashflow');
const aiRoutes = require('./routes/ai');
const securityRoutes = require('./routes/security');
const taxRoutes = require('./routes/tax');

const { cleanEnv, str, port, bool, num } = require('envalid');
const mongoSanitize = require('express-mongo-sanitize');
const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
    beforeSend(event) {
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

// ─── Environment Validation (envalid) ───────────────────────────────────────
cleanEnv(process.env, {
  MONGO_URI: str({ desc: 'MongoDB connection string URI' }),
  JWT_SECRET: str({ desc: 'Secret key for signing JSON Web Tokens' }),
  PORT: port({ default: 5001, desc: 'HTTP port server listens on' }),
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  GEMINI_API_KEY: str({ default: '', desc: 'Google Gemini AI API Key' }),
  GEMINI_MODEL: str({ default: 'gemini-2.5-flash', desc: 'Google Gemini Model version' }),
  SENTRY_DSN: str({ default: '', desc: 'Sentry DSN for error monitoring' }),
  SMTP_HOST: str({ default: '', desc: 'SMTP host for outbound emails' }),
  SMTP_PORT: port({ default: 587, desc: 'SMTP port' }),
  SMTP_SECURE: bool({ default: false, desc: 'Whether SMTP uses TLS' }),
  SMTP_USER: str({ default: '', desc: 'SMTP username' }),
  SMTP_PASS: str({ default: '', desc: 'SMTP password' }),
  EMAIL_FROM: str({ default: 'MyCoinwise <noreply@mycoinwise.app>', desc: 'Outbound sender name/address' }),
  RESET_TOKEN_EXPIRY_MINUTES: num({ default: 60, desc: 'Password reset token expiration' }),
  FINNHUB_API_KEY: str({ default: '', desc: 'Finnhub API key for market data' }),
});

const app = express();

// ─── Trust Proxy (if behind a reverse proxy) ────────────────────────────────
app.set('trust proxy', 1); // Respect X-Forwarded-For headers

// ─── CORS — allow deployed frontend + local dev ─────────────────────────────
const defaultAllowed = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://localhost:3000',
  'https://9-budget-tracker.vercel.app',
  'https://nine-budgettracker.onrender.com',
];

if (process.env.FRONTEND_URL) defaultAllowed.push(process.env.FRONTEND_URL);
if (process.env.CLIENT_URL) defaultAllowed.push(process.env.CLIENT_URL);

const allowedOrigins = Array.from(new Set(defaultAllowed.filter(Boolean).map((value) => {
  try { return new URL(value).origin; } catch { return value; }
})));

const corsOptions = {
  origin: function (origin, callback) {
    // Allow server-to-server (no origin) and whitelisted origins only.
    // SECURITY: No wildcard subdomains — each allowed origin is explicit.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// ─── Request ID middleware ──────────────────────────────────────────────────
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ─── Logging with request ID ────────────────────────────────────────────────
morgan.token('id', (req) => req.id);
app.use(morgan(':id :method :url :status :res[content-length] - :response-time ms'));

// ─── Security & compression ─────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.set('etag', 'strong');

// Cache-Control headers: no-store on user-specific data; public max-age=300 on public endpoints/rates
app.use((req, res, next) => {
  if (req.path.startsWith('/api/currency') || req.path.startsWith('/api/rates') || req.path === '/api/health') {
    res.setHeader('Cache-Control', 'public, max-age=300');
  } else if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize request data against MongoDB NoSQL injection attacks ($ and .)
// ─────────────────────────────────────────────────────────────────────────────
// [EXPRESS 5 COMPATIBILITY FIX]
// Default `app.use(mongoSanitize())` attempts `req.query = target`, which throws
// "Cannot set property query of #<IncomingMessage> which has only a getter" in Express 5.
// We sanitize req.body, req.params, and req.query in-place using mongoSanitize.sanitize().
// app.use(mongoSanitize());
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  if (req.query) mongoSanitize.sanitize(req.query);
  next();
});

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

const isDev = process.env.NODE_ENV !== 'production';

// ─── Rate Limiters ──────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isDev ? 1000 : 10, // 10 attempts in prod, generous in dev/test
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // don't count successful logins
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  message: { error: 'Too many write requests. Please try again later.' },
});

const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Export rate limit reached. Please wait before requesting more exports.' },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// Public routes (no authentication)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authLimiter, authRoutes);

// Protected routes (authentication applied inside each router)
app.use('/api/users', auth, writeLimiter, require('./routes/users'));
app.use('/api/transactions', auth, writeLimiter, require('./routes/transactions'));
app.use('/api/goals', auth, writeLimiter, require('./routes/goals'));
app.use('/api/subscriptions', auth, writeLimiter, require('./routes/subscriptions'));
app.use('/api/events', auth, writeLimiter, require('./routes/events'));
app.use('/api/export', auth, exportLimiter, require('./routes/export'));
app.use('/api/budgets', auth, writeLimiter, require('./routes/budgets'));
app.use('/api/accounts', auth, writeLimiter, require('./routes/accounts'));
app.use('/api/calculations', auth, writeLimiter, require('./routes/calculations'));
app.use('/api/tax', auth, taxRoutes);

// Wealth & Cashflow — defense-in-depth auth at the mount level
app.use('/api/wealth', auth, wealthRoutes);
app.use('/api/cashflow', auth, cashflowRoutes);

// AI & Security routes
app.use('/api/ai', auth, aiRoutes);
app.use('/api/security', auth, securityRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// ─── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  logger.error(`[${req.id}] ${err.stack}`);
  const status = err.status || 500;
  // SECURITY: Don't leak internal error details in production
  const message = (process.env.NODE_ENV === 'production' && status >= 500)
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
const PORT = process.env.PORT || 5001;
let server;

connectToMongo().then(async () => {
  // Ensure legacy root accounts have household_id populated
  try {
    const User = require('./models/User');
    await User.updateMany(
      { $or: [{ household_id: null }, { household_id: { $exists: false } }] },
      [{ $set: { household_id: '$_id' } }]
    );
  } catch (healErr) {
    logger.warn(`Could not run household_id self-healing migration: ${healErr.message}`);
  }

  // Reconcile tax indexes after the module schema was introduced. In
  // particular, an early prototype created a unique user_id index, which
  // incorrectly prevented a user from comparing multiple profiles.
  try {
    const TaxProfile = require('./models/TaxProfile');
    const TaxRuleSet = require('./models/TaxRuleSet');
    const TaxTag = require('./models/TaxTag');
    const TaxPayment = require('./models/TaxPayment');
    const TaxDocument = require('./models/TaxDocument');
    await TaxProfile.collection.dropIndex('user_id_1').catch((dropErr) => {
      // MongoDB returns code 27 when the legacy index is absent; that is safe.
      if (dropErr?.code !== 27 && dropErr?.codeName !== 'IndexNotFound') throw dropErr;
    });
    await Promise.all([
      TaxProfile.syncIndexes(),
      TaxRuleSet.syncIndexes(),
      TaxTag.syncIndexes(),
      TaxPayment.syncIndexes(),
      TaxDocument.syncIndexes(),
    ]);
  } catch (taxIndexErr) {
    logger.warn(`Could not reconcile tax indexes: ${taxIndexErr.message}`);
  }

  // Development convenience: keep the local Tax Center usable without a
  // separate deployment migration. Production still uses the protected seed
  // script/admin endpoint so rule changes remain an explicit release step.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const TaxRuleSet = require('./models/TaxRuleSet');
      const indiaRules = require('./services/taxRules/india-2024');
      const usRules = require('./services/taxRules/us-federal-2024');
      for (const rule of [...indiaRules, ...usRules]) {
        await TaxRuleSet.updateOne({ rule_key: rule.rule_key }, { $set: rule }, { upsert: true, runValidators: true });
      }
      logger.info('Tax rule sets are available for local development.');
    } catch (seedErr) {
      logger.warn(`Could not seed development tax rules: ${seedErr.message}`);
    }
  }

  server = app.listen(PORT, () => {
    logger.info(`🚀 MyCoinwise API running on port ${PORT}`);
  });
}).catch(err => {
  logger.error(`Failed to start server due to DB connection error: ${err.message}`);
  process.exit(1);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`${signal} received: closing HTTP server`);
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      mongoose.connection.close(false).then(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
      }).catch((err) => {
        console.error('Error closing MongoDB:', err);
        process.exit(1);
      });
    });
  } else {
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    }).catch((err) => {
      console.error('Error closing MongoDB:', err);
      process.exit(1);
    });
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
