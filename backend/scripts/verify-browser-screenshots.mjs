/* —————————————————————————————————————
 * Screenshot Capture Script
 * Automates headless Chrome via the DevTools Protocol to capture
 * screenshots of the MyCoinwise frontend at multiple viewports.
 *
 * Flow:
 *   1. Generate a short-lived JWT for a seed user and persist a Session.
 *   2. Launch headless Chrome with remote debugging enabled.
 *   3. Connect via WebSocket to the CDP endpoint.
 *   4. Navigate to each page, set the viewport, and capture a PNG.
 *   5. Tear down Chrome and clean up the temp profile directory.
 *
 * Usage:
 *   node captureScreenshots.js
 *
 * Environment:
 *   MONGO_URI    – MongoDB connection string (required by getAuthToken).
 *   JWT_SECRET   – Secret used to sign the auth token.
 *
 * Requires Node 18+ (global fetch and WebSocket).
 * ————————————————————————————————————— */

// ── Load dependencies ──
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';

// ── Resolve __dirname for ES modules ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Load environment from ../.env ──
dotenv.config({ path: path.join(__dirname, '../.env') });

/* —————————————————————————————————————
 * Configuration
 * ————————————————————————————————————— */

// ── Directory where screenshots are written ──
const ARTIFACTS_DIR = '/Users/sarthakmathapati/.gemini/antigravity-ide/brain/525c3019-2b4f-40c0-a89a-785bd8296a23';

// ── Chrome binary path (macOS) ──
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ── Remote debugging port for CDP ──
const DEBUG_PORT = 9222;

/* —————————————————————————————————————
 * Auth Token Generation
 * Connects to MongoDB, signs a JWT for a seed user, persists a
 * Session record, then disconnects.
 * ————————————————————————————————————— */
async function getAuthToken() {
  // ── Connect to MongoDB ──
  await mongoose.connect(process.env.MONGO_URI);

  // ── Define minimal inline models for the seed script ──
  const User = mongoose.model('User', new mongoose.Schema({ email: String, session_version: Number }));
  const Session = mongoose.model('Session', new mongoose.Schema({ user_id: mongoose.Schema.Types.ObjectId, token_id: String, device: String, ip: String, user_agent: String }));

  // ── Look up the seed user ──
  const user = await User.findOne({ email: 'sarthak@gmail.com' });
  if (!user) throw new Error('User not found');

  // ── Sign a JWT with a unique jti ──
  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    { id: user._id, session_version: user.session_version || 0, jti: tokenId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // ── Persist the Session record ──
  await Session.create({
    user_id: user._id,
    token_id: tokenId,
    device: 'Automated Browser Verifier',
    ip: '127.0.0.1',
    user_agent: 'AntigravityVerifier',
  });

  // ── Disconnect and return the token ──
  await mongoose.disconnect();
  return token;
}

/* —————————————————————————————————————
 * CDP Client
 * Thin wrapper around a WebSocket connection to a Chrome DevTools
 * Protocol endpoint. Tracks request ids and resolves responses.
 * ————————————————————————————————————— */
class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.resolvers = new Map();
  }

  // ── Wait for the WebSocket to open, then wire up message handling ──
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id && this.resolvers.has(data.id)) {
          const { resolve, reject } = this.resolvers.get(data.id);
          this.resolvers.delete(data.id);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
    });
  }

  // ── Send a CDP command and return a promise for the result ──
  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.resolvers.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // ── Close the WebSocket ──
  close() {
    this.ws.close();
  }
}

// ── Promise-based sleep helper ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* —————————————————————————————————————
 * Main Routine
 * Launches Chrome, connects via CDP, and captures each screenshot.
 * ————————————————————————————————————— */
async function main() {
  // ── Step 1: Generate an auth token ──
  console.log('1. Generating token...');
  const token = await getAuthToken();

  // ── Prepare a fresh Chrome profile directory ──
  const userDataDir = `/tmp/chrome_cdp_${Date.now()}`;
  fs.mkdirSync(userDataDir, { recursive: true });

  // ── Step 2: Launch headless Chrome ──
  console.log('2. Launching headless Chrome...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  // ── Wait for the debugging endpoint to become available ──
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://localhost:${DEBUG_PORT}/json/version`);
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch { }
  }

  // ── Abort if Chrome never came up ──
  if (!wsUrl) {
    chromeProc.kill();
    throw new Error('Failed to connect to Chrome debugging port');
  }

  // ── Open a fresh target page and get its WebSocket URL ──
  const targetRes = await fetch(`http://localhost:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' });
  const targetData = await targetRes.json();
  const pageWsUrl = targetData.webSocketDebuggerUrl;

  // ── Connect the CDP client ──
  const cdp = new CDPClient(pageWsUrl);
  await cdp.connect();

  // ── Enable the CDP domains we use ──
  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');

  // ── Helper: set the viewport size and device scale ──
  const setViewport = async (width, height, isMobile = false) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: isMobile,
    });
    await cdp.send('Emulation.setVisibleSize', { width, height });
  };

  // ── Helper: capture a PNG after resizing the viewport ──
  const capture = async (filename, width = 1440, height = 900, isMobile = false) => {
    await setViewport(width, height, isMobile);
    await sleep(1500);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Captured: ${filename}`);
  };

  try {
    // ── 1. Dashboard at 1440x1350 ──
    console.log('Navigating to Dashboard...');
    await setViewport(1440, 1350, false);
    await cdp.send('Page.navigate', { url: `http://localhost:5173/?token=${token}` });
    await sleep(3500);
    await capture('compact_dashboard_1440.png', 1440, 1350, false);

    // ── 2. Dashboard at 1920x1080 and mobile ──
    await capture('compact_dashboard_1920.png', 1920, 1080, false);
    await capture('compact_dashboard_mobile_390.png', 390, 844, true);

    // ── 3. Transactions page ──
    console.log('Navigating to Transactions...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/transactions' });
    await sleep(2000);
    await capture('compact_transactions_1440.png', 1440, 900, false);

    // ── 4. Calendar page (desktop + mobile) ──
    console.log('Navigating to Calendar...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/calendar' });
    await sleep(2000);
    await capture('compact_calendar_1440.png', 1440, 900, false);
    await capture('compact_calendar_mobile_390.png', 390, 844, true);

    // ── 5. Analytics page ──
    console.log('Navigating to Analytics...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/analytics' });
    await sleep(2500);
    await capture('compact_analytics_1440.png', 1440, 900, false);

    console.log('All compact screenshots captured!');
  } finally {
    // ── Tear down: close CDP, kill Chrome, remove temp profile ──
    cdp.close();
    chromeProc.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch { }
  }
}

// ── Entry point: run and surface fatal errors ──
main().catch((err) => {
  console.error('Fatal error during capture:', err);
  process.exit(1);
});