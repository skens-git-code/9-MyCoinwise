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

async function measure(email, txCount) {
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
    device: 'Stage 3.1.5 Benchmark',
    ip: '127.0.0.1',
    user_agent: 'Stage315Bench/1.0',
    is_active: true,
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 1 warmup run
  await fetch(`${API_BASE}/transactions/${userId}?limit=50`, { headers });

  const runs = [];
  let itemsCount = 0;
  let payloadBytes = 0;

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
    console.log(`  Run ${i}: ${duration.toFixed(2)} ms (status: ${res.status}, items: ${itemsCount})`);
  }

  const stats = calculatePercentiles(runs);
  console.log(`\nResults for ${email} (${txCount} tx):`);
  console.log(`  Items returned: ${itemsCount}`);
  console.log(`  Payload: ${(payloadBytes / 1024).toFixed(2)} KB`);
  console.log(`  HTTP Latency: min = ${stats.min}ms, p50 = ${stats.p50}ms, p95 = ${stats.p95}ms, avg = ${stats.avg}ms\n`);

  return {
    user_email: email,
    userId,
    txCount,
    items_returned: itemsCount,
    payload_kb: parseFloat((payloadBytes / 1024).toFixed(2)),
    latency_ms: stats,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  console.log('--- Measuring 5k user (bench_5k@mycoinwise.test) ---');
  const result5k = await measure('bench_5k@mycoinwise.test', 5000);

  console.log('--- Measuring 2k user (bench_2k@mycoinwise.test) ---');
  const result2k = await measure('bench_2k@mycoinwise.test', 2000);

  const output = {
    stage: '3.1.5',
    type: 'auth_middleware_baseline_before',
    timestamp: new Date().toISOString(),
    user_5k: result5k,
    user_2k: result2k,
  };

  const outputPath = path.join(__dirname, '../../metrics-stage3-1-5-auth-before.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ Saved baseline measurements to ${outputPath}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Measurement error:', err);
  process.exit(1);
});
