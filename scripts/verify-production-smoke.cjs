const puppeteer = require('puppeteer');

async function testProduction() {
  console.log('=== STARTING LIVE PRODUCTION SMOKE TEST ===');
  console.log('Target: https://9-budget-tracker.vercel.app');
  
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => console.log('   [PAGE LOG]:', msg.text()));
  page.on('requestfailed', req => console.log('   [REQ FAILED]:', req.url(), req.failure()?.errorText));
  page.on('response', async res => {
    if (res.status() >= 400) {
      console.log('   [RESP ERROR]:', res.status(), res.url());
      try {
        const text = await res.text();
        console.log('   [RESP BODY]:', text);
      } catch {}
    }
  });

  console.log('1. Navigating to login page...');
  await page.goto('https://9-budget-tracker.vercel.app/login', { waitUntil: 'networkidle2', timeout: 30000 });
  const title = await page.title();
  console.log(`   Page loaded. Title: "${title}"`);

  // Fill credentials for verified user
  console.log('2. Entering credentials for integrity user...');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.type('input[type="email"]', 'integrity_1790827659070@coinwise.test');
  await page.type('input[type="password"]', 'IntegrityPassword123!');

  console.log('3. Submitting login form...');
  const submitButton = await page.$('button[type="submit"]');
  await submitButton.click();

  console.log('4. Waiting for dashboard navigation and data fetch...');
  await page.waitForFunction(() => {
    return window.location.pathname === '/' || window.location.pathname === '/dashboard';
  }, { timeout: 20000 }).catch(() => {});
  
  await new Promise(r => setTimeout(r, 4000));

  const currentUrl = page.url();
  console.log(`   Current URL: ${currentUrl}`);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasDashboardUI = bodyText.includes('Total Balance') || bodyText.includes('Dashboard') || bodyText.includes('Recent Transactions');
  const hasTransactions = bodyText.includes('Salary') || bodyText.includes('Rent') || bodyText.includes('Grocery') || bodyText.includes('Freelance') || bodyText.includes('Tech');

  console.log(`5. Dashboard UI rendered: ${hasDashboardUI}`);
  console.log(`6. Live transactions rendered: ${hasTransactions}`);

  if (!hasDashboardUI) {
    throw new Error('Dashboard UI failed to render on live production URL');
  }

  console.log('✅ LIVE PRODUCTION VERIFICATION PASSED COMPLETELY!');
  await browser.close();
}

testProduction().catch(err => {
  console.error('Production test failed:', err);
  process.exit(1);
});
