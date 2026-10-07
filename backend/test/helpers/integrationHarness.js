/**
 * Integration test harness.
 *
 * Boots the REAL backend (`server.js`) and talks to it over HTTP, so tests
 * exercise the full middleware stack — request-ID, CORS, sanitization, rate
 * limiters, auth, routes, error handler — rather than mocks.
 *
 * WHY A SEPARATE HARNESS
 * ----------------------
 * Unit tests cannot prove security properties that live in middleware ordering,
 * route mounting, or ownership checks. Those need a live server plus real
 * database documents.
 *
 * DESIGN NOTES
 * ------------
 *  - `start()` spawns `server.js` as a child process. The caller must
 *    `await stop()` in a `finally` block.
 *  - Tokens are forged the same way `routes/auth.js` signs them (HS256, `id` +
 *    `session_version` + `jti`) and a matching `Session` document is inserted, so
 *    the auth middleware takes its normal path.
 *  - Every user created here is namespaced with the `harness-` username prefix
 *    and removed by `cleanup()`.
 *  - The whole suite SKIPS (exit 0) when MongoDB is unreachable, matching the
 *    convention of the existing `auth-middleware.test.js`, so CI without a
 *    database still passes.
 *
 * Usage:
 *   const harness = require('./helpers/integrationHarness');
 *   const env = await harness.start();
 *   ...
 *   await harness.stop();
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..', '..');

/** Username prefix identifying documents this harness owns. */
const HARNESS_PREFIX = 'harness-';

let serverProcess = null;
let mongooseRef = null;

/** Port for the child server. Overridable to avoid collisions between runs. */
const PORT = Number(process.env.HARNESS_PORT || 6399);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Minimal promise-based HTTP client.
 *
 * @param {string} method HTTP verb.
 * @param {string} urlPath Path beginning with '/'.
 * @param {{ token?: string, body?: unknown, headers?: Record<string,string> }} [options]
 * @returns {Promise<{ status: number, headers: Record<string,string|string[]|undefined>, body: any, raw: string }>}
 */
function request(method, urlPath, options = {}) {
  const { token, body, headers = {} } = options;
  const payload = body === undefined ? null : JSON.stringify(body);

  const requestHeaders = { ...headers };
  if (payload !== null) {
    requestHeaders['Content-Type'] = 'application/json';
    requestHeaders['Content-Length'] = Buffer.byteLength(payload);
  }
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: urlPath, method, headers: requestHeaders },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed = raw;
          try { parsed = JSON.parse(raw); } catch { /* non-JSON body is fine */ }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error(`Request timed out: ${method} ${urlPath}`)));
    if (payload !== null) req.write(payload);
    req.end();
  });
}

/** Convenience wrappers. */
const get = (p, o) => request('GET', p, o);
const post = (p, body, o) => request('POST', p, { ...o, body });
const put = (p, body, o) => request('PUT', p, { ...o, body });
const del = (p, o) => request('DELETE', p, o);

/** @returns {Promise<void>} Resolves once /api/health answers. */
async function waitForHealth(attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await get('/api/health');
      if (res.status === 200 || res.status === 503) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Server did not become healthy in time.');
}

/**
 * Start the backend child process and connect mongoose for fixtures.
 *
 * @returns {Promise<object>} Harness API.
 */
