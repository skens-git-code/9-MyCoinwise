async function runFullE2ETest() {
  const timestamp = Date.now();
  const email = `full_e2e_${timestamp}@example.com`;
  const username = `Tester_${timestamp}`;
  const password = 'SecurePassword123!';
  const BASE_URL = 'http://localhost:5001';

  console.log(`[1/7] Testing User Registration (${email}, ${username})...`);
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  if (!regRes.ok) {
    const errBody = await regRes.text();
    throw new Error(`Registration failed (${regRes.status}): ${errBody}`);
  }
  const regData = await regRes.json();
  const token = regData.token;
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  console.log('✅ Registration successful.');

  console.log('[2/7] Testing User Login...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.statusText}`);
  console.log('✅ Login successful.');

  console.log('[3/7] Testing Transaction Creation & Balance Sync...');
  // Income 1000
  const incRes = await fetch(`${BASE_URL}/api/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'income', category: 'Job', amount: 1000, date: '2026-08-01', note: 'Monthly Salary' })
  });
  if (!incRes.ok) throw new Error(`Income creation failed: ${incRes.statusText}`);
  const incData = await incRes.json();

  // Expense 250
  const expRes = await fetch(`${BASE_URL}/api/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'expense', category: 'Food', amount: 250, date: '2026-08-02', note: 'Groceries' })
  });
  if (!expRes.ok) throw new Error(`Expense creation failed: ${expRes.statusText}`);
  const expData = await expRes.json();

  // Check /api/auth/me
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, { headers: authHeaders });
  const meData = await meRes.json();
  if (meData.balance !== 750) throw new Error(`Expected balance 750, got ${meData.balance}`);
  console.log(`✅ Balance correctly computed: ${meData.balance} (Income: 1000, Expense: 250).`);

  console.log('[4/7] Testing Goal Creation & Contribution...');
  const goalRes = await fetch(`${BASE_URL}/api/goals`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'New Car', target: 5000, saved: 500, category: 'Savings' })
  });
  if (!goalRes.ok) throw new Error(`Goal creation failed: ${goalRes.statusText}`);
  const goalData = await goalRes.json();
  console.log(`✅ Goal created: ${goalData.goal.name} (Target: ${goalData.goal.target}).`);

  console.log('[5/7] Testing Subscriptions Creation...');
  const subRes = await fetch(`${BASE_URL}/api/subscriptions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Spotify Premium', amount: 9.99, cycle: 'monthly', next_billing_date: '2026-09-01' })
  });
  if (!subRes.ok) throw new Error(`Subscription creation failed: ${subRes.statusText}`);
  const subData = await subRes.json();
  const createdSub = subData.sub || subData;
  console.log(`✅ Subscription created: ${createdSub.name} (${createdSub.amount}/mo).`);

  console.log('[6/7] Testing Transaction Deletion & Balance Restoration...');
  const expTxId = (expData.transaction && expData.transaction._id) || expData.id || expData._id;
  const delRes = await fetch(`${BASE_URL}/api/transactions/${expTxId}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  if (!delRes.ok) throw new Error(`Transaction deletion failed: ${delRes.statusText}`);

  const meAfterDel = await (await fetch(`${BASE_URL}/api/auth/me`, { headers: authHeaders })).json();
  if (meAfterDel.balance !== 1000) throw new Error(`Expected balance 1000 after deleting expense, got ${meAfterDel.balance}`);
  console.log(`✅ Balance restored after expense deletion: ${meAfterDel.balance}.`);

  console.log('[7/7] Testing Data Export (Excel / CSV stream)...');
  const exportRes = await fetch(`${BASE_URL}/api/export/${regData.user.id || regData.user._id || meData._id}`, {
    headers: authHeaders
  });
  if (!exportRes.ok) throw new Error(`Export stream failed with status ${exportRes.status}`);
  console.log('✅ Export stream responded with 200 OK.');

  console.log('\n🎉 ALL 7 FULL E2E BACKEND & DATABASE INTEGRATION TESTS PASSED WITH ZERO ERRORS!');
}

runFullE2ETest().catch(err => {
  console.error('❌ E2E Test Failure:', err);
  process.exit(1);
});
