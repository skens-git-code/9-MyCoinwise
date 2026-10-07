#!/usr/bin/env node

/**
 * 🚀 MyCoinwise — one-command full-stack launcher.
 *
 * Starts the Express backend (`backend/server.js`) and the Vite dev server
 * (`frontend/`), waits until BOTH ports actually accept connections, and only
 * then prints the "is live" banner and opens the browser.
 *
 * Why the readiness gate matters: an earlier version printed the success banner
 * and opened the browser on a timer (or on any line of Vite output that merely
 * mentioned `localhost:5173`). If either child died immediately — a missing
 * dependency, a port clash, a bad `.env` — the user still saw "🎉 MyCoinwise is
 * Live!" and a blank page. Now the banner is gated on both children still
 * running AND both ports serving.
 *
 * Usage:
 *   node start.js        # or: npm start
 *
 * Environment:
 *   PORT             backend port (default 5001)
 *   FRONTEND_PORT    Vite port (default 5173)
 *   STARTUP_TIMEOUT  ms to wait for readiness (default 60000)
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const net = require('net');

const ROOT_DIR = __dirname;
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

const BACKEND_PORT = Number(process.env.PORT) || 5001;
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT) || 5173;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const HEALTH_URL = `http://localhost:${BACKEND_PORT}/api/health`;
const STARTUP_TIMEOUT = Number(process.env.STARTUP_TIMEOUT) || 60000;

// ── Terminal colors ──
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

const isWindows = process.platform === 'win32';

/** @type {import('child_process').ChildProcess|null} */
let backendProc = null;
/** @type {import('child_process').ChildProcess|null} */
let frontendProc = null;
let isExiting = false;
let announced = false;

// Child liveness, tracked from authoritative 'exit'/'error' events rather than
// inferred from output text.
const alive = { backend: false, frontend: false };

/**
 * Print a timestamped, colored status line.
 *
 * @param {string} prefix Label such as BACKEND or FRONTEND.
 * @param {string} color ANSI color escape.
 * @param {string} message Text to print.
 */
function log(prefix, color, message) {
  const time = new Date().toLocaleTimeString();
  console.log(`${colors.dim}[${time}]${colors.reset} ${color}${colors.bright}[${prefix}]${colors.reset} ${message}`);
}

/**
 * Open a URL in the platform's default browser.
 *
 * Uses `shell: true` with a single fully-formed command STRING (never a command
 * plus an args array), which is the pattern that avoids Node's DEP0190 warning
 * about unescaped argument concatenation.
 *
 * @param {string} url URL to open.
 */
function openBrowser(url) {
  const command = process.platform === 'darwin'
    ? `open "${url}"`
    : isWindows
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;

  const child = spawn(command, { shell: true, stdio: 'ignore', detached: false });
  child.on('error', (err) => {
    log('LAUNCHER', colors.yellow, `Could not launch browser: ${err.message}`);
    log('LAUNCHER', colors.green, `Please open manually: ${url}`);
  });
}

/**
 * Resolve the npm executable for the current platform.
 *
 * On Windows the npm CLI is a `.cmd` shim; spawning it directly (no `shell`)
 * avoids DEP0190 while still working, because Node resolves `.cmd` via cmd.exe
 * only when a shell is requested — so we run the underlying Vite binary instead.
 *
 * @returns {string} Path to the Vite CLI entry point.
 */
function viteEntry() {
  return path.join(FRONTEND_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
}

/**
 * Probe an HTTP endpoint once.
 *
 * @param {string} url URL to request.
 * @param {{ expectStatus?: number|null, validate?: (body: string) => boolean }} [options]
 *   `expectStatus` requires an exact status code. `validate` must return true for
 *   the body to count as ready.
 * @returns {Promise<boolean>} True when the endpoint responded acceptably.
 */
function probeHttp(url, { expectStatus = null, validate = null } = {}) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { if (body.length < 65536) body += chunk; });
      res.on('end', () => {
        if (expectStatus !== null && res.statusCode !== expectStatus) return resolve(false);
        if (validate && !validate(body)) return resolve(false);
        resolve(true);
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Check whether a TCP port is accepting connections.
 *
 * NOTE: this only proves *something* is listening. It is used for pre-flight
 * conflict detection, never as evidence that OUR service became ready — a stale
 * process left over from a previous run would otherwise satisfy it.
 *
 * @param {number} port Port to test on localhost.
 * @returns {Promise<boolean>} True when a connection succeeds.
 */
function probeTcp(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
    socket.setTimeout(2000, () => done(false));
  });
}

