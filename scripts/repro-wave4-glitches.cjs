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

    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
      localStorage.setItem('mcw-token', token);
      localStorage.setItem('mcw-onboarding-completed', 'true');
      localStorage.setItem('mcw_has_onboarded', 'true');
      localStorage.setItem('has_seen_onboarding', 'true');
    }, TOKEN);

    // ── REPRO GLITCH #8 & #9: /goals ──
    console.log('=== Repro Glitch #8 & #9: /goals ===');
    await page.goto(`${APP_URL}/goals`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    // Check confetti canvas presence in DOM
    const canvasExists = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return { exists: false };
      return {
        exists: true,
        styleWidth: c.style.width,
        styleHeight: c.style.height,
        zIndex: c.style.zIndex,
        rect: c.getBoundingClientRect()
      };
    });
    console.log('Confetti Canvas in DOM when idle:', canvasExists);

    // Check goals summary carousel cards clipping
    const goalsCardsInfo = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.carousel-item')).map(item => {
        const lbl = item.querySelector('.ci-lbl');
        const val = item.querySelector('.ci-val');
        const rect = item.getBoundingClientRect();
        const lblRect = lbl ? lbl.getBoundingClientRect() : null;
        return {
          label: lbl ? lbl.innerText : null,
          itemWidth: rect.width,
          itemRight: rect.right,
          lblText: lbl ? lbl.innerText : null,
          lblScrollWidth: lbl ? lbl.scrollWidth : null,
          lblWidth: lblRect ? lblRect.width : null,
          clipped: lbl ? lbl.scrollWidth > lblRect.width : false
        };
      });
      return items;
    });
    console.log('Goals Carousel Items:', goalsCardsInfo);

    const glitch8Path = path.join(ARTIFACT_DIR, 'repro_goals_stat_clipping_393px.png');
    await page.screenshot({ path: glitch8Path });
    console.log('Captured Glitch #8 screenshot:', glitch8Path);

    // ── REPRO GLITCH #11: /budgets duplicate buttons ──
    console.log('\n=== Repro Glitch #11: /budgets Duplicate CTA ===');
    await page.goto(`${APP_URL}/budgets`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const budgetButtonsInfo = await page.evaluate(() => {
      const headerBtn = document.querySelector('.budget-page header button.btn-primary');
      const emptyStateBtn = document.querySelector('.budget-page .glass button.btn-primary') || Array.from(document.querySelectorAll('button.btn-primary')).find(b => b.innerText.includes('Budget') && b !== headerBtn);

      return {
        headerBtn: headerBtn ? { text: headerBtn.innerText, rect: headerBtn.getBoundingClientRect() } : null,
        emptyStateBtn: emptyStateBtn ? { text: emptyStateBtn.innerText, rect: emptyStateBtn.getBoundingClientRect() } : null,
        bothVisible: !!(headerBtn && emptyStateBtn)
      };
    });
    console.log('Budget Buttons Info:', budgetButtonsInfo);

    const glitch11Path = path.join(ARTIFACT_DIR, 'repro_budgets_duplicate_cta.png');
    await page.screenshot({ path: glitch11Path });
    console.log('Captured Glitch #11 screenshot:', glitch11Path);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
