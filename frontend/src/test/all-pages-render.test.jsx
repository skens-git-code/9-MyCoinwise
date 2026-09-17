import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';

// Import all 15 page components
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import Transactions from '../pages/Transactions';
import Analytics from '../pages/Analytics';
import Accounts from '../pages/Accounts';
import Budgets from '../pages/Budgets';
import Goals from '../pages/Goals';
import Subscriptions from '../pages/Subscriptions';
import Cashflow from '../pages/Cashflow';
import Wealth from '../pages/Wealth';
import Calendar from '../pages/Calendar';
import SettingsPage from '../pages/SettingsPage';
import About from '../pages/About';
import Calculator from '../pages/Calculator';

vi.mock('../services/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    getMe: vi.fn().mockResolvedValue({ _id: 'u1', username: 'Test User', email: 'test@example.com' }),
    healthCheck: vi.fn().mockResolvedValue({ status: 'OK' }),
    getTransactions: vi.fn().mockResolvedValue([]),
    getGoals: vi.fn().mockResolvedValue([]),
    getSubscriptions: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
    getBudgets: vi.fn().mockResolvedValue([]),
    getAccounts: vi.fn().mockResolvedValue([]),
    getAllUsers: vi.fn().mockResolvedValue([]),
    getWealthItems: vi.fn().mockResolvedValue([]),
    getWealthHistory: vi.fn().mockResolvedValue([]),
  },
  CURRENCIES: {
    USD: { symbol: '$', name: 'US Dollar' },
    INR: { symbol: '₹', name: 'Indian Rupee' },
  },
  AVATARS: ['user1', 'user2', 'user3', 'user4', 'user5'],
  AVATAR_COLORS: ['#059669', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#f97316', '#64748b'],
  getStoredToken: vi.fn(() => 'mock-token'),
}));

describe('Complete Suite: All 15 Pages Rendering Integrity', () => {
  const mockUser = {
    id: 'u1',
    _id: 'u1',
    username: 'Test User',
    email: 'test@example.com',
    currency: 'USD',
    monthly_goal: 1000,
    balance: 5000,
  };

  const sampleTransactions = [
    { id: 't1', _id: 't1', amount: 100, type: 'expense', category: 'Food', date: '2026-09-01', is_deleted: false },
    { id: 't2', _id: 't2', amount: 2000, type: 'income', category: 'Salary', date: '2026-09-02', is_deleted: false },
  ];

  const fullContext = {
    user: mockUser,
    allUsers: [mockUser],
    transactions: sampleTransactions,
    goals: [{ id: 'g1', _id: 'g1', name: 'Emergency Fund', target: 5000, saved: 1000 }],
    budgets: [{ id: 'b1', _id: 'b1', name: 'Food Budget', total_limit: 500, category: 'Food', type: 'monthly' }],
    accounts: [{ id: 'a1', _id: 'a1', name: 'Checking', type: 'Checking', balance: 5000, is_active: true }],
    subscriptions: [{ id: 's1', _id: 's1', name: 'Netflix', amount: 15, billing_cycle: 'monthly', is_active: true }],
    events: [],
    theme: 'light',
    toggleTheme: vi.fn(),
    setThemeDirect: vi.fn(),
    currency: 'USD',
    fmt: (v) => `$${Number(v || 0).toFixed(2)}`,
    currencyInfo: { symbol: '$', name: 'US Dollar' },
    lang: 'en',
    setLanguage: vi.fn(),
    t: (k, fb) => fb || k,
    token: 'mock-token',
    login: vi.fn(),
    logout: vi.fn(),
    refetch: vi.fn(),
    USER_ID: 'u1',
    loading: false,
    isInitialAuthLoad: false,
    isBackgroundSyncing: false,
    alerts: [],
    insights: [],
  };

  const renderWithContext = (Component, ctx = fullContext, route = '/') =>
    render(
      <MemoryRouter initialEntries={[route]}>
        <AppContext.Provider value={ctx}>
          <ToastProvider>
            <Component />
          </ToastProvider>
        </AppContext.Provider>
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders Login page without errors', () => {
    expect(() => renderWithContext(Login, { ...fullContext, user: null })).not.toThrow();
  });

  it('2. Renders Register page without errors', () => {
    expect(() => renderWithContext(Register, { ...fullContext, user: null })).not.toThrow();
  });

  it('3. Renders Dashboard page without errors', () => {
    expect(() => renderWithContext(Dashboard)).not.toThrow();
  });

  it('4. Renders Transactions page without errors', () => {
    expect(() => renderWithContext(Transactions)).not.toThrow();
  });

  it('5. Renders Analytics page without errors', () => {
    expect(() => renderWithContext(Analytics)).not.toThrow();
  });

  it('6. Renders Accounts page without errors', () => {
    expect(() => renderWithContext(Accounts)).not.toThrow();
  });

  it('7. Renders Budgets page without errors', () => {
    expect(() => renderWithContext(Budgets)).not.toThrow();
  });

  it('8. Renders Goals page without errors', () => {
    expect(() => renderWithContext(Goals)).not.toThrow();
  });

  it('9. Renders Subscriptions page without errors', () => {
    expect(() => renderWithContext(Subscriptions)).not.toThrow();
  });

  it('10. Renders Cashflow page without errors', () => {
    expect(() => renderWithContext(Cashflow)).not.toThrow();
  });

  it('11. Renders Wealth page without errors', () => {
    expect(() => renderWithContext(Wealth)).not.toThrow();
  });

  it('12. Renders Calendar page without errors', () => {
    expect(() => renderWithContext(Calendar)).not.toThrow();
  });

  it('13. Renders Settings page without errors', () => {
    expect(() => renderWithContext(SettingsPage)).not.toThrow();
  });

  it('14. Renders About page without errors', () => {
    expect(() => renderWithContext(About)).not.toThrow();
  });

  it('15. Renders Calculator page without errors', () => {
    expect(() => renderWithContext(Calculator)).not.toThrow();
  });

  it('Renders all data-driven pages safely with completely empty data', () => {
    const emptyContext = {
      ...fullContext,
      transactions: [],
      goals: [],
      budgets: [],
      accounts: [],
      subscriptions: [],
      events: [],
      allUsers: [],
    };

    expect(() => renderWithContext(Dashboard, emptyContext)).not.toThrow();
    expect(() => renderWithContext(Transactions, emptyContext)).not.toThrow();
    expect(() => renderWithContext(Analytics, emptyContext)).not.toThrow();
    expect(() => renderWithContext(Accounts, emptyContext)).not.toThrow();
    expect(() => renderWithContext(Budgets, emptyContext)).not.toThrow();
    expect(() => renderWithContext(Goals, emptyContext)).not.toThrow();
    expect(() => renderWithContext(Subscriptions, emptyContext)).not.toThrow();
    expect(() => renderWithContext(Cashflow, emptyContext)).not.toThrow();
    expect(() => renderWithContext(Calendar, emptyContext)).not.toThrow();
  });
});
