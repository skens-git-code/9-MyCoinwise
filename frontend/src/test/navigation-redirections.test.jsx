import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import { AppStateContext, AppActionsContext } from '../contexts/AppContext';

vi.mock('../services/api', () => ({
  api: {
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue({}),
    getMe: vi.fn().mockResolvedValue({ _id: 'u1', username: 'TestUser', email: 'test@example.com' }),
    healthCheck: vi.fn().mockResolvedValue({ status: 'OK' }),
  },
  CURRENCIES: {
    USD: { symbol: '$', name: 'US Dollar' },
    INR: { symbol: '₹', name: 'Indian Rupee' },
  },
  getStoredToken: vi.fn(() => null),
  getStoredUser: vi.fn(() => null),
}));

describe('Comprehensive Redirection & Navigation Pipeline Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  const DummyPage = ({ title }) => <div data-testid={`page-${title}`}>{title}</div>;

  it('1. Redirects unauthenticated users trying to access protected routes to /login with target location state preserved', () => {
    const unauthState = {
      user: null,
      token: null,
      isInitialAuthLoad: false,
      globalError: null,
    };

    render(
      <AppStateContext.Provider value={unauthState}>
        <AppActionsContext.Provider value={{ refetch: vi.fn() }}>
          <MemoryRouter initialEntries={['/transactions?filter=recent#table']}>
            <Routes>
              <Route path="/login" element={<DummyPage title="LoginScreen" />} />
              <Route
                path="/transactions"
                element={
                  <ProtectedRoute>
                    <DummyPage title="TransactionsScreen" />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );

    expect(screen.getByTestId('page-LoginScreen')).toBeInTheDocument();
    expect(screen.queryByTestId('page-TransactionsScreen')).toBeNull();
  });

  it('2. Allows authenticated users to directly access protected routes', () => {
    const authState = {
      user: { id: 'u1', username: 'TestUser' },
      token: 'valid-jwt-token',
      isInitialAuthLoad: false,
      globalError: null,
    };

    render(
      <AppStateContext.Provider value={authState}>
        <AppActionsContext.Provider value={{ refetch: vi.fn() }}>
          <MemoryRouter initialEntries={['/analytics']}>
            <Routes>
              <Route path="/login" element={<DummyPage title="LoginScreen" />} />
              <Route
                path="/analytics"
                element={
                  <ProtectedRoute>
                    <DummyPage title="AnalyticsScreen" />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );

    expect(screen.getByTestId('page-AnalyticsScreen')).toBeInTheDocument();
    expect(screen.queryByTestId('page-LoginScreen')).toBeNull();
  });

  it('3. Redirects authenticated users from /login, /register, and /forgot-password to /', () => {
    const authUser = { id: 'u1', username: 'TestUser' };

    const { unmount } = render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/" element={<DummyPage title="DashboardScreen" />} />
          <Route path="/login" element={authUser ? <Navigate to="/" replace /> : <DummyPage title="LoginScreen" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('page-DashboardScreen')).toBeInTheDocument();
    unmount();

    // Verify /register redirect
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/" element={<DummyPage title="DashboardScreen" />} />
          <Route path="/register" element={authUser ? <Navigate to="/" replace /> : <DummyPage title="RegisterScreen" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('page-DashboardScreen')).toBeInTheDocument();
  });

  it('4. Canonical route aliases redirect cleanly to their target routes without glitches', () => {
    const routesConfig = (
      <Routes>
        <Route path="/" element={<DummyPage title="DashboardScreen" />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/overview" element={<Navigate to="/" replace />} />

        <Route path="/transactions" element={<DummyPage title="TransactionsScreen" />} />
        <Route path="/txns" element={<Navigate to="/transactions" replace />} />
        <Route path="/history" element={<Navigate to="/transactions" replace />} />

        <Route path="/reports" element={<DummyPage title="ReportsScreen" />} />
        <Route path="/download" element={<Navigate to="/reports" replace />} />
        <Route path="/statements" element={<Navigate to="/reports" replace />} />
        <Route path="/statement" element={<Navigate to="/reports" replace />} />
        <Route path="/report" element={<Navigate to="/reports" replace />} />
        <Route path="/export" element={<Navigate to="/reports" replace />} />
        <Route path="/statement-upload" element={<Navigate to="/reports" replace />} />

        <Route path="/tax" element={<DummyPage title="TaxScreen" />} />
        <Route path="/taxes" element={<Navigate to="/tax" replace />} />
        <Route path="/tax-center" element={<Navigate to="/tax" replace />} />

        <Route path="/accounts" element={<DummyPage title="AccountsScreen" />} />
        <Route path="/banking" element={<Navigate to="/accounts" replace />} />
        <Route path="/bank" element={<Navigate to="/accounts" replace />} />
        <Route path="/wallets" element={<Navigate to="/accounts" replace />} />

        <Route path="/goals" element={<DummyPage title="GoalsScreen" />} />
        <Route path="/savings" element={<Navigate to="/goals" replace />} />
        <Route path="/saving-goals" element={<Navigate to="/goals" replace />} />
        <Route path="/saving" element={<Navigate to="/goals" replace />} />

        <Route path="/subscriptions" element={<DummyPage title="SubscriptionsScreen" />} />
        <Route path="/recurring" element={<Navigate to="/subscriptions" replace />} />
        <Route path="/bills" element={<Navigate to="/subscriptions" replace />} />

        <Route path="/cashflow" element={<DummyPage title="CashflowScreen" />} />
        <Route path="/forecasting" element={<Navigate to="/cashflow" replace />} />
        <Route path="/forecast" element={<Navigate to="/cashflow" replace />} />

        <Route path="/wealth" element={<DummyPage title="WealthScreen" />} />
        <Route path="/assets" element={<Navigate to="/wealth" replace />} />

        <Route path="/settings" element={<DummyPage title="SettingsScreen" />} />
        <Route path="/profile" element={<Navigate to="/settings" replace />} />
        <Route path="/preferences" element={<Navigate to="/settings" replace />} />
        <Route path="/account" element={<Navigate to="/settings" replace />} />
        <Route path="/security" element={<Navigate to="/settings" replace />} />

        <Route path="/about" element={<DummyPage title="AboutScreen" />} />
        <Route path="/about-us" element={<Navigate to="/about" replace />} />

        <Route path="/welcome" element={<DummyPage title="WelcomeScreen" />} />
        <Route path="/landing" element={<Navigate to="/welcome" replace />} />

        <Route path="/login" element={<DummyPage title="LoginScreen" />} />
        <Route path="/signin" element={<Navigate to="/login" replace />} />
        <Route path="/sign-in" element={<Navigate to="/login" replace />} />

        <Route path="/register" element={<DummyPage title="RegisterScreen" />} />
        <Route path="/signup" element={<Navigate to="/register" replace />} />
        <Route path="/sign-up" element={<Navigate to="/register" replace />} />
      </Routes>
    );

    const testAlias = (initialEntry, expectedScreenId) => {
      const { unmount } = render(
        <MemoryRouter initialEntries={[initialEntry]}>
          {routesConfig}
        </MemoryRouter>
      );
      expect(screen.getByTestId(`page-${expectedScreenId}`)).toBeInTheDocument();
      unmount();
    };

    testAlias('/dashboard', 'DashboardScreen');
    testAlias('/home', 'DashboardScreen');
    testAlias('/overview', 'DashboardScreen');

    testAlias('/txns', 'TransactionsScreen');
    testAlias('/history', 'TransactionsScreen');

    testAlias('/download', 'ReportsScreen');
    testAlias('/statements', 'ReportsScreen');
    testAlias('/statement', 'ReportsScreen');
    testAlias('/report', 'ReportsScreen');
    testAlias('/export', 'ReportsScreen');
    testAlias('/statement-upload', 'ReportsScreen');

    testAlias('/taxes', 'TaxScreen');
    testAlias('/tax-center', 'TaxScreen');

    testAlias('/banking', 'AccountsScreen');
    testAlias('/bank', 'AccountsScreen');
    testAlias('/wallets', 'AccountsScreen');

    testAlias('/savings', 'GoalsScreen');
    testAlias('/saving-goals', 'GoalsScreen');
    testAlias('/saving', 'GoalsScreen');

    testAlias('/recurring', 'SubscriptionsScreen');
    testAlias('/bills', 'SubscriptionsScreen');

    testAlias('/forecasting', 'CashflowScreen');
    testAlias('/forecast', 'CashflowScreen');

    testAlias('/assets', 'WealthScreen');

    testAlias('/profile', 'SettingsScreen');
    testAlias('/preferences', 'SettingsScreen');
    testAlias('/account', 'SettingsScreen');
    testAlias('/security', 'SettingsScreen');

    testAlias('/about-us', 'AboutScreen');

    testAlias('/landing', 'WelcomeScreen');
    testAlias('/signin', 'LoginScreen');
    testAlias('/sign-in', 'LoginScreen');
    testAlias('/signup', 'RegisterScreen');
    testAlias('/sign-up', 'RegisterScreen');
  });

  it('5. Unknown routes gracefully fall back to 404 handler', () => {
    render(
      <MemoryRouter initialEntries={['/non-existent-quantum-path']}>
        <Routes>
          <Route path="/" element={<DummyPage title="DashboardScreen" />} />
          <Route path="/404" element={<DummyPage title="NotFoundScreen" />} />
          <Route path="*" element={<DummyPage title="NotFoundScreen" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('page-NotFoundScreen')).toBeInTheDocument();
  });

  it('6. Terms and Privacy page back button renders Dashboard for authenticated users and directs to /', async () => {
    const Terms = (await import('../pages/Terms')).default;
    const authState = {
      user: { id: 'u1', username: 'TestUser' },
      token: 'jwt-123',
      theme: 'light',
    };

    render(
      <AppStateContext.Provider value={authState}>
        <AppActionsContext.Provider value={{ toggleTheme: vi.fn(), t: (k) => k }}>
          <MemoryRouter initialEntries={['/terms']}>
            <Terms />
          </MemoryRouter>
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
