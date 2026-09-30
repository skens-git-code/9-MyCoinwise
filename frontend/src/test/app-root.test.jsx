import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

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
    updateSettings: vi.fn().mockResolvedValue({}),
    logout: vi.fn().mockResolvedValue({}),
  },
  CURRENCIES: {
    USD: { symbol: '$', name: 'US Dollar' },
    INR: { symbol: '₹', name: 'Indian Rupee' },
  },
  AVATARS: ['user1', 'user2', 'user3', 'user4', 'user5'],
  AVATAR_COLORS: ['#059669', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#f97316', '#64748b'],
  getStoredToken: vi.fn(() => 'mock-token'),
}));

describe('App Root Mounting', () => {
  it('mounts App without ErrorBoundary triggering', async () => {
    vi.useFakeTimers();
    render(<App />);
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    expect(screen.queryByText(/Oops, something went wrong/i)).toBeNull();
  });
});

