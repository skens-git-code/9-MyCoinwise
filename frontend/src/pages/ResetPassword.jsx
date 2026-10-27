/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, Eye, EyeOff, AlertTriangle, CheckCircle2, Shield, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ToastProvider';
import { CoinwiseMark } from '../components/CoinwiseBrand';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { AppActionsContext } from '../contexts/AppContext';

// ── Common-password blocklist used by strength scorer & submit validation ──
export const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'password123!', '12345678', '123456789',
  'qwerty123', 'qwertyuiop', 'letmein', 'welcome1', 'admin123',
  'iloveyou', 'monkey123', 'dragon123', 'abc123456', 'password!',
  'welcome123', 'passw0rd', 'p@ssw0rd', 'qwerty!23', 'trustno1',
  'password123!', 'p@ssword123',
]);

export const COMMON_PATTERNS = [
  /^password/i,
  /^123456/,
  /^qwerty/i,
  /^admin/i,
  /^(.)\1+$/,
  /^(012|123|234|345|456|567|678|789|890){2,}/,
];

export const isCommonPassword = (pwd) => {
  if (!pwd || typeof pwd !== 'string') return false;
  const lower = pwd.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return true;
  if (/^(.)\1{3,}$/.test(pwd)) return true; // 4+ repeated chars
  return COMMON_PATTERNS.some((pattern) => pattern.test(lower));
};

// ── Valid reset tokens are 64 hexadecimal characters (generated via crypto.randomBytes(32).toString('hex')) ──
export const isValidTokenShape = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/i.test(t.trim());

