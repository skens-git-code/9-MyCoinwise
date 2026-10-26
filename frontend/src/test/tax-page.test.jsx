import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Tax from '../pages/Tax';
import { AppContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getTaxProfiles: vi.fn(),
    estimateTax: vi.fn(),
    getTaxTaggedTransactions: vi.fn(),
    getTaxPayments: vi.fn(),
    getTaxDocuments: vi.fn(),
    estimateCapitalGainsTax: vi.fn(),
    createTaxProfile: vi.fn(),
    updateTaxProfile: vi.fn(),
    deleteTaxProfile: vi.fn(),
    tagTransactionForTax: vi.fn(),
    removeTaxTag: vi.fn(),
    createTaxPayment: vi.fn(),
    deleteTaxPayment: vi.fn(),
    createTaxDocument: vi.fn(),
    deleteTaxDocument: vi.fn(),
    getTaxReport: vi.fn(),
    compareIndiaTaxRegimes: vi.fn(),
  },
}));

describe('Tax Center Page Suite', () => {
  const mockUser = {
    id: 'u1',
    _id: 'u1',
    username: 'Test User',
    currency: 'INR',
  };

  const mockContextValue = {
    user: mockUser,
    transactions: [
      { _id: 'tx1', id: 'tx1', type: 'expense', amount: 5000, category: 'Medical', date: '2024-05-10' },
      { _id: 'tx2', id: 'tx2', type: 'income', amount: 100000, category: 'Salary', date: '2024-05-01' },
    ],
    currency: 'INR',
    lang: 'en',
    t: (key) => (key === 'tax_center' ? 'Tax Center' : key),
  };

  const renderTaxPage = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={mockContextValue}>
            <Tax />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders empty state when no tax profiles exist', async () => {
    api.getTaxProfiles.mockResolvedValueOnce({ profiles: [] });

    renderTaxPage();

    await waitFor(() => {
      expect(screen.getByText(/Tax Center/i)).toBeInTheDocument();
      expect(screen.getByText(/No tax profile yet/i)).toBeInTheDocument();
      expect(screen.getByText(/Create first profile/i)).toBeInTheDocument();
    });
  });

  it('2. Renders full profile dashboard when profiles exist', async () => {
    const mockProfile = {
      _id: 'p1',
      id: 'p1',
      name: 'My India Profile — FY 2024-25',
      jurisdiction: 'IN',
      fiscal_year: 2024,
      tax_regime: 'new',
      filing_status: 'single',
      dependents: 0,
      currency: 'INR',
      updated_at: new Date().toISOString(),
    };

    api.getTaxProfiles.mockResolvedValue({ profiles: [mockProfile] });
    api.estimateTax.mockResolvedValue({
      estimate: {
        grossIncome: 1200000,
        taxableIncome: 1125000,
        standardDeductionApplied: 75000,
        itemizedDeductionsApplied: 0,
        preTaxContributions: 0,
        taxBeforeCredits: 65000,
        creditsApplied: 0,
        totalLiability: 67600,
        paymentsMade: 20000,
        balanceDue: 47600,
        refundExpected: 0,
        effectiveRate: 5.63,
        marginalRate: 15,
        hasTaxableActivity: true,
      },
      ruleSet: {
        brackets: [
          { min: 0, max: 300000, rate: 0 },
          { min: 300000, max: 700000, rate: 0.05 },
          { min: 700000, max: 1000000, rate: 0.1 },
          { min: 1000000, max: 1200000, rate: 0.15 },
        ],
      },
    });
    api.getTaxTaggedTransactions.mockResolvedValue({ transactions: [] });
    api.getTaxPayments.mockResolvedValue({ payments: [] });
    api.getTaxDocuments.mockResolvedValue({ documents: [] });
    api.estimateCapitalGainsTax.mockResolvedValue({ capital_gains: null });

    renderTaxPage();

    await waitFor(() => {
      expect(screen.getByText(/Tax Center/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: /My India Profile/i })).toBeInTheDocument();
      expect(screen.getAllByText(/Estimated liability/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Balance due/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: /Tax readiness/i })).toBeInTheDocument();
    });
  });

  it('3. Allows switching between tabs (Deductions, Capital Gains, Payments, Documents, Reports)', async () => {
    const mockProfile = {
      _id: 'p1',
      id: 'p1',
      name: 'My India Profile — FY 2024-25',
      jurisdiction: 'IN',
      fiscal_year: 2024,
      tax_regime: 'new',
      filing_status: 'single',
      dependents: 0,
      currency: 'INR',
      updated_at: new Date().toISOString(),
    };

    api.getTaxProfiles.mockResolvedValue({ profiles: [mockProfile] });
    api.estimateTax.mockResolvedValue({
      estimate: { grossIncome: 1000000, totalLiability: 50000, balanceDue: 50000, hasTaxableActivity: true },
      ruleSet: { brackets: [] },
    });
    api.getTaxTaggedTransactions.mockResolvedValue({ transactions: [] });
    api.getTaxPayments.mockResolvedValue({ payments: [] });
    api.getTaxDocuments.mockResolvedValue({ documents: [] });
    api.estimateCapitalGainsTax.mockResolvedValue({ capital_gains: null });

    renderTaxPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /My India Profile/i })).toBeInTheDocument();
    });

    // Switch to Deductions
    fireEvent.click(screen.getByRole('button', { name: /^Deductions$/i }));
    expect(screen.getByText(/Deduction tracker/i)).toBeInTheDocument();

    // Switch to Capital Gains
    fireEvent.click(screen.getByRole('button', { name: /^Capital Gains$/i }));
    expect(screen.getByRole('heading', { level: 3, name: /^Capital gains$/i })).toBeInTheDocument();

    // Switch to Payments
    fireEvent.click(screen.getByRole('button', { name: /^Payments$/i }));
    expect(screen.getByRole('heading', { level: 3, name: /^Payments and TDS$/i })).toBeInTheDocument();

    // Switch to Documents
    fireEvent.click(screen.getByRole('button', { name: /^Documents$/i }));
    expect(screen.getByRole('heading', { level: 3, name: /^Tax documents$/i })).toBeInTheDocument();

    // Switch to Reports
    fireEvent.click(screen.getByRole('button', { name: /^Reports$/i }));
    expect(screen.getByRole('heading', { level: 3, name: /^Yearly report$/i })).toBeInTheDocument();
  });

  it('4. Displays error banner with retry option when API fails', async () => {
    api.getTaxProfiles.mockRejectedValueOnce(new Error('Network error loading profiles'));

    renderTaxPage();

    await waitFor(() => {
      expect(screen.getByText(/Tax Center is unavailable/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });
  });
});
