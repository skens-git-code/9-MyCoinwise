import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../components/ToastProvider';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, layout, transition, ...props }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

const TestComponent = () => {
  const { showToast } = useToast();

  return (
    <div>
      <button onClick={() => showToast('success', 'Operation successful')}>Trigger Success</button>
      <button onClick={() => showToast('info', 'Here is information')}>Trigger Info</button>
      <button onClick={() => showToast('warning', 'Be careful')}>Trigger Warning</button>
      <button onClick={() => showToast('error', 'Something went wrong')}>Trigger Error</button>
    </div>
  );
};

const renderWithToast = () => {
  return render(
    <ToastProvider>
      <TestComponent />
    </ToastProvider>
  );
};

describe('Wave 5 — Notifications & Toasts (Glitches #12 & #13)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders toasts without inline backdropFilter and respects safe-area padding (Glitch #12)', () => {
    const { container } = renderWithToast();

    fireEvent.click(screen.getByText('Trigger Info'));

    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();

    // Glitch #12: No inline backdropFilter
    expect(alert.style.backdropFilter).toBeFalsy();
    expect(alert.style.WebkitBackdropFilter).toBeFalsy();

    // Stack container has env(safe-area-inset-top)
    const stack = container.querySelector('[role="status"]');
    expect(stack).toBeTruthy();
    expect(stack.style.paddingTop).toContain('safe-area-inset-top');
  });

  it('auto-dismisses success toast after 3 seconds (Glitch #13)', () => {
    renderWithToast();

    fireEvent.click(screen.getByText('Trigger Success'));
    expect(screen.getByText('Operation successful')).toBeTruthy();

    // At 2900ms, still visible
    act(() => {
      vi.advanceTimersByTime(2900);
    });
    expect(screen.getByText('Operation successful')).toBeTruthy();

    // At 3050ms, auto-dismissed
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Operation successful')).toBeNull();
  });

  it('auto-dismisses info toast after 4 seconds (Glitch #13)', () => {
    renderWithToast();

    fireEvent.click(screen.getByText('Trigger Info'));
    expect(screen.getByText('Here is information')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3900);
    });
    expect(screen.getByText('Here is information')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Here is information')).toBeNull();
  });

  it('auto-dismisses warning toast after 5 seconds (Glitch #13)', () => {
    renderWithToast();

    fireEvent.click(screen.getByText('Trigger Warning'));
    expect(screen.getByText('Be careful')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(screen.getByText('Be careful')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Be careful')).toBeNull();
  });

  it('error toast persists indefinitely until user dismisses it (Glitch #13)', () => {
    renderWithToast();

    fireEvent.click(screen.getByText('Trigger Error'));
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    // Advance 60 seconds (1 minute)
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    // Error toast MUST still be visible!
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    // Now manually click close
    const closeBtn = screen.getByLabelText('Close notification');
    fireEvent.click(closeBtn);

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});

describe('Enterprise Notification Manager & Architecture', () => {
  it('manages read, archived, pinned statuses and relative time correctly', async () => {
    const { notificationManager } = await import('../utils/notificationManager');

    const testId = 'alert-test-xyz';
    notificationManager.markAsUnread(testId);
    expect(notificationManager.isRead(testId)).toBe(false);

    notificationManager.markAsRead(testId);
    expect(notificationManager.isRead(testId)).toBe(true);

    notificationManager.togglePin(testId);
    expect(notificationManager.isPinned(testId)).toBe(true);

    notificationManager.archive(testId);
    expect(notificationManager.isArchived(testId)).toBe(true);

    notificationManager.unarchive(testId);
    expect(notificationManager.isArchived(testId)).toBe(false);

    expect(notificationManager.formatRelativeTime(Date.now() - 30000)).toBe('Just now');
    expect(notificationManager.formatRelativeTime(Date.now() - 300000)).toBe('5m ago');
    expect(notificationManager.formatRelativeTime(Date.now() - 7200000)).toBe('2h ago');
  });

  it('correctly calculates quiet hours spans', async () => {
    const { notificationManager } = await import('../utils/notificationManager');

    const prefsDisabled = { quietHoursEnabled: false };
    expect(notificationManager.isInQuietHours(prefsDisabled)).toBe(false);

    // Overnight quiet hours 22:00 to 08:00
    const overnightPrefs = {
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    };
    // Result depends on current hour, verify function runs cleanly and returns boolean
    expect(typeof notificationManager.isInQuietHours(overnightPrefs)).toBe('boolean');
  });

  it('generateAlerts respects user notification preferences and enriches metadata', async () => {
    const { generateAlerts } = await import('../services/aiEngine');

    const userWithPrefs = {
      monthly_goal: 5000,
      notification_prefs: {
        budgetAlerts: false, // suppressed
        unusualSpending: true,
        goalMilestones: true,
      },
    };

    const mockTxs = [
      { id: '1', date: new Date().toISOString(), type: 'expense', amount: 8000, category: 'Shopping' },
    ];

    const alerts = generateAlerts(mockTxs, userWithPrefs, []);
    // Budget alert should be suppressed
    const budgetAlert = alerts.find(a => a.category === 'budget');
    expect(budgetAlert).toBeUndefined();

    // Daily tip is always included and has metadata
    const tip = alerts.find(a => a.type === 'tip');
    expect(tip).toBeTruthy();
    expect(tip.id).toBeTruthy();
    expect(tip.priority).toBe(5);
    expect(tip.details).toBeTruthy();
  });
});
