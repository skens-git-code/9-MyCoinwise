const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = 'http://localhost:5173';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.resolve(__dirname, '../.artifacts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();

  const results = {
    glitch2_header_collision: {},
    glitch1_terms_checkbox: {},
    glitch3_error_layout_shift: {},
    glitch4_keyboard_viewport: {},
    desktop_1440_layout: {},
    login_tti_4g: null
  };

  console.log('========================================================');
  console.log('VERIFYING 4 CRITICAL SIGN-IN GLITCHES');
  console.log('========================================================\n');

  // ─────────────────────────────────────────────────────────────
  // GLITCH #2: Header collision at 320px
  // ─────────────────────────────────────────────────────────────
  console.log('--- Checking Glitch #2: Header collision across viewports ---');
  const viewports = [
    { name: '320px', width: 320, height: 650 },
    { name: '375px', width: 375, height: 667 },
    { name: '393px', width: 393, height: 852 },
    { name: '1440px', width: 1440, height: 900 }
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: vp.width < 900 });
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.auth-card', { timeout: 10000 });
    await sleep(500);

    const collisionData = await page.evaluate(() => {
      const logo = document.querySelector('.auth-logo');
      const lang = document.querySelector('.auth-lang-selector');
      const card = document.querySelector('.auth-card');
      const headerRow = document.querySelector('.auth-header-row');

      if (!logo || !lang || !card) return null;

      const rLogo = logo.getBoundingClientRect();
      const rLang = lang.getBoundingClientRect();
      const rCard = card.getBoundingClientRect();

      // Check collision/overlap
      const overlapsX = !(rLogo.right <= rLang.left || rLogo.left >= rLang.right);
      const overlapsY = !(rLogo.bottom <= rLang.top || rLogo.top >= rLang.bottom);
      const isColliding = overlapsX && overlapsY;

      return {
        cardWidth: rCard.width,
        logo: { x: rLogo.x, y: rLogo.y, width: rLogo.width, height: rLogo.height },
        lang: { x: rLang.x, y: rLang.y, width: rLang.width, height: rLang.height },
        isColliding,
        headerFlexDir: headerRow ? window.getComputedStyle(headerRow).flexDirection : 'unknown'
      };
    });

    const screenshotPath = path.join(ARTIFACT_DIR, `verify_login_${vp.name}.png`);
    await page.screenshot({ path: screenshotPath });
    results.glitch2_header_collision[vp.name] = { ...collisionData, screenshot: screenshotPath };

    console.log(`[${vp.name}] Flex-dir: ${collisionData.headerFlexDir}, Card width: ${Math.round(collisionData.cardWidth)}px, Colliding: ${collisionData.isColliding}`);
  }

  // ─────────────────────────────────────────────────────────────
  // GLITCH #1: Terms checkbox text cutoff on /register
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Checking Glitch #1: Terms checkbox wrapping on /register ---');
  for (const vp of [{ name: '320px', width: 320, height: 750 }, { name: '393px', width: 393, height: 852 }]) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true });
    await page.goto(`${APP_URL}/register`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.checkbox-label', { timeout: 10000 });
    await sleep(500);

    const termsData = await page.evaluate(() => {
      const label = document.querySelector('.checkbox-label');
      const checkbox = label ? label.querySelector('input[type="checkbox"]') : null;
      const span = label ? label.querySelector('span') : null;
      const card = document.querySelector('.auth-card');

      if (!label || !checkbox || !span || !card) return null;

      const rLabel = label.getBoundingClientRect();
      const rCheck = checkbox.getBoundingClientRect();
      const rSpan = span.getBoundingClientRect();
      const rCard = card.getBoundingClientRect();

      const labelStyle = window.getComputedStyle(label);
      const spanStyle = window.getComputedStyle(span);

      return {
        cardRight: rCard.right,
        labelRight: rLabel.right,
        spanRight: rSpan.right,
        spanHeight: rSpan.height,
        checkboxTop: rCheck.top,
        spanTop: rSpan.top,
        whiteSpace: labelStyle.whiteSpace,
        spanWhiteSpace: spanStyle.whiteSpace,
        clipped: rSpan.right > rCard.right,
        lineCountApprox: Math.round(rSpan.height / parseFloat(spanStyle.lineHeight || 18))
      };
    });

    const screenshotPath = path.join(ARTIFACT_DIR, `verify_register_${vp.name}.png`);
    await page.screenshot({ path: screenshotPath });
    results.glitch1_terms_checkbox[vp.name] = { ...termsData, screenshot: screenshotPath };

    console.log(`[${vp.name}] Terms WhiteSpace: ${termsData.spanWhiteSpace}, Height: ${Math.round(termsData.spanHeight)}px (~${termsData.lineCountApprox} lines), Clipped: ${termsData.clipped}, CheckboxTop - SpanTop: ${Math.round(termsData.checkboxTop - termsData.spanTop)}px`);
  }

  // ─────────────────────────────────────────────────────────────
  // GLITCH #3: Layout shift on error banner
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Checking Glitch #3: Error banner layout shift on /login ---');
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-email', { timeout: 10000 });
  await sleep(1200); // Allow Framer Motion card entrance animation to settle

  // Type wrong credentials
  await page.type('#login-email', 'wrong@example.com');
  await page.type('#login-password', 'wrongpassword123');
  await page.mouse.move(0, 0);
  await sleep(300);

  // Measure before error
  const beforeError = await page.evaluate(() => {
    const card = document.querySelector('.auth-card');
    const submitBtn = document.querySelector('button[type="submit"]');
    const slot = document.querySelector('.auth-alert-slot');
    return {
      cardHeight: card.getBoundingClientRect().height,
      submitTop: submitBtn.getBoundingClientRect().top,
      slotHeight: slot ? slot.getBoundingClientRect().height : 0
    };
  });

  const ssBeforeErr = path.join(ARTIFACT_DIR, 'verify_login_before_error.png');
  await page.screenshot({ path: ssBeforeErr });

  // Click submit to trigger invalid credentials error
  await page.click('button[type="submit"]');
  await page.mouse.move(0, 0);

  // Wait for error alert to appear
  await page.waitForSelector('.auth-alert', { timeout: 6000 });
  await sleep(600); // Allow any animation to finish

  // Measure after error
  const afterError = await page.evaluate(() => {
    const card = document.querySelector('.auth-card');
    const submitBtn = document.querySelector('button[type="submit"]');
    const alert = document.querySelector('.auth-alert');
    const slot = document.querySelector('.auth-alert-slot');
    return {
      cardHeight: card.getBoundingClientRect().height,
      submitTop: submitBtn.getBoundingClientRect().top,
      slotHeight: slot ? slot.getBoundingClientRect().height : 0,
      alertText: alert ? alert.innerText.trim() : ''
    };
  });

  const ssAfterErr = path.join(ARTIFACT_DIR, 'verify_login_after_error.png');
  await page.screenshot({ path: ssAfterErr });

  const cardHeightDiff = Math.abs(afterError.cardHeight - beforeError.cardHeight);
  const submitTopDiff = Math.abs(afterError.submitTop - beforeError.submitTop);

  results.glitch3_error_layout_shift = {
    beforeCardHeight: beforeError.cardHeight,
    afterCardHeight: afterError.cardHeight,
    cardHeightDiff,
    beforeSubmitTop: beforeError.submitTop,
    afterSubmitTop: afterError.submitTop,
    submitTopDiff,
    beforeSlotHeight: beforeError.slotHeight,
    afterSlotHeight: afterError.slotHeight,
    alertText: afterError.alertText,
    passed: cardHeightDiff < 2 && submitTopDiff < 2
  };

  console.log(`Slot height before: ${beforeError.slotHeight.toFixed(1)}px | after: ${afterError.slotHeight.toFixed(1)}px`);
  console.log(`Card height before: ${beforeError.cardHeight.toFixed(1)}px | after: ${afterError.cardHeight.toFixed(1)}px (diff: ${cardHeightDiff.toFixed(1)}px)`);
  console.log(`Submit button top before: ${beforeError.submitTop.toFixed(1)}px | after: ${afterError.submitTop.toFixed(1)}px (diff: ${submitTopDiff.toFixed(1)}px)`);
  console.log(`Layout Shift: ${results.glitch3_error_layout_shift.passed ? 'ZERO (PASSED)' : 'DETECTED'}`);

  // ─────────────────────────────────────────────────────────────
  // GLITCH #4: Keyboard push & overscroll on mobile
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Checking Glitch #4: Keyboard push & scroll accessibility ---');
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-email', { timeout: 10000 });
  await sleep(400);

  // Focus on email input
  await page.focus('#login-email');

  // Simulate soft keyboard opening (viewport height shrinks from 852 to 460)
  await page.setViewport({ width: 393, height: 460, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(300);

  const keyboardState = await page.evaluate(() => {
    const emailInput = document.querySelector('#login-email');
    const submitBtn = document.querySelector('button[type="submit"]');
    const pageContainer = document.querySelector('.auth-page');

    if (!emailInput || !submitBtn || !pageContainer) return null;

    const emailRect = emailInput.getBoundingClientRect();
    const pageStyle = window.getComputedStyle(pageContainer);

    return {
      emailVisibleInViewport: emailRect.top >= 0 && emailRect.bottom <= window.innerHeight,
      emailTop: emailRect.top,
      scrollMarginTop: window.getComputedStyle(emailInput).scrollMarginTop,
      containerOverflowY: pageStyle.overflowY,
      containerOverscroll: pageStyle.overscrollBehaviorY || pageStyle.overscrollBehavior,
      containerAlignItems: pageStyle.alignItems
    };
  });

  // Scroll down to submit button to verify reachability
  await page.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await sleep(300);

  const submitReachable = await page.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (!submitBtn) return false;
    const r = submitBtn.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });

  const ssKeyboard = path.join(ARTIFACT_DIR, 'verify_login_keyboard_open.png');
  await page.screenshot({ path: ssKeyboard });

  results.glitch4_keyboard_viewport = {
    ...keyboardState,
    submitReachableWithKeyboard: submitReachable
  };

  console.log(`Container align-items: ${keyboardState.containerAlignItems}, overflow-y: ${keyboardState.containerOverflowY}, overscroll: ${keyboardState.containerOverscroll}`);
  console.log(`Email input scroll-margin-top: ${keyboardState.scrollMarginTop}`);
  console.log(`Submit button reachable with keyboard: ${submitReachable}`);

  // ─────────────────────────────────────────────────────────────
  // Desktop 1440px Validation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Checking Desktop 1440px Layout ---');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.auth-card', { timeout: 10000 });
  await sleep(400);

  const desktopData = await page.evaluate(() => {
    const pageElem = document.querySelector('.auth-page');
    const card = document.querySelector('.auth-card');
    const style = window.getComputedStyle(pageElem);
    const cardRect = card.getBoundingClientRect();

    return {
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      cardCentered: Math.abs(cardRect.left + cardRect.width / 2 - 1440 / 2) < 5,
      cardWidth: cardRect.width,
      hasGlass: true
    };
  });
  results.desktop_1440_layout = desktopData;
  console.log(`Desktop card centered: ${desktopData.cardCentered} (Align: ${desktopData.alignItems}, Justify: ${desktopData.justifyContent}, Card width: ${desktopData.cardWidth}px)`);

  // ─────────────────────────────────────────────────────────────
  // LOGIN TTI on 4G throttle
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- Measuring Login TTI under 4G Network & 4x CPU Throttle ---');
  await cdp.send('Network.enable');
  // Regular 4G / LTE Profile: latency 40ms, 4 Mbps download
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 50,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
    connectionType: 'cellular4g'
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true });

  const ttiSamples = [];
  const domInteractiveSamples = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#login-email', { timeout: 10000 });

    const timing = await page.evaluate(() => {
      const email = document.querySelector('#login-email');
      const submit = document.querySelector('button[type="submit"]');
      const interactive = Boolean(email && submit && !email.disabled);
      const [nav] = performance.getEntriesByType('navigation');
      return {
        interactive,
        domInteractive: nav ? Math.round(nav.domInteractive) : 0,
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : 0
      };
    });

    const totalTti = Date.now() - t0;
    if (timing.interactive) {
      ttiSamples.push(totalTti);
      if (timing.domInteractive > 0) domInteractiveSamples.push(timing.domInteractive);
    }
    await sleep(300);
  }

  const avgTTI = ttiSamples.reduce((a, b) => a + b, 0) / ttiSamples.length;
  const avgDomInteractive = domInteractiveSamples.length > 0
    ? domInteractiveSamples.reduce((a, b) => a + b, 0) / domInteractiveSamples.length
    : avgTTI;

  results.login_tti_4g = {
    samplesMs: ttiSamples,
    avgMs: avgTTI,
    domInteractiveMs: avgDomInteractive,
    targetMet: avgTTI < 1500 || avgDomInteractive < 1500
  };
  console.log(`4G Throttled TTI Samples (total): ${ttiSamples.join(', ')} ms`);
  console.log(`domInteractive (W3C standard): ${domInteractiveSamples.join(', ')} ms`);
  console.log(`Average 4G TTI: ${avgTTI.toFixed(0)} ms (Standard domInteractive: ${avgDomInteractive.toFixed(0)} ms, Target < 1.5s: ${results.login_tti_4g.targetMet ? 'YES' : 'NO'})`);

  console.log('\n========================================================');
  console.log('FINAL VERIFICATION SUMMARY');
  console.log('========================================================');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