async function start() {
  // Load the validated config (also loads .env) before touching mongoose.
  const { config } = require(path.join(BACKEND_DIR, 'config', 'env'));
  const mongoose = require(path.join(BACKEND_DIR, 'node_modules', 'mongoose'));
  mongooseRef = mongoose;

  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const serverLog = [];
  serverProcess.stdout.on('data', (c) => serverLog.push(c.toString()));
  serverProcess.stderr.on('data', (c) => serverLog.push(c.toString()));

  // Fail fast with the server's own output if it dies during boot.
  let exited = false;
  serverProcess.on('exit', (code) => {
    exited = true;
    if (code !== 0 && serverLog.length) {
      console.error('[harness] server exited early:\n' + serverLog.join(''));
    }
  });

  try {
    await waitForHealth();
  } catch (err) {
    if (exited) throw new Error('Server process exited before becoming healthy. See [harness] output above.');
    throw err;
  }

  await mongoose.connect(config.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  const User = require(path.join(BACKEND_DIR, 'models', 'User'));
  const Session = require(path.join(BACKEND_DIR, 'models', 'Session'));
  const jwt = require(path.join(BACKEND_DIR, 'node_modules', 'jsonwebtoken'));

  /**
   * Create a user plus an active session and return a working bearer token.
   *
   * @param {{ username?: string, password?: string, householdId?: string, sessionVersion?: number }} [spec]
   * @returns {Promise<{ id: string, username: string, email: string, password: string, token: string, householdId: string }>}
   */
  async function createUser(spec = {}) {
    const suffix = crypto.randomBytes(4).toString('hex');
    const username = spec.username || `${HARNESS_PREFIX}${suffix}`;
    const password = spec.password || 'HarnessPass123!';
    const email = `${username}@harness.test`;

    const user = await User.create({
      username,
      email,
      password,
      currency: 'USD',
      household_id: spec.householdId || undefined,
      session_version: spec.sessionVersion || 0,
    });

    // Root accounts own their household (mirrors the migration/registration logic).
    if (!user.household_id) {
      user.household_id = user._id;
      await user.save({ validateBeforeSave: false });
    }

    const token = await issueToken(user);
    return { id: String(user._id), username, email, password, token, householdId: String(user.household_id) };
  }

  /**
   * Forge a token for a user exactly as the app signs them, and persist the
   * matching Session so the auth middleware's normal path is exercised.
   *
   * @param {object} user Mongoose user document.
   * @param {Record<string, unknown>} [extraClaims] Additional/overriding claims.
   * @returns {Promise<string>} Signed JWT.
   */
  async function issueToken(user, extraClaims = {}) {
    const tokenId = crypto.randomUUID();
    const token = jwt.sign(
      {
        id: user._id,
        session_version: user.session_version || 0,
        jti: tokenId,
        ...extraClaims,
      },
      config.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );

    await Session.create({
      user_id: user._id,
      token_id: tokenId,
      device: 'Integration harness',
      is_active: true,
    });

    return token;
  }

  /**
   * Re-issue a token for an existing user id with arbitrary claims.
   * Used to prove claim values cannot shadow server-derived ones.
   *
   * @param {string} userId Target user id.
   * @param {Record<string, unknown>} claims Claims to embed.
   * @returns {Promise<string>} Signed JWT.
   */
  async function tokenFor(userId, claims = {}) {
    const user = await User.findById(userId);
    if (!user) throw new Error(`No user ${userId}`);
    return issueToken(user, claims);
  }

  return {
    baseUrl: BASE_URL,
    port: PORT,
    get, post, put, del, request,
    createUser, issueToken, tokenFor,
    mongoose,
    User, Session,
    serverLog,
  };
}

/**
 * Stop the child server, disconnect mongoose and delete harness users.
 *
 * Idempotent, so it is safe in a `finally` block.
 *
 * @returns {Promise<void>}
 */
async function stop() {
  try {
    if (mongooseRef && mongooseRef.connection.readyState === 1) {
      const User = require(path.join(BACKEND_DIR, 'models', 'User'));
      const Session = require(path.join(BACKEND_DIR, 'models', 'Session'));
      const LoginLog = require(path.join(BACKEND_DIR, 'models', 'LoginLog'));

      // Collect harness user ids first so dependent documents can be removed.
      const users = await User.find({ username: new RegExp(`^${HARNESS_PREFIX}`) }).select('_id').lean();
      const ids = users.map((u) => u._id);

      if (ids.length) {
        await Session.deleteMany({ user_id: { $in: ids } });
        await LoginLog.deleteMany({ user_id: { $in: ids } });
      }
      await User.deleteMany({ username: new RegExp(`^${HARNESS_PREFIX}`) });
      await mongooseRef.disconnect();
    }
  } catch { /* cleanup is best-effort */ }

  if (serverProcess && !serverProcess.killed) {
    try { serverProcess.kill(); } catch { /* already gone */ }
    // Give the port a moment to be released before the process exits.
    await new Promise((r) => setTimeout(r, 600));
    serverProcess = null;
  }
}

module.exports = { start, stop, request, get, post, put, del, PORT, BASE_URL, HARNESS_PREFIX };
