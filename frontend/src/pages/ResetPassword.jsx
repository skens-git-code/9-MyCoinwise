import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, Eye, EyeOff, AlertTriangle, Zap, CheckCircle2, Shield, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ToastProvider';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const pwdStrength = password.length === 0
    ? null
    : password.length < 8
      ? 'weak'
      : password.length < 12
        ? 'fair'
        : 'strong';

  const strengthColor = { weak: '#ef4444', fair: '#f59e0b', strong: '#10b981' };
  const strengthWidth = { weak: '33%', fair: '66%', strong: '100%' };

  useEffect(() => {
    if (!token || token.length < 32) {
      setError('This reset link is invalid or incomplete. Please request a new one.');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Missing reset token.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword({ token, newPassword: password });
      setDone(true);
      showToast('success', 'Password reset! Redirecting to login…');
      setTimeout(() => navigate('/login', { replace: true }), 2200);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Could not reset your password. The link may have expired.'
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
          <h1>Set a new password</h1>
          <p>Choose a strong password you haven&rsquo;t used before.</p>
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

        {done ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', padding: '16px 8px 8px' }}>
            <CheckCircle2 size={48} style={{ color: 'var(--success, #10b981)', marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontWeight: 800 }}>Password updated</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
              Redirecting you to login…
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="rp-password">New Password</label>
              <div className="input-wrapper">
                <KeyRound className="input-icon" size={17} />
                <input
                  id="rp-password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  autoFocus
                />
                <button
                  type="button"
                  className="input-suffix-btn"
                  onClick={() => setShowPwd(p => !p)}
                  tabIndex={-1}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {pwdStrength && (
                <>
                  <div className="pwd-strength-bar">
                    <motion.div
                      className="pwd-strength-fill"
                      initial={{ width: 0 }}
                      animate={{ width: strengthWidth[pwdStrength], background: strengthColor[pwdStrength] }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <small className="form-hint" style={{ color: strengthColor[pwdStrength] }}>
                    Password strength: {pwdStrength}
                  </small>
                </>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="rp-confirm">Confirm Password</label>
              <div className="input-wrapper">
                <KeyRound className="input-icon" size={17} />
                <input
                  id="rp-confirm"
                  type={showPwd ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                />
              </div>
              {confirm && password !== confirm && (
                <small className="form-hint" style={{ color: '#ef4444' }}>
                  Passwords do not match
                </small>
              )}
            </div>

            <motion.button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={loading || !token}
              aria-busy={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                  Updating…
                </motion.span>
              ) : (
                <>
                  Reset password <ArrowRight size={16} style={{ marginLeft: 6 }} />
                </>
              )}
            </motion.button>

            <div className="auth-footer" style={{ marginTop: 24 }}>
              <Link to="/forgot-password" className="auth-alt-btn">
                Request a new link
              </Link>
            </div>
          </form>
        )}

        <div className="auth-secure-note">
          <Shield size={12} />
          <span>Token hashed · single-use · 60-minute expiry</span>
        </div>
      </motion.div>
    </div>
  );
}
