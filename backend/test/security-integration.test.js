/**
 * Security integration tests — live HTTP against the real server.
 *
 * These prove the security fixes from the audit and would FAIL if the fix were
 * reverted. Unlike `request-sanitize.test.js` (pure unit), every test here goes
 * through the full mounted middleware stack and real database documents.
 *
 * Requires a reachable MongoDB; skips cleanly (exit 0) without one, matching the
 * convention in `auth-middleware.test.js`.
 *
 * Run standalone:
 *   node backend/test/security-integration.test.js
 * Run with the query sanitization probe (needs the opt-in echo route):
 *   HARNESS_DIAGNOSTIC_ECHO=true node backend/test/security-integration.test.js
 *
 * NOTE: the harness boots the server with NODE_ENV=test, and the app deliberately
 * RELAXES rate limits outside production (e.g. authLimiter 1000 vs 10). Rate
 * limiting therefore cannot be exercised type-2 here; see the RATE-LIMIT section
 * at the bottom for what is asserted instead and what remains UNVERIFIED.
 */

const assert = require('assert');

let passed = 0;
let failed = 0;
const failures = [];

/**
 * Run one named async test.
 *
 * @param {string} name Test name.
 * @param {() => Promise<void>} fn Test body.
 */
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, message: err.message });
    console.error(`  ❌ ${name}\n     ${err.message}`);
  }
}

