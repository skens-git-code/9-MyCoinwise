/* —————————————————————————————————————
 * Register Page
 * Signup screen with:
 *   - Username field (live availability check, debounced).
 *   - Email + password + confirm with live strength meter.
 *   - Terms / marketing opt-ins.
 *   - Rate-limit countdown for repeated attempts.
 *   - Success modal with resend-verification action.
 *
 * Key behaviors:
 *   - Username availability is checked server-side after a debounce.
 *   - Password strength score uses length, character classes, and
 *     penalizes common/sequential patterns.
 *   - Submit is blocked while a request is in flight or a rate-limit
 *     cooldown is active.
 *   - Redirects signed-in users to `/`.
 *   - Focus is trapped inside the success modal; Escape closes it.
 * ————————————————————————————————————— */

import React, {
  useState, useContext, useRef, useEffect, useCallback, useMemo,
} from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { AppContext } from '../contexts/AppContext';
import { LANGUAGES } from '../services/i18n';
import {
  User, Mail, KeyRound, AlertTriangle, Zap, Eye, EyeOff,
  ArrowRight, Shield, CheckCircle2, Lock, Globe, X,
  Loader2, RefreshCw, Smartphone, MailCheck,
} from 'lucide-react';

/* ============================================================
 * Constants
 * ============================================================ */

// ── Validation patterns and length bounds ──
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,30}$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_USERNAME_LENGTH = 30;
const MAX_PASSWORD_LENGTH = 128;

// ── Backend-error and rate-limit safeguards ──
const MAX_BACKEND_ERROR_LENGTH = 200;
const RATE_LIMIT_DEFAULT_SECONDS = 60;

// ── Debounce delay for the username availability check ──
const USERNAME_DEBOUNCE_MS = 500;

// ── Usernames blocked from registration ──
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'mycoinwise',
  'official', 'staff', 'moderator', 'mod', 'system', 'security',
  'billing', 'account', 'accounts', 'login', 'register', 'settings',
  'api', 'www', 'mail', 'email', 'user', 'users', 'test', 'demo',
]);

// ── Common-password blocklist used by the strength scorer ──
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'qwertyuiop', 'letmein', 'welcome1', 'admin123',
  'iloveyou', 'monkey123', 'dragon123', 'abc123456', 'password!',
  'welcome123', 'passw0rd', 'p@ssw0rd', 'qwerty!23', 'trustno1',
]);

// ── Strength meter labels, colors, and fill widths (0–5 scale) ──
const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
const STRENGTH_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981'];
const STRENGTH_WIDTHS = ['20%', '40%', '60%', '75%', '90%', '100%'];

/* ============================================================
 * Helpers
 * ============================================================ */

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
  if (/<[a-z]/i.test(trimmed)) return null;
  if (/at \w+ \(/.test(trimmed)) return null;
  return trimmed;
};

// ── Score password strength on a 0–5 scale ──
// Adds points for length and character variety; subtracts points for
// common, repeated, sequential, or keyboard-walk patterns.
const getPasswordStrength = (password) => {
  const pw = String(password || '');
  if (!pw) return 0;
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 0;

  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 1;

  if (/^(.)\1+$/.test(pw)) score -= 2;
  if (/^(012|123|234|345|456|567|678|789|890)/.test(pw)) score -= 1;
  if (/(012|123|234|345|456|567|678|789|890)/.test(pw)) score -= 1;
  if (/(qwerty|asdf|zxcv|qazwsx)/i.test(pw)) score -= 1;

  return Math.max(0, Math.min(5, score));
};

/* ============================================================
 * Focus Trap
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
 * Component
 * ============================================================ */
