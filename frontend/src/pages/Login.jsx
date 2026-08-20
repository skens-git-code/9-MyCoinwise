import React, { useState, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { AppContext } from '../contexts/AppContext';
import { LANGUAGES } from '../services/i18n';
import {
  KeyRound, Mail, AlertTriangle, Zap, Eye, EyeOff,
  ArrowRight, Shield, Globe
} from 'lucide-react';

export default function Login() {
  const { login, t, lang = 'en', setLanguage } = useContext(AppContext);
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  // ---------- Validation ----------
  const validateField = (name, value) => {
    switch (name) {
      case 'email':
        return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? (t?.('invalid_email') || 'Enter a valid email address.') : '';
      case 'password':
        return value.length < 1 ? (t?.('password_required') || 'Password is required.') : '';
      default:
        return '';
    }
  };

  const validateForm = () => {
    const errors = {};
    const emailErr = validateField('email', email);
    const pwdErr = validateField('password', password);
    if (emailErr) errors.email = emailErr;
    if (pwdErr) errors.password = pwdErr;
    setFieldErrors(errors);
    return errors;
  };

  const handleChange = (e) => {
    const { name, value, checked } = e.target;
    if (name === 'email') setEmail(value);
    else if (name === 'password') setPassword(value);
    else if (name === 'rememberMe') setRememberMe(checked);
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
    if (error) setError('');
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
    const err = validateField(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: err }));
  };

  // ---------- Submit ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      const firstError = Object.keys(validationErrors)[0];
      if (firstError === 'email') emailInputRef.current?.focus();
      if (firstError === 'password') passwordInputRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await api.login({
        email: email.trim().toLowerCase(),
        password,
        rememberMe,
      });
      await login(token, user, rememberMe);
      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } catch (err) {
      let errorMsg = t?.('invalid_credentials') || 'Invalid credentials. Please try again.';
      if (err.response) {
        errorMsg = err.response?.data?.error || errorMsg;
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        errorMsg = t?.('server_unreachable') || 'Cannot reach the server. Please check your network connection.';
      }
      setError(errorMsg);
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
        style={{ position: 'relative' }}
      >
        {/* Language Selector in Auth Card */}
        <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Globe size={14} style={{ color: 'var(--text-muted)' }} />
          <select
            value={lang}
            onChange={(e) => setLanguage && setLanguage(e.target.value)}
            aria-label={t?.('language') || 'Language'}
            style={{
              background: 'var(--glass-2)',
              color: 'var(--text-primary)',
              border: '1px solid var(--glass-border)',
              borderRadius: 8,
              padding: '4px 8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none'
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
          >
            <Zap size={26} />
          </motion.div>
          <span className="auth-logo-text">MyCoinwise</span>
        </div>

        <div className="auth-header">
          <h1>{t?.('welcome_back_title') || 'Welcome back'}</h1>
          <p>{t?.('sign_in_to_continue') || 'Sign in to your account to continue'}</p>
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

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {/* Email */}
          <div className={`form-group ${fieldErrors.email && touched.email ? 'has-error' : ''}`}>
            <label htmlFor="login-email">{t?.('email_address') || 'Email Address'}</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={17} />
              <input
                ref={emailInputRef}
                id="login-email"
                name="email"
                type="email"
                value={email}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                autoComplete="email"
                placeholder={t?.('email_placeholder') || 'you@example.com'}
                disabled={loading}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
            </div>
            {fieldErrors.email && touched.email && (
              <div id="email-error" className="form-error" role="alert">{fieldErrors.email}</div>
            )}
          </div>

          {/* Password */}
          <div className={`form-group ${fieldErrors.password && touched.password ? 'has-error' : ''}`}>
            <label htmlFor="login-password">{t?.('password') || 'Password'}</label>
            <div className="input-wrapper">
              <KeyRound className="input-icon" size={17} />
              <input
                ref={passwordInputRef}
                id="login-password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                autoComplete="current-password"
                placeholder={t?.('password_placeholder') || '••••••••'}
                disabled={loading}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              />
              <button
                type="button"
                className="input-suffix-btn"
                onClick={() => setShowPwd(p => !p)}
                tabIndex={-1}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                disabled={loading}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.password && touched.password && (
              <div id="password-error" className="form-error" role="alert">{fieldErrors.password}</div>
            )}
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="auth-extra-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="rememberMe"
                checked={rememberMe}
                onChange={handleChange}
                disabled={loading}
              />
              <span>{t?.('remember_me') || 'Remember me'}</span>
            </label>
            <Link to="/forgot-password" className="auth-forgot-link">
              {t?.('forgot_password') || 'Forgot password?'}
            </Link>
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
              <motion.span
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                {t?.('authenticating') || 'Authenticating…'}
              </motion.span>
            ) : (
              <>
                {t?.('log_in') || 'Log In'} <ArrowRight size={16} style={{ marginLeft: 6 }} />
              </>
            )}
          </motion.button>
        </form>

        <div className="auth-divider">
          <span>{t?.('new_to_mycoinwise') || 'New to MyCoinwise?'}</span>
        </div>

        <div className="auth-footer">
          <Link to="/register" className="auth-alt-btn">
            {t?.('create_free_account') || 'Create a free account'}
          </Link>
        </div>

        <div className="auth-secure-note">
          <Shield size={12} />
          <span>{t?.('encryption_badge') || '256-bit encrypted · JWT session tokens'}</span>
        </div>
      </motion.div>
    </div>
  );
}
