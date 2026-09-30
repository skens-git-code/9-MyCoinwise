import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary, #090d16)',
        color: 'var(--text-primary, #f1f5f9)',
        padding: '2.5rem 1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-10%',
          right: '15%',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(139, 92, 246, 0.04) 50%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ maxWidth: 860, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Navigation Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '2.5rem',
            paddingBottom: '1.25rem',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              }}
            >
              <Zap size={20} />
            </div>
            <span
              style={{
                fontWeight: 700,
                fontSize: '1.25rem',
                fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
                letterSpacing: '-0.02em',
              }}
            >
              MyCoinwise
            </span>
          </div>

          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 10,
              background: 'var(--glass-2, rgba(255, 255, 255, 0.06))',
              color: 'var(--text-secondary, #94a3b8)',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.1))',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </div>

        {/* Header */}
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
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              color: '#34d399',
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
              fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            }}
          >
            Terms & Conditions
          </h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
            Effective Date: September 2026 · Version 2.0
          </p>
        </motion.div>

        {/* Content Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          style={{
            background: 'var(--glass-card, rgba(18, 22, 31, 0.8))',
            borderRadius: 20,
            border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.08))',
            padding: '2.5rem',
            boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
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
                color: 'var(--text-primary, #f1f5f9)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <FileText size={18} color="#10b981" />
              1. Acceptance of Terms
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
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
                color: 'var(--text-primary, #f1f5f9)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ShieldCheck size={18} color="#10b981" />
              2. Account Responsibilities & Security
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
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
                color: 'var(--text-primary, #f1f5f9)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={18} color="#f59e0b" />
              3. Financial Disclaimer (Not Investment Advice)
            </h2>
            <div
              style={{
                padding: '1rem 1.25rem',
                borderRadius: 12,
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: '0.875rem',
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
                color: 'var(--text-primary, #f1f5f9)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Lock size={18} color="#10b981" />
              4. User Data Ownership & Export
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
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
                color: 'var(--text-primary, #f1f5f9)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <HelpCircle size={18} color="#10b981" />
              5. Contact & Inquiries
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
              If you have any questions or concerns regarding these Terms, please reach out to us at{' '}
              <a
                href="mailto:skens.code@gmail.com"
                style={{ color: '#10b981', textDecoration: 'underline' }}
              >
                skens.code@gmail.com
              </a>{' '}
              or visit our{' '}
              <Link to="/about" style={{ color: '#10b981', textDecoration: 'underline' }}>
                About Page
              </Link>.
            </p>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
