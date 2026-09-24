#!/usr/bin/env node

/**
 * 🚀 MyCoinwise - One-Command Full-Stack Launcher
 *
 * Runs both backend (port 5001) and frontend (port 5173),
 * verifies health, and automatically opens the app in your default browser.
 *
 * Usage:
 *   node start.js
 *   or: npm start
 *   or: ./start.sh
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT_DIR = __dirname;
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

const BACKEND_PORT = process.env.PORT || 5001;
const FRONTEND_URL = 'http://localhost:5173';
const HEALTH_URL = `http://localhost:${BACKEND_PORT}/api/health`;

let backendProc = null;
let frontendProc = null;
let isExiting = false;

// ── Terminal Colors ──
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function log(prefix, color, message) {
  const time = new Date().toLocaleTimeString();
  console.log(`${colors.dim}[${time}]${colors.reset} ${color}${colors.bright}[${prefix}]${colors.reset} ${message}`);
}

// ── Open browser cross-platform ──
function openBrowser(url) {
  const platform = process.platform;
  let command = '';

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      log('LAUNCHER', colors.yellow, `Could not automatically launch browser: ${err.message}`);
      log('LAUNCHER', colors.green, `Please manually open: ${url}`);
    } else {
      log('LAUNCHER', colors.green, `Opened ${url} in your default browser!`);
    }
  });
}

// ── Poll for backend health ──
function waitForBackend(timeoutMs = 15000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (Date.now() - startTime < timeoutMs) {
          setTimeout(check, 400);
        } else {
          resolve(false);
        }
      });

      req.on('error', () => {
        if (Date.now() - startTime < timeoutMs) {
          setTimeout(check, 400);
        } else {
          resolve(false);
        }
      });
      req.setTimeout(1000, () => req.destroy());
    };

    check();
  });
}

// ── Clean shutdown handler ──
function cleanup() {
  if (isExiting) return;
  isExiting = true;

  console.log('\n');
  log('LAUNCHER', colors.yellow, 'Shutting down servers gracefully...');

  if (backendProc && !backendProc.killed) {
    try { backendProc.kill('SIGTERM'); } catch { /* ignore */ }
  }
  if (frontendProc && !frontendProc.killed) {
    try { frontendProc.kill('SIGTERM'); } catch { /* ignore */ }
  }

  setTimeout(() => {
    log('LAUNCHER', colors.cyan, 'Goodbye! 👋');
    process.exit(0);
  }, 400);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

// ── Main Launch Orchestrator ──
async function main() {
  console.log(`
${colors.cyan}${colors.bright}=======================================================
   🚀 Starting MyCoinwise Full-Stack Application
=======================================================${colors.reset}
`);

  // 1. Start Backend
  log('BACKEND', colors.yellow, `Starting Express server on port ${BACKEND_PORT}...`);
  backendProc = spawn('node', ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  backendProc.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) log('BACKEND', colors.cyan, line);
  });

  backendProc.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) log('BACKEND', colors.yellow, line);
  });

  backendProc.on('exit', (code) => {
    if (!isExiting && code !== 0) {
      log('BACKEND', colors.red, `Backend server stopped with exit code ${code}`);
    }
  });

  // 2. Wait for Backend to become responsive
  const backendHealthy = await waitForBackend(10000);
  if (backendHealthy) {
    log('BACKEND', colors.green, `Backend is healthy at http://localhost:${BACKEND_PORT}`);
  } else {
    log('BACKEND', colors.yellow, `Backend started (continuing with frontend launch)...`);
  }

  // 3. Start Frontend (Vite)
  log('FRONTEND', colors.yellow, 'Starting Vite frontend server...');
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  frontendProc = spawn(npxCmd, ['vite', '--host'], {
    cwd: FRONTEND_DIR,
    env: { ...process.env, VITE_API_URL: process.env.VITE_API_URL || `http://localhost:${BACKEND_PORT}/api` },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let browserOpened = false;

  frontendProc.stdout.on('data', (data) => {
    const output = data.toString();
    const lines = output.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      log('FRONTEND', colors.green, line);

      if (!browserOpened && (output.includes('localhost:5173') || output.includes('Local:') || output.includes('ready in'))) {
        browserOpened = true;
        setTimeout(() => {
          printBanner();
          openBrowser(FRONTEND_URL);
        }, 500);
      }
    }
  });

  frontendProc.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) log('FRONTEND', colors.yellow, line);
  });

  frontendProc.on('exit', (code) => {
    if (!isExiting && code !== 0) {
      log('FRONTEND', colors.red, `Frontend server stopped with exit code ${code}`);
    }
  });

  // Fallback timer for opening browser if Vite output wasn't matched
  setTimeout(() => {
    if (!browserOpened) {
      browserOpened = true;
      printBanner();
      openBrowser(FRONTEND_URL);
    }
  }, 4000);
}

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

main().catch((err) => {
  log('LAUNCHER', colors.red, `Fatal startup error: ${err.message}`);
  cleanup();
});
