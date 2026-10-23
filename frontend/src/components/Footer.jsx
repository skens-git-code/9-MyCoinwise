/* —————————————————————————————————————
 * Footer Component
 * Modern, clean, and balanced footer layout with brand
 * identity, navigation links, and operational status.
 * ————————————————————————————————————— */

import React from 'react';
import { Link } from 'react-router-dom';
import { openCookiePreferences } from '../services/clarity';
import { CoinwiseMark } from './CoinwiseBrand';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer app-footer" role="contentinfo">
      <div className="footer-inner">
        {/* ── Brand Lockup & Copyright ── */}
        <div className="footer-brand">
          <div className="footer-logo">
            <span className="footer-logo-icon" aria-hidden="true">
              <CoinwiseMark size={16} />
            </span>
            <span className="footer-brand-name">MyCoinwise</span>
          </div>
          <span className="footer-copy">
            &copy; {currentYear} MyCoinwise. All rights reserved.
          </span>
        </div>

        {/* ── Navigation Links ── */}
        <nav className="footer-nav site-footer-links" aria-label="Footer Navigation">
          <Link to="/about" className="footer-link footer-nav-link">
            About
          </Link>
          <span className="footer-dot footer-separator" aria-hidden="true">•</span>
          <Link to="/terms" className="footer-link footer-nav-link">
            Terms of Service
          </Link>
          <span className="footer-dot footer-separator" aria-hidden="true">•</span>
          <Link to="/privacy" className="footer-link footer-nav-link">
            Privacy Policy
          </Link>
          <span className="footer-dot footer-separator" aria-hidden="true">•</span>
          <button
            type="button"
            onClick={openCookiePreferences}
            className="footer-link footer-nav-link"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cookie Preferences
          </button>
        </nav>

        {/* ── Status Indicator ── */}
        <div className="footer-status" title="All systems normal">
          <span className="footer-status-indicator" aria-hidden="true" />
          <span className="footer-status-label">All Systems Normal</span>
        </div>
      </div>
    </footer>
  );
}