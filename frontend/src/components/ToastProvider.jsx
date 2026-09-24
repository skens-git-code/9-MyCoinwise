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
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

// ── Context object (null until wrapped by ToastProvider) ──
const ToastContext = createContext(null);

/* —————————————————————————————————————
 * Toast Provider
 * ————————————————————————————————————— */
export const ToastProvider = ({ children }) => {
  // ── Active toasts (id, type, text, action) ──
  const [toasts, setToasts] = useState([]);

  /* —————————————————————————————————————
   * Show Toast
   * Adds a new toast and schedules its auto-dismiss.
   * Skips duplicates and enforces a 3-toast cap.
   * ————————————————————————————————————— */
  const showToast = useCallback((type, text, duration = 4000, action = null) => {
    const id = Date.now() + Math.random();

    setToasts(prev => {
      // Prevent parallel protected requests from stacking the same error
      // while the auth-expired handler clears the session.
      if (prev.some((toast) => toast.type === type && toast.text === text)) return prev;

      // Limit to 3 active toasts
      const newToasts = [...prev, { id, type, text, action }];
      if (newToasts.length > 3) return newToasts.slice(-3);
      return newToasts;
    });

    // ── Auto-dismiss when a positive duration is provided ──
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  // ── Remove a toast by id ──
  const hideToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Map a toast type to its border color (uses CSS vars with fallback) ──
  const getBorderColor = (type) => {
    if (type === 'success') return 'var(--success, #10b981)';
    if (type === 'error') return 'var(--danger, #ef4444)';
    if (type === 'info') return 'var(--info, #3b82f6)';
    return 'var(--glass-border)';
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}

      {/* ── Toast stack: top-right, right-aligned column ── */}
      <div
        style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 'var(--z-tooltip, 2000)',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 12,
          width: '100%',
          maxWidth: 400,
          padding: '0 20px'
        }}
      >
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              role="alert"
              aria-live="assertive"
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              layout
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 12,
                background: 'var(--glass-1)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: `1px solid ${getBorderColor(toast.type)}`,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                width: '100%'
              }}
            >
              {/* ── Type icon ── */}
              <div style={{ flexShrink: 0 }}>
                {toast.type === 'success' && <CheckCircle size={22} color="var(--success, #10b981)" />}
                {toast.type === 'error' && <AlertCircle size={22} color="var(--danger, #ef4444)" />}
                {toast.type === 'info' && <Info size={22} color="var(--info, #3b82f6)" />}
              </div>

              {/* ── Message text ── */}
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>
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
                  className="btn-primary"
                  style={{ padding: '6px 12px', fontSize: '0.85rem', height: 'auto', borderRadius: 8 }}
                >
                  {toast.action.label || 'Undo'}
                </button>
              )}

              {/* ── Dismiss (X) button ── */}
              <button
                onClick={() => hideToast(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
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