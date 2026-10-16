/* —————————————————————————————————————
 * End-to-End Audit & Verification Script
 * Validates:
 * 1. User registration & credential storage
 * 2. Complete factory reset & data purge
 * 3. Prevention of old user login after reset (401 verification)
 * 4. Token invalidation after reset (401 verification)
 * 5. Optimized "Create Profile" flow with session token & instant switch
 * 6. Household cascading deletion on root reset
 * ————————————————————————————————————— */

const assert = require('assert');
const path = require('path');

const harness = require('../test/helpers/integrationHarness');

async function runAudit() {
  console.log('🧪 Starting Live End-to-End Database & Profile Audit');

  let h;
  try {
    h = await harness.start();
    const User = require('../models/User');
    const Account = require('../models/Account');
    const Transaction = require('../models/Transaction');
    const Goal = require('../models/Goal');
    const Session = require('../models/Session');

    // ── Test 1: Register User A ──
    console.log('[Test 1] Registering User A via live HTTP /api/auth/register...');
    const userAEmail = `audit_a_${Date.now()}@example.com`;
    const userAPassword = 'AuditPass123!';
    const regResA = await h.post('/api/auth/register', {
      username: `audita_${Date.now()}`,
      email: userAEmail,
      password: userAPassword,
      currency: 'USD',
    });

    assert.strictEqual(regResA.status, 201, `Register failed: ${JSON.stringify(regResA.body)}`);
    const tokenA = regResA.body.token;
    const userAId = regResA.body.user._id || regResA.body.user.id;
    assert.ok(tokenA, 'User A should receive a bearer token');
    console.log(`  ✅ Registered User A with ID: ${userAId}`);

    // Seed dummy financial records for User A
    const accountA = await Account.create({
      user_id: userAId,
      name: 'Primary Checking',
      type: 'checking',
      balance: 2500,
    });
    await Transaction.create({
      user_id: userAId,
      account_id: accountA._id,
      type: 'income',
      amount: 2500,
      category: 'Salary',
      date: new Date(),
    });
    await Goal.create({
      user_id: userAId,
      name: 'Emergency Fund',
      target: 5000,
      current: 2500,
    });
    console.log('  ✅ Seeded Account, Transaction, and Goal for User A');

    // ── Test 2: Factory Reset User A ──
    console.log('[Test 2] Factory Resetting User A via POST /api/users/:id/reset...');
    const resetRes = await h.post(`/api/users/${userAId}/reset`, {}, { token: tokenA });
    assert.strictEqual(resetRes.status, 200, `Reset failed: ${JSON.stringify(resetRes.body)}`);
    console.log(`  ✅ Reset response: ${resetRes.body.message}`);

    // ── Test 3: Verify User A records are completely purged ──
    console.log('[Test 3] Verifying records purged from database...');
    const checkUserA = await User.findById(userAId);
    const checkAccounts = await Account.find({ user_id: userAId });
    const checkTx = await Transaction.find({ user_id: userAId });
    const checkGoals = await Goal.find({ user_id: userAId });
    const checkSessions = await Session.find({ user_id: userAId });

    assert.strictEqual(checkUserA, null, 'User document must be deleted from DB after reset');
    assert.strictEqual(checkAccounts.length, 0, 'All accounts must be deleted');
    assert.strictEqual(checkTx.length, 0, 'All transactions must be deleted');
    assert.strictEqual(checkGoals.length, 0, 'All goals must be deleted');
    assert.strictEqual(checkSessions.length, 0, 'All sessions must be deleted');
    console.log('  ✅ Verified: User document and all associated financial records are purged.');

    // ── Test 4: Prevent Old User Login After Reset ──
    console.log('[Test 4] Attempting to log in with User A previous credentials...');
    const loginResA = await h.post('/api/auth/login', {
      email: userAEmail,
      password: userAPassword,
    });

    assert.strictEqual(loginResA.status, 401, `Old user was able to log in! Expected 401, got ${loginResA.status}`);
    console.log(`  ✅ PASS: Old credentials blocked with HTTP 401: ${loginResA.body.error}`);

    // ── Test 5: Verify Old Token is Invalidate ──
    console.log('[Test 5] Attempting to access /api/auth/me with old JWT token...');
    const meRes = await h.get('/api/auth/me', { token: tokenA });
    assert.strictEqual(meRes.status, 401, `Old token should be rejected with 401, got ${meRes.status}`);
    console.log(`  ✅ PASS: Old token rejected with HTTP 401: ${meRes.body.error}`);

    // ── Test 6: Create Household Root User B ──
    console.log('[Test 6] Registering User B (Household root)...');
    const userBEmail = `audit_b_${Date.now()}@example.com`;
    const userBPassword = 'AuditPass123!';
    const regResB = await h.post('/api/auth/register', {
      username: `auditb_${Date.now()}`,
      email: userBEmail,
      password: userBPassword,
      currency: 'USD',
    });
    assert.strictEqual(regResB.status, 201);
    const tokenB = regResB.body.token;
    const userBId = regResB.body.user._id || regResB.body.user.id;

    // ── Test 7: Optimized "Create Profile" Flow ──
    console.log('[Test 7] Creating Member Profile C via POST /api/users with custom details...');
    const memberCEmail = `member_c_${Date.now()}@example.com`;
    const memberCPassword = 'MemberPass123!';
    const createRes = await h.post(
      '/api/users',
      {
        name: 'Spouse Account',
        email: memberCEmail,
        password: memberCPassword,
        profession: 'Designer',
        profile_avatar: '💼',
        profile_color: '#3b82f6',
        currency: 'USD',
      },
      { token: tokenB }
    );

    assert.strictEqual(createRes.status, 201, `Create profile failed: ${JSON.stringify(createRes.body)}`);
    const { user: profileC, token: tokenC } = createRes.body;
    assert.ok(tokenC, 'Create profile must return a session token for instant profile switching');
    assert.strictEqual(profileC.username, 'Spouse Account');
    assert.strictEqual(profileC.profession, 'Designer');
    console.log(`  ✅ PASS: Profile C created with minted session token: ${profileC._id || profileC.id}`);

    // ── Test 8: Instant Profile Switch via Returned Token ──
    console.log('[Test 8] Accessing /api/auth/me using Profile C minted session token...');
    const meProfileC = await h.get('/api/auth/me', { token: tokenC });
    assert.strictEqual(meProfileC.status, 200, `Profile C token failed /me: ${JSON.stringify(meProfileC.body)}`);
    assert.strictEqual(meProfileC.body.email, memberCEmail);
    console.log('  ✅ PASS: Profile C is fully authenticated and active immediately.');

    // ── Test 9: Direct Login with Profile C Credentials ──
    console.log('[Test 9] Logging in directly with Profile C email and password...');
    const directLoginC = await h.post('/api/auth/login', {
      email: memberCEmail,
      password: memberCPassword,
    });
    assert.strictEqual(directLoginC.status, 200, `Direct login failed for Profile C: ${JSON.stringify(directLoginC.body)}`);
    console.log('  ✅ PASS: Direct login for Profile C succeeded.');

    // ── Test 10: Household Root Reset Cascades to Members ──
    console.log('[Test 10] Testing Root User B reset cascades to Member Profile C...');
    const resetRootRes = await h.post(`/api/users/${userBId}/reset`, {}, { token: tokenB });
    assert.strictEqual(resetRootRes.status, 200);

    const checkUserB = await User.findById(userBId);
    const checkUserC = await User.findById(profileC._id || profileC.id);
    assert.strictEqual(checkUserB, null, 'Root User B must be deleted');
    assert.strictEqual(checkUserC, null, 'Member Profile C must be cascade-deleted');

    const loginBAfter = await h.post('/api/auth/login', { email: userBEmail, password: userBPassword });
    const loginCAfter = await h.post('/api/auth/login', { email: memberCEmail, password: memberCPassword });
    assert.strictEqual(loginBAfter.status, 401, 'User B must not be able to log in after reset');
    assert.strictEqual(loginCAfter.status, 401, 'Profile C must not be able to log in after root reset');
    console.log('  ✅ PASS: Root reset cascaded cleanly, wiping all household members and preventing old logins.');

    console.log('\n==================================================================');
    console.log('🎉 AUDIT COMPLETED SUCCESSFULLY: ALL 10/10 INTEGRATION TESTS PASSED');
    console.log('==================================================================\n');
  } finally {
    await harness.stop().catch(() => {});
  }
}

runAudit().catch((err) => {
  console.error('\n❌ Audit test failed:', err);
  process.exit(1);
});
