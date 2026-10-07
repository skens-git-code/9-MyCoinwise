const puppeteer = require('puppeteer');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = 'http://localhost:5173';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.resolve(__dirname, '../.artifacts');
const TOKEN = 'mock-auth-token-for-testing';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      if (req.url().includes('/api/transactions') || req.url().includes('/api/accounts')) {
        console.log('Delaying API request by 1000ms:', req.url());
        await sleep(1000);
      }
      req.continue();
    });

    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('mcw-token', token);
      localStorage.setItem('mcw-onboarding-completed', 'true');
      localStorage.setItem('mcw_has_onboarded', 'true');
      localStorage.setItem('has_seen_onboarding', 'true');
    }, TOKEN);

    console.log('Navigating to Dashboard with 1000ms API delay...');
    const samples = [];
    const startTime = Date.now();
    let zeroShotCaptured = false;

    // Navigate to dashboard
    page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });

    while (Date.now() - startTime < 3500) {
      const text = await page.evaluate(() => {
        const hero = document.querySelector('.bento-hero h2');
        return hero ? hero.innerText.trim() : null;
      });

      if (text !== null) {
        const elapsed = Date.now() - startTime;
        samples.push({ elapsed, text });
        if ((text === '₹0.00' || text === '$0.00' || text === '₹0' || text === '$0') && !zeroShotCaptured) {
          zeroShotCaptured = true;
          const p = path.join(ARTIFACT_DIR, 'repro_dashboard_balance_flash_zero.png');
          await page.screenshot({ path: p });
          console.log(`\n>>> CAPTURED EXACT 0.00 FLASH MOMENT at ${elapsed}ms: "${text}" -> ${p}\n`);
        }
      }
      await sleep(25);
    }

    console.log('Transitions summary:');
    const transitions = [];
    for (const s of samples) {
      if (transitions.length === 0 || transitions[transitions.length - 1].text !== s.text) {
        transitions.push(s);
      }
    }
    console.log(transitions);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
