/* —————————————————————————————————————
 * Footer Component
 * Site footer with copyright, legal links, and Cookie preferences trigger.
 * ————————————————————————————————————— */

import React from 'react';
import { Link } from 'react-router-dom';
import { openCookiePreferences } from '../services/clarity';

export default function Footer() {
  return (
    <footer
      className="site-footer"
      style={{
        marginTop: 'auto',
        padding: '24px 16px',
        textAlign: 'center',
        color: 'var(--text-secondary, #94a3b8)',
        fontSize: '0.85rem',
        borderTop: '1px solid var(--glass-border, rgba(255, 255, 255, 0.08))',
        background: 'rgba(255, 255, 255, 0.02)',
        borderRadius: '0 0 24px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      {/* ── Navigation & Legal Links ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          fontSize: '0.8125rem',
        }}
      >
        <Link
          to="/terms"
          style={{
            color: 'var(--text-secondary, #94a3b8)',
            textDecoration: 'none',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary, #f1f5f9)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)')}
        >
          Terms of Service
        </Link>
        <span style={{ opacity: 0.3 }} aria-hidden="true">•</span>
        <Link
          to="/privacy"
          style={{
            color: 'var(--text-secondary, #94a3b8)',
            textDecoration: 'none',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary, #f1f5f9)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)')}
        >
          Privacy Policy
        </Link>
        <span style={{ opacity: 0.3 }} aria-hidden="true">•</span>
        <button
          type="button"
          onClick={openCookiePreferences}
          className="footer-cookie-prefs-btn"
          aria-label="Open cookie preferences modal"
          style={{
            background: 'none',
            border: 'none',
            padding: '4px 8px',
            color: 'var(--text-secondary, #94a3b8)',
            fontSize: '0.8125rem',
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand-secondary, #38bdf8)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)')}
        >
          Cookie preferences
        </button>
      </div>

      {/* ── Copyright line ── */}
      <p style={{ margin: 0 }}>
        &copy; {new Date().getFullYear()} MyCoinwise. All rights reserved.
      </p>

      {/* ── Tagline ── */}
      <p style={{ margin: 0, opacity: 0.7, fontSize: '0.78rem' }}>
        Designed for the Future of Finance.
      </p>
    </footer>
  );
}