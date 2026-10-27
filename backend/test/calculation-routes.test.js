/**
 * Calculation Model & Routes Unit Tests
 * Verifies schema indexes, numeric boundaries, param validation order,
 * response shaping, upsert semantics (201 vs 200), and 11000 duplicate-key retry.
 */

'use strict';

const assert = require('assert');
const mongoose = require('mongoose');
const Calculation = require('../models/Calculation');
const calculationRouter = require('../routes/calculations');

console.log('🧪 Running Calculation Model & Routes Tests...');

// ─────────────────────────────────────────────────────────────
// 1. Schema Indexes & Bounds
// ─────────────────────────────────────────────────────────────
const indexes = Calculation.schema.indexes();

const recentIndex = indexes.find(
  ([fields]) => fields && fields.user_id === 1 && fields.created_at === -1
);
assert(recentIndex, 'Index { user_id: 1, created_at: -1 } should be defined on Calculation schema');

const uniqueClientIndex = indexes.find(
  ([fields, opts]) => fields && fields.user_id === 1 && fields.client_id === 1 && opts && opts.unique === true
);
assert(uniqueClientIndex, 'Unique compound index { user_id: 1, client_id: 1 } must be defined on Calculation schema');
console.log('  ✅ 1. Calculation indexes verified (recent query index & unique compound client_id index)');

// ─────────────────────────────────────────────────────────────
// 2. Numeric Bounds & Enum Validation
// ─────────────────────────────────────────────────────────────
const validCalc = new Calculation({
  user_id: new mongoose.Types.ObjectId(),
  client_id: 'client_123',
  expression: '25 * 4',
  result: '100',
  numeric_result: 100,
  angle_mode: 'DEG',
});
assert.strictEqual(validCalc.validateSync(), undefined, 'Valid calculation document should pass validation');

// Numeric result bounds (±1e15)
const outOfBoundsHigh = new Calculation({
  user_id: new mongoose.Types.ObjectId(),
  client_id: 'client_high',
  expression: '1e16',
  result: '1e16',
  numeric_result: 1e16,
});
const errHigh = outOfBoundsHigh.validateSync();
assert(errHigh && errHigh.errors && errHigh.errors.numeric_result, 'numeric_result > 1e15 should fail validation');

const outOfBoundsLow = new Calculation({
  user_id: new mongoose.Types.ObjectId(),
  client_id: 'client_low',
  expression: '-1e16',
  result: '-1e16',
  numeric_result: -1e16,
});
const errLow = outOfBoundsLow.validateSync();
assert(errLow && errLow.errors && errLow.errors.numeric_result, 'numeric_result < -1e15 should fail validation');

// Angle mode enum validation
const invalidAngleCalc = new Calculation({
  user_id: new mongoose.Types.ObjectId(),
  client_id: 'client_angle',
  expression: 'sin(30)',
  result: '0.5',
  numeric_result: 0.5,
  angle_mode: 'GRAD',
});
const errAngle = invalidAngleCalc.validateSync();
assert(errAngle && errAngle.errors && errAngle.errors.angle_mode, 'angle_mode must only be DEG or RAD');
console.log('  ✅ 2. Numeric bounds (±1e15) and enum validation verified');

// ─────────────────────────────────────────────────────────────
// 3. Response Shaping & Cache Headers
// ─────────────────────────────────────────────────────────────
// Mock express request & response helpers
function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let jsonBody = null;
  return {
    headers,
    set(key, val) {
      headers[key.toLowerCase()] = val;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonBody = data;
      return this;
    },
    getStatusCode: () => statusCode,
    getBody: () => jsonBody,
  };
}

// Test cache header middleware
const middlewareList = calculationRouter.stack;
const cacheMiddleware = middlewareList.find(
  (layer) => layer.handle && layer.handle.length === 3 && layer.route === undefined
);
assert(cacheMiddleware, 'Router should register top-level cache & auth middleware');

const testRes = createMockRes();
let nextCalled = false;
cacheMiddleware.handle({ method: 'GET', user: { id: 'test' } }, testRes, () => {
  nextCalled = true;
});
// Find the cache control middleware layer
const cacheHeaderLayer = middlewareList.filter((l) => !l.route)[1];
if (cacheHeaderLayer) {
  cacheHeaderLayer.handle({}, testRes, () => {});
}

assert(testRes.headers['cache-control']?.includes('no-store'), 'Must include Cache-Control: no-store');
assert.strictEqual(testRes.headers['pragma'], 'no-cache', 'Must include Pragma: no-cache');
assert.strictEqual(testRes.headers['expires'], '0', 'Must include Expires: 0');
console.log('  ✅ 3. Cache control, Pragma, and Expires headers verified');

