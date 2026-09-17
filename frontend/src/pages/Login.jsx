import React, {
  useState, useContext, useRef, useEffect, useCallback, useMemo,
} from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { AppContext } from '../contexts/AppContext';
import { LANGUAGES } from '../services/i18n';
import {
  KeyRound, Mail, AlertTriangle, Zap, Eye, EyeOff,
  ArrowRight, Shield, Globe, Lock, Smartphone, X,
  Info, CheckCircle2, RefreshCw,
} from 'lucide-react';

/* ============================================================
 * Constants
 * ============================================================ */
const LAST_EMAIL_KEY = 'mcw_last_email';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const MAX_BACKEND_ERROR_LENGTH = 200;
const RATE_LIMIT_DEFAULT_SECONDS = 60;

/* ============================================================
 * Helpers
 * ============================================================ */
const safeReadEmail = () => {
  try { return localStorage.getItem(LAST_EMAIL_KEY) || ''; } catch { return ''; }
};
const safeWriteEmail = (email) => {
  try {
    if (email) localStorage.setItem(LAST_EMAIL_KEY, email);
    else localStorage.removeItem(LAST_EMAIL_KEY);
  } catch { /* ignore */ }
};

const isCancelError = (err) =>
  err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError';

const isRateLimitError = (err) => err?.response?.status === 429;

const getRetryAfterSeconds = (err) => {
  const raw =
    err?.response?.headers?.['retry-after'] ??
    err?.response?.headers?.['Retry-After'] ??
    err?.response?.data?.retryAfter;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : RATE_LIMIT_DEFAULT_SECONDS;
};

