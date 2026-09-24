/* —————————————————————————————————————
 * Login Page
 * Authentication screen with email/password, remember-device,
 * caps-lock detection, rate-limit countdown, forgot-password help
 * modal, and a server warm-up banner for cold-start backends.
 *
 * Key behaviors:
 *   - Rate-limit cooldown disables the submit button until it elapses.
 *   - Caps Lock state is surfaced under the password field.
 *   - Email autofill is synced DOM → state once on mount only, to
 *     avoid racing user input.
 *   - Backend warm-up health check gates the submit button so users
 *     don't fire a login against a sleeping server.
 *   - Redirects to `location.state.from` (or `/`) when already signed in.
 * ————————————————————————————————————— */

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

// ── localStorage key for the last-used email ──
const LAST_EMAIL_KEY = 'mcw_last_email';

// ── Validation and safety bounds ──
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const MAX_BACKEND_ERROR_LENGTH = 200;

// ── Default rate-limit cooldown when the server sends no header ──
const RATE_LIMIT_DEFAULT_SECONDS = 60;

/* ============================================================
 * Helpers
 * ============================================================ */

// ── Read the last-used email from localStorage (best-effort) ──
const safeReadEmail = () => {
  try { return localStorage.getItem(LAST_EMAIL_KEY) || ''; } catch { return ''; }
};

// ── Persist or clear the last-used email ──
const safeWriteEmail = (email) => {
  try {
    if (email) localStorage.setItem(LAST_EMAIL_KEY, email);
    else localStorage.removeItem(LAST_EMAIL_KEY);
  } catch { /* ignore */ }
};

// ── True when the error is an aborted/canceled request ──
const isCancelError = (err) =>
  err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError';

// ── True when the server responded with 429 ──
const isRateLimitError = (err) => err?.response?.status === 429;

// ── Resolve Retry-After seconds from a 429 response ──
const getRetryAfterSeconds = (err) => {
  const raw =
    err?.response?.headers?.['retry-after'] ??
    err?.response?.headers?.['Retry-After'] ??
    err?.response?.data?.retryAfter;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : RATE_LIMIT_DEFAULT_SECONDS;
};

