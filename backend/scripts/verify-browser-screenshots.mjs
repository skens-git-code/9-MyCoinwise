import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const ARTIFACTS_DIR = '/Users/sarthakmathapati/.gemini/antigravity-ide/brain/525c3019-2b4f-40c0-a89a-785bd8296a23';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9222;

async function getAuthToken() {
  await mongoose.connect(process.env.MONGO_URI);
  const User = mongoose.model('User', new mongoose.Schema({ email: String, session_version: Number }));
  const Session = mongoose.model('Session', new mongoose.Schema({ user_id: mongoose.Schema.Types.ObjectId, token_id: String, device: String, ip: String, user_agent: String }));

  const user = await User.findOne({ email: 'sarthak@gmail.com' });
  if (!user) throw new Error('User not found');

  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    { id: user._id, session_version: user.session_version || 0, jti: tokenId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  await Session.create({
    user_id: user._id,
    token_id: tokenId,
    device: 'Automated Browser Verifier',
    ip: '127.0.0.1',
    user_agent: 'AntigravityVerifier',
  });

  await mongoose.disconnect();
  return token;
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.resolvers = new Map();
  }

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

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.resolvers.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('1. Generating token...');
  const token = await getAuthToken();

  const userDataDir = `/tmp/chrome_cdp_${Date.now()}`;
  fs.mkdirSync(userDataDir, { recursive: true });

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

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://localhost:${DEBUG_PORT}/json/version`);
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch {}
  }

  if (!wsUrl) {
    chromeProc.kill();
    throw new Error('Failed to connect to Chrome debugging port');
  }

  const targetRes = await fetch(`http://localhost:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' });
  const targetData = await targetRes.json();
  const pageWsUrl = targetData.webSocketDebuggerUrl;

  const cdp = new CDPClient(pageWsUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');

  const setViewport = async (width, height, isMobile = false) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: isMobile,
    });
    await cdp.send('Emulation.setVisibleSize', { width, height });
  };

  const capture = async (filename, width = 1440, height = 900, isMobile = false) => {
    await setViewport(width, height, isMobile);
    await sleep(800);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const outPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Captured: ${filename}`);
  };

  try {
    // 1. Dashboard 1440x900
    console.log('Navigating to Dashboard...');
    await setViewport(1440, 900, false);
    await cdp.send('Page.navigate', { url: `http://localhost:5173/?token=${token}` });
    await sleep(3500);
    await capture('compact_dashboard_1440.png', 1440, 900, false);

    // 2. Dashboard 1920x1080 (Wide monitor)
    await capture('compact_dashboard_1920.png', 1920, 1080, false);

    // 3. Transactions 1440x900
    console.log('Navigating to Transactions...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/transactions' });
    await sleep(2000);
    await capture('compact_transactions_1440.png', 1440, 900, false);

    // 4. Calendar 1440x900
    console.log('Navigating to Calendar...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/calendar' });
    await sleep(2000);
    await capture('compact_calendar_1440.png', 1440, 900, false);

    // 5. Analytics 1440x900
    console.log('Navigating to Analytics...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/analytics' });
    await sleep(2500);
    await capture('compact_analytics_1440.png', 1440, 900, false);

    console.log('All compact screenshots captured!');
  } finally {
    cdp.close();
    chromeProc.kill();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Fatal error during capture:', err);
  process.exit(1);
});
