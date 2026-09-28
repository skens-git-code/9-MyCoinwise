import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ToastProvider';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Missing or invalid verification link.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    const verify = async () => {
      try {
        await api.verifyEmail(token);
        if (isMounted) {
          setSuccess(true);
          showToast('success', 'Email verified successfully!');
          setTimeout(() => navigate('/login?verified=1', { replace: true }), 2500);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err.response?.data?.error ||
            'Verification link is invalid or has expired. Please request a new one.'
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    verify();
    return () => { isMounted = false; };
  }, [token, navigate, showToast]);

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
        style={{ textAlign: 'center', padding: '40px 32px' }}
      >
        <div className="auth-logo" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <div className="auth-logo-icon">
            <Zap size={26} />
          </div>
          <span className="auth-logo-text">MyCoinwise</span>
        </div>

        {loading && (
          <div>
            <Loader2 size={44} className="spin" style={{ color: 'var(--brand-primary)', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>Verifying your email…</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Please wait while we confirm your email address.
            </p>
          </div>
        )}

        {!loading && success && (
          <div>
            <CheckCircle2 size={48} style={{ color: 'var(--success, #10b981)', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 8px' }}>Email Verified!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 24px' }}>
              Your email has been confirmed. Redirecting you to login…
            </p>
            <Link
              to="/login?verified=1"
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 auto' }}
            >
              Continue to Login <ArrowRight size={16} />
            </Link>
          </div>
        )}

        {!loading && error && (
          <div>
            <AlertTriangle size={48} style={{ color: 'var(--danger, #ef4444)', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 8px' }}>Verification Failed</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 24px' }}>
              {error}
            </p>
            <Link
              to="/login"
              className="auth-alt-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Back to Login
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
