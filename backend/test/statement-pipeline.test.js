/**
 * Statement Pipeline HTTP Integration Tests (Multipart & JSON -> Preview -> Import)
 *
 * Verifies end-to-end route compatibility across CSV, Excel (.xlsx / .xls), and PDF:
 *   1. POST /api/transactions/statement/preview accepts FormData multipart uploads
 *   2. Real CSV, ExcelJS .xlsx, and HTML-table .xls statements parse cleanly
 *   3. JSON fallback preview (content / fileData base64) continues working
 *   4. POST /api/transactions/statement/import accepts parsed preview rows seamlessly
 *   5. Empty/missing uploads return structured 400 errors instead of 500s
 */

const assert = require('assert');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const sharp = require('sharp');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const { config } = require('../config/env');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const transactionsRouter = require('../routes/transactions');
const { parseOoxmlViaZipXml } = require('../services/statement/excelParser');
const { parseStatement } = require('../services/statementParser');
const { RECEIPTS_PUBLIC_DIR, sanitizeReceiptUrl } = require('../services/statement/receiptStorage');

async function buildXlsxBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Statement');
  ws.addRow(['Date', 'Description', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance']);
  ws.addRow(['15/10/2026', 'UPI-SWIGGY-123456789012', '450.00', '', '9550.00']);
  ws.addRow(['16/10/2026', 'NEFT-ACME SALARY-998877665544', '', '25000.00', '34550.00']);
  const arrBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrBuf);
}

