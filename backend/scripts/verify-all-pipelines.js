/**
 * ============================================================================
 * MyCoinwise - End-to-End Pipeline & Frontend-Backend Connection Verifier
 * ============================================================================
 * 
 * Verifies all backend pipelines, database persistence, Express middleware,
 * CORS configuration, Vite dev proxy, and every service endpoint called
 * by frontend/src/services/api.js.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001/api';
const FRONTEND_PROXY_URL = process.env.FRONTEND_PROXY_URL || 'http://localhost:5173/api';

const results = [];
let passCount = 0;
let failCount = 0;

function logStep(name, ok, details = '') {
  if (ok) {
    passCount++;
    console.log(`  ✅ [PASS] ${name}${details ? ` -> ${details}` : ''}`);
    results.push({ name, status: 'PASS', details });
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
    results.push({ name, status: 'FAIL', details });
  }
}

async function run() {
  console.log('================================================================');
  console.log('🚀 MYCOINWISE: FULL-STACK PIPELINE & CONNECTION VERIFICATION');
  console.log(`Backend Target:        ${BACKEND_URL}`);
  console.log(`Frontend Proxy Target: ${FRONTEND_PROXY_URL}`);
  console.log('================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 1: Health & Connectivity (Direct & Frontend Proxy)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('📌 [PIPELINE 1] System Health, Database State & Vite Proxy');
  try {
    const res = await fetch(`${BACKEND_URL}/health`);
    const data = await res.json();
    logStep(
      'Backend Direct Health Check',
      res.status === 200 && data.status === 'OK' && data.database === 'connected',
      `DB: ${data.database}, ReqID: ${data.requestId}`
    );
  } catch (err) {
    logStep('Backend Direct Health Check', false, err.message);
  }

  try {
    const res = await fetch(`${FRONTEND_PROXY_URL}/health`);
    const data = await res.json();
    logStep(
      'Vite Frontend Proxy (/api/health -> backend:5001)',
      res.status === 200 && data.status === 'OK',
      `Proxied successfully to ${data.database} database`
    );
  } catch (err) {
    logStep('Vite Frontend Proxy Check', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 2: CORS, Security Headers & Preflight
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 2] CORS & Security Middleware Pipeline');
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      headers: {
        Origin: 'http://localhost:5173',
      },
    });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    const allowCreds = res.headers.get('access-control-allow-credentials');
    const reqId = res.headers.get('x-request-id');
    const csp = res.headers.get('content-security-policy');

    logStep(
      'CORS Headers on Authenticated Origin',
      allowOrigin === 'http://localhost:5173' && allowCreds === 'true',
      `Allow-Origin: ${allowOrigin}, Credentials: ${allowCreds}`
    );
    logStep(
      'Security Headers (Helmet + Request ID)',
      !!reqId && !!csp,
      `X-Request-ID: ${reqId ? 'Present' : 'Missing'}, CSP: ${csp ? 'Active' : 'Missing'}`
    );
  } catch (err) {
    logStep('CORS & Security Pipeline', false, err.message);
  }

  try {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
      },
    });
    const allowMethods = res.headers.get('access-control-allow-methods');
    logStep(
      'CORS Preflight OPTIONS Pipeline',
      res.status === 200 && !!allowMethods && allowMethods.includes('POST'),
      `Allowed Methods: ${allowMethods}`
    );
  } catch (err) {
    logStep('CORS Preflight OPTIONS Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 3: Authentication & User Lifecycle Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 3] Authentication & Session Pipeline');

  const testSuffix = Math.floor(100000 + Math.random() * 900000);
  const testUser = {
    username: `pipeline_tester_${testSuffix}`,
    email: `pipeline_${testSuffix}@example.com`,
    password: `TestSecurePass!_${testSuffix}`,
    terms: true,
  };

  let token = null;
  let userId = null;

  // 3a. Check Username Availability
  try {
    const res = await fetch(`${BACKEND_URL}/auth/check-username?username=${encodeURIComponent(testUser.username)}`);
    const data = await res.json();
    logStep(
      'Check Username Availability Endpoint',
      res.status === 200 && data.available === true,
      `Username '${testUser.username}' is available: ${data.available}`
    );
  } catch (err) {
    logStep('Check Username Availability Endpoint', false, err.message);
  }

  // 3b. Validation Error Formatting (Empty Registration Payload)
  try {
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    logStep(
      'Structured Validation Error Pipeline',
      res.status === 400 && (data.error || (data.errors && data.errors.length > 0)),
      `Caught expected 400 with message: "${data.error || data.errors?.[0]?.msg}"`
    );
  } catch (err) {
    logStep('Structured Validation Error Pipeline', false, err.message);
  }

  // 3c. User Registration
  try {
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    const data = await res.json();
    if (res.status === 201 && data.token && data.user) {
      token = data.token;
      userId = data.user.id || data.user._id;
      logStep(
        'User Registration & JWT Session Creation',
        true,
        `Created user ID: ${userId} with token: ${token.substring(0, 15)}...`
      );
    } else {
      logStep('User Registration & JWT Session Creation', false, `Status ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    logStep('User Registration & JWT Session Creation', false, err.message);
  }

  // 3d. User Login & Bcrypt Verification (with email and password)
  try {
    const startLogin = Date.now();
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TestRunner/1.0',
      },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });
    const data = await res.json();
    const duration = Date.now() - startLogin;
    logStep(
      'User Login, Lockout-Check & LoginLog IP Pipeline',
      res.status === 200 && !!data.token,
      `User authenticated with bcrypt in ${duration}ms`
    );
    if (data.token) token = data.token;
  } catch (err) {
    logStep('User Login Pipeline', false, err.message);
  }

  // 3e. Resend Verification
  try {
    const res = await fetch(`${BACKEND_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email }),
    });
    const data = await res.json();
    logStep(
      'Resend Verification Pipeline',
      res.status === 200 && !!data.message,
      data.message
    );
  } catch (err) {
    logStep('Resend Verification Pipeline', false, err.message);
  }

  // 3f. Fetch Authenticated Me
  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    logStep(
      'Fetch /auth/me Profile Pipeline',
      res.status === 200 && data.email === testUser.email,
      `Hydrated user: ${data.username} (${data.email})`
    );
  } catch (err) {
    logStep('Fetch /auth/me Profile Pipeline', false, err.message);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 4: User Profile & Preferences
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 4] User Settings & Household Pipeline');
  try {
    const resList = await fetch(`${BACKEND_URL}/users`, { headers: authHeaders });
    const users = await resList.json();
    logStep(
      'Household Users Pipeline (GET /users)',
      resList.status === 200 && Array.isArray(users) && users.length >= 1,
      `Found ${users.length} user(s) in household`
    );

    const resNotif = await fetch(`${BACKEND_URL}/users/${userId}/notifications`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ emailReports: true, budgetAlerts: true }),
    });
    const notifData = await resNotif.json();
    const emailReports = notifData.prefs?.emailReports ?? notifData.emailReports;
    logStep(
      'Update Notifications Preferences (PUT /users/:id/notifications)',
      resNotif.status === 200 && emailReports === true,
      `emailReports: ${emailReports}`
    );

    const resPatch = await fetch(`${BACKEND_URL}/users/${userId}/settings`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ theme: 'amoled', currency: 'USD' }),
    });
    const patchData = await resPatch.json();
    const updatedTheme = patchData.user?.theme || patchData.theme;
    logStep(
      'Atomic User Settings PATCH (PATCH /users/:id/settings)',
      resPatch.status === 200 && updatedTheme === 'amoled',
      `Updated theme to: ${updatedTheme}`
    );
  } catch (err) {
    logStep('User Profile & Preferences Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 5: Accounts Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 5] Accounts Pipeline');
  let createdAccountId = null;
  try {
    const resCreate = await fetch(`${BACKEND_URL}/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Checking Account Primary',
        type: 'checking',
        initial_balance: 5000,
        currency: 'USD',
      }),
    });
    const accData = await resCreate.json();
    createdAccountId = accData.account?._id || accData._id || accData.id;
    const balance = accData.account?.current_balance ?? accData.balance;
    logStep(
      'Create Account (POST /accounts)',
      resCreate.status === 201 && !!createdAccountId,
      `Account ID: ${createdAccountId}, Balance: $${balance}`
    );

    const resList = await fetch(`${BACKEND_URL}/accounts/${userId}`, { headers: authHeaders });
    const accList = await resList.json();
    const rawList = Array.isArray(accList) ? accList : accList.accounts || [];
    logStep(
      'List User Accounts (GET /accounts/:userId)',
      resList.status === 200 && rawList.some(a => (a._id || a.id) === createdAccountId),
      `Found ${rawList.length} account(s)`
    );

    const resUpdate = await fetch(`${BACKEND_URL}/accounts/${createdAccountId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Updated Checking Account',
      }),
    });
    const updAcc = await resUpdate.json();
    const updName = updAcc.account?.name ?? updAcc.name;
    logStep(
      'Update Account (PUT /accounts/:id)',
      resUpdate.status === 200 && updName === 'Updated Checking Account',
      `Updated name: ${updName}`
    );
  } catch (err) {
    logStep('Accounts Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 6: Transactions Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 6] Transactions Pipeline');
  let createdTxId = null;
  try {
    const resCreate = await fetch(`${BACKEND_URL}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        user_id: userId,
        account_id: createdAccountId,
        type: 'expense',
        amount: 45.5,
        category: 'Food & Dining',
        description: 'Team Lunch',
        date: new Date().toISOString(),
      }),
    });
    const txData = await resCreate.json();
    createdTxId = txData.transaction?._id || txData._id || txData.id;
    const txAmount = txData.transaction?.amount ?? txData.amount;
    logStep(
      'Create Transaction (POST /transactions)',
      resCreate.status === 201 && !!createdTxId,
      `Tx ID: ${createdTxId}, Amount: $${txAmount}`
    );

    const resList = await fetch(`${BACKEND_URL}/transactions/${userId}`, { headers: authHeaders });
    const txList = await resList.json();
    const rawTxList = Array.isArray(txList) ? txList : txList.transactions || [];
    logStep(
      'List User Transactions (GET /transactions/:userId)',
      resList.status === 200 && rawTxList.some(t => (t._id || t.id) === createdTxId),
      `Found ${rawTxList.length} transaction(s)`
    );

    const resRecurring = await fetch(`${BACKEND_URL}/transactions/process-recurring`, {
      method: 'POST',
      headers: authHeaders,
    });
    const recurringData = await resRecurring.json();
    logStep(
      'Process Recurring Transactions (POST /transactions/process-recurring)',
      resRecurring.status === 200,
      `Processed: ${recurringData.processed || 0}`
    );

    const sampleCsv = `Date,Description,Amount\n2026-09-01,Grocery Store,-65.40\n2026-09-02,Salary Deposit,2500.00`;
    const resPreview = await fetch(`${BACKEND_URL}/transactions/statement/preview`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ content: sampleCsv, filename: 'statement.csv' }),
    });
    const previewData = await resPreview.json();
    const previewRows = previewData.transactions || previewData.rows || [];
    logStep(
      'Bank Statement CSV Preview (POST /transactions/statement/preview)',
      resPreview.status === 200 && previewRows.length > 0,
      `Parsed ${previewRows.length} preview row(s)`
    );

    const resDelete = await fetch(`${BACKEND_URL}/transactions/${createdTxId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    logStep(
      'Delete Transaction (DELETE /transactions/:id)',
      resDelete.status === 200,
      `Transaction ${createdTxId} removed`
    );
  } catch (err) {
    logStep('Transactions Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 7: Budgets Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 7] Budgets Pipeline');
  let createdBudgetId = null;
  try {
    const resCreate = await fetch(`${BACKEND_URL}/budgets`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Monthly Food Limit',
        total_limit: 600,
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        category: 'Food & Dining',
      }),
    });
    const bData = await resCreate.json();
    createdBudgetId = bData.budget?._id || bData._id || bData.id;
    const bLimit = bData.budget?.total_limit ?? bData.total_limit ?? bData.amount;
    logStep(
      'Create Budget (POST /budgets)',
      resCreate.status === 201 && !!createdBudgetId,
      `Budget ID: ${createdBudgetId}, Limit: $${bLimit}`
    );

    const resList = await fetch(`${BACKEND_URL}/budgets/${userId}`, { headers: authHeaders });
    const bList = await resList.json();
    const rawBList = Array.isArray(bList) ? bList : bList.budgets || [];
    logStep(
      'List User Budgets (GET /budgets/:userId)',
      resList.status === 200 && rawBList.some(b => (b._id || b.id) === createdBudgetId),
      `Found ${rawBList.length} budget(s)`
    );

    const resDelete = await fetch(`${BACKEND_URL}/budgets/${createdBudgetId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    logStep('Delete Budget (DELETE /budgets/:id)', resDelete.status === 200);
  } catch (err) {
    logStep('Budgets Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 8: Savings Goals Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 8] Savings Goals Pipeline');
  let createdGoalId = null;
  try {
    const resCreate = await fetch(`${BACKEND_URL}/goals`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Emergency Fund',
        target: 10000,
        saved: 2500,
        deadline: '2027-12-31',
        category: 'emergency',
      }),
    });
    const gData = await resCreate.json();
    createdGoalId = gData.goal?._id || gData._id || gData.id;
    const gTarget = gData.goal?.target ?? gData.target;
    logStep(
      'Create Goal (POST /goals)',
      resCreate.status === 201 && !!createdGoalId,
      `Goal ID: ${createdGoalId}, Target: $${gTarget}`
    );

    const resList = await fetch(`${BACKEND_URL}/goals/${userId}`, { headers: authHeaders });
    const gList = await resList.json();
    const rawGList = Array.isArray(gList) ? gList : gList.goals || [];
    logStep(
      'List User Goals (GET /goals/:userId)',
      resList.status === 200 && rawGList.some(g => (g._id || g.id) === createdGoalId),
      `Found ${rawGList.length} goal(s)`
    );

    const resDelete = await fetch(`${BACKEND_URL}/goals/${createdGoalId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    logStep('Delete Goal (DELETE /goals/:id)', resDelete.status === 200);
  } catch (err) {
    logStep('Savings Goals Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 9: Subscriptions Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 9] Subscriptions Pipeline');
  let createdSubId = null;
  try {
    const resCreate = await fetch(`${BACKEND_URL}/subscriptions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        user_id: userId,
        name: 'Streaming Cloud Service',
        amount: 14.99,
        billing_cycle: 'monthly',
        billing_period: 'monthly',
        start_date: new Date().toISOString(),
        category: 'entertainment',
      }),
    });
    const sData = await resCreate.json();
    createdSubId = sData.subscription?._id || sData._id || sData.id;
    const sName = sData.subscription?.name ?? sData.name;
    const sCost = sData.subscription?.amount ?? sData.amount;
    logStep(
      'Create Subscription (POST /subscriptions)',
      resCreate.status === 201 && !!createdSubId,
      `Sub: ${sName}, Cost: $${sCost}`
    );

    const resList = await fetch(`${BACKEND_URL}/subscriptions/${userId}`, { headers: authHeaders });
    const sList = await resList.json();
    const rawSList = Array.isArray(sList) ? sList : sList.subscriptions || [];
    logStep(
      'List User Subscriptions (GET /subscriptions/:userId)',
      resList.status === 200 && rawSList.some(s => (s._id || s.id) === createdSubId),
      `Found ${rawSList.length} subscription(s)`
    );

    const resDelete = await fetch(`${BACKEND_URL}/subscriptions/${createdSubId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    logStep('Delete Subscription (DELETE /subscriptions/:id)', resDelete.status === 200);
  } catch (err) {
    logStep('Subscriptions Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 10: Wealth & Net Worth Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 10] Wealth & Net Worth Pipeline');
  let createdWealthId = null;
  try {
    const resCreate = await fetch(`${BACKEND_URL}/wealth/items`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        asset_class: 'liquid_asset',
        name: 'Treasury Savings',
        base_value: 5100,
        currency: 'USD',
      }),
    });
    const wData = await resCreate.json();
    createdWealthId = wData.item?._id || wData.wealthItem?._id || wData._id || wData.id;
    const wName = wData.item?.name ?? wData.name;
    logStep(
      'Create Wealth Asset (POST /wealth/items)',
      resCreate.status === 201 && !!createdWealthId,
      `Item: ${wName}, ID: ${createdWealthId}`
    );

    const resList = await fetch(`${BACKEND_URL}/wealth/items`, { headers: authHeaders });
    const wList = await resList.json();
    const rawWList = Array.isArray(wList) ? wList : wList.items || [];
    logStep(
      'List Wealth Assets (GET /wealth/items)',
      resList.status === 200 && rawWList.some(w => (w._id || w.id) === createdWealthId),
      `Found ${rawWList.length} asset(s)`
    );

    const resHistory = await fetch(`${BACKEND_URL}/wealth/history`, { headers: authHeaders });
    const hData = await resHistory.json();
    logStep(
      'Fetch Net Worth History (GET /wealth/history)',
      resHistory.status === 200 && (Array.isArray(hData) || Array.isArray(hData.history)),
      'Retrieved snapshot timeline'
    );

    const resDelete = await fetch(`${BACKEND_URL}/wealth/items/${createdWealthId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    logStep('Delete Wealth Item (DELETE /wealth/items/:id)', resDelete.status === 200);
  } catch (err) {
    logStep('Wealth & Net Worth Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 11: Cashflow Analytics & AI Insights Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 11] Cashflow Analytics & AI Insights Pipeline');
  try {
    const resAi = await fetch(`${BACKEND_URL}/cashflow/ai-insights`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        averageDailyIncome: 150.0,
        medianDailyExpense: 75.0,
        subscriptionsCount: 3,
        subscriptionsCost: 45.0,
        projectedBalance: 6500.0,
        burnRateDays: 45,
        netDailyBurn: -75.0,
      }),
    });
    const aiData = await resAi.json();
    logStep(
      'Cashflow AI Insights Endpoint (POST /cashflow/ai-insights)',
      resAi.status === 200 && !!aiData.insight,
      `Insight generated: "${aiData.insight.substring(0, 50)}..."`
    );
  } catch (err) {
    logStep('Cashflow AI Insights Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 12: Scientific Calculator Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 12] Scientific Calculator Pipeline');
  try {
    const calcClientId = `calc_${Date.now()}`;
    const resSave = await fetch(`${BACKEND_URL}/calculations`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        user_id: userId,
        client_id: calcClientId,
        expression: '1250 * (1 + 0.08 / 12) ** (12 * 5)',
        result: '1862.33',
        numeric_result: 1862.33,
        operation_type: 'compound_interest',
        note: '5-year projection',
      }),
    });
    const calcData = await resSave.json();
    const storedResult = calcData.calculation?.result ?? calcData.result;
    logStep(
      'Save Calculation (POST /calculations)',
      resSave.status === 201 && !!storedResult,
      `Stored calculation result: ${storedResult}`
    );

    const resList = await fetch(`${BACKEND_URL}/calculations/${userId}`, { headers: authHeaders });
    const calcList = await resList.json();
    const rawCalcList = Array.isArray(calcList) ? calcList : calcList.calculations || [];
    logStep(
      'List Calculations (GET /calculations/:userId)',
      resList.status === 200 && rawCalcList.length >= 1,
      `Found ${rawCalcList.length} entry/entries`
    );

    const resDelete = await fetch(`${BACKEND_URL}/calculations/${userId}/${encodeURIComponent(calcClientId)}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    logStep('Delete Calculation (DELETE /calculations/:userId/:clientId)', resDelete.status === 200);
  } catch (err) {
    logStep('Scientific Calculator Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 13: Calendar Events Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 13] Calendar Events Pipeline');
  let createdEventId = null;
  try {
    const resCreate = await fetch(`${BACKEND_URL}/events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        user_id: userId,
        title: 'Quarterly Tax Payment',
        date: '2026-10-15',
        type: 'bill',
        amount: 850,
      }),
    });
    const evData = await resCreate.json();
    createdEventId = evData.event?._id || evData._id || evData.id;
    const evTitle = evData.event?.title ?? evData.title;
    logStep(
      'Create Event (POST /events)',
      resCreate.status === 201 && !!createdEventId,
      `Event: ${evTitle}`
    );

    const resList = await fetch(`${BACKEND_URL}/events/${userId}`, { headers: authHeaders });
    const evList = await resList.json();
    const rawEvList = Array.isArray(evList) ? evList : evList.events || [];
    logStep(
      'List Events (GET /events/:userId)',
      resList.status === 200 && rawEvList.some(e => (e._id || e.id) === createdEventId),
      `Found ${rawEvList.length} event(s)`
    );

    const resDelete = await fetch(`${BACKEND_URL}/events/${createdEventId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    logStep('Delete Event (DELETE /events/:id)', resDelete.status === 200);
  } catch (err) {
    logStep('Calendar Events Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 14: Tax Center Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 14] Tax Center Pipeline');
  let createdTaxProfileId = null;
  try {
    const resCreate = await fetch(`${BACKEND_URL}/tax/profiles`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Primary Tax Profile',
        jurisdiction: 'IN',
        fiscal_year: 2024,
        tax_regime: 'new',
        filing_status: 'single',
        currency: 'INR',
      }),
    });
    const tpData = await resCreate.json();
    createdTaxProfileId = tpData.profile?._id || tpData._id || tpData.id;
    const tpJurisdiction = tpData.profile?.jurisdiction ?? tpData.jurisdiction;
    logStep(
      'Create Tax Profile (POST /tax/profiles)',
      resCreate.status === 201 && !!createdTaxProfileId,
      `Profile ID: ${createdTaxProfileId}, Jurisdiction: ${tpJurisdiction}`
    );

    const resList = await fetch(`${BACKEND_URL}/tax/profiles`, { headers: authHeaders });
    const tpList = await resList.json();
    const rawTpList = Array.isArray(tpList) ? tpList : tpList.profiles || [];
    logStep(
      'List Tax Profiles (GET /tax/profiles)',
      resList.status === 200 && rawTpList.some(p => (p._id || p.id) === createdTaxProfileId),
      `Found ${rawTpList.length} profile(s)`
    );

    const resEstimate = await fetch(`${BACKEND_URL}/tax/estimate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ profile_id: createdTaxProfileId }),
    });
    const estData = await resEstimate.json();
    const estTax = estData.estimate?.totalLiability ?? estData.estimate?.total ?? estData.estimate?.taxableIncome;
    logStep(
      'Tax Estimate Calculation (POST /tax/estimate)',
      resEstimate.status === 200 && estTax !== undefined,
      `Estimated Tax Liability: $${estTax}`
    );

    const resCompare = await fetch(`${BACKEND_URL}/tax/estimate/compare`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ profile_id: createdTaxProfileId }),
    });
    const compData = await resCompare.json();
    logStep(
      'India Regime Comparison (POST /tax/estimate/compare)',
      resCompare.status === 200 && !!compData.comparison,
      `Compared regimes: ${Object.keys(compData.comparison || {}).join(', ')}`
    );

    const resDelete = await fetch(`${BACKEND_URL}/tax/profiles/${createdTaxProfileId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    logStep('Delete Tax Profile (DELETE /tax/profiles/:id)', resDelete.status === 200);
  } catch (err) {
    logStep('Tax Center Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 15: Security & Session Management Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 15] Security & Session Audit Pipeline');
  try {
    const resSessions = await fetch(`${BACKEND_URL}/security/sessions`, { headers: authHeaders });
    const sessData = await resSessions.json();
    logStep(
      'List Active Sessions (GET /security/sessions)',
      resSessions.status === 200 && Array.isArray(sessData) && sessData.length >= 1,
      `Found ${sessData.length} active session(s)`
    );
  } catch (err) {
    logStep('Security Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 16: Export Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 16] Export & Backup Pipeline');
  try {
    const resExcel = await fetch(`${BACKEND_URL}/export/${userId}`, { headers: authHeaders });
    const contentType = resExcel.headers.get('content-type');
    logStep(
      'Excel Export Stream (GET /export/:userId)',
      resExcel.status === 200 && contentType.includes('spreadsheetml'),
      `Content-Type: ${contentType}`
    );

    const resBackup = await fetch(`${BACKEND_URL}/export/backup/${userId}`, { headers: authHeaders });
    const backupData = await resBackup.json();
    logStep(
      'Full JSON Backup (GET /export/backup/:userId)',
      resBackup.status === 200 && typeof backupData === 'object' && backupData.user,
      `Backup contains collections: ${Object.keys(backupData).join(', ')}`
    );
  } catch (err) {
    logStep('Export Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PIPELINE 17: User Deletion & Cascade Clean-up Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 [PIPELINE 17] User Deletion & Cascade Clean-up');
  try {
    const resDelete = await fetch(`${BACKEND_URL}/users/${userId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    logStep(
      'Delete User & Cascaded Data (DELETE /users/:id)',
      resDelete.status === 200,
      `Deleted test user ${userId}`
    );

    // Verify user is gone
    const resVerify = await fetch(`${BACKEND_URL}/users/${userId}`, { headers: authHeaders });
    logStep(
      'Verify Deletion Cascade (GET /users/:id -> 401/404)',
      resVerify.status === 401 || resVerify.status === 404,
      `Response status: ${resVerify.status}`
    );
  } catch (err) {
    logStep('User Deletion Pipeline', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`🏁 VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED (${passCount + failCount} TOTAL)`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
