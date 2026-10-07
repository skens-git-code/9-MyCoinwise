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

import React, { useContext, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AppActionsContext } from '../contexts/AppContext';
import { useFocusTrap } from '../hooks/useFocusTrap';

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
  // ── Stable id for aria-labelledby ──
  const modalId = useId();

  // ── Panel ref for the shared focus trap ──
  const panelRef = useRef(null);

  // ── i18n and fallback labels ──
  const actions = useContext(AppActionsContext);
  const t = actions?.t;
  const resolvedCancelText = cancelText || t?.('cancel') || 'Cancel';
  const resolvedProcessingText = processingText || t?.('processing') || 'Processing...';

  /* —————————————————————————————————————
   * Focus management
   * Delegated to the shared `useFocusTrap` hook so every dialog in the app
   * behaves identically: focus enters the panel on open, Tab cycles inside it,
   * Escape closes it, background scroll is locked, the Back gesture closes it
   * instead of navigating away, and focus returns to the trigger on close.
   * The previous inline implementation covered only the first three, and it
   * located the panel with `document.getElementById` (racy under `createPortal`).
   * ————————————————————————————————————— */
  useFocusTrap({
    isOpen,
    onClose,
    containerRef: panelRef,
    // While a request is in flight, Escape must not discard the user's work.
    closeOnEscape: !isLoading,
  });

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
            ref={panelRef}
            className="modal-box glass"
            /* `tabIndex={-1}` lets the trap focus the panel itself when it has no
               focusable children (e.g. a pure confirmation), instead of leaving
               focus behind the dialog. */
            tabIndex={-1}
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