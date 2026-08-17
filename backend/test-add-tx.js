const axios = require('axios');
async function test() {
  try {
    // 1. Login to get token
    const loginRes = await axios.post('http://localhost:5001/api/auth/login', {
      email: 'sarthakmathapati@gmail.com', // Let's try finding the user's email first
      password: 'password123'
    }).catch(e => e.response);
    
    console.log("Login status:", loginRes.status);
    
  } catch(e) {
    console.log("Script error:", e.message);
  }
}
test();
