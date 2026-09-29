/**
 * Pagination Unit Test Suite (Sub-PR 3.1)
 *
 * Verifies cursor pagination requirements:
 * 1. First page returns 50 items + hasMore=true
 * 2. Second page (using nextCursor) returns next 50, no overlap
 * 3. Last page has hasMore=false, nextCursor=null
 * 4. Malformed cursor returns 400
 * 5. 5,000 transactions paginate in ~100 pages without error
 * 6. Explain executionStats uses compound index user_id_1_is_deleted_1_date_-1__id_-1
 */

const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const { encodeCursor, decodeCursor } = require('../routes/transactions');

const API_BASE = 'http://localhost:5001/api';

async function run() {
  console.log('🧪 Starting Cursor Pagination Tests (Sub-PR 3.1)...');

  await mongoose.connect(process.env.MONGO_URI);

  // Use seeded 5k user
  const user = await User.findOne({ email: 'bench_5k@mycoinwise.test' });
  assert(user, 'Test user bench_5k@mycoinwise.test must exist');
  const userId = String(user._id);

  // Generate test token
  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    { id: user._id, session_version: user.session_version || 0, jti: tokenId },
    process.env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );

  await Session.create({
    user_id: user._id,
    token_id: tokenId,
    device: 'Pagination Test Runner',
    ip: '127.0.0.1',
    user_agent: 'TestAgent/1.0',
    is_active: true,
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // ── Test 1: First page returns 50 items + hasMore=true ──
  console.log('  Testing 1: First page returns 50 items + hasMore=true...');
  const res1 = await fetch(`${API_BASE}/transactions/${userId}?total=true`, { headers });
  assert.strictEqual(res1.status, 200, `Expected 200, got ${res1.status}`);
  const page1 = await res1.json();
  assert(page1.items && Array.isArray(page1.items), 'page1.items must be an array');
  assert.strictEqual(page1.items.length, 50, `Expected 50 items, got ${page1.items.length}`);
  assert.strictEqual(page1.hasMore, true, 'page1.hasMore must be true');
  assert(typeof page1.nextCursor === 'string' && page1.nextCursor.length > 0, 'page1.nextCursor must be non-empty string');
  assert.strictEqual(page1.total, 5000, `Expected total=5000, got ${page1.total}`);
  console.log('  ✅ Test 1 Passed.');

  // ── Test 2: Second page returns next 50, no overlap ──
  console.log('  Testing 2: Second page (using nextCursor) returns next 50, no overlap...');
  const res2 = await fetch(`${API_BASE}/transactions/${userId}?cursor=${encodeURIComponent(page1.nextCursor)}`, { headers });
  assert.strictEqual(res2.status, 200, `Expected 200, got ${res2.status}`);
  const page2 = await res2.json();
  assert.strictEqual(page2.items.length, 50, `Expected 50 items, got ${page2.items.length}`);
  assert.strictEqual(page2.hasMore, true, 'page2.hasMore must be true');

  const page1Ids = new Set(page1.items.map(t => String(t._id || t.id)));
  const page2Ids = new Set(page2.items.map(t => String(t._id || t.id)));
  for (const id of page2Ids) {
    assert(!page1Ids.has(id), `Duplicate ID found across page 1 and page 2: ${id}`);
  }
  console.log('  ✅ Test 2 Passed: 0 overlap between page 1 and page 2.');

  // ── Test 3: Last page has hasMore=false, nextCursor=null ──
  console.log('  Testing 3: Last page has hasMore=false, nextCursor=null...');
  // Query 2k user with limit 200 until last page
  const user2k = await User.findOne({ email: 'bench_2k@mycoinwise.test' });
  const user2kId = String(user2k._id);
  const token2k = jwt.sign(
    { id: user2k._id, session_version: user2k.session_version || 0, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
  const headers2k = { Authorization: `Bearer ${token2k}`, 'Content-Type': 'application/json' };

  let currentCursor = null;
  let lastPageData = null;
  let iterations = 0;
  while (iterations < 15) {
    const url = currentCursor
      ? `${API_BASE}/transactions/${user2kId}?limit=200&cursor=${encodeURIComponent(currentCursor)}`
      : `${API_BASE}/transactions/${user2kId}?limit=200`;
    const res = await fetch(url, { headers: headers2k });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    lastPageData = data;
    if (!data.hasMore) break;
    currentCursor = data.nextCursor;
    iterations++;
  }
  assert(lastPageData, 'Must have received last page');
  assert.strictEqual(lastPageData.hasMore, false, 'Last page hasMore must be false');
  assert.strictEqual(lastPageData.nextCursor, null, 'Last page nextCursor must be null');
  console.log(`  ✅ Test 3 Passed: Reached last page in ${iterations + 1} requests, hasMore=false, nextCursor=null.`);

  // ── Test 4: Malformed cursor returns 400 ──
  console.log('  Testing 4: Malformed cursor returns 400...');
  const badCursors = [
    'invalid-base-64!@#$',
    Buffer.from('not-json').toString('base64'),
    Buffer.from(JSON.stringify({ date: 'invalid-date', _id: 'not-an-id' })).toString('base64'),
    Buffer.from(JSON.stringify({ date: new Date().toISOString(), _id: '123' })).toString('base64'),
  ];
  for (const bad of badCursors) {
    const resBad = await fetch(`${API_BASE}/transactions/${userId}?cursor=${encodeURIComponent(bad)}`, { headers });
    assert.strictEqual(resBad.status, 400, `Expected 400 for cursor '${bad}', got ${resBad.status}`);
    const dataBad = await resBad.json();
    assert(dataBad.error, 'Expected error message in response');
  }
  console.log('  ✅ Test 4 Passed: Malformed cursors correctly return 400.');

  // ── Test 5: 5,000 transactions paginate in ~100 pages without error ──
  console.log('  Testing 5: 5,000 transactions paginate in ~100 pages without error...');
  let pCursor = null;
  let totalFetched = 0;
  let pageCount = 0;
  const seenIds = new Set();

  while (pageCount < 120) {
    const pUrl = pCursor
      ? `${API_BASE}/transactions/${userId}?limit=50&cursor=${encodeURIComponent(pCursor)}`
      : `${API_BASE}/transactions/${userId}?limit=50`;
    const pRes = await fetch(pUrl, { headers });
    assert.strictEqual(pRes.status, 200, `Page ${pageCount + 1} fetch failed with ${pRes.status}`);
    const pData = await pRes.json();
    pageCount++;
    totalFetched += pData.items.length;

    for (const item of pData.items) {
      const id = String(item._id || item.id);
      assert(!seenIds.has(id), `Duplicate transaction detected at page ${pageCount}: ${id}`);
      seenIds.add(id);
    }

    if (!pData.hasMore) {
      assert.strictEqual(pData.nextCursor, null);
      break;
    }
    pCursor = pData.nextCursor;
  }
  assert.strictEqual(totalFetched, 5000, `Expected 5000 transactions paginated, got ${totalFetched}`);
  assert.strictEqual(pageCount, 100, `Expected exactly 100 pages for 5000 transactions with limit 50, got ${pageCount}`);
  console.log(`  ✅ Test 5 Passed: Successfully paginated all 5,000 transactions across ${pageCount} pages with 0 duplicates.`);

  // ── Test 6: Backward compatibility ?legacy=true returns raw array ──
  console.log('  Testing 6: Backward compatibility ?legacy=true returns raw array...');
  const resLegacy = await fetch(`${API_BASE}/transactions/${userId}?legacy=true&limit=10`, { headers });
  assert.strictEqual(resLegacy.status, 200);
  const legacyData = await resLegacy.json();
  assert(Array.isArray(legacyData), 'Legacy response must be a plain array');
  assert.strictEqual(legacyData.length, 10);
  console.log('  ✅ Test 6 Passed: ?legacy=true returns raw JSON array.');

  // ── Test 7: Verify with explain('executionStats') uses compound index ──
  console.log('  Testing 7: Verify explain executionStats uses compound index...');
  const explain = await Transaction.find({
    user_id: user._id,
    is_deleted: false,
  })
    .sort({ date: -1, _id: -1 })
    .limit(50)
    .explain('executionStats');

  const winStage = explain.queryPlanner.winningPlan;
  const ixScan = winStage.inputStage?.inputStage?.inputStage || winStage.inputStage?.inputStage || winStage.inputStage;
  const indexUsed = ixScan.indexName;
  console.log(`    Index used: ${indexUsed}`);
  console.log(`    Total docs examined: ${explain.executionStats.totalDocsExamined}`);
  console.log(`    Total keys examined: ${explain.executionStats.totalKeysExamined}`);
  assert(
    indexUsed === 'user_id_1_is_deleted_1_date_-1__id_-1' || indexUsed === 'user_id_1_date_-1__id_-1',
    `Unexpected index: ${indexUsed}`
  );
  assert.strictEqual(explain.executionStats.totalDocsExamined, 50, 'Must examine exactly 50 docs for limit 50');
  console.log('  ✅ Test 7 Passed: Compound index verified in winning query plan.');

  console.log('\n🎉 ALL 7 PAGINATION TESTS PASSED CLEANLY!\n');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Pagination test failed:', err);
  process.exit(1);
});
