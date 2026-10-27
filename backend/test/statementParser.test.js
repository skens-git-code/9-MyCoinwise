const assert = require('assert');
const ExcelJS = require('exceljs');
const {
  parseStatement,
  extractTransactionId,
  detectBankName,
  parseNarrationEntities,
  parseCsvString,
  toIsoDay,
  parseStatementAmount,
  parseSignedAmount,
  isBalanceOrSummary,
} = require('../services/statementParser');

/**
 * Creates a valid standalone PDF 1.4 binary buffer without external node_modules.
 */
function createPdfBuffer(lines) {
  const lineArray = Array.isArray(lines) ? lines : String(lines).split('\n');
  const content = lineArray
    .map((line, idx) => `1 0 0 1 50 ${750 - idx * 20} Tm (${String(line).replace(/[()\\]/g, '\\$&')}) Tj`)
    .join('\n');
  const stream = `BT\n/F1 12 Tf\n${content}\nET`;
  const streamLen = Buffer.byteLength(stream);

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLen} >>
stream
${stream}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000300 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
370
%%EOF`;
  return Buffer.from(pdf);
}

async function runTests() {
  console.log('🧪 Running Statement Parser Unit Tests...');

  // 1. Transaction ID extraction
  assert.strictEqual(extractTransactionId('UPI/503212345678/SWIGGY'), '503212345678');
  assert.strictEqual(extractTransactionId('PhonePe Txn ID : T2410241234567890123456'), 'T2410241234567890123456');
  assert.strictEqual(extractTransactionId('Google Pay ref CICAgKDe123456'), 'CICAgKDe123456');
  assert.strictEqual(extractTransactionId('BharatPe BP987654321012'), 'BP987654321012');
  assert.strictEqual(extractTransactionId('NEFT UTR : SBIN123456789012'), 'SBIN123456789012');
  assert.strictEqual(extractTransactionId('RTGS ref: HDFCR52024021000123456'), 'HDFCR52024021000123456');
  assert.strictEqual(extractTransactionId('Paid by Cheque No 123456789'), 'CHQ-123456789');
  assert.strictEqual(extractTransactionId('Mobile 919876543210 recharge'), null, 'Mobile number must not be treated as generic txn id');
  console.log('  ✅ extractTransactionId correctly identifies UPI, NEFT, RTGS, Cheque and rejects mobile numbers');

  // 2. Bank name detection
  assert.strictEqual(detectBankName('HDFC BANK STATEMENT 2025'), 'HDFC Bank');
  assert.strictEqual(detectBankName('STATE BANK OF INDIA - A/C 12345'), 'State Bank of India');
  assert.strictEqual(detectBankName('Payment from PhonePe UPI'), 'PhonePe');
  assert.strictEqual(detectBankName('Paytm Payments Bank Wallet'), 'Paytm Payments Bank');
  console.log('  ✅ detectBankName correctly detects traditional banks and UPI apps');

  // 3. Date Parsing & Indian ambiguous date validation
  assert.strictEqual(toIsoDay('05/06/2024'), '2024-06-05', '05/06/2024 must default to June 5 (DD/MM for India)');
  assert.strictEqual(toIsoDay('05/06/2024', 'MDY'), '2024-05-06', '05/06/2024 with MDY must parse as May 6');
  assert.strictEqual(toIsoDay('01/02/2025', 'MDY'), '2025-01-02', '01/02/2025 with MDY must parse as Jan 2');
  assert.strictEqual(toIsoDay('01/02/2025', 'DMY'), '2025-02-01', '01/02/2025 with DMY must parse as Feb 1');
  assert.strictEqual(toIsoDay('25/12/2024'), '2024-12-25', '25/12/2024 must parse as Dec 25');
  assert.strictEqual(toIsoDay('01-Apr-2024'), '2024-04-01');
  assert.strictEqual(toIsoDay('01 Apr 2024'), '2024-04-01');
  assert.strictEqual(toIsoDay('01Apr2024'), '2024-04-01');
  assert.strictEqual(toIsoDay('01-Apr-24'), '2024-04-01');
  assert.strictEqual(toIsoDay('Oct 24, 2024'), '2024-10-24');
  assert.strictEqual(toIsoDay('31/04/2024'), null, '31/04/2024 is invalid (April has 30 days) and must return null, not rollover to May 1');
  assert.strictEqual(toIsoDay('2024-13-05'), null, '2024-13-05 has invalid month 13 and must return null');
  console.log('  ✅ toIsoDay correctly parses Indian DD/MM/YYYY, US MM/DD/YYYY hint, text dates, and rejects invalid calendar days');

  // 4. Amount parsing with currency words, Dr/Cr, parens, Rs/- suffixes, and European format
  assert.strictEqual(parseStatementAmount('INR 1,234.56'), 1234.56);
  assert.strictEqual(parseStatementAmount('1,234.56 Dr'), 1234.56);
  assert.strictEqual(parseStatementAmount('1,234.56 Cr'), 1234.56);
  assert.strictEqual(parseStatementAmount('1,234.56 (Debit)'), 1234.56);
  assert.strictEqual(parseStatementAmount('(1,234.56)'), 1234.56);
  assert.strictEqual(parseStatementAmount('500/-'), 500, '500/- must parse as 500');
  assert.strictEqual(parseStatementAmount('Rs. 500/-'), 500, 'Rs. 500/- must parse as 500');
  assert.strictEqual(parseStatementAmount('Rs/- 500'), 500, 'Rs/- 500 must parse as 500');
  assert.strictEqual(parseStatementAmount('1.234,56'), 1234.56, 'European format 1.234,56 must parse as 1234.56');
  assert.strictEqual(parseSignedAmount('(1,234.56)'), -1234.56);
  assert.strictEqual(parseSignedAmount('1,234.56 Dr'), -1234.56);
  assert.strictEqual(parseSignedAmount('1,234.56 Cr'), 1234.56);
  assert.strictEqual(parseSignedAmount('500/- Dr'), -500);
  assert.strictEqual(parseSignedAmount('1.234,56 Dr'), -1234.56);
  console.log('  ✅ parseStatementAmount and parseSignedAmount safely handle INR/Dr/Cr/Debit/parens/Rs/-/European format');

  // 5. Balance & Summary guard
  assert.strictEqual(isBalanceOrSummary('Opening Balance ₹5,000.00'), true);
  assert.strictEqual(isBalanceOrSummary('Closing Balance ₹12,340.50'), true);
  assert.strictEqual(isBalanceOrSummary('Available Balance 10,000.00'), true);
  assert.strictEqual(isBalanceOrSummary('Balance b/f 1,500.00'), true);
  assert.strictEqual(isBalanceOrSummary('Total Debit: ₹2,340.00'), true);
  assert.strictEqual(isBalanceOrSummary('Total Balance: 25,000.00'), true);
  assert.strictEqual(isBalanceOrSummary('Current Balance 12000'), true);
  assert.strictEqual(isBalanceOrSummary('Running Balance: 15,400.00'), true);
  assert.strictEqual(isBalanceOrSummary('Previous Balance: 10,000.00'), true);
  assert.strictEqual(isBalanceOrSummary('Statement Summary'), true);
  assert.strictEqual(isBalanceOrSummary('Account Summary'), true);
  assert.strictEqual(isBalanceOrSummary('Net Total: 5,000.00'), true);
  assert.strictEqual(isBalanceOrSummary('Paid to Swiggy'), false);
  console.log('  ✅ isBalanceOrSummary correctly filters out statement balance and total summary lines');

  // 6. Narration entities extraction (Sender, Receiver, Bank, TxnId)
  const debitEntity = parseNarrationEntities({
    narration: 'Paid to Swiggy using HDFC Bank ref 403212345678',
    isIncome: false,
  });
  assert.strictEqual(debitEntity.receiver, 'Swiggy');
  assert.strictEqual(debitEntity.sender, 'You');
  assert.strictEqual(debitEntity.bank_name, 'HDFC Bank');
  assert.strictEqual(debitEntity.transaction_number, '403212345678');

  const creditEntity = parseNarrationEntities({
    narration: 'Received from Ramesh Kumar via PhonePe UPI/403299887766',
    isIncome: true,
  });
  assert.strictEqual(creditEntity.sender, 'Ramesh Kumar');
  assert.strictEqual(creditEntity.receiver, 'You');
  assert.strictEqual(creditEntity.transaction_number, '403299887766');
  console.log('  ✅ parseNarrationEntities correctly parses sender, receiver, bank, and reference');

  // 7. CSV Statement Ingestion with Txn Amount, Withdrawal Amount, and Credit card payment
  const sampleCsv = `Tran Date,Particulars,Withdrawal Amount,Deposit Amount,Cheque No
