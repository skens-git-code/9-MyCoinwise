import React, { useContext } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { AppContext } from '../contexts/AppContext';

export default function Breadcrumbs() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { t } = useContext(AppContext);

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
      default:
        return path.replace('/', '').replace(/-/g, ' ');
    }
  };

  const dashboardLabel = t?.('dashboard') || 'Dashboard';

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
