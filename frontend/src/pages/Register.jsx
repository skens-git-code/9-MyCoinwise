import React, { useState, useContext, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { AppContext } from '../contexts/AppContext';
import { LANGUAGES } from '../services/i18n';
import {
  User, Mail, KeyRound, AlertTriangle, Zap, Eye, EyeOff,
  ArrowRight, Shield, CheckCircle2, Lock, Globe
} from 'lucide-react';

// ==================== PASSWORD STRENGTH ====================
const getPasswordStrength = (password) => {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;
  return Math.min(score, 5);
};

const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
const strengthColors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981'];
const strengthWidths = ['20%', '40%', '60%', '75%', '90%', '100%'];

// ==================== MAIN COMPONENT ====================
export default function Register() {
  const { login, t, lang = 'en', setLanguage } = useContext(AppContext);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  });

  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);

  // ---------- Validation ----------
  const validateField = (name, value) => {
    switch (name) {
      case 'username':
        return value.trim().length < 2 ? (t?.('username_min_chars') || 'Username must be at least 2 characters.') : '';
      case 'email':
        return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? (t?.('invalid_email') || 'Enter a valid email address.') : '';
      case 'password':
        if (value.length < 8) return t?.('password_min_chars') || 'Password must be at least 8 characters.';
        if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) return t?.('password_case_req') || 'Include both uppercase and lowercase letters.';
        if (!/\d/.test(value)) return t?.('password_num_req') || 'Include at least one number.';
        if (!/[^a-zA-Z0-9]/.test(value)) return t?.('password_special_req') || 'Include at least one special character.';
        return '';
      case 'confirmPassword':
        return value !== formData.password ? (t?.('passwords_do_not_match') || 'Passwords do not match.') : '';
      case 'agreeTerms':
        return !value ? (t?.('accept_terms_req') || 'You must accept the Terms & Conditions.') : '';
      default:
        return '';
    }
  };

  const validateForm = () => {
    const errors = {};
    Object.keys(formData).forEach(key => {
      const err = validateField(key, formData[key]);
      if (err) errors[key] = err;
    });
    setFieldErrors(errors);
    return errors;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
    if (error) setError('');
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
    const err = validateField(name, formData[name]);
    setFieldErrors(prev => ({ ...prev, [name]: err }));
  };

  // ---------- Submit ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      const firstError = Object.keys(validationErrors)[0];
      if (firstError === 'username') nameInputRef.current?.focus();
      else if (firstError === 'email') emailInputRef.current?.focus();
      else if (firstError === 'password') passwordInputRef.current?.focus();
      else if (firstError === 'confirmPassword') confirmPasswordInputRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await api.register({
        username: formData.username.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });
      await login(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      let errorMsg = t?.('registration_failed') || 'Registration failed. Please try again.';
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

  const strengthScore = getPasswordStrength(formData.password);
  const strengthLabel = strengthLabels[strengthScore];
  const strengthColor = strengthColors[strengthScore];
  const strengthWidth = strengthWidths[strengthScore];

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
          <h1>{t?.('create_account_title') || 'Create Account'}</h1>
          <p>{t?.('create_account_subtitle') || 'Start your journey to smarter budgeting'}</p>
        </div>

        <ul className="auth-benefits">
          {[
            t?.('encryption_badge') || 'Secure JWT authentication',
            t?.('track_plan_grow') || 'Track income & expenses',
            t?.('ai_insights') || 'Smart AI spending alerts'
          ].map(b => (
            <li key={b}><CheckCircle2 size={14} />{b}</li>
          ))}
        </ul>

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
          {/* Username */}
          <div className={`form-group ${fieldErrors.username && touched.username ? 'has-error' : ''}`}>
            <label htmlFor="reg-username">{t?.('username') || 'Username'}</label>
            <div className="input-wrapper">
              <User className="input-icon" size={17} />
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
                placeholder="johndoe"
                disabled={loading}
                aria-describedby={fieldErrors.username ? 'username-error' : undefined}
              />
            </div>
            {fieldErrors.username && touched.username && (
              <div id="username-error" className="form-error" role="alert">{fieldErrors.username}</div>
            )}
          </div>

          {/* Email */}
          <div className={`form-group ${fieldErrors.email && touched.email ? 'has-error' : ''}`}>
            <label htmlFor="reg-email">{t?.('email_address') || 'Email Address'}</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={17} />
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
            <label htmlFor="reg-password">{t?.('password') || 'Password'}</label>
            <div className="input-wrapper">
              <KeyRound className="input-icon" size={17} />
              <input
                ref={passwordInputRef}
                id="reg-password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                autoComplete="new-password"
                placeholder={t?.('password_placeholder') || '••••••••'}
                disabled={loading}
                aria-describedby={fieldErrors.password ? 'password-error' : 'password-requirements'}
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
            {/* Password strength bar */}
            {formData.password.length > 0 && (
              <div className="pwd-strength-bar">
                <motion.div
                  className="pwd-strength-fill"
                  initial={{ width: 0 }}
                  animate={{ width: strengthWidth, background: strengthColor }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
            <div id="password-requirements" className="form-hint" style={{ color: strengthColor }}>
              {formData.password.length > 0 ? `${strengthLabel}` : 'Use 8+ chars with uppercase, lowercase, number, special.'}
            </div>
          </div>

          {/* Confirm Password */}
          <div className={`form-group ${fieldErrors.confirmPassword && touched.confirmPassword ? 'has-error' : ''}`}>
            <label htmlFor="reg-confirm">{t?.('confirm_password') || 'Confirm Password'}</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={17} />
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
                placeholder={t?.('password_placeholder') || '••••••••'}
                disabled={loading}
                aria-describedby={fieldErrors.confirmPassword ? 'confirm-error' : undefined}
              />
              <button
                type="button"
                className="input-suffix-btn"
                onClick={() => setShowConfirmPwd(p => !p)}
                tabIndex={-1}
                aria-label={showConfirmPwd ? 'Hide confirm password' : 'Show confirm password'}
                disabled={loading}
              >
                {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.confirmPassword && touched.confirmPassword && (
              <div id="confirm-error" className="form-error" role="alert">{fieldErrors.confirmPassword}</div>
            )}
          </div>

          {/* Terms & Conditions */}
          <div className={`form-group checkbox-group ${fieldErrors.agreeTerms && touched.agreeTerms ? 'has-error' : ''}`}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="agreeTerms"
                checked={formData.agreeTerms}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={loading}
              />
              <span>{t?.('agree_to_terms') || 'I agree to the Terms & Conditions'}</span>
            </label>
            {fieldErrors.agreeTerms && touched.agreeTerms && (
              <div className="form-error" role="alert">{fieldErrors.agreeTerms}</div>
            )}
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
                {t?.('creating_account') || 'Creating account…'}
              </motion.span>
            ) : (
              <>
                {t?.('create_account_title') || 'Create Account'} <ArrowRight size={16} style={{ marginLeft: 6 }} />
              </>
            )}
          </motion.button>
        </form>

        <div className="auth-divider">
          <span>{t?.('already_have_account') || 'Already have an account?'}</span>
        </div>

        <div className="auth-footer">
          <Link to="/login" className="auth-alt-btn">
            {t?.('sign_in') || 'Sign in instead'}
          </Link>
        </div>

        <div className="auth-secure-note">
          <Shield size={12} />
          <span>{t?.('encryption_badge') || '256-bit encrypted · secure sessions'}</span>
        </div>
      </motion.div>
    </div>
  );
}
