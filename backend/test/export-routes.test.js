/**
 * Export & Backup Route Unit Tests
 *
 * Verifies:
 *   1. Route ordering: GET /backup/:userId precedes GET /:userId
 *   2. CSV formula-injection neutralization (including leading whitespace)
 *   3. Excel cell formula-injection neutralization & length bounds
 *   4. Currency conversion for mixed-currency Excel Summary totals
 *   5. Streaming CSV and streaming Excel (WorkbookWriter) output verification
 */

const assert = require('assert');
const express = require('express');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const { config } = require('../config/env');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const exportRouter = require('../routes/export');
const { convertToCurrency } = require('../utils/currency');

async function runTests() {
  console.log('🧪 Running Export & Backup Route Unit Tests...');

  // 1. Route ordering check
  const routePaths = exportRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);
  const backupIdx = routePaths.indexOf('/backup/:userId');
  const exportIdx = routePaths.indexOf('/:userId');
  assert(backupIdx >= 0 && exportIdx >= 0, 'Both /backup/:userId and /:userId routes must exist');
  assert(backupIdx < exportIdx, '/backup/:userId must precede /:userId');
  console.log('  ✅ GET /backup/:userId precedes GET /:userId in export router');

  // 2. CSV formula-injection neutralization (including leading whitespace)
  const { escapeCsv, sanitizeExcelCell } = exportRouter;
  assert.strictEqual(escapeCsv('=CMD()'), '"\'=CMD()"');
  assert.strictEqual(escapeCsv('  =CMD()'), '"\'=CMD()"');
  assert.strictEqual(escapeCsv('\t+SUM(A1)'), '"\'+SUM(A1)"');
  assert.strictEqual(escapeCsv('  @A1'), '"\'@A1"');
  assert.strictEqual(escapeCsv('-42.50'), '"-42.50"', 'Pure negative numbers must not be mangled');
  assert.strictEqual(escapeCsv('Coffee "Special"'), '"Coffee ""Special"""');
  console.log('  ✅ escapeCsv neutralizes leading-whitespace formula payloads while preserving numbers');

  // 3. Excel cell sanitization
  assert.strictEqual(sanitizeExcelCell(' =1+1'), '\'=1+1');
  assert.strictEqual(sanitizeExcelCell('Normal Note'), 'Normal Note');
  assert.strictEqual(sanitizeExcelCell('a'.repeat(600), 100).length, 100);
  console.log('  ✅ sanitizeExcelCell neutralizes formula payloads and enforces max length');

  // 4. Mixed-currency conversion accuracy
  const usdInInr = convertToCurrency(10, 'USD', 'INR');
  assert.strictEqual(usdInInr, 835);
  assert.strictEqual(convertToCurrency(100, 'INR', 'INR'), 100);
  assert.strictEqual(convertToCurrency(50, 'XYZ', 'INR'), 50, 'Unsupported currency falls back safely');
  console.log('  ✅ Mixed-currency conversion helper verified');

  // 5. End-to-end streaming CSV & Excel WorkbookWriter verification with mocked Mongoose queries
  const fakeUserId = new mongoose.Types.ObjectId().toString();
  const token = jwt.sign({ id: fakeUserId }, config.JWT_SECRET, { expiresIn: '5m' });

  const sampleDocs = [
    {
      _id: new mongoose.Types.ObjectId(),
      date: new Date('2026-04-01T12:00:00Z'),
      type: 'income',
      category: 'Salary',
      amount: 100,
      currency: 'USD',
      note: ' =CMD|calc',
    },
    {
      _id: new mongoose.Types.ObjectId(),
      date: new Date('2026-04-02T12:00:00Z'),
      type: 'expense',
      category: 'Food',
      amount: 500,
      currency: 'INR',
      note: 'Lunch',
    },
  ];

  const origUserFindById = User.findById;
  const origTxFind = Transaction.find;

  User.findById = (id) => {
    const doc = String(id) === fakeUserId
      ? { _id: fakeUserId, id: fakeUserId, household_id: fakeUserId, username: 'tester', currency: 'INR', role: 'user', session_version: 0 }
      : null;
    const q = Promise.resolve(doc);
    q.select = () => q;
    q.lean = () => Promise.resolve(doc);
    return q;
  };

  Transaction.find = () => ({
    sort: () => ({
      limit: () => ({
        lean: () => ({
          cursor: () => ({
            async *[Symbol.asyncIterator]() {
              for (const doc of sampleDocs) yield doc;
            },
            close: async () => {},
          }),
        }),
      }),
    }),
  });

  const app = express();
  app.use('/api/export', exportRouter);
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const headers = { Authorization: `Bearer ${token}` };

    // 5a. Streaming CSV export
    const csvResp = await fetch(`http://127.0.0.1:${port}/api/export/${fakeUserId}?format=csv`, { headers });
    assert.strictEqual(csvResp.status, 200);
    const csvText = await csvResp.text();
    assert(csvText.includes('\'=CMD|calc'), 'Streaming CSV must neutralize leading-space formula injection');
    assert(csvText.includes('"100.00","USD"'), 'Streaming CSV must preserve original transaction currency');

    // 5b. Streaming Excel export with mixed-currency summary conversion
    const xlsxResp = await fetch(`http://127.0.0.1:${port}/api/export/${fakeUserId}?format=xlsx`, { headers });
    assert.strictEqual(xlsxResp.status, 200);
    const xlsxBuf = Buffer.from(await xlsxResp.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBuf);
    const txWs = wb.getWorksheet('Transactions');
    assert(txWs, 'Transactions worksheet must be present');
    assert.strictEqual(txWs.getRow(1).getCell(7).value, 'Amount (INR)');
    assert.strictEqual(txWs.getRow(2).getCell(5).value, 'USD');
    assert.strictEqual(txWs.getRow(2).getCell(7).value, '₹8350.00');
    const summaryWs = wb.getWorksheet('Summary');
    assert(summaryWs, 'Summary worksheet must be present');
    // 100 USD -> 8350 INR; expense = 500 INR; net = 7850 INR
    const totalIncomeCell = summaryWs.getRow(2).getCell(2).value;
    const totalExpenseCell = summaryWs.getRow(3).getCell(2).value;
    const netCell = summaryWs.getRow(4).getCell(2).value;
    assert.strictEqual(totalIncomeCell, '₹8350.00');
    assert.strictEqual(totalExpenseCell, '₹500.00');
    assert.strictEqual(netCell, '₹7850.00');
    console.log('  ✅ Streaming CSV and mixed-currency streaming Excel exports verified');

    // 5c. 0-row streaming Excel export produces a valid openable .xlsx workbook
    sampleDocs.length = 0;
    const emptyXlsxResp = await fetch(`http://127.0.0.1:${port}/api/export/${fakeUserId}?format=xlsx`, { headers });
    assert.strictEqual(emptyXlsxResp.status, 200);
    const emptyXlsxBuf = Buffer.from(await emptyXlsxResp.arrayBuffer());
    const emptyWb = new ExcelJS.Workbook();
    await emptyWb.xlsx.load(emptyXlsxBuf);
    assert.strictEqual(emptyWb.getWorksheet('Summary').getRow(5).getCell(2).value, 0);
    console.log('  ✅ 0-row streaming Excel export produces a valid workbook');
  } finally {
    User.findById = origUserFindById;
    Transaction.find = origTxFind;
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n🎉 ALL EXPORT & BACKUP ROUTE TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Export Route Test Failed:', err);
  process.exit(1);
});

