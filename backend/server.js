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
const mongoose = require('./db');

// ─── Middleware ─────────────────────────────────────────────────────────────
const auth = require('./middleware/auth');
const wealthRoutes = require('./routes/wealth');
const cashflowRoutes = require('./routes/cashflow');
const aiRoutes = require('./routes/ai');
const securityRoutes = require('./routes/security');

// ─── Environment Validation ─────────────────────────────────────────────────
if (!process.env.MONGO_URI) {
  console.error('FATAL ERROR: MONGO_URI is not defined in the environment variables.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in the environment variables.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.warn('WARNING: GEMINI_API_KEY is not defined. AI features will be unavailable.');
}

const app = express();

// ─── Trust Proxy (if behind a reverse proxy) ────────────────────────────────
app.set('trust proxy', 1); // Respect X-Forwarded-For headers

// ─── CORS — allow deployed frontend + local dev ─────────────────────────────
const defaultAllowed = [
  'http://localhost:5173',
  'http://localhost:5174',
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
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// ─── Rate Limiters ──────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 attempts per window
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
app.use('/api/auth', authRoutes);

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

// Wealth & Cashflow (auth applied inside their own routers)
app.use('/api/wealth', wealthRoutes);
app.use('/api/cashflow', cashflowRoutes);

// AI & Security routes
app.use('/api/ai', auth, aiRoutes);
app.use('/api/security', auth, securityRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// ─── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`[${req.id}] ${err.stack}`);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
});

// ─── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  logger.info(`🚀 MyCoinwise API running on port ${PORT}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`${signal} received: closing HTTP server`);
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
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));