const puppeteer = require('puppeteer');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = 'http://localhost:5173';
const TOKEN = 'mock-auth-token-for-testing';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');

  await page.evaluateOnNewDocument((token) => {
    localStorage.setItem('mcw-token', token);
    localStorage.setItem('mcw_has_onboarded', 'true');
    localStorage.setItem('has_seen_onboarding', 'true');
  }, TOKEN);

  const client = await page.target().createCDPSession();

  const pages = [
    { name: 'Dashboard', path: '/' },
    { name: 'Calendar', path: '/calendar' },
    { name: 'Analytics', path: '/analytics' },
    { name: 'Transactions', path: '/transactions' },
    { name: 'Wealth', path: '/wealth' },
    { name: 'Settings', path: '/settings' }
  ];

  console.log('=== MEASURING MOBILE LAYER COUNTS ===');
  for (const p of pages) {
    await page.goto(APP_URL + p.path, { waitUntil: 'networkidle2' });
    await sleep(1500);

    // Count layer candidates in DOM (elements creating stacking contexts / layers)
    const domLayerCount = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      let count = 1; // Root layer
      for (const el of els) {
        const style = window.getComputedStyle(el);
        if (
          style.position === 'fixed' ||
          style.position === 'sticky' ||
          style.willChange.includes('transform') ||
          style.willChange.includes('opacity') ||
          (style.backdropFilter && style.backdropFilter !== 'none') ||
          (style.webkitBackdropFilter && style.webkitBackdropFilter !== 'none')
        ) {
          count++;
        }
      }
      return count;
    });

    // Also get CDP LayerTree if active
    let cdpLayers = 0;
    try {
      await client.send('LayerTree.enable');
      const promise = new Promise((resolve) => {
        const handler = (evt) => {
          client.off('LayerTree.layerTreeDidChange', handler);
          resolve(evt.layers ? evt.layers.length : 0);
        };
        client.on('LayerTree.layerTreeDidChange', handler);
        setTimeout(() => resolve(0), 1000);
      });
      await client.send('DOM.getDocument');
      cdpLayers = await promise;
    } catch (e) {
      // ignore
    }

    console.log(`${p.name}: DOM Layer Triggers = ${domLayerCount}, CDP LayerTree Layers = ${cdpLayers}`);
  }

  // Also check desktop (1440x900) to ensure glass is NOT broken on desktop
  console.log('\n=== VERIFYING DESKTOP (1440x900) GLASS FIDELITY ===');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.goto(APP_URL + '/', { waitUntil: 'networkidle2' });
  await sleep(1000);

  const desktopCheck = await page.evaluate(() => {
    const glassCard = document.querySelector('.glass');
    if (!glassCard) return { found: false };
    const style = window.getComputedStyle(glassCard);
    return {
      found: true,
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
      background: style.background,
    };
  });
  console.log('Desktop Glass Check:', desktopCheck);

  await browser.close();
}

run().catch(console.error);