01-Apr-2024,Swiggy Restaurant Order,450.00,,UPI503212345678
02-Apr-2024,Salary from Acme Corp,,85000.00,SAL20250116
03-Apr-2024,Credit card payment HDFC,15000.00,,CC9988
04-Apr-2024,Closing Balance 120000.00,,,
`;
  const csvResult = await parseStatement({
    content: sampleCsv,
    filename: 'bank_statement.csv',
    userTransactions: [],
  });

  assert.strictEqual(csvResult.transactions.length, 3, 'Must parse 3 transactions and ignore Closing Balance');
  assert.strictEqual(csvResult.transactions[0].date, '2024-04-01');
  assert.strictEqual(csvResult.transactions[0].type, 'expense');
  assert.strictEqual(csvResult.transactions[0].amount, 450);
  assert.strictEqual(csvResult.transactions[0].category, 'Food');

  assert.strictEqual(csvResult.transactions[1].type, 'income');
  assert.strictEqual(csvResult.transactions[1].amount, 85000);
  assert.strictEqual(csvResult.transactions[1].category, 'Salary');

  assert.strictEqual(csvResult.transactions[2].type, 'expense', 'Credit card payment must be classified as expense, not income');
  assert.strictEqual(csvResult.transactions[2].amount, 15000);
  console.log('  ✅ parseStatement parses custom header variations (Tran Date, Withdrawal Amount, etc.) and ignores balances');

  // 8. Same-Day Same-Amount Legitimate Purchases (No false duplicate dropping)
  const repeatCsv = `Date,Description,Amount,Type
