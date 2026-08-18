import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const ROUTE_LABELS = {
  '/': 'Dashboard',
  '/transactions': 'Transactions',
  '/calendar': 'Calendar',
  '/analytics': 'Analytics',
  '/goals': 'Savings Goals',
  '/subscriptions': 'Subscriptions',
  '/cashflow': 'Cashflow Forecast',
  '/wealth': 'Wealth Management',
  '/settings': 'Settings'
};

export default function Breadcrumbs() {
  const location = useLocation();
  const currentPath = location.pathname;

  if (currentPath === '/') {
    return (
      <div className="breadcrumbs-bar">
        <span className="crumb-item active">
          <Home size={13} className="crumb-icon" />
          <span>Dashboard</span>
        </span>
      </div>
    );
  }

  const pageName = ROUTE_LABELS[currentPath] || currentPath.replace('/', '').replace(/-/g, ' ');

  return (
    <nav className="breadcrumbs-bar" aria-label="Breadcrumb navigation">
      <NavLink to="/" className="crumb-item">
        <Home size={13} className="crumb-icon" />
        <span>Dashboard</span>
      </NavLink>
      <ChevronRight size={12} className="crumb-separator" />
      <span className="crumb-item active">
        {pageName}
      </span>
    </nav>
  );
}
