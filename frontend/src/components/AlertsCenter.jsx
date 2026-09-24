/* —————————————————————————————————————
 * Alerts Center Component
 * Modal dialog that lists smart alerts, groups them by severity, and
 * lets the user dismiss individual alerts or all at once.
 *
 * Props:
 *   - alerts  : array of { id?, type, title?, message, timestamp? }.
 *   - onClose : callback fired on overlay click, Escape, or close button.
 *
 * Key behaviors:
 *   - Alerts are enriched with a stable ID (`_sid`) for keying and
 *     dismissal tracking.
 *   - Dismissed IDs live in local state and filter the visible list.
 *   - When there are no visible alerts, a success empty-state is shown.
 *   - Focus is trapped inside the modal; Escape closes it; the close
 *     button receives initial focus.
 *   - Framer Motion drives the panel and item enter/exit animations.
 * ————————————————————————————————————— */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, X, AlertTriangle, Info, CheckCircle,
  Lightbulb, ShieldAlert, Trash2
} from 'lucide-react';

/* —————————————————————————————————————
 * Type Configuration
 * Maps each alert type to its color, background, border, icon, and
 * display label. Unknown types fall back to `info` at render time.
 * ————————————————————————————————————— */
const TYPE_CONFIG = {
  danger:  { color: 'var(--danger)',          bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.22)',   icon: ShieldAlert,   label: 'Critical'  },
  warning: { color: 'var(--warning)',         bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.22)',  icon: AlertTriangle, label: 'Warning'   },
  info:    { color: 'var(--info)',            bg: 'rgba(6,182,212,0.10)',   border: 'rgba(6,182,212,0.22)',   icon: Info,          label: 'Info'      },
  success: { color: 'var(--success)',         bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.22)',  icon: CheckCircle,   label: 'Good news' },
  tip:     { color: 'var(--brand-secondary)', bg: 'rgba(5,150,105,0.10)',  border: 'rgba(5,150,105,0.22)',   icon: Lightbulb,     label: 'Tip'       },
};

/* —————————————————————————————————————
 * Stable ID Helper
 * Returns the alert's own id when present, otherwise a deterministic
 * composite key from type, index, and message prefix.
 * ————————————————————————————————————— */
function stableId(alert, index) {
  return alert.id ?? `${alert.type ?? 'info'}-${index}-${String(alert.message ?? '').slice(0, 24)}`;
}

/* —————————————————————————————————————
 * Animation Variants
 * ————————————————————————————————————— */

// ── Panel: fade + slide + slight scale ──
const panelVariants = {
  hidden:  { opacity: 0, y: 28, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 28 } },
  exit:    { opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.18 } },
};

