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

    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('mcw-token', token);
      localStorage.setItem('mcw-onboarding-completed', 'true');
      localStorage.setItem('mcw_has_onboarded', 'true');
      localStorage.setItem('has_seen_onboarding', 'true');
    }, TOKEN);

    // Intercept transactions to return empty array initially, then trigger update
    await page.setRequestInterception(true);
    let initialCall = true;
    page.on('request', async (req) => {
      if (req.url().includes('/api/transactions')) {
        if (initialCall) {
          initialCall = false;
          console.log('Returning initial empty transactions to simulate initial load/0 balance...');
          await req.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
          });
          return;
        }
      }
      req.continue();
    });

    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(500);

    const val = await page.evaluate(() => {
      return document.querySelector('.bento-hero h2')?.innerText;
    });
    console.log('Initial balance rendered before real data arrived:', val);

    const reproPath = path.join(ARTIFACT_DIR, 'repro_dashboard_balance_flash_zero.png');
    await page.screenshot({ path: reproPath });
    console.log('Saved repro screenshot of 0.00 flash:', reproPath);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
