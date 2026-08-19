/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((type, text, duration = 4000, action = null) => {
    const id = Date.now() + Math.random();
    
    setToasts(prev => {
      // Limit to 3 active toasts
      const newToasts = [...prev, { id, type, text, action }];
      if (newToasts.length > 3) return newToasts.slice(-3);
      return newToasts;
    });
    
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const hideToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const getBorderColor = (type) => {
    if (type === 'success') return 'var(--success, #10b981)';
    if (type === 'error') return 'var(--danger, #ef4444)';
    if (type === 'info') return 'var(--info, #3b82f6)';
    return 'var(--glass-border)';
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      
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
              <div style={{ flexShrink: 0 }}>
                {toast.type === 'success' && <CheckCircle size={22} color="var(--success, #10b981)" />}
                {toast.type === 'error' && <AlertCircle size={22} color="var(--danger, #ef4444)" />}
                {toast.type === 'info' && <Info size={22} color="var(--info, #3b82f6)" />}
              </div>
              
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {toast.text}
                </p>
              </div>
              
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

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
