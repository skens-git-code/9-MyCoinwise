const puppeteer = require('puppeteer');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = 'http://localhost:5173';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.resolve(__dirname, '../.artifacts');
const TOKEN = 'mock-auth-token-for-testing';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('=== STARTING NAVIGATION & ONBOARDING CRITICAL VERIFICATION ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    glitch15_onboarding: {},
    glitch10_safe_padding: {},
    glitch5_dock_artifact: {}
  };

  const page = await browser.newPage();

  // =========================================================================
  // 1. VERIFY GLITCH #15: Onboarding Tour Portal & Z-Index Hierarchy
  // =========================================================================
  console.log('--- Testing Glitch #15: Onboarding Tour Portal & Z-Index ---');
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => {
    localStorage.setItem('mcw-token', token);
    localStorage.removeItem('mcw-onboarding-completed');
    localStorage.removeItem('mcw_has_onboarded');
    localStorage.removeItem('has_seen_onboarding');
  }, TOKEN);

  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500); // Wait for onboarding tour trigger

  const onboardingCheck = await page.evaluate(() => {
    const backdrop = document.querySelector('.onboarding-tour-backdrop');
    const card = document.querySelector('.onboarding-tour-card');
    const dock = document.querySelector('.mobile-bottom-dock');
    const isDirectBodyChild = backdrop ? backdrop.parentElement === document.body : false;

    const dockZ = dock ? parseInt(window.getComputedStyle(dock).zIndex, 10) : 0;
    const backdropZ = backdrop ? parseInt(window.getComputedStyle(backdrop).zIndex, 10) : 0;
    const cardZ = card ? parseInt(window.getComputedStyle(card).zIndex, 10) : 0;

    const nextBtn = document.querySelector('.onboarding-tour-card .btn-primary');
    const skipBtn = document.querySelector('.onboarding-tour-card .btn-secondary');

    const nextRect = nextBtn ? nextBtn.getBoundingClientRect() : null;
    const skipRect = skipBtn ? skipBtn.getBoundingClientRect() : null;
    const dockRect = dock ? dock.getBoundingClientRect() : null;

    // Check if next button is clickable and above dock
    const nextAboveDock = nextRect && dockRect ? nextRect.bottom < dockRect.top || backdropZ > dockZ : false;

    return {
      exists: !!card,
      isDirectBodyChild,
      dockZ,
      backdropZ,
      cardZ,
      zHierarchyCorrect: backdropZ === 1100 && dockZ === 900 && backdropZ > dockZ,
      nextVisible: !!nextBtn && nextRect.height >= 38,
      skipVisible: !!skipBtn && skipRect.height >= 38,
      nextAboveDock
    };
  });

  console.log('Onboarding step 1 check:', onboardingCheck);
  results.glitch15_onboarding.step1 = onboardingCheck;

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify_onboarding_step1.png') });

  // Test full flow: click Next through all steps
  for (let s = 1; s <= 3; s++) {
    await page.click('.onboarding-tour-card .btn-primary');
    await sleep(350);
  }

  // Step 4 verification
  const step4Check = await page.evaluate(() => {
    const title = document.querySelector('.onboarding-tour-card h3')?.textContent;
    const finishBtn = document.querySelector('.onboarding-tour-card .btn-primary')?.textContent;
    return { title, finishBtn };
  });
  console.log('Onboarding step 4 check:', step4Check);
  results.glitch15_onboarding.step4 = step4Check;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify_onboarding_step4.png') });

  // Complete tour by clicking Finish Tour
  await page.click('.onboarding-tour-card .btn-primary');
  await sleep(600);

  const completedStorage = await page.evaluate(() => {
    return localStorage.getItem('mcw-onboarding-completed');
  });
  results.glitch15_onboarding.completedInStorage = completedStorage === 'true';
  console.log('Onboarding completed in storage:', completedStorage);

  // Test Onboarding at 320px viewport (iPhone SE 1st gen)
  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluate(() => {
    localStorage.removeItem('mcw-onboarding-completed');
  });
  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  const check320 = await page.evaluate(() => {
    const card = document.querySelector('.onboarding-tour-card');
    const nextBtn = document.querySelector('.onboarding-tour-card .btn-primary');
    const skipBtn = document.querySelector('.onboarding-tour-card .btn-secondary');
    const rCard = card ? card.getBoundingClientRect() : null;
    const rNext = nextBtn ? nextBtn.getBoundingClientRect() : null;
    return {
      cardFitsViewport: rCard ? rCard.bottom <= 568 && rCard.top >= 0 : false,
      nextClickable: rNext ? rNext.bottom <= 568 && rNext.height >= 38 : false,
      cardWidth: rCard ? rCard.width : 0
    };
  });
  console.log('Onboarding at 320x568 check:', check320);
  results.glitch15_onboarding.check320px = check320;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify_onboarding_320px.png') });

  // =========================================================================
  // 2. VERIFY GLITCH #10: Bottom Dock Obscures Page Content
  // =========================================================================
  console.log('\n--- Testing Glitch #10: Safe Bottom Padding for Dock ---');
  await page.evaluate(() => {
    localStorage.setItem('mcw-onboarding-completed', 'true');
  });

  const testPages = [
    { route: '/subscriptions', name: 'Subscriptions', containerSelector: '.subscriptions-page-wrap' },
    { route: '/transactions', name: 'Transactions', containerSelector: '.inbox-layout-page' },
    { route: '/goals', name: 'Goals', containerSelector: '.goals-page-wrap' },
    { route: '/calendar', name: 'Calendar', containerSelector: '.calendar-page-content' }
  ];

  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  for (const p of testPages) {
    await page.goto(`${APP_URL}${p.route}`, { waitUntil: 'networkidle2' });
    await sleep(800);

    // Scroll to the bottom of the page content
    await page.evaluate(() => {
      const scrollable = document.querySelector('.island-content-wrapper') || window;
      if (scrollable.scrollTo) {
        scrollable.scrollTo(0, scrollable.scrollHeight || 10000);
      } else {
        window.scrollTo(0, document.body.scrollHeight);
      }
    });
    await sleep(400);

    const padCheck = await page.evaluate((selector) => {
      const dock = document.querySelector('.mobile-bottom-dock');
      const rDock = dock ? dock.getBoundingClientRect() : null;

      // Find lowest visible content element inside container
      const container = document.querySelector(selector) || document.querySelector('.island-page');
      let lowestBottom = 0;
      let lowestTag = '';

      if (container) {
        container.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.height > 10 && r.width > 20 && r.bottom > lowestBottom) {
            lowestBottom = r.bottom;
            lowestTag = el.tagName + (el.className ? '.' + el.className.split(' ')[0] : '');
          }
        });
      }

      const islandPage = document.querySelector('.island-page');
      const compPaddingBottom = islandPage ? window.getComputedStyle(islandPage).paddingBottom : null;

      return {
        dockTop: rDock ? rDock.top : null,
        lowestBottom,
        lowestTag,
        compPaddingBottom,
        obscuredByDock: rDock ? lowestBottom > rDock.top : false,
        clearance: rDock ? rDock.top - lowestBottom : null
      };
    }, p.containerSelector);

    console.log(`${p.name} safe bottom check:`, padCheck);
    results.glitch10_safe_padding[p.name] = padCheck;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `verify_${p.name.toLowerCase()}_bottom_393px.png`) });
  }

  // Desktop check at 1440px
  console.log('\n--- Desktop check at 1440px ---');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${APP_URL}/subscriptions`, { waitUntil: 'networkidle2' });
  await sleep(600);

  const desktopCheck = await page.evaluate(() => {
    const dock = document.querySelector('.mobile-bottom-dock');
    const dockDisplay = dock ? window.getComputedStyle(dock).display : 'none';
    const islandPage = document.querySelector('.island-page');
    const compPaddingBottom = islandPage ? window.getComputedStyle(islandPage).paddingBottom : null;
    return {
      dockHidden: dockDisplay === 'none',
      desktopPaddingBottom: compPaddingBottom
    };
  });
  console.log('Desktop 1440px check:', desktopCheck);
  results.glitch10_safe_padding.desktop1440px = desktopCheck;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify_desktop_1440px.png') });

  // =========================================================================
  // 3. VERIFY GLITCH #5: Bottom Nav Active Indicator Artifact
  // =========================================================================
  console.log('\n--- Testing Glitch #5: Bottom Nav Active Indicator Artifact ---');
  const viewports = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 393, height: 852 }
  ];

  for (const vp of viewports) {
    await page.setViewport({ ...vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(600);

    // Switch between tabs: / -> /transactions -> /calendar -> /subscriptions
    const tabsToTest = ['/transactions', '/calendar', '/subscriptions', '/'];
    for (const tabRoute of tabsToTest) {
      await page.evaluate((route) => {
        const link = document.querySelector(`.mobile-bottom-dock a[href="${route}"]`);
        if (link) link.click();
      }, tabRoute);
      await sleep(400); // Allow spring transition to settle
    }

    const dockState = await page.evaluate(() => {
      const dock = document.querySelector('.mobile-bottom-dock');
      const activeDot = document.querySelector('.dock-active-dot');
      const activeItem = document.querySelector('.dock-item.active');
      const iconWrapper = activeItem ? activeItem.querySelector('.dock-icon-wrapper') : null;

      if (!dock) return { error: 'dock not found' };

      const rDock = dock.getBoundingClientRect();
      const rDot = activeDot ? activeDot.getBoundingClientRect() : null;
      const dockStyle = window.getComputedStyle(dock);
      const iconWrapperStyle = iconWrapper ? window.getComputedStyle(iconWrapper) : null;

      return {
        dockOverflow: dockStyle.overflow,
        iconWrapperOverflow: iconWrapperStyle ? iconWrapperStyle.overflow : null,
        dockZ: dockStyle.zIndex,
        rDock: { top: rDock.top, bottom: rDock.bottom, height: rDock.height },
        rDot: rDot ? { top: rDot.top, bottom: rDot.bottom, height: rDot.height } : null,
        protrudesBelowDock: rDot ? rDot.bottom > rDock.bottom : false,
        activeItemPresent: !!activeItem
      };
    });

    console.log(`Dock state at ${vp.width}x${vp.height}:`, dockState);
    results.glitch5_dock_artifact[`${vp.width}px`] = dockState;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `verify_dock_tabs_${vp.width}px.png`) });
  }

  await browser.close();

  console.log('\n=== FINAL VERIFICATION SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));

  // Assertions
  const g15_ok = results.glitch15_onboarding.step1?.isDirectBodyChild &&
                 results.glitch15_onboarding.step1?.zHierarchyCorrect &&
                 results.glitch15_onboarding.completedInStorage;
  const g10_ok = !results.glitch10_safe_padding.Subscriptions?.obscuredByDock &&
                 !results.glitch10_safe_padding.Transactions?.obscuredByDock &&
                 results.glitch10_safe_padding.desktop1440px?.dockHidden;
  const g5_ok = results.glitch5_dock_artifact['393px']?.dockOverflow === 'hidden' &&
                !results.glitch5_dock_artifact['393px']?.protrudesBelowDock &&
                results.glitch5_dock_artifact['320px']?.dockOverflow === 'hidden';

  console.log('\nRESULT GLITCH #15 (Onboarding Portal & Z-Index):', g15_ok ? 'PASSED ✅' : 'FAILED ❌');
  console.log('RESULT GLITCH #10 (Safe Bottom Padding for Dock):', g10_ok ? 'PASSED ✅' : 'FAILED ❌');
  console.log('RESULT GLITCH #5 (No Protruding Dock Artifact):', g5_ok ? 'PASSED ✅' : 'FAILED ❌');

  if (g15_ok && g10_ok && g5_ok) {
    console.log('\nALL 3 GLITCHES VERIFIED AND PASSING! 🚀');
    process.exit(0);
  } else {
    console.error('\nSOME VERIFICATIONS FAILED.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
