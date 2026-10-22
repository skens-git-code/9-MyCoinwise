/* —————————————————————————————————————
 * Footer Component
 * Modern, clean, and balanced footer layout with brand
 * identity, navigation links, and operational status.
 * ————————————————————————————————————— */

import React from 'react';
import { Link } from 'react-router-dom';
import { openCookiePreferences } from '../services/clarity';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer app-footer" role="contentinfo">
      <div className="footer-inner">
        {/* ── Brand Lockup & Copyright ── */}
        <div className="footer-brand">
          <div className="footer-logo">
            <span className="footer-logo-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v10" />
                <path d="M15 9.5a2.5 2.5 0 0 0-5 0c0 1.5 1 2 2.5 2.5s2.5 1 2.5 2.5a2.5 2.5 0 0 1-5 0" />
              </svg>
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