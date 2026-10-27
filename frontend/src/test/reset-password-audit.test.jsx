import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPassword, {
  isValidTokenShape,
  scorePassword,
  isCommonPassword,
} from '../pages/ResetPassword';
import { api } from '../services/api';
import { ToastProvider } from '../components/ToastProvider';

vi.mock('../services/api', () => ({
  api: {
    resetPassword: vi.fn(),
  },
}));

const valid64Token = 'a'.repeat(64);

describe('ResetPassword Audit Requirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Token Format Validation (isValidTokenShape)', () => {
    it('rejects tokens that are missing, too short, too long, or non-hex', () => {
      expect(isValidTokenShape('')).toBe(false);
      expect(isValidTokenShape(null)).toBe(false);
      expect(isValidTokenShape(undefined)).toBe(false);
      expect(isValidTokenShape('short')).toBe(false);
      // 32 chars (previous buggy lower bound)
      expect(isValidTokenShape('a'.repeat(32))).toBe(false);
      // 63 chars (off by 1)
      expect(isValidTokenShape('a'.repeat(63))).toBe(false);
      // 65 chars
      expect(isValidTokenShape('a'.repeat(65))).toBe(false);
      // 64 chars with non-hex character 'g'
      expect(isValidTokenShape('g' + 'a'.repeat(63))).toBe(false);
    });

    it('accepts exact 64-hexadecimal characters', () => {
      expect(isValidTokenShape('a'.repeat(64))).toBe(true);
      expect(isValidTokenShape('f'.repeat(64))).toBe(true);
      expect(isValidTokenShape('  ' + 'a'.repeat(64) + '  ')).toBe(true); // trims whitespace safely
    });
  });

  describe('2. Password Strength & Common Password Scoring (scorePassword & isCommonPassword)', () => {
    it('identifies common patterns and blocklist passwords', () => {
      expect(isCommonPassword('password')).toBe(true);
      expect(isCommonPassword('Password123!')).toBe(true);
      expect(isCommonPassword('qwertyuiop')).toBe(true);
      expect(isCommonPassword('aaaa')).toBe(true);
      expect(isCommonPassword('admin123')).toBe(true);
      expect(isCommonPassword('MyComplex#Token2026')).toBe(false);
    });

    it('aligns strength meter directly with submit validation requirements', () => {
      // 20 lowercase chars: was previously rated "strong" by length, but failed submit validation
      expect(scorePassword('aaaaaaaaaaaaaaaaaaaa')).toBe('weak');

      // 8 characters meeting all 4 classes: was previously rated "weak" by length (< 12), but passed submit
      expect(scorePassword('Aa1!aaaa')).toBe('fair');

      // 4 characters meeting classes: fails length
      expect(scorePassword('Aa1!')).toBe('weak');

      // Common passwords score weak regardless of character classes
      expect(scorePassword('Password123!')).toBe('weak');

      // Strong password (>= 12 chars, all 4 classes, not common)
      expect(scorePassword('MySecure#Pass2026')).toBe('strong');
    });
  });

  describe('3. Max Password Length & Bcrypt 72-byte Limit', () => {
    it('sets maxLength 72 on inputs and blocks submission over 72 characters', async () => {
      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${valid64Token}`]}>
          <ToastProvider>
            <ResetPassword />
          </ToastProvider>
        </MemoryRouter>
      );

      const pwdInput = screen.getByLabelText(/new password/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);
      const submitBtn = screen.getByRole('button', { name: /reset password/i });

      expect(pwdInput).toHaveAttribute('maxLength', '72');
      expect(confirmInput).toHaveAttribute('maxLength', '72');

      const tooLong = 'A1!' + 'a'.repeat(75);
      fireEvent.change(pwdInput, { target: { value: tooLong } });
      fireEvent.change(confirmInput, { target: { value: tooLong } });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/password is too long/i)).toBeInTheDocument();
      expect(api.resetPassword).not.toHaveBeenCalled();
    });
  });

  describe('4. Accessibility: Progressbar, Live Regions & Password Toggle', () => {
    it('renders accessible progressbar with ARIA attributes when password is typed', () => {
      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${valid64Token}`]}>
          <ToastProvider>
            <ResetPassword />
          </ToastProvider>
        </MemoryRouter>
      );

      const pwdInput = screen.getByLabelText(/new password/i);
      fireEvent.change(pwdInput, { target: { value: 'Aa1!aaaa' } });

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeInTheDocument();
      expect(progressbar).toHaveAttribute('aria-valuenow', '66');
      expect(progressbar).toHaveAttribute('aria-valuemin', '0');
      expect(progressbar).toHaveAttribute('aria-valuemax', '100');
      expect(progressbar).toHaveAttribute('aria-valuetext', 'Password strength: fair');
    });

    it('exposes show/hide passwords toggle button to keyboard users without tabIndex -1', () => {
      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${valid64Token}`]}>
          <ToastProvider>
            <ResetPassword />
          </ToastProvider>
        </MemoryRouter>
      );

      const toggleBtn = screen.getByRole('button', { name: /show passwords/i });
      expect(toggleBtn).toBeInTheDocument();
      expect(toggleBtn).not.toHaveAttribute('tabIndex', '-1');

      fireEvent.click(toggleBtn);
      expect(screen.getByRole('button', { name: /hide passwords/i })).toBeInTheDocument();
    });
  });

  describe('5. Unmount Timer Cleanup & Manual Continue Link', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('clears redirect timeout on unmount to prevent navigation race conditions', async () => {
      api.resetPassword.mockResolvedValueOnce({ message: 'Success' });
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

      const { unmount } = render(
        <MemoryRouter initialEntries={[`/reset-password?token=${valid64Token}`]}>
          <ToastProvider>
            <ResetPassword />
          </ToastProvider>
        </MemoryRouter>
      );

      const pwdInput = screen.getByLabelText(/new password/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);
      const submitBtn = screen.getByRole('button', { name: /reset password/i });

      fireEvent.change(pwdInput, { target: { value: 'NewStrong#Pass2026' } });
      fireEvent.change(confirmInput, { target: { value: 'NewStrong#Pass2026' } });
      await act(async () => {
        fireEvent.click(submitBtn);
        await vi.advanceTimersByTimeAsync(100);
      });

      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('displays status role, polite live region, and manual Continue button on success', async () => {
      api.resetPassword.mockResolvedValueOnce({ message: 'Success' });

      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${valid64Token}`]}>
          <ToastProvider>
            <ResetPassword />
          </ToastProvider>
        </MemoryRouter>
      );

      const pwdInput = screen.getByLabelText(/new password/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);
      const submitBtn = screen.getByRole('button', { name: /reset password/i });

      fireEvent.change(pwdInput, { target: { value: 'NewStrong#Pass2026' } });
      fireEvent.change(confirmInput, { target: { value: 'NewStrong#Pass2026' } });
      await act(async () => {
        fireEvent.click(submitBtn);
        await vi.advanceTimersByTimeAsync(100);
      });

      const statusRegion = screen.getByText(/password updated/i).closest('[role="status"]');
      expect(statusRegion).toBeInTheDocument();
      expect(statusRegion).toHaveAttribute('aria-live', 'polite');
      expect(statusRegion).toHaveTextContent(/password updated/i);

      const continueLink = screen.getByRole('link', { name: /continue to login/i });
      expect(continueLink).toBeInTheDocument();
      expect(continueLink).toHaveAttribute('href', '/login');
    });
  });

  describe('6. Status Code-Aware Error Messages', () => {
    it('handles 410 expired link status code with explicit expired message', async () => {
      api.resetPassword.mockRejectedValueOnce({
        response: {
          status: 410,
          data: {},
        },
      });

      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${valid64Token}`]}>
          <ToastProvider>
            <ResetPassword />
          </ToastProvider>
        </MemoryRouter>
      );

      const pwdInput = screen.getByLabelText(/new password/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);
      const submitBtn = screen.getByRole('button', { name: /reset password/i });

      fireEvent.change(pwdInput, { target: { value: 'ValidStrong#Pass2026' } });
      fireEvent.change(confirmInput, { target: { value: 'ValidStrong#Pass2026' } });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/this reset link has expired/i)).toBeInTheDocument();
    });

    it('handles 500 server error status code gracefully', async () => {
      api.resetPassword.mockRejectedValueOnce({
        response: {
          status: 500,
          data: { error: 'Internal Server Error' },
        },
      });

      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${valid64Token}`]}>
          <ToastProvider>
            <ResetPassword />
          </ToastProvider>
        </MemoryRouter>
      );

      const pwdInput = screen.getByLabelText(/new password/i);
      const confirmInput = screen.getByLabelText(/confirm password/i);
      const submitBtn = screen.getByRole('button', { name: /reset password/i });

      fireEvent.change(pwdInput, { target: { value: 'ValidStrong#Pass2026' } });
      fireEvent.change(confirmInput, { target: { value: 'ValidStrong#Pass2026' } });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/a server error occurred/i)).toBeInTheDocument();
    });
  });
});
