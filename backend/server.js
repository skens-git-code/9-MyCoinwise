const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const { body, validationResult } = require('express-validator');
const mongoose = require('./db');
const excel = require('exceljs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── Mongoose Models ────────────────────────────────────────────────────────
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Goal = require('./models/Goal');
const Subscription = require('./models/Subscription');
const LoginLog = require('./models/LoginLog');

// ─── Middleware ─────────────────────────────────────────────────────────────
const auth = require('./middleware/auth');

dotenv.config();

// ─── Environment Validation ─────────────────────────────────────────────────
if (!process.env.MONGO_URI) {
  console.warn('⚠️  MONGO_URI not set in .env — defaulting to mongodb://localhost:27017/ZenithSpend');
}

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], optionsSuccessStatus: 200 }));
app.use(morgan('dev'));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ─── AUTHENTICATION ROUTES ──────────────────────────────────────────────────
app.post('/api/auth/register', [
  body('username').notEmpty().trim().isLength({ min: 2, max: 80 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, email, password, currency, profile_avatar, profile_color } = req.body;
  const ipAddr = req.ip || req.headers['x-forwarded-for'] || null;
  const ua     = req.headers['user-agent'] || null;
  const { device_type, browser, os } = LoginLog.parseUserAgent(ua);

  try {
    const user  = await User.create({ username, email, password, currency, profile_avatar, profile_color });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'super_secret', { expiresIn: '7d' });

    await LoginLog.create({
      user_id: user._id, email, status: 'success', reason: 'registered',
      ip: ipAddr, user_agent: ua, device_type, browser, os,
      failed_attempts_before: 0
    }).catch(() => {});

    res.status(201).json({ token, user: { id: user._id, username, email } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});



app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const ipAddr = req.ip || req.headers['x-forwarded-for'] || null;
  const ua     = req.headers['user-agent'] || null;
  const { device_type, browser, os } = LoginLog.parseUserAgent(ua);

  try {
    const user = await User.findOne({ email }).select('+password');

    // User not found
    if (!user) {
      await LoginLog.create({ email, status: 'failed', reason: 'user_not_found', ip: ipAddr, user_agent: ua, device_type, browser, os }).catch(() => {});
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Account inactive
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled. Contact support.' });
    }

    // Account locked — check if lock expired
    if (user.account_locked) {
      if (user.locked_until && user.locked_until > new Date()) {
        const minutesLeft = Math.ceil((user.locked_until - new Date()) / 60000);
        await LoginLog.create({
          user_id: user._id, email, status: 'failed', reason: 'account_locked',
          ip: ipAddr, user_agent: ua, device_type, browser, os,
          failed_attempts_before: user.failed_login_count
        }).catch(() => {});
        return res.status(423).json({ error: `Account locked. Try again in ${minutesLeft} minute(s).` });
      }
      // Lock expired — reset
      user.account_locked     = false;
      user.locked_until       = null;
      user.failed_login_count = 0;
    }

    // Wrong password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const prevFailed = user.failed_login_count;
      await user.incrementFailedLogin();
      const remaining = Math.max(0, User.MAX_FAILED_LOGINS - user.failed_login_count);

      await LoginLog.create({
        user_id: user._id, email, status: 'failed', reason: 'invalid_password',
        ip: ipAddr, user_agent: ua, device_type, browser, os,
        failed_attempts_before: prevFailed
      }).catch(() => {});

      if (user.account_locked) {
        return res.status(423).json({ error: `Too many failed attempts. Account locked for ${User.LOCK_DURATION_MINUTES} minutes.` });
      }
      return res.status(401).json({ error: `Invalid credentials. ${remaining} attempt(s) remaining.` });
    }

    // ✅ Successful login
    await user.resetLoginAttempts(ipAddr);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'super_secret', { expiresIn: '7d' });

    await LoginLog.create({
      user_id: user._id, email, status: 'success', reason: 'login',
      ip: ipAddr, user_agent: ua, device_type, browser, os,
      failed_attempts_before: 0
    }).catch(() => {});

    res.json({ token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// View login logs for current user (auth protected)
app.get('/api/auth/login-logs', auth, async (req, res) => {
  try {
    const logs = await LoginLog.find({ user_id: req.user.id })
      .sort({ created_at: -1 })
      .limit(50)
      .select('-__v');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── CURRENCY HELPERS ────────────────────────────────────────────────────────
const CURRENCIES = {
  USD: { symbol: '$', code: 'USD' },
  INR: { symbol: '₹', code: 'INR' },
  EUR: { symbol: '€', code: 'EUR' },
  GBP: { symbol: '£', code: 'GBP' },
  JPY: { symbol: '¥', code: 'JPY' },
  CAD: { symbol: 'CA$', code: 'CAD' },
  AUD: { symbol: 'A$', code: 'AUD' },
};

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// ─── PROTECT ALL SUBSEQUENT ROUTES ───────────────────────────────────────────
app.use('/api/users', auth);
app.use('/api/transactions', auth);
app.use('/api/goals', auth);
app.use('/api/subscriptions', auth);
app.use('/api/export', auth);

// 1. Get all users (for user switcher - keeping for backward compat if needed, but really shouldn't be used now)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username email balance theme monthly_goal currency profile_avatar profile_color').sort({ _id: 1 });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. Get single user
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Create new user
app.post('/api/users', [
  body('username').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('currency').optional().isString()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, email, currency = 'INR', profile_avatar = '😊', profile_color = '#059669' } = req.body;
  try {
    const user = await User.create({ username, email, balance: 0, currency, profile_avatar, profile_color });
    res.status(201).json({ id: user._id, message: 'User created' });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email already exists' });
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3.5 Delete user
app.delete('/api/users/:id', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.params.id;
    await Transaction.deleteMany({ user_id: userId }, { session });
    await Goal.deleteMany({ user_id: userId }, { session });
    await Subscription.deleteMany({ user_id: userId }, { session });
    await User.findByIdAndDelete(userId, { session });
    await session.commitTransaction();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    session.endSession();
  }
});

// 4. Update user settings
app.put('/api/users/:id/settings', [
  body('username').optional().notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, theme, monthly_goal, currency, profile_avatar, profile_color } = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = {
      username: username || user.username,
      theme: theme || user.theme,
      monthly_goal: monthly_goal !== undefined ? monthly_goal : user.monthly_goal,
      currency: currency || user.currency,
      profile_avatar: profile_avatar || user.profile_avatar,
      profile_color: profile_color || user.profile_color
    };

    await User.findByIdAndUpdate(req.params.id, updates);
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4.5. Notifications Preferences
app.get('/api/users/:id/notifications', async (req, res) => {
  try {
    const user = await User.findById(req.params.id, 'notification_prefs');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const prefs = user.notification_prefs;
    res.json(prefs || {
      emailReports: true, budgetAlerts: true, goalMilestones: true, unusualSpending: false,
      pushNotifications: true, weeklyDigest: true, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/users/:id/notifications', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { notification_prefs: req.body });
    res.json({ message: 'Notification preferences updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 5. Get user transactions
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ user_id: req.params.userId }).sort({ date: -1 });
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 6. Add transaction
app.post('/api/transactions', async (req, res) => {
  const { type, category, amount, date, note } = req.body;
  const user_id = req.user.id;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const txData = { user_id, type, category, amount, note: note || null };
    if (date) txData.date = new Date(date);

    const [transaction] = await Transaction.create([txData], { session });

    const modifier = type === 'income' ? amount : -amount;
    await User.findByIdAndUpdate(user_id, { $inc: { balance: modifier } }, { session });

    await session.commitTransaction();
    res.status(201).json({ id: transaction._id, message: 'Transaction added' });
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    session.endSession();
  }
});

// 7. Edit transaction (amount, category, note, date, type)
app.put('/api/transactions/:id', async (req, res) => {
  const { amount, category, note, date, type } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const t = await Transaction.findById(req.params.id).session(session);
    if (!t) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const reverseModifier = t.type === 'income' ? -Number(t.amount) : Number(t.amount);
    const newType = type || t.type;
    const newAmount = amount !== undefined ? Number(amount) : Number(t.amount);
    const newModifier = newType === 'income' ? newAmount : -newAmount;

    t.type = newType;
    t.amount = newAmount;
    t.category = category || t.category;
    t.note = note !== undefined ? note : t.note;
    t.date = date ? new Date(date) : t.date;
    await t.save({ session });

    await User.findByIdAndUpdate(t.user_id, { $inc: { balance: reverseModifier + newModifier } }, { session });

    await session.commitTransaction();
    res.json({ message: 'Transaction updated' });
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    session.endSession();
  }
});

// 8. Delete transaction
app.delete('/api/transactions/:id', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const t = await Transaction.findById(req.params.id).session(session);
    if (!t) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const modifier = t.type === 'income' ? -t.amount : t.amount;
    await User.findByIdAndUpdate(t.user_id, { $inc: { balance: modifier } }, { session });
    await Transaction.findByIdAndDelete(req.params.id, { session });

    await session.commitTransaction();
    res.json({ message: 'Transaction deleted' });
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    session.endSession();
  }
});

// 9. RESET — delete all transactions, goals, subscriptions, and reset balance to 0
app.post('/api/users/:id/reset', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.params.id;
    await Transaction.deleteMany({ user_id: userId }, { session });
    await Goal.deleteMany({ user_id: userId }, { session });
    await Subscription.deleteMany({ user_id: userId }, { session });
    await User.findByIdAndUpdate(userId, { balance: 0 }, { session });
    await session.commitTransaction();
    res.json({ message: 'Account reset successfully' });
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    session.endSession();
  }
});

// --- GOALS API ---

// G1. Get all goals for a user
app.get('/api/goals/:userId', async (req, res) => {
  try {
    const goals = await Goal.find({ user_id: req.params.userId }).sort({ created_at: 1 });
    res.json(goals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// G2. Add a new goal
app.post('/api/goals', async (req, res) => {
  const { name, target, saved, color, icon, deadline, priority, category, notes, auto_save_amount, auto_save_interval } = req.body;
  const user_id = req.user.id;
  try {
    const goalData = { user_id, name, target, saved: saved || 0, color, icon };
    
    if (deadline) goalData.deadline = new Date(deadline);
    if (priority) goalData.priority = priority;
    if (category) goalData.category = category;
    if (notes) goalData.notes = notes;
    if (auto_save_amount !== undefined) goalData.auto_save_amount = auto_save_amount;
    if (auto_save_interval) goalData.auto_save_interval = auto_save_interval;

    const goal = await Goal.create(goalData);
    res.json({ id: goal._id, message: 'Goal created', goal });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// G3. Update goal saved amount
app.put('/api/goals/:id', async (req, res) => {
  try {
    await Goal.findByIdAndUpdate(req.params.id, { saved: req.body.saved });
    res.json({ message: 'Goal updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// G4. Delete a goal
app.delete('/api/goals/:id', async (req, res) => {
  try {
    await Goal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- SUBSCRIPTIONS API ---

// S1. Get all subscriptions for a user
app.get('/api/subscriptions/:userId', async (req, res) => {
  try {
    const subs = await Subscription.find({ user_id: req.params.userId }).sort({ created_at: 1 });
    res.json(subs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// S2. Add a new subscription
app.post('/api/subscriptions', async (req, res) => {
  const { name, amount, cycle, color, icon, url, notes, payment_method, start_date, next_billing_date, trial_ends } = req.body;
  const user_id = req.user.id;
  try {
    const subData = { user_id, name, amount, cycle: cycle || 'monthly', color, icon };
    
    // Add optional advanced fields if they exist
    if (url) subData.url = url;
    if (notes) subData.notes = notes;
    if (payment_method) subData.payment_method = payment_method;
    if (start_date) subData.start_date = new Date(start_date);
    if (next_billing_date) subData.next_billing_date = new Date(next_billing_date);
    if (trial_ends) subData.trial_ends = new Date(trial_ends);

    const sub = await Subscription.create(subData);
    res.json({ id: sub._id, message: 'Subscription created', sub });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// S3. Delete a subscription
app.delete('/api/subscriptions/:id', async (req, res) => {
  try {
    await Subscription.findByIdAndDelete(req.params.id);
    res.json({ message: 'Subscription deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 10. Export to Excel
app.get('/api/export/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId) || {};
    const currency = user.currency || 'USD';
    const currencySymbol = (CURRENCIES[currency] || CURRENCIES.USD).symbol;

    const transactions = await Transaction.find({ user_id: req.params.userId }).sort({ date: -1 });

    const workbook = new excel.Workbook();
    workbook.creator = 'Zenith Spend';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Transactions', { pageSetup: { fitToPage: true } });
    ws.columns = [
      { header: 'ID', key: 'id', width: 28 },
      { header: 'Date', key: 'date', width: 22 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Category', key: 'category', width: 22 },
      { header: 'Note', key: 'note', width: 32 },
      { header: `Amount (${currency})`, key: 'amount', width: 16 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    headerRow.height = 22;

    transactions.forEach(t => {
      const row = ws.addRow({
        id: t._id.toString(),
        date: new Date(t.date).toLocaleString('en-IN'),
        type: t.type.toUpperCase(),
        category: t.category,
        note: t.note || '',
        amount: `${currencySymbol}${parseFloat(t.amount).toFixed(2)}`,
      });
      row.getCell('amount').font = {
        bold: true,
        color: { argb: t.type === 'income' ? 'FF10B981' : 'FFEF4444' }
      };
    });

    ws.eachRow(row => row.eachCell(cell => {
      cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ZenithSpend_${user.username || 'Report'}.xlsx`);
    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(`🚀 Zenith Spend API running on port ${PORT}`);
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
