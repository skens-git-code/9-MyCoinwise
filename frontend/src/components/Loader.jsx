/* —————————————————————————————————————
 * Loader Component
 * Renders one of three loader variants based on the `mode` prop:
 *   - 'button'  : tiny inline dual-arc spinner for buttons.
 *   - 'inline'  : compact glass card (default for Suspense fallbacks).
 *   - 'fullscreen' / 'auth' : immersive overlay with ambient brand glow.
 *
 * Props:
 *   - fullScreen : forces the fullscreen variant (any mode).
 *   - mode       : 'inline' (default) | 'auth' | 'button'.
 *   - text       : optional status text; falls back to i18n or
 *                  variant-specific defaults.
 *
 * Accessibility & Motion:
 *   - Honors `prefers-reduced-motion` by disabling animations.
 *   - Visually-hidden text is provided for screen readers.
 *   - Uses ARIA roles (`status`, `aria-live`, `aria-busy`) for assistive tech.
 * ————————————————————————————————————— */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Check, Zap } from 'lucide-react';
import { useAppActions } from '../contexts/AppContext';
import { CoinwiseMark } from './CoinwiseBrand';

// ── Style object for visually-hidden screen reader text ──
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export default function Loader({ fullScreen = false, mode = 'inline', text }) {
  // ── i18n and reduced-motion detection ──
  const appActions = useAppActions();
  const t = appActions?.t;
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* —————————————————————————————————————
   * Button Variant
   * Small dual-arc spinner sized for inline button use.
   * ————————————————————————————————————— */
  if (mode === 'button') {
    return (
      <span
        className="loader loader--button"
        role="status"
        aria-label={text || t?.('loading') || 'Loading'}
      >
        <span className="loader-spinner" aria-hidden="true" />
        <span style={visuallyHidden}>{text || t?.('loading') || 'Loading'}</span>
      </span>
    );
  }

  // ── Derived flags for remaining variants ──
  const isFull = fullScreen || mode === 'auth';

  // ── Resolve status text (prop > i18n > variant default) ──
  const defaultStatus =
    t?.('loading_workspace') ||
    (mode === 'auth' ? 'Securing your session' : 'Preparing your workspace');
  const statusText = text || defaultStatus;

  /* —————————————————————————————————————
   * Inline Variant
   * Proportionate inline mode for Suspense fallbacks & embedded widgets.
   * ————————————————————————————————————— */
  if (!isFull) {
    return (
      <div
        className={`loader loader--inline loader--${mode}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={statusText}
      >
        {/* ── Pulsing icon badge ── */}
        <div className="loader-badge" aria-hidden="true">
          <CoinwiseMark size={24} color="#ffffff" />
        </div>

        {/* ── Status text ── */}
        <p className="loader-status-text">{statusText}</p>

        {/* ── Progress bar ── */}
        <div className="loader-track" aria-hidden="true">
          <div className="loader-fill" />
        </div>

        {/* ── SR-only fallback text ── */}
        <span style={visuallyHidden}>Loading, please wait.</span>
      </div>
    );
  }

  /* —————————————————————————————————————
   * Fullscreen / Auth Variant
   * Fixed overlay with ambient glow, brand lockup,
   * smooth progress bar, and status hint.
   * ————————————————————————————————————— */
  return (
    <div
      className={`loader loader--fullscreen loader--${mode}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusText}
    >
      <motion.div
        className="loader-modal"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* ── Brand badge with pulsing icon and checkmark ── */}
        <div className="loader-brand-badge">
          <div className="loader-brand-icon" aria-hidden="true">
            <CoinwiseMark size={36} color="#ffffff" />
          </div>
          <div className="loader-check-badge" aria-hidden="true">
            <Check size={13} strokeWidth={3} />
          </div>
        </div>

        {/* ── Brand wordmark ── */}
        <h2 className="loader-brand-title">
          My<span>Coinwise</span>
        </h2>

        {/* ── Status text ── */}
        <p className="loader-status-msg">{statusText}</p>

        {/* ── Flowing progress track ── */}
        <div className="loader-progress-track" aria-hidden="true">
          <div className="loader-progress-fill" />
        </div>

        {/* ── Bottom hint row ── */}
        <div className="loader-hint-row">
          <ArrowUpRight size={13} aria-hidden="true" />
          <span>Building your financial view</span>
        </div>
      </motion.div>

      {/* ── SR-only fallback text ── */}
      <span style={visuallyHidden}>Loading, please wait.</span>
    </div>
  );
}