// ── Align visual indicator with the actual submit validation rules ──
export const scorePassword = (pwd) => {
  if (!pwd) return null;
  if (isCommonPassword(pwd)) return 'weak';

  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pwd)) score += 1;

  // The visual strength meter must not claim "strong" or "fair" if hard requirements fail
  const meetsAll =
    pwd.length >= 8 &&
    pwd.length <= 72 &&
    /[a-z]/.test(pwd) &&
    /[A-Z]/.test(pwd) &&
    /\d/.test(pwd) &&
    /[^a-zA-Z0-9]/.test(pwd);

  return meetsAll ? (score >= 5 ? 'strong' : 'fair') : 'weak';
};

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const actions = useContext(AppActionsContext);
  const t = actions?.t;
  const prefersReducedMotion = usePrefersReducedMotion();

  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() =>
    !isValidTokenShape(token)
      ? 'This reset link is invalid or incomplete. Please request a new one.'
      : ''
  );
  const [done, setDone] = useState(false);

  const redirectTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const successRef = useRef(null);
  const passwordInputRef = useRef(null);

  const pwdStrength = scorePassword(password);
  const strengthColor = { weak: '#ef4444', fair: '#f59e0b', strong: '#10b981' };
  const strengthWidth = { weak: '33%', fair: '66%', strong: '100%' };

  /* ---------------- Lifetime & Cleanup ---------------- */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  /* ---------------- Dynamic Viewport & Virtual Keyboard Scrolling ---------------- */
  useEffect(() => {
    document.documentElement.classList.add('auth-viewport-scrollable');
    document.body.classList.add('auth-viewport-scrollable');
    return () => {
      document.documentElement.classList.remove('auth-viewport-scrollable');
      document.body.classList.remove('auth-viewport-scrollable');
    };
  }, []);

  /* ---------------- Focus Timing vs Animation ---------------- */
  useEffect(() => {
    if (isValidTokenShape(token) && !done) {
      const timer = setTimeout(() => {
        passwordInputRef.current?.focus();
      }, prefersReducedMotion ? 50 : 350);
      return () => clearTimeout(timer);
    }
  }, [token, done, prefersReducedMotion]);

  /* ---------------- Accessibility: Focus Confirmation on Success ---------------- */
  useEffect(() => {
    if (done) {
      successRef.current?.focus();
    }
  }, [done]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isValidTokenShape(token)) {
      setError('This reset link is invalid or incomplete. Please request a new one.');
      return;
    }
    if (!password) {
      setError('Please enter a new password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError('Password is too long (maximum 72 characters).');
      return;
    }
    if (!/[a-z]/.test(password)) {
      setError('Password must contain at least one lowercase letter.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter.');
      return;
    }
    if (!/\d/.test(password)) {
      setError('Password must contain at least one digit.');
      return;
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      setError('Password must contain at least one special character.');
      return;
    }
    if (isCommonPassword(password)) {
      setError('This password is too common or easily guessed. Please choose a more secure password.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword({ token, newPassword: password });
      if (!isMountedRef.current) return;
      setDone(true);
      showToast('success', 'Password reset! Redirecting to login…');
      redirectTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          navigate('/login', { replace: true });
        }
      }, 2200);
    } catch (err) {
      if (!isMountedRef.current) return;
      const status = err.response?.status;
      const serverMsg =
        err.response?.data?.errors?.[0]?.msg ||
        err.response?.data?.error ||
        err.response?.data?.message;

      if (status === 410) {
        setError('This reset link has expired. Please request a new one.');
      } else if (status === 400 && serverMsg) {
        setError(serverMsg);
      } else if (status >= 500) {
        setError('A server error occurred. Please try again in a moment.');
      } else {
        setError(serverMsg || 'Could not reset your password. The link may have expired or is invalid.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
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
        initial={prefersReducedMotion ? false : { opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="auth-logo">
          <motion.div
            className="auth-logo-icon"
            whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <CoinwiseMark size={24} />
          </motion.div>
          <span className="auth-logo-text">MyCoinwise</span>
        </div>

        <div className="auth-header">
          <h1>Set a new password</h1>
          <p>Choose a strong password you haven&rsquo;t used before.</p>
        </div>

        {!isValidTokenShape(token) ? (
          <motion.div
            role="alert"
            aria-live="polite"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', padding: '16px 8px 8px' }}
          >
            <AlertTriangle size={48} style={{ color: 'var(--danger, #ef4444)', marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontWeight: 800 }}>Invalid reset link</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 20px' }}>
              This reset link is invalid or incomplete. Please request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
            >
              Request a new link <ArrowRight size={16} />
            </Link>
          </motion.div>
        ) : done ? (
          <motion.div
            ref={successRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', padding: '16px 8px 8px', outline: 'none' }}
          >
            <CheckCircle2 size={48} style={{ color: 'var(--success, #10b981)', marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontWeight: 800 }}>Password updated</h3>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 20px', fontSize: '0.9rem' }}>
              Redirecting you to login…
            </p>
            <Link
              to="/login"
              replace
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
            >
              Continue to login <ArrowRight size={16} />
            </Link>
          </motion.div>
        ) : (
          <>
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key={error}
                  className="auth-alert"
                  role="alert"
                  aria-live="polite"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
                >
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <div className="form-group">
                <label htmlFor="rp-password">New Password</label>
                <div className="input-wrapper">
                  <KeyRound className="input-icon" size={17} />
                  <input
                    ref={passwordInputRef}
                    id="rp-password"
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
                  />
                  <button
                    type="button"
                    className="input-suffix-btn"
                    onClick={() => setShowPwd((p) => !p)}
                    aria-label={showPwd ? 'Hide passwords' : 'Show passwords'}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {pwdStrength && (
                  <div
                    role="progressbar"
                    aria-valuenow={pwdStrength === 'weak' ? 33 : pwdStrength === 'fair' ? 66 : 100}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuetext={`Password strength: ${pwdStrength}`}
                    style={{ marginTop: 8 }}
                  >
                    <div className="pwd-strength-bar">
                      <motion.div
                        className="pwd-strength-fill"
                        initial={prefersReducedMotion ? false : { width: 0 }}
                        animate={{ width: strengthWidth[pwdStrength], background: strengthColor[pwdStrength] }}
                        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
                      />
                    </div>
                    <small className="form-hint" style={{ color: strengthColor[pwdStrength] }} aria-live="polite">
                      {t?.('password_strength') || 'Password strength'}: {t?.(`strength_${pwdStrength}`) || pwdStrength}
                    </small>
                  </div>
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
                    maxLength={72}
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
                whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
              >
                {loading ? (
                  <motion.span
                    animate={prefersReducedMotion ? undefined : { opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
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
          </>
        )}

        <div className="auth-secure-note">
          <Shield size={12} />
          <span>Token hashed · single-use · 60-minute expiry</span>
        </div>
      </motion.div>
    </div>
  );
}

