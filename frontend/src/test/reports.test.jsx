import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppStateContext, AppActionsContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import Reports from '../pages/Reports';

vi.mock('../services/api', () => ({
  api: {
    exportToExcel: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../services/pdfExport', () => ({
  exportToPDF: vi.fn().mockResolvedValue({ success: true, fileName: 'MyCoinwise_Statement_Test.pdf' }),
}));

describe('Reports & Statements Download Center (A4 Executive Edition)', () => {
  const mockTransactions = [
    {
      id: 'tx-1',
      _id: 'tx-1',
      date: new Date().toISOString(),
      type: 'income',
      category: 'Salary',
      note: 'October Payroll',
      amount: 5000,
    },
    {
      id: 'tx-2',
      _id: 'tx-2',
      date: new Date().toISOString(),
      type: 'expense',
      category: 'Housing',
      note: 'Apartment Rent',
      amount: 1500,
    },
    {
      id: 'tx-3',
      _id: 'tx-3',
      date: new Date().toISOString(),
      type: 'expense',
      category: 'Dining',
      note: 'Bistro dinner',
      amount: 120,
    },
  ];

  const stateVal = {
    user: { id: 'u1', _id: 'u1', username: 'Alex Mercer', currency: 'USD', balance: 3380 },
    currency: 'USD',
    currencyInfo: { symbol: '$', code: 'USD' },
    transactions: mockTransactions,
    accounts: [{ id: 'acc-1', name: 'Primary Checking', type: 'Checking' }],
    USER_ID: 'u1',
    lang: 'en-US',
    loading: false,
  };

  const actionsVal = {
    fmt: (val) => `$${Number(val || 0).toFixed(2)}`,
    refetch: vi.fn(),
    t: (k, fb) => fb || k,
  };

  const renderReports = () => {
    return render(
      <MemoryRouter>
        <AppStateContext.Provider value={stateVal}>
          <AppActionsContext.Provider value={actionsVal}>
            <ToastProvider>
              <Reports />
            </ToastProvider>
          </AppActionsContext.Provider>
        </AppStateContext.Provider>
      </MemoryRouter>
    );
  };

  it('renders Statements & Report Center header and download action buttons', () => {
    renderReports();
    expect(screen.getByText(/Statements & Report Center/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download A4 PDF/i })).toBeInTheDocument();
  });

  it('renders the live A4 document sheet with institutional particulars and financial matrix', () => {
    renderReports();
    expect(screen.getByText('COINWISE')).toBeInTheDocument();
    expect(screen.getByText('CERTIFIED')).toBeInTheDocument();
    expect(screen.getByText('Alex Mercer')).toBeInTheDocument();
    expect(screen.getByText(/Itemized Transaction Ledger/i)).toBeInTheDocument();
    expect(screen.getByText(/Digitally Signed/i)).toBeInTheDocument();
    expect(screen.getByText(/October Payroll/i)).toBeInTheDocument();
  });

  it('switches statement type presets (Income, Expenses, Consolidated)', () => {
    renderReports();
    const incomePill = screen.getByRole('button', { name: /Income & Inflows/i });
    fireEvent.click(incomePill);

    // After filtering for Income, only payroll should be present, not apartment rent
    expect(screen.getByText(/October Payroll/i)).toBeInTheDocument();
    expect(screen.queryByText(/Apartment Rent/i)).not.toBeInTheDocument();
  });

  it('toggles transaction notes and verification seal elements', () => {
    renderReports();
    const notesToggle = screen.getByLabelText(/Transaction Notes/i);
    expect(notesToggle).toBeChecked();

    // Uncheck transaction notes
    fireEvent.click(notesToggle);
    expect(notesToggle).not.toBeChecked();

    const sealToggle = screen.getByLabelText(/Verification Seal & Hash/i);
    expect(sealToggle).toBeChecked();
    fireEvent.click(sealToggle);
    expect(sealToggle).not.toBeChecked();
  });

  it('triggers PDF generation with includeNotes and includeSeal options', async () => {
    const { exportToPDF } = await import('../services/pdfExport');
    renderReports();
    const pdfBtn = screen.getByRole('button', { name: /Download A4 PDF/i });
    fireEvent.click(pdfBtn);

    expect(exportToPDF).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Alex Mercer' }),
      expect.any(Array),
      expect.any(Object),
      expect.any(String),
      expect.objectContaining({
        includeNotes: true,
        includeSeal: true,
      })
    );
  });

  it('triggers Excel export passing start and end dates', async () => {
    const { api } = await import('../services/api');
    renderReports();
    const excelBtn = screen.getByRole('button', { name: /Excel/i });
    fireEvent.click(excelBtn);

    expect(api.exportToExcel).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        statementType: 'consolidated',
        start: expect.any(String),
        end: expect.any(String),
      })
    );
  });

  it('adjusts zoom level when clicking Zoom In, Zoom Out, and Fit', () => {
    renderReports();
    const zoomInBtn = screen.getByTitle('Zoom In');
    const zoomOutBtn = screen.getByTitle('Zoom Out');
    const fitBtn = screen.getByRole('button', { name: 'Fit' });

    fireEvent.click(zoomInBtn);
    expect(screen.getByText('110%')).toBeInTheDocument();

    fireEvent.click(zoomOutBtn);
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(fitBtn);
    expect(fitBtn).toBeInTheDocument();
  });
});