/** @returns {Promise<boolean>} True when MongoDB is reachable. */
async function mongoReachable() {
  try {
    const { config } = require('../config/env');
    const mongoose = require('mongoose');
    await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 4000 });
    await mongoose.disconnect();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await mongoReachable())) {
    console.log('⚠️  MongoDB unreachable — skipping security integration tests (exit 0).');
    process.exit(0);
  }

  const harness = require('./helpers/integrationHarness');
  console.log('🧪 Security Integration Tests (live HTTP)');

  let h;
  try {
    h = await harness.start();

    // ── P1-03: NoSQL sanitization, live through the mounted middleware ───────
    // The harness passes ENABLE_DIAGNOSTIC_ECHO through to the child server.
    // HARNESS_DIAGNOSTIC_ECHO is kept as an alias for running the file directly.
    if (process.env.ENABLE_DIAGNOSTIC_ECHO === 'true' || process.env.HARNESS_DIAGNOSTIC_ECHO === 'true') {
      await test('P1-03 live: bare $where is stripped before the handler sees it', async () => {
        const res = await h.get('/api/__diagnostic/echo-query?name=ok&%24where=' + encodeURIComponent('sleep(1)'));
        assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
        assert.strictEqual(res.body.query.$where, undefined, '$where must be stripped');
        assert.strictEqual(res.body.query.name, 'ok', 'legitimate params must survive');
      });

      await test('P1-03 live: $ne operator keys are stripped', async () => {
        const res = await h.get('/api/__diagnostic/echo-query?%24ne=1&keep=yes');
        assert.strictEqual(res.body.query.$ne, undefined, '$ne must be stripped');
        assert.strictEqual(res.body.query.keep, 'yes');
      });

      await test('P1-03 live: bracket notation stays a literal key, not an operator object', async () => {
        const res = await h.get('/api/__diagnostic/echo-query?amount%5B%24gt%5D=0');
        // Express 5's parser yields the flat literal string key "amount[$gt]";
        // it must NOT become { amount: { $gt: 0 } }.
        assert.strictEqual(typeof res.body.query['amount[$gt]'], 'string');
        assert.strictEqual(res.body.query.amount, undefined, 'must not nest into an operator object');
      });
    }

    await test('P1-03 live: injection attempts do not 500 and are logged with a request id', async () => {
      const res = await h.get('/api/transactions/%24where');
      assert.ok([400, 401, 403, 404].includes(res.status), `expected a 4xx, got ${res.status}`);
      assert.ok(res.headers['x-request-id'], 'response must carry X-Request-ID');
    });

    // ── P5-14: JWT claims cannot shadow server-derived values ────────────────
    await test('P5-14: forged household_id claim does not override the server-resolved household', async () => {
      // Two unrelated households.
      const userA = await h.createUser();
      const outsider = await h.createUser();

      // Forge a token for A that CLAIMS to be in the outsider's household.
      const forged = await h.tokenFor(userA.id, { household_id: outsider.householdId });

      // Switching to the outsider must still be refused: a household-scoped check
      // that trusted the claim would allow it.
      const res = await h.post(`/api/users/${outsider.id}/switch`, { password: outsider.password }, { token: forged });
      assert.strictEqual(
        res.status, 403,
        `forged household claim must not grant cross-household access (got ${res.status})`
      );
    });

    // ── P5-11: switch requires the target's password ─────────────────────────
    await test('P5-11: switching to another user without a password is rejected', async () => {
      const owner = await h.createUser();
      const member = await h.createUser({ householdId: owner.id });

      const res = await h.post(`/api/users/${member.id}/switch`, {}, { token: owner.token });
      assert.ok(
        [400, 401].includes(res.status),
        `expected 400/401 when no password is supplied, got ${res.status}`
      );
      assert.ok(!res.body.token, 'no token may be issued');
    });

    await test('P5-11: switching to another user with a WRONG password is rejected', async () => {
      const owner = await h.createUser();
      const member = await h.createUser({ householdId: owner.id });

      const res = await h.post(`/api/users/${member.id}/switch`, { password: 'DefinitelyWrong123!' }, { token: owner.token });
      assert.ok([400, 401].includes(res.status), `expected 400/401, got ${res.status}`);
      assert.ok(!res.body.token, 'no token may be issued');
    });

    await test('P5-11: switching to another user with the CORRECT password succeeds', async () => {
      const owner = await h.createUser();
      const member = await h.createUser({ householdId: owner.id });

      const res = await h.post(`/api/users/${member.id}/switch`, { password: member.password }, { token: owner.token });
      assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${res.raw}`);
      assert.ok(res.body.token, 'a token must be issued for a valid switch');
      assert.strictEqual(String(res.body.user.id), member.id, 'the switched user must be the target');
    });

    await test('P5-11: self-switch (Revert) still works WITHOUT a password', async () => {
      const user = await h.createUser();
      const res = await h.post(`/api/users/${user.id}/switch`, {}, { token: user.token });
      assert.strictEqual(res.status, 200, `self-switch must not require a password, got ${res.status}: ${res.raw}`);
      assert.ok(res.body.token, 'a token must be issued');
    });

    // ── P5-12: delete is strictly self-scoped ───────────────────────────────
    await test('P5-12: a user cannot delete another unrelated user', async () => {
      const victim = await h.createUser();
      const attacker = await h.createUser();

      const res = await h.del(`/api/users/${victim.id}`, { token: attacker.token });
      assert.ok([403, 404].includes(res.status), `expected 403/404, got ${res.status}`);

      const stillThere = await h.User.findById(victim.id).lean();
      assert.ok(stillThere, 'the victim account must still exist');
    });

    await test('P5-12: a household member cannot delete the household ROOT account', async () => {
      const root = await h.createUser();
      const member = await h.createUser({ householdId: root.id });

      const res = await h.del(`/api/users/${root.id}`, { token: member.token });
      assert.ok([403, 404].includes(res.status), `member must not delete the root, got ${res.status}`);

      const stillThere = await h.User.findById(root.id).lean();
      assert.ok(stillThere, 'the root account must still exist');
    });

    await test('P5-12: a user CAN delete their own account', async () => {
      const self = await h.createUser();
      const res = await h.del(`/api/users/${self.id}`, { token: self.token });
      assert.strictEqual(res.status, 200, `self-delete must succeed, got ${res.status}: ${res.raw}`);

      const gone = await h.User.findById(self.id).lean();
      assert.strictEqual(gone, null, 'the account must be removed');
    });

    // ── P5-13: cross-tenant Account writes ──────────────────────────────────
    await test('P5-13: a transaction cannot reference another user\'s account', async () => {
      const victim = await h.createUser();
      const attacker = await h.createUser();

      const Account = require('../models/Account');
      const victimAccount = await Account.create({
        user_id: victim.id,
        name: 'Victim account',
        type: 'bank',
        initial_balance: 1000,
        current_balance: 1000,
        currency: 'USD',
      });

      // Attempt to create a transaction against the victim's account.
      const res = await h.post('/api/transactions', {
        type: 'income',
        category: 'Salary',
        amount: 999999,
        date: new Date().toISOString(),
        account_id: String(victimAccount._id),
      }, { token: attacker.token });

      assert.ok([400, 403, 404].includes(res.status), `cross-tenant account must be rejected, got ${res.status}: ${res.raw}`);

      const after = await Account.findById(victimAccount._id).lean();
      assert.strictEqual(after.current_balance, 1000, 'victim balance must be unchanged');
    });

    await test('P5-13: bulk-delete cannot touch another user\'s transactions or balances', async () => {
      const victim = await h.createUser();
      const attacker = await h.createUser();

      const Account = require('../models/Account');
      const Transaction = require('../models/Transaction');

      const victimAccount = await Account.create({
        user_id: victim.id,
        name: 'Victim account',
        type: 'bank',
        initial_balance: 500,
        current_balance: 500,
        currency: 'USD',
      });
      const victimTx = await Transaction.create({
        user_id: victim.id,
        type: 'income',
        category: 'Salary',
        amount: 500,
        date: new Date(),
        account_id: victimAccount._id,
      });

      const res = await h.post('/api/transactions/bulk-delete', { ids: [String(victimTx._id)] }, { token: attacker.token });
      assert.ok([200, 400, 404].includes(res.status), `unexpected status ${res.status}`);

      const txAfter = await Transaction.findById(victimTx._id).lean();
      assert.notStrictEqual(txAfter.is_deleted, true, 'victim transaction must NOT be soft-deleted');
    });

    // ── P3-06: TaxTag is scoped by user ─────────────────────────────────────
    await test('P3-06: tagging a foreign transaction is rejected', async () => {
      const victim = await h.createUser();
      const attacker = await h.createUser();

      const Account = require('../models/Account');
      const Transaction = require('../models/Transaction');
      const TaxProfile = require('../models/TaxProfile');

      const victimAccount = await Account.create({
        user_id: victim.id, name: 'V', type: 'bank', initial_balance: 0, current_balance: 0, currency: 'USD',
      });
      const victimTx = await Transaction.create({
        user_id: victim.id, type: 'expense', category: 'Medical', amount: 100,
        date: new Date(), account_id: victimAccount._id,
      });
      await TaxProfile.create({
        user_id: attacker.id,
        name: 'Harness profile',
        jurisdiction: 'US',
        filing_status: 'single',
        fiscal_year: new Date().getFullYear(),
        currency: 'USD',
      });

      const res = await h.post('/api/tax/tag', {
        transaction_id: String(victimTx._id),
        treatment: 'deductible',
      }, { token: attacker.token });

      assert.ok(res.status >= 400, `tagging a foreign transaction must fail, got ${res.status}: ${res.raw}`);
    });

    // ── P3-05: enum validation returns 400, not 500 ─────────────────────────
    await test('P3-05: invalid payment_method returns 400 (not 500)', async () => {
      const user = await h.createUser();
      const res = await h.post('/api/transactions', {
        type: 'expense',
        category: 'Food',
        amount: 10,
        date: new Date().toISOString(),
        payment_method: 'cryptocurrency',
      }, { token: user.token });

      assert.strictEqual(res.status, 400, `expected 400, got ${res.status}: ${res.raw}`);
    });

    await test('P3-05: invalid recurrence_interval returns 400 (not 500)', async () => {
      const user = await h.createUser();
      const res = await h.post('/api/transactions', {
        type: 'expense',
        category: 'Food',
        amount: 10,
        date: new Date().toISOString(),
        recurrence_interval: 'hourly',
      }, { token: user.token });

      assert.strictEqual(res.status, 400, `expected 400, got ${res.status}: ${res.raw}`);
    });

    // ── P3-01: every Event.type value is accepted by the route AND the model ─
    const EVENT_TYPES = ['bill', 'income', 'expense', 'reminder', 'payment', 'meeting', 'other', 'general'];
    for (const type of EVENT_TYPES) {
      await test(`P3-01: POST /api/events accepts type="${type}"`, async () => {
        const user = await h.createUser();
        const res = await h.post('/api/events', {
          title: `Harness ${type}`,
          date: new Date().toISOString(),
          type,
        }, { token: user.token });

        assert.ok(
          [200, 201].includes(res.status),
          `type "${type}" must be accepted (route+model must agree), got ${res.status}: ${res.raw}`
        );
      });
    }

    await test('P3-01: PUT /api/events accepts a changed type (expense)', async () => {
      const user = await h.createUser();
      const created = await h.post('/api/events', {
        title: 'Harness put', date: new Date().toISOString(), type: 'bill',
      }, { token: user.token });
      assert.ok([200, 201].includes(created.status), `setup failed: ${created.raw}`);

      const eventId = created.body.event?.id || created.body.event?._id || created.body.id;
      assert.ok(eventId, `could not read created event id from ${created.raw}`);

      const res = await h.put(`/api/events/${eventId}`, { type: 'expense' }, { token: user.token });
      assert.ok([200, 201].includes(res.status), `PUT with type=expense must succeed, got ${res.status}: ${res.raw}`);
    });

    // ── P3-02: wealth sale fields persist on PUT ────────────────────────────
    await test('P3-02: PUT /api/wealth/items/:id persists sold_at, sale_price, sale_fees', async () => {
      const user = await h.createUser();

      const created = await h.post('/api/wealth/items', {
        name: 'Harness stock',
        asset_class: 'liquid_asset',
        base_value: 1000,
      }, { token: user.token });
      assert.ok([200, 201].includes(created.status), `setup failed: ${created.raw}`);

      // POST /api/wealth/items returns the created item document itself.
      const itemId = created.body.item?.id
        || created.body.item?._id
        || created.body._id
        || created.body.id;
      assert.ok(itemId, `could not read created item id from ${created.raw}`);

      const soldAt = new Date('2026-03-15T00:00:00.000Z').toISOString();
      const putRes = await h.put(`/api/wealth/items/${itemId}`, {
        sold_at: soldAt,
        sale_price: 1500,
        sale_fees: 25,
      }, { token: user.token });
      assert.ok([200, 201].includes(putRes.status), `PUT failed: ${putRes.raw}`);

      // Re-fetch and assert persistence.
      const fetched = await h.get('/api/wealth/items', { token: user.token });
      assert.strictEqual(fetched.status, 200, `list failed: ${fetched.raw}`);
      const list = Array.isArray(fetched.body)
        ? fetched.body
        : (fetched.body.items || fetched.body.wealthItems || []);
      const item = list.find((x) => String(x.id || x._id) === String(itemId));
      assert.ok(item, 'item must appear in the list');

      assert.ok(item.sold_at, `sold_at must persist, got ${JSON.stringify(item.sold_at)}`);
      assert.strictEqual(Number(item.sale_price), 1500, 'sale_price must persist');
      assert.strictEqual(Number(item.sale_fees), 25, 'sale_fees must persist');
    });

    // ── P3-04: legacy rows without is_deleted are still listed ──────────────
    await test('P3-04: a legacy transaction with NO is_deleted field is still listed', async () => {
      const user = await h.createUser();
      const Transaction = require('../models/Transaction');

      // Insert directly, bypassing the schema default, to simulate a pre-field row.
      const legacyId = new (require('mongoose').Types.ObjectId)();
      await Transaction.collection.insertOne({
        _id: legacyId,
        user_id: new (require('mongoose').Types.ObjectId)(user.id),
        type: 'expense',
        category: 'Legacy',
        amount: 42,
        date: new Date(),
        currency: 'USD',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res = await h.get(`/api/transactions/${user.id}`, { token: user.token });
      assert.strictEqual(res.status, 200, `list failed: ${res.raw}`);
      // The cursor-paginated listing returns { items, nextCursor, hasMore }.
      const items = Array.isArray(res.body) ? res.body : (res.body.items || res.body.transactions || []);
      const found = items.some((t) => String(t.id || t._id) === String(legacyId));
      assert.ok(found, 'a row with no is_deleted field must NOT be hidden by the listing filter');
    });

    // ── REGRESSION: balance must not collapse to 0 ─────────────────────────
    await test('REGRESSION: syncUserBalance reflects real income (was forced to 0 by a missing date projection)', async () => {
      const user = await h.createUser();
      const Account = require('../models/Account');
      const Transaction = require('../models/Transaction');

      const account = await Account.create({
        user_id: user.id, name: 'Balance acct', type: 'bank',
        initial_balance: 0, current_balance: 0, currency: 'USD',
      });

      await Transaction.create([
        {
          user_id: user.id, type: 'income', category: 'Salary', amount: 2500,
          currency: 'USD', date: new Date('2026-01-10'), account_id: account._id,
        },
        {
          user_id: user.id, type: 'expense', category: 'Rent', amount: 400,
          currency: 'USD', date: new Date('2026-01-12'), account_id: account._id,
        },
      ]);

      const TransactionsRoute = require('../routes/transactions');
      const balance = await TransactionsRoute.syncUserBalance(user.id);

      assert.strictEqual(
        Number(balance), 2100,
        `expected 2500 - 400 = 2100; got ${balance}. ` +
        'A result of 0 means every row was dropped as "future-dated" because `date` was not projected.'
      );

      const persisted = await h.User.findById(user.id).select('balance').lean();
      assert.strictEqual(Number(persisted.balance), 2100, 'the canonical balance must be persisted');
    });

    await test('REGRESSION: isFutureTransaction does not treat a missing date as future', () => {
      const { isFutureTransaction, dedupeTransactions } = require('../utils/transactionIntegrity');
      assert.strictEqual(isFutureTransaction(undefined), false, 'undefined must NOT be future');
      assert.strictEqual(isFutureTransaction(null), false, 'null must NOT be future');
      assert.strictEqual(isFutureTransaction('not-a-date'), false, 'an invalid date must NOT be future');
      assert.strictEqual(isFutureTransaction(new Date(Date.now() + 5 * 864e5)), true, 'a real future date MUST be future');
      assert.strictEqual(dedupeTransactions([{ type: 'income', amount: 5 }]).length, 1, 'a row without a date must survive dedupe');
    });

    // ── P3-03: import must use the canonical balance helper ────────────────
    await test('P3-03: import persists the CANONICAL balance, not a naive income-minus-expense sum', async () => {
      const user = await h.createUser();
      const Account = require('../models/Account');

      const accountId = new (require('mongoose').Types.ObjectId)();
      const day = '2026-01-15';

      // Three rows that make the naive and canonical results DIFFER:
      //  1. a duplicate pair (same integrity key) -> naive counts both, canonical one
      //  2. a future-dated row -> canonical excludes it, naive counts it
      const dupA = new (require('mongoose').Types.ObjectId)();
      const dupB = new (require('mongoose').Types.ObjectId)();
      const futureId = new (require('mongoose').Types.ObjectId)();
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const baseTx = {
        type: 'income', category: 'Salary', amount: 1000,
        merchant: 'Acme', currency: 'USD', date: day, account_id: String(accountId),
      };

      const backup = {
        version: 5,
        accounts: [{
          _id: String(accountId), name: 'Harness acct', type: 'bank',
          initial_balance: 0, current_balance: 0, currency: 'USD',
        }],
        transactions: [
          { ...baseTx, _id: String(dupA) },
          { ...baseTx, _id: String(dupB) },
          { ...baseTx, _id: String(futureId), amount: 5000, date: futureDate },
        ],
      };

      const res = await h.post(`/api/users/${user.id}/import`, backup, { token: user.token });
      assert.ok([200, 201].includes(res.status), `import failed: ${res.status} ${res.raw}`);

      // The canonical helper dedupes (so the pair counts once) and excludes
      // future rows, giving 1000. The naive sum would be 1000+1000+5000 = 7000.
      const refreshed = await h.User.findById(user.id).select('balance').lean();
      const storedBalance = Number(refreshed.balance);

      // `syncUserBalance` is the canonical implementation exported by the
      // transactions router; recomputing with it must reproduce what the import
      // persisted.
      const TransactionsRoute = require('../routes/transactions');
      const canonical = await TransactionsRoute.syncUserBalance(user.id);

      assert.strictEqual(
        storedBalance, 1000,
        `expected the canonical balance 1000, got ${storedBalance} (naive would be 7000)`
      );
      assert.strictEqual(
        storedBalance, Number(canonical),
        `stored balance must equal syncUserBalance output (${canonical})`
      );
    });

    // ── P5-16: AI fails closed without a user ───────────────────────────────
    await test('P5-16: /api/ai/chat returns 401 without authentication', async () => {
      const res = await h.post('/api/ai/chat', { message: 'hello', history: [] });
      assert.strictEqual(res.status, 401, `expected 401, got ${res.status}: ${res.raw}`);
    });

    // ── RATE-LIMIT configuration assertions (see note at top of file) ───────
    await test('P5-15: a dedicated limiter is attached to POST /api/auth/resend-verification', () => {
      const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'routes', 'auth.js'), 'utf8'
      );
      assert.ok(
        /router\.post\(\s*'\/resend-verification'\s*,\s*emailLimiter/.test(src),
        'resend-verification must be mounted with emailLimiter'
      );
      assert.ok(/const emailLimiter = rateLimit\(/.test(src), 'emailLimiter must be defined');
    });
  } finally {
    await harness.stop();
  }

  console.log(`\n════════════════════════════════════════`);
  if (failed > 0) {
    console.error(`❌ Security integration: ${passed} passed, ${failed} failed`);
    for (const f of failures) console.error(`   - ${f.name}: ${f.message}`);
    console.error('════════════════════════════════════════');
    process.exit(1);
  }
  console.log(`✅ All ${passed} security integration tests passed.`);
  console.log('════════════════════════════════════════');
  process.exit(0);
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err.stack || err.message);
  process.exit(1);
});
