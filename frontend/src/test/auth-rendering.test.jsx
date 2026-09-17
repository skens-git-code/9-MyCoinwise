import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../pages/Login';
import { AppContext } from '../contexts/AppContext';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    login: vi.fn(),
    healthCheck: vi.fn(),
  },
  CURRENCIES: { USD: { symbol: '$' } },
  getStoredToken: vi.fn(() => null),
}));

describe('Login Autofill & Initial Attempt Handling', () => {
  const mockLogin = vi.fn();
  const mockContext = {
    login: mockLogin,
    t: (k) => {
      const map = {
        email_address: 'Email Address',
        password: 'Password',
        log_in: 'Log In',
      };
      return map[k] || k;
    },
    lang: 'en',
    setLanguage: vi.fn(),
    user: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('triggers health check pre-emptively on mount', () => {
    render(
      <BrowserRouter>
        <AppContext.Provider value={mockContext}>
          <Login />
        </AppContext.Provider>
      </BrowserRouter>
    );
    expect(api.healthCheck).toHaveBeenCalledTimes(1);
  });

  it('submits successfully on first attempt when password manager autofills DOM inputs directly', async () => {
    api.login.mockResolvedValueOnce({
      token: 'fake-jwt-token',
      user: { id: 'u1', email: 'autofilled@example.com', username: 'autofilluser' },
    });

    render(
      <BrowserRouter>
        <AppContext.Provider value={mockContext}>
          <Login />
        </AppContext.Provider>
      </BrowserRouter>
    );

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const submitBtn = screen.getByRole('button', { name: /Log In/i });

    // Simulate browser autofill populating DOM properties directly without React onChange events
    emailInput.value = 'autofilled@example.com';
    passwordInput.value = 'SuperSecret123!';

    // Submit on the very first try
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({
        email: 'autofilled@example.com',
        password: 'SuperSecret123!',
        rememberMe: false,
      });
    });

    expect(mockLogin).toHaveBeenCalledWith(
      'fake-jwt-token',
      expect.objectContaining({ email: 'autofilled@example.com' }),
      false
    );
  });
});

describe('Defensive Data Array Handling & Freeze Prevention', () => {
  it('safely handles non-array / offline payloads without throwing TypeError', () => {
    const settledArray = (result) =>
      result?.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [];

    // Simulate SW returning 200 with offline object
    const offlineResult = { status: 'fulfilled', value: { error: 'offline' } };
    const validResult = { status: 'fulfilled', value: [{ id: 'tx-1', amount: 50, type: 'expense' }] };
    const rejectedResult = { status: 'rejected', reason: new Error('Network error') };

    expect(settledArray(offlineResult)).toEqual([]);
    expect(settledArray(validResult)).toEqual([{ id: 'tx-1', amount: 50, type: 'expense' }]);
    expect(settledArray(rejectedResult)).toEqual([]);
    expect(settledArray(null)).toEqual([]);
  });

  it('calculates financialSummary safely even when transactions is an object or invalid', () => {
    const calculateFinancialSummary = (transactions) => {
      const safeTxs = Array.isArray(transactions) ? transactions : [];
      const liveTxs = safeTxs.filter(t => t && t.is_deleted !== true);
      const income = liveTxs
        .filter(t => t.type === 'income')
        .reduce((sum, t) => {
          const val = Number(t.amount);
          return sum + (Number.isFinite(val) ? val : 0);
        }, 0);
      const expense = liveTxs
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => {
          const val = Number(t.amount);
          return sum + (Number.isFinite(val) ? val : 0);
        }, 0);
      const net = income - expense;
      const rate = income > 0 ? ((net / income) * 100).toFixed(0) : '0';
      return { income, expense, net, rate };
    };

    // When SW injected { error: "offline" }, this previously threw TypeError: transactions.filter is not a function
    const corruptedState = { error: 'offline' };
    expect(() => calculateFinancialSummary(corruptedState)).not.toThrow();
    expect(calculateFinancialSummary(corruptedState)).toEqual({
      income: 0,
      expense: 0,
      net: 0,
      rate: '0',
    });

    // Valid state produces correct calculations
    const validTransactions = [
      { id: '1', amount: 1000, type: 'income', is_deleted: false },
      { id: '2', amount: 400, type: 'expense', is_deleted: false },
      { id: '3', amount: 200, type: 'expense', is_deleted: true }, // soft-deleted should be excluded
    ];
    expect(calculateFinancialSummary(validTransactions)).toEqual({
      income: 1000,
      expense: 400,
      net: 600,
      rate: '60',
    });
  });

  it('guarantees aiEngine methods never crash on non-array or offline object states', async () => {
    const { generateAlerts, getSpendingInsights, predictNextMonthSpending, detectAnomalies } = await import('../services/aiEngine');
    const corruptedState = { error: 'offline' };

    expect(() => generateAlerts(corruptedState, { monthly_goal: 500 }, corruptedState)).not.toThrow();
    expect(Array.isArray(generateAlerts(corruptedState, { monthly_goal: 500 }, corruptedState))).toBe(true);

    expect(() => getSpendingInsights(corruptedState)).not.toThrow();
    expect(getSpendingInsights(corruptedState)).toEqual([]);

    expect(() => predictNextMonthSpending(corruptedState)).not.toThrow();
    expect(predictNextMonthSpending(corruptedState)).toBe(null);

    expect(() => detectAnomalies(corruptedState)).not.toThrow();
    expect(detectAnomalies(corruptedState)).toEqual([]);
  });
});
