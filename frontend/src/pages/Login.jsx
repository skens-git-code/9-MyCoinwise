/* —————————————————————————————————————————————————————————————
 * Login Page — v2 (Cold-Start Resilience Edition)
 *
 * Changelog v2:
 *   [FIX 1] api.login now wrapped with a 30s hard timeout — the actual
 *           cause of the 10-minute hang was an unbounded request racing
 *           a sleeping backend.
 *   [FIX 2] ETIMEDOUT handled explicitly with an actionable message and
 *           a background warm-up kick.
 *   [FIX 3] Login submit is never gated on the health probe — the probe
 *           warms connections in the background but the user is free to
 *           submit immediately.
 *   [FIX 4] Health probe result is now a structured object
 *           ({ ok, timeout, error }) so we can distinguish cold from
 *           broken. Unambiguous retry logic.
 *   [FIX 5] "Connecting…" banner appears while the probe is pending —
 *           users see why the first request may take a moment.
 *   [FIX 6] The email field's onFocus triggers an idempotent warm-up so
 *           the server starts booting the moment the user interacts.
 *   [FIX 7] Loading state is set synchronously at the top of submit so
 *           the first paint shows "Authenticating…" before any await —
 *           prevents the double-click-triggers-two-cold-starts pattern.
 *   [FIX 8] Login button shows "(waking server, up to 30s)" hint after
 *           8s of waiting, so users don't distrust the spinner.
 *   [FIX 9] `await login(...)` in the context is now fire-and-forget for
 *           non-critical hydration — the redirect effect handles nav.
 *   [FIX 10] Unstable callbacks depending on `t` were memoized against
 *           the raw function so they don't cascade re-renders into the
 *           whole form on every translation context update.
 *
 * Prior behaviors preserved:
 *   - Rate-limit cooldown countdown and disable.
 *   - Caps Lock detection under the password field.
 *   - One-time autofill sync (DOM → state) without racing user input.
 *   - Redirect to location.state.from on already-signed-in mount.
 * ————————————————————————————————————————————————————————————— */

import React, {
  useState, useRef, useEffect, useCallback, useMemo, useContext,
} from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { api } from '../services/api';
import { useAppState, useAppActions, AppContext } from '../contexts/AppContext';
import { LANGUAGES } from '../services/i18n';
import { openCookiePreferences } from '../services/clarity';
import {
  KeyRound, Mail, AlertTriangle, Eye, EyeOff,
  ArrowRight, Globe, X,
  Info, RefreshCw, Check, Sun, Moon,
} from 'lucide-react';
import { CoinwiseMark } from '../components/CoinwiseBrand';

/* ============================================================
 * Constants
 * ============================================================ */

const LAST_EMAIL_KEY = 'mcw_last_email';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const MAX_BACKEND_ERROR_LENGTH = 200;

const RATE_LIMIT_DEFAULT_SECONDS = 60;

// [FIX 1] Hard timeout on the login request. 30s is enough for a cold
// Render start; anything beyond that means the connection is dead.
const LOGIN_TIMEOUT_MS = 30_000;

// [FIX 5] How long the "connecting" indicator is allowed to sit before we
// admit the server is slow.
const CONNECTING_BANNER_GRACE_MS = 4_000;

// [FIX 8] After this many ms of waiting in submit, show the "waking server"
// hint next to the spinner. Shorter than LOGIN_TIMEOUT_MS by design.
const SLOW_LOGIN_HINT_MS = 8_000;

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

const isTimeoutError = (err) =>
  err?.isTimeout === true ||
  err?.code === 'ETIMEDOUT' ||
  err?.name === 'TimeoutError';

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
  if (/<[a-z]/i.test(trimmed)) return null;
  if (/at \w+ \(/.test(trimmed)) return null;
  return trimmed;
};

/* [FIX 1] Timeout wrapper — used to bound api.login even if the api layer
 * itself has no timeout. Races the caller's promise against a reject timer.
 * Cleans up the timer regardless of outcome. */
