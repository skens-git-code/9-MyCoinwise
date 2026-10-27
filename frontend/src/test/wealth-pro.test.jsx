import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Wealth from '../pages/Wealth';
import { AppStateContext, AppActionsContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getWealthItems: vi.fn(),
    getWealthHistory: vi.fn(),
    getWealthAiInsights: vi.fn(),
    createWealthItem: vi.fn(),
    updateWealthItem: vi.fn(),
    deleteWealthItem: vi.fn(),
  },
}));

describe('Wealth Portfolio Pro Tier-1 Features', () => {
  const mockUser = {
    _id: 'user-1',
    id: 'user-1',
    name: 'Wealth User',
    currency: 'INR',
  };

  const mockItems = [
    {
      _id: 'w1',
      id: 'w1',
      name: 'Nifty Index Fund',
      asset_class: 'liquid_asset',
      base_value: 500000,
      current_value: 720000,
      currency: 'INR',
      acquisition_date: '2023-01-15', // > 1 year -> LTCG
      is_deleted: false,
    },
    {
      _id: 'w2',
      id: 'w2',
      name: 'Commercial Real Estate',
      asset_class: 'illiquid_asset',
      base_value: 4000000,
      current_value: 4600000,
      currency: 'INR',
      acquisition_date: '2026-09-01', // < 1 year -> STCG
      is_deleted: false,
    },
    {
      _id: 'w3',
      id: 'w3',
      name: 'Car Loan',
      asset_class: 'liability',
      base_value: 300000,
      current_value: 300000,
      interest_rate: 9.5,
      currency: 'INR',
      acquisition_date: '2025-06-01',
      is_deleted: false,
    },
  ];

  const mockHistory = [
    { month: '2026-08', netWorth: 4500000 },
    { month: '2026-09', netWorth: 5020000 },
  ];

  const appState = {
    token: 'valid-jwt-token',
    theme: 'dark',
    user: mockUser,
    currency: 'INR',
    currencyInfo: { symbol: '₹', name: 'Indian Rupee' },
  };

  const appActions = {
    fmt: (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`,
    t: () => null,
    logout: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getWealthItems.mockResolvedValue(mockItems);
    api.getWealthHistory.mockResolvedValue(mockHistory);
    api.getWealthAiInsights.mockResolvedValue({ insight: 'Balanced portfolio strategy.' });
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderWealth = () =>
    render(
      <MemoryRouter>
        <AppStateContext.Provider value={appState}>
          <AppActionsContext.Provider value={appActions}>
            <ToastProvider>
              <Wealth />
            </ToastProvider>
          </AppActionsContext.Provider>
        </AppStateContext.Provider>
      </MemoryRouter>
    );

  it('1. Renders Cost Basis, Unrealized Gains (P&L), and LTCG/STCG badges accurately', async () => {
    renderWealth();

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('Nifty Index Fund')).toBeInTheDocument();
    });

    // Hero card Unrealized P&L:
    // Total Assets = 720,000 + 4,600,000 = 5,320,000
    // Total Cost Basis = 500,000 + 4,000,000 = 4,500,000
    // Total Gain = +820,000 (+18.2%)
    expect(screen.getByText('Unrealized P&L')).toBeInTheDocument();
    expect(screen.getByText('+₹8,20,000 (+18.2%)')).toBeInTheDocument();

    // Holding badges
    expect(screen.getByText('LTCG (>1y)')).toBeInTheDocument();
    expect(screen.getByText('STCG (<1y)')).toBeInTheDocument();

    // Per-item P&L
    // Nifty Index: gain +220,000 (+44.0%)
    expect(screen.getByText('+₹2,20,000 (+44.0%)')).toBeInTheDocument();
    // Real Estate: gain +600,000 (+15.0%)
    expect(screen.getByText('+₹6,00,000 (+15.0%)')).toBeInTheDocument();
  });

  it('2. Scenario Simulator ("What If"): expands, computes market shocks, SIP compounding, and debt-free projections', async () => {
    renderWealth();

    await waitFor(() => {
      expect(screen.getByText(/Portfolio Scenario Simulator/i)).toBeInTheDocument();
    });

    // Expand simulator controls
    const expandBtn = screen.getByText('Simulate Scenarios');
    fireEvent.click(expandBtn);

    expect(screen.getByText('Market Shock / Rally')).toBeInTheDocument();
    expect(screen.getByText('100% Debt-Free Simulation')).toBeInTheDocument();

    // Simulate 100% Debt-Free
    const debtFreeCheckbox = screen.getByLabelText(/100% Debt-Free Simulation/i);
    fireEvent.click(debtFreeCheckbox);

    // Current Net worth = 5,320,000 - 300,000 = 5,020,000
    // Debt free simulated net worth = 5,320,000 (delta: +300,000, +6.0%)
    await waitFor(() => {
      expect(screen.getByText('+₹3,00,000 (+6.0%)')).toBeInTheDocument();
    });

    // Reset button should restore baseline
    const resetBtn = screen.getByText('Reset');
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.getByText('+₹0 (+0.0%)')).toBeInTheDocument();
    });
  });

  it('3. Target Allocation & Drift: toggles to Drift view, calculates rebalancing trades, and saves custom targets', async () => {
    renderWealth();

    await waitFor(() => {
      expect(screen.getByText('Asset Allocation')).toBeInTheDocument();
    });

    // Switch to Drift view
    const driftToggleBtn = screen.getByRole('button', { name: /drift/i });
    fireEvent.click(driftToggleBtn);

    // Expect Drift table headers
    await waitFor(() => {
      expect(screen.getByText('Target Allocation & Drift')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
    });

    // Check rebalance suggestions exist (Trim / Allocate)
    const actionBadges = screen.getAllByText(/(Trim|Allocate|Balanced)/i);
    expect(actionBadges.length).toBeGreaterThanOrEqual(1);

    // Configure targets
    const targetsBtn = screen.getByRole('button', { name: /targets/i });
    fireEvent.click(targetsBtn);

    // Change target allocation for liquid assets
    const liquidTargetInput = screen.getByLabelText('Liquid');
    fireEvent.change(liquidTargetInput, { target: { value: '50' } });

    // Verify localStorage persistence
    const saved = JSON.parse(localStorage.getItem('mycoinwise_target_allocation'));
    expect(saved.liquid_asset).toBe(50);
  });
});
