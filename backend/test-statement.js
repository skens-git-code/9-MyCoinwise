const axios = require('axios');
const fs = require('fs');

const API_URL = 'http://127.0.0.1:5001/api';

async function testIntegration() {
  try {
    console.log('--- Bank Statement Integration Test ---');
    
    // 0. Register user
    console.log('\nRegistering user...');
    let token = '';
    let userId = '';
    try {
      console.log('Logging in with sarthak@gmail.com...');
      const loginRes = await axios.post(`${API_URL}/auth/login`, {
        email: 'sarthak@gmail.com',
        password: 'qwertyuiop'
      });
      token = loginRes.data.token;
      userId = loginRes.data.user.id;
      console.log('Login successful.');
    } catch (e) {
      console.error('Login failed:', e.response ? e.response.data : e.message);
      throw e;
    }

    const headers = { Authorization: `Bearer ${token}` };

    // 2. Upload Functionality & Transaction Detection
    console.log('\n--- 1. Upload Functionality & 2. Transaction Detection ---');
    const csvContent = fs.readFileSync('../sample_statement.csv', 'utf-8');
    
    console.log('Sending CSV for preview...');
    const previewRes = await axios.post(
      `${API_URL}/transactions/statement/preview`,
      { content: csvContent, filename: 'sample_statement.csv' },
      { headers }
    );
    
    const { transactions, summary } = previewRes.data;
    console.log(`Summary: Detected ${summary.detected}, Duplicates: ${summary.duplicates}, Categorized: ${summary.categorized}`);
    console.log('Parsed Transactions Sample:');
    transactions.slice(0, 3).forEach(t => {
      console.log(` - ${t.date} | ${t.type} | ${t.amount} | ${t.merchant} | Cat: ${t.category} | Duplicate: ${t.duplicate}`);
    });
    
    // 3. Categorization Accuracy & 4. Wallet Integration
    console.log('\n--- 3. Categorization Accuracy & 4. Wallet Integration ---');
    // We will select a few transactions to import (simulate "Add to Wallet")
    const toImport = transactions.filter(t => !t.duplicate).slice(0, 2);
    console.log(`Selecting ${toImport.length} non-duplicate transactions to import...`);
    
    const importRes = await axios.post(
      `${API_URL}/transactions/statement/import`,
      { transactions: toImport },
      { headers }
    );
    console.log(`Import Result: Created ${importRes.data.created}, Skipped ${importRes.data.skipped}`);
    
    // 7. Final Verification
    console.log('\n--- 7. Final Verification ---');
    const getRes = await axios.get(`${API_URL}/transactions/${userId}?limit=5`, { headers });
    console.log('Latest transactions in wallet:');
    getRes.data.slice(0, 2).forEach(t => {
      console.log(` - ${new Date(t.date).toISOString().slice(0, 10)} | ${t.type} | ${t.amount} | ${t.merchant} | ${t.category}`);
    });
    
    console.log('\nTest Completed Successfully.');
  } catch (error) {
    console.error('Test Failed:', error.response ? error.response.data : error.message);
  }
}

testIntegration();