/**
 * Wait until both services are genuinely ready, or the deadline passes.
 *
 * Readiness requires a positive identity check on the actual service, not just an
 * open port:
 *  - Backend: `/api/health` must return HTTP 200 with MyCoinwise's JSON body
 *    (`status` + `database` fields). A bare TCP connection is NOT accepted.
 *  - Frontend: `/` must return HTTP 200 and look like the Vite dev server.
 * In both cases the child process must still be running.
 *
 * @param {number} timeoutMs Maximum time to wait.
 * @returns {Promise<{ backend: boolean, frontend: boolean }>} Readiness per service.
 */
async function waitForReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let backendReady = false;
  let frontendReady = false;

  const backendIsRunning = () => alive.backend && backendProc?.exitCode === null;
  const frontendIsRunning = () => alive.frontend && frontendProc?.exitCode === null;

  while (Date.now() < deadline) {
    if (!backendReady && backendIsRunning()) {
      backendReady = await probeHttp(HEALTH_URL, {
        expectStatus: 200,
        // Identity check: rejects a stale/wrong server squatting on the port.
        validate: (body) => body.includes('"status"') && body.includes('"database"'),
      });
    }
    if (!frontendReady && frontendIsRunning()) {
      frontendReady = await probeHttp(FRONTEND_URL + '/', {
        expectStatus: 200,
        validate: (body) => /<div id="root"|@vite\/client|\/@vite/.test(body),
      });
    }
    if (backendReady && frontendReady) break;

    // If both children are gone there is nothing left to wait for.
    if (!backendIsRunning() && !frontendIsRunning()) break;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { backend: backendReady, frontend: frontendReady };
}

/** Print the success banner. */
function printBanner() {
  console.log(`
${colors.green}${colors.bright}=======================================================
   🎉 MyCoinwise is Live!
=======================================================
   🌐 Frontend:   ${FRONTEND_URL}
   ⚙️  Backend:    http://localhost:${BACKEND_PORT}
   ❤️  Health:     ${HEALTH_URL}

   👉 Press Ctrl+C in this terminal to stop both servers
=======================================================${colors.reset}
`);
}

/**
 * Print a failure summary explaining exactly which service did not come up.
 *
 * @param {{ backend: boolean, frontend: boolean }} ready Readiness result.
 */
function printFailure(ready) {
  console.log(`
${colors.red}${colors.bright}=======================================================
   ✗ MyCoinwise failed to start
=======================================================${colors.reset}`);
  console.log(`   Backend (port ${BACKEND_PORT}):  ${ready.backend ? colors.green + 'ready' : colors.red + 'NOT ready'}${colors.reset}`);
  console.log(`   Frontend (port ${FRONTEND_PORT}): ${ready.frontend ? colors.green + 'ready' : colors.red + 'NOT ready'}${colors.reset}`);
  console.log(`
   Common causes:
     • MongoDB unreachable  → check MONGO_URI in backend/.env
     • Port already in use  → stop the other process, or set PORT / FRONTEND_PORT
     • Missing dependencies → npm run install:all
   Backend logs above show the underlying error.${colors.reset}
`);
}

// ── Clean shutdown ──
/**
 * Terminate both children, then exit. Idempotent.
 *
 * @param {number} [exitCode=0] Process exit code. Startup failures pass 1 so
 *   that `npm start` and any supervising script can detect that the app is not
 *   running — the launcher previously always exited 0, even when nothing started.
 */
