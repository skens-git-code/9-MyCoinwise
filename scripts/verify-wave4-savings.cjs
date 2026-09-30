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

    // ─────────────────────────────────────────────────────────────────
    // 1. VERIFY GLITCH #8: GOALS SUMMARY CARDS CLIPPING FIX
    // ─────────────────────────────────────────────────────────────────
    console.log('========================================================');
    console.log('VERIFYING GLITCH #8: GOALS STAT CARDS CLIPPING');
    console.log('========================================================');

    await page.goto(`${APP_URL}/goals`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const testViewports = [320, 393, 768, 1440];
    for (const w of testViewports) {
      const isMobile = w < 1000;
      await page.setViewport({ width: w, height: isMobile ? 852 : 900, deviceScaleFactor: 2, isMobile, hasTouch: isMobile });
      await sleep(400);

      const itemsInfo = await page.evaluate((vpWidth) => {
        const items = Array.from(document.querySelectorAll('.carousel-item')).map(item => {
          const lbl = item.querySelector('.ci-lbl');
          const val = item.querySelector('.ci-val');
          const r = item.getBoundingClientRect();
          const lblR = lbl ? lbl.getBoundingClientRect() : null;
          return {
            labelText: lbl ? lbl.innerText : '',
            itemWidth: r.width,
            itemRight: r.right,
            isFullyInsideViewport: r.right <= vpWidth + 5,
            lblClipped: lbl ? lbl.scrollWidth > (lblR.width + 1) : false
          };
        });
        return {
          totalCards: items.length,
          allCardsInsideViewport: items.every(i => i.isFullyInsideViewport),
          items
        };
      }, w);

      console.log(`[${w}px] Total cards: ${itemsInfo.totalCards}, All inside viewport: ${itemsInfo.allCardsInsideViewport}`);
      for (const it of itemsInfo.items) {
        console.log(`   - "${it.labelText}": width=${Math.round(it.itemWidth)}px, right=${Math.round(it.itemRight)}px, clipped=${it.lblClipped}`);
      }

      const shotPath = path.join(ARTIFACT_DIR, `verify_goals_cards_${w}px.png`);
      await page.screenshot({ path: shotPath });
      console.log(`Saved screenshot: ${shotPath}`);
    }

    // ─────────────────────────────────────────────────────────────────
    // 2. VERIFY GLITCH #9: CONFETTI CANVAS MOUNTING & LIFECYCLE
    // ─────────────────────────────────────────────────────────────────
    console.log('\n========================================================');
    console.log('VERIFYING GLITCH #9: CONFETTI CANVAS IDLE & TRIGGER LIFECYCLE');
    console.log('========================================================');

    await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`${APP_URL}/goals`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    const idleCanvasCheck = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return { canvasInDom: !!c };
    });
    console.log('Canvas in DOM when idle:', idleCanvasCheck.canvasInDom ? 'YES (FAIL)' : 'NO (PASSED)');

    // ─────────────────────────────────────────────────────────────────
    // 3. VERIFY GLITCH #11: DUPLICATE "CREATE BUDGET" CTA ELIMINATION
    // ─────────────────────────────────────────────────────────────────
    console.log('\n========================================================');
    console.log('VERIFYING GLITCH #11: DUPLICATE "CREATE BUDGET" CTA');
    console.log('========================================================');

    await page.goto(`${APP_URL}/budgets`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const budgetButtonsCheck = await page.evaluate(() => {
      const headerBtn = document.querySelector('.budget-page header button.btn-primary');
      const emptyStateBtn = document.querySelector('.budget-page .glass button.btn-primary') ||
        Array.from(document.querySelectorAll('button.btn-primary')).find(b => b.innerText.includes('Budget') && b !== headerBtn);

      const allBudgetButtons = Array.from(document.querySelectorAll('button.btn-primary'))
        .filter(b => b.innerText.includes('Budget'))
        .map(b => ({ text: b.innerText.trim(), visible: b.offsetWidth > 0 && b.offsetHeight > 0 }));

      return {
        headerBtnVisible: !!headerBtn,
        emptyStateBtnVisible: !!emptyStateBtn,
        allBudgetButtonsCount: allBudgetButtons.length,
        buttons: allBudgetButtons
      };
    });

    console.log('Budget Buttons in Empty State:', budgetButtonsCheck);
    console.log('Single contextual button rendered?:', budgetButtonsCheck.allBudgetButtonsCount === 1 ? 'YES (PASSED)' : 'NO (FAIL)');

    const shotBudget = path.join(ARTIFACT_DIR, 'verify_budgets_empty_state_cta.png');
    await page.screenshot({ path: shotBudget });
    console.log(`Saved screenshot: ${shotBudget}`);

    console.log('\n========================================================');
    console.log('WAVE 4 VERIFICATION COMPLETE');
    console.log('========================================================');

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