async function runTests() {
  console.log('🧪 Running Statement Pipeline HTTP Integration Tests...');

  const fakeUserId = new mongoose.Types.ObjectId().toString();
  const token = jwt.sign(
    { id: fakeUserId, sessionVersion: 0 },
    config.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const origUserFindById = User.findById;
  const origUserFindByIdAndUpdate = User.findByIdAndUpdate;
  const origTxFind = Transaction.find;
  const origTxCount = Transaction.countDocuments;
  const origTxInsertMany = Transaction.insertMany;
  const origAccountFind = Account.find;

  const insertedStore = [];

  User.findById = (id) => {
    const doc = String(id) === fakeUserId
      ? { _id: fakeUserId, id: fakeUserId, household_id: fakeUserId, username: 'tester', currency: 'INR', role: 'user', session_version: 0 }
      : null;
    const q = Promise.resolve(doc);
    q.select = () => q;
    q.lean = () => Promise.resolve(doc);
    return q;
  };
  User.findByIdAndUpdate = async () => ({ _id: fakeUserId, balance: 24550 });

  Transaction.find = () => {
    const rows = [];
    const chain = {
      select: () => chain,
      sort: () => chain,
      limit: () => chain,
      lean: async () => rows,
    };
    return chain;
  };
  Transaction.countDocuments = async () => insertedStore.length;
  Transaction.insertMany = async (docs) => {
    const saved = docs.map((d) => ({
      ...d,
      _id: new mongoose.Types.ObjectId(),
    }));
    insertedStore.push(...saved);
    return saved;
  };
  Account.find = () => ({
    select: () => ({
      lean: async () => [],
    }),
  });

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/transactions', transactionsRouter);
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const authHeader = { Authorization: `Bearer ${token}` };

    // 1. Multipart CSV upload -> Preview -> Import
    const csvForm = new FormData();
    csvForm.append(
      'file',
      new Blob(['Date,Narration,Debit,Credit\n12/10/2026,UPI Zomato 918273645512,320.00,\n'], { type: 'text/csv' }),
      'hdfc.csv'
    );
    csvForm.append('filename', 'hdfc.csv');

    const csvPreviewRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/preview`, {
      method: 'POST',
      headers: authHeader,
      body: csvForm,
    });
    assert.strictEqual(csvPreviewRes.status, 200, 'Multipart CSV preview should return 200');
    const csvPreview = await csvPreviewRes.json();
    assert.strictEqual(csvPreview.summary.detectedFormat, 'CSV');
    assert.strictEqual(csvPreview.transactions.length, 1);
    assert.strictEqual(csvPreview.transactions[0].amount, 320);

    // 2. Multipart Excel (.xlsx) upload -> Preview -> Import
    const xlsxBuf = await buildXlsxBuffer();
    const xlsxForm = new FormData();
    xlsxForm.append(
      'file',
      new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'hdfc.xlsx'
    );
    xlsxForm.append('filename', 'hdfc.xlsx');

    const xlsxPreviewRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/preview`, {
      method: 'POST',
      headers: authHeader,
      body: xlsxForm,
    });
    assert.strictEqual(xlsxPreviewRes.status, 200, 'Multipart XLSX preview should return 200');
    const xlsxPreview = await xlsxPreviewRes.json();
    assert.strictEqual(xlsxPreview.summary.detectedFormat, 'Excel');
    assert.strictEqual(xlsxPreview.transactions.length, 2);

    // 3. Multipart legacy HTML-table .xls upload -> Preview
    const xlsHtml = '<table><tr><th>Date</th><th>Description</th><th>Debit</th></tr><tr><td>17/10/2026</td><td>UPI Uber 123412341234</td><td>185.00</td></tr></table>';
    const xlsForm = new FormData();
    xlsForm.append('file', new Blob([xlsHtml], { type: 'application/vnd.ms-excel' }), 'sbi.xls');
    xlsForm.append('filename', 'sbi.xls');

    const xlsPreviewRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/preview`, {
      method: 'POST',
      headers: authHeader,
      body: xlsForm,
    });
    assert.strictEqual(xlsPreviewRes.status, 200, 'Multipart HTML .xls preview should return 200');
    const xlsPreview = await xlsPreviewRes.json();
    assert.strictEqual(xlsPreview.summary.detectedFormat, 'Excel');
    assert.strictEqual(xlsPreview.transactions.length, 1);

    // 4. Import parsed rows through POST /statement/import
    const toImport = [...csvPreview.transactions, ...xlsxPreview.transactions, ...xlsPreview.transactions];
    const importRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/import`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: toImport }),
    });
    assert.strictEqual(importRes.status, 201, 'Statement import should return 201 Created');
    const importJson = await importRes.json();
    assert.strictEqual(importJson.created, 4);
    assert.strictEqual(importJson.skipped, 0);
    assert.strictEqual(insertedStore.length, 4);

    // 5. Missing payload guard returns 400 cleanly
    const emptyRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/preview`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(emptyRes.status, 400);

    // 6. Real-world Paytm Spending Dashboard workbook (35-row dashboard header + un-evaluated formulas + trailing summary tables)
    const dashboardLines = [
      'PAYTM SPENDING DASHBOARD,,,,,,',
      '01–09 November 2026 | Prepared from the 4-page Paytm UPI statement,,,,,,',
      ...Array.from({ length: 30 }, () => ',,,,,,'),
      'PAYTM TRANSACTION LEDGER,,,,,,,,,,',
      'Statement period: 01–09 November 2026 | Source: uploaded Paytm UPI statement,,,,,,,,,,',
      'Date,Time,Type,Counterparty,Category / Tag,Note,UPI ID,UPI Reference No.,Amount (INR),Signed Amount (INR),Account',
      '2026-11-09,20:25:00,Debit,Mahakaleshwar Food And Beverages,Food,Pay to BharatPe Merchant,bharatpe.9b0z0n1o0t552235@unitype,631361780456,20,,Union Bank Of India - 39',
      '2026-11-08,19:07:00,Debit,Sumit,Groceries,,paytm.s1p07u0@pty,631253660826,5,,Union Bank Of India - 39',
      '2026-11-08,19:07:00,Debit,Sumit,Groceries,,paytm.s1p07u0@pty,631253636434,50,,Union Bank Of India - 39',
      '2026-11-06,22:44:00,Credit,Sonali Sidalingayya Mathapati,Money Received,,******1682@ybl,227702296142,1000,,Union Bank Of India - 39',
      '2026-11-03,11:00:00,Debit,RISHIHOOD,Education,Pay,rishihood.esbz@hdfcbank,630798864574,4000,,Union Bank Of India - 39',
      '2026-11-02,17:19:00,Debit,Jio Mobile Recharge 9356707688,Bill Payments,,paybil3066@ptybl,219548811778,349,,Union Bank Of India - 39',
      'CATEGORY-WISE SPENDING,,,',
      'Category,Transactions,Total Spent (INR),Share of Spending',
      'Education,3,4004,75.4%',
      'DAILY CASH FLOW,,,,',
      'Date,Payments Made (INR),Money Received (INR),Net Cash Flow (INR),Payment Count',
      '2026-11-09,40,0,-40,2',
    ];
    const paytmForm = new FormData();
    paytmForm.append('file', new Blob([dashboardLines.join('\n')], { type: 'text/csv' }), 'paytm-dashboard.csv');
    paytmForm.append('filename', 'paytm-dashboard.csv');
    const paytmRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/preview`, {
      method: 'POST',
      headers: authHeader,
      body: paytmForm,
    });
    assert.strictEqual(paytmRes.status, 200, 'Paytm dashboard CSV preview should succeed');
    const paytmPreview = await paytmRes.json();
    assert.strictEqual(paytmPreview.transactions.length, 6, 'Should detect all 6 ledger rows and ignore trailing summary tables');
    assert.strictEqual(paytmPreview.summary.credits, 1);
    assert.strictEqual(paytmPreview.summary.debits, 5);
    assert.strictEqual(paytmPreview.transactions[0].merchant, 'Mahakaleshwar Food And Beverages');
    assert.strictEqual(paytmPreview.transactions[0].bank_name, 'Union Bank of India');
    assert.strictEqual(paytmPreview.transactions[0].payment_method, 'upi');
    assert.strictEqual(paytmPreview.transactions[5].category, 'Bills');

    // Same layout inside an .xlsx workbook with un-evaluated Excel formulas
    const dashWb = new ExcelJS.Workbook();
    const dashWs = dashWb.addWorksheet('Dashboard');
    for (let i = 0; i < 33; i += 1) dashWs.addRow([i === 0 ? 'PAYTM SPENDING DASHBOARD' : '']);
    dashWs.addRow(['Date', 'Time', 'Type', 'Counterparty', 'Category / Tag', 'Note', 'UPI ID', 'UPI Reference No.', 'Amount (INR)', 'Signed Amount (INR)', 'Account']);
    dashWs.addRow(['2026-11-03', '11:00:00', 'Debit', 'RISHIHOOD', 'Education', 'Pay', 'rishihood.esbz@hdfcbank', '630798864574', 4000, { formula: '=IF(C35="Debit",-I35,I35)' }, 'Union Bank Of India - 39']);
    dashWs.addRow(['2026-11-06', '22:44:00', 'Credit', 'Sonali Sidalingayya Mathapati', 'Money Received', '', '******1682@ybl', '227702296142', 1000, { formula: '=IF(C36="Debit",-I36,I36)' }, 'Union Bank Of India - 39']);
    const dashXlsxBuf = Buffer.from(await dashWb.xlsx.writeBuffer());
    const dashXlsxForm = new FormData();
    dashXlsxForm.append('file', new Blob([dashXlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'paytm-dashboard.xlsx');
    dashXlsxForm.append('filename', 'paytm-dashboard.xlsx');
    const dashXlsxRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/preview`, {
      method: 'POST',
      headers: authHeader,
      body: dashXlsxForm,
    });
    assert.strictEqual(dashXlsxRes.status, 200, 'Paytm dashboard XLSX with 34 header rows and formulas should succeed');
    const dashXlsxPreview = await dashXlsxRes.json();
    assert.strictEqual(dashXlsxPreview.transactions.length, 2);
    assert.strictEqual(dashXlsxPreview.transactions[0].amount, 4000);
    assert.strictEqual(dashXlsxPreview.transactions[0].type, 'expense');
    assert.strictEqual(dashXlsxPreview.transactions[1].amount, 1000);
    assert.strictEqual(dashXlsxPreview.transactions[1].type, 'income');

    // 7. ExcelJS drawing/chart `anchors` crash fallback (Tier 2 stripped ZIP + Tier 3 direct XML reader)
    const chartZip = await JSZip.loadAsync(dashXlsxBuf);
    const sheetXml = await chartZip.files['xl/worksheets/sheet1.xml'].async('string');
    chartZip.file('xl/worksheets/sheet1.xml', sheetXml.replace('</worksheet>', '<drawing r:id="rIdChart1"/></worksheet>'));
    chartZip.file('xl/worksheets/_rels/sheet1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdChart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
    const chartXlsxBuf = await chartZip.generateAsync({ type: 'nodebuffer' });

    // Prove raw ExcelJS fails on this drawing rel (`anchors`) while our pipeline succeeds
    let rawExcelJsFailed = false;
    try {
      await new ExcelJS.Workbook().xlsx.load(chartXlsxBuf);
    } catch (e) {
      rawExcelJsFailed = /anchors/i.test(e.message);
    }
    assert.strictEqual(rawExcelJsFailed, true, 'Raw ExcelJS should hit the anchors error on drawing1.xml');

    const chartForm = new FormData();
    chartForm.append('file', new Blob([chartXlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'chart-dashboard.xlsx');
    chartForm.append('filename', 'chart-dashboard.xlsx');
    const chartRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/preview`, {
      method: 'POST',
      headers: authHeader,
      body: chartForm,
    });
    assert.strictEqual(chartRes.status, 200, 'Chart/drawing XLSX triggering ExcelJS anchors crash must still succeed');
    const chartPreview = await chartRes.json();
    assert.strictEqual(chartPreview.transactions.length, 2);
    assert.strictEqual(chartPreview.transactions[0].merchant, 'RISHIHOOD');

    // Tier 3 direct OOXML ZIP XML parser verification
    const tier3Rows = await parseOoxmlViaZipXml(chartXlsxBuf);
    assert(tier3Rows.length >= 3, 'Tier 3 XML parser must extract header and transaction rows');

    // 8. Excel embedded receipt image extraction + sharp compression + row matching + persistence
    const createdReceiptFiles = [];
    try {
      const fakeReceiptPng = await sharp({
        create: { width: 1200, height: 900, channels: 3, background: { r: 245, g: 245, b: 250 } },
      })
        .png({ compressionLevel: 0 })
        .toBuffer();

      const imgWb = new ExcelJS.Workbook();
      const imgWs = imgWb.addWorksheet('Ledger');
      imgWs.addRow(['Date', 'Counterparty', 'Type', 'Amount (INR)']);
      imgWs.addRow(['2026-11-08', 'Cafe Coffee Day', 'Debit', 350]);
      const imgId = imgWb.addImage({ buffer: fakeReceiptPng, extension: 'png' });
      imgWs.addImage(imgId, { tl: { col: 0, row: 1 }, ext: { width: 200, height: 150 } }); // 0-based row 1 = 1-based Excel row 2
      const imgXlsxBuf = Buffer.from(await imgWb.xlsx.writeBuffer());

      const imgXlsxForm = new FormData();
      imgXlsxForm.append('file', new Blob([imgXlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'with-receipt.xlsx');
      imgXlsxForm.append('filename', 'with-receipt.xlsx');
      const imgXlsxRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/preview`, {
        method: 'POST',
        headers: authHeader,
        body: imgXlsxForm,
      });
      assert.strictEqual(imgXlsxRes.status, 200);
      const imgXlsxPreview = await imgXlsxRes.json();
      assert.strictEqual(imgXlsxPreview.transactions.length, 1);
      const xlsxReceiptUrl = imgXlsxPreview.transactions[0].receipt_url;
      assert(xlsxReceiptUrl && xlsxReceiptUrl.startsWith('/api/uploads/receipts/'), 'Excel embedded receipt image should attach receipt_url');
      createdReceiptFiles.push(path.join(RECEIPTS_PUBLIC_DIR, path.basename(xlsxReceiptUrl)));

      // Persist through /statement/import and confirm receipt_url is stored
      const importImgRes = await fetch(`http://127.0.0.1:${port}/api/transactions/statement/import`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: imgXlsxPreview.transactions }),
      });
      assert.strictEqual(importImgRes.status, 201);
      const savedReceiptTx = insertedStore.find((t) => t.merchant === 'Cafe Coffee Day');
      assert.strictEqual(savedReceiptTx.receipt_url, xlsxReceiptUrl);

      // 9. Direct image upload (PNG/JPG receipt) through OCR parser + compressed receipt storage + XSS sanitization
      const ocrImageRes = await parseStatement({
        content: fakeReceiptPng,
        filename: 'cafe-bill.png',
        userTransactions: [],
        ocrRunner: async () => ({
          text: 'Blue Tokai Coffee Roasters\nDate: 08/11/2026\nGrand Total: Rs.480.00\nThank you!',
          pagesOcred: 1,
        }),
      });
      assert.strictEqual(ocrImageRes.summary.detectedFormat, 'Image (OCR)');
      assert.strictEqual(ocrImageRes.summary.diagnostics.ocrUsed, true);
      assert.strictEqual(ocrImageRes.transactions.length, 1);
      assert.strictEqual(ocrImageRes.transactions[0].amount, 480);
      assert.strictEqual(ocrImageRes.transactions[0].merchant, 'Blue Tokai Coffee Roasters');
      assert(ocrImageRes.transactions[0].receipt_url?.startsWith('/api/uploads/receipts/'));
      createdReceiptFiles.push(path.join(RECEIPTS_PUBLIC_DIR, path.basename(ocrImageRes.transactions[0].receipt_url)));

      // Verify sanitizeReceiptUrl blocks XSS / path traversal
      assert.strictEqual(sanitizeReceiptUrl('javascript:alert(1)'), null);
      assert.strictEqual(sanitizeReceiptUrl('/api/uploads/receipts/../../secret.txt'), null);
      assert.strictEqual(sanitizeReceiptUrl('/api/uploads/receipts/receipt-abc.jpg'), '/api/uploads/receipts/receipt-abc.jpg');

      // 10. Regression guard: extractAndSaveImages must time out cleanly if pdf-parse getImage() stalls
      const { extractAndSaveImages } = require('../services/statement/pdfExtractor');
      const hangingParser = {
        getImage: () => new Promise(() => {}),
      };
      const tStart = Date.now();
      const timedOutImages = await extractAndSaveImages(hangingParser, { timeoutMs: 80 });
      assert.deepStrictEqual(timedOutImages, []);
      assert(Date.now() - tStart < 1500, 'extractAndSaveImages should not hang when getImage stalls');
    } finally {
      for (const f of createdReceiptFiles) {
        await fs.unlink(f).catch(() => {});
      }
    }

    console.log('  ✅ Multipart CSV, XLSX, HTML-.xls preview & /statement/import integration passed');
  } finally {
    server.close();
    User.findById = origUserFindById;
    User.findByIdAndUpdate = origUserFindByIdAndUpdate;
    Transaction.find = origTxFind;
    Transaction.countDocuments = origTxCount;
    Transaction.insertMany = origTxInsertMany;
    Account.find = origAccountFind;
  }
}

runTests().catch((err) => {
  console.error('❌ Statement pipeline test failed:', err);
  process.exit(1);
});