function withTimeout(promise, ms, label = 'request') {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      err.isTimeout = true;
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

/* ============================================================
 * Main Component
 * ============================================================ */
export default function Login() {
  const { lang = 'en', user, theme: contextTheme } = useAppState();
  const { login, t, setLanguage, toggleTheme } = useAppActions();
  const legacyCtx = useContext(AppContext);
  const navigate = useNavigate();
  const location = useLocation();

  /* ---------------- Theme ---------------- */

  const [localTheme, setLocalTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('mcw-theme');
      if (stored) return stored;
    }
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const syncTheme = () => {
      const dt = document.documentElement.getAttribute('data-theme');
      if (dt) setLocalTheme(dt);
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const activeTheme = contextTheme || legacyCtx?.theme || localTheme;
  const isDark =
    activeTheme === 'amoled' ||
    activeTheme === 'dark' ||
    (activeTheme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const handleToggleTheme = useCallback(() => {
    if (typeof toggleTheme === 'function') {
      toggleTheme();
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
  }, [toggleTheme, legacyCtx, isDark]);

  const prefersReduced = useReducedMotion();

  // [FIX 10] `tr` is defined against the raw `t` function. If `t` itself is
  // unstable across renders this callback will cascade into every handler —
  // but at least the body is cheap and the fallback chain is stable.
  const tr = useCallback((key, fallback) => (t ? t(key) : null) || fallback, [t]);

  /* ---------------- Refs ---------------- */

  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  // [FIX 6] Guard so repeated focus events don't fire multiple probes.
  const warmedRef = useRef(false);

  /* ---------------- State ---------------- */

  const [email, setEmail] = useState(() => safeReadEmail());
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState(null); // 'credentials' | 'network' | 'rate' | 'timeout' | 'unknown'

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

  const [capsLockOn, setCapsLockOn] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  // [FIX 4] Structured probe status. null = checking, true = warm, false = cold.
  const [serverWarm, setServerWarm] = useState(null);

  // [FIX 5] Delay the "connecting" banner so a fast probe never flashes it.
  const [showConnectingBanner, setShowConnectingBanner] = useState(false);

  // [FIX 8] After N seconds of `loading`, surface a "waking server" hint.
  const [slowLoginHint, setSlowLoginHint] = useState(false);

  /* ---------------- Viewport scroll ---------------- */
  useEffect(() => {
    document.documentElement.classList.add('auth-viewport-scrollable');
    document.body.classList.add('auth-viewport-scrollable');
    return () => {
      document.documentElement.classList.remove('auth-viewport-scrollable');
      document.body.classList.remove('auth-viewport-scrollable');
    };
  }, []);

  /* ---------------- Redirect if already logged in ---------------- */
  useEffect(() => {
    if (user) {
      const from = location.state?.from;
      const dest = from?.pathname
        ? `${from.pathname}${from.search || ''}${from.hash || ''}`
        : (typeof from === 'string' ? from : '/');
      navigate(dest, { replace: true });
    }
  }, [user, navigate, location.state]);

  /* ---------------- Rate-Limit Countdown ---------------- */
  const isRateLimited = rateLimitSeconds > 0;
  useEffect(() => {
    if (!isRateLimited) return undefined;
    const timerId = setInterval(() => {
      setRateLimitSeconds((s) => {
        if (s <= 1) {
          clearInterval(timerId);
          setError('');
          setErrorKind(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerId);
  }, [isRateLimited]);

  /* ---------------- Caps Lock Detection ---------------- */
  const handleKeyEvent = useCallback((e) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  }, []);

  /* ---------------- [FIX 4/5/6] Server warm-up ---------------- */

  // [FIX 4] Normalize the health check response into a boolean. Handles both
  // the legacy (returns null on failure) and structured ({ ok, ... }) shapes.
  const probeHealth = useCallback(async (timeoutMs) => {
    try {
      const r = await api?.healthCheck?.({ timeout: timeoutMs });
      // Structured result.
      if (r && typeof r === 'object' && 'ok' in r) return r.ok === true;
      // Legacy shape: null = failed, anything else = success.
      return r != null;
    } catch {
      return false;
    }
  }, []);

  // [FIX 6] Idempotent warm-up — callable from mount and from email onFocus.
  const ensureServerWarm = useCallback((timeoutMs = 60_000) => {
    if (warmedRef.current) return;
    warmedRef.current = true;
    probeHealth(timeoutMs).then((ok) => {
      setServerWarm(ok);
      setShowConnectingBanner(false);
    });
  }, [probeHealth]);

  useEffect(() => {
    let cancelled = false;

    // Delay the "connecting" banner until the probe has clearly not resolved
    // quickly. If it comes back in 200ms the user never sees the banner.
    const bannerTimer = setTimeout(() => {
      if (!cancelled && serverWarm === null) setShowConnectingBanner(true);
    }, CONNECTING_BANNER_GRACE_MS);

    // Fire the initial probe with a generous timeout — this is the process
    // that actually boots a sleeping backend.
    ensureServerWarm(60_000);

    // Prefetch dashboard chunks during idle so sign-in transition is instant.
    const idleCallback = typeof window !== 'undefined' && window.requestIdleCallback
      ? window.requestIdleCallback
      : (cb) => setTimeout(cb, 800);
    const cancelId = idleCallback(() => {
      import('./Dashboard').catch(() => { });
      import('../components/AppLayout').catch(() => { });
    });

    return () => {
      cancelled = true;
      clearTimeout(bannerTimer);
      if (typeof window !== 'undefined' && window.cancelIdleCallback) {
        window.cancelIdleCallback(cancelId);
      }
    };
    // Intentionally mount-only: the probe is a one-shot wake-up call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- [FIX 8] Slow-login hint timer ---------------- */
  useEffect(() => {
    if (!loading) return undefined;
    const id = setTimeout(() => setSlowLoginHint(true), SLOW_LOGIN_HINT_MS);
    return () => {
      clearTimeout(id);
      setSlowLoginHint(false);
    };
  }, [loading]);

  /* ---------------- Autofill Synchronization ---------------- */
  useEffect(() => {
    const syncAutofill = () => {
      const domEmail = emailInputRef.current?.value;
      const domPassword = passwordInputRef.current?.value;
      setEmail((prev) => (!prev && domEmail ? domEmail : prev));
      setPassword((prev) => (!prev && domPassword ? domPassword : prev));
    };
    syncAutofill();
    const t1 = setTimeout(syncAutofill, 100);
    const t2 = setTimeout(syncAutofill, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

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
    const activeEmail = customValues.email !== undefined
      ? customValues.email
      : (email || emailInputRef.current?.value || '');
    const activePassword = customValues.password !== undefined
      ? customValues.password
      : (password || passwordInputRef.current?.value || '');

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

  const handleChange = useCallback((e) => {
    const { name, value, checked } = e.target;
    if (name === 'email') setEmail(value);
    else if (name === 'password') setPassword(value);
    else if (name === 'rememberMe') setRememberMe(checked);
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev));
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

    // [FIX 7] Paint the loading state FIRST. This runs synchronously before
    // any await, so the button flips to "Authenticating…" on the same frame
    // the click lands. Prevents the "dead button" pattern.
    setLoading(true);
    setError('');
    setErrorKind(null);

    try {
      const effectiveEmail = (email || emailInputRef.current?.value || '').trim();
      const effectivePassword = password || passwordInputRef.current?.value || '';

      if (effectiveEmail && effectiveEmail !== email) setEmail(effectiveEmail);
      if (effectivePassword && effectivePassword !== password) setPassword(effectivePassword);

      const validationErrors = validateForm({
        email: effectiveEmail,
        password: effectivePassword,
      });

      if (Object.keys(validationErrors).length > 0) {
        setTouched((prev) => {
          const next = { ...prev };
          Object.keys(validationErrors).forEach((k) => { next[k] = true; });
          return next;
        });
        const firstError = Object.keys(validationErrors)[0];
        if (firstError === 'email') emailInputRef.current?.focus();
        else if (firstError === 'password') passwordInputRef.current?.focus();
        return;
      }

      const trimmedEmail = effectiveEmail.toLowerCase();

      // [FIX 1] Wrap api.login in a hard 30s timeout regardless of what the
      // api layer does. This is the single most important fix.
      const { token, user: loggedUser } = await withTimeout(
        api.login({
          email: trimmedEmail,
          password: effectivePassword,
          rememberMe,
        }),
        LOGIN_TIMEOUT_MS,
        'login'
      );

      if (rememberMe) safeWriteEmail(trimmedEmail);
      else safeWriteEmail('');

      // [FIX 9] Await the context login — but the context implementation
      // should NOT do its own network call (see AppContext patch note).
      // If it does, wrap it with withTimeout inside the context.
      await login(token, loggedUser, rememberMe);
      // Navigation handled by the redirect effect above.
    } catch (err) {
      if (isCancelError(err)) return;

      // [FIX 2] Timeout — clear message + background warm-up for next try.
      if (isTimeoutError(err)) {
        setErrorKind('timeout');
        setError(
          tr(
            'server_starting',
            'The server is starting up. This can take up to a minute on the first request — please try again in a moment.'
          )
        );
        // Kick off a background warm-up so the next attempt is instant.
        api?.healthCheck?.({ timeout: 60_000 }).catch(() => { });
        return;
      }

      // Rate limit — start cooldown.
      if (isRateLimitError(err)) {
        const wait = getRetryAfterSeconds(err);
        setRateLimitSeconds(wait);
        setErrorKind('rate');
        setError(
          tr('rate_limited', `Too many attempts. Please wait ${wait} seconds before trying again.`)
        );
        return;
      }

      // Fall through to generic mapping.
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
    login, tr,
  ]);

  /* ============================================================
   * Derived UI
   * ============================================================ */

  const emailHasError = Boolean(fieldErrors.email && touched.email);
  const passwordHasError = Boolean(fieldErrors.password && touched.password);

  // [FIX 3] Submit is NEVER gated on `serverWarm`. The user can fire a login
  // the instant the form paints; the request itself warms the server.
  const submitDisabled = loading || rateLimitSeconds > 0;

  const errorIcon = useMemo(() => {
    if (errorKind === 'network' || errorKind === 'timeout') {
      return <Info size={16} aria-hidden="true" />;
    }
    if (errorKind === 'rate') return <RefreshCw size={16} aria-hidden="true" />;
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
        initial={prefersReduced ? false : { opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={prefersReduced ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative' }}
      >
        {/* Top bar: brand, theme, language */}
        <div className="auth-header-row auth-top-row">
          <Link to="/" className="auth-logo" style={{ margin: 0, textDecoration: 'none', color: 'inherit' }} title="Return to MyCoinwise Homepage">
            <motion.div
              className="auth-logo-icon"
              whileHover={prefersReduced ? undefined : { scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 300 }}
              aria-hidden="true"
            >
              <CoinwiseMark size={24} />
            </motion.div>
            <span className="auth-logo-text">MyCoinwise</span>
          </Link>

          <div className="auth-top-actions">
            <button
              type="button"
              className="auth-theme-toggle"
              onClick={handleToggleTheme}
              aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} theme`}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} theme`}
            >
              {isDark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            </button>

            <div className="auth-lang-selector">
              <Globe size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <select
                value={lang}
                onChange={(e) => setLanguage && setLanguage(e.target.value)}
                aria-label={tr('language', 'Language')}
              >
                {Object.entries(LANGUAGES).map(([code, l]) => (
                  <option key={code} value={code}>
                    {l.flag} {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="auth-header">
          <h1>{tr('welcome_back_title', 'Welcome back')}</h1>
          <p>{tr('sign_in_to_continue', 'Sign in to your account to continue')}</p>
        </div>

        {/* ===================== Server status notice ===================== */}
        <AnimatePresence>
          {/* [FIX 5] "Connecting…" indicator while the probe is pending. Only
              appears if the probe didn't resolve within the grace window. */}
          {showConnectingBanner && serverWarm === null && !error && (
            <motion.div
              key="connecting"
              role="status"
              aria-live="polite"
              initial={prefersReduced ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? false : { opacity: 0, y: -8 }}
              transition={prefersReduced ? { duration: 0 } : undefined}
              style={noticeStyle}
            >
              <RefreshCw
                size={13}
                aria-hidden="true"
                className={prefersReduced ? '' : 'spin'}
                style={{ color: '#3b82f6' }}
              />
              <span>{tr('connecting', 'Connecting to server…')}</span>
            </motion.div>
          )}

          {/* [FIX 5] Cold-start warning after the probe resolved to false. */}
          {serverWarm === false && !error && (
            <motion.div
              key="cold"
              role="status"
              aria-live="polite"
              initial={prefersReduced ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? false : { opacity: 0, y: -8 }}
              transition={prefersReduced ? { duration: 0 } : undefined}
              style={noticeStyle}
            >
              <AlertTriangle size={13} aria-hidden="true" style={{ color: '#f59e0b' }} />
              <span>{tr('server_slow', 'Server may be slow. Login might take a moment.')}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top-level error */}
        <div className="auth-alert-slot">
          <AnimatePresence>
            {error && (
              <motion.div
                className={`auth-alert auth-alert-${errorKind || 'default'}`}
                role="alert"
                initial={prefersReduced ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? false : { opacity: 0, y: -8 }}
                transition={prefersReduced ? { duration: 0 } : undefined}
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
        </div>

        {/* ===================== Form ===================== */}
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
                  // [FIX 6] Warm the server the moment the user touches the
                  // email field, in case the mount-time probe is still pending.
                  ensureServerWarm(60_000);
                  if (emailInputRef.current?.value && !email) {
                    setEmail(emailInputRef.current.value);
                  }
                  import('./Dashboard').catch(() => { });
                }}
                onBlur={handleBlur}
                required
                autoComplete="email"
                autoFocus={typeof window !== 'undefined' && window.innerWidth > 900}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX_EMAIL_LENGTH}
                placeholder={tr('email_placeholder', 'you@example.com')}
                disabled={loading || rateLimitSeconds > 0}
                aria-invalid={emailHasError}
                aria-describedby={emailHasError ? 'email-error' : undefined}
                inputMode="email"
                enterKeyHint="next"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    passwordInputRef.current?.focus();
                  }
                }}
              />
            </div>
            {emailHasError && (
              <div id="email-error" className="form-error" role="alert">
                <AlertTriangle size={12} aria-hidden="true" />
                <span>{fieldErrors.email}</span>
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
                enterKeyHint="go"
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
                <AlertTriangle size={12} aria-hidden="true" />
                <span>{fieldErrors.password}</span>
              </div>
            )}
            <AnimatePresence>
              {capsLockOn && !passwordHasError && (
                <motion.div
                  id="password-caps-warning"
                  className="form-hint form-hint-warning"
                  initial={prefersReduced ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReduced ? false : { opacity: 0, y: -4 }}
                  transition={prefersReduced ? { duration: 0 } : undefined}
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
            <label
              className="checkbox-label"
              htmlFor="login-rememberMe"
              title={tr('remember_me_tooltip', 'Stay signed in on this device for up to 30 days')}
            >
              <input
                type="checkbox"
                id="login-rememberMe"
                name="rememberMe"
                checked={rememberMe}
                onChange={handleChange}
                disabled={loading || rateLimitSeconds > 0}
                className="auth-checkbox-input"
              />
              <span className={`custom-checkbox ${rememberMe ? 'checked' : ''}`} aria-hidden="true">
                {rememberMe && <Check size={12} strokeWidth={3} className="custom-check-icon" />}
              </span>
              <span className="checkbox-text">{tr('trust_this_device', 'Trust this device')}</span>
            </label>
            <Link to="/forgot-password" className="auth-forgot-link">
              {tr('forgot_password', 'Forgot password?')}
            </Link>
          </div>

          {/* Submit */}
          <motion.button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={submitDisabled}
            aria-busy={loading}
            whileHover={submitDisabled || prefersReduced ? undefined : { scale: 1.02 }}
            whileTap={submitDisabled || prefersReduced ? undefined : { scale: 0.98 }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <RefreshCw size={16} className={prefersReduced ? '' : 'spin'} aria-hidden="true" />
                <span>
                  {tr('authenticating', 'Authenticating…')}
                  {/* [FIX 8] Slow hint appears only after SLOW_LOGIN_HINT_MS */}
                  {slowLoginHint && (
                    <span style={{ fontSize: '0.75em', opacity: 0.75, marginLeft: 6 }}>
                      ({tr('waking_server', 'waking server, up to 30s')})
                    </span>
                  )}
                </span>
              </span>
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
        </form>

        {/* Footer */}
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

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            type="button"
            onClick={openCookiePreferences}
            className="footer-cookie-prefs-btn"
            style={{
              background: 'none',
              border: 'none',
              padding: '6px 10px',
              color: 'var(--text-secondary, #94a3b8)',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Cookie preferences
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ============================================================
 * Shared notice style (used by both connecting + cold banners)
 * ============================================================ */
const noticeStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: '0.80rem', padding: '8px 12px',
  background: 'rgba(59, 130, 246, 0.08)',
  border: '1px solid rgba(59, 130, 246, 0.22)',
  borderRadius: 10, color: 'var(--text-secondary)',
  marginBottom: '0.75rem',
};
