import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../pages/SettingsPage';
import { AppStateContext, AppActionsContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import { api } from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      updateSettings: vi.fn(),
      getSessions: vi.fn().mockResolvedValue({ sessions: [] }),
    },
  };
});

function renderSettings(userOverrides = {}) {
  const stateValue = {
    user: {
      _id: '507f1f77bcf86cd799439011',
      id: '507f1f77bcf86cd799439011',
      username: 'Alex Trader',
      email: 'alex@example.com',
      currency: 'INR',
      theme: 'light',
      monthly_goal: 50000,
      bank_accounts: [],
      payment_methods: { cards: [], upi: [] },
      auto_pays: [],
      integrations: {
        googleDrive: false,
        appleICloud: false,
        telegramAlerts: false,
        whatsappAlerts: false,
      },
      ...userOverrides,
    },
    allUsers: [],
    USER_ID: '507f1f77bcf86cd799439011',
    theme: 'light',
    currencyInfo: { code: 'INR', symbol: '₹' },
    lang: 'en',
    transactions: [],
  };

  const actionsValue = {
    setThemeDirect: vi.fn(),
    refetch: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn(),
    resetAccount: vi.fn(),
    createUser: vi.fn(),
    switchUser: vi.fn(),
    revertSession: vi.fn(),
    setLanguage: vi.fn(),
    t: () => undefined,
    logout: vi.fn(),
  };

  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <AppStateContext.Provider value={stateValue}>
        <AppActionsContext.Provider value={actionsValue}>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    </MemoryRouter>
  );
}

describe('SettingsPage Banking, Auto-Pay & Integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.updateSettings.mockResolvedValue({
      message: 'Settings updated successfully',
      user: { _id: '507f1f77bcf86cd799439011', username: 'Alex Trader' },
    });
  });

  it('adds an Indian bank account with searchable dropdown, masks account number, and saves via PATCH settings', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('tab', { name: /Banking & Payments/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Add Bank Account/i }));

    const bankInput = screen.getByLabelText(/Bank Name/i);
    fireEvent.focus(bankInput);
    fireEvent.change(bankInput, { target: { value: 'HDFC' } });

    const option = await screen.findByRole('option', { name: /HDFC Bank/i });
    fireEvent.click(option);

    fireEvent.change(screen.getByLabelText(/Account Holder Name/i), { target: { value: 'Alex Trader' } });
    fireEvent.change(screen.getByLabelText(/Account Number/i), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText(/IFSC Code/i), { target: { value: 'HDFC0001234' } });

    fireEvent.click(screen.getByRole('button', { name: /^Add Account$/i }));

    expect(await screen.findByText(/•••• 9012/)).toBeInTheDocument();
    expect(screen.getByText(/IFSC: HDFC0001234/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Banking & Payments/i }));

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledTimes(1);
    });
    const payload = api.updateSettings.mock.calls[0][1];
    expect(payload.bank_accounts).toHaveLength(1);
    expect(payload.bank_accounts[0]).toMatchObject({
      bankName: 'HDFC Bank',
      accountNumber: '•••• 9012',
      ifsc: 'HDFC0001234',
      accountHolder: 'Alex Trader',
    });
  });

  it('validates card with Luhn check and never persists CVV or full card number', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('tab', { name: /Banking & Payments/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Add Card/i }));

    fireEvent.change(screen.getByLabelText(/Cardholder Name/i), { target: { value: 'Alex Trader' } });
    fireEvent.change(screen.getByLabelText(/Card Number/i), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByLabelText(/Expiry/i), { target: { value: '1230' } });
    fireEvent.change(screen.getByLabelText(/CVV/i), { target: { value: '789' } });

    fireEvent.click(screen.getByRole('button', { name: /^Save Card$/i }));

    expect(await screen.findByText(/Visa ending in 1111/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Banking & Payments/i }));
    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledTimes(1);
    });
    const payload = api.updateSettings.mock.calls[0][1];
    expect(payload.payment_methods.cards).toHaveLength(1);
    expect(payload.payment_methods.cards[0].cardNumber).toBe('•••• •••• •••• 1111');
    expect(payload.payment_methods.cards[0].cvv).toBeUndefined();
  });

  it('supports adding/toggling Auto-Pay mandates and toggling Integrations', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('tab', { name: /Auto-Pay/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Add Auto-Pay Mandate/i }));
    fireEvent.change(screen.getByLabelText(/Mandate \/ Merchant Name/i), { target: { value: 'JioFiber' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add Mandate$/i }));

    expect(await screen.findByText('JioFiber')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Integrations/i }));
    const connectButtons = await screen.findAllByRole('button', { name: /^Connect$/i });
    fireEvent.click(connectButtons[0]);

    fireEvent.click(screen.getByRole('button', { name: /Save Integrations/i }));
    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledTimes(1);
    });
    const payload = api.updateSettings.mock.calls[0][1];
    expect(payload.auto_pays).toHaveLength(1);
    expect(payload.auto_pays[0].name).toBe('JioFiber');
    expect(payload.integrations.googleDrive).toBe(true);
  });
});

