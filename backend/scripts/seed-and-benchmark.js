/**
 * Benchmark script for Stage 3 (Pagination, Incremental Balance, Summary Aggregation)
 * Seeds 2k and 5k transaction users, measures latency, payload size, TTI, bulk delete, and single add.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const Account = require('../models/Account');
const Goal = require('../models/Goal');
const Subscription = require('../models/Subscription');
const Event = require('../models/Event');
const Budget = require('../models/Budget');

const API_BASE = 'http://localhost:5001/api';

async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
    });
  }
}

async function getOrCreateTestUser(username, email, txCount) {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      username,
      email,
      password: 'TestPassword123!',
      currency: 'USD',
      balance: 0,
    });
  }

  // Ensure an account exists
  let account = await Account.findOne({ user_id: user._id });
  if (!account) {
    account = await Account.create({
      user_id: user._id,
      name: 'Primary Checking',
      type: 'checking',
      currency: 'USD',
      initial_balance: 10000,
      current_balance: 10000,
    });
  }

  // Check current non-deleted transaction count
  const currentCount = await Transaction.countDocuments({
    user_id: user._id,
    is_deleted: { $ne: true },
  });

  if (currentCount < txCount) {
    console.log(`Seeding user ${email}: current=${currentCount}, target=${txCount}...`);
    const needed = txCount - currentCount;
    const batchSize = 1000;
    const categories = ['Food', 'Transport', 'Utilities', 'Shopping', 'Salary', 'Entertainment', 'Health', 'Investments'];
    
    let remaining = needed;
    while (remaining > 0) {
      const thisBatch = Math.min(remaining, batchSize);
      const docs = [];
      const now = Date.now();
      for (let i = 0; i < thisBatch; i++) {
        const offsetMs = (needed - remaining + i) * 3600000; // 1 hour intervals
        const isIncome = i % 5 === 0;
        docs.push({
          user_id: user._id,
          account_id: account._id,
          type: isIncome ? 'income' : 'expense',
          category: categories[i % categories.length],
          amount: parseFloat((Math.random() * 100 + 5).toFixed(2)),
          currency: 'USD',
          date: new Date(now - offsetMs),
          note: `Transaction ${i + 1} for ${username}`,
          is_deleted: false,
        });
      }
      await Transaction.insertMany(docs, { ordered: false });
      remaining -= thisBatch;
      console.log(`  Inserted batch of ${thisBatch}, remaining: ${remaining}`);
    }
  }

  // Create JWT token and session
  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    { id: user._id, session_version: user.session_version || 0, jti: tokenId },
    process.env.JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  );

  await Session.create({
    user_id: user._id,
    token_id: tokenId,
    device: 'Benchmark Agent',
    ip: '127.0.0.1',
    user_agent: 'BenchmarkAgent/1.0',
    is_active: true,
  });

  return { user, token, accountId: account._id };
}

function calculatePercentiles(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const avg = sorted.reduce((sum, n) => sum + n, 0) / sorted.length;
  return {
    min: sorted[0],
    p50,
    p95,
    max: sorted[sorted.length - 1],
    avg: parseFloat(avg.toFixed(2)),
    all: sorted,
  };
}

async function measureUser(userData, label, txCount) {
  const { user, token, accountId } = userData;
  const userId = String(user._id);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  console.log(`\n========================================`);
  console.log(`Benchmarking ${label} (${txCount} transactions)`);
  console.log(`========================================`);

  // 1. GET /api/transactions/:userId (10 runs)
  const getRuns = [];
  let payloadBytes = 0;
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/transactions/${userId}`, { headers });
    const text = await res.text();
    const duration = performance.now() - t0;
    if (res.status !== 200) {
      throw new Error(`GET /transactions/${userId} failed: ${res.status} - ${text}`);
    }
    payloadBytes = Buffer.byteLength(text, 'utf8');
    getRuns.push(parseFloat(duration.toFixed(2)));
  }
  const getStats = calculatePercentiles(getRuns);
  console.log(`GET /transactions/:userId: p50=${getStats.p50}ms, p95=${getStats.p95}ms, payload=${payloadBytes} bytes`);

  // 2. Dashboard load: total API calls, total bytes, TTI
  // Dashboard calls /auth/me, then parallel 7 calls
  const dashRuns = [];
  let dashTotalBytes = 0;
  for (let i = 0; i < 3; i++) {
    let bytesThisRun = 0;
    const t0 = performance.now();

    const meRes = await fetch(`${API_BASE}/auth/me`, { headers });
    const meText = await meRes.text();
    bytesThisRun += Buffer.byteLength(meText, 'utf8');

    const parallelCalls = [
      `${API_BASE}/transactions/${userId}`,
      `${API_BASE}/goals/${userId}`,
      `${API_BASE}/subscriptions/${userId}`,
      `${API_BASE}/events/${userId}`,
      `${API_BASE}/budgets/${userId}`,
      `${API_BASE}/accounts/${userId}`,
      `${API_BASE}/users`,
    ];

    const results = await Promise.all(
      parallelCalls.map(async (url) => {
        const res = await fetch(url, { headers });
        const text = await res.text();
        return Buffer.byteLength(text, 'utf8');
      })
    );

    bytesThisRun += results.reduce((sum, b) => sum + b, 0);
    const duration = performance.now() - t0;
    dashRuns.push(parseFloat(duration.toFixed(2)));
    dashTotalBytes = bytesThisRun;
  }
  const dashStats = calculatePercentiles(dashRuns);
  console.log(`Dashboard load: TTI(p50)=${dashStats.p50}ms, TTI(p95)=${dashStats.p95}ms, calls=8, bytes=${dashTotalBytes}`);

  // 3. POST single transaction: total time (average of 3 runs)
  const postRuns = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'expense',
        category: 'Food',
        amount: 25.50,
        currency: 'USD',
        date: new Date().toISOString(),
        note: `Benchmark single post ${i}`,
        account_id: accountId,
      }),
    });
    const text = await res.text();
    const duration = performance.now() - t0;
    if (res.status !== 201) {
      throw new Error(`POST /transactions failed: ${res.status} - ${text}`);
    }
    postRuns.push(parseFloat(duration.toFixed(2)));
  }
  const postStats = calculatePercentiles(postRuns);
  console.log(`POST single transaction: p50=${postStats.p50}ms, p95=${postStats.p95}ms`);

  // 4. Bulk delete 100 transactions: total time
  // Fetch 100 existing transaction IDs to soft-delete
  const sampleRes = await fetch(`${API_BASE}/transactions/${userId}?limit=100`, { headers });
  const sampleData = await sampleRes.json();
  const sampleList = Array.isArray(sampleData) ? sampleData : (sampleData.items || []);
  const idsToDelete = sampleList.slice(0, 100).map(t => t._id || t.id);

  let bulkDeleteTime = 0;
  if (idsToDelete.length >= 100) {
    const t0 = performance.now();
    const delRes = await fetch(`${API_BASE}/transactions/bulk-delete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: idsToDelete }),
    });
    const delText = await delRes.text();
    bulkDeleteTime = parseFloat((performance.now() - t0).toFixed(2));
    if (delRes.status !== 200) {
      throw new Error(`POST /transactions/bulk-delete failed: ${delRes.status} - ${delText}`);
    }
    console.log(`Bulk delete 100 transactions: ${bulkDeleteTime}ms`);

    // Restore them back to is_deleted: false so dataset stays exact
    await Transaction.updateMany({ _id: { $in: idsToDelete } }, { $set: { is_deleted: false } });
  } else {
    console.warn(`Could not get 100 transactions for bulk delete test, found ${idsToDelete.length}`);
  }

  return {
    userId,
    txCount,
    transactions_get_latency_ms: getStats,
    transactions_payload_bytes: payloadBytes,
    dashboard_load: {
      total_api_calls: 8,
      total_bytes: dashTotalBytes,
      tti_ms: dashStats,
    },
    post_single_transaction_ms: postStats,
    bulk_delete_100_ms: bulkDeleteTime,
  };
}

async function main() {
  await connectDB();

  const userA = await getOrCreateTestUser('User2K_Benchmark', 'bench_2k@mycoinwise.test', 2000);
  const userB = await getOrCreateTestUser('User5K_Benchmark', 'bench_5k@mycoinwise.test', 5000);

  const metrics2k = await measureUser(userA, 'User A (2k)', 2000);
  const metrics5k = await measureUser(userB, 'User B (5k)', 5000);

  fs.writeFileSync(
    path.join(__dirname, '../../baseline-stage3-2k.json'),
    JSON.stringify(metrics2k, null, 2)
  );
  fs.writeFileSync(
    path.join(__dirname, '../../baseline-stage3-5k.json'),
    JSON.stringify(metrics5k, null, 2)
  );

  console.log('\n✅ Saved baseline-stage3-2k.json and baseline-stage3-5k.json successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
