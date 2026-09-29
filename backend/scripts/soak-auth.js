const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Session = require('../models/Session');

const API_BASE = 'http://localhost:5001/api';
const DURATION_MINUTES = parseFloat(process.env.SOAK_MINUTES || '15');
const DURATION_MS = DURATION_MINUTES * 60 * 1000;
const INTERVAL_MS = parseInt(process.env.SOAK_INTERVAL_MS || '1000', 10);

async function runSoak() {
  console.log(`🚀 Starting ${DURATION_MINUTES}-minute Auth Middleware Soak Test...`);
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email: 'bench_5k@mycoinwise.test' });
  if (!user) throw new Error('bench_5k user not found');
  const userId = String(user._id);

  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    { id: user._id, session_version: user.session_version || 0, jti: tokenId },
    process.env.JWT_SECRET,
    { expiresIn: '2h', algorithm: 'HS256' }
  );

  const session = await Session.create({
    user_id: user._id,
    token_id: tokenId,
    device: 'Stage 3.1.5 Soak Test',
    ip: '127.0.0.1',
    user_agent: 'Stage315Soak/1.0',
    is_active: true,
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const startTime = Date.now();
  const endTime = startTime + DURATION_MS;
  const latencies = [];
  const memorySnapshots = [];
  let requestCount = 0;
  let errorCount = 0;
  let lastReport = startTime;

  console.log(`Target: ${API_BASE}/transactions/${userId}?limit=50 every ${INTERVAL_MS}ms for ${DURATION_MINUTES} min`);

  while (Date.now() < endTime) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE}/transactions/${userId}?limit=50`, { headers });
      const duration = performance.now() - t0;
      if (res.status === 200) {
        latencies.push(duration);
      } else {
        errorCount++;
      }
    } catch (err) {
      errorCount++;
    }
    requestCount++;

    const now = Date.now();
    if (now - lastReport >= 60000 || now >= endTime) {
      const mem = process.memoryUsage();
      const snap = {
        elapsed_min: parseFloat(((now - startTime) / 60000).toFixed(2)),
        requests: requestCount,
        errors: errorCount,
        heap_used_mb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2)),
        heap_total_mb: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2)),
        rss_mb: parseFloat((mem.rss / 1024 / 1024).toFixed(2)),
      };
      memorySnapshots.push(snap);
      console.log(`[Minute ${Math.round((now - startTime) / 60000)}] Req: ${requestCount}, Err: ${errorCount}, Heap: ${snap.heap_used_mb}MB / ${snap.heap_total_mb}MB, RSS: ${snap.rss_mb}MB`);
      lastReport = now;
    }

    const wait = INTERVAL_MS - (performance.now() - t0);
    if (wait > 0 && Date.now() + wait < endTime) {
      await new Promise(r => setTimeout(r, wait));
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const avg = sorted.length ? sorted.reduce((sum, n) => sum + n, 0) / sorted.length : 0;

  const initialHeap = memorySnapshots[0]?.heap_used_mb || 0;
  const finalHeap = memorySnapshots[memorySnapshots.length - 1]?.heap_used_mb || 0;
  const heapDelta = parseFloat((finalHeap - initialHeap).toFixed(2));

  const soakResults = {
    stage: '3.1.5',
    type: 'auth_middleware_soak',
    duration_minutes: DURATION_MINUTES,
    total_requests: requestCount,
    failed_requests: errorCount,
    error_rate_pct: parseFloat(((errorCount / requestCount) * 100).toFixed(2)),
    latency_ms: {
      min: sorted[0] || 0,
      p50: parseFloat(p50.toFixed(2)),
      p95: parseFloat(p95.toFixed(2)),
      max: sorted[sorted.length - 1] || 0,
      avg: parseFloat(avg.toFixed(2)),
    },
    memory: {
      initial_heap_mb: initialHeap,
      final_heap_mb: finalHeap,
      heap_delta_mb: heapDelta,
      leak_detected: heapDelta > 30,
      snapshots: memorySnapshots,
    },
    status: errorCount === 0 && heapDelta < 30 ? 'PASSED' : 'FLAGGED',
  };

  const outputPath = path.join(__dirname, '../../soak-auth.json');
  fs.writeFileSync(outputPath, JSON.stringify(soakResults, null, 2));
  console.log(`\n✅ Soak test complete! Results saved to ${outputPath}`);
  console.log(`Summary: ${requestCount} reqs, ${errorCount} errs, p50=${p50.toFixed(1)}ms, p95=${p95.toFixed(1)}ms, Heap Delta: ${heapDelta}MB`);

  await Session.deleteOne({ _id: session._id });
  await mongoose.disconnect();
}

runSoak().catch(err => {
  console.error('Soak test error:', err);
  process.exit(1);
});
