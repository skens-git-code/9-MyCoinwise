import React from 'react';
import PropTypes from 'prop-types';

/* —————————————————————————————————————
 * Dashboard Skeleton
 * Matches Bento layout: Hero, Income, Expense, Chart, Recent, Goal
 * ————————————————————————————————————— */
export const DashboardSkeleton = () => (
  <div className="bento-dashboard" aria-label="Loading dashboard" role="status">
    <div
      className="bento-header skeleton"
      style={{ height: 40, borderRadius: 14, width: 220, marginBottom: 24, border: '1px solid var(--glass-border)' }}
    />
    <div className="bento-grid">
      <div className="bento-tile bento-hero glass skeleton" style={{ minHeight: 180 }} />
      <div className="bento-tile bento-income glass skeleton" style={{ minHeight: 140 }} />
      <div className="bento-tile bento-expense glass skeleton" style={{ minHeight: 140 }} />
      <div className="bento-tile bento-recent glass skeleton" style={{ minHeight: 360 }} />
      <div className="bento-tile bento-chart glass skeleton" style={{ minHeight: 320 }} />
      <div className="bento-tile bento-goal glass skeleton" style={{ minHeight: 220 }} />
      <div className="bento-tile bento-pie glass skeleton" style={{ minHeight: 220 }} />
    </div>
  </div>
);

/* —————————————————————————————————————
 * Transactions Skeleton
 * Matches inbox layout: header, search bar, list rows
 * ————————————————————————————————————— */
export const TransactionsSkeleton = () => (
  <div className="inbox-layout-page" aria-label="Loading transactions" role="status">
    <div className="inbox-header" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div className="skeleton" style={{ height: 36, width: 180, borderRadius: 10 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="skeleton" style={{ height: 38, width: 90, borderRadius: 10 }} />
        <div className="skeleton" style={{ height: 38, width: 120, borderRadius: 10 }} />
      </div>
    </div>
    <div className="glass" style={{ height: 52, borderRadius: 12, marginBottom: 16, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
      <div className="skeleton" style={{ height: 28, width: 200, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 28, width: 100, borderRadius: 8, marginLeft: 'auto' }} />
    </div>
    <div className="glass" style={{ borderRadius: 14, overflow: 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px' }}>
          <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton" style={{ height: 16, width: `${40 + (i % 4) * 15}%`, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 12, width: '25%', borderRadius: 4 }} />
          </div>
          <div className="skeleton" style={{ height: 18, width: 70, borderRadius: 6, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  </div>
);

/* —————————————————————————————————————
 * Goals Skeleton
 * Matches savings goals masonry layout
 * ————————————————————————————————————— */
export const GoalsSkeleton = () => (
  <div className="masonry-layout-page goals-page-wrap" aria-label="Loading savings goals" role="status">
    <div className="masonry-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div className="skeleton" style={{ height: 38, width: 220, borderRadius: 12 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="skeleton" style={{ height: 38, width: 84, borderRadius: 10 }} />
        <div className="skeleton" style={{ height: 38, width: 114, borderRadius: 10 }} />
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 96, borderRadius: 16 }} />
      ))}
    </div>
    <div className="glass" style={{ height: 56, borderRadius: 14, marginBottom: 16, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
      <div className="skeleton" style={{ height: 32, width: 160, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 34, width: 240, borderRadius: 9999, marginLeft: 'auto' }} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 210, borderRadius: 18 }} />
      ))}
    </div>
  </div>
);

/* —————————————————————————————————————
 * Accounts Skeleton
 * Matches accounts & wallet cards
 * ————————————————————————————————————— */
export const AccountsSkeleton = () => (
  <div className="inbox-layout-page" aria-label="Loading accounts" role="status">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div className="skeleton" style={{ height: 36, width: 160, borderRadius: 10 }} />
      <div className="skeleton" style={{ height: 38, width: 130, borderRadius: 10 }} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 110, borderRadius: 16 }} />
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 160, borderRadius: 16 }} />
      ))}
    </div>
  </div>
);

/* —————————————————————————————————————
 * Budgets Skeleton
 * Matches budgets category cards
 * ————————————————————————————————————— */
export const BudgetsSkeleton = () => (
  <div className="inbox-layout-page" aria-label="Loading budgets" role="status">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div className="skeleton" style={{ height: 36, width: 170, borderRadius: 10 }} />
      <div className="skeleton" style={{ height: 38, width: 120, borderRadius: 10 }} />
    </div>
    <div className="glass skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 20 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 140, borderRadius: 16 }} />
      ))}
    </div>
  </div>
);

