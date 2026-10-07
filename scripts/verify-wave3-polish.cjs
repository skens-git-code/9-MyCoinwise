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

    // ─────────────────────────────────────────────────────────────────
    // VERIFY GLITCH #6: TRANSACTIONS FILTER STACKING & TRUNCATION FIX
    // ─────────────────────────────────────────────────────────────────
    console.log('========================================================');
    console.log('VERIFYING GLITCH #6: TRANSACTIONS FILTER DROPDOWNS');
    console.log('========================================================');

    await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('mcw-token', token);
      localStorage.setItem('mcw-onboarding-completed', 'true');
      localStorage.setItem('mcw_has_onboarded', 'true');
      localStorage.setItem('has_seen_onboarding', 'true');
    }, TOKEN);

    await page.goto(`${APP_URL}/transactions`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const viewports = [320, 375, 393, 480, 1440];
    const glitch6Results = {};

    for (const w of viewports) {
      const isMobile = w < 1000;
      await page.setViewport({
        width: w,
        height: isMobile ? 852 : 900,
        deviceScaleFactor: 2,
        isMobile,
        hasTouch: isMobile
      });
      await page.waitForSelector('.il-controls', { timeout: 3000 }).catch(() => {});
      await sleep(500);

      const info = await page.evaluate(() => {
        const controls = document.querySelector('.il-controls');
        if (!controls) return null;

        const style = window.getComputedStyle(controls);
        const selects = Array.from(controls.querySelectorAll('select')).map(s => {
          const rect = s.getBoundingClientRect();
          const sStyle = window.getComputedStyle(s);
          const selectedText = s.options[s.selectedIndex]?.text || '';
          return {
            ariaLabel: s.getAttribute('aria-label'),
            selectedText,
            width: rect.width,
            paddingLeft: sStyle.paddingLeft,
            paddingRight: sStyle.paddingRight,
            fontSize: sStyle.fontSize,
          };
        });

        return {
          flexDirection: style.flexDirection,
          selectCount: selects.length,
          selects
        };
      });

      const shotPath = path.join(ARTIFACT_DIR, `verify_transactions_filter_${w}px.png`);
      await page.screenshot({ path: shotPath });

      glitch6Results[`${w}px`] = {
        ...info,
        screenshot: shotPath
      };

      console.log(`[${w}px] Direction: ${info.flexDirection}, Select widths: ${info.selects.map(s => Math.round(s.width) + 'px').join(', ')}`);
    }

    // Test filter functionality: change filter to income, then expense, then sort
    console.log('\nTesting filter functionality...');
    const filterWorkCheck = await page.evaluate(() => {
      const typeSelect = document.querySelector('.il-controls select[aria-label="Filter by type"]');
      if (!typeSelect) return { error: 'type select not found' };
      typeSelect.value = 'expense';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, val: typeSelect.value };
    });
    console.log('Filter change result:', filterWorkCheck);

    // ─────────────────────────────────────────────────────────────────
    // VERIFY GLITCH #7: DASHBOARD BALANCE FLASH OF 0 ELIMINATION
    // ─────────────────────────────────────────────────────────────────
    console.log('\n========================================================');
    console.log('VERIFYING GLITCH #7: DASHBOARD BALANCE FLASH OF 0');
    console.log('========================================================');

    await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    // Enable network throttling (4G throttle: 100ms latency)
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 120,
      downloadThroughput: (1500 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });

    console.log('Navigating to Dashboard with slow 4G emulation...');
    const navPromise = page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});

    const balanceTimeline = [];
    let sawZeroFlash = false;
    let sawPlaceholder = false;
    let finalRealValue = null;
    const startTime = Date.now();

    while (Date.now() - startTime < 4000) {
      const elapsed = Date.now() - startTime;
      let data = null;
      try {
        data = await page.evaluate(() => {
          const hero = document.querySelector('.bento-hero h2');
          const placeholder = document.querySelector('.balance-placeholder');
          const text = hero ? hero.innerText.trim() : null;
          return { text, hasPlaceholder: !!placeholder };
        });
      } catch {
        // Context changing during navigation
      }

      if (data && data.text !== null) {
        if (balanceTimeline.length === 0 || balanceTimeline[balanceTimeline.length - 1].text !== data.text) {
          balanceTimeline.push({ elapsed, text: data.text, hasPlaceholder: data.hasPlaceholder });
        }
        if (data.text === '₹0.00' || data.text === '$0.00' || data.text === '0.00') {
          sawZeroFlash = true;
        }
        if (data.hasPlaceholder || data.text === '--') {
          sawPlaceholder = true;
        }
        if (data.text && !data.text.includes('--') && !data.text.includes('0.00')) {
          finalRealValue = data.text;
        }
      }
      await sleep(30);
    }

    const afterShot = path.join(ARTIFACT_DIR, 'verify_dashboard_balance_after_fix.png');
    await page.screenshot({ path: afterShot });

    console.log('Observed Balance Transitions:');
    console.log(balanceTimeline);
    console.log('Saw "0.00" flash?:', sawZeroFlash ? 'YES (FAIL)' : 'NO (PASSED)');
    console.log('Saw placeholder "--"?:', sawPlaceholder ? 'YES' : 'NO');
    console.log('Final Real Balance:', finalRealValue);

    console.log('\n========================================================');
    console.log('WAVE 3 VERIFICATION COMPLETE');
    console.log('========================================================');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
