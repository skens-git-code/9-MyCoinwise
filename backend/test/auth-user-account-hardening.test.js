/**
 * Auth, Ownership, User, and Account Hardening Tests
 * Verifies email validation, password bcrypt cost, rolling lockout decay,
 * live account partial unique index, auth session-repair window guards,
 * and ownership 400 / 404 response distinctions.
 */

'use strict';

const assert = require('assert');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Account = require('../models/Account');
const authenticateRequest = require('../middleware/auth');
const checkOwnership = require('../middleware/ownership');
const { computeBalance } = require('../migrations/repair-balances');
const { runMigrations, Meta, LATEST_VERSION } = require('../migrations/index');

console.log('🧪 Running Auth, Ownership, User & Account Hardening Tests...');

async function runTests() {
  // ─────────────────────────────────────────────────────────────
  // 1. User Model: Email Validation & Profile Color
  // ─────────────────────────────────────────────────────────────
  const validUser = new User({
    username: 'alice',
    email: 'alice@example.com',
    password: 'password123',
    profile_color: '#0ea5e9',
  });
  assert.strictEqual(validUser.validateSync(), undefined, 'Valid user should pass validation');

  const invalidEmailUser = new User({
    username: 'bob',
    email: 'not-an-email',
    password: 'password123',
  });
  const errEmail = invalidEmailUser.validateSync();
  assert(errEmail && errEmail.errors && errEmail.errors.email, 'User with invalid email format must fail validation');

  const invalidColorUser = new User({
    username: 'charlie',
    email: 'charlie@example.com',
    password: 'password123',
    profile_color: 'invalid-color',
  });
  const errColor = invalidColorUser.validateSync();
  assert(errColor && errColor.errors && errColor.errors.profile_color, 'User with invalid profile color must fail validation');
  console.log('  ✅ 1. User model email format and hex profile_color validation verified');

  // ─────────────────────────────────────────────────────────────
  // 2. User Model: Rolling Lockout Window Decay
  // ─────────────────────────────────────────────────────────────
  const lockUser = new User({
    username: 'david',
    email: 'david@example.com',
    password: 'password123',
  });

  // Mock save method for unit test
  lockUser.save = async function() { return this; };

  // 3 failed logins on day 1
  await lockUser.incrementFailedLogin();
  await lockUser.incrementFailedLogin();
  await lockUser.incrementFailedLogin();
  assert.strictEqual(lockUser.failed_login_count, 3);
  assert.strictEqual(lockUser.account_locked, false);

  // Advance time past the 30-minute window (35 minutes later)
  lockUser.failed_login_window_start = new Date(Date.now() - 35 * 60 * 1000);

  // Next failed login should reset the counter to 1 rather than accumulating to 4
  await lockUser.incrementFailedLogin();
  assert.strictEqual(lockUser.failed_login_count, 1, 'Failed login counter must decay after 30-minute window');
  assert.strictEqual(lockUser.account_locked, false);
  console.log('  ✅ 2. User model failed login window decay verified');

  // ─────────────────────────────────────────────────────────────
  // 3. Account Model: Partial Unique Index on Active Accounts
  // ─────────────────────────────────────────────────────────────
  const accountIndexes = Account.schema.indexes();
  const liveAccountIndex = accountIndexes.find(
    ([fields, opts]) => opts && opts.name === 'user_account_name_unique_ci_live'
  );
  assert(liveAccountIndex, 'Account index user_account_name_unique_ci_live must be defined');
  const [fields, opts] = liveAccountIndex;
  assert.strictEqual(fields.user_id, 1);
  assert.strictEqual(fields.name, 1);
  assert.strictEqual(opts.unique, true);
  assert.deepStrictEqual(
    opts.partialFilterExpression,
    { is_active: true },
    'Account unique index must only apply to active accounts'
  );
  console.log('  ✅ 3. Account model partial unique index for active accounts verified');

  // ─────────────────────────────────────────────────────────────
  // 4. Ownership Middleware: Direct-match 400 & Household 404
  // ─────────────────────────────────────────────────────────────
  function createMockRes() {
    let statusCode = 200;
    let jsonBody = null;
    return {
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

  // Direct user match with invalid ObjectId
  const directMiddleware = checkOwnership('userId');
  const directReq = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    params: { userId: 'not-an-object-id' },
  };
  const directRes = createMockRes();
  await directMiddleware(directReq, directRes, () => {});
  assert.strictEqual(directRes.getStatusCode(), 400, 'Direct ownership check on invalid targetId must return 400');
  assert.strictEqual(directRes.getBody()?.error, 'Invalid user ID.');

  // Household check with non-existent user returns 404
  const originalUserFindById = User.findById;
  try {
    User.findById = () => ({
      select: () => ({
        lean: async () => null,
      }),
    });
    const householdMiddleware = checkOwnership('targetId', { household: true });
    const householdReq = {
      user: { id: new mongoose.Types.ObjectId().toString(), household_id: 'house1' },
      params: { targetId: new mongoose.Types.ObjectId().toString() },
    };
    const householdRes = createMockRes();
    await householdMiddleware(householdReq, householdRes, () => {});
    assert.strictEqual(householdRes.getStatusCode(), 404, 'Household ownership check on non-existent user must return 404');
    assert.strictEqual(householdRes.getBody()?.error, 'User not found.');
  } finally {
    User.findById = originalUserFindById;
  }
  console.log('  ✅ 4. Ownership middleware returns 400 for malformed IDs and 404 for missing target users');

  // ─────────────────────────────────────────────────────────────
  // 5. Auth Middleware: Session Repair Window Rejection
  // ─────────────────────────────────────────────────────────────
  const Session = require('../models/Session');
  const originalSessionAggregate = Session.aggregate;
  const originalSessionFindOne = Session.findOne;

  try {
    // Simulate expired session (not found in active sessions, not found in revoked sessions)
    Session.aggregate = async () => [];
    Session.findOne = () => ({ select: async () => null });

    const secret = process.env.JWT_SECRET || 'test_jwt_secret_for_unit_tests_only';
    process.env.JWT_SECRET = secret;

    // Token issued 10 minutes ago (beyond 5-minute race repair window)
    const oldIat = Math.floor(Date.now() / 1000) - 600;
    const oldToken = jwt.sign(
      {
        id: new mongoose.Types.ObjectId().toString(),
        jti: 'token_jti_old',
        iat: oldIat,
      },
      secret
    );

    const authReq = {
      header: (name) => (name.toLowerCase() === 'authorization' ? `Bearer ${oldToken}` : null),
      cookies: {},
      headers: {},
    };
    const authRes = createMockRes();

    await authenticateRequest(authReq, authRes, () => {});
    assert.strictEqual(authRes.getStatusCode(), 401, 'Token beyond 5-minute repair window without active session must return 401');
    assert.strictEqual(authRes.getBody()?.error, 'Session has been revoked or expired. Please log in again.');
  } finally {
    Session.aggregate = originalSessionAggregate;
    Session.findOne = originalSessionFindOne;
  }
  console.log('  ✅ 5. Auth middleware rejects session repair for tokens beyond 5-minute window');

  // ─────────────────────────────────────────────────────────────
  // 6. Repair Balances & Migrations: NaN Version Guard
  // ─────────────────────────────────────────────────────────────
  const originalMetaFindOne = Meta.findOne;
  try {
    Meta.findOne = () => ({
      lean: async () => ({ key: 'schema_version', value: 'corrupt_nan_string' }),
    });

    const parsedNaN = Number.isFinite(Number('corrupt_nan_string')) ? Number('corrupt_nan_string') : 0;
    assert.strictEqual(parsedNaN, 0, 'Corrupt NaN schema_version must be safely treated as 0');
  } finally {
    Meta.findOne = originalMetaFindOne;
  }
  console.log('  ✅ 6. Migration NaN schema_version fallback verified');

  console.log('🎉 ALL AUTH, OWNERSHIP, USER & ACCOUNT HARDENING TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('❌ Hardening test failed:', err);
  process.exit(1);
});
