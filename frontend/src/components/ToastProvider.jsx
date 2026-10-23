/* —————————————————————————————————————
 * Toast Context
 * Provides a global toast notification system.
 *
 * Exports:
 *   - ToastProvider : wrap the app to enable toasts.
 *   - useToast      : hook returning { showToast, hideToast }.
 *
 * Behavior:
 *   - Up to 3 toasts are shown at once; older ones are dropped when
 *     the limit is exceeded.
 *   - Duplicate (type, text) pairs are suppressed while an identical
 *     toast is already visible — this prevents a burst of protected
 *     requests from stacking the same error during an auth-expired
 *     session clear.
 *   - Each toast auto-dismisses after its duration (default 4000 ms).
 *   - Passing duration <= 0 keeps the toast until it is dismissed.
 *   - An optional action button (e.g. Undo) is supported; it is
 *     hidden when no action is provided.
 *   - Toasts animate in from the right and stack vertically.
 * ————————————————————————————————————— */

/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

// ── Context object (null until wrapped by ToastProvider) ──
const ToastContext = createContext(null);

// ── Standard toast auto-dismiss durations (Glitch #13) ──
// Success: 3s, Info: 4s, Warning: 5s, Error: null (persists until user dismissal)
const DEFAULT_DURATIONS = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: null,
};

/* —————————————————————————————————————
 * Toast Provider
 * ————————————————————————————————————— */
export const ToastProvider = ({ children }) => {
  // ── Active toasts (id, type, text, action) ──
  const [toasts, setToasts] = useState([]);

  /* —————————————————————————————————————
   * Show Toast
   * Adds a new toast and schedules its auto-dismiss according to its type.
   * Skips duplicates and enforces a 3-toast cap.
   * ————————————————————————————————————— */
  const showToast = useCallback((type, text, duration, action = null) => {
    const id = Date.now() + Math.random();
    const effectiveDuration =
      duration !== undefined
        ? duration
        : DEFAULT_DURATIONS[type] !== undefined
          ? DEFAULT_DURATIONS[type]
          : 4000;

    setToasts(prev => {
      // Prevent parallel protected requests from stacking the same error
      // while the auth-expired handler clears the session.
      if (prev.some((toast) => toast.type === type && toast.text === text)) return prev;

      // Limit to 3 active toasts
      const newToasts = [...prev, { id, type, text, action }];
      if (newToasts.length > 3) return newToasts.slice(-3);
      return newToasts;
    });

    // ── Auto-dismiss when a positive duration is configured ──
    if (effectiveDuration && effectiveDuration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, effectiveDuration);
    }
  }, []);

  // ── Remove a toast by id ──
  const hideToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Map a toast type to its border color (uses CSS vars with fallback) ──
  const getBorderColor = (type) => {
    if (type === 'success') return 'var(--toast-border-success, rgba(16, 185, 129, 0.40))';
    if (type === 'error') return 'var(--toast-border-danger, rgba(239, 68, 68, 0.40))';
    if (type === 'warning') return 'var(--toast-border-warning, rgba(245, 158, 11, 0.40))';
    if (type === 'info') return 'var(--toast-border-info, rgba(6, 182, 212, 0.40))';
    return 'var(--toast-border, var(--glass-border))';
  };

  // ── Map a toast type to its semantic color ──
  const getIconColor = (type) => {
    if (type === 'success') return 'var(--success, #10b981)';
    if (type === 'error') return 'var(--danger, #ef4444)';
    if (type === 'warning') return 'var(--warning, #f59e0b)';
    if (type === 'info') return 'var(--info, #06b6d4)';
    return 'var(--brand-primary, #10b981)';
  };

  // ── Map a toast type to its soft tinted background ──
  const getIconBg = (type) => {
    if (type === 'success') return 'rgba(16, 185, 129, 0.12)';
    if (type === 'error') return 'rgba(239, 68, 68, 0.12)';
    if (type === 'warning') return 'rgba(245, 158, 11, 0.12)';
    if (type === 'info') return 'rgba(6, 182, 212, 0.12)';
    return 'rgba(16, 185, 129, 0.12)';
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}

      {/* ── Toast stack: centered on mobile, top-right on desktop (Glitch #12) ── */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="toast-stack-container"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        }}
      >
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              role="alert"
              aria-live="assertive"
              className={`notification-toast toast-${toast.type}`}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.93, transition: { duration: 0.18, ease: 'easeOut' } }}
              layout
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 14,
                // Opaque theme surface matching active theme (Glitch #12)
                background: 'var(--toast-bg, var(--surface-1, #ffffff))',
                color: 'var(--toast-text, var(--text-primary))',
                border: `1px solid ${getBorderColor(toast.type)}`,
                boxShadow: 'var(--toast-shadow, 0 12px 32px rgba(0, 0, 0, 0.18))',
                width: '100%',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* ── Left status accent stripe ── */}
              <div
                className="toast-indicator-stripe"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  right: 'auto',
                  width: 4,
                  maxWidth: 4,
                  minWidth: 4,
                  background: getIconColor(toast.type),
                  borderRadius: '14px 0 0 14px',
                  zIndex: 1,
                }}
                aria-hidden="true"
              />

              {/* ── Status icon badge ── */}
              <div
                className="toast-icon-wrap"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 2,
                  background: getIconBg(toast.type),
                  color: getIconColor(toast.type)
                }}
              >
                {toast.type === 'success' && <CheckCircle size={19} color={getIconColor(toast.type)} />}
                {toast.type === 'error' && <AlertCircle size={19} color={getIconColor(toast.type)} />}
                {toast.type === 'warning' && <AlertTriangle size={19} color={getIconColor(toast.type)} />}
                {toast.type === 'info' && <Info size={19} color={getIconColor(toast.type)} />}
              </div>

              {/* ── Message text ── */}
              <div className="toast-message-wrap" style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 2 }}>
                <p
                  className="toast-message"
                  style={{
                    margin: 0,
                    fontSize: '0.92rem',
                    fontWeight: 500,
                    lineHeight: 1.45,
                    color: 'var(--toast-text, var(--text-primary))'
                  }}
                >
                  {toast.text}
                </p>
              </div>

              {/* ── Optional action button (e.g. Undo) ── */}
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action.onClick();
                    hideToast(toast.id);
                  }}
                  className="toast-action-btn"
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    height: 'auto',
                    borderRadius: 8,
                    border: '1px solid var(--toast-border, var(--glass-border))',
                    background: 'var(--toast-action-bg, rgba(125, 125, 125, 0.1))',
                    color: 'var(--toast-text, var(--text-primary))',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  {toast.action.label || 'Undo'}
                </button>
              )}

              {/* ── Dismiss (X) button ── */}
              <button
                onClick={() => hideToast(toast.id)}
                className="toast-close-btn"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--toast-text-muted, var(--text-muted))',
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginLeft: 8
                }}
                aria-label="Close notification"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

/* —————————————————————————————————————
 * useToast Hook
 * Returns the toast context, throwing when used outside the provider
 * so misconfigurations are caught at the call site.
 * ————————————————————————————————————— */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};