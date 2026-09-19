import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import Dashboard from '../pages/Dashboard';

vi.mock('../services/api', () => ({
  api: {
    getTransactions: vi.fn().mockResolvedValue([]),
    getAccounts: vi.fn().mockResolvedValue([]),
  },
  CURRENCIES: {
    INR: { symbol: '₹', name: 'Indian Rupee' },
    USD: { symbol: '$', name: 'US Dollar' },
  },
  getStoredToken: vi.fn(() => 'mock-token'),
}));

describe('Dashboard Hierarchy & Correctness (Acceptance Criteria SC-1 to SC-6)', () => {
  const sampleTransactions = [
    { id: '1', amount: 50000, type: 'income', category: 'Salary', date: '2026-09-01T10:00:00.000Z', is_deleted: false },
    { id: '2', amount: 15000, type: 'expense', category: 'Rent', date: '2026-09-02T10:00:00.000Z', is_deleted: false },
    { id: '3', amount: 4000, type: 'expense', category: 'Groceries', date: '2026-09-03T10:00:00.000Z', is_deleted: false },
    { id: '4', amount: 2000, type: 'expense', category: 'Dining', date: '2026-09-04T10:00:00.000Z', is_deleted: false },
    { id: '5', amount: 1200, type: 'expense', category: 'Utilities', date: '2026-09-05T10:00:00.000Z', is_deleted: false },
    { id: '6', amount: 800, type: 'expense', category: 'Transport', date: '2026-09-06T10:00:00.000Z', is_deleted: false },
  ];

  const mockContextValue = {
    transactions: sampleTransactions,
    accounts: [{ id: 'acc-1', name: 'Checking', initial_balance: 10000, is_active: true }],
    user: { monthly_goal: 20000, preferred_currency: 'INR' },
    loading: false,
    formatCurrency: (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`,
    currencySymbol: '₹',
    theme: 'dark',
    deleteTransaction: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    fetchTransactions: vi.fn(),
  };

  const renderDashboard = (customContext = {}) => {
    const value = { ...mockContextValue, ...customContext };
    return render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={value}>
            <Dashboard />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );
  };

  it('SC-1: renders Total Balance with dominant hero typography and tabular numerals', () => {
    renderDashboard();
    const heroCard = document.querySelector('.bento-hero');
    expect(heroCard).toBeTruthy();

    const balanceHeader = heroCard.querySelector('h2');
    expect(balanceHeader).toBeTruthy();
    expect(balanceHeader.style.fontVariantNumeric).toBe('tabular-nums');

    const sparkline = heroCard.querySelector('.bh-sparkline-svg');
    expect(sparkline).toBeTruthy();
    expect(sparkline.getAttribute('viewBox')).toBe('0 0 240 48');
  });

  it('SC-2: caps Recent Transactions teaser to exactly 4 items and renders "View all transactions →"', () => {
    renderDashboard();
    const recentCard = document.querySelector('.bento-recent');
    expect(recentCard).toBeTruthy();

    const txItems = recentCard.querySelectorAll('.bt-item');
    expect(txItems.length).toBe(4);

    const viewAllLink = recentCard.querySelector('.bt-view-all-btn');
    expect(viewAllLink).toBeTruthy();
    expect(viewAllLink.textContent).toContain('View all 6 transactions →');
    expect(viewAllLink.getAttribute('href')).toBe('/transactions');
  });

  it('SC-3: displays EmptyTransactionState and hides "View all" when transaction count is 0', () => {
    renderDashboard({ transactions: [] });
    const recentCard = document.querySelector('.bento-recent');
    expect(recentCard).toBeTruthy();

    expect(recentCard.querySelector('.bt-view-all-btn')).toBeNull();
    expect(screen.getByText(/Start your journey/i)).toBeTruthy();
  });

  it('SC-4: eliminates bento-insight-pill from header and renders calm KPI strip with delta badges', () => {
    renderDashboard();
    // SC-4a: bento-insight-pill is deleted
    expect(document.querySelector('.bento-insight-pill')).toBeNull();

    // SC-4b: Calm KPI strip exists with delta badges
    const strip = document.querySelector('.dashboard-quick-stats-strip');
    expect(strip).toBeTruthy();
    const pills = strip.querySelectorAll('.dqs-pill');
    expect(pills.length).toBe(3);
    expect(strip.textContent).toContain('Savings Rate:');
    expect(strip.textContent).toContain('Top Expense:');
    expect(strip.textContent).toContain('Daily Avg Spend:');
  });

  it('SC-5: hides flat line chart and renders steady notice when Net Worth data is flat or low density', () => {
    // 1 transaction -> 1 day data point -> flat/low density (< 3 points)
    renderDashboard({
      transactions: [{ id: '1', amount: 1000, type: 'income', category: 'Salary', date: '2026-09-01T10:00:00.000Z' }],
      accounts: [{ id: 'acc-1', initial_balance: 5000, is_active: true }],
    });

    const netWorthCard = document.querySelector('.bento-networth');
    expect(netWorthCard).toBeTruthy();
    expect(netWorthCard.querySelector('.recharts-responsive-container')).toBeNull();
    expect(netWorthCard.textContent).toContain('Net worth has remained steady this period.');
  });

  it('SC-6: accurately computes Savings Goal surplus and displays 100%+ and surplus amount', () => {
    // Income = 50,000, Expense = 23,000 => Net = 27,000. Goal = 20,000 => Surplus = 7,000
    renderDashboard({
      user: { monthly_goal: 20000, preferred_currency: 'INR' },
    });

    const goalCard = document.querySelector('.bento-goal');
    expect(goalCard).toBeTruthy();

    // Percentage displays raw percentage or 100%+
    const pct = goalCard.querySelector('.bg-pct');
    expect(pct.textContent).toMatch(/(135%|100%\+)/);

    // Nudge displays exact surplus
    const nudge = goalCard.querySelector('.bg-nudge');
    expect(nudge.textContent).toMatch(/Goal met · \+.*7,000.*surplus/);
  });
});
