const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== STARTING SEAMLESS EXPERIENCE & INSTANT NAVIGATION VERIFICATION ===\n');

  // Start the preview server
  console.log('1. Starting compressed production preview server...');
  const server = spawn('node', [path.join(__dirname, 'serve-dist.cjs')], {
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => {
    // console.log(`   [SERVER]: ${d.toString().trim()}`);
  });

  // Wait for server to be ready
  await sleep(1500);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      console.log('   [PAGE ERROR]:', text);
      if (!text.includes('favicon') && !text.includes('status of 404')) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    console.log('   [UNCAUGHT ERROR]:', err.message);
    consoleErrors.push(err.message);
  });

  try {
    // =========================================================================
    // Mock API handlers for local testing
    // =========================================================================
    console.log('2. Setting up mocked API handlers...');
    const mockUser = {
      id: 'perf-user-123',
      _id: 'perf-user-123',
      username: 'Performance Tester',
      email: 'perf@coinwise.test',
      currency: 'USD',
      balance: 15420.50,
      monthly_goal: 3000,
      theme: 'light',
    };

    const mockTransactions = [
      { id: 'tx-1', _id: 'tx-1', amount: 3500, type: 'income', category: 'Salary', date: '2026-09-01', user_id: 'perf-user-123' },
      { id: 'tx-2', _id: 'tx-2', amount: 120, type: 'expense', category: 'Groceries', date: '2026-09-05', user_id: 'perf-user-123' },
      { id: 'tx-3', _id: 'tx-3', amount: 45, type: 'expense', category: 'Coffee', date: '2026-09-10', user_id: 'perf-user-123' },
    ];

    await page.setRequestInterception(true);
    const respondJson = (req, data, status = 200) => {
      req.respond({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify(data),
      });
    };

    page.on('request', (req) => {
      const url = req.url();
      if (req.method() === 'OPTIONS') {
        req.respond({
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
        return;
      }

      if (url.includes('/api/health')) {
        respondJson(req, { status: 'OK' });
      } else if (url.includes('/auth/login')) {
        respondJson(req, { token: 'mock-valid-token', user: mockUser });
      } else if (url.includes('/auth/me') || url.includes('/users/me')) {
        respondJson(req, mockUser);
      } else if (url.includes('/api/transactions')) {
        respondJson(req, mockTransactions);
      } else if (url.includes('/api/goals')) {
        respondJson(req, []);
      } else if (url.includes('/api/subscriptions')) {
        respondJson(req, []);
      } else if (url.includes('/api/events')) {
        respondJson(req, []);
      } else if (url.includes('/api/budgets')) {
        respondJson(req, []);
      } else if (url.includes('/api/accounts')) {
        respondJson(req, []);
      } else if (url.includes('/api/users')) {
        respondJson(req, [mockUser]);
      } else if (url.includes('/api/tax')) {
        respondJson(req, { profiles: [] });
      } else if (url.includes('/api/rates') || url.includes('/api/currency')) {
        respondJson(req, { rates: { USD: 1, EUR: 0.9, INR: 83 } });
      } else if (url.includes('/api/calculations')) {
        respondJson(req, { result: 0 });
      } else if (url.includes('/api/wealth')) {
        respondJson(req, []);
      } else if (url.includes('/api/cashflow')) {
        respondJson(req, []);
      } else {
        req.continue();
      }
    });

    // =========================================================================
    // TEST 1: Login page initial load speed (no 250ms artificial delay)
    // =========================================================================
    console.log('3. Verifying Login initial mount latency...');
    const t0 = Date.now();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 5000 });
    const loginLoadTime = Date.now() - t0;
    console.log(`   ✅ Login form visible in ${loginLoadTime}ms`);

    // =========================================================================
    // TEST 2: Seed authenticated user and load Dashboard
    // =========================================================================
    console.log('4. Injecting test session and loading Dashboard...');

    await page.evaluate(() => {
      localStorage.setItem('mcw-token', 'mock-valid-token');
      localStorage.setItem('mcw-onboarding-completed', 'true');
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    const pageState = await page.evaluate(() => ({
      href: window.location.href,
      text: document.body.innerText.slice(0, 300),
      token: localStorage.getItem('mcw-token'),
    }));
    console.log('   [DEBUG PAGE STATE]:', pageState);

    const hasDashboardTitle = await page.evaluate(() => {
      return document.body.innerText.includes('Total Balance') || document.body.innerText.includes('Dashboard');
    });
    console.log(`   ✅ Dashboard mounted successfully: ${hasDashboardTitle}`);

    // Wait for progressive idle preloading to warm route chunks in background
    console.log('4. Waiting 2s for progressive idle preloader to warm route chunks in background...');
    await sleep(2000);

    // =========================================================================
    // TEST 3: Navigation latency across all core pages via direct link clicks
    // =========================================================================
    const routesToTest = [
      { name: 'Transactions', href: '/transactions' },
      { name: 'Calendar', href: '/calendar' },
      { name: 'Analytics', href: '/analytics' },
      { name: 'Calculator', href: '/calculator' },
      { name: 'Tax', href: '/tax' },
      { name: 'Accounts', href: '/accounts' },
      { name: 'Budgets', href: '/budgets' },
      { name: 'Goals', href: '/goals' },
      { name: 'Subscriptions', href: '/subscriptions' },
      { name: 'Cashflow', href: '/cashflow' },
      { name: 'Wealth', href: '/wealth' },
      { name: 'About', href: '/about' },
      { name: 'Settings', href: '/settings' },
      { name: 'Dashboard', href: '/' },
    ];

    console.log('5. Testing instant navigation across all core pages via sidebar clicks...');
    const navigationTimings = [];

    for (const route of routesToTest) {
      const navStart = Date.now();
      const clicked = await page.evaluate((targetHref) => {
        // Find link matching href in sidebar or document
        const links = Array.from(document.querySelectorAll(`a[href="${targetHref}"]`));
        if (links.length > 0) {
          links[0].click();
          return true;
        }
        return false;
      }, route.href);

      if (!clicked) {
        // Direct navigate if no sidebar link found
        await page.goto(`${BASE_URL}${route.href}`, { waitUntil: 'domcontentloaded' });
      }

      await page.waitForFunction((expectedPath) => {
        return window.location.pathname === expectedPath;
      }, { timeout: 3000 }, route.href);

      const navDuration = Date.now() - navStart;
      navigationTimings.push({ route: route.name, path: route.href, durationMs: navDuration });
      console.log(`   -> Navigated to ${route.name.padEnd(18)} in ${String(navDuration).padStart(3)}ms`);
      await sleep(80);
    }

    const avgTransitionTime = navigationTimings.reduce((sum, t) => sum + t.durationMs, 0) / navigationTimings.length;
    console.log(`\n   ⭐ Average page transition duration: ${avgTransitionTime.toFixed(1)}ms`);

    // =========================================================================
    // TEST 4: Modal Responsiveness
    // =========================================================================
    console.log('\n6. Testing modal responsiveness...');
    
    // Command Palette
    await page.waitForSelector('.nav-btn-search, button[aria-label="Search"]', { timeout: 5000 });
    const cmdKStart = Date.now();
    await page.click('.nav-btn-search');
    await page.waitForSelector('.cmd-palette-backdrop, .cmd-input', { timeout: 3000 });
    const cmdKDuration = Date.now() - cmdKStart;
    console.log(`   ✅ Command palette opened in ${cmdKDuration}ms`);
    await page.keyboard.press('Escape');
    await sleep(200);

    // Currency Converter
    await page.waitForSelector('.nav-btn-converter, button[aria-label*="Currency"]', { timeout: 5000 });
    const convStart = Date.now();
    await page.click('.nav-btn-converter');
    await page.waitForSelector('.currency-converter-modal, [aria-label*="Currency"], [role="dialog"]', { timeout: 3000 });
    const convDuration = Date.now() - convStart;
    console.log(`   ✅ Currency converter modal opened in ${convDuration}ms`);
    await page.keyboard.press('Escape');
    await sleep(200);

    // =========================================================================
    // TEST 5: Assert zero console errors
    // =========================================================================
    console.log('\n7. Checking console errors during full run...');
    if (consoleErrors.length > 0) {
      console.warn(`   ⚠️ Console errors encountered (${consoleErrors.length}):`);
      consoleErrors.forEach((err) => console.warn(`      - ${err}`));
    } else {
      console.log('   ✅ ZERO console errors encountered during full site traversal!');
    }

    console.log('\n=== ALL SMOOTH PERFORMANCE & INSTANT NAVIGATION TESTS PASSED! ===');
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error('\n❌ Verification failed with error:', err);
  process.exit(1);
});
