/**
 * Request sanitization unit tests.
 *
 * Guards the Express 5 `req.query` sanitization bypass: an in-place mutation of
 * the lazy `req.query` getter is silently discarded, so a bare `$where` used to
 * reach route handlers. `middleware/sanitizeRequest.js` redefines the property
 * instead, and these tests pin that behaviour.
 *
 * Runs without a server or database.
 */

const assert = require('assert');
const { sanitizeRequest, sanitizeQuery, HttpError } = require('../middleware/sanitizeRequest');

let passed = 0;
let failed = 0;

/**
 * Run one named test, reporting pass/fail without aborting the suite.
 *
 * @param {string} name Test name.
 * @param {() => void} fn Test body.
 */
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ❌ ${name}\n     ${err.message}`);
  }
}

/**
 * Build a minimal Express-like request whose `query` is a getter, mirroring
 * Express 5's lazy `req.query` so the bypass is exercised faithfully.
 *
 * @param {object} query Parsed query object.
 * @param {object} [body] Parsed body.
 * @returns {object} Mock request.
 */
function mockRequest(query, body = undefined) {
  const req = { headers: {}, body, params: {} };
  Object.defineProperty(req, 'query', {
    get() { return query; },
    configurable: true,
  });
  return req;
}

/**
 * Run the middleware and return the `next` argument.
 *
 * @param {object} req Mock request.
 * @returns {unknown} Value passed to `next`.
 */
function run(req) {
  let nextArg;
  sanitizeRequest(req, {}, (arg) => { nextArg = arg; });
  return nextArg;
}

console.log('🧪 Request Sanitization Unit Tests');

// ── The original bypass ─────────────────────────────────────────────────────
test('bare $where is stripped from req.query', () => {
  const req = mockRequest({ $where: 'sleep(1)', name: 'ok' });
  run(req);
  assert.strictEqual(req.query.$where, undefined, '$where must be removed');
  assert.strictEqual(req.query.name, 'ok', 'legitimate params must survive');
});

test('$ne / $gt / $or operator keys are stripped', () => {
  const req = mockRequest({ $ne: '1', $gt: '0', $or: 'x', keep: 'yes' });
  run(req);
  for (const key of ['$ne', '$gt', '$or']) {
    assert.strictEqual(req.query[key], undefined, `${key} must be removed`);
  }
  assert.strictEqual(req.query.keep, 'yes');
});

test('sanitized query is an own property (not the getter)', () => {
  const req = mockRequest({ $where: 'x' });
  run(req);
  const descriptor = Object.getOwnPropertyDescriptor(req, 'query');
  assert.ok(descriptor, 'req.query must become an own property');
  assert.ok(Object.prototype.hasOwnProperty.call(descriptor, 'value'), 'must hold a value, not a getter');
});

test('nested operator objects are stripped recursively', () => {
  const req = mockRequest({ filter: { $ne: null, safe: 1 }, other: { deep: { $where: 'y' } } });
  run(req);
  assert.strictEqual(req.query.filter.$ne, undefined);
  assert.strictEqual(req.query.filter.safe, 1);
  assert.strictEqual(req.query.other.deep.$where, undefined);
});

// ── Regressions the fix must not introduce ──────────────────────────────────
test('legitimate params (pagination, search, filters) survive intact', () => {
  const req = mockRequest({ page: '2', limit: '50', search: 'coffee', category: 'food' });
  run(req);
  assert.deepStrictEqual(req.query, { page: '2', limit: '50', search: 'coffee', category: 'food' });
});

test('bracket-notation input stays a literal key and does not become an operator', () => {
  // Express 5's parser yields flat literal keys such as "filter[$ne]"; these are
  // inert strings, not `{ $ne: ... }` objects, and must not be silently dropped.
  const req = mockRequest({ 'filter[$ne]': '1', safe: 'yes' });
  run(req);
  assert.strictEqual(req.query['filter[$ne]'], '1');
  assert.strictEqual(req.query.safe, 'yes');
});

test('req.body operator keys are stripped', () => {
  const req = mockRequest({}, { email: { $ne: null }, password: 'x' });
  run(req);
  assert.strictEqual(req.body.email.$ne, undefined, '$ne must be stripped from body');
});

test('missing/empty query and body do not throw', () => {
  assert.strictEqual(run({ headers: {}, params: {} }), undefined);
  const req = mockRequest({});
  assert.strictEqual(run(req), undefined);
  assert.deepStrictEqual(req.query, {});
});

test('next() is called with no error on success', () => {
  const req = mockRequest({ a: '1' });
  assert.strictEqual(run(req), undefined);
});

// ── Direct helper behaviour ────────────────────────────────────────────────
test('sanitizeQuery returns a sanitized copy and leaves the input untouched', () => {
  const input = { $where: 'x', keep: 'y' };
  const output = sanitizeQuery(input);
  assert.strictEqual(output.$where, undefined);
  assert.strictEqual(output.keep, 'y');
  assert.strictEqual(input.$where, 'x', 'input object must not be mutated');
});

test('HttpError carries an explicit status', () => {
  const err = new HttpError(403, 'nope');
  assert.strictEqual(err.status, 403);
  assert.strictEqual(err.message, 'nope');
  assert.ok(err instanceof Error);
});

console.log(`\n${failed === 0 ? '✅' : '❌'} Request sanitization: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
