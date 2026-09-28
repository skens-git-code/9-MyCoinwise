import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle2, AlertTriangle, Zap, Send } from 'lucide-react';
import { api } from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await api.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      // Backend always returns 200; network failures hit here
      setError(
        err.response?.data?.error ||
        'Could not reach the server. Please check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <motion.div
        className="auth-card glass"
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="auth-logo">
          <motion.div
            className="auth-logo-icon"
            whileHover={{ rotate: 20, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <Zap size={26} />
          </motion.div>
          <span className="auth-logo-text">MyCoinwise</span>
        </div>

        <div className="auth-header">
          <h1>Forgot password?</h1>
          <p>Enter your email and we&rsquo;ll send you a reset link.</p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              className="auth-alert"
              role="alert"
              aria-live="polite"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <AlertTriangle size={16} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {sent ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', padding: '16px 8px 8px' }}
          >
            <CheckCircle2 size={48} style={{ color: 'var(--success, #10b981)', marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontWeight: 800 }}>Check your inbox</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
              If an account with <strong>{email}</strong> exists, a reset link has been sent.
              It expires in 60 minutes.
            </p>
            <Link
              to="/login"
              className="auth-alt-btn"
              style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={14} /> Back to login
            </Link>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="fp-email">Email Address</label>
              <div className="input-wrapper">
                <Mail className="input-icon" size={17} />
                <input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  autoFocus
                />
              </div>
            </div>

            <motion.button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={loading}
              aria-busy={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                  Sending…
                </motion.span>
              ) : (
                <>
                  Send reset link <Send size={16} style={{ marginLeft: 6 }} />
                </>
              )}
            </motion.button>
          </form>
        )}

        {!sent && (
          <div className="auth-footer" style={{ marginTop: 24 }}>
            <Link to="/login" className="auth-alt-btn">
              <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back to login
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
