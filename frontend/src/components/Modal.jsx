import React, { useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, confirmText, onConfirm, isLoading, danger, confirmDisabled }) => {
  const modalId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const modal = document.getElementById(modalId);
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    firstFocusable?.focus();

    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen, modalId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          style={{ zIndex: 'var(--z-modal)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${modalId}-title`}
          onClick={() => !isLoading && onClose()}
          onKeyDown={(e) => e.key === 'Escape' && !isLoading && onClose()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            id={modalId}
            className="modal-box glass"
            initial={{ y: '100%', opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '100%', opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
            style={danger ? { borderColor: 'rgba(239,68,68,0.4)', boxShadow: '0 8px 32px rgba(239,68,68,0.2)' } : {}}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 id={`${modalId}-title`} style={danger ? { color: 'var(--danger)' } : {}}>
                {title}
              </h3>
              {!isLoading && (
                <button onClick={onClose} aria-label="Close modal" className="icon-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={20} />
                </button>
              )}
            </div>

            {children}

            {confirmText && onConfirm && (
              <div className="modal-actions" style={{ marginTop: 24, display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onConfirm}
                  disabled={isLoading || confirmDisabled}
                  style={danger ? { background: 'var(--danger)' } : {}}
                >
                  {isLoading ? 'Processing...' : confirmText}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
