import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppStateContext, AppActionsContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import Subscriptions from '../pages/Subscriptions';

vi.mock('../services/api', () => ({
  api: {
    getSubscriptions: vi.fn().mockResolvedValue([]),
    createSubscription: vi.fn().mockResolvedValue({ id: 's1' }),
    updateSubscription: vi.fn().mockResolvedValue({ id: 's1' }),
    deleteSubscription: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('Subscriptions Page (Stage 1/2 Integrity)', () => {
  const mockSubscriptions = [
    {
      id: 'sub-1',
      _id: 'sub-1',
      name: 'Netflix Premium',
      amount: 19.99,
      cycle: 'monthly',
      color: '#ef4444',
      icon: 'Tv',
      next_billing_date: '2026-10-15',
      is_paused: false,
    },
    {
      id: 'sub-2',
      _id: 'sub-2',
      name: 'Gym Membership',
      amount: 60,
      cycle: 'monthly',
      color: '#3b82f6',
      icon: 'Sparkles',
      next_billing_date: '2026-10-01',
      is_paused: true,
    },
  ];

  const stateVal = {
    user: { id: 'u1', username: 'Test User', currency: 'USD' },
    currency: 'USD',
    subscriptions: mockSubscriptions,
    transactions: [],
    USER_ID: 'u1',
    lang: 'en',
    loading: false,
  };

  const actionsVal = {
    fmt: (val) => `$${Number(val || 0).toFixed(2)}`,
    refetch: vi.fn(),
    t: (k, fb) => fb || k,
  };

  it('renders Subscriptions page with split AppStateContext and AppActionsContext without crashing', () => {
    render(
      <MemoryRouter>
        <AppStateContext.Provider value={stateVal}>
          <AppActionsContext.Provider value={actionsVal}>
            <ToastProvider>
              <Subscriptions />
            </ToastProvider>
          </AppActionsContext.Provider>
        </AppStateContext.Provider>
      </MemoryRouter>
    );

    // Verify active subscription cards render
    const netflixElements = screen.getAllByText('Netflix Premium');
    expect(netflixElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Gym Membership')).toBeInTheDocument();

    // Verify summary metric tiles render formatted currency
    const amounts = screen.getAllByText('$19.99');
    expect(amounts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders gracefully even if actionsContext.fmt is missing via fallback formatter', () => {
    const actionsWithoutFmt = {
      refetch: vi.fn(),
      t: (k, fb) => fb || k,
    };

    render(
      <MemoryRouter>
        <AppStateContext.Provider value={stateVal}>
          <AppActionsContext.Provider value={actionsWithoutFmt}>
            <ToastProvider>
              <Subscriptions />
            </ToastProvider>
          </AppActionsContext.Provider>
        </AppStateContext.Provider>
      </MemoryRouter>
    );

    const netflixElements = screen.getAllByText('Netflix Premium');
    expect(netflixElements.length).toBeGreaterThanOrEqual(1);
  });
});
