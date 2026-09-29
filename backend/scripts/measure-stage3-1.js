/**
 * Measure script for Sub-PR 3.1: Backend Cursor Pagination
 * Measures p50/p95 latency and response payload size for first page (50 items) on 2k and 5k users.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Session = require('../models/Session');

const API_BASE = 'http://localhost:5001/api';

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

async function measure(email, txCount, outputFile) {
  const user = await User.findOne({ email });
  if (!user) throw new Error(`User ${email} not found`);
  const userId = String(user._id);

  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    { id: user._id, session_version: user.session_version || 0, jti: tokenId },
    process.env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );

  await Session.create({
    user_id: user._id,
    token_id: tokenId,
    device: 'Benchmark Agent 3.1',
    ip: '127.0.0.1',
    user_agent: 'BenchmarkAgent/3.1',
    is_active: true,
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Warmup run
  await fetch(`${API_BASE}/transactions/${userId}?limit=50`, { headers });

  const runs = [];
  let payloadBytes = 0;
  let itemsCount = 0;

  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/transactions/${userId}?limit=50`, { headers });
    const text = await res.text();
    const duration = performance.now() - t0;
    if (res.status !== 200) {
      throw new Error(`Failed to fetch transactions: ${res.status} ${text}`);
    }
    const data = JSON.parse(text);
    payloadBytes = Buffer.byteLength(text, 'utf8');
    itemsCount = data.items?.length || 0;
    runs.push(parseFloat(duration.toFixed(2)));
  }

  const stats = calculatePercentiles(runs);
  console.log(`\nResults for ${email} (${txCount} tx):`);
  console.log(`  Items returned: ${itemsCount}`);
  console.log(`  Payload size: ${payloadBytes} bytes (${(payloadBytes / 1024).toFixed(2)} KB)`);
  console.log(`  Latency: p50 = ${stats.p50}ms, p95 = ${stats.p95}ms, avg = ${stats.avg}ms`);

  const result = {
    sub_pr: '3.1',
    user_email: email,
    userId,
    txCount,
    first_page_limit: 50,
    items_returned: itemsCount,
    payload_bytes: payloadBytes,
    payload_kb: parseFloat((payloadBytes / 1024).toFixed(2)),
    first_page_latency_ms: stats,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(__dirname, '../../', outputFile), JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  await measure('bench_2k@mycoinwise.test', 2000, 'metrics-stage3-1-2k.json');
  await measure('bench_5k@mycoinwise.test', 5000, 'metrics-stage3-1-5k.json');

  await mongoose.disconnect();
  console.log('\n✅ Successfully saved metrics-stage3-1-2k.json and metrics-stage3-1-5k.json');
}

main().catch(err => {
  console.error('Measurement failed:', err);
  process.exit(1);
});