2025-03-01,Blue Tokai Coffee,50.00,Debit
2025-03-01,Blue Tokai Coffee,50.00,Debit
`;
  const repeatResult = await parseStatement({
    content: repeatCsv,
    filename: 'coffee.csv',
    userTransactions: [],
  });
  assert.strictEqual(repeatResult.transactions.length, 2);
  assert.strictEqual(repeatResult.transactions[0].duplicate, false);
  assert.strictEqual(repeatResult.transactions[1].duplicate, false, 'Second same-day purchase must not be dropped as duplicate');
  assert.strictEqual(repeatResult.transactions[1].confidence, 'weak_duplicate');
  console.log('  ✅ parseStatement does not falsely drop legitimate same-day same-amount purchases');

  // 9. Legacy .xls files rejected with actionable error
  try {
    await parseStatement({
      content: Buffer.from('D0CF11E0A1B11AE1', 'hex'), // OLE2 signature
      filename: 'legacy_statement.xls',
      userTransactions: [],
    });
    assert.fail('Legacy .xls should have thrown an error');
  } catch (err) {
    assert.strictEqual(err.code, 'XLS_NOT_SUPPORTED');
    assert(/legacy \.xls/i.test(err.message), 'Error must explain legacy .xls incompatibility');
  }
  console.log('  ✅ parseStatement rejects legacy .xls files with helpful instructions');

  // 10. Excel (.xlsx) Statement Ingestion
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Transactions');
  ws.addRow(['HDFC Bank Account Statement']);
  ws.addRow(['Date', 'Narration', 'Withdrawal', 'Deposit', 'Chq/Ref No']);
  ws.addRow(['2025-02-01', 'Uber Ride Airport', 850, null, 'UBER9876']);
  ws.addRow(['2025-02-02', 'Interest Credited', null, 320, 'INT2025']);
  ws.addRow(['Closing Balance: ₹50,000.00']);
  const xlsxBuf = await wb.xlsx.writeBuffer();

  const xlsxResult = await parseStatement({
    content: xlsxBuf,
    filename: 'HDFC_Statement.xlsx',
    userTransactions: [],
  });

  assert.strictEqual(xlsxResult.transactions.length, 2);
  assert.strictEqual(xlsxResult.transactions[0].category, 'Transport');
  assert.strictEqual(xlsxResult.transactions[0].amount, 850);
  assert.strictEqual(xlsxResult.transactions[1].type, 'income');
  assert.strictEqual(xlsxResult.transactions[1].amount, 320);
  console.log('  ✅ parseStatement parses Excel .xlsx statements successfully and ignores balance row');

  // 11. PDF Statement Ingestion (PhonePe)
  const phonePeBuf = createPdfBuffer([
    'PhonePe Transaction Statement',
    'Date: 2025-02-10',
    'Paid to Zepto Groceries',
    'Transaction ID : T2402101234567890123456',
    'Debited from State Bank of India - 9876',
    'Amount: Rs. 385.00',
    'Status: Successful',
    '',
    'Date: 2025-02-11',
    'Received from Rahul Sharma',
    'Transaction ID : T2402119876543210987654',
    'Credited to State Bank of India - 9876',
    'Amount: Rs. 1500.00',
    'Status: Successful',
  ]);

  const phonePeResult = await parseStatement({
    content: phonePeBuf,
    filename: 'PhonePe_Statement.pdf',
    userTransactions: [],
  });

  assert.strictEqual(phonePeResult.transactions.length >= 2, true);
  const zeptoTx = phonePeResult.transactions.find((t) => /zepto/i.test(t.merchant || t.note));
  assert(zeptoTx, 'Zepto transaction found');
  assert.strictEqual(zeptoTx.type, 'expense');
  assert.strictEqual(zeptoTx.amount, 385);
  assert.strictEqual(zeptoTx.category, 'Groceries');
  assert.strictEqual(zeptoTx.transaction_number, 'T2402101234567890123456');

  // 12. PDF Statement Ingestion (Paytm)
  const paytmBuf = createPdfBuffer([
    'Paytm Payments Bank Passbook',
    '2025-01-20  Paid to Uber India  Order ID: PTM9876543210  - Rs. 350.00',
    '2025-01-22  Cashback received from Paytm  + Rs. 50.00',
    'Closing Balance: Rs. 5,000.00',
  ]);
  const paytmResult = await parseStatement({
    content: paytmBuf,
    filename: 'Paytm_Passbook.pdf',
    userTransactions: [],
  });
  assert.strictEqual(paytmResult.transactions.length, 2, 'Paytm transactions parsed ignoring Closing Balance');
  assert.strictEqual(paytmResult.transactions[0].type, 'expense');
  assert.strictEqual(paytmResult.transactions[0].amount, 350);
  assert.strictEqual(paytmResult.transactions[1].type, 'income');
  assert.strictEqual(paytmResult.transactions[1].amount, 50);
  console.log('  ✅ parseStatement parses Paytm PDF passbook statement');

  // 13. PDF Statement Ingestion (Google Pay)
  const gpayBuf = createPdfBuffer([
    'Google Pay Transaction History',
    'Date: 2025-01-28',
    'Paid to Swiggy Eats',
    'UPI transaction ID: 502812345678',
    'Debited from HDFC Bank',
    'Amount: Rs. 420.00',
    'Status: Completed',
    'Total Amount: ₹420.00',
  ]);
  const gpayResult = await parseStatement({
    content: gpayBuf,
    filename: 'GooglePay_Statement.pdf',
    userTransactions: [],
  });
  assert(gpayResult.transactions.length === 1, 'Google Pay transactions parsed without duplicate total');
  assert.strictEqual(gpayResult.transactions[0].type, 'expense');
  assert.strictEqual(gpayResult.transactions[0].amount, 420);
  assert.strictEqual(gpayResult.transactions[0].transaction_number, '502812345678');
  console.log('  ✅ parseStatement parses Google Pay PDF statement');

  // 14. PDF Statement Ingestion (BharatPe)
  const bharatPeBuf = createPdfBuffer([
    'BharatPe Account Statement',
    '2025-02-05',
    'Customer Payment from Rajesh Verma',
    'Txn ID: BP876543210987',
    'Rs. 1200.00',
  ]);
  const bharatPeResult = await parseStatement({
    content: bharatPeBuf,
    filename: 'BharatPe_Settlement.pdf',
    userTransactions: [],
  });
  assert(bharatPeResult.transactions.length >= 1, 'BharatPe transactions parsed');
  assert.strictEqual(bharatPeResult.transactions[0].amount, 1200);
  assert.strictEqual(bharatPeResult.transactions[0].transaction_number, 'BP876543210987');
  console.log('  ✅ parseStatement parses BharatPe PDF statement');

  // 15. Non-ISO Date in Stored Transactions (Must not crash)
  const nonIsoResult = await parseStatement({
    content: 'Date,Description,Amount\n2025-03-01,Test Coffee,50.00',
    filename: 'test.csv',
    userTransactions: [
      { date: '25/12/2024', amount: 50, merchant: 'Test Coffee', type: 'expense' },
      { date: 'invalid-date', amount: 50, merchant: 'Test Coffee', type: 'expense' },
    ],
  });
  assert.strictEqual(nonIsoResult.transactions.length, 1);
  console.log('  ✅ parseStatement handles non-ISO / invalid dates in userTransactions history without crashing');

  // 16. parseTransactionAmount bounds and sub-paisa checks
  const transactionsRouter = require('../routes/transactions');
  const { parseTransactionAmount } = transactionsRouter;
  assert.strictEqual(parseTransactionAmount(12.34), 12.34);
  assert.strictEqual(parseTransactionAmount('100.5'), 100.5);
  assert.strictEqual(parseTransactionAmount(1e-8), null, '1e-8 must be rejected');
  assert.strictEqual(parseTransactionAmount(0.001), null, 'Sub-cent amount must be rejected');
  assert.strictEqual(parseTransactionAmount(0), null, '0 amount must be rejected');
  assert.strictEqual(parseTransactionAmount(-50), null, 'Negative amount must be rejected');
  // 17. Multi-Line PDF Statement (SBI / Bank statement layout)
  const multiLinePdfBuf = createPdfBuffer([
    'State Bank of India Statement',
    'Date Particulars Debit Credit Balance',
    '23/10/2026',
    'TO TRANSFER-UPI/DR/629700123456/SWIGGY',
    '450.00',
    '12,345.67',
    '24/10/2026',
    'BY TRANSFER-SALARY ACME CORP',
    '75,000.00',
    '87,345.67',
    'Closing Balance: 87,345.67',
  ]);
  const multiLinePdfResult = await parseStatement({
    content: multiLinePdfBuf,
    filename: 'sbi_statement.pdf',
    userTransactions: [],
  });
  assert.strictEqual(multiLinePdfResult.transactions.length, 2, 'Multi-line bank PDF parsed both transactions');
  assert.strictEqual(multiLinePdfResult.transactions[0].type, 'expense');
  assert.strictEqual(multiLinePdfResult.transactions[0].amount, 450);
  assert.strictEqual(multiLinePdfResult.transactions[0].transaction_number, '629700123456');
  assert.strictEqual(multiLinePdfResult.transactions[1].type, 'income');
  assert.strictEqual(multiLinePdfResult.transactions[1].amount, 75000);
  console.log('  ✅ parseStatement parses multi-line PDF bank statements (SBI / HDFC / Axis layout)');

  // 18. CSV with Merchant header instead of Description
  const merchantCsv = 'Date,Merchant,Category,Amount\n2026-10-23,Swiggy,Food,450.00\n2026-10-24,Amazon,Shopping,1200.00';
  const merchantCsvResult = await parseStatement({
    content: merchantCsv,
    filename: 'statement.csv',
    userTransactions: [],
  });
  assert.strictEqual(merchantCsvResult.transactions.length, 2, 'CSV with Merchant header parsed cleanly');
  assert.strictEqual(merchantCsvResult.transactions[0].merchant, 'Swiggy');
  assert.strictEqual(merchantCsvResult.transactions[0].amount, 450);
  console.log('  ✅ parseStatement parses CSV with Merchant / Payee headers cleanly');

  // 19. US Bank Statement Auto-Detection & dateFormat Hint
  const chaseCsv = 'Date,Description,Amount\n01/02/2025,Starbucks Coffee,5.75\n02/03/2025,Target Store,45.20';
  const chaseResult = await parseStatement({
    content: chaseCsv,
    filename: 'Chase_Checking_2025.csv',
    userTransactions: [],
  });
  assert.strictEqual(chaseResult.transactions[0].date, '2025-01-02', 'Chase statement 01/02/2025 must parse as Jan 2');
  assert.strictEqual(chaseResult.transactions[1].date, '2025-02-03', 'Chase statement 02/03/2025 must parse as Feb 3');
  console.log('  ✅ parseStatement automatically applies MDY format for US bank filenames');

  // 20. Explicit dateFormat query/body hint override
  const explicitMdyResult = await parseStatement({
    content: 'Posting Date,Description,Amount\n03/04/2025,Trader Joes,35.00',
    filename: 'statement.csv',
    userTransactions: [],
    dateFormat: 'MDY',
  });
  assert.strictEqual(explicitMdyResult.transactions[0].date, '2025-03-04', 'Explicit MDY dateFormat hint parsed 03/04/2025 as March 4');
  console.log('  ✅ parseStatement respects explicit dateFormat hint');

  // 21. User Explicit "Other" Category Learning
  const userLearnedHistory = [
    { merchant: 'Swiggy', category: 'Other', date: new Date('2025-01-10T00:00:00Z'), amount: 400 },
    { merchant: 'Swiggy', category: 'Food', date: new Date('2024-12-01T00:00:00Z'), amount: 350 },
  ];
  const learnedOtherResult = await parseStatement({
    content: 'Date,Description,Amount\n2025-01-15,Swiggy Order,500.00',
    filename: 'statement.csv',
    userTransactions: userLearnedHistory,
  });
  assert.strictEqual(
    learnedOtherResult.transactions[0].category,
    'Other',
    'User latest preference for Other category must be honored over older Food rule'
  );
  console.log('  ✅ parseStatement learns explicit "Other" category intent from user history');

  // 22. Income Category Classification Rules
  const incomeCsv = [
    'Date,Description,Amount,Type',
    '2025-01-01,Upwork Freelance Client,1500.00,Cr',
    '2025-01-02,Quarterly Dividend Credit,250.00,Cr',
    '2025-01-03,Birthday Gift from Mom,100.00,Cr',
    '2025-01-04,Amazon Refund Reversal,45.00,Cr',
  ].join('\n');
  const incomeResult = await parseStatement({
    content: incomeCsv,
    filename: 'income_statement.csv',
    userTransactions: [],
  });
  assert.strictEqual(incomeResult.transactions[0].category, 'Freelance');
  assert.strictEqual(incomeResult.transactions[1].category, 'Investment');
  assert.strictEqual(incomeResult.transactions[2].category, 'Gift');
  assert.strictEqual(incomeResult.transactions[3].category, 'Refund');
  console.log('  ✅ parseStatement accurately classifies granular Income categories');

  // 23. General Bank PDF with Balance preceding Transaction Amount
  const balanceFirstPdfBuf = createPdfBuffer([
    'Bank of Baroda Statement',
    'Date Particulars Balance Amount',
    '2025-01-15',
    'Balance: Rs. 45,000.00 Paid to Swiggy ₹350.00',
  ]);
  const balanceFirstResult = await parseStatement({
    content: balanceFirstPdfBuf,
    filename: 'bob_statement.pdf',
    userTransactions: [],
  });
  assert.strictEqual(balanceFirstResult.transactions[0].amount, 350, 'Must pick transaction amount 350, not balance 45000');
  console.log('  ✅ parseStatement general bank parser picks transaction amount instead of balance');

  console.log('\n🎉 ALL STATEMENT PARSER UNIT TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Statement Parser Test Failed:', err);
  process.exit(1);
});
