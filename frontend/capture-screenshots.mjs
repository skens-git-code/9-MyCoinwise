import { chromium } from './node_modules/playwright/index.mjs';

const ARTIFACT_DIR = '/Users/sarthakmathapati/.gemini/antigravity-ide/brain/1f0e5e69-255d-4358-b6de-c165c1acf9fc';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE_ERROR:', msg.text());
  });

  await page.route((url) => url.port === '5001' || url.hostname.includes('onrender.com'), async (route) => {
    const urlStr = route.request().url();
    if (urlStr.includes('/health')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'OK' }) });
    } else if (urlStr.includes('/auth/me') || urlStr.includes('/users/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _id: 'u1',
          id: 'u1',
          username: 'Alex',
          email: 'alex@example.com',
          avatar: 'user1',
          currency: 'USD',
          theme: 'light',
          balance: 1540.50,
          role: 'user',
        }),
      });
    } else if (urlStr.includes('/users')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ _id: 'u1', username: 'Alex', email: 'alex@example.com' }]),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem('mcw-token', 'mock-valid-token-123');
    localStorage.setItem('mcw-onboarding-completed', 'true');
    localStorage.setItem('mcw-theme', 'light');
    localStorage.setItem('mcw_cookie_consent', 'accepted');
  });

  console.log('Navigating to Dashboard...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 1. Capture full mobile dashboard
  await page.screenshot({ path: `${ARTIFACT_DIR}/mobile_dashboard_verified.png`, fullPage: false });
  console.log('Saved mobile_dashboard_verified.png');

  // 2. Capture mobile header close-up
  const header = await page.$('.island-header');
  if (header) {
    await header.screenshot({ path: `${ARTIFACT_DIR}/mobile_header_verified.png` });
    console.log('Saved mobile_header_verified.png');
  } else {
    console.log('Header not found!');
  }

  // 3. Click hamburger button to capture click state
  const hamburger = await page.$('.mobile-hamburger-btn');
  if (hamburger) {
    await hamburger.click();
    await page.waitForTimeout(300);
    const headerAfterClick = await page.$('.island-header');
    if (headerAfterClick) {
      await headerAfterClick.screenshot({ path: `${ARTIFACT_DIR}/mobile_hamburger_clicked_verified.png` });
      console.log('Saved mobile_hamburger_clicked_verified.png');
    }
    const backdrop = await page.$('.mobile-drawer-overlay');
    if (backdrop) await backdrop.click();
    await page.waitForTimeout(300);
  }

  // 4. Capture bottom dock close-up
  const dock = await page.$('.mobile-bottom-dock');
  if (dock) {
    await dock.screenshot({ path: `${ARTIFACT_DIR}/mobile_bottom_dock_verified.png` });
    console.log('Saved mobile_bottom_dock_verified.png');
  } else {
    console.log('Dock not found!');
  }

  await browser.close();
  console.log('All verification screenshots saved successfully!');
}

main().catch(console.error);
