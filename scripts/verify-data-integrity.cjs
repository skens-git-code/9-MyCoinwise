const mongoose = require('../backend/node_modules/mongoose');
const axios = require('../backend/node_modules/axios');
const fs = require('fs');
const path = require('path');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const API_BASE = 'http://localhost:5001/api';
const MONGO_URI = process.env.MONGO_URI;

const Transaction = require('../backend/models/Transaction');
const User = require('../backend/models/User');

async function run() {
  console.log('=== STARTING STEP 5.2: DATA INTEGRITY VERIFICATION ===');
  
  if (!MONGO_URI) {
    throw new Error('MONGO_URI is not defined in backend/.env');
  }

  // 1. Register or create fresh test user
  const email = `integrity_${Date.now()}@coinwise.test`;
  const username = `integrity_${Date.now()}`.slice(0, 30);
  const password = 'IntegrityPassword123!';

  console.log(`\n1. Creating fresh test user: ${email} (${username})...`);
  await mongoose.connect(MONGO_URI);
  console.log('   Connected to MongoDB Atlas.');

  let userId;
  let token;

  try {
    const regRes = await axios.post(`${API_BASE}/auth/register`, {
      email,
      username,
      password,
      currency: 'USD'
    });
    token = regRes.data.token;
    userId = regRes.data.user.id || regRes.data.user._id;
    console.log(`   User registered via API. User ID: ${userId}`);
  } catch (err) {
    if (err.response && (err.response.status === 429 || err.response.status === 400)) {
      console.log('   Register endpoint rate limited. Creating user directly in DB...');
      const createdUser = await User.create({
        username,
        email,
        password,
        currency: 'USD'
      });
      userId = createdUser._id.toString();
      console.log(`   User created in DB directly. User ID: ${userId}`);

      // Now log in via API
      console.log('   Logging in via API endpoint to establish authenticated session...');
      const loginRes = await axios.post(`${API_BASE}/auth/login`, {
        email,
        password
      });
      token = loginRes.data.token;
      console.log('   API Login successful. Token received.');
    } else {
      throw err;
    }
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Define 10 diverse transactions
  const transactionsToCreate = [
    {
      type: 'income',
      category: 'Salary',
      amount: 4500.00,
      currency: 'USD',
      note: 'Primary employment bi-weekly salary',
      is_recurring: true,
      recurrence_interval: 'monthly',
      date: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
      type: 'expense',
      category: 'Rent',
      amount: 1250.75,
      currency: 'USD',
      note: 'Apartment monthly lease',
      is_recurring: true,
      recurrence_interval: 'monthly',
      date: new Date(Date.now() - 86400000 * 4).toISOString()
    },
    {
      type: 'expense',
      category: 'Food',
      amount: 84.30,
      currency: 'USD',
      note: 'Weekly grocery basket',
      is_recurring: false,
      date: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    {
      type: 'expense',
      category: 'Entertainment',
      amount: 15.99,
      currency: 'EUR',
      note: 'Streaming service subscription',
      is_recurring: true,
      recurrence_interval: 'monthly',
      date: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    {
      type: 'expense',
      category: 'Transport',
      amount: 45.20,
      currency: 'USD',
      note: 'Subway card recharge',
      is_recurring: false,
      date: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      type: 'income',
      category: 'Freelance',
      amount: 620.50,
      currency: 'USD',
      note: 'Frontend UI design contract',
      is_recurring: false,
      date: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      type: 'expense',
      category: 'Tech',
      amount: 99.00,
      currency: 'USD',
      note: 'Annual cloud storage backup',
      is_recurring: true,
      recurrence_interval: 'yearly',
      date: new Date(Date.now() - 86400000 * 1).toISOString()
    },
    {
      type: 'expense',
      category: 'Fitness',
      amount: 60.00,
      currency: 'USD',
      note: 'Gym monthly membership',
      is_recurring: true,
      recurrence_interval: 'monthly',
      date: new Date(Date.now() - 86400000 * 1).toISOString()
    },
    {
      type: 'income',
      category: 'Dividends',
      amount: 110.25,
      currency: 'USD',
      note: 'Quarterly index fund dividend',
      is_recurring: false,
      date: new Date(Date.now() - 3600000 * 5).toISOString()
    },
    {
      type: 'expense',
      category: 'Dining',
      amount: 32.50,
      currency: 'USD',
      note: 'Dinner out with colleagues',
      is_recurring: false,
      date: new Date().toISOString()
    }
  ];

  console.log(`\n2. Creating 10 diverse transactions via API...`);
  const createdTransactions = [];
  for (let i = 0; i < transactionsToCreate.length; i++) {
    const txData = transactionsToCreate[i];
    const res = await axios.post(`${API_BASE}/transactions`, txData, { headers: authHeaders });
    const created = res.data.transaction || res.data;
    createdTransactions.push(created);
    console.log(`   [${i + 1}/10] Created ${txData.type.toUpperCase()}: ${txData.category} - $${txData.amount} (${txData.note})`);
  }

  // 3. Connect to MongoDB directly and verify exactly 10 records exist
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
  }

  const dbTransactions = await Transaction.find({
    user_id: new mongoose.Types.ObjectId(userId),
    is_deleted: { $ne: true }
  }).lean();

  console.log(`   Found ${dbTransactions.length} transactions in MongoDB for user ${userId}.`);
  if (dbTransactions.length !== 10) {
    throw new Error(`Expected exactly 10 transactions in MongoDB, but found ${dbTransactions.length}`);
  }

  // Verify fields in DB match what was sent
  for (const expected of transactionsToCreate) {
    const match = dbTransactions.find(t => t.note === expected.note && t.category === expected.category);
    if (!match) {
      throw new Error(`Transaction matching "${expected.note}" not found in MongoDB`);
    }
    if (Math.abs(match.amount - expected.amount) > 0.001) {
      throw new Error(`Amount mismatch for ${expected.note}: expected ${expected.amount}, got ${match.amount}`);
    }
    if (match.type !== expected.type) {
      throw new Error(`Type mismatch for ${expected.note}: expected ${expected.type}, got ${match.type}`);
    }
  }
  console.log('   ✅ All 10 transaction records in MongoDB have exactly matching categories, amounts, types, and notes.');

  // 4. Verify re-login preserves all 10
  console.log(`\n4. Simulating re-login to verify persistence...`);
  const loginRes = await axios.post(`${API_BASE}/auth/login`, {
    email,
    password
  });
  const reToken = loginRes.data.token;
  console.log('   Re-login successful. Fetching transactions with fresh token...');

  const fetchRes = await axios.get(`${API_BASE}/transactions/${userId}`, {
    headers: { Authorization: `Bearer ${reToken}` }
  });
  const reTransactions = fetchRes.data.items || fetchRes.data.transactions || (Array.isArray(fetchRes.data) ? fetchRes.data : []);
  console.log(`   Retrieved ${reTransactions.length} transactions via API after re-login.`);
  if (reTransactions.length !== 10) {
    throw new Error(`Expected 10 transactions after re-login, got ${reTransactions.length}`);
  }
  console.log('   ✅ All 10 transactions preserved and accessible across re-login.');

  // 5. Balance reconciliation: |stored - computed| < 0.01
  console.log(`\n5. Verifying Balance Reconciliation...`);
  // Get current user profile stored balance
  const meRes = await axios.get(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${reToken}` }
  });
  const storedBalance = meRes.data.user?.balance ?? meRes.data.balance;
  const userCurrency = meRes.data.user?.currency || 'USD';
  console.log(`   User stored balance in DB: ${storedBalance} ${userCurrency}`);

  const FALLBACK_RATES_TO_INR = {
    INR: 1, USD: 83.5, EUR: 90.2, GBP: 105.8, JPY: 0.56, CAD: 61.2,
    AUD: 53.8, SGD: 61.5, AED: 22.7, CHF: 95, CNY: 11.5, MXN: 4.9,
    BRL: 16.4, KRW: 0.063, THB: 2.35,
  };
  const convertToCurrency = (amt, from, to) => {
    from = String(from || 'USD').toUpperCase();
    to = String(to || 'USD').toUpperCase();
    if (from === to) return Number(amt) || 0;
    const fRate = FALLBACK_RATES_TO_INR[from];
    const tRate = FALLBACK_RATES_TO_INR[to];
    if (!fRate || !tRate) return Number(amt) || 0;
    return (Number(amt) || 0) * fRate / tRate;
  };

  // Compute balance directly from transactions with FX conversion
  let computedIncome = 0;
  let computedExpense = 0;
  for (const t of dbTransactions) {
    const convertedAmount = convertToCurrency(t.amount, t.currency || userCurrency, userCurrency);
    if (t.type === 'income') {
      computedIncome += convertedAmount;
    } else if (t.type === 'expense') {
      computedExpense += convertedAmount;
    }
  }
  const computedBalance = parseFloat((computedIncome - computedExpense).toFixed(2));
  console.log(`   Computed Income:  $${computedIncome.toFixed(2)}`);
  console.log(`   Computed Expense: $${computedExpense.toFixed(2)}`);
  console.log(`   Computed Balance: $${computedBalance.toFixed(2)}`);

  const discrepancy = parseFloat(Math.abs(storedBalance - computedBalance).toFixed(4));
  console.log(`   Discrepancy |stored - computed| = ${discrepancy}`);

  if (discrepancy >= 0.01) {
    throw new Error(`Balance reconciliation failed! |${storedBalance} - ${computedBalance}| = ${discrepancy} >= 0.01`);
  }
  console.log(`   ✅ Balance reconciliation PASSED (|stored - computed| = ${discrepancy} < 0.01)`);

  const report = {
    status: 'PASSED',
    timestamp: new Date().toISOString(),
    testUser: {
      userId,
      email
    },
    transactionCount: dbTransactions.length,
    storedBalance,
    computedBalance,
    discrepancy,
    reconciliationPassed: discrepancy < 0.01,
    reloginPersistenceVerified: true,
    mongoDirectQueryVerified: true,
    transactions: dbTransactions.map(t => ({
      id: t._id,
      category: t.category,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      note: t.note,
      is_recurring: t.is_recurring,
      recurrence_interval: t.recurrence_interval
    }))
  };

  fs.writeFileSync(path.join(__dirname, '../data-integrity-report.json'), JSON.stringify(report, null, 2));
  console.log('\n✅ Data integrity report saved to data-integrity-report.json');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Data integrity check failed:', err);
  process.exit(1);
});
