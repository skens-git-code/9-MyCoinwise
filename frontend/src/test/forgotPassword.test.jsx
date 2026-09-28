import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import { ToastProvider } from '../components/ToastProvider';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
  },
  CURRENCIES: { USD: { symbol: '$' } },
  getStoredToken: vi.fn(() => null),
}));

describe('ForgotPassword Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email input and submit button', () => {
    render(
      <BrowserRouter>
        <ForgotPassword />
      </BrowserRouter>
    );
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('shows error for empty submission', async () => {
    render(
      <BrowserRouter>
        <ForgotPassword />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/please enter your email address/i)).toBeInTheDocument();
  });

  it('calls api.forgotPassword and shows confirmation message', async () => {
    api.forgotPassword.mockResolvedValueOnce({ message: 'If an account exists, a link was sent' });
    render(
      <BrowserRouter>
        <ForgotPassword />
      </BrowserRouter>
    );

    const input = screen.getByLabelText(/email address/i);
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(api.forgotPassword).toHaveBeenCalledWith('test@example.com');
    });

    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });

  it('handles server network failure gracefully', async () => {
    api.forgotPassword.mockRejectedValueOnce(new Error('Network error'));
    render(
      <BrowserRouter>
        <ForgotPassword />
      </BrowserRouter>
    );

    const input = screen.getByLabelText(/email address/i);
    fireEvent.change(input, { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
  });
});

describe('ResetPassword Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warns when token is missing', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ToastProvider>
          <ResetPassword />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(/this reset link is invalid or incomplete/i)).toBeInTheDocument();
  });

  it('renders password input fields when token is provided', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=abcdef1234567890abcdef1234567890']}>
        <ToastProvider>
          <ResetPassword />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });
});