// ── Sanitize a backend error string before showing it ──
// Rejects HTML tags and stack-trace-like content to avoid leaking internals.
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

    // ── Query visible focusable elements inside the modal ──
    const getFocusable = () =>
      Array.from(
        node.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    // ── Initial focus ──
    const focusables = getFocusable();
    if (focusables.length > 0) focusables[0].focus();

    // ── Escape closes; Tab cycles within the modal ──
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
 * Main Component
 * ============================================================ */
export default function Login() {
  // ── App context + router ──
  const { login, t, lang = 'en', setLanguage, user } = useContext(AppContext);
  const navigate = useNavigate();
  const location = useLocation();

  // ── Translation helper with inline fallback ──
  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  /* ---------------- Refs ---------------- */

  // ── Form input + modal refs ──
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const forgotModalRef = useRef(null);
  const rateLimitTimerRef = useRef(null);

  /* ---------------- State ---------------- */

  // ── Form fields ──
  const [email, setEmail] = useState(() => safeReadEmail());
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // ── Top-level error and its kind ──
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState(null); // 'credentials' | 'network' | 'rate' | 'unknown'

  // ── Loading + validation state ──
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

  // ── Caps Lock warning + forgot-password modal ──
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);

  // ── Rate-limit cooldown countdown ──
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  // [FIX] Track whether the backend health-check has returned successfully.
  // null = pending (still checking), true = server is awake, false = timed-out.
  // This drives the warm-up banner so users know why a first login attempt
  // can take a moment (Render.com free tier sleeps between requests).
  const [serverWarm, setServerWarm] = useState(null);

  /* ---------------- Redirect if already logged in ---------------- */
  useEffect(() => {
    if (user) {
      const dest = location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    }
  }, [user, navigate, location.state]);

  /* ---------------- Rate-Limit Countdown ---------------- */
  // Drives the "wait Ns" indicator and re-enables the submit button
  // when the cooldown expires.
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

  /* ---------------- Caps Lock Detection ---------------- */
  const handleKeyEvent = useCallback((e) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  }, []);

  /* ---------------- Focus Trap on Forgot Modal ---------------- */
  const closeForgotModal = useCallback(() => setShowForgotHelp(false), []);
  useFocusTrap(forgotModalRef, showForgotHelp, closeForgotModal);

  /* ---------------- Pre-emptive Server Wake-Up ---------------- */
  useEffect(() => {
    // [FIX] Fire the health-check and track its result so the UI can show a
    // "server is warming up" banner while Render.com cold-starts the backend.
    // This prevents users from seeing a confusing first-attempt failure with no
    // explanation. Health check has its own 15 s timeout (see api.js).
    setServerWarm(null); // pending
    try {
      const p = api?.healthCheck?.();
      if (p && typeof p.then === 'function') {
        p.then((result) => {
          setServerWarm(result !== null);
        }).catch(() => {
          setServerWarm(false);
        });
      } else {
        setServerWarm(true);
      }
    } catch {
      setServerWarm(true);
    }
  }, []);

  /* ---------------- Autofill Synchronization ---------------- */
  // [FIX] Run only on mount (empty deps). Previously had [email, password] as deps
  // which caused the effect to re-fire on every keystroke, creating a race where
  // an empty DOM value (momentarily empty during React render) would overwrite a
  // correctly-entered password on first submit attempt.
  useEffect(() => {
    // ── Copy DOM autofill values into state when state is still empty ──
    const syncAutofill = () => {
      const domEmail = emailInputRef.current?.value;
      const domPassword = passwordInputRef.current?.value;
      // Only sync from DOM → state when state is empty; never overwrite user input.
      setEmail((prev) => (!prev && domEmail ? domEmail : prev));
      setPassword((prev) => (!prev && domPassword ? domPassword : prev));
    };

    // Browsers often fill fields immediately or after a slight delay
    syncAutofill();
    const t1 = setTimeout(syncAutofill, 100);
    const t2 = setTimeout(syncAutofill, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []); // mount-only: intentionally omits [email, password] to avoid autofill race

  /* ============================================================
   * Validation
   * ============================================================ */

  // ── Validate a single field and return its error string ──
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

  // ── Validate the whole form, storing errors in state ──
  // `customValues` overrides state, used when submitting with DOM-autofilled input.
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
   * Field Handlers
   * ============================================================ */

  // ── Update a field; clear its field-level error ──
  // The top-level error is intentionally NOT cleared on keystroke.
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

  // ── Mark field as touched and validate on blur ──
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

    // ── Validate; focus the first errored field on failure ──
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
      // ── Call the API and complete the login ──
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

      // ── Rate limit: start the cooldown and show the message ──
      if (isRateLimitError(err)) {
        const wait = getRetryAfterSeconds(err);
        setRateLimitSeconds(wait);
        setErrorKind('rate');
        setError(
          tr('rate_limited', `Too many attempts. Please wait ${wait} seconds before trying again.`)
        );
        return;
      }

      // ── Map the failure to a user-facing message and kind ──
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
   * Derived UI State
   * ============================================================ */

  // ── Field-level error visibility ──
  const emailHasError = Boolean(fieldErrors.email && touched.email);
  const passwordHasError = Boolean(fieldErrors.password && touched.password);

  // Submit is enabled immediately without waiting for background health check.
  // Health check runs in the background to warm up connections, without gating the user.
  const submitDisabled = loading || rateLimitSeconds > 0;

  // ── Icon shown next to the top-level error, by kind ──
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
      {/* ── Ambient background orbs ── */}
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
        {/* ===================== Language Selector ===================== */}
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

        {/* ===================== Brand + Header ===================== */}
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

        {/* ===================== Server Connectivity Notice ===================== */}
        {/* Subtle notice ONLY shown if the backend health check failed or timed out.
            Login remains active so the user is never artificially blocked. */}
        <AnimatePresence>
          {serverWarm === false && !error && (
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '0.80rem', padding: '8px 12px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.22)',
                borderRadius: 10, color: 'var(--text-secondary)',
                marginBottom: '0.75rem',
              }}
            >
              <AlertTriangle size={13} aria-hidden="true" style={{ color: '#f59e0b' }} />
              <span>{tr('server_slow', 'Server may be slow. Login might take a moment.')}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===================== Top-Level Error ===================== */}
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
              {/* ── Rate-limit countdown badge ── */}
              {rateLimitSeconds > 0 && (
                <span
                  className="auth-rate-countdown"
                  aria-label={tr('seconds_remaining', `${rateLimitSeconds} seconds remaining`)}
                >
                  {rateLimitSeconds}s
                </span>
              )}
              {/* ── Manual dismiss ── */}
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

        {/* ===================== Form ===================== */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {/* ── Email field ── */}
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
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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

          {/* ── Password field ── */}
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
              {/* ── Show / hide toggle ── */}
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
            {/* ── Caps Lock hint (hidden when a password error is visible) ── */}
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

          {/* ── Remember me + Forgot ── */}
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

          {/* ── Submit button (label varies by state) ── */}
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

          {/* ── 2FA hint (only after credential error) ── */}
          {errorKind === 'credentials' && error && (
            <p className="auth-2fa-hint" role="note">
              <Smartphone size={13} aria-hidden="true" />
              {tr('two_factor_hint', 'Have 2FA enabled? Enter the code from your authenticator app after your password.')}
            </p>
          )}
        </form>

        {/* ===================== Footer ===================== */}
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

        {/* ── Trust badge ── */}
        <div className="auth-secure-note">
          <Shield size={12} aria-hidden="true" />
          <span>{tr('encryption_badge', '256-bit encrypted · JWT session tokens')}</span>
        </div>
      </motion.div>

      {/* ===================== Forgot Password Modal ===================== */}
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
              {/* ── Lock icon badge ── */}
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
              {/* ── Close button ── */}
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

      {/* ── Local styles for spin animation and alert variants ── */}
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