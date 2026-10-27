import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportToPDF, exportReceiptPDF } from '../services/pdfExport';

describe('PDF Export Engine v2 Audit Tests', () => {
  beforeEach(() => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports successfully and returns full 64-character SHA-256 hash', async () => {
    const user = { username: 'AuditUser', balance: 1000, currency: 'USD' };
    const transactions = [
      { date: '2025-01-01', type: 'income', amount: 500, category: 'Salary' },
      { date: '2025-01-02', type: 'expense', amount: 100, category: 'Groceries' },
    ];

    const result = await exportToPDF(user, transactions);
    expect(result.success).toBe(true);
    expect(result.fileName).toContain('AuditUser');
    expect(result.checksum).toMatch(/^SHA256:[a-f0-9]{64}$/);
    expect(result.checksum.length).toBe(71); // 'SHA256:' (7) + 64 hex chars = 71
  });

  it('handles insecure contexts where crypto.subtle is undefined without throwing', async () => {
    // Mock subtle.digest to throw or simulate unavailable digest
    const digestSpy = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValueOnce(
      new Error('crypto.subtle is not supported in insecure context')
    );

    const user = { username: 'InsecureUser', balance: 500, currency: 'USD' };
    const transactions = [{ date: '2025-01-01', type: 'income', amount: 200 }];

    const result = await exportToPDF(user, transactions);
    expect(result.success).toBe(true);
    expect(result.fileName).toContain('InsecureUser');
    expect(result.checksum).toBeNull();
    digestSpy.mockRestore();
  });

  it('handles null or undefined transactions array gracefully without crashing', async () => {
    const user = { username: 'EmptyUser', balance: 0, currency: 'USD' };

    const resultNull = await exportToPDF(user, null);
    expect(resultNull.success).toBe(true);

    const resultUndef = await exportToPDF(user, undefined);
    expect(resultUndef.success).toBe(true);
  });

  it('preserves calendar date correctly for YYYY-MM-DD input without off-by-one timezone shift', async () => {
    const user = { username: 'DateTestUser', balance: 250, currency: 'USD' };
    const transactions = [
      { date: '2025-01-01', type: 'income', amount: 250, category: 'Bonus' },
    ];

    const result = await exportToPDF(user, transactions);
    expect(result.success).toBe(true);
  });

  it('supports INR currency and formats without error', async () => {
    const user = { username: 'InrUser', balance: 150000, currency: 'INR' };
    const transactions = [
      { date: '2025-01-01', type: 'income', amount: 100000, category: 'Salary' },
      { date: '2025-01-02', type: 'expense', amount: 25000, category: 'Rent' },
    ];

    const result = await exportToPDF(user, transactions, { symbol: '₹' });
    expect(result.success).toBe(true);
  });

  it('shortens long descriptions and collapses whitespace via cleanDescription', async () => {
    const { cleanDescription } = await import('../services/pdfExport');
    const longDesc = 'Issued: 16 Oct 2026 18:54 Base Currency: INR (INR) ACCOUNT HOLDER: Sarthak (skenscode@gmail.com) STATEMENT SCOPE: All Accounts (Consolidated) PERIOD COVERED: All Recorded History ENTRIES: 1 record(s) SAVINGS RATE: 100.0% STATUS: AUDIT VERIFIED';
    const shortened = cleanDescription(longDesc, 52);

    expect(shortened.length).toBeLessThanOrEqual(52);
    expect(shortened.endsWith('...')).toBe(true);

    const multilineDesc = 'Line 1\n\n\tLine 2   with   spaces';
    expect(cleanDescription(multilineDesc)).toBe('Line 1 Line 2 with spaces');
    expect(cleanDescription('')).toBe('Transaction Entry');
    expect(cleanDescription(null)).toBe('Transaction Entry');
  });

  it('generates multi-page PDF statements when transaction count exceeds one page', async () => {
    const user = { username: 'MultiPageUser', balance: 50000, currency: 'USD' };
    // Create 60 transactions to guarantee multi-page flow
    const transactions = Array.from({ length: 60 }, (_, i) => ({
      _id: `tx-${i + 1}`,
      date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
      type: i % 2 === 0 ? 'income' : 'expense',
      amount: 100 + i * 10,
      category: i % 3 === 0 ? 'Food' : (i % 3 === 1 ? 'Transport' : 'Shopping'),
      note: `Transaction record #${i + 1} with standard detail note for verification`,
    }));

    const result = await exportToPDF(user, transactions, { symbol: '$' }, 'en-US', {
      title: 'Tax-Ready Audit',
      referenceId: 'MCW-STMT-20250101-ABCD12',
      accountNumber: 'MCW-ACC-•••CD12',
      includeCategories: true,
      includeSeal: true,
    });

    expect(result.success).toBe(true);
    expect(result.fileName).toContain('MultiPageUser');
    expect(result.checksum).toMatch(/^SHA256:[a-f0-9]{64}$/);
  });

  it('exports single transaction payment receipt PDF with audit checksum and clean naming', async () => {
    const user = { username: 'ReceiptUser', currency: 'INR' };
    const tx = {
      _id: 'tx-999',
      id: 'tx-999',
      transaction_number: 'TXN-PAYTM-8822',
      amount: 450,
      type: 'expense',
      category: 'Dining',
      merchant: 'Gourmet Cafe',
      bank_name: 'HDFC Bank',
      payment_method: 'UPI',
      date: '2026-09-18T10:30:00.000Z',
      note: 'Team lunch',
      tags: ['food', 'work'],
    };

    const res = await exportReceiptPDF(user, tx, { symbol: '₹' }, 'en-US');
    expect(res.success).toBe(true);
    expect(res.fileName).toContain('Coinwise_Receipt_TXN-PAYTM-8822');
    expect(res.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles null transaction gracefully in exportReceiptPDF', async () => {
    const res = await exportReceiptPDF({ username: 'Test' }, null);
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });
});
