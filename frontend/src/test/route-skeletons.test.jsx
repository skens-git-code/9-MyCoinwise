import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DashboardSkeleton,
  TransactionsSkeleton,
  GoalsSkeleton,
  AccountsSkeleton,
  BudgetsSkeleton,
  AnalyticsSkeleton,
  SubscriptionsSkeleton,
  CashflowSkeleton,
  WealthSkeleton,
  CalendarSkeleton,
  PageSkeleton,
} from '../components/skeletons';

describe('Wave 6 — Per-Route Skeleton Loaders (Glitch #14)', () => {
  it('renders DashboardSkeleton with bento layout and shimmer elements', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(screen.getByRole('status', { name: /loading dashboard/i })).toBeTruthy();
    expect(container.querySelector('.bento-grid')).toBeTruthy();
    expect(container.querySelectorAll('.bento-tile').length).toBe(7);
  });

  it('renders TransactionsSkeleton with list rows matching table layout', () => {
    const { container } = render(<TransactionsSkeleton />);
    expect(screen.getByRole('status', { name: /loading transactions/i })).toBeTruthy();
    expect(container.querySelector('.inbox-layout-page')).toBeTruthy();
    // 8 list row shimmers
    expect(container.querySelectorAll('.glass div[style*="flex"]').length).toBeGreaterThanOrEqual(8);
  });

  it('renders GoalsSkeleton with savings masonry layout', () => {
    const { container } = render(<GoalsSkeleton />);
    expect(screen.getByRole('status', { name: /loading savings goals/i })).toBeTruthy();
    expect(container.querySelector('.masonry-layout-page')).toBeTruthy();
  });

  it('renders AccountsSkeleton with account grid', () => {
    const { container } = render(<AccountsSkeleton />);
    expect(screen.getByRole('status', { name: /loading accounts/i })).toBeTruthy();
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(5);
  });

  it('renders BudgetsSkeleton with budget category cards', () => {
    render(<BudgetsSkeleton />);
    expect(screen.getByRole('status', { name: /loading budgets/i })).toBeTruthy();
  });

  it('renders AnalyticsSkeleton with KPI and chart placeholders', () => {
    render(<AnalyticsSkeleton />);
    expect(screen.getByRole('status', { name: /loading analytics/i })).toBeTruthy();
  });

  it('renders SubscriptionsSkeleton with subscription cards', () => {
    render(<SubscriptionsSkeleton />);
    expect(screen.getByRole('status', { name: /loading subscriptions/i })).toBeTruthy();
  });

  it('renders CashflowSkeleton with forecast cards', () => {
    render(<CashflowSkeleton />);
    expect(screen.getByRole('status', { name: /loading cashflow/i })).toBeTruthy();
  });

  it('renders WealthSkeleton with portfolio cards', () => {
    render(<WealthSkeleton />);
    expect(screen.getByRole('status', { name: /loading wealth portfolio/i })).toBeTruthy();
  });

  it('renders CalendarSkeleton with calendar day grid', () => {
    render(<CalendarSkeleton />);
    expect(screen.getByRole('status', { name: /loading calendar/i })).toBeTruthy();
  });

  it('renders PageSkeleton for secondary pages with custom title', () => {
    render(<PageSkeleton title="Settings" />);
    expect(screen.getByRole('status', { name: /loading settings/i })).toBeTruthy();
  });
});
