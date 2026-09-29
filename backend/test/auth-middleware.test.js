const assert = require('assert');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Session = require('../models/Session');
const authenticateRequest = require('../middleware/auth');

function createMockReqRes(token) {
  const req = {
    header: (h) => (h === 'Authorization' && token ? `Bearer ${token}` : null),
    headers: {},
    cookies: {},
    ip: '127.0.0.1',
  };
  let statusCode = 200;
  let jsonBody = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      jsonBody = body;
      return res;
    },
  };
  return {
    req,
    res,
    getStatus: () => statusCode,
    getBody: () => jsonBody,
  };
}

async function runTests() {
  console.log('🧪 Running Auth Middleware Consolidation Tests (Stage 3.1.5)...');
  await mongoose.connect(process.env.MONGO_URI);

  const testEmail = `auth_test_${Date.now()}@example.com`;
  const testUsername = `authtest_${Date.now()}`;
  const user = await User.create({
    username: testUsername,
    email: testEmail,
    password: 'Password123!',
    session_version: 1,
  });

  const validJti = crypto.randomUUID();
  const validToken = jwt.sign(
    { id: user._id, session_version: 1, jti: validJti },
    process.env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );

  const activeSession = await Session.create({
    user_id: user._id,
    token_id: validJti,
    device: 'Unit Test Device',
    is_active: true,
  });

  // Test 1: Active session passes and attaches req.user / req.userId
  {
    const { req, res, getStatus, getBody } = createMockReqRes(validToken);
    let nextCalled = false;
    await authenticateRequest(req, res, () => { nextCalled = true; });

    assert.strictEqual(getStatus(), 200, 'Expected 200 status for active session');
    assert.strictEqual(nextCalled, true, 'Expected next() to be called');
    assert.strictEqual(req.userId, String(user._id), 'Expected req.userId to match user._id');
    assert.strictEqual(req.user.id, String(user._id), 'Expected req.user.id to match user._id');
    assert.strictEqual(req.user.session_id, String(activeSession._id), 'Expected req.user.session_id to match');
    assert.strictEqual(String(req.user.household_id), String(user._id), 'Expected req.user.household_id');
    console.log('  ✅ Test 1: Active session passes and attaches user & session metadata');
  }

  // Test 2: Expired tokens rejected
  {
    const expiredToken = jwt.sign(
      { id: user._id, session_version: 1, jti: crypto.randomUUID() },
      process.env.JWT_SECRET,
      { expiresIn: '-10s', algorithm: 'HS256' }
    );
    const { req, res, getStatus, getBody } = createMockReqRes(expiredToken);
    let nextCalled = false;
    await authenticateRequest(req, res, () => { nextCalled = true; });

    assert.strictEqual(getStatus(), 401, 'Expected 401 status for expired token');
    assert.strictEqual(nextCalled, false, 'next() should not be called');
    assert.strictEqual(getBody().error, 'Token is invalid or expired.');
    console.log('  ✅ Test 2: Expired token rejected with 401');
  }

  // Test 3: Wrong user / nonexistent user rejected
  {
    const fakeUserId = new mongoose.Types.ObjectId();
    const wrongUserToken = jwt.sign(
      { id: fakeUserId, session_version: 1, jti: crypto.randomUUID() },
      process.env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
    const { req, res, getStatus, getBody } = createMockReqRes(wrongUserToken);
    let nextCalled = false;
    await authenticateRequest(req, res, () => { nextCalled = true; });

    assert.strictEqual(getStatus(), 401, 'Expected 401 status for nonexistent user');
    assert.strictEqual(nextCalled, false, 'next() should not be called');
    assert.strictEqual(getBody().error, 'User associated with this token no longer exists.');
    console.log('  ✅ Test 3: Nonexistent user token rejected with 401');
  }

  // Test 4: Revoked session rejected
  {
    const revokedJti = crypto.randomUUID();
    await Session.create({
      user_id: user._id,
      token_id: revokedJti,
      is_active: false,
    });
    const revokedSessionToken = jwt.sign(
      { id: user._id, session_version: 1, jti: revokedJti },
      process.env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
    const { req, res, getStatus, getBody } = createMockReqRes(revokedSessionToken);
    let nextCalled = false;
    await authenticateRequest(req, res, () => { nextCalled = true; });

    assert.strictEqual(getStatus(), 401, 'Expected 401 status for revoked session');
    assert.strictEqual(nextCalled, false, 'next() should not be called');
    assert.strictEqual(getBody().error, 'This session has been revoked. Please log in again.');
    console.log('  ✅ Test 4: Revoked session rejected with 401');
  }

  // Test 5: Outdated session version rejected
  {
    const staleVersionToken = jwt.sign(
      { id: user._id, session_version: 0, jti: crypto.randomUUID() },
      process.env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
    const { req, res, getStatus, getBody } = createMockReqRes(staleVersionToken);
    let nextCalled = false;
    await authenticateRequest(req, res, () => { nextCalled = true; });

    assert.strictEqual(getStatus(), 401, 'Expected 401 status for outdated session version');
    assert.strictEqual(nextCalled, false, 'next() should not be called');
    assert.strictEqual(getBody().error, 'Session has been revoked or expired. Please log in again.');
    console.log('  ✅ Test 5: Outdated session version rejected with 401');
  }

  // Clean up test data
  await Session.deleteMany({ user_id: user._id });
  await User.deleteOne({ _id: user._id });
  await mongoose.disconnect();

  console.log('✅ ALL 5 AUTH MIDDLEWARE TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Auth middleware test failure:', err);
  process.exit(1);
});