const sanitizeBackendMessage = (msg) => {
  if (typeof msg !== 'string') return null;
  const trimmed = msg.trim();
  if (!trimmed || trimmed.length > MAX_BACKEND_ERROR_LENGTH) return null;
  // Reject anything that looks like a stack trace or HTML
  if (/<[a-z]/i.test(trimmed)) return null;
  if (/at \w+ \(/.test(trimmed)) return null;
  return trimmed;
};

/* ============================================================
 * Focus trap for modals
 * ============================================================ */
function useFocusTrap(ref, isActive, onEscape) {
  useEffect(() => {
    if (!isActive || !ref.current) return undefined;
    const node = ref.current;
    const previousActive = document.activeElement;

    const getFocusable = () =>
      Array.from(
        node.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    const focusables = getFocusable();
    if (focusables.length > 0) focusables[0].focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = getFocusable();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !node.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      try { previousActive?.focus?.(); } catch { /* ignore */ }
    };
  }, [ref, isActive, onEscape]);
}

/* ============================================================
 * Main component
 * ============================================================ */
export default function Login() {
  const { login, t, lang = 'en', setLanguage, user } = useContext(AppContext);
  const navigate = useNavigate();
  const location = useLocation();

  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  /* ---------------- Refs ---------------- */
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const forgotModalRef = useRef(null);
  const rateLimitTimerRef = useRef(null);

  /* ---------------- State ---------------- */
  const [email, setEmail] = useState(() => safeReadEmail());
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState(null); // 'credentials' | 'network' | 'rate' | 'unknown'
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  /* ---------------- Redirect if already logged in ---------------- */
  useEffect(() => {
    if (user) {
      const dest = location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    }
  }, [user, navigate, location.state]);

  /* ---------------- Rate limit countdown ---------------- */
  useEffect(() => {
    if (rateLimitSeconds <= 0) {
      if (rateLimitTimerRef.current) {
        clearInterval(rateLimitTimerRef.current);
        rateLimitTimerRef.current = null;
      }
      return undefined;
    }
    if (!rateLimitTimerRef.current) {
      rateLimitTimerRef.current = setInterval(() => {
        setRateLimitSeconds((s) => {
          if (s <= 1) {
            clearInterval(rateLimitTimerRef.current);
            rateLimitTimerRef.current = null;
            setError('');
            setErrorKind(null);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (rateLimitTimerRef.current) {
        clearInterval(rateLimitTimerRef.current);
        rateLimitTimerRef.current = null;
      }
    };
  }, [rateLimitSeconds]);

  /* ---------------- Caps Lock detection ---------------- */
  const handleKeyEvent = useCallback((e) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  }, []);

  /* ---------------- Focus trap on forgot modal ---------------- */
  const closeForgotModal = useCallback(() => setShowForgotHelp(false), []);
  useFocusTrap(forgotModalRef, showForgotHelp, closeForgotModal);

  /* ---------------- Pre-emptive server wake-up ---------------- */
  useEffect(() => {
    // Ping health check to wake up sleeping backends on Render
    api.healthCheck();
  }, []);

  /* ---------------- Autofill synchronization ---------------- */
  useEffect(() => {
    const syncAutofill = () => {
      const domEmail = emailInputRef.current?.value;
      const domPassword = passwordInputRef.current?.value;
      if (domEmail && !email) setEmail(domEmail);
      if (domPassword && !password) setPassword(domPassword);
    };

    // Browsers often fill fields immediately or after a slight delay
    syncAutofill();
    const t1 = setTimeout(syncAutofill, 100);
    const t2 = setTimeout(syncAutofill, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [email, password]);

  /* ============================================================
   * Validation
   * ============================================================ */
  const validateField = useCallback((name, value) => {
    switch (name) {
      case 'email': {
        const v = String(value || '').trim();
        if (!v) return tr('email_required', 'Email is required.');
        if (!EMAIL_REGEX.test(v)) return tr('invalid_email', 'Enter a valid email address.');
        return '';
      }
      case 'password':
        return !value ? tr('password_required', 'Password is required.') : '';
      default:
        return '';
    }
  }, [tr]);

  const validateForm = useCallback((customValues = {}) => {
    const activeEmail = customValues.email !== undefined ? customValues.email : (email || emailInputRef.current?.value || '');
    const activePassword = customValues.password !== undefined ? customValues.password : (password || passwordInputRef.current?.value || '');

    const errors = {};
    const emailErr = validateField('email', activeEmail);
    const pwdErr = validateField('password', activePassword);
    if (emailErr) errors.email = emailErr;
    if (pwdErr) errors.password = pwdErr;
    setFieldErrors(errors);
    return errors;
  }, [email, password, validateField]);

  /* ============================================================
   * Field handlers
   * ============================================================ */
  const handleChange = useCallback((e) => {
    const { name, value, checked } = e.target;
    if (name === 'email') setEmail(value);
    else if (name === 'password') setPassword(value);
    else if (name === 'rememberMe') setRememberMe(checked);

    // Clear the field-level error for this field on change.
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev));
    // Do NOT clear the top-level error on keystroke — it must persist until
    // the next submit attempt so the user actually reads it.
  }, []);

  const handleBlur = useCallback((e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const err = validateField(name, value);
    setFieldErrors((prev) => ({ ...prev, [name]: err }));
  }, [validateField]);

  /* ============================================================
   * Submit
   * ============================================================ */
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (loading || rateLimitSeconds > 0) return;

    setError('');
    setErrorKind(null);

    // Resolve effective values from state or direct DOM inputs (autofill fallback)
    const effectiveEmail = (email || emailInputRef.current?.value || '').trim();
    const effectivePassword = password || passwordInputRef.current?.value || '';

    // If DOM has autofilled values that were not in state, sync them
    if (effectiveEmail && effectiveEmail !== email) setEmail(effectiveEmail);
    if (effectivePassword && effectivePassword !== password) setPassword(effectivePassword);

    const validationErrors = validateForm({ email: effectiveEmail, password: effectivePassword });
    if (Object.keys(validationErrors).length > 0) {
      // Mark all errored fields as touched so messages render.
      setTouched((prev) => {
        const next = { ...prev };
        Object.keys(validationErrors).forEach((k) => { next[k] = true; });
        return next;
      });
      // Focus the first errored field.
      const firstError = Object.keys(validationErrors)[0];
      if (firstError === 'email') emailInputRef.current?.focus();
      else if (firstError === 'password') passwordInputRef.current?.focus();
      return;
    }

    const trimmedEmail = effectiveEmail.toLowerCase();
    setLoading(true);

    try {
      const { token, user: loggedUser } = await api.login({
        email: trimmedEmail,
        password: effectivePassword,
        rememberMe,
      });

      // Persist last-used email for convenience.
      if (rememberMe) safeWriteEmail(trimmedEmail);
      else safeWriteEmail('');

      await login(token, loggedUser, rememberMe);

      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } catch (err) {
      if (isCancelError(err)) return;

      if (isRateLimitError(err)) {
        const wait = getRetryAfterSeconds(err);
        setRateLimitSeconds(wait);
        setErrorKind('rate');
        setError(
          tr('rate_limited', `Too many attempts. Please wait ${wait} seconds before trying again.`)
        );
        return;
      }

      let msg = tr('invalid_credentials', 'Invalid credentials. Please try again.');
      let kind = 'credentials';

      if (err?.response) {
        const backend = sanitizeBackendMessage(err.response?.data?.error);
        if (backend) msg = backend;
      } else if (err?.request || err?.code === 'ERR_NETWORK') {
        msg = tr('server_unreachable', 'Cannot reach the server. Please check your network connection.');
        kind = 'network';
      } else {
        msg = tr('unexpected_error', 'Something went wrong. Please try again.');
        kind = 'unknown';
      }

      setError(msg);
      setErrorKind(kind);
    } finally {
      setLoading(false);
    }
  }, [
    loading, rateLimitSeconds, validateForm, email, password, rememberMe,
    login, navigate, location.state, tr,
  ]);

  /* ============================================================
   * Derived UI state
   * ============================================================ */
  const emailHasError = Boolean(fieldErrors.email && touched.email);
  const passwordHasError = Boolean(fieldErrors.password && touched.password);
  const submitDisabled = loading || rateLimitSeconds > 0;

  const errorIcon = useMemo(() => {
    if (errorKind === 'network') return <Info size={16} aria-hidden="true" />;
    if (errorKind === 'rate') return <RefreshCw size={16} aria-hidden="true" />;
    if (errorKind === 'unknown') return <AlertTriangle size={16} aria-hidden="true" />;
    return <AlertTriangle size={16} aria-hidden="true" />;
  }, [errorKind]);

  /* ============================================================
   * Render
   * ============================================================ */
  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <motion.div
        className="auth-card glass"
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative' }}
      >
        {/* Language selector */}
        <div
          style={{
            position: 'absolute', top: 20, right: 20,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Globe size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          <select
            value={lang}
            onChange={(e) => setLanguage && setLanguage(e.target.value)}
            aria-label={tr('language', 'Language')}
            style={{
              background: 'var(--glass-2)',
              color: 'var(--text-primary)',
              border: '1px solid var(--glass-border)',
              borderRadius: 8,
              padding: '4px 8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {Object.entries(LANGUAGES).map(([code, l]) => (
              <option key={code} value={code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="auth-logo">
          <motion.div
            className="auth-logo-icon"
            whileHover={{ rotate: 20, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 300 }}
            aria-hidden="true"
          >
            <Zap size={26} />
          </motion.div>
          <span className="auth-logo-text">MyCoinwise</span>
        </div>

        <div className="auth-header">
          <h1>{tr('welcome_back_title', 'Welcome back')}</h1>
          <p>{tr('sign_in_to_continue', 'Sign in to your account to continue')}</p>
        </div>

        {/* Top-level error */}
        <AnimatePresence>
          {error && (
            <motion.div
              className={`auth-alert auth-alert-${errorKind || 'default'}`}
              role="alert"
              aria-live="assertive"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              {errorIcon}
              <span style={{ flex: 1 }}>{error}</span>
              {rateLimitSeconds > 0 && (
                <span
                  className="auth-rate-countdown"
                  aria-label={tr('seconds_remaining', `${rateLimitSeconds} seconds remaining`)}
                >
                  {rateLimitSeconds}s
                </span>
              )}
              <button
                type="button"
                onClick={() => { setError(''); setErrorKind(null); }}
                aria-label={tr('dismiss', 'Dismiss')}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'inherit', cursor: 'pointer', padding: 0,
                }}
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {/* Email */}
          <div className={`form-group ${emailHasError ? 'has-error' : ''}`}>
            <label htmlFor="login-email">{tr('email_address', 'Email Address')}</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={17} aria-hidden="true" />
              <input
                ref={emailInputRef}
                id="login-email"
                name="email"
                type="email"
                value={email}
                onChange={handleChange}
                onFocus={() => {
                  if (emailInputRef.current?.value && !email) {
                    setEmail(emailInputRef.current.value);
                  }
                }}
                onBlur={handleBlur}
                required
                autoComplete="email"
                autoFocus
                maxLength={MAX_EMAIL_LENGTH}
                placeholder={tr('email_placeholder', 'you@example.com')}
                disabled={loading || rateLimitSeconds > 0}
                aria-invalid={emailHasError}
                aria-describedby={emailHasError ? 'email-error' : undefined}
              />
            </div>
            {emailHasError && (
              <div id="email-error" className="form-error" role="alert">
                {fieldErrors.email}
              </div>
            )}
          </div>

          {/* Password */}
          <div className={`form-group ${passwordHasError ? 'has-error' : ''}`}>
            <label htmlFor="login-password">{tr('password', 'Password')}</label>
            <div className="input-wrapper">
              <KeyRound className="input-icon" size={17} aria-hidden="true" />
              <input
                ref={passwordInputRef}
                id="login-password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={handleChange}
                onFocus={() => {
                  if (passwordInputRef.current?.value && !password) {
                    setPassword(passwordInputRef.current.value);
                  }
                }}
                onBlur={handleBlur}
                onKeyUp={handleKeyEvent}
                onKeyDown={handleKeyEvent}
                required
                autoComplete="current-password"
                maxLength={MAX_PASSWORD_LENGTH}
                placeholder={tr('password_placeholder', '••••••••')}
                disabled={loading || rateLimitSeconds > 0}
                aria-invalid={passwordHasError}
                aria-describedby={
                  passwordHasError
                    ? 'password-error'
                    : capsLockOn
                      ? 'password-caps-warning'
                      : undefined
                }
              />
              <button
                type="button"
                className="input-suffix-btn"
                onClick={() => setShowPwd((p) => !p)}
                aria-label={
                  showPwd
                    ? tr('hide_password', 'Hide password')
                    : tr('show_password', 'Show password')
                }
                aria-pressed={showPwd}
                disabled={loading}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordHasError && (
              <div id="password-error" className="form-error" role="alert">
                {fieldErrors.password}
              </div>
            )}
            <AnimatePresence>
              {capsLockOn && !passwordHasError && (
                <motion.div
                  id="password-caps-warning"
                  className="form-hint form-hint-warning"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  role="status"
                >
                  <AlertTriangle size={12} aria-hidden="true" />
                  {tr('caps_lock_on', 'Caps Lock is on')}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Remember me + Forgot */}
          <div className="auth-extra-row">
            <label className="checkbox-label" title={tr('remember_me_tooltip', 'Stay signed in on this device for up to 30 days')}>
              <input
                type="checkbox"
                name="rememberMe"
                checked={rememberMe}
                onChange={handleChange}
                disabled={loading || rateLimitSeconds > 0}
              />
              <span>{tr('trust_this_device', 'Trust this device')}</span>
            </label>
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => setShowForgotHelp(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {tr('forgot_password', 'Forgot password?')}
            </button>
          </div>

          {/* Submit */}
          <motion.button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={submitDisabled}
            aria-busy={loading}
            whileHover={submitDisabled ? undefined : { scale: 1.02 }}
            whileTap={submitDisabled ? undefined : { scale: 0.98 }}
          >
            {loading ? (
              <motion.span
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <RefreshCw size={16} className="spin" aria-hidden="true" />
                {tr('authenticating', 'Authenticating…')}
              </motion.span>
            ) : rateLimitSeconds > 0 ? (
              <>
                {tr('please_wait', 'Please wait')} ({rateLimitSeconds}s)
              </>
            ) : (
              <>
                {tr('log_in', 'Log In')}
                <ArrowRight size={16} style={{ marginLeft: 6 }} aria-hidden="true" />
              </>
            )}
          </motion.button>

          {/* Two-factor hint (rendered when backend signals it) */}
          {errorKind === 'credentials' && error && (
            <p className="auth-2fa-hint" role="note">
              <Smartphone size={13} aria-hidden="true" />
              {tr('two_factor_hint', 'Have 2FA enabled? Enter the code from your authenticator app after your password.')}
            </p>
          )}
        </form>

        <div className="auth-divider">
          <span>{tr('new_to_mycoinwise', 'New to MyCoinwise?')}</span>
        </div>

        <div className="auth-footer">
          <Link
            to="/register"
            className="auth-alt-btn"
            aria-disabled={loading}
            tabIndex={loading ? -1 : 0}
            onClick={(e) => { if (loading) e.preventDefault(); }}
          >
            {tr('create_free_account', 'Create a free account')}
          </Link>
        </div>

        <div className="auth-secure-note">
          <Shield size={12} aria-hidden="true" />
          <span>{tr('encryption_badge', '256-bit encrypted · JWT session tokens')}</span>
        </div>
      </motion.div>

      {/* Forgot Password modal */}
      <AnimatePresence>
        {showForgotHelp && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeForgotModal}
            style={{ zIndex: 1000 }}
          >
            <motion.div
              ref={forgotModalRef}
              className="modal-box glass"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="forgot-modal-title"
              aria-describedby="forgot-modal-desc"
              style={{ maxWidth: 440, padding: 24, textAlign: 'center' }}
            >
              <div
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(5,150,105,0.15)', color: '#10b981',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
                aria-hidden="true"
              >
                <Lock size={24} />
              </div>
              <h3 id="forgot-modal-title" style={{ margin: '0 0 8px', fontSize: '1.2rem' }}>
                {tr('forgot_password_modal_title', 'Password Reset Help')}
              </h3>
              <p
                id="forgot-modal-desc"
                style={{
                  color: 'var(--text-muted)', fontSize: '0.9rem',
                  lineHeight: 1.5, margin: '0 0 20px',
                }}
              >
                {tr(
                  'forgot_password_modal_desc',
                  'To reset or update your password, log into your account and open Settings > Security, or reach out to your household account administrator.'
                )}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={closeForgotModal}
                style={{ width: '100%' }}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                {tr('close', 'Got it')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .auth-alert-${'rate'} { border-left: 3px solid #f59e0b; }
        .auth-alert-network { border-left: 3px solid #3b82f6; }
        .auth-alert-unknown { border-left: 3px solid #ef4444; }
        .auth-rate-countdown {
          font-variant-numeric: tabular-nums;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(245,158,11,0.2);
          font-size: 0.78rem;
        }
        .auth-2fa-hint {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 10px;
        }
        .form-hint-warning {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--warning-color, #f59e0b);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}