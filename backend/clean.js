const fs = require('fs');

const serverFile = 'backend/server.js';
let content = fs.readFileSync(serverFile, 'utf8');

// The marker we want to insert our route uses
const replacement = `
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const transactionsRoutes = require('./routes/transactions');
const goalsRoutes = require('./routes/goals');
const subscriptionsRoutes = require('./routes/subscriptions');
const eventsRoutes = require('./routes/events');
const exportRoutes = require('./routes/export');

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/export', exportRoutes);

// ─── ERROR HANDLER MIDDLEWARE ────────────────────────────────────────────────
`;

const startIndex = content.indexOf('// ─── AUTHENTICATION ROUTES ──────────────────────────────────────────────────');
const endIndex = content.indexOf('// ─── ERROR HANDLER MIDDLEWARE ────────────────────────────────────────────────');

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex + 80);
  fs.writeFileSync(serverFile, content);
  console.log('Successfully refactored server.js');
} else {
  console.error('Could not find markers in server.js');
}
