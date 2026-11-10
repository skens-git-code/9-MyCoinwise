import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import Transactions from '../pages/Transactions';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getTransactions: vi.fn().mockResolvedValue([]),
    deleteTransaction: vi.fn().mockResolvedValue({ success: true }),
    previewBankStatement: vi.fn(),
    importBankStatement: vi.fn(),
    exportToExcel: vi.fn().mockResolvedValue(true),
  },
  CURRENCIES: {
    INR: { symbol: '₹', name: 'Indian Rupee' },
  },
  getStoredToken: vi.fn(() => 'mock-token'),
}));

const renderTransactions = (contextOverrides = {}) => {
  const mockUser = {
    id: 'user-1',
    _id: 'user-1',
    username: 'Test User',
    currency: 'INR',
  };

  const defaultContext = {
    user: mockUser,
    USER_ID: 'user-1',
    transactions: [
      {
        id: 'tx-1',
        _id: 'tx-1',
        amount: 250,
        type: 'expense',
        category: 'Food',
        merchant: 'Swiggy',
        note: 'Dinner',
        date: '2026-10-01T12:00:00.000Z',
        is_deleted: false,
      },
    ],
    currency: 'INR',
    currencyInfo: { symbol: '₹', code: 'INR' },
    formatCurrency: (val) => `₹${Number(val || 0).toFixed(2)}`,
    fmt: (val) => `₹${Number(val || 0).toFixed(2)}`,
    t: () => null,
    theme: 'dark',
    refetch: vi.fn().mockResolvedValue(undefined),
    ...contextOverrides,
  };

  return {
    ...render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={defaultContext}>
            <Transactions />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    ),
    refetch: defaultContext.refetch,
  };
};

