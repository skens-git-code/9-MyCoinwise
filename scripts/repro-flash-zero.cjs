const puppeteer = require('puppeteer');
const path = require('path');

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

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    // Set up auth token and onboarding
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('mcw-token', token);
      localStorage.setItem('mcw-onboarding-completed', 'true');
      localStorage.setItem('mcw_has_onboarded', 'true');
      localStorage.setItem('has_seen_onboarding', 'true');
    }, TOKEN);

    // Go to /transactions first, so user session and app are fully booted
    await page.goto(`${APP_URL}/transactions`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    // Delay transactions and accounts API by 1500ms
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      if (req.url().includes('/api/transactions') || req.url().includes('/api/accounts')) {
        await sleep(1200);
      }
      req.continue();
    });

    console.log('Navigating from /transactions to / (Dashboard)...');
    // Click dock Home button to navigate client-side to Dashboard
    const homeBtn = await page.$('.mobile-bottom-dock button:first-child') || await page.$('a[href="/"]');
    if (homeBtn) {
      await homeBtn.click();
    } else {
      await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
    }

    const startTime = Date.now();
    let zeroShotCaptured = false;
    const samples = [];

    while (Date.now() - startTime < 3000) {
      const balanceText = await page.evaluate(() => {
        const h2 = document.querySelector('.bento-hero h2');
        return h2 ? h2.innerText.trim() : null;
      });

      if (balanceText !== null) {
        samples.push({ t: Date.now() - startTime, balanceText });
        if ((balanceText.includes('0.00') || balanceText === '₹0' || balanceText === '$0') && !zeroShotCaptured) {
          zeroShotCaptured = true;
          const p = path.join(ARTIFACT_DIR, 'repro_dashboard_balance_flash_zero.png');
          await page.screenshot({ path: p });
          console.log(`Captured Flash of 0 moment: "${balanceText}" -> ${p}`);
        }
      }
      await sleep(50);
    }

    console.log('Sampled values:', samples.slice(0, 15));
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
