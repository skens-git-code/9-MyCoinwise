const assert = require('assert');
const express = require('express');
const ExcelJS = require('exceljs');
const CFB = require('cfb');
const {
  parseStatement,
  extractTransactionId,
  detectBankName,
  parseNarrationEntities,
  parseCsvString,
  detectCsvDelimiter,
  clearParserCache,
  getParserCacheStats,
  enrichRawPdfTransactions,
  toIsoDay,
  parseStatementAmount,
  parseSignedAmount,
  isBalanceOrSummary,
} = require('../services/statementParser');

/**
 * Creates a valid multi-page standalone PDF 1.4 binary buffer from raw content streams.
 */
function createMultiPagePdfBuffer(pageStreams) {
  const objects = [];
  const pageCount = pageStreams.length;
  const fontObjId = 3 + pageCount * 2;
  const kidsRefs = [];

  for (let p = 0; p < pageCount; p += 1) {
    const pageObjId = 3 + p * 2;
    const contentObjId = pageObjId + 1;
    kidsRefs.push(`${pageObjId} 0 R`);
    const stream = pageStreams[p];
    const len = Buffer.byteLength(stream);
    objects.push({
      id: pageObjId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`,
    });
    objects.push({
      id: contentObjId,
      body: `<< /Length ${len} >>\nstream\n${stream}\nendstream`,
    });
  }

  const allObjs = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { id: 2, body: `<< /Type /Pages /Kids [${kidsRefs.join(' ')}] /Count ${pageCount} >>` },
    ...objects,
    { id: fontObjId, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
  ].sort((a, b) => a.id - b.id);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of allObjs) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${allObjs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= allObjs.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${allObjs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf);
}

/**
 * Creates a valid standalone PDF 1.4 binary buffer without external node_modules.
 */
function biffRecord(type, payload) {
  const hdr = Buffer.alloc(4);
  hdr.writeUInt16LE(type, 0);
  hdr.writeUInt16LE(payload.length, 2);
  return Buffer.concat([hdr, payload]);
}

/**
 * Builds a valid binary Excel 97-2003 BIFF8 (.xls) OLE2 workbook buffer using `cfb`.
 */
function createBinaryBiff8XlsBuffer(rows) {
  const strings = [];
  const strIdx = new Map();
  const intern = (s) => {
    const key = String(s);
    if (!strIdx.has(key)) {
      strIdx.set(key, strings.length);
      strings.push(key);
    }
    return strIdx.get(key);
  };

  // Pre-intern all string cells
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell === 'string') intern(cell);
    }
  }

  // Build SST record (compressed 8-bit ASCII strings)
  const sstParts = [Buffer.alloc(8)];
  sstParts[0].writeUInt32LE(strings.length, 0);
  sstParts[0].writeUInt32LE(strings.length, 4);
  for (const s of strings) {
    const strBytes = Buffer.from(s, 'latin1');
    const hdr = Buffer.alloc(3);
    hdr.writeUInt16LE(strBytes.length, 0);
    hdr.writeUInt8(0, 2);
    sstParts.push(hdr, strBytes);
  }

  const globals = Buffer.concat([
    biffRecord(0x0809, Buffer.from([0x00, 0x06, 0x05, 0x00])), // BOF workbook globals
    biffRecord(0x00fc, Buffer.concat(sstParts)),                // SST
    biffRecord(0x000a, Buffer.alloc(0)),                        // EOF
  ]);

  const cellRecs = [biffRecord(0x0809, Buffer.from([0x00, 0x06, 0x10, 0x00]))]; // BOF worksheet
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === null || cell === undefined || cell === '') return;
      if (typeof cell === 'number') {
        const buf = Buffer.alloc(14);
        buf.writeUInt16LE(r, 0);
        buf.writeUInt16LE(c, 2);
        buf.writeUInt16LE(0, 4);
        buf.writeDoubleLE(cell, 6);
        cellRecs.push(biffRecord(0x0203, buf)); // NUMBER
      } else {
        const buf = Buffer.alloc(10);
        buf.writeUInt16LE(r, 0);
        buf.writeUInt16LE(c, 2);
        buf.writeUInt16LE(0, 4);
        buf.writeUInt32LE(intern(cell), 6);
        cellRecs.push(biffRecord(0x00fd, buf)); // LABELSST
      }
    });
  });
  cellRecs.push(biffRecord(0x000a, Buffer.alloc(0))); // EOF

  const wbStream = Buffer.concat([globals, ...cellRecs]);
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, 'Workbook', wbStream);
  return Buffer.from(CFB.write(container, { type: 'buffer' }));
}

function createPdfBuffer(lines) {
  const lineArray = Array.isArray(lines) ? lines : String(lines).split('\n');
  const content = lineArray
    .map((line, idx) => `1 0 0 1 50 ${750 - idx * 20} Tm (${String(line).replace(/[()\\]/g, '\\$&')}) Tj`)
    .join('\n');
  return createMultiPagePdfBuffer([`BT\n/F1 12 Tf\n${content}\nET`]);
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

  // 9. Full .xls Support (Binary BIFF8, HTML-table .xls, XML Spreadsheet 2003, and Corrupt OLE2 rejection)
  const biffXlsBuf = createBinaryBiff8XlsBuffer([
    ['SBI Statement'],
    ['Date', 'Narration', 'Debit', 'Credit'],
    ['2025-02-10', 'Swiggy Food Order', 420.5, null],
    ['2025-02-11', 'Salary Credit', null, 55000],
  ]);
  const biffXlsRes = await parseStatement({
    content: biffXlsBuf,
    filename: 'sbi_legacy.xls',
    userTransactions: [],
  });
  assert.strictEqual(biffXlsRes.summary.detectedFormat, 'Excel');
  assert.strictEqual(biffXlsRes.summary.diagnostics.strategy, 'xls_biff_cfb');
  assert.strictEqual(biffXlsRes.transactions.length, 2);
  assert.strictEqual(biffXlsRes.transactions[0].amount, 420.5);
  assert.strictEqual(biffXlsRes.transactions[0].category, 'Food');
  assert.strictEqual(biffXlsRes.transactions[1].type, 'income');
  assert.strictEqual(biffXlsRes.transactions[1].amount, 55000);

  const htmlXls = `<html><body><table>
    <tr><th>Date</th><th>Description</th><th>Withdrawal</th><th>Deposit</th></tr>
    <tr><td>2025-02-15</td><td>Uber Trip &amp; Toll</td><td>280.00</td><td></td></tr>
    <tr><td>2025-02-16</td><td>Refund Amazon</td><td></td><td>999.00</td></tr>
  </table></body></html>`;
  const htmlXlsRes = await parseStatement({
    content: htmlXls,
    filename: 'bank_export.xls',
    userTransactions: [],
  });
  assert.strictEqual(htmlXlsRes.summary.diagnostics.strategy, 'xls_html');
  assert.strictEqual(htmlXlsRes.transactions.length, 2);
  assert.strictEqual(htmlXlsRes.transactions[0].category, 'Transport');
  assert.strictEqual(htmlXlsRes.transactions[1].type, 'income');

  const xmlXls = `<?xml version="1.0"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
    <Worksheet ss:Name="Statement">
      <Table>
        <Row><Cell><Data ss:Type="String">Date</Data></Cell><Cell><Data ss:Type="String">Particulars</Data></Cell><Cell><Data ss:Type="String">Amount</Data></Cell></Row>
        <Row><Cell><Data ss:Type="String">2025-02-20</Data></Cell><Cell><Data ss:Type="String">Netflix Subscription</Data></Cell><Cell><Data ss:Type="Number">-649</Data></Cell></Row>
      </Table>
    </Worksheet>
  </Workbook>`;
  const xmlXlsRes = await parseStatement({
    content: xmlXls,
    filename: 'xml_export.xls',
    userTransactions: [],
  });
  assert.strictEqual(xmlXlsRes.summary.diagnostics.strategy, 'xls_xml2003');
  assert.strictEqual(xmlXlsRes.transactions[0].category, 'Subscriptions');
  assert.strictEqual(xmlXlsRes.transactions[0].amount, 649);

  // Corrupt/truncated OLE2 .xls buffer still fails cleanly with actionable error
  try {
    await parseStatement({
      content: Buffer.from('D0CF11E0A1B11AE1', 'hex'),
      filename: 'corrupt_legacy.xls',
      userTransactions: [],
    });
    assert.fail('Corrupt truncated .xls should have thrown an error');
  } catch (err) {
    assert(err.code === 'XLS_NOT_SUPPORTED' || err.code === 'XLS_INVALID');
  }
  console.log('  ✅ parseStatement parses binary BIFF8 .xls, HTML .xls, XML .xls, and rejects corrupt .xls cleanly');

  // 10. Excel (.xlsx) Statement Ingestion (including richText, formula result, and serial date)
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Transactions');
  ws.addRow(['HDFC Bank Account Statement']);
  ws.addRow(['Date', 'Narration', 'Withdrawal', 'Deposit', 'Chq/Ref No']);
  ws.addRow(['2025-02-01', { richText: [{ text: 'Uber Ride ' }, { text: 'Airport' }] }, 850, null, 'UBER9876']);
  const formulaRow = ws.addRow([45690, 'Interest Credited', null, { formula: '160*2', result: 320 }, 'INT2025']);
  formulaRow.getCell(1).numFmt = 'yyyy-mm-dd';
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
  assert.strictEqual(xlsxResult.transactions[1].date, '2025-02-02');
  console.log('  ✅ parseStatement parses Excel .xlsx (richText, formulas, serial dates) and ignores balance row');

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

  // 24. Vector-bordered PDF Table Extraction (pdf-parse getTable)
  const vectorTableStream = [
    '0.5 w',
    '40 700 520 80 re S',
    '40 755 m 560 755 l S',
    '40 737 m 560 737 l S',
    '40 718 m 560 718 l S',
    '120 700 m 120 780 l S',
    '330 700 m 330 780 l S',
    '420 700 m 420 780 l S',
    'BT /F1 10 Tf',
    '1 0 0 1 50 763 Tm (Date) Tj',
    '1 0 0 1 130 763 Tm (Description) Tj',
    '1 0 0 1 340 763 Tm (Debit) Tj',
    '1 0 0 1 430 763 Tm (Credit) Tj',
    '1 0 0 1 50 742 Tm (2025-02-01) Tj',
    '1 0 0 1 130 742 Tm (XYZ RETAIL CORP) Tj',
    '1 0 0 1 340 742 Tm (1250.00) Tj',
    '1 0 0 1 50 723 Tm (2025-02-02) Tj',
    '1 0 0 1 130 723 Tm (ACME CONSULTING) Tj',
    '1 0 0 1 430 723 Tm (45000.00) Tj',
    'ET',
  ].join('\n');
  const vectorPdfBuf = createMultiPagePdfBuffer([vectorTableStream]);
  const vectorResult = await parseStatement({
    content: vectorPdfBuf,
    filename: 'hdfc_vector_table.pdf',
    userTransactions: [],
  });
  assert.strictEqual(vectorResult.summary.diagnostics.strategy, 'pdf_vector_table');
  assert.strictEqual(vectorResult.transactions.length, 2);
  assert.strictEqual(vectorResult.transactions[0].type, 'expense');
  assert.strictEqual(vectorResult.transactions[0].amount, 1250);
  assert.strictEqual(vectorResult.transactions[1].type, 'income');
  assert.strictEqual(vectorResult.transactions[1].amount, 45000);
  console.log('  ✅ parseStatement extracts vector-bordered PDF tables with exact Debit/Credit column accuracy');

  // 25. Borderless Coordinate-Aligned PDF Stream Table with Wrapped Multi-line Narration
  const coordTableStream = [
    'BT /F1 10 Tf',
    '1 0 0 1 50 765 Tm (Date) Tj',
    '1 0 0 1 130 765 Tm (Particulars) Tj',
    '1 0 0 1 350 765 Tm (Debit) Tj',
    '1 0 0 1 435 765 Tm (Credit) Tj',
    '1 0 0 1 515 765 Tm (Balance) Tj',
    '1 0 0 1 50 742 Tm (01/03/2025) Tj',
    '1 0 0 1 130 742 Tm (NEFT-IN-9988776655) Tj',
    '1 0 0 1 435 742 Tm (50000.00) Tj',
    '1 0 0 1 515 742 Tm (150000.00) Tj',
    '1 0 0 1 130 729 Tm (GLOBAL TECH SOLUTIONS) Tj',
    '1 0 0 1 50 710 Tm (02/03/2025) Tj',
    '1 0 0 1 130 710 Tm (POS-BLINKIT GROCERY) Tj',
    '1 0 0 1 350 710 Tm (845.50) Tj',
    '1 0 0 1 515 710 Tm (149154.50) Tj',
    'ET',
  ].join('\n');
  const coordPdfBuf = createMultiPagePdfBuffer([coordTableStream]);
  const coordResult = await parseStatement({
    content: coordPdfBuf,
    filename: 'icici_borderless.pdf',
    userTransactions: [],
  });
  assert.strictEqual(coordResult.summary.diagnostics.strategy, 'pdf_coordinate_table');
  assert.strictEqual(coordResult.transactions.length, 2);
  assert.strictEqual(coordResult.transactions[0].type, 'income');
  assert.strictEqual(coordResult.transactions[0].amount, 50000);
  assert(/GLOBAL TECH SOLUTIONS/i.test(coordResult.transactions[0].note), 'Wrapped narration line must merge into row 1');
  assert.strictEqual(coordResult.transactions[1].type, 'expense');
  assert.strictEqual(coordResult.transactions[1].amount, 845.5);
  assert.strictEqual(coordResult.transactions[1].category, 'Groceries');
  console.log('  ✅ parseStatement reconstructs borderless coordinate PDF tables and merges wrapped narrations');

  // 26. Running-Balance Reconciliation (single ambiguous Amount column + Balance column)
  const balanceReconcileCsv = [
    'Date,Description,Amount,Balance',
    '2025-03-01,Opening Entry,1000.00,10000.00',
    '2025-03-02,ALPHA CORP,2500.00,12500.00',
    '2025-03-03,BETA SERVICES,450.00,12050.00',
  ].join('\n');
  const balanceReconcileRes = await parseStatement({
    content: balanceReconcileCsv,
    filename: 'reconcile.csv',
    userTransactions: [],
  });
  assert.strictEqual(balanceReconcileRes.transactions[1].type, 'income', 'Balance 10000 -> 12500 must identify ALPHA CORP as income');
  assert.strictEqual(balanceReconcileRes.transactions[2].type, 'expense', 'Balance 12500 -> 12050 must identify BETA SERVICES as expense');
  assert.strictEqual(balanceReconcileRes.summary.diagnostics.balanceReconciledCount, 2);
  console.log('  ✅ Running-balance reconciliation disambiguates Debit vs Credit accurately');

  // 27. Signed single-Amount CSV convention (negative = expense, positive = income)
  const signedCsv = 'Date,Description,Amount\n2026-09-01,Grocery Store,-65.40\n2026-09-02,Client Payout,2500.00';
  const signedRes = await parseStatement({
    content: signedCsv,
    filename: 'signed.csv',
    userTransactions: [],
  });
  assert.strictEqual(signedRes.transactions[0].type, 'expense');
  assert.strictEqual(signedRes.transactions[0].amount, 65.4);
  assert.strictEqual(signedRes.transactions[1].type, 'income', 'Positive entry in signed-amount column must be classified as income');
  assert.strictEqual(signedRes.transactions[1].amount, 2500);
  console.log('  ✅ Signed single-Amount CSV convention classifies positive/negative rows accurately');

  // 28. Quote-aware Delimiter Detection, UTF-16 LE BOM, 20 Metadata Header Rows & Large CSV Streaming (1,500 rows)
  assert.strictEqual(detectCsvDelimiter('"Coffee, Tea, Pastry";450.00;Debit\n"Lunch, Dinner";320.00;Debit'), ';');
  const metadataLines = Array.from({ length: 20 }, (_, i) => `Bank Metadata Line ${i + 1}`);
  const largeCsvRows = [
    ...metadataLines,
    'Date,Description,Debit,Credit',
  ];
  for (let i = 0; i < 1500; i += 1) {
    const day = String((i % 28) + 1).padStart(2, '0');
    const month = String(((Math.floor(i / 28)) % 12) + 1).padStart(2, '0');
    largeCsvRows.push(`2025-${month}-${day},"Swiggy, Order #${i + 1}",${(100 + (i % 50)).toFixed(2)},`);
  }
  // Include 2 invalid rows to test skip diagnostics
  largeCsvRows.push('bad-date,Broken Date Row,100.00,');
  largeCsvRows.push('2025-05-01,Zero Amount Row,0.00,');
  const utf16CsvBuf = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(largeCsvRows.join('\n'), 'utf16le'),
  ]);
  const largeCsvRes = await parseStatement({
    content: utf16CsvBuf,
    filename: 'large_export.csv',
    userTransactions: [],
  });
  assert.strictEqual(largeCsvRes.transactions.length, 1000, 'Large CSV must cap to IMPORT_LIMIT (1000)');
  assert.strictEqual(largeCsvRes.summary.truncated, true);
  assert.strictEqual(largeCsvRes.summary.droppedCount, 500);
  assert.strictEqual(largeCsvRes.summary.diagnostics.rowsSkipped, 2);
  assert.strictEqual(largeCsvRes.summary.diagnostics.strategy, 'csv_fast-csv');
  console.log('  ✅ fast-csv streaming, UTF-16 BOM, quote-aware delimiter, 20+ metadata rows, and 1500-row limit/diagnostics verified');

  // 29. Multi-Sheet Excel (.xlsx) where Sheet 1 is Cover Summary and Sheet 2 is Transactions
  const multiWb = new ExcelJS.Workbook();
  const coverWs = multiWb.addWorksheet('Summary');
  coverWs.addRow(['Account Holder', 'Test User']);
  coverWs.addRow(['Period', 'FY 2025']);
  const txWs = multiWb.addWorksheet('Transactions');
  txWs.addRow(['Date', 'Particulars', 'Debit', 'Credit']);
  txWs.addRow(['2025-04-01', 'Zomato Dinner', 620, null]);
  const multiXlsxBuf = await multiWb.xlsx.writeBuffer();
  const multiXlsxRes = await parseStatement({
    content: multiXlsxBuf,
    filename: 'multi_sheet.xlsx',
    userTransactions: [],
  });
  assert.strictEqual(multiXlsxRes.transactions.length, 1);
  assert.strictEqual(multiXlsxRes.transactions[0].category, 'Food');
  console.log('  ✅ Multi-sheet Excel (.xlsx) locates transaction worksheet past cover sheet');

  // 30. Multi-Page PDF Parallel Batch Processing + LRU Cache Hit
  clearParserCache();
  const sixPageStreams = [];
  for (let p = 0; p < 6; p += 1) {
    const lines = ['BT /F1 10 Tf'];
    if (p === 0) {
      lines.push('1 0 0 1 50 765 Tm (Date) Tj');
      lines.push('1 0 0 1 130 765 Tm (Description) Tj');
      lines.push('1 0 0 1 350 765 Tm (Debit) Tj');
      lines.push('1 0 0 1 440 765 Tm (Credit) Tj');
    }
    for (let r = 0; r < 10; r += 1) {
      const y = 740 - r * 20;
      const day = String(((p * 10 + r) % 28) + 1).padStart(2, '0');
      lines.push(`1 0 0 1 50 ${y} Tm (2025-05-${day}) Tj`);
      lines.push(`1 0 0 1 130 ${y} Tm (Amazon Purchase ${p}-${r}) Tj`);
      lines.push(`1 0 0 1 350 ${y} Tm (${(200 + r).toFixed(2)}) Tj`);
    }
    lines.push('ET');
    sixPageStreams.push(lines.join('\n'));
  }
  const sixPagePdfBuf = createMultiPagePdfBuffer(sixPageStreams);
  const firstRun = await parseStatement({
    content: sixPagePdfBuf,
    filename: 'six_page.pdf',
    userTransactions: [],
  });
  assert.strictEqual(firstRun.transactions.length, 60);
  assert.strictEqual(firstRun.summary.diagnostics.pageCount, 6);
  assert.strictEqual(firstRun.summary.diagnostics.cacheHit, false);

  const secondRun = await parseStatement({
    content: sixPagePdfBuf,
    filename: 'six_page.pdf',
    userTransactions: [
      {
        date: firstRun.transactions[0].date,
        type: firstRun.transactions[0].type,
        amount: firstRun.transactions[0].amount,
        merchant: firstRun.transactions[0].merchant,
        category: 'Shopping',
      },
    ],
  });
  assert.strictEqual(secondRun.summary.diagnostics.cacheHit, true, 'Second parse must hit LRU cache');
  assert.strictEqual(secondRun.transactions[0].duplicate, true, 'Cached parse must still compute fresh duplicate flags against live userTransactions');
  console.log('  ✅ Multi-page PDF parallel processing and SHA-256 LRU cache with live duplicate detection verified');

  // 31. Scanned / Image-Only PDF OCR Fallback & PDF_OCR_REQUIRED Error
  const blankTextPdf = createMultiPagePdfBuffer(['q 1 0 0 1 0 0 cm Q']);
  try {
    await parseStatement({
      content: blankTextPdf,
      filename: 'scanned_statement.pdf',
      userTransactions: [],
      ocrRunner: async () => ({ text: '', pagesOcred: 0 }),
    });
    assert.fail('Image-only PDF without OCR text should throw PDF_OCR_REQUIRED');
  } catch (err) {
    assert.strictEqual(err.code, 'PDF_OCR_REQUIRED');
    assert.strictEqual(err.ocr_required, true);
  }

  // Verify end-to-end parseStatement OCR pipeline when OCR runner extracts text
  const ocrParsed = await parseStatement({
    content: blankTextPdf,
    filename: 'scanned_statement.pdf',
    userTransactions: [],
    ocrRunner: async () => ({
      text: 'Paytm Payments Bank\n2025-06-01 Paid to Uber India Rs. 310.00',
      pagesOcred: 1,
    }),
  });
  assert.strictEqual(ocrParsed.summary.diagnostics.ocrUsed, true);
  assert.strictEqual(ocrParsed.summary.diagnostics.strategy, 'pdf_ocr');
  assert.strictEqual(ocrParsed.transactions.length, 1);
  assert.strictEqual(ocrParsed.transactions[0].amount, 310);
  assert.strictEqual(ocrParsed.transactions[0].category, 'Transport');
  console.log('  ✅ Scanned PDF OCR fallback and PDF_OCR_REQUIRED error handling verified');

  // 32. Express Multipart/Form-Data Upload & Multer Validation via /statement/preview Handler
  const previewLayer = transactionsRouter.stack.find(
    (layer) => layer.route && layer.route.path === '/statement/preview'
  );
  assert(previewLayer, 'POST /statement/preview route must exist');
  const uploadApp = express();
  uploadApp.use((req, _res, next) => {
    req.user = { id: '507f1f77bcf86cd799439011' };
    next();
  });
  // Mount only the upload middleware + parseStatement test endpoint to verify multipart buffer handling
  const handleStatementUploadMw = previewLayer.route.stack[0].handle;
  uploadApp.post('/test-upload', handleStatementUploadMw, async (req, res) => {
    const result = await parseStatement({
      content: req.file?.buffer || req.body?.content,
      filename: req.file?.originalname || req.body?.filename,
      dateFormat: req.body?.dateFormat,
      userTransactions: [],
    });
    res.json(result);
  });

  const server = uploadApp.listen(0);
  try {
    const port = server.address().port;
    const form = new FormData();
    form.append('file', new Blob(['Date,Description,Amount\n2025-07-01,Starbucks,-180.00'], { type: 'text/csv' }), 'upload.csv');
    form.append('accountId[$ne]', 'malicious');
    form.append('nested[a][b][c][d][e][f]', 'deep_payload');
    const resp = await fetch(`http://127.0.0.1:${port}/test-upload`, { method: 'POST', body: form });
    assert.strictEqual(resp.status, 200);
    const json = await resp.json();
    assert.strictEqual(json.transactions.length, 1);
    assert.strictEqual(json.transactions[0].category, 'Food');
    assert.strictEqual(json.transactions[0].amount, 180);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('  ✅ Multipart/form-data file upload middleware parses binary CSV buffer and sanitizes form fields');

  // 33. OCR Runner Exception Graceful Fallback
  try {
    await parseStatement({
      content: blankTextPdf,
      filename: 'ocr_crash_test.pdf',
      userTransactions: [],
      ocrRunner: async () => {
        throw new Error('Simulated Tesseract worker crash');
      },
    });
    assert.fail('OCR crash should still yield PDF_OCR_REQUIRED instead of crashing');
  } catch (err) {
    assert.strictEqual(err.code, 'PDF_OCR_REQUIRED');
    assert.strictEqual(err.ocr_required, true);
  }
  console.log('  ✅ OCR runner exceptions degrade gracefully to PDF_OCR_REQUIRED');

  // 34. Password-Protected PDF Error Mapping
  const { isPasswordError, createPasswordRequiredError } = require('../services/statement/pdfExtractor');
  assert.strictEqual(isPasswordError({ name: 'PasswordException', message: 'No password given' }), true);
  assert.strictEqual(isPasswordError(new Error('Document is encrypted')), true);
  const missingPassErr = createPasswordRequiredError(null);
  assert.strictEqual(missingPassErr.code, 'PDF_PASSWORD_REQUIRED');
  assert(/provide the statement password/i.test(missingPassErr.message));
  const wrongPassErr = createPasswordRequiredError('wrong123');
  assert.strictEqual(wrongPassErr.code, 'PDF_PASSWORD_REQUIRED');
  assert(/Incorrect password/i.test(wrongPassErr.message));
  console.log('  ✅ Password-protected PDF error handling verified (missing vs incorrect password)');

  // 35. Headerless / Unlabeled Excel (.xlsx) Rejection
  const unlabeledWb = new ExcelJS.Workbook();
  const unlabeledWs = unlabeledWb.addWorksheet('Sheet1');
  unlabeledWs.addRow(['2025-01-01', '100.00', 'Random Text']);
  unlabeledWs.addRow(['2025-01-02', '200.00', 'More Text']);
  const unlabeledBuf = await unlabeledWb.xlsx.writeBuffer();
  try {
    await parseStatement({
      content: unlabeledBuf,
      filename: 'unlabeled.xlsx',
      userTransactions: [],
    });
    assert.fail('Unlabeled Excel workbook should reject with missing header error');
  } catch (err) {
    assert(/Could not identify date and description columns/i.test(err.message));
  }
  console.log('  ✅ Headerless Excel workbook fails cleanly with descriptive column error');

  // 36. Empty Parse Result Caching (prevents CPU abuse on repeated empty PDF previews)
  clearParserCache();
  const emptyActivityPdf = createPdfBuffer([
    'HDFC Bank Monthly Statement',
    'No transactions recorded for this billing period.',
  ]);
  assert.strictEqual(getParserCacheStats().size, 0);
  try {
    await parseStatement({
      content: emptyActivityPdf,
      filename: 'empty_statement.pdf',
      userTransactions: [],
    });
    assert.fail('Empty statement should throw No valid transactions');
  } catch (err) {
    assert(/No valid transactions/i.test(err.message));
  }
  assert.strictEqual(getParserCacheStats().size, 1, 'Empty parse result must be cached to prevent repeated re-extraction');
  try {
    await parseStatement({
      content: emptyActivityPdf,
      filename: 'empty_statement.pdf',
      userTransactions: [],
    });
    assert.fail('Cached empty statement should still throw No valid transactions');
  } catch (err) {
    assert(/No valid transactions/i.test(err.message));
  }
  assert.strictEqual(getParserCacheStats().size, 1);
  console.log('  ✅ Empty parse results are cached in LRU cache to prevent repeated CPU extraction');

  // 37. enrichRawPdfTransactions Invalid-Amount Safety Guard
  const safeEnriched = enrichRawPdfTransactions({
    rawTransactions: [
      { date: '2025-07-01', type: 'expense', amount: null, desc: 'Corrupt null amount' },
      { date: '2025-07-01', type: 'expense', amount: Number.NaN, desc: 'Corrupt NaN amount' },
      { date: '2025-07-01', type: 'expense', amount: -20, desc: 'Negative amount' },
      { date: '2025-07-01', type: 'expense', amount: 250, desc: 'Paid to Swiggy' },
    ],
    defaultBank: 'HDFC Bank',
    statementSource: 'bank_pdf',
    merchantCategories: new Map(),
    accountId: null,
  });
  assert.strictEqual(safeEnriched.length, 1);
  assert.strictEqual(safeEnriched[0].amount, 250);
  console.log('  ✅ enrichRawPdfTransactions safely skips null/NaN/non-positive amounts without throwing');

  // 38. 100-Page PDF Scale Test (500 transactions) & Express Route Ordering Check
  const hundredPageStreams = [];
  for (let p = 0; p < 100; p += 1) {
    const lines = ['BT /F1 10 Tf'];
    if (p === 0) {
      lines.push('1 0 0 1 50 765 Tm (Date) Tj');
      lines.push('1 0 0 1 130 765 Tm (Description) Tj');
      lines.push('1 0 0 1 350 765 Tm (Debit) Tj');
      lines.push('1 0 0 1 440 765 Tm (Credit) Tj');
    }
    for (let r = 0; r < 5; r += 1) {
      const y = 740 - r * 20;
      const day = String(((p * 5 + r) % 28) + 1).padStart(2, '0');
      lines.push(`1 0 0 1 50 ${y} Tm (2025-08-${day}) Tj`);
      lines.push(`1 0 0 1 130 ${y} Tm (Vendor ${p}-${r}) Tj`);
      lines.push(`1 0 0 1 350 ${y} Tm (${(100 + r).toFixed(2)}) Tj`);
    }
    lines.push('ET');
    hundredPageStreams.push(lines.join('\n'));
  }
  const hundredPagePdfBuf = createMultiPagePdfBuffer(hundredPageStreams);
  const hundredPageRes = await parseStatement({
    content: hundredPagePdfBuf,
    filename: 'large_100_pages.pdf',
    userTransactions: [],
  });
  assert.strictEqual(hundredPageRes.summary.diagnostics.pageCount, 100);
  assert.strictEqual(hundredPageRes.transactions.length, 500);

  // Verify static routes precede dynamic /:userId and /:id routes in transactionsRouter
  const routePaths = transactionsRouter.stack
    .filter((l) => l.route)
    .map((l) => l.route.path);
  const userIdIdx = routePaths.indexOf('/:userId');
  assert(userIdIdx > -1, '/:userId route must exist');
  assert(routePaths.indexOf('/statement/preview') < userIdIdx, '/statement/preview must precede /:userId');
  assert(routePaths.indexOf('/statement/import') < userIdIdx, '/statement/import must precede /:userId');
  assert(routePaths.indexOf('/process-recurring') < userIdIdx, '/process-recurring must precede /:userId');
  assert(routePaths.indexOf('/bulk-delete') < userIdIdx, '/bulk-delete must precede /:userId');
  console.log('  ✅ 100-page PDF (500 txns) parallel extraction and Express static-before-dynamic route ordering verified');

  // 39. Multi-line Paytm UPI Statement PDF (yearless DD Mon dates, Money sent to / Recharge of / Received from, # Tag)
  const paytmUpiPdf = createMultiPagePdfBuffer([
    [
      'BT /F1 11 Tf',
      '1 0 0 1 50 760 Tm (Paytm Statement for 1 NOV\'26 - 9 NOV\'26) Tj',
      '1 0 0 1 50 740 Tm (Total Money Paid - Rs.4,369  Total Money Received + Rs.1,000) Tj',
      '1 0 0 1 50 720 Tm (Passbook Payments History) Tj',
      '1 0 0 1 50 695 Tm (09 Nov) Tj',
      '1 0 0 1 50 680 Tm (8:25 PM) Tj',
      '1 0 0 1 50 665 Tm (Paid to Mahakaleshwar Food And Beverages) Tj',
      '1 0 0 1 50 650 Tm (UPI ID: bharatpe.9b0z0n1o0t552235@unitype) Tj',
      '1 0 0 1 50 635 Tm (UPI Ref No: 631361780456) Tj',
      '1 0 0 1 50 620 Tm (Tag: # Food) Tj',
      '1 0 0 1 50 605 Tm (Union Bank Of India - 39) Tj',
      '1 0 0 1 50 590 Tm (- Rs.20) Tj',
      '1 0 0 1 50 560 Tm (06 Nov) Tj',
      '1 0 0 1 50 545 Tm (10:44 PM) Tj',
      '1 0 0 1 50 530 Tm (Received from Sonali Sidalingayya Mathapati) Tj',
      '1 0 0 1 50 515 Tm (UPI Ref No: 227702296142) Tj',
      '1 0 0 1 50 500 Tm (Tag: # Money Received) Tj',
      '1 0 0 1 50 485 Tm (Union Bank Of India - 39) Tj',
      '1 0 0 1 50 470 Tm (+ Rs.1,000) Tj',
      '1 0 0 1 50 440 Tm (02 Nov) Tj',
      '1 0 0 1 50 425 Tm (5:19 PM) Tj',
      '1 0 0 1 50 410 Tm (Recharge of Jio Mobile 9356707688) Tj',
      '1 0 0 1 50 395 Tm (UPI Ref No: 219548811778) Tj',
      '1 0 0 1 50 380 Tm (Tag: # Bill Payments) Tj',
      '1 0 0 1 50 365 Tm (Union Bank Of India - 39) Tj',
      '1 0 0 1 50 350 Tm (- Rs.349) Tj',
      'ET',
    ].join('\n'),
  ]);
  const paytmUpiRes = await parseStatement({
    content: paytmUpiPdf,
    filename: 'Paytm_UPI_Statement.pdf',
    userTransactions: [],
  });
  assert.strictEqual(paytmUpiRes.transactions.length, 3);
  assert.strictEqual(paytmUpiRes.transactions[0].date, '2026-11-09');
  assert.strictEqual(paytmUpiRes.transactions[0].merchant, 'Mahakaleshwar Food And Beverages');
  assert.strictEqual(paytmUpiRes.transactions[0].category, 'Food');
  assert.strictEqual(paytmUpiRes.transactions[0].bank_name, 'Union Bank of India');
  assert.strictEqual(paytmUpiRes.transactions[1].type, 'income');
  assert.strictEqual(paytmUpiRes.transactions[1].merchant, 'Sonali Sidalingayya Mathapati');
  assert.strictEqual(paytmUpiRes.transactions[1].category, 'Income');
  assert.strictEqual(paytmUpiRes.transactions[2].category, 'Bills');
  assert.strictEqual(paytmUpiRes.transactions[2].amount, 349);
  console.log('  ✅ Paytm UPI multi-line statement PDF (year inference, # Tags, clean merchants, +/- amounts) verified');

  console.log('\n🎉 ALL STATEMENT PARSER UNIT TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Statement Parser Test Failed:', err);
  process.exit(1);
});
