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

    // ── GLITCH #6: Transactions filter dropdown truncation ───────────
    console.log('=== Repro Glitch #6: Transactions Filters Truncation at 393px ===');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('mcw-token', token);
      localStorage.setItem('mcw-onboarding-completed', 'true');
      localStorage.setItem('mcw_has_onboarded', 'true');
      localStorage.setItem('has_seen_onboarding', 'true');
    }, TOKEN);

    await page.goto(`${APP_URL}/transactions`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const filterInfo = await page.evaluate(() => {
      const controls = document.querySelector('.il-controls');
      if (!controls) return { error: 'il-controls not found' };

      const selects = Array.from(controls.querySelectorAll('select')).map(s => {
        const rect = s.getBoundingClientRect();
        const style = window.getComputedStyle(s);
        const selectedText = s.options[s.selectedIndex]?.text || '';
        return {
          ariaLabel: s.getAttribute('aria-label'),
          selectedText,
          width: rect.width,
          scrollWidth: s.scrollWidth,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          fontSize: style.fontSize,
          isTruncated: s.scrollWidth > rect.width
        };
      });

      const controlsStyle = window.getComputedStyle(controls);
      return {
        flexDirection: controlsStyle.flexDirection,
        flexWrap: controlsStyle.flexWrap,
        gap: controlsStyle.gap,
        selects
      };
    });

    console.log('Filter Controls Info:', JSON.stringify(filterInfo, null, 2));

    const glitch6Path = path.join(ARTIFACT_DIR, 'repro_transactions_filter_truncation_393px.png');
    await page.screenshot({ path: glitch6Path });
    console.log('Captured Glitch #6 screenshot:', glitch6Path);

    // Also at 320px
    await page.setViewport({ width: 320, height: 600, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await sleep(500);
    const glitch6Path320 = path.join(ARTIFACT_DIR, 'repro_transactions_filter_truncation_320px.png');
    await page.screenshot({ path: glitch6Path320 });
    console.log('Captured Glitch #6 320px screenshot:', glitch6Path320);

    // ── GLITCH #7: Dashboard balance "flash of 0" ─────────────────────
    console.log('\n=== Repro Glitch #7: Dashboard Balance Flash of 0 ===');
    await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    // Enable network throttling (Slow 4G: 500kbps, 150ms RTT)
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (500 * 1024) / 8,
      uploadThroughput: (500 * 1024) / 8,
    });

    // Start navigation and sample balance text node rapidly
    const balanceSamples = [];
    let initialZeroCaptured = false;

    // Use page.evaluateOnNewDocument to intercept early paints
    await page.evaluateOnNewDocument(() => {
      window.__balanceSamples = [];
      const interval = setInterval(() => {
        const heroH2 = document.querySelector('.bento-hero h2');
        const text = heroH2 ? heroH2.innerText.trim() : null;
        window.__balanceSamples.push({ t: performance.now(), text });
      }, 50);
      window.__stopSampling = () => clearInterval(interval);
    });

    await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });

    for (let i = 0; i < 20; i++) {
      const currentVal = await page.evaluate(() => {
        const heroH2 = document.querySelector('.bento-hero h2');
        return heroH2 ? heroH2.innerText.trim() : null;
      });
      balanceSamples.push({ step: i, val: currentVal });
      if (currentVal && (currentVal.includes('0.00') || currentVal === '₹0' || currentVal === '$0' || currentVal.includes('0')) && !initialZeroCaptured) {
        initialZeroCaptured = true;
        const glitch7Path = path.join(ARTIFACT_DIR, 'repro_dashboard_balance_flash_zero.png');
        await page.screenshot({ path: glitch7Path });
        console.log(`Captured Glitch #7 at step ${i} ("${currentVal}"):`, glitch7Path);
      }
      await sleep(100);
    }

    const recordedSamples = await page.evaluate(() => {
      if (window.__stopSampling) window.__stopSampling();
      return window.__balanceSamples ? window.__balanceSamples.slice(0, 30) : [];
    });

    console.log('Balance mount timeline samples:', balanceSamples);
    console.log('Early DOM samples:', recordedSamples.filter(s => s.text).slice(0, 10));

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Repro failed:', err);
  process.exit(1);
});
