const axios = require('axios');
async function test() {
  try {
    const resLogin = await axios.post('http://localhost:5001/api/auth/login', {
      email: '3d3@gmail.com', password: 'password123'
    }).catch(e => e.response);
    if (!resLogin.data.token) return console.log("Login failed");
    
    const token = resLogin.data.token;
    console.log("Logged in");
    
    const resAdd = await axios.post('http://localhost:5001/api/transactions', {
      type: 'income',
      category: 'Job',
      amount: 100000,
      date: '2026-08-17',
      note: 'Salary'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(e => e.response);
    
    console.log("Add Tx Status:", resAdd.status);
    console.log("Add Tx Data:", resAdd.data);
    
    const resMe = await axios.get('http://localhost:5001/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(e => e.response);
    console.log("User balance after:", resMe.data.balance);
    
  } catch(e) {
    console.log("Script error:", e.message);
  }
}
test();