/* —————————————————————————————————————
 * Analytics Skeleton
 * Matches analytics charts and metrics
 * ————————————————————————————————————— */
export const AnalyticsSkeleton = () => (
  <div className="inbox-layout-page" aria-label="Loading analytics" role="status">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div className="skeleton" style={{ height: 36, width: 180, borderRadius: 10 }} />
      <div className="skeleton" style={{ height: 36, width: 140, borderRadius: 10 }} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 90, borderRadius: 14 }} />
      ))}
    </div>
    <div className="glass skeleton" style={{ height: 300, borderRadius: 18, marginBottom: 20 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      <div className="glass skeleton" style={{ height: 240, borderRadius: 16 }} />
      <div className="glass skeleton" style={{ height: 240, borderRadius: 16 }} />
    </div>
  </div>
);

/* —————————————————————————————————————
 * Subscriptions Skeleton
 * ————————————————————————————————————— */
export const SubscriptionsSkeleton = () => (
  <div className="inbox-layout-page" aria-label="Loading subscriptions" role="status">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div className="skeleton" style={{ height: 36, width: 200, borderRadius: 10 }} />
      <div className="skeleton" style={{ height: 38, width: 130, borderRadius: 10 }} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 95, borderRadius: 14 }} />
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 150, borderRadius: 16 }} />
      ))}
    </div>
  </div>
);

/* —————————————————————————————————————
 * Cashflow Skeleton
 * ————————————————————————————————————— */
export const CashflowSkeleton = () => (
  <div className="inbox-layout-page" aria-label="Loading cashflow" role="status">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div className="skeleton" style={{ height: 36, width: 170, borderRadius: 10 }} />
      <div className="skeleton" style={{ height: 36, width: 110, borderRadius: 10 }} />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 90, borderRadius: 14 }} />
      ))}
    </div>
    <div className="glass skeleton" style={{ height: 320, borderRadius: 18 }} />
  </div>
);

/* —————————————————————————————————————
 * Wealth Skeleton
 * ————————————————————————————————————— */
export const WealthSkeleton = () => (
  <div className="inbox-layout-page" aria-label="Loading wealth portfolio" role="status">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div className="skeleton" style={{ height: 36, width: 180, borderRadius: 10 }} />
      <div className="skeleton" style={{ height: 38, width: 120, borderRadius: 10 }} />
    </div>
    <div className="glass skeleton" style={{ height: 160, borderRadius: 18, marginBottom: 20 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      <div className="glass skeleton" style={{ height: 260, borderRadius: 16 }} />
      <div className="glass skeleton" style={{ height: 260, borderRadius: 16 }} />
    </div>
  </div>
);

/* —————————————————————————————————————
 * Calendar Skeleton
 * ————————————————————————————————————— */
export const CalendarSkeleton = () => (
  <div className="inbox-layout-page" aria-label="Loading calendar" role="status">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div className="skeleton" style={{ height: 36, width: 190, borderRadius: 10 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="skeleton" style={{ height: 36, width: 80, borderRadius: 10 }} />
        <div className="skeleton" style={{ height: 36, width: 100, borderRadius: 10 }} />
      </div>
    </div>
    <div className="glass skeleton" style={{ height: 80, borderRadius: 14, marginBottom: 16 }} />
    <div className="glass skeleton" style={{ height: 440, borderRadius: 18 }} />
  </div>
);

/* —————————————————————————————————————
 * Generic Page Skeleton (Settings, Legal, Calculator, Tax)
 * ————————————————————————————————————— */
export const PageSkeleton = ({ title = 'Page' }) => (
  <div className="inbox-layout-page" aria-label={`Loading ${title}`} role="status">
    <div style={{ marginBottom: 24 }}>
      <div className="skeleton" style={{ height: 36, width: 200, borderRadius: 10, marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 16, width: 320, borderRadius: 6 }} />
    </div>
    <div className="glass skeleton" style={{ height: 260, borderRadius: 16, marginBottom: 20 }} />
    <div className="glass skeleton" style={{ height: 180, borderRadius: 16 }} />
  </div>
);

PageSkeleton.propTypes = {
  title: PropTypes.string,
};
