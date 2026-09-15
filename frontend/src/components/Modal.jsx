import React, { useEffect, useId, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AppContext } from '../contexts/AppContext';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  confirmText,
  onConfirm,
  isLoading,
  danger,
  confirmDisabled,
  cancelText,
  processingText,
}) => {
  const modalId = useId();
  const context = useContext(AppContext);
  const t = context?.t;
  const resolvedCancelText = cancelText || t?.('cancel') || 'Cancel';
  const resolvedProcessingText = processingText || t?.('processing') || 'Processing...';

  useEffect(() => {
    if (!isOpen) return;

    const modal = document.getElementById(modalId);
    if (modal) {
      const initialFocusable = modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      initialFocusable?.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const currentModal = document.getElementById(modalId);
      if (!currentModal) return;

      const focusableElements = currentModal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

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

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, modalId, isLoading, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          style={{ zIndex: 'var(--z-modal, 999999)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${modalId}-title`}
          onClick={() => !isLoading && onClose()}
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
                <button onClick={onClose} aria-label="Close modal" className="icon-btn">
                  <X size={18} />
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
                  {resolvedCancelText}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onConfirm}
                  disabled={isLoading || confirmDisabled}
                  style={danger ? { background: 'var(--danger)' } : {}}
                >
                  {isLoading ? resolvedProcessingText : confirmText}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Modal;
