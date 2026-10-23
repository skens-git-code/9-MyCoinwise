import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Zap,
  ArrowLeft,
  Shield,
  EyeOff,
  Server,
  Trash2,
  Lock,
  Mail,
  Cookie,
  Sun,
  Moon,
  Home,
  Sliders,
} from 'lucide-react';
import Footer from '../components/Footer';
import { AppStateContext, AppActionsContext, AppContext } from '../contexts/AppContext';
import { openCookiePreferences } from '../services/clarity';
import { CoinwiseBadge } from '../components/CoinwiseBrand';

export default function Privacy() {
  const navigate = useNavigate();
  const location = useLocation();

  // Safely consume context with defensive fallbacks for isolation / unit tests
  const stateCtx = useContext(AppStateContext);
  const actionsCtx = useContext(AppActionsContext);
  const legacyCtx = useContext(AppContext);

  const [localTheme, setLocalTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('mcw-theme');
      if (stored) return stored;
    }
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') || 'light';
    }
    return 'light';
  });

  const effectiveTheme = stateCtx?.theme || legacyCtx?.theme || localTheme;
  const isDark =
    effectiveTheme === 'amoled' ||
    effectiveTheme === 'dark' ||
    (effectiveTheme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const isAuthenticated = Boolean(stateCtx?.user || stateCtx?.token || legacyCtx?.user || legacyCtx?.token);

  useEffect(() => {
    // Scroll to top upon navigation
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.title = 'Privacy Policy – MyCoinwise';
    }
  }, [location.pathname]);

  const handleToggleTheme = () => {
    if (typeof actionsCtx?.toggleTheme === 'function') {
      actionsCtx.toggleTheme();
    } else if (typeof legacyCtx?.toggleTheme === 'function') {
      legacyCtx.toggleTheme();
    } else {
      const next = isDark ? 'light' : 'amoled';
      setLocalTheme(next);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mcw-theme', next);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', next);
      }
    }
  };

  const handleBackNavigation = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(isAuthenticated ? '/' : '/login');
    }
  };

  return (
    <div
      className="privacy-page-shell"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-0, #080a0a)',
        color: 'var(--text-primary, #ffffff)',
        position: 'relative',
        overflowX: 'hidden',
        transition: 'background 0.3s ease, color 0.3s ease',
      }}
    >
      {/* Ambient background glow — automatically adapts to theme tokens */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-10%',
          left: '15%',
          width: 'clamp(320px, 50vw, 620px)',
          height: 'clamp(320px, 50vw, 620px)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(var(--brand-secondary-rgb, 139, 92, 246), 0.12) 0%, rgba(var(--brand-primary-rgb, 16, 185, 129), 0.05) 50%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Main Container */}
      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 880,
          margin: '0 auto',
          padding: 'clamp(1.5rem, 3.5vw, 2.5rem) clamp(1rem, 3vw, 1.5rem)',
          position: 'relative',
          zIndex: 1,
          boxSizing: 'border-box',
        }}
      >
        {/* Navigation Bar */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '2.5rem',
            paddingBottom: '1.25rem',
            borderBottom: '1px solid var(--glass-border, rgba(255, 255, 255, 0.08))',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {/* Brand Logo Link */}
          <Link
            to={isAuthenticated ? '/' : '/login'}
            aria-label="MyCoinwise Home"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <CoinwiseBadge size={38} radius={11} variant="surface" />
            <span
              style={{
                fontWeight: 800,
                fontSize: '1.25rem',
                fontFamily: 'var(--font-head, "Space Grotesk", sans-serif)',
                letterSpacing: '-0.02em',
                color: 'var(--text-primary, #ffffff)',
              }}
            >
              MyCoinwise
            </span>
          </Link>

          {/* Right Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Quick switcher between Terms & Privacy */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--surface-2, rgba(255, 255, 255, 0.04))',
                border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.08))',
                borderRadius: 10,
                padding: '2px',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              <Link
                to="/terms"
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  color: 'var(--text-secondary, #94a3b8)',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                Terms
              </Link>
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: 'var(--surface-1, #ffffff)',
                  color: 'var(--brand-secondary, #8b5cf6)',
                  boxShadow: 'var(--shadow-xs, 0 1px 3px rgba(0,0,0,0.1))',
                  cursor: 'default',
                }}
              >
                Privacy
              </span>
            </div>

            {/* Theme Toggle Button */}
            <motion.button
              type="button"
              onClick={handleToggleTheme}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} theme`}
              aria-label="Toggle theme"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'var(--surface-1, rgba(255, 255, 255, 0.05))',
                color: 'var(--text-secondary, #94a3b8)',
                border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </motion.button>

            {/* Back Button */}
            <motion.button
              type="button"
              onClick={handleBackNavigation}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 10,
                background: 'var(--surface-1, rgba(255, 255, 255, 0.06))',
                color: 'var(--text-primary, #ffffff)',
                border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {isAuthenticated ? <Home size={16} /> : <ArrowLeft size={16} />}
              <span>{isAuthenticated ? 'Dashboard' : 'Back'}</span>
            </motion.button>
          </div>
        </header>

        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ marginBottom: '2.5rem' }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(var(--brand-secondary-rgb, 139, 92, 246), 0.12)',
              border: '1px solid rgba(var(--brand-secondary-rgb, 139, 92, 246), 0.28)',
              color: 'var(--brand-secondary, #8b5cf6)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              marginBottom: '1rem',
            }}
          >
            <Shield size={15} />
            <span>Data Protection & Privacy</span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(2rem, 4vw, 2.75rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              marginBottom: '0.75rem',
              color: 'var(--text-primary, #ffffff)',
              fontFamily: 'var(--font-head, "Space Grotesk", sans-serif)',
            }}
          >
            Privacy Policy
          </h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
            Effective Date: September 2026 · Committed to zero data selling and complete encryption.
          </p>
        </motion.div>

        {/* Content Card — Theme-Adaptive Surface */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          style={{
            background: 'var(--surface-1, #0f1010)',
            borderRadius: 24,
            border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.08))',
            padding: 'clamp(1.5rem, 4vw, 2.75rem)',
            boxShadow: 'var(--shadow-xl, 0 20px 40px -15px rgba(0,0,0,0.25))',
            lineHeight: 1.7,
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem',
          }}
        >
          {/* Section 1 */}
          <section>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary, #ffffff)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <EyeOff size={18} style={{ color: 'var(--brand-primary, #10b981)' }} />
              1. Zero Ad Tracking & Zero Data Selling
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', margin: 0 }}>
              We do not sell, rent, or monetize your personal or financial data with third-party advertisers, data
              brokers, or analytics aggregators. Your ledger is yours alone.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary, #ffffff)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Lock size={18} style={{ color: 'var(--brand-primary, #10b981)' }} />
              2. Data We Collect & Store
            </h2>
            <ul
              style={{
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: '0.9375rem',
                paddingLeft: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                margin: 0,
              }}
            >
              <li>
                <strong style={{ color: 'var(--text-primary, #ffffff)' }}>Account Credentials:</strong> Email address,
                username, securely hashed password (via bcrypt cost factor 10), and optional profile customizations
                (color and avatar).
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary, #ffffff)' }}>Financial Ledger Data:</strong> Transactions,
                account names, category mappings, savings goals, and recurring subscriptions created manually or imported
                by you.
              </li>
              <li>
                <strong style={{ color: 'var(--text-primary, #ffffff)' }}>Session Metadata:</strong> IP address, device
                type, user agent string, and login timestamps to enable multi-device session inspection and instant remote
                logout in your Security Settings.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary, #ffffff)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Server size={18} style={{ color: 'var(--brand-primary, #10b981)' }} />
              3. Encryption & Infrastructure Security
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', margin: 0 }}>
              All network transmissions are encrypted end-to-end via TLS 1.3 / HTTPS. All backend database operations
              are protected with strict parameter validation, MongoDB query sanitization, and cryptographically signed
              JWT tokens with bounded lifespans and version checks.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary, #ffffff)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Trash2 size={18} style={{ color: 'var(--danger, #ef4444)' }} />
              4. Right to Deletion & Data Portability
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', margin: 0 }}>
              In compliance with global data protection standards (GDPR, CCPA), you hold the right to export your
              complete history at any time, or permanently delete all transactions and account records. Account deletion
              instantly revokes all active tokens, removes database records, and invalidates cached data.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary, #ffffff)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Mail size={18} style={{ color: 'var(--brand-primary, #10b981)' }} />
              5. Privacy Questions
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', margin: 0 }}>
              For data privacy inquiries, please contact our privacy officer at{' '}
              <a
                href="mailto:skens.code@gmail.com"
                style={{
                  color: 'var(--brand-primary, #10b981)',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                skens.code@gmail.com
              </a>.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary, #ffffff)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Cookie size={18} style={{ color: 'var(--brand-accent, #06b6d4)' }} />
              6. Performance & Usage Analytics (Opt-in Only)
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', marginBottom: '0.85rem' }}>
              We use optional, privacy-preserving analytics to analyze application usability, diagnose navigation
              friction, and identify runtime exceptions. Analytics collects anonymous interaction metrics such as click
              events and interface flow telemetry.
            </p>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', marginBottom: '0.85rem' }}>
              <strong style={{ color: 'var(--text-primary, #ffffff)' }}>Strict Masking & Zero PII:</strong> All
              telemetry operates with strict client-side masking enabled. Passwords, bank account credentials, exact
              transaction balances, and personalized text are never collected or transmitted. We never sell or monetize
              your data.
            </p>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', marginBottom: '1.25rem' }}>
              <strong style={{ color: 'var(--text-primary, #ffffff)' }}>How to Opt Out:</strong> Analytics will never
              execute or set cookies without your explicit consent. You can grant, deny, or revoke consent at any time via
              the <strong>Cookie preferences</strong> link in the site footer or under{' '}
              <strong>Settings &gt; Data &amp; Security</strong>. If you revoke consent, telemetry is immediately halted
              and tracking cookies (
              <code
                style={{
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: 'var(--glass-2, rgba(255, 255, 255, 0.05))',
                  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
                  color: 'var(--brand-primary, #10b981)',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.8125rem',
                }}
              >
                _clck
              </code>
              ,{' '}
              <code
                style={{
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: 'var(--glass-2, rgba(255, 255, 255, 0.05))',
                  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
                  color: 'var(--brand-primary, #10b981)',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.8125rem',
                }}
              >
                _clsk
              </code>
              ) are cleared. If your browser broadcasts a <strong>Do Not Track (DNT)</strong> header, analytics is blocked
              automatically.
            </p>

            {/* Direct Cookie Preferences Action Button */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <motion.button
                type="button"
                onClick={openCookiePreferences}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 10,
                  background: 'var(--surface-2, rgba(255, 255, 255, 0.05))',
                  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
                  color: 'var(--brand-primary, #10b981)',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Sliders size={14} />
                <span>Configure Cookie Preferences</span>
              </motion.button>
            </div>
          </section>
        </motion.div>
      </main>

      {/* Full-width responsive footer adhering to design system */}
      <Footer />
    </div>
  );
}