describe('Transactions Statement Import & Export Buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('header Import button activates non-display-none file input and clears prior value', () => {
    const { container } = renderTransactions();
    const importBtn = screen.getByRole('button', { name: /Import/i });
    const fileInput = container.querySelector('input[type="file"]');

    expect(fileInput).toBeTruthy();
    expect(fileInput.style.display).not.toBe('none');
    expect(fileInput.style.pointerEvents).not.toBe('none');
    expect(fileInput.getAttribute('accept')).toContain('.pdf');
    expect(fileInput.getAttribute('accept')).toContain('.csv');
    expect(fileInput.getAttribute('accept')).toContain('.xlsx');
    expect(fileInput.getAttribute('accept')).toContain('.xls');

    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.click(importBtn);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('imports CSV, Excel (.xlsx), and PDF files through preview modal to wallet confirmation', async () => {
    const formats = [
      { name: 'statement.csv', mime: 'text/csv', category: 'Food' },
      {
        name: 'statement.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        category: 'Refund',
      },
      { name: 'statement.pdf', mime: 'application/pdf', category: 'Transport' },
    ];

    const { container, refetch } = renderTransactions();
    const fileInput = container.querySelector('input[type="file"]');

    for (const sample of formats) {
      const mockAnalysis = {
        transactions: [
          {
            id: `row-${sample.name}`,
            date: '2026-10-12',
            type: sample.category === 'Refund' ? 'income' : 'expense',
            amount: 420.5,
            category: sample.category,
            merchant: 'Test Merchant',
            bank_name: 'HDFC Bank',
            payment_method: 'upi',
            transaction_number: `TXN-${sample.name}`,
            import_fingerprint: `fp-${sample.name}`,
            duplicate: false,
            confidence: 'high',
          },
        ],
        summary: {
          detected: 1,
          credits: sample.category === 'Refund' ? 1 : 0,
          debits: sample.category === 'Refund' ? 0 : 1,
          totalCreditAmount: sample.category === 'Refund' ? 420.5 : 0,
          totalDebitAmount: sample.category === 'Refund' ? 0 : 420.5,
          detectedBank: 'HDFC Bank',
          detectedFormat: sample.name.split('.').pop().toUpperCase(),
          currentTxCount: 1,
          maxLimit: 1000,
          remainingSlots: 999,
          warnings: [],
        },
      };

      api.previewBankStatement.mockResolvedValueOnce(mockAnalysis);
      api.importBankStatement.mockResolvedValueOnce({ created: 1, skipped: 0 });

      const file = new File(['dummy-statement-bytes'], sample.name, { type: sample.mime });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(api.previewBankStatement).toHaveBeenCalledWith({
          file,
          filename: sample.name,
        });
      });

      const dialog = await screen.findByRole('dialog');
      expect(dialog.querySelector('.modal-wide')).toBeTruthy();

      const categorySelect = screen.getByLabelText(/Category for Test Merchant/i);
      expect(categorySelect.value).toBe(sample.category);

      const confirmBtn = screen.getByRole('button', { name: /Add 1 to Wallet/i });
      expect(confirmBtn.disabled).toBe(false);
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.importBankStatement).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(refetch).toHaveBeenCalled();
      });

      vi.clearAllMocks();
    }
  });

  it('handles password-protected PDFs and OCR-required errors cleanly', async () => {
    const { container } = renderTransactions();
    const fileInput = container.querySelector('input[type="file"]');

    const pdfFile = new File(['%PDF-1.4'], 'locked.pdf', { type: 'application/pdf' });
    api.previewBankStatement.mockRejectedValueOnce({
      response: { data: { code: 'PDF_PASSWORD_REQUIRED' } },
    });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    const pwdInput = await screen.findByPlaceholderText(/Enter password to unlock/i);
    fireEvent.change(pwdInput, { target: { value: 'ABCDE1234F' } });

    api.previewBankStatement.mockResolvedValueOnce({
      transactions: [
        {
          id: 'pdf-1',
          date: '2026-10-14',
          type: 'expense',
          amount: 199,
          category: 'Bills',
          merchant: 'Airtel',
          import_fingerprint: 'fp-pdf-unlock',
          duplicate: false,
        },
      ],
      summary: { detected: 1, detectedFormat: 'PDF', currentTxCount: 1, maxLimit: 1000, remainingSlots: 999 },
    });

    fireEvent.click(screen.getByRole('button', { name: /Unlock & Analyze/i }));

    await waitFor(() => {
      expect(api.previewBankStatement).toHaveBeenLastCalledWith(
        expect.objectContaining({
          file: pdfFile,
          filename: 'locked.pdf',
          password: 'ABCDE1234F',
        })
      );
    });

    expect(await screen.findByText(/Airtel/i)).toBeTruthy();

    // OCR-required error should unlock button state cleanly
    api.previewBankStatement.mockRejectedValueOnce({
      response: { data: { code: 'PDF_OCR_REQUIRED', ocr_required: true } },
    });
    const scanPdf = new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [scanPdf] } });

    await waitFor(() => {
      const headerImportBtn = screen.getAllByRole('button', { name: /Import/i })[0];
      expect(headerImportBtn.disabled).toBe(false);
    });

    // Anchors-type unsupported layout errors show a friendly actionable message
    api.previewBankStatement.mockRejectedValueOnce({
      response: { data: { error: "Cannot read properties of undefined (reading 'anchors')" } },
    });
    const brokenExcel = new File(['PK'], 'broken.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(fileInput, { target: { files: [brokenExcel] } });
    expect(await screen.findByText(/unsupported layout/i)).toBeTruthy();
  });

  it('renders an Import button in the empty state and supports drag-and-drop plus Export Excel (.xlsx)', async () => {
    const { container } = renderTransactions({ transactions: [] });
    const emptyImportBtn = screen.getByRole('button', { name: /Import CSV \/ Excel \/ PDF/i });
    const fileInput = container.querySelector('input[type="file"]');

    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.click(emptyImportBtn);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Drag & drop CSV onto page container
    const csvFile = new File(['Date,Narration,Debit\n2026-10-10,Coffee,120'], 'drop.csv', { type: 'text/csv' });
    api.previewBankStatement.mockResolvedValueOnce({
      transactions: [],
      summary: { detected: 0, detectedFormat: 'CSV', currentTxCount: 0, maxLimit: 1000, remainingSlots: 1000 },
    });

    const pageEl = container.querySelector('.tx-page');
    fireEvent.drop(pageEl, { dataTransfer: { files: [csvFile] } });

    await waitFor(() => {
      expect(api.previewBankStatement).toHaveBeenCalledWith({
        file: csvFile,
        filename: 'drop.csv',
      });
    });

    // Empty-rows fallback in modal lets user pick another file
    expect(await screen.findByText(/No valid transactions matched in this file/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    // Export dropdown includes Export Excel (.xlsx) wired to api.exportToExcel
    fireEvent.click(screen.getByRole('button', { name: /Export/i }));
    const xlsxItem = await screen.findByRole('menuitem', { name: /Export Excel \(\.xlsx\)/i });
    fireEvent.click(xlsxItem);
    await waitFor(() => {
      expect(api.exportToExcel).toHaveBeenCalledWith('user-1');
    });
  });

  it('guards malformed preview payloads and rolls back Date Format dropdown on re-analyze error', async () => {
    const { container } = renderTransactions();
    const fileInput = container.querySelector('input[type="file"]');

    // Malformed payload without transactions array does not crash or open modal
    api.previewBankStatement.mockResolvedValueOnce({});
    const badResFile = new File(['a,b\n1,2'], 'malformed.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [badResFile] } });
    expect(await screen.findByText(/corrupted or unsupported/i)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    // Valid preview then failed re-analyze should roll Date Format back to Auto ("")
    const validFile = new File(['Date,Narration,Debit\n05/06/2026,Coffee,100'], 'dates.csv', { type: 'text/csv' });
    api.previewBankStatement.mockResolvedValueOnce({
      transactions: [
        {
          id: 'd-1',
          date: '2026-06-05',
          type: 'expense',
          amount: 100,
          category: 'Food',
          merchant: 'Coffee',
          import_fingerprint: 'fp-d-1',
          duplicate: false,
        },
      ],
      summary: { detected: 1, detectedFormat: 'CSV', currentTxCount: 1, maxLimit: 1000, remainingSlots: 999 },
    });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    const dateSelect = await screen.findByLabelText(/Date Format/i);
    expect(dateSelect.value).toBe('');

    api.previewBankStatement.mockRejectedValueOnce({
      response: { data: { error: 'Re-analysis failed' } },
    });
    fireEvent.change(dateSelect, { target: { value: 'MDY' } });

    expect(await screen.findByText(/Re-analysis failed/i)).toBeTruthy();
    await waitFor(() => {
      expect(dateSelect.value).toBe('');
    });
  });
});