export default function Register() {
  // ── App context + router ──
  const { login, t, lang = 'en', setLanguage, user } = useContext(AppContext);
  const navigate = useNavigate();

  // ── Translation helper with inline fallback ──
  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  /* ---------------- Refs ---------------- */

  // ── Form input refs ──
  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);

  // ── Modal + timer/abort refs ──
  const successModalRef = useRef(null);
  const rateLimitTimerRef = useRef(null);
  const usernameCheckTimerRef = useRef(null);
  const usernameAbortRef = useRef(null);

  /* ---------------- State ---------------- */

  // ── Form field values ──
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
    agreeMarketing: false,
  });

  // ── Password visibility toggles + Caps Lock flag ──
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  // ── Top-level error and its kind ──
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState(null);

  // ── Loading + validation state ──
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

  // ── Rate-limit cooldown ──
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  // ── Username availability status: 'idle' | 'checking' | 'available' | 'taken' | 'error' ──
  const [usernameStatus, setUsernameStatus] = useState('idle');

  // ── Success modal and session state ──
  const [showSuccess, setShowSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [registeredSession, setRegisteredSession] = useState(null);
  const [resendSent, setResendSent] = useState(false);

  /* ---------------- Redirect Authenticated Users ---------------- */
  // Only redirect if user is already logged in before registration and not viewing success
  useEffect(() => {
    if (user && !showSuccess) navigate('/', { replace: true });
  }, [user, showSuccess, navigate]);

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

  /* ---------------- Debounced Username Availability Check ---------------- */
  // Fires the server-side check after the user stops typing, and aborts
  // any in-flight request when the input changes again.
  useEffect(() => {
    const username = formData.username.trim();

    // ── Skip when the username is empty, malformed, or reserved ──
    if (
      !username ||
      !USERNAME_REGEX.test(username) ||
      RESERVED_USERNAMES.has(username.toLowerCase())
    ) {
      setUsernameStatus('idle');
      if (usernameAbortRef.current) {
        usernameAbortRef.current.abort();
        usernameAbortRef.current = null;
      }
      return undefined;
    }

    if (typeof api.checkUsername !== 'function') return undefined;

    if (usernameCheckTimerRef.current) clearTimeout(usernameCheckTimerRef.current);

    // Set immediately so the UI reflects the in-flight state during debounce.
    setUsernameStatus('checking');

    usernameCheckTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      usernameAbortRef.current = controller;
      try {
        const result = await api.checkUsername(username, { signal: controller.signal });
        const available = result?.available !== false;
        setUsernameStatus(available ? 'available' : 'taken');
      } catch (err) {
        if (!isCancelError(err)) setUsernameStatus('error');
      }
    }, USERNAME_DEBOUNCE_MS);

    return () => {
      if (usernameCheckTimerRef.current) clearTimeout(usernameCheckTimerRef.current);
    };
  }, [formData.username]);

  /* ---------------- Cleanup on Unmount ---------------- */
  // Cancel pending timers and aborts so they don't fire after unmount.
  useEffect(() => () => {
    if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
    if (usernameCheckTimerRef.current) clearTimeout(usernameCheckTimerRef.current);
    if (usernameAbortRef.current) usernameAbortRef.current.abort();
  }, []);

  // ── Update Caps Lock flag from a keyboard event ──
  const handleCapsKey = useCallback((e) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  }, []);

  /* ============================================================
   * Validation
   * ============================================================ */

  // ── Validate a single field and return its error string ──
  // `snapshot` overrides formData, used for cross-field checks.
  const validateField = useCallback((name, value, snapshot = formData) => {
    switch (name) {
      case 'username': {
        const v = String(value || '').trim();
        if (!v) return tr('username_required', 'Username is required.');
        if (v.length < 2) return tr('username_min_chars', 'Username must be at least 2 characters.');
        if (v.length > MAX_USERNAME_LENGTH) return tr('username_max_chars', `Username must be at most ${MAX_USERNAME_LENGTH} characters.`);
        if (!USERNAME_REGEX.test(v)) return tr('username_invalid_chars', 'Use only letters, numbers, and underscores.');
        if (RESERVED_USERNAMES.has(v.toLowerCase())) return tr('username_reserved', 'This username is reserved.');
        if (usernameStatus === 'taken') return tr('username_taken', 'This username is already taken.');
        return '';
      }
      case 'email': {
        const v = String(value || '').trim();
        if (!v) return tr('email_required', 'Email is required.');
        if (v.length > MAX_EMAIL_LENGTH) return tr('email_too_long', 'Email is too long.');
        if (!EMAIL_REGEX.test(v)) return tr('invalid_email', 'Enter a valid email address.');
        return '';
      }
      case 'password': {
        if (!value) return tr('password_required', 'Password is required.');
        if (value.length < 8) return tr('password_min_chars', 'Password must be at least 8 characters.');
        if (value.length > MAX_PASSWORD_LENGTH) return tr('password_max_chars', `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
        if (COMMON_PASSWORDS.has(String(value).toLowerCase())) return tr('password_common', 'This password is too common. Choose another.');
        if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) return tr('password_case_req', 'Include both uppercase and lowercase letters.');
        if (!/\d/.test(value)) return tr('password_num_req', 'Include at least one number.');
        if (!/[^a-zA-Z0-9]/.test(value)) return tr('password_special_req', 'Include at least one special character.');
        return '';
      }
      case 'confirmPassword':
        if (!value) return tr('confirm_required', 'Please confirm your password.');
        if (value !== snapshot.password) return tr('passwords_do_not_match', 'Passwords do not match.');
        return '';
      case 'agreeTerms':
        return !value ? tr('accept_terms_req', 'You must accept the Terms & Conditions.') : '';
      default:
        return '';
    }
  }, [formData, tr, usernameStatus]);

  // ── Validate every field, storing errors in state ──
  const validateForm = useCallback(() => {
    const errors = {};
    Object.keys(formData).forEach((key) => {
      const err = validateField(key, formData[key], formData);
      if (err) errors[key] = err;
    });
    setFieldErrors(errors);
    return errors;
  }, [formData, validateField]);

  /* Re-validate username when the async availability check resolves. */
  useEffect(() => {
    if (!touched.username) return;
    const err = validateField('username', formData.username, formData);
    setFieldErrors((prev) => (prev.username === err ? prev : { ...prev, username: err }));
    // Only fires when usernameStatus changes — surfacing "taken" as an error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameStatus]);

  /* ============================================================
   * Field Handlers
   * ============================================================ */

  // ── Update a field and clear its field-level error ──
  // Password changes re-check confirm-password when that field is touched.
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;

    const next = { ...formData, [name]: val };
    setFormData(next);

    setFieldErrors((prev) => {
      const updates = { ...prev, [name]: '' };

      if (
        name === 'password' &&
        next.confirmPassword &&
        (touched.confirmPassword || prev.confirmPassword)
      ) {
        updates.confirmPassword = validateField(
          'confirmPassword',
          next.confirmPassword,
          next
        );
      }
      return updates;
    });
  }, [formData, validateField, touched.confirmPassword]);

  // ── Mark field as touched and validate on blur ──
  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const err = validateField(name, formData[name], formData);
    setFieldErrors((prev) => ({ ...prev, [name]: err }));
  }, [validateField, formData]);

  /* ============================================================
   * Submit
   * ============================================================ */
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (loading || rateLimitSeconds > 0) return;

    setError('');
    setErrorKind(null);

    // ── Validate; focus the first errored field on failure ──
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setTouched((prev) => {
        const next = { ...prev };
        Object.keys(validationErrors).forEach((k) => { next[k] = true; });
        return next;
      });
      const firstError = Object.keys(validationErrors)[0];
      if (firstError === 'username') nameInputRef.current?.focus();
      else if (firstError === 'email') emailInputRef.current?.focus();
      else if (firstError === 'password') passwordInputRef.current?.focus();
      else if (firstError === 'confirmPassword') confirmPasswordInputRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      // ── Register via the API ──
      const payload = {
        username: formData.username.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        agree_terms: true,
        agree_marketing: Boolean(formData.agreeMarketing),
      };

      const { token, user: newUser } = await api.register(payload);
      setRegisteredSession({ token, user: newUser });
      setRegisteredEmail(payload.email);
      setShowSuccess(true);
    } catch (err) {
      if (isCancelError(err)) return;

      // ── Rate limit: start the cooldown and show the message ──
      if (isRateLimitError(err)) {
        const wait = getRetryAfterSeconds(err);
        setRateLimitSeconds(wait);
        setErrorKind('rate');
        setError(tr('rate_limited', `Too many attempts. Please wait ${wait} seconds before trying again.`));
        return;
      }

      // ── Map the failure to a user-facing message and targeted field ──
      let msg = tr('registration_failed', 'Registration failed. Please try again.');
      let kind = 'unknown';

      if (err?.response) {
        const rawErrors = err.response?.data?.errors;
        const rawError = err.response?.data?.error;
        const firstValidationMsg = Array.isArray(rawErrors) && rawErrors.length > 0 ? rawErrors[0]?.msg : null;
        const backend = sanitizeBackendMessage(rawError || firstValidationMsg);
        if (backend) msg = backend;

        const status = err.response.status;
        const field = err.response?.data?.field || (Array.isArray(rawErrors) ? rawErrors[0]?.path || rawErrors[0]?.param : null);

        if (status === 409) {
          kind = 'duplicate';
          if (field === 'username' || (!field && msg.toLowerCase().includes('username'))) {
            setFieldErrors((p) => ({ ...p, username: msg }));
            setTouched((p) => ({ ...p, username: true }));
            nameInputRef.current?.focus();
          } else if (field === 'email' || (!field && msg.toLowerCase().includes('email'))) {
            setFieldErrors((p) => ({ ...p, email: msg }));
            setTouched((p) => ({ ...p, email: true }));
            emailInputRef.current?.focus();
          }
        } else if (status === 400) {
          kind = 'validation';
          if (field && ['username', 'email', 'password', 'confirmPassword'].includes(field)) {
            setFieldErrors((p) => ({ ...p, [field]: msg }));
            setTouched((p) => ({ ...p, [field]: true }));
            if (field === 'username') nameInputRef.current?.focus();
            else if (field === 'email') emailInputRef.current?.focus();
            else if (field === 'password') passwordInputRef.current?.focus();
          }
        }
      } else if (err?.request || err?.code === 'ERR_NETWORK') {
        msg = tr('server_unreachable', 'Cannot reach the server. Please check your network connection.');
        kind = 'network';
      }

      setError(msg);
      setErrorKind(kind);
    } finally {
      setLoading(false);
    }
  }, [loading, rateLimitSeconds, validateForm, formData, tr]);

  /* ============================================================
   * Success Modal
   * ============================================================ */

  // ── Close the modal, authenticate, and navigate to dashboard ──
  const closeSuccessModal = useCallback(async () => {
    setShowSuccess(false);
    if (registeredSession) {
      await login(registeredSession.token, registeredSession.user);
    }
    navigate('/', { replace: true });
  }, [registeredSession, login, navigate]);

  useFocusTrap(successModalRef, showSuccess, closeSuccessModal);

  /* ============================================================
   * Derived UI State
   * ============================================================ */

  // ── Password strength display values ──
  const strengthScore = useMemo(
    () => getPasswordStrength(formData.password),
    [formData.password]
  );
  const strengthLabel = STRENGTH_LABELS[strengthScore];
  const strengthColor = STRENGTH_COLORS[strengthScore];
  const strengthWidth = STRENGTH_WIDTHS[strengthScore];

  // ── Field-level error visibility ──
  const emailHasError = Boolean(fieldErrors.email && touched.email);
  const usernameHasError = Boolean(fieldErrors.username && touched.username);
  const passwordHasError = Boolean(fieldErrors.password && touched.password);
  const confirmHasError = Boolean(fieldErrors.confirmPassword && touched.confirmPassword);
  const termsHasError = Boolean(fieldErrors.agreeTerms && touched.agreeTerms);

  // ── Submit gating ──
  const submitDisabled = loading || rateLimitSeconds > 0;

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
        <div style={{
          position: 'absolute', top: 20, right: 20,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
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
            {Object.entries(LANGUAGES || {}).map(([code, l]) => (
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
          <h1>{tr('create_account_title', 'Create Account')}</h1>
          <p>{tr('create_account_subtitle', 'Start your journey to smarter budgeting')}</p>
        </div>

        {/* ===================== Benefit Bullets ===================== */}
        <ul className="auth-benefits">
          {[
            tr('encryption_badge', 'Secure JWT authentication'),
            tr('track_plan_grow', 'Track income & expenses'),
            tr('ai_insights', 'Smart AI spending alerts'),
          ].map((b) => (
            <li key={b}>
              <CheckCircle2 size={14} aria-hidden="true" />
              {b}
            </li>
          ))}
        </ul>

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
              <AlertTriangle size={16} aria-hidden="true" />
              <span style={{ flex: 1 }}>{error}</span>
              {/* ── Rate-limit countdown badge ── */}
              {rateLimitSeconds > 0 && (
                <span
                  className="auth-rate-countdown"
                  aria-label={`${rateLimitSeconds} ${tr('seconds_remaining', 'seconds remaining')}`}
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
          {/* ── Username field (with live availability status) ── */}
          <div className={`form-group ${usernameHasError ? 'has-error' : ''}`}>
            <label htmlFor="reg-username">{tr('username', 'Username')}</label>
            <div className="input-wrapper">
              <User className="input-icon" size={17} aria-hidden="true" />
              <input
                ref={nameInputRef}
                id="reg-username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                autoComplete="username"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX_USERNAME_LENGTH}
                placeholder={tr('username_placeholder', 'johndoe')}
                disabled={loading}
                aria-invalid={usernameHasError}
                aria-describedby={
                  usernameHasError
                    ? 'username-error'
                    : usernameStatus === 'available'
                      ? 'username-available'
                      : usernameStatus === 'checking'
                        ? 'username-checking'
                        : undefined
                }
              />
              {/* ── Availability suffix icon (checking / available / taken) ── */}
              {usernameStatus === 'checking' && (
                <Loader2 className="input-suffix-icon spin" size={16} aria-hidden="true" />
              )}
              {usernameStatus === 'available' && (
                <CheckCircle2
                  className="input-suffix-icon"
                  size={16}
                  style={{ color: 'var(--success-color, #10b981)' }}
                  aria-hidden="true"
                />
              )}
              {usernameStatus === 'taken' && (
                <X
                  className="input-suffix-icon"
                  size={16}
                  style={{ color: 'var(--danger-color, #ef4444)' }}
                  aria-hidden="true"
                />
              )}
            </div>
            {usernameHasError && (
              <div id="username-error" className="form-error" role="alert">
                {fieldErrors.username}
              </div>
            )}
            {!usernameHasError && usernameStatus === 'available' && (
              <div id="username-available" className="form-hint" style={{ color: 'var(--success-color, #10b981)' }}>
                {tr('username_available', 'Username is available')}
              </div>
            )}
            {!usernameHasError && usernameStatus === 'checking' && (
              <div id="username-checking" className="form-hint">
                {tr('checking_availability', 'Checking availability…')}
              </div>
            )}
          </div>

          {/* ── Email field ── */}
          <div className={`form-group ${emailHasError ? 'has-error' : ''}`}>
            <label htmlFor="reg-email">{tr('email_address', 'Email Address')}</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={17} aria-hidden="true" />
              <input
                ref={emailInputRef}
                id="reg-email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX_EMAIL_LENGTH}
                placeholder={tr('email_placeholder', 'you@example.com')}
                disabled={loading}
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

          {/* ── Password field with strength meter ── */}
          <div className={`form-group ${passwordHasError ? 'has-error' : ''}`}>
            <label htmlFor="reg-password">{tr('password', 'Password')}</label>
            <div className="input-wrapper">
              <KeyRound className="input-icon" size={17} aria-hidden="true" />
              <input
                ref={passwordInputRef}
                id="reg-password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyUp={handleCapsKey}
                onKeyDown={handleCapsKey}
                required
                autoComplete="new-password"
                maxLength={MAX_PASSWORD_LENGTH}
                placeholder={tr('password_placeholder', '••••••••')}
                disabled={loading}
                aria-invalid={passwordHasError}
                aria-describedby={passwordHasError ? 'password-error' : 'password-requirements'}
              />
              {/* ── Show / hide toggle ── */}
              <button
                type="button"
                className="input-suffix-btn"
                onClick={() => setShowPwd((p) => !p)}
                aria-label={showPwd ? tr('hide_password', 'Hide password') : tr('show_password', 'Show password')}
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
            {/* ── Strength bar (hidden while an error is visible) ── */}
            {formData.password.length > 0 && !passwordHasError && (
              <div
                className="pwd-strength-bar"
                role="progressbar"
                aria-valuenow={strengthScore + 1}
                aria-valuemin={1}
                aria-valuemax={6}
                aria-label={`${tr('password_strength', 'Password strength')}: ${strengthLabel}`}
              >
                <motion.div
                  className="pwd-strength-fill"
                  initial={{ width: 0 }}
                  animate={{ width: strengthWidth, backgroundColor: strengthColor }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
            {/* ── Strength label / requirements hint ── */}
            <div
              id="password-requirements"
              className="form-hint"
              style={{ color: formData.password.length > 0 && !passwordHasError ? strengthColor : undefined }}
              role="status"
              aria-live="polite"
            >
              {formData.password.length > 0
                ? `${tr('password_strength', 'Strength')}: ${strengthLabel}`
                : tr('password_requirements_hint', 'Use 8+ chars with uppercase, lowercase, number, special.')}
            </div>
            {/* ── Caps Lock hint ── */}
            <AnimatePresence>
              {capsLock && (
                <motion.div
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

          {/* ── Confirm-password field ── */}
          <div className={`form-group ${confirmHasError ? 'has-error' : ''}`}>
            <label htmlFor="reg-confirm">{tr('confirm_password', 'Confirm Password')}</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={17} aria-hidden="true" />
              <input
                ref={confirmPasswordInputRef}
                id="reg-confirm"
                name="confirmPassword"
                type={showConfirmPwd ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                autoComplete="new-password"
                maxLength={MAX_PASSWORD_LENGTH}
                placeholder={tr('password_placeholder', '••••••••')}
                disabled={loading}
                aria-invalid={confirmHasError}
                aria-describedby={confirmHasError ? 'confirm-error' : undefined}
              />
              {/* ── Show / hide toggle ── */}
              <button
                type="button"
                className="input-suffix-btn"
                onClick={() => setShowConfirmPwd((p) => !p)}
                aria-label={
                  showConfirmPwd
                    ? tr('hide_confirm_password', 'Hide confirm password')
                    : tr('show_confirm_password', 'Show confirm password')
                }
                aria-pressed={showConfirmPwd}
                disabled={loading}
              >
                {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmHasError && (
              <div id="confirm-error" className="form-error" role="alert">
                {fieldErrors.confirmPassword}
              </div>
            )}
          </div>

          {/* ── Terms & Conditions agreement ── */}
          <div className={`form-group checkbox-group ${termsHasError ? 'has-error' : ''}`}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="agreeTerms"
                checked={formData.agreeTerms}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={loading}
                aria-invalid={termsHasError}
                aria-describedby={termsHasError ? 'terms-error' : undefined}
              />
              <span>
                {tr('agree_to_terms_prefix', 'I agree to the')}{' '}
                <Link to="/terms" className="auth-inline-link" target="_blank" rel="noopener noreferrer">
                  {tr('terms_and_conditions', 'Terms & Conditions')}
                </Link>{' '}
                {tr('and', 'and')}{' '}
                <Link to="/privacy" className="auth-inline-link" target="_blank" rel="noopener noreferrer">
                  {tr('privacy_policy', 'Privacy Policy')}
                </Link>
              </span>
            </label>
            {termsHasError && (
              <div id="terms-error" className="form-error" role="alert">
                {fieldErrors.agreeTerms}
              </div>
            )}
          </div>

          {/* ── Marketing opt-in (optional) ── */}
          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="agreeMarketing"
                checked={formData.agreeMarketing}
                onChange={handleChange}
                disabled={loading}
              />
              <span>{tr('agree_marketing', 'Send me product updates and tips (optional)')}</span>
            </label>
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
                {tr('creating_account', 'Creating account…')}
              </motion.span>
            ) : rateLimitSeconds > 0 ? (
              <>{tr('please_wait', 'Please wait')} ({rateLimitSeconds}s)</>
            ) : (
              <>
                {tr('create_account_title', 'Create Account')}
                <ArrowRight size={16} style={{ marginLeft: 6 }} aria-hidden="true" />
              </>
            )}
          </motion.button>
        </form>

        {/* ===================== Footer ===================== */}
        <div className="auth-divider">
          <span>{tr('already_have_account', 'Already have an account?')}</span>
        </div>

        <div className="auth-footer">
          <Link
            to="/login"
            className="auth-alt-btn"
            aria-disabled={loading}
            tabIndex={loading ? -1 : 0}
            onClick={(e) => { if (loading) e.preventDefault(); }}
          >
            {tr('sign_in', 'Sign in instead')}
          </Link>
        </div>

        {/* ── Trust badge ── */}
        <div className="auth-secure-note">
          <Shield size={12} aria-hidden="true" />
          <span>{tr('encryption_badge', '256-bit encrypted · secure sessions')}</span>
        </div>
      </motion.div>

      {/* ===================== Success Modal ===================== */}
      {/* Success modal — dismissible via Escape OR overlay click */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSuccessModal}
            style={{ zIndex: 1000 }}
          >
            <motion.div
              ref={successModalRef}
              className="modal-box glass"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reg-success-title"
              aria-describedby="reg-success-desc"
              style={{ maxWidth: 480, padding: 24, textAlign: 'center' }}
            >
              {/* ── Icon badge ── */}
              <div
                style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'rgba(16,185,129,0.15)', color: '#10b981',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
                aria-hidden="true"
              >
                <MailCheck size={28} />
              </div>
              <h3 id="reg-success-title" style={{ margin: '0 0 8px', fontSize: '1.25rem' }}>
                {tr('registration_success_title', 'Account created!')}
              </h3>
              <p
                id="reg-success-desc"
                style={{
                  color: 'var(--text-secondary)', fontSize: '0.92rem',
                  lineHeight: 1.55, margin: '0 0 8px',
                }}
              >
                {tr('registration_success_desc', 'We sent a verification link to')}{' '}
                <strong>{registeredEmail}</strong>.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5, margin: '0 0 20px' }}>
                {tr(
                  'registration_success_hint',
                  'Verify your email to unlock all features. You can also verify later from Settings → Security.'
                )}
              </p>

              {/* ── Primary + secondary actions ── */}
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <button type="button" className="btn btn-primary" onClick={closeSuccessModal} style={{ width: '100%' }}>
                  <ArrowRight size={16} aria-hidden="true" />
                  {tr('continue_to_app', 'Continue to app')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    if (resendSent) return;
                    try {
                      await api.resendVerification(registeredEmail);
                      setResendSent(true);
                    } catch {
                      setResendSent(true);
                    }
                  }}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                >
                  {resendSent ? (
                    <>
                      <CheckCircle2 size={14} aria-hidden="true" style={{ color: 'var(--success-color, #10b981)' }} />
                      {tr('verification_sent', 'Verification link sent!')}
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} aria-hidden="true" />
                      {tr('resend_verification', 'Resend verification email')}
                    </>
                  )}
                </button>
              </div>

              {/* ── 2FA tip strip ── */}
              <div
                style={{
                  marginTop: 20, padding: '10px 14px', borderRadius: 10,
                  background: 'var(--glass-2)', border: '1px solid var(--glass-border)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'left',
                }}
              >
                <Smartphone size={16} style={{ flexShrink: 0 }} aria-hidden="true" />
                <span>
                  {tr(
                    'two_factor_nudge',
                    'Tip: enable two-factor authentication in Settings → Security for extra protection.'
                  )}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Local styles for spin animation, hints, and helper classes ── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .auth-rate-countdown {
          font-variant-numeric: tabular-nums;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(245,158,11,0.2);
          font-size: 0.78rem;
        }
        .form-hint-warning {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--warning-color, #f59e0b);
          margin-top: 4px;
        }
        .input-suffix-icon {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
        }
        .auth-inline-link {
          color: var(--brand-primary);
          text-decoration: underline;
        }
        .auth-inline-link:hover { opacity: 0.85; }
      `}</style>
    </div>
  );
}