// ── Item: fade + slide; exit collapses height for a smooth removal ──
const itemVariants = {
  hidden:  { opacity: 0, x: -12 },
  visible: (i) => ({ opacity: 1, x: 0, transition: { delay: i * 0.05, type: 'spring', stiffness: 350, damping: 28 } }),
  exit:    { opacity: 0, x: 24, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.22 } },
};

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function AlertsCenter({ alerts = [], onClose }) {
  // ── Local set of dismissed stable IDs ──
  const [dismissed, setDismissed] = useState(() => new Set());

  // ── Refs for focus trapping and initial focus ──
  const modalRef    = useRef(null);
  const closeBtnRef = useRef(null);

  // ── Enrich alerts with a stable ID for keying and dismissal ──
  const enriched = useMemo(
    () => alerts.map((a, i) => ({ ...a, _sid: stableId(a, i) })),
    [alerts]
  );

  // ── Only alerts that have not been dismissed ──
  const visible = useMemo(
    () => enriched.filter(a => !dismissed.has(a._sid)),
    [enriched, dismissed]
  );

  // ── Count of urgent alerts (danger + warning) ──
  const urgentCount = useMemo(
    () => visible.filter(a => a.type === 'danger' || a.type === 'warning').length,
    [visible]
  );

  // ── Dismiss a single alert by its stable ID ──
  const dismissOne = useCallback((sid) => {
    setDismissed(prev => new Set([...prev, sid]));
  }, []);

  // ── Dismiss every currently enriched alert ──
  const dismissAll = useCallback(() => {
    setDismissed(new Set(enriched.map(a => a._sid)));
  }, [enriched]);

  /* —————————————————————————————————————
   * Focus Management
   * Focus the close button on mount, trap Tab inside the modal, and
   * close on Escape.
   * ————————————————————————————————————— */
  useEffect(() => {
    closeBtnRef.current?.focus();
    const modal = modalRef.current;
    if (!modal) return;

    // ── Collect focusable elements inside the modal ──
    const getFocusable = () => [
      ...modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ];

    // ── Escape closes; Tab cycles within the modal ──
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    // ── Overlay: closes the modal on click ──
    <motion.div
      className="ac-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      aria-hidden="true"
    >
      {/* ── Modal panel: stops overlay click propagation ── */}
      <motion.div
        ref={modalRef}
        className="ac-panel glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-title"
        variants={panelVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header: title, urgent badge, count, close button ── */}
        <div className="ac-header">
          <div className="ac-title-group">
            <div className="ac-title-icon">
              <Bell size={18} />
            </div>
            <h2 id="ac-title" className="ac-title">Smart Alerts</h2>

            {/* ── Live region announces the urgent count ── */}
            <span role="status" aria-live="polite">
              {urgentCount > 0 && (
                <motion.span
                  className="ac-urgent-badge"
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                >
                  {urgentCount} urgent
                </motion.span>
              )}
            </span>

            {/* ── Non-urgent count badge (shown when no urgent alerts) ── */}
            {visible.length > 0 && urgentCount === 0 && (
              <span className="ac-count-badge">{visible.length}</span>
            )}
          </div>

          {/* ── Close button ── */}
          <motion.button
            ref={closeBtnRef}
            className="ibtn ac-close-btn"
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label="Close alerts"
          >
            <X size={16} />
          </motion.button>
        </div>

        {/* ── List: empty state or alert items ── */}
        <div className="ac-list" role="list">
          <AnimatePresence mode="popLayout">
            {visible.length === 0 ? (
              /* ── Empty state ── */
              <motion.div
                key="ac-empty"
                className="ac-empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="ac-empty-icon">
                  <CheckCircle size={40} />
                </div>
                <p className="ac-empty-title">All clear!</p>
                <p className="ac-empty-sub">No active alerts — keep up the great habits.</p>
              </motion.div>
            ) : (
              /* ── Alert items ── */
              visible.map((alert, i) => {
                const cfg  = TYPE_CONFIG[alert.type] ?? TYPE_CONFIG.info;
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={alert._sid}
                    className="ac-item"
                    role="listitem"
                    custom={i}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    style={{
                      '--ac-color':  cfg.color,
                      '--ac-bg':     cfg.bg,
                      '--ac-border': cfg.border,
                    }}
                  >
                    {/* ── Colored stripe ── */}
                    <div className="ac-item-stripe" aria-hidden="true" />

                    {/* ── Type icon ── */}
                    <div className="ac-item-icon-box">
                      <Icon size={15} />
                    </div>

                    {/* ── Body: type label, timestamp, title, message ── */}
                    <div className="ac-item-body">
                      <div className="ac-item-meta">
                        <span className="ac-item-type-label">{cfg.label}</span>
                        {alert.timestamp && (
                          <span className="ac-item-time">
                            {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      {alert.title && <p className="ac-item-title">{alert.title}</p>}
                      <p className="ac-item-msg">{alert.message}</p>
                    </div>

                    {/* ── Dismiss button for this alert ── */}
                    <motion.button
                      className="ac-dismiss-btn"
                      aria-label={`Dismiss: ${alert.title || alert.message}`}
                      onClick={() => dismissOne(alert._sid)}
                      whileHover={{ scale: 1.18 }}
                      whileTap={{ scale: 0.88 }}
                    >
                      <X size={12} />
                    </motion.button>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* ── Footer: dismiss-all button (only when there are alerts) ── */}
        {visible.length > 0 && (
          <div className="ac-footer">
            <motion.button
              className="ac-dismiss-all-btn"
              onClick={dismissAll}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
            >
              <Trash2 size={13} />
              Dismiss all ({visible.length})
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}