// ─────────────────────────────────────────────────────────────
// 4. Parameter Validation vs Ownership Ordering (400 on malformed ID)
// ─────────────────────────────────────────────────────────────
const malformedReq = {
  method: 'GET',
  params: { userId: 'not-a-valid-id' },
  user: { id: new mongoose.Types.ObjectId().toString() },
};
const malformedRes = createMockRes();

// Find GET /:userId route
const getRouteLayer = middlewareList.find((l) => l.route && l.route.path === '/:userId' && l.route.methods.get);
assert(getRouteLayer, 'GET /:userId route must exist');

// Run the route stack for malformed ID
const routeStack = getRouteLayer.route.stack;
let finalStatus = null;
let finalBody = null;

async function executeRouteStack(stack, req, res) {
  // Normalize auth first (simulating router-level middleware)
  req.userId = req.user?.id || req.user?._id;
  for (const layer of stack) {
    let advanced = false;
    await new Promise((resolve) => {
      layer.handle(req, res, (err) => {
        if (err) throw err;
        advanced = true;
        resolve();
      });
      // If handler responded without calling next()
      if (res.getStatusCode() !== 200 || res.getBody() !== null) {
        resolve();
      }
    });
    if (!advanced) break;
  }
  return { status: res.getStatusCode(), body: res.getBody() };
}

(async () => {
  const result = await executeRouteStack(routeStack, malformedReq, malformedRes);
  assert.strictEqual(
    result.status,
    400,
    `Malformed userId should return 400 Bad Request, got ${result.status}`
  );
  assert.strictEqual(result.body?.error, 'Invalid user ID.');
  console.log('  ✅ 4. Param validation takes precedence over ownership (400 Invalid user ID)');

  // ───────────────────────────────────────────────────────────
  // 5. Ownership Mismatch Check (403 Forbidden)
  // ───────────────────────────────────────────────────────────
  const validId1 = new mongoose.Types.ObjectId().toString();
  const validId2 = new mongoose.Types.ObjectId().toString();
  const forbiddenReq = {
    method: 'GET',
    params: { userId: validId1 },
    user: { id: validId2 },
  };
  const forbiddenRes = createMockRes();
  const forbiddenResult = await executeRouteStack(routeStack, forbiddenReq, forbiddenRes);
  assert.strictEqual(forbiddenResult.status, 403, `User mismatch should return 403 Forbidden, got ${forbiddenResult.status}`);
  console.log('  ✅ 5. Ownership verification returns 403 for mismatched user');

  // ───────────────────────────────────────────────────────────
  // 6. Upsert Retry Logic on 11000 Duplicate Key
  // ───────────────────────────────────────────────────────────
  // Verify that on 11000, retry updates the record with new data instead of returning stale doc
  let retryCalled = false;
  let retryUpdateDoc = null;

  const originalFindOneAndUpdate = Calculation.findOneAndUpdate;
  try {
    // First call throws 11000 duplicate key error
    Calculation.findOneAndUpdate = async (filter, update, opts) => {
      if (!opts?.includeResultMetadata) {
        // This is the retry call!
        retryCalled = true;
        retryUpdateDoc = update;
        return {
          _id: new mongoose.Types.ObjectId(),
          user_id: filter.user_id,
          client_id: filter.client_id,
          ...update.$set,
        };
      }
      const err = new Error('E11000 duplicate key error collection');
      err.code = 11000;
      throw err;
    };

    const postRouteLayer = middlewareList.find((l) => l.route && l.route.path === '/' && l.route.methods.post);
    assert(postRouteLayer, 'POST / route must exist');

    const authUserId = new mongoose.Types.ObjectId().toString();
    const postReq = {
      method: 'POST',
      body: {
        client_id: 'client_race_1',
        expression: '10 + 20',
        result: '30',
        numeric_result: 30,
        angle_mode: 'DEG',
      },
      user: { id: authUserId },
    };
    const postRes = createMockRes();

    // Call POST handler directly (last layer in route stack)
    const postHandler = postRouteLayer.route.stack[postRouteLayer.route.stack.length - 1].handle;
    postReq.userId = authUserId;
    await postHandler(postReq, postRes);

    assert(retryCalled, 'On 11000 duplicate key error, findOneAndUpdate update retry must be executed');
    assert.strictEqual(retryUpdateDoc?.$set?.expression, '10 + 20', 'Retry must update expression to latest requested payload');
    assert.strictEqual(postRes.getStatusCode(), 200, 'Retry response must return status 200');
    assert.strictEqual(postRes.getBody()?.expression, '10 + 20', 'Response must return updated payload, not stale document');
    console.log('  ✅ 6. Duplicate key race retry updates document with fresh payload (last-write-wins)');
  } finally {
    Calculation.findOneAndUpdate = originalFindOneAndUpdate;
  }

  console.log('🎉 All Calculation Model & Routes tests passed successfully!');
})().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
