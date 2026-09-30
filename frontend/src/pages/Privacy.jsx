import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';

export default function Privacy() {
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
          left: '15%',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, rgba(16, 185, 129, 0.04) 50%, transparent 70%)',
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
              background: 'rgba(139, 92, 246, 0.12)',
              border: '1px solid rgba(139, 92, 246, 0.28)',
              color: '#a78bfa',
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
              fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            }}
          >
            Privacy Policy
          </h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
            Effective Date: September 2026 · Committed to zero data selling and complete encryption.
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
              <EyeOff size={18} color="#10b981" />
              1. Zero Ad Tracking & Zero Data Selling
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
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
                color: 'var(--text-primary, #f1f5f9)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Lock size={18} color="#10b981" />
              2. Data We Collect & Store
            </h2>
            <ul
              style={{
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: '0.9375rem',
                paddingLeft: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <li>
                <strong>Account Credentials:</strong> Email address, username, securely hashed password (via bcrypt
                cost factor 10), and optional profile customizations (color and avatar).
              </li>
              <li>
                <strong>Financial Ledger Data:</strong> Transactions, account names, category mappings, savings goals,
                and recurring subscriptions created manually or imported by you.
              </li>
              <li>
                <strong>Session Metadata:</strong> IP address, device type, user agent string, and login timestamps to
                enable multi-device session inspection and instant remote logout in your Security Settings.
              </li>
            </ul>
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
              <Server size={18} color="#10b981" />
              3. Encryption & Infrastructure Security
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
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
                color: 'var(--text-primary, #f1f5f9)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Trash2 size={18} color="#ef4444" />
              4. Right to Deletion & Data Portability
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
              In compliance with global data protection standards (GDPR, CCPA), you hold the right to export your complete
              history at any time, or permanently delete all transactions and account records. Account deletion instantly
              revokes all active tokens, removes database records, and invalidates cached data.
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
              <Mail size={18} color="#10b981" />
              5. Privacy Questions
            </h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.9375rem' }}>
              For data privacy inquiries, please contact our privacy officer at{' '}
              <a
                href="mailto:skens.code@gmail.com"
                style={{ color: '#10b981', textDecoration: 'underline' }}
              >
                skens.code@gmail.com
              </a>.
            </p>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
