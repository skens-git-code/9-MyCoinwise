import React, { useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Compass,
  ArrowLeft,
  LayoutDashboard,
  ArrowRightLeft,
  PieChart,
  TrendingUp,
  Wallet,
  Sparkles,
  Calculator,
  ShieldCheck,
} from 'lucide-react';
import { AppStateContext, AppContext } from '../contexts/AppContext';

export default function NotFound() {
  const navigate = useNavigate();
  const stateCtx = useContext(AppStateContext);
  const legacyCtx = useContext(AppContext);
  const ctx = stateCtx || legacyCtx || {};
  const isAuthenticated = Boolean(ctx.token || ctx.user);

  const handleGoBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(isAuthenticated ? '/' : '/login');
    }
  };

  const quickLinks = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard, authOnly: true },
    { label: 'Transactions', path: '/transactions', icon: ArrowRightLeft, authOnly: true },
    { label: 'Budgets', path: '/budgets', icon: PieChart, authOnly: true },
    { label: 'Analytics', path: '/analytics', icon: TrendingUp, authOnly: true },
    { label: 'Wealth', path: '/wealth', icon: Wallet, authOnly: true },
    { label: 'Calculator', path: '/calculator', icon: Calculator, authOnly: false },
    { label: 'Sign In', path: '/login', icon: ShieldCheck, unauthOnly: true },
  ];

  const visibleLinks = quickLinks.filter((item) => {
    if (item.authOnly && !isAuthenticated) return false;
    if (item.unauthOnly && isAuthenticated) return false;
    return true;
  });

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient background glows */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(139, 92, 246, 0.08) 50%, transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 620,
          width: '100%',
          margin: '0 auto',
          padding: '2.5rem 2rem',
          borderRadius: 24,
          background: 'var(--glass-card, rgba(18, 22, 31, 0.85))',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.08))',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5), 0 0 40px -10px rgba(16, 185, 129, 0.15)',
          textAlign: 'center',
        }}
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#f87171',
            fontSize: '0.8125rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: '1.25rem',
          }}
        >
          <Compass size={15} />
          <span>404 · Destination Not Found</span>
        </motion.div>

        {/* 404 Hero Numeral */}
        <div
          style={{
            fontSize: 'clamp(4.5rem, 12vw, 6.5rem)',
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.05em',
            fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            background: 'linear-gradient(135deg, #10b981 0%, #34d399 35%, #8b5cf6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 10px 25px rgba(16, 185, 129, 0.3))',
            marginBottom: '0.75rem',
          }}
        >
          404
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
            fontWeight: 700,
            color: 'var(--text-primary, #f1f5f9)',
            marginBottom: '0.75rem',
            letterSpacing: '-0.02em',
          }}
        >
          Lost in Financial Space?
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: '0.9375rem',
            color: 'var(--text-secondary, #94a3b8)',
            lineHeight: 1.6,
            maxWidth: 480,
            margin: '0 auto 2rem auto',
          }}
        >
          The page or transaction route you requested does not exist, was moved to a new ledger, or the URL contains a typo.
        </p>

        {/* Main CTA Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            marginBottom: '2.5rem',
          }}
        >
          <Link
            to={isAuthenticated ? '/' : '/login'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 24px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.9375rem',
              textDecoration: 'none',
              boxShadow: '0 8px 20px -6px rgba(16, 185, 129, 0.4)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <LayoutDashboard size={18} />
            <span>{isAuthenticated ? 'Back to Dashboard' : 'Go to Sign In'}</span>
          </Link>

          <button
            type="button"
            onClick={handleGoBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              borderRadius: 12,
              background: 'var(--glass-2, rgba(255, 255, 255, 0.06))',
              color: 'var(--text-primary, #f1f5f9)',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.12))',
              fontWeight: 600,
              fontSize: '0.9375rem',
              cursor: 'pointer',
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
          >
            <ArrowLeft size={18} />
            <span>Go Back</span>
          </button>
        </div>

        {/* Quick Destinations */}
        {visibleLinks.length > 0 && (
          <div
            style={{
              borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              paddingTop: '1.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: '0.8125rem',
                color: 'var(--text-muted, #64748b)',
                marginBottom: '1rem',
                fontWeight: 500,
              }}
            >
              <Sparkles size={14} color="#10b981" />
              <span>Or jump directly to one of these sections:</span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {visibleLinks.map((item) => {
                const IconComponent = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: 'var(--glass-1, rgba(255, 255, 255, 0.03))',
                      border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
                      color: 'var(--text-secondary, #94a3b8)',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      textDecoration: 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <IconComponent size={14} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
