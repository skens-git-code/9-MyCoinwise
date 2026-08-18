async function test() {
  const email = `testuser_${Date.now()}@example.com`;
  console.log('Registering', email);
  
  // 1. Register
  const regRes = await fetch('http://localhost:5001/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Test User',
      email,
      password: 'password123'
    })
  });
  const regData = await regRes.json();
  const token = regData.token;
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  
  // 2. Get me initially
  const me1 = await fetch('http://localhost:5001/api/auth/me', { headers });
  const me1Data = await me1.json();
  console.log('Initial balance:', me1Data.balance);

  // 3. Add transaction
  console.log('Adding 500 income...');
  const addRes = await fetch('http://localhost:5001/api/transactions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'income',
      category: 'Job',
      amount: 500,
      date: '2023-01-01',
      note: ''
    })
  });
  console.log('Add tx status:', addRes.status);

  // 4. Get me again
  const me2 = await fetch('http://localhost:5001/api/auth/me', { headers });
  const me2Data = await me2.json();
  console.log('Balance after transaction:', me2Data.balance);
}

test().catch(err => console.error(err));
