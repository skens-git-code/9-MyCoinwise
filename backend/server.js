// ─── Load env vars FIRST (before any module that reads process.env) ─────────
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
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

const app = express();

// ─── CORS — allow deployed frontend + local dev ─────────────────────────────
const defaultAllowed = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://9-budget-tracker.vercel.app',
  'https://nine-budgettracker.onrender.com'
];

if (process.env.FRONTEND_URL) defaultAllowed.push(process.env.FRONTEND_URL);
if (process.env.CLIENT_URL) defaultAllowed.push(process.env.CLIENT_URL);

const allowedOrigins = Array.from(new Set(defaultAllowed.filter(Boolean).map((value) => {
  try { return new URL(value).origin; } catch { return value; }
})));

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // Handle all preflight OPTIONS requests explicitly
app.use(morgan('dev'));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '5mb' })); // reduced limit from 50mb for security
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.get('/api/health', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'OK' : 'DEGRADED',
    database: databaseReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/wealth', auth, wealthRoutes);
app.use('/api/cashflow', auth, cashflowRoutes);


const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const transactionsRoutes = require('./routes/transactions');
const goalsRoutes = require('./routes/goals');
const subscriptionsRouter = require('./routes/subscriptions');
const eventsRouter = require('./routes/events');
const exportRouter = require('./routes/export');
const budgetsRouter = require('./routes/budgets');
const accountsRouter = require('./routes/accounts');
const calculationsRouter = require('./routes/calculations');

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  message: { error: 'Too many write requests. Please try again later.' }
});
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Export rate limit reached. Please try again later.' }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', auth, writeLimiter, usersRoutes);
app.use('/api/transactions', auth, writeLimiter, transactionsRoutes);
app.use('/api/goals', auth, writeLimiter, goalsRoutes);
app.use('/api/subscriptions', auth, writeLimiter, subscriptionsRouter);
app.use('/api/events', auth, writeLimiter, eventsRouter);
app.use('/api/export', auth, exportLimiter, exportRouter);
app.use('/api/budgets', auth, writeLimiter, budgetsRouter);
app.use('/api/accounts', auth, writeLimiter, accountsRouter);
app.use('/api/calculations', auth, writeLimiter, calculationsRouter);
app.use('/api/ai', auth, aiRoutes);
app.use('/api/security', auth, securityRoutes);

// ─── ERROR HANDLER MIDDLEWARE ────────────────────────────────────────────────

app.use((err, req, res, next) => {
  logger.error(err.stack);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  logger.info(`🚀 MyCoinwise API running on port ${PORT}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});
