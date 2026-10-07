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

    // Set auth
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('mcw-token', token);
      localStorage.setItem('mcw-onboarding-completed', 'true');
      localStorage.setItem('mcw_has_onboarded', 'true');
      localStorage.setItem('has_seen_onboarding', 'true');
    }, TOKEN);

    // Setup network request delay on transaction & accounts APIs to emulate Slow 4G server delay
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      if (req.url().includes('/api/transactions') || req.url().includes('/api/accounts')) {
        await sleep(600);
      }
      req.continue();
    });

    console.log('--- Starting Mount Sequence Capture at 100ms intervals ---');
    // Navigate to dashboard
    const navPromise = page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });

    const timeline = [];
    let sawZero = false;
    let sawPlaceholder = false;

    for (let i = 0; i <= 25; i++) {
      const ms = i * 100;
      await sleep(100);

      const state = await page.evaluate(() => {
        const hero = document.querySelector('.bento-hero h2');
        const placeholder = document.querySelector('.balance-placeholder');
        const incomeStat = document.querySelector('.bento-income .sc-val');
        const expenseStat = document.querySelector('.bento-expense .sc-val');

        return {
          heroText: hero ? hero.innerText.trim() : null,
          hasPlaceholder: !!placeholder,
          incomeText: incomeStat ? incomeStat.innerText.trim() : null,
          expenseText: expenseStat ? expenseStat.innerText.trim() : null
        };
      });

      timeline.push({ time: `${ms}ms`, state });

      if (state.heroText === '₹0.00' || state.heroText === '$0.00' || state.heroText === '0.00') {
        sawZero = true;
      }
      if (state.hasPlaceholder || state.heroText === '--') {
        sawPlaceholder = true;
      }

      // Capture interval screenshots
      if (i === 1 || i === 4 || i === 7 || i === 10) {
        const shotPath = path.join(ARTIFACT_DIR, `verify_dashboard_mount_${ms}ms.png`);
        await page.screenshot({ path: shotPath });
      }
    }

    await navPromise;

    console.log('Mount Timeline recorded:');
    for (const t of timeline) {
      console.log(`[${t.time}] Hero: ${t.state.heroText}, Placeholder: ${t.state.hasPlaceholder}, Income: ${t.state.incomeText}, Expense: ${t.state.expenseText}`);
    }

    console.log('\n--- Glitch #7 Verification Checklist ---');
    console.log('1. Saw "0.00" flash?:', sawZero ? 'YES (FAIL)' : 'NO (PASSED)');
    console.log('2. First paint showed "--" placeholder?:', sawPlaceholder ? 'YES (PASSED)' : 'NO');
    console.log('3. Final balance after data arrival:', timeline[timeline.length - 1].state.heroText);

    if (sawZero) {
      throw new Error('Glitch #7 failed: "0.00" flash was visible during mount sequence');
    }
    console.log('\n>>> GLITCH #7 VERIFICATION PASSED: ZERO FLASH ELIMINATED! <<<');

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
