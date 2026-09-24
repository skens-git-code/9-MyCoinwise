/* —————————————————————————————————————
 * Modal Component
 * Reusable dialog rendered into document.body via a portal, with
 * focus management, Escape-to-close, Tab trapping, and an optional
 * confirm / cancel action bar.
 *
 * Props:
 *   - isOpen          : controls visibility.
 *   - onClose         : callback to dismiss the modal.
 *   - title           : header text.
 *   - children        : modal body content.
 *   - confirmText     : label for the confirm button; when provided
 *                       together with `onConfirm`, the action bar
 *                       is rendered.
 *   - onConfirm       : callback for the confirm button.
 *   - isLoading       : blocks interactions and shows processing text.
 *   - danger          : applies red styling to the panel and confirm
 *                       button.
 *   - confirmDisabled : disables the confirm button.
 *   - cancelText      : overrides the cancel button label.
 *   - processingText  : overrides the "Processing..." label.
 *
 * Behavior:
 *   - Escape closes unless isLoading; backdrop click closes unless
 *     isLoading.
 *   - Tab cycles focus within the modal.
 *   - Initial focus goes to the first focusable element on open.
 *   - `useId` generates an accessible title id for `aria-labelledby`.
 * ————————————————————————————————————— */

import React, { useEffect, useId, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AppContext } from '../contexts/AppContext';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
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
  // ── Stable id for aria-labelledby and DOM lookups ──
  const modalId = useId();

  // ── i18n and fallback labels ──
  const context = useContext(AppContext);
  const t = context?.t;
  const resolvedCancelText = cancelText || t?.('cancel') || 'Cancel';
  const resolvedProcessingText = processingText || t?.('processing') || 'Processing...';

  /* —————————————————————————————————————
   * Focus Management
   * On open: focus the first focusable element. While open: Escape
   * closes (unless loading) and Tab cycles within the modal.
   * ————————————————————————————————————— */
  useEffect(() => {
    if (!isOpen) return;

    // ── Initial focus on the first focusable element ──
    const modal = document.getElementById(modalId);
    if (modal) {
      const initialFocusable = modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      initialFocusable?.focus();
    }

    // ── Keyboard handler: Escape + Tab trapping ──
    const handleKeyDown = (e) => {
      // Escape closes unless a request is in flight
      if (e.key === 'Escape' && !isLoading) {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Re-query focusable elements on every Tab press
      const currentModal = document.getElementById(modalId);
      if (!currentModal) return;

      const focusableElements = currentModal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      // Shift+Tab on the first element wraps to the last
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      // Tab on the last element wraps to the first
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
        // ── Backdrop: click closes unless loading ──
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
          {/* ── Modal panel: stops propagation so clicks inside stay inside ── */}
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
            {/* ── Header: title and close button ── */}
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

            {/* ── Body content ── */}
            {children}

            {/* ── Action bar (only when confirmText + onConfirm are provided) ── */}
            {confirmText && onConfirm && (
              <div className="modal-actions" style={{ marginTop: 24, display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                {/* ── Cancel button ── */}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  {resolvedCancelText}
                </button>

                {/* ── Confirm button (shows processing text while loading) ── */}
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