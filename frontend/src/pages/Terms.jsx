import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Zap,
  ArrowLeft,
  FileText,
  ShieldCheck,
  Scale,
  AlertCircle,
  HelpCircle,
  Lock,
  Sun,
  Moon,
  Shield,
  Home,
} from 'lucide-react';
import Footer from '../components/Footer';
import { AppStateContext, AppActionsContext, AppContext } from '../contexts/AppContext';

export default function Terms() {
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
      document.title = 'Terms & Conditions – MyCoinwise';
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
      className="terms-page-shell"
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
          right: '15%',
          width: 'clamp(320px, 50vw, 620px)',
          height: 'clamp(320px, 50vw, 620px)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(var(--brand-primary-rgb, 16, 185, 129), 0.12) 0%, rgba(var(--brand-secondary-rgb, 139, 92, 246), 0.06) 50%, transparent 70%)',
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
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'var(--brand-gradient, linear-gradient(135deg, #10b981 0%, #059669 100%))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: 'var(--shadow-brand, 0 4px 14px rgba(16, 185, 129, 0.35))',
                flexShrink: 0,
              }}
            >
              <Zap size={20} />
            </div>
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
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: 'var(--surface-1, #ffffff)',
                  color: 'var(--brand-primary, #10b981)',
                  boxShadow: 'var(--shadow-xs, 0 1px 3px rgba(0,0,0,0.1))',
                  cursor: 'default',
                }}
              >
                Terms
              </span>
              <Link
                to="/privacy"
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  color: 'var(--text-secondary, #94a3b8)',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                Privacy
              </Link>
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
              background: 'rgba(var(--brand-primary-rgb, 16, 185, 129), 0.12)',
              border: '1px solid rgba(var(--brand-primary-rgb, 16, 185, 129), 0.28)',
              color: 'var(--brand-primary, #10b981)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              marginBottom: '1rem',
            }}
          >
            <Scale size={15} />
            <span>Legal Agreement</span>
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
            Terms & Conditions
          </h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
            Effective Date: September 2026 · Version 2.0
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
              <FileText size={18} style={{ color: 'var(--brand-primary, #10b981)' }} />
              1. Acceptance of Terms
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', margin: 0 }}>
              By creating an account or accessing the MyCoinwise platform (&quot;Service&quot;), you agree to be bound
              by these Terms and Conditions (&quot;Terms&quot;). If you do not agree to all terms and conditions, you must
              not access or use the Service.
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
              <ShieldCheck size={18} style={{ color: 'var(--brand-primary, #10b981)' }} />
              2. Account Responsibilities & Security
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', margin: 0 }}>
              You are responsible for maintaining the confidentiality of your login credentials and for all activities
              conducted under your account. You agree to notify us immediately of any unauthorized use of your account.
              MyCoinwise employs industry-standard password hashing, multi-device session revocation, and brute-force
              protection mechanisms.
            </p>
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
              <AlertCircle size={18} style={{ color: 'var(--warning, #f59e0b)' }} />
              3. Financial Disclaimer (Not Investment Advice)
            </h2>
            <div
              style={{
                padding: '1.1rem 1.35rem',
                borderRadius: 14,
                background: 'rgba(var(--warning-rgb, 245, 158, 11), 0.08)',
                border: '1px solid rgba(var(--warning-rgb, 245, 158, 11), 0.28)',
                color: 'var(--text-primary, #ffffff)',
                fontSize: '0.875rem',
                lineHeight: 1.6,
              }}
            >
              MyCoinwise is a personal budgeting, cashflow forecasting, and expense tracking application. All charts,
              simulations, and AI insights are provided for educational and organizational purposes only. MyCoinwise is
              not a certified financial planner, tax consultant, or investment advisor. Always consult qualified
              financial professionals before making major investment or tax decisions.
            </div>
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
              <Lock size={18} style={{ color: 'var(--brand-primary, #10b981)' }} />
              4. User Data Ownership & Export
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', margin: 0 }}>
              You retain 100% ownership of your financial records and personal data. You may export your transactions,
              budgets, and accounts at any time via CSV, Excel, or PDF. You may also initiate an automated account reset
              or permanent data deletion directly from your account settings.
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
              <HelpCircle size={18} style={{ color: 'var(--brand-primary, #10b981)' }} />
              5. Contact & Inquiries
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem', margin: 0 }}>
              If you have any questions or concerns regarding these Terms, please reach out to us at{' '}
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
              </a>{' '}
              or visit our{' '}
              <Link
                to="/about"
                style={{
                  color: 'var(--brand-primary, #10b981)',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                About Page
              </Link>.
            </p>
          </section>
        </motion.div>
      </main>

      {/* Full-width responsive footer adhering to design system */}
      <Footer />
    </div>
  );
}