function cleanup(exitCode = 0) {
  if (isExiting) return;
  isExiting = true;

  console.log('');
  log('LAUNCHER', colors.yellow, 'Shutting down servers gracefully...');

  for (const proc of [backendProc, frontendProc]) {
    if (proc && !proc.killed && proc.exitCode === null) {
      try { proc.kill(); } catch { /* already gone */ }
    }
  }

  setTimeout(() => {
    log('LAUNCHER', colors.cyan, 'Goodbye! 👋');
    process.exit(exitCode);
  }, 400);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

/**
 * Attach exit/error handlers to a child.
 *
 * Child stdout/stderr are inherited (not piped) on purpose:
 *  - the launcher owns the terminal, so backend/Vite output should stream
 *    through unmodified and with their own colors preserved;
 *  - it keeps `spawn` free of piped-stdio restrictions.
 *
 * @param {import('child_process').ChildProcess} proc Child process.
 * @param {string} prefix Log prefix.
 * @param {string} key Key in the `alive` map.
 */
function wireChild(proc, prefix, key) {
  proc.on('error', (err) => {
    alive[key] = false;
    log(prefix, colors.red, `Could not start process: ${err.message}`);
  });

  proc.on('exit', (code, signal) => {
    alive[key] = false;
    if (isExiting) return;
    const how = signal ? `signal ${signal}` : `exit code ${code}`;
    if (code === 0) {
      log(prefix, colors.yellow, `Process stopped (${how}).`);
    } else {
      log(prefix, colors.red, `Process stopped with ${how}.`);
    }
    // One service dying means the app is not usable; report once and shut down.
    if (!announced) {
      announced = true;
      printFailure({ backend: alive.backend, frontend: alive.frontend });
    }
    // A child dying is a failed start: exit non-zero so scripts can detect it.
    cleanup(1);
  });
}

// ── Main ──
async function main() {
  console.log(`
${colors.cyan}${colors.bright}=======================================================
   🚀 Starting MyCoinwise Full-Stack Application
=======================================================${colors.reset}
`);

  // 0. Pre-flight: a port that is already taken means one of our children will
  // die on EADDRINUSE. Detect it now so the failure is explained immediately
  // instead of being masked by whichever process already owns the port.
  const conflicts = [];
  if (await probeTcp(BACKEND_PORT)) conflicts.push({ name: 'Backend', port: BACKEND_PORT, env: 'PORT' });
  if (await probeTcp(FRONTEND_PORT)) conflicts.push({ name: 'Frontend', port: FRONTEND_PORT, env: 'FRONTEND_PORT' });

  if (conflicts.length > 0) {
    console.log(`${colors.red}${colors.bright}✗ Cannot start: port already in use${colors.reset}`);
    for (const c of conflicts) {
      console.log(`   • ${c.name} port ${c.port} is already taken (another MyCoinwise instance, or an unrelated app).`);
    }
    console.log(`
   Stop the process holding the port, or choose free ports:
     ${colors.dim}PORT=6001 FRONTEND_PORT=6173 node start.js${colors.reset}
`);
    process.exit(1);
  }

  // 1. Backend
  log('BACKEND', colors.yellow, `Starting Express server on port ${BACKEND_PORT}...`);
  alive.backend = true;
  backendProc = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: 'inherit',
  });
  wireChild(backendProc, 'BACKEND', 'backend');

  // 2. Frontend — run Vite's JS entry with the current Node binary. No shell and
  // no args concatenation, so DEP0190 cannot trigger and args stay escaped.
  const entry = viteEntry();
  log('FRONTEND', colors.yellow, `Starting Vite dev server on port ${FRONTEND_PORT}...`);
  alive.frontend = true;
  frontendProc = spawn(process.execPath, [entry, '--host', '--port', String(FRONTEND_PORT)], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      VITE_API_URL: process.env.VITE_API_URL || `http://localhost:${BACKEND_PORT}/api`,
    },
    stdio: 'inherit',
  });
  wireChild(frontendProc, 'FRONTEND', 'frontend');


  // 3. Gate the banner on REAL readiness, not on a timer or on log text.
  const ready = await waitForReady(STARTUP_TIMEOUT);

  if (ready.backend && ready.frontend) {
    announced = true;
    log('BACKEND', colors.green, `Ready at http://localhost:${BACKEND_PORT}`);
    log('FRONTEND', colors.green, `Ready at ${FRONTEND_URL}`);
    printBanner();
    openBrowser(FRONTEND_URL);
  } else if (alive.backend || alive.frontend) {
    // Still running but not ready in time — warn honestly, do not claim success.
    announced = true;
    log('LAUNCHER', colors.red, 'Timed out waiting for services to become ready.');
    printFailure(ready);
    // Do not linger: tear both children down so a failed start does not leave
    // orphans holding the ports (which would trip the pre-flight check next run).
    log('LAUNCHER', colors.yellow, 'Stopping partially started services...');
    cleanup(1);
  }
  // If both already exited, wireChild's exit handler reported and cleaned up.
}

main().catch((err) => {
  log('LAUNCHER', colors.red, `Fatal startup error: ${err.message}`);
  cleanup(1);
});
