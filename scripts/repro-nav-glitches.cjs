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

  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  // 1. REPRO GLITCH #15: Onboarding tour trapped behind dock
  console.log('--- Repro Glitch #15: Onboarding Tour vs Dock ---');
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => {
    localStorage.setItem('mcw-token', token);
    localStorage.removeItem('mcw-onboarding-completed');
    localStorage.removeItem('mcw_has_onboarded');
    localStorage.removeItem('has_seen_onboarding');
  }, TOKEN);

  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
  // Wait for onboarding tour to trigger (it triggers after 1200ms in AppLayout)
  await sleep(2500);

  const onboardingState = await page.evaluate(() => {
    const tourModal = document.querySelector('.onboarding-tour-card') || document.querySelector('.shortcuts-modal');
    const dock = document.querySelector('.mobile-bottom-dock');
    const backdrop = document.querySelector('.shortcuts-backdrop');

    if (!tourModal || !dock) return { error: 'Tour modal or dock not found', tourFound: !!tourModal, dockFound: !!dock };

    const rModal = tourModal.getBoundingClientRect();
    const rDock = dock.getBoundingClientRect();
    const dockZ = window.getComputedStyle(dock).zIndex;
    const backdropZ = backdrop ? window.getComputedStyle(backdrop).zIndex : 'none';

    // Check if dock covers the bottom of the tour modal
    const overlaps = !(rModal.right <= rDock.left || rModal.left >= rDock.right || rModal.bottom <= rDock.top || rModal.top >= rDock.bottom);

    return {
      modalBottom: rModal.bottom,
      dockTop: rDock.top,
      dockZ,
      backdropZ,
      overlaps,
      trapped: overlaps && parseInt(dockZ, 10) >= parseInt(backdropZ, 10)
    };
  });
  console.log('Onboarding state:', onboardingState);

  const ssOnboarding = path.join(ARTIFACT_DIR, 'repro_onboarding_dock.png');
  await page.screenshot({ path: ssOnboarding });
  console.log(`Saved ${ssOnboarding}`);

  // 2. REPRO GLITCH #10: Bottom dock obscures content on /subscriptions
  console.log('\n--- Repro Glitch #10: Subscriptions bottom content obscured by dock ---');
  await page.evaluate(() => {
    localStorage.setItem('mcw-onboarding-completed', 'true');
    localStorage.setItem('mcw_has_onboarded', 'true');
  });
  await page.goto(`${APP_URL}/subscriptions`, { waitUntil: 'networkidle2' });
  await sleep(1000);

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);

  const subscriptionsState = await page.evaluate(() => {
    const dock = document.querySelector('.mobile-bottom-dock');
    const cards = document.querySelectorAll('.masonry-card, .sub-timeline-box, .subscriptions-page-wrap *');
    const rDock = dock ? dock.getBoundingClientRect() : null;

    let lowestBottom = 0;
    let lowestElem = null;
    document.querySelectorAll('.subscriptions-page-wrap div').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom > lowestBottom && r.height > 20) {
        lowestBottom = r.bottom;
        lowestElem = { class: el.className, bottom: r.bottom };
      }
    });

    return {
      dockTop: rDock ? rDock.top : null,
      lowestBottom,
      obscuredByDock: rDock ? lowestBottom > rDock.top : false
    };
  });
  console.log('Subscriptions bottom state:', subscriptionsState);

  const ssSubs = path.join(ARTIFACT_DIR, 'repro_subscriptions_dock_obscure.png');
  await page.screenshot({ path: ssSubs });
  console.log(`Saved ${ssSubs}`);

  // 3. REPRO GLITCH #5: Bottom nav active indicator artifact
  console.log('\n--- Repro Glitch #5: Bottom nav active indicator artifact ---');
  const dockArtifact = await page.evaluate(() => {
    const dock = document.querySelector('.mobile-bottom-dock');
    const activeItem = document.querySelector('.dock-item.active');
    const activeDot = document.querySelector('.dock-active-dot');

    if (!dock) return null;
    const rDock = dock.getBoundingClientRect();
    const rDot = activeDot ? activeDot.getBoundingClientRect() : null;

    return {
      dockRect: { y: rDock.y, height: rDock.height, bottom: rDock.bottom },
      dotRect: rDot ? { y: rDot.y, height: rDot.height, bottom: rDot.bottom } : null,
      dockOverflow: window.getComputedStyle(dock).overflow,
      dotProtruding: rDot ? rDot.bottom > rDock.bottom : false
    };
  });
  console.log('Dock artifact state:', dockArtifact);

  const ssDock = path.join(ARTIFACT_DIR, 'repro_dock_active_artifact.png');
  await page.screenshot({ path: ssDock });
  console.log(`Saved ${ssDock}`);

  await browser.close();
}

main().catch(console.error);
