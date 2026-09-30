const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = 'http://localhost:5173';
const ARTIFACT_DIR = '/Users/sarthakmathapati/.gemini/antigravity-ide/brain/5ad6895f-0bda-4a4f-8003-ab84b7adba1d';
const TOKEN = 'mock-auth-token-for-testing';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();

  // Emulate 4x CPU throttle
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Set mobile viewport (iPhone 14 Pro: 393 x 852)
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');

  console.log('--- 1. Capturing Sign-In & Register Glitches ---');
  // Clear auth for login page
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  const loginMobilePath = path.join(ARTIFACT_DIR, 'glitch_login_mobile.png');
  await page.screenshot({ path: loginMobilePath });
  console.log(`Saved ${loginMobilePath}`);

  // Switch to Register or view Register
  await page.goto(`${APP_URL}/register`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  const registerMobilePath = path.join(ARTIFACT_DIR, 'glitch_register_mobile.png');
  await page.screenshot({ path: registerMobilePath });
  console.log(`Saved ${registerMobilePath}`);

  // Test 320px width for login
  await page.setViewport({ width: 320, height: 600, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1000);
  const login320Path = path.join(ARTIFACT_DIR, 'glitch_login_320px.png');
  await page.screenshot({ path: login320Path });
  console.log(`Saved ${login320Path}`);

  // Re-set to iPhone 14 Pro
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  console.log('--- 2. Capturing Dashboard & Transactions (Authenticated) ---');
  await page.evaluateOnNewDocument((token) => {
    localStorage.setItem('mcw-token', token);
    localStorage.setItem('mcw_has_onboarded', 'true');
    localStorage.setItem('has_seen_onboarding', 'true');
  }, TOKEN);

  await page.evaluate((token) => {
    localStorage.setItem('mcw-token', token);
    localStorage.setItem('mcw_has_onboarded', 'true');
    localStorage.setItem('has_seen_onboarding', 'true');
  }, TOKEN);

  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  const dashboardMobilePath = path.join(ARTIFACT_DIR, 'glitch_dashboard_mobile.png');
  await page.screenshot({ path: dashboardMobilePath });
  console.log(`Saved ${dashboardMobilePath}`);

  // Transactions page
  await page.goto(`${APP_URL}/transactions`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  const txnsMobilePath = path.join(ARTIFACT_DIR, 'glitch_transactions_mobile.png');
  await page.screenshot({ path: txnsMobilePath });
  console.log(`Saved ${txnsMobilePath}`);

  console.log('--- 3. Capturing Savings Pages (Goals, Budgets, Subscriptions) ---');
  await page.goto(`${APP_URL}/goals`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  const goalsMobilePath = path.join(ARTIFACT_DIR, 'glitch_goals_mobile.png');
  await page.screenshot({ path: goalsMobilePath });
  console.log(`Saved ${goalsMobilePath}`);

  await page.goto(`${APP_URL}/budgets`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  const budgetsMobilePath = path.join(ARTIFACT_DIR, 'glitch_budgets_mobile.png');
  await page.screenshot({ path: budgetsMobilePath });
  console.log(`Saved ${budgetsMobilePath}`);

  await page.goto(`${APP_URL}/subscriptions`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  const subsMobilePath = path.join(ARTIFACT_DIR, 'glitch_subscriptions_mobile.png');
  await page.screenshot({ path: subsMobilePath });
  console.log(`Saved ${subsMobilePath}`);

  console.log('--- 4. Capturing Desktop Baseline (1440px) ---');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  const dashDesktopPath = path.join(ARTIFACT_DIR, 'glitch_dashboard_desktop_1440.png');
  await page.screenshot({ path: dashDesktopPath });
  console.log(`Saved ${dashDesktopPath}`);

  await browser.close();
  console.log('Inventory capture complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
