const puppeteer = require('puppeteer');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = 'http://localhost:5173';
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

    await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const htmlSnippet = await page.evaluate(() => {
      return {
        url: window.location.href,
        hasHero: !!document.querySelector('.bento-hero'),
        h2Text: document.querySelector('.bento-hero h2')?.innerText,
        allH2: Array.from(document.querySelectorAll('h2')).map(h => h.innerText)
      };
    });
    console.log('Page check:', htmlSnippet);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
