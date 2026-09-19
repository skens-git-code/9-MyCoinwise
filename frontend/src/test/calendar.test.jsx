import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import Calendar from '../pages/Calendar';

vi.mock('../services/api', () => ({
  api: {
    getTransactions: vi.fn().mockResolvedValue([]),
  },
  CURRENCIES: {
    INR: { symbol: '₹', name: 'Indian Rupee' },
  },
  getStoredToken: vi.fn(() => 'mock-token'),
}));

describe('Calendar Hub Financial Rhythm Overhaul', () => {
  const sampleTransactions = [
    {
      id: 'tx-1',
      _id: 'tx-1',
      amount: 45000,
      type: 'income',
      category: 'Salary',
      merchant: 'Acme Corp',
      date: '2026-09-01T10:00:00.000Z',
      is_deleted: false,
    },
    {
      id: 'tx-2',
      _id: 'tx-2',
      amount: 15000,
      type: 'expense',
      category: 'Rent',
      merchant: 'Landlord',
      date: '2026-09-05T10:00:00.000Z',
      is_recurring: true,
      is_deleted: false,
    },
    {
      id: 'tx-3',
      _id: 'tx-3',
      amount: 3200,
      type: 'expense',
      category: 'Groceries',
      merchant: 'Supermarket',
      date: '2026-09-12T10:00:00.000Z',
      is_deleted: false,
    },
  ];

  const sampleSubscriptions = [
    {
      id: 'sub-1',
      name: 'Netflix',
      amount: 499,
      start_date: '2026-09-05',
      cycle: 'monthly',
      is_paused: false,
    },
  ];

  const mockContext = {
    user: { id: 'u1', username: 'Tester', currency: 'INR' },
    transactions: sampleTransactions,
    subscriptions: sampleSubscriptions,
    currency: 'INR',
    fmt: (v) => `₹${Number(v).toLocaleString('en-IN')}`,
    t: (k, fb) => {
      const map = {
        calendar_hub: 'Calendar Hub',
        net_position: 'Net Position',
        monthly_inflow: 'Monthly Inflow',
        monthly_outflow: 'Monthly Outflow',
        today: 'Today',
        month: 'Month',
        week: 'Week',
        new_entry: 'New Entry',
        weekly_summary: 'Weekly Summary',
        legend_net_pos: 'Net positive',
        legend_net_neg: 'Net negative',
        legend_no_activity: 'No activity',
        legend_recurring: 'Recurring bill',
        vs_last_month: 'vs last month',
        new_this_month: 'New this month',
        filter_all: 'All',
        filter_income: 'Income',
        filter_expense: 'Expense',
        filter_recurring: 'Recurring',
        grid_view: 'Grid',
        list_view: 'List',
      };
      return map[k] || fb || k;
    },
    lang: 'en',
    loading: false,
    addTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    updateTransaction: vi.fn(),
  };

  it('renders Net Position hero card with dominant figure, clean MoM indicator, and cashflow trend curve', () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={mockContext}>
            <Calendar />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Hero card presence
    const heroCard = container.querySelector('.cal-hero-card');
    expect(heroCard).toBeTruthy();

    // Check Net Position value
    expect(screen.getByText('Net Position')).toBeTruthy();

    // Check Sparkline Area presence for 3+ active days
    const sparkline = container.querySelector('.cal-sparkline-area');
    expect(sparkline).toBeTruthy();
    expect(container.querySelector('.cal-sparkline-svg')).toBeTruthy();
    expect(container.querySelector('path.cal-spark-path')).toBeTruthy();

    // Ensure no contradictory double percentage "+100% +0%" in MoM badge
    const momBadge = container.querySelector('.cal-mom-delta');
    if (momBadge) {
      expect(momBadge.textContent).not.toMatch(/\+100%\s*\+0%/);
    }

    // Supporting cards
    expect(screen.getByText('Monthly Inflow')).toBeTruthy();
    expect(screen.getByText('Monthly Outflow')).toBeTruthy();
  });

  it('renders grouped month navigation, Today ghost button, and view segmented control', () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={mockContext}>
            <Calendar />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Grouped nav
    const navGroup = container.querySelector('.cal-nav-group');
    expect(navGroup).toBeTruthy();
    expect(container.querySelector('.cal-today-btn')).toBeTruthy();

    // View toggles: Month & Week
    expect(screen.getByRole('button', { name: /Month view/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Week view/i })).toBeTruthy();
  });

  it('renders calendar cells with heatmap net-flow classes, dual-flow bars, in-cell net values, and recurring badges', () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={mockContext}>
            <Calendar />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Day 1 has positive net (Salary)
    const posDays = container.querySelectorAll('.cal-day.net-pos');
    expect(posDays.length).toBeGreaterThanOrEqual(1);

    // Day 5 has negative net & recurring badge (Rent + Netflix)
    const negDays = container.querySelectorAll('.cal-day.net-neg');
    expect(negDays.length).toBeGreaterThanOrEqual(1);

    // Dual-flow bars
    const dualBars = container.querySelectorAll('.cal-dual-bar');
    expect(dualBars.length).toBeGreaterThanOrEqual(2);

    // In-cell net figures
    const netVals = container.querySelectorAll('.cal-cell-net-val');
    expect(netVals.length).toBeGreaterThanOrEqual(2);

    // Recurring badges
    const recurringBadges = container.querySelectorAll('.cal-recurring-badge');
    expect(recurringBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders weekly summary strip and reconciles weekly net totals with monthly net position', () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={mockContext}>
            <Calendar />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Weekly summary strip
    const wss = container.querySelector('.cal-weekly-summary-strip');
    expect(wss).toBeTruthy();
    expect(screen.getByText(/Weekly Summary/i)).toBeTruthy();

    // Verify weekly buckets are present with explicit date ranges (e.g. W1, W2)
    const weekChips = container.querySelectorAll('.cal-wss-pill');
    expect(weekChips.length).toBeGreaterThanOrEqual(4);

    // Verify Month Net total reconciliation pill is present
    const totalPill = container.querySelector('.cal-wss-total-pill');
    expect(totalPill).toBeTruthy();

    // Verify Day 1 has no focus outline on initial page load
    const focusedDayOnLoad = container.querySelector('.cal-day.cal-focused');
    expect(focusedDayOnLoad).toBeNull();

    // Color legend bar
    const legend = container.querySelector('.cal-legend-bar');
    expect(legend).toBeTruthy();
    expect(screen.getByText('Net positive')).toBeTruthy();
    expect(screen.getByText('Net negative')).toBeTruthy();
    expect(screen.getByText('No activity')).toBeTruthy();
    expect(screen.getByText('Recurring bill')).toBeTruthy();
  });

  it('opens and closes the slide-out day details drawer on day click', async () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={mockContext}>
            <Calendar />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Initially drawer is closed
    expect(document.querySelector('.cal-day-drawer')).toBeNull();

    // Click on Day 1 (which has the Salary transaction)
    const day1Cell = container.querySelector('.cal-day.net-pos');
    expect(day1Cell).toBeTruthy();
    fireEvent.click(day1Cell);

    // Drawer should open (rendered in document.body via createPortal)
    const drawer = document.querySelector('.cal-day-drawer');
    expect(drawer).toBeTruthy();
    expect(within(drawer).getAllByText(/Salary/i).length).toBeGreaterThanOrEqual(1);
    expect(within(drawer).getByText(/Acme Corp/i)).toBeTruthy();

    // Close drawer via close button
    const closeBtn = drawer.querySelector('button.ibtn');
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);

    // Drawer should be dismissed
    await waitFor(() => {
      expect(document.querySelector('.cal-day-drawer')).toBeNull();
    });
  });

  it('renders filter strip and supports switching to mobile list view', () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={mockContext}>
            <Calendar />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Filter strip chips
    const filterStrip = container.querySelector('.cal-filter-strip');
    expect(filterStrip).toBeTruthy();
    expect(screen.getByRole('button', { name: /All/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Income/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Expense/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Recurring/i })).toBeTruthy();

    // Switch to List View
    const listToggleBtn = screen.getByRole('button', { name: /List/i });
    fireEvent.click(listToggleBtn);

    // Mobile list container should render
    const mobileList = container.querySelector('.cal-mobile-list');
    expect(mobileList).toBeTruthy();
    expect(container.querySelectorAll('.cal-mobile-day-card').length).toBeGreaterThanOrEqual(2);
  });

  it('handles keyboard navigation shortcuts for day focus, drawer open/close, and period navigation', async () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={mockContext}>
            <Calendar />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Navigate day focus with ArrowRight
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const focusedDay = container.querySelector('.cal-day.cal-focused');
    expect(focusedDay).toBeTruthy();

    // Open drawer via Enter key
    fireEvent.keyDown(window, { key: 'Enter' });
    const drawer = document.querySelector('.cal-day-drawer');
    expect(drawer).toBeTruthy();

    // Close drawer via Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(document.querySelector('.cal-day-drawer')).toBeNull();
    });

    // Navigate month with PageUp / Shift+ArrowLeft
    const titleEl = container.querySelector('.cal-month-title-grouped');
    const initialTitle = titleEl?.textContent;

    fireEvent.keyDown(window, { key: 'PageUp' });
    const prevTitle = container.querySelector('.cal-month-title-grouped')?.textContent;
    expect(prevTitle).not.toBe(initialTitle);

    // Navigate back with PageDown
    fireEvent.keyDown(window, { key: 'PageDown' });
    const nextTitle = container.querySelector('.cal-month-title-grouped')?.textContent;
    expect(nextTitle).toBe(initialTitle);
  });

  it('hides sparkline when active days are fewer than 3 data points (Issue 21)', () => {
    const twoDayTransactions = [
      {
        id: 'tx-16',
        _id: 'tx-16',
        amount: 23500,
        type: 'income',
        category: 'Freelance',
        date: '2026-09-16T10:00:00.000Z',
        is_deleted: false,
      },
      {
        id: 'tx-23',
        _id: 'tx-23',
        amount: 8234,
        type: 'income',
        category: 'Allowance',
        date: '2026-09-23T10:00:00.000Z',
        is_deleted: false,
      },
    ];

    const contextWithTwoDays = {
      ...mockContext,
      transactions: twoDayTransactions,
      subscriptions: [],
    };

    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={contextWithTwoDays}>
            <Calendar />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Sparkline SVG and area should be hidden entirely when active days < 3
    expect(container.querySelector('.cal-sparkline-svg')).toBeNull();
    expect(container.querySelector('.cal-sparkline-area')).toBeNull();
  });

  it('guarantees zero discrepancy between sum of weekly summary buckets and Net Position hero card', () => {
    // Exact user scenario: two current-month income entries, both on or before
    // the current date, so the test remains valid with future-date filtering.
    const scenarioTransactions = [
      {
        id: 'tx-w3',
        _id: 'tx-w3',
        amount: 23500,
        type: 'income',
        category: 'Freelance',
        merchant: 'Client A',
        date: '2026-09-16T10:00:00.000Z',
        is_deleted: false,
      },
      {
        id: 'tx-w4',
        _id: 'tx-w4',
        amount: 18234,
        type: 'income',
        category: 'Consulting',
        merchant: 'Client B',
        date: '2026-09-19T10:00:00.000Z',
        is_deleted: false,
      },
    ];

    const context = {
      ...mockContext,
      transactions: scenarioTransactions,
      subscriptions: [],
    };

    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={context}>
            <Calendar />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Hero card net position value
    const heroCard = container.querySelector('.cal-hero-card');
    expect(heroCard).toBeTruthy();
    const heroValText = heroCard.querySelector('.stat-val').textContent;
    // Format: +₹41,734
    expect(heroValText).toContain('41,734');

    // Total pill in weekly summary strip
    const totalPill = container.querySelector('.cal-wss-total-pill');
    expect(totalPill).toBeTruthy();
    const totalPillText = totalPill.textContent;
    expect(totalPillText).toContain('41,734');

    // Check the week containing both entries (W3: Sep 13-19)
    const weekPills = container.querySelectorAll('.cal-wss-pill:not(.cal-wss-total-pill)');
    expect(weekPills.length).toBe(5); // W1-W5
    expect(weekPills[2].textContent).toContain('41,734');
    expect(weekPills[3].textContent).not.toContain('18,234');
  });
});
