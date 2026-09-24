/* —————————————————————————————————————
 * Breadcrumbs Component
 * Renders a small breadcrumb trail that links back to the dashboard
 * and labels the current page.
 *
 * Behavior:
 *   - On the dashboard route ("/") a single non-clickable "Home" crumb
 *     is rendered.
 *   - On any other route a "Home > <page>" trail is rendered, with the
 *     current page as plain text (not a link).
 *   - Labels come from the i18n `t()` function when available, with
 *     English fallbacks for each known route.
 *   - Unknown routes fall back to a title-cased version of the path.
 * ————————————————————————————————————— */

import React, { useContext } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { AppContext } from '../contexts/AppContext';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function Breadcrumbs() {
  // ── Current route and translation function ──
  const location = useLocation();
  const currentPath = location.pathname;
  const { t } = useContext(AppContext);

  /* —————————————————————————————————————
   * Path Label Resolver
   * Maps a known route to its translated or fallback label. Unknown
   * routes fall back to a stripped, dash-to-space version of the path.
   * ————————————————————————————————————— */
  const getPathLabel = (path) => {
    switch (path) {
      case '/':
        return t?.('dashboard') || 'Dashboard';
      case '/transactions':
        return t?.('transactions') || 'Transactions';
      case '/calendar':
        return t?.('calendar') || 'Calendar';
      case '/analytics':
        return t?.('analytics') || 'Analytics';
      case '/goals':
        return t?.('goals') || 'Savings Goals';
      case '/subscriptions':
        return t?.('subscriptions') || 'Subscriptions';
      case '/cashflow':
        return t?.('cashflow') || 'Forecasting';
      case '/wealth':
        return t?.('wealth') || 'Wealth Management';
      case '/budgets':
        return t?.('budgets') || 'Budgets';
      case '/accounts':
        return t?.('accounts') || 'Accounts';
      case '/settings':
        return t?.('settings') || 'Settings';
      case '/about':
        return t?.('about') || 'About Us';
      case '/calculator':
        return t?.('calculator') || 'Calculator';
      case '/tax':
        return t?.('tax_center') || 'Tax Center';
      default:
        return path.replace('/', '').replace(/-/g, ' ');
    }
  };

  // ── Dashboard label, reused in both return branches ──
  const dashboardLabel = t?.('dashboard') || 'Dashboard';

  // ── Dashboard route: single non-clickable Home crumb ──
  if (currentPath === '/') {
    return (
      <div className="breadcrumbs-bar">
        <span className="crumb-item active">
          <Home size={13} className="crumb-icon" />
          <span>{dashboardLabel}</span>
        </span>
      </div>
    );
  }

  // ── Non-dashboard routes: Home link + current page label ──
  const pageName = getPathLabel(currentPath);

  return (
    <nav className="breadcrumbs-bar" aria-label="Breadcrumb navigation">
      <NavLink to="/" className="crumb-item">
        <Home size={13} className="crumb-icon" />
        <span>{dashboardLabel}</span>
      </NavLink>
      <ChevronRight size={12} className="crumb-separator" />
      <span className="crumb-item active">
        {pageName}
      </span>
    </nav>
  );
}