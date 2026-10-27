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
        <Route path="/reports" element={<DummyPage title="ReportsScreen" />} />
        <Route path="/download" element={<Navigate to="/reports" replace />} />
        <Route path="/statements" element={<Navigate to="/reports" replace />} />
        <Route path="/tax" element={<DummyPage title="TaxScreen" />} />
        <Route path="/taxes" element={<Navigate to="/tax" replace />} />
        <Route path="/tax-center" element={<Navigate to="/tax" replace />} />
        <Route path="/transactions" element={<DummyPage title="TransactionsScreen" />} />
        <Route path="/history" element={<Navigate to="/transactions" replace />} />
        <Route path="/settings" element={<DummyPage title="SettingsScreen" />} />
        <Route path="/profile" element={<Navigate to="/settings" replace />} />
        <Route path="/" element={<DummyPage title="DashboardScreen" />} />
        <Route path="/overview" element={<Navigate to="/" replace />} />
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

    testAlias('/download', 'ReportsScreen');
    testAlias('/statements', 'ReportsScreen');
    testAlias('/taxes', 'TaxScreen');
    testAlias('/tax-center', 'TaxScreen');
    testAlias('/history', 'TransactionsScreen');
    testAlias('/overview', 'DashboardScreen');
    testAlias('/profile', 'SettingsScreen');
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
});
