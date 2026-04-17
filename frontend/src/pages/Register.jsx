import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { AppContext } from '../App';
import { User, Mail, KeyRound, AlertTriangle, Zap, Eye, EyeOff, ArrowRight, Shield, CheckCircle2 } from 'lucide-react';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AppContext);
  const navigate = useNavigate();

  const pwdStrength = password.length === 0 ? null
    : password.length < 6 ? 'weak'
      : password.length < 10 ? 'fair'
        : 'strong';

  const strengthColor = { weak: '#ef4444', fair: '#f59e0b', strong: '#10b981' };
  const strengthWidth = { weak: '33%', fair: '66%', strong: '100%' };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await api.register({ username, email, password });
      await login(token, user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Background orbs */}
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
        {/* Logo */}
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
          <h1>Create account</h1>
          <p>Start your journey to smarter budgeting</p>
        </div>

        {/* Benefits list */}
        <ul className="auth-benefits">
          {['Secure JWT authentication', 'Track income & expenses', 'Smart AI spending alerts'].map(b => (
            <li key={b}><CheckCircle2 size={14} />{b}</li>
          ))}
        </ul>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="auth-alert"
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
          <div className="form-group">
            <label htmlFor="reg-name">Full Name</label>
            <div className="input-wrapper">
              <User className="input-icon" size={17} />
              <input
                id="reg-name"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="name"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Email Address</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={17} />
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Password</label>
            <div className="input-wrapper">
              <KeyRound className="input-icon" size={17} />
              <input
                id="reg-password"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Min. 6 characters"
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
            {/* Password strength bar */}
            {pwdStrength && (
              <div className="pwd-strength-bar">
                <motion.div
                  className="pwd-strength-fill"
                  initial={{ width: 0 }}
                  animate={{ width: strengthWidth[pwdStrength], background: strengthColor[pwdStrength] }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
            {pwdStrength && (
              <small className="form-hint" style={{ color: strengthColor[pwdStrength] }}>
                Password strength: {pwdStrength}
              </small>
            )}
          </div>

          <motion.button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? (
              <motion.span
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                Creating Account…
              </motion.span>
            ) : (
              <>
                Create Account <ArrowRight size={16} style={{ marginLeft: 6 }} />
              </>
            )}
          </motion.button>
        </form>

        <div className="auth-divider">
          <span>Already have an account?</span>
        </div>

        <div className="auth-footer">
          <Link to="/login" className="auth-alt-btn">
            Sign in instead
          </Link>
        </div>

        <div className="auth-secure-note">
          <Shield size={12} />
          <span>256-bit encrypted · bcrypt password hashing</span>
        </div>
      </motion.div>
    </div>
  );
}
