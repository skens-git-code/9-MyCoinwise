/* —————————————————————————————————————
 * Loader Component
 * Renders one of three loader variants based on the `mode` prop:
 *   - 'button'  : tiny inline spinner for buttons.
 *   - 'inline'  : compact card (default for Suspense fallbacks).
 *   - full      : fullscreen/auth overlay with ambient glow.
 *
 * Props:
 *   - fullScreen : forces the fullscreen variant (any mode).
 *   - mode       : 'inline' (default) | 'auth' | 'button'.
 *   - text       : optional status text; falls back to i18n or
 *                  variant-specific defaults.
 *
 * Behavior:
 *   - Honors `prefers-reduced-motion` by disabling animations and
 *     using a static fill instead of a moving bar.
 *   - Visually-hidden text is provided for screen readers.
 *   - Uses ARIA roles (`status`, `aria-live`, `aria-busy`) for
 *     assistive tech.
 * ————————————————————————————————————— */

import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Check, Zap } from 'lucide-react';
import { AppContext } from '../contexts/AppContext';

// ── Style object for the visually-hidden accessibility text ──
const visuallyHidden = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 };

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function Loader({ fullScreen = false, mode = 'inline', text }) {
  // ── i18n and reduced-motion detection ──
  const appContext = useContext(AppContext);
  const t = appContext?.t;
  const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* —————————————————————————————————————
   * Button Variant
   * Small circular spinner sized for inline button use.
   * ————————————————————————————————————— */
  if (mode === 'button') {
    return <span className="loader loader--button" role="status" aria-label={text || t?.('loading') || 'Loading'}>
      <motion.span
        aria-hidden="true"
        animate={prefersReducedMotion ? {} : { rotate: 360 }}
        transition={{ duration: .85, repeat: Infinity, ease: 'linear' }}
        style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }}
      />
      <span style={visuallyHidden}>{text || t?.('loading') || 'Loading'}</span>
    </span>;
  }

  // ── Derived flags for the remaining variants ──
  const isFull = fullScreen || mode === 'auth';

  // ── Resolve the status text (prop > i18n > variant default) ──
  const defaultStatus = t?.('loading_workspace') || (mode === 'auth' ? 'Securing your session' : 'Preparing your workspace');
  const statusText = text || defaultStatus;

  /* —————————————————————————————————————
   * Inline Variant
   * Proportionate inline mode for Suspense fallbacks and embedded
   * widgets: icon + status text + thin progress bar.
   * ————————————————————————————————————— */
  if (!isFull) {
    return (
      <div
        className={`loader loader--inline loader--${mode}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={statusText}
        style={{
          position: 'relative',
          minHeight: 180,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: 24,
          boxSizing: 'border-box',
          color: 'var(--text-primary)',
        }}
      >
        {/* ── Pulsing icon badge ── */}
        <motion.div
          aria-hidden="true"
          animate={prefersReducedMotion ? {} : { scale: [1, 1.08, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: 46,
            height: 46,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 14,
            color: '#fff',
            background: 'linear-gradient(135deg, #10b981, #06b6d4, #8b5cf6)',
            boxShadow: '0 8px 24px rgba(16,185,129,0.3), inset 0 1px rgba(255,255,255,0.4)',
            willChange: 'transform',
          }}
        >
          <Zap size={22} strokeWidth={2.4} />
        </motion.div>

        {/* ── Status text ── */}
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.86rem', fontWeight: 500 }}>
          {statusText}
        </p>

        {/* ── Progress bar (static when reduced motion) ── */}
        <div
          style={{
            height: 4,
            width: 140,
            overflow: 'hidden',
            borderRadius: 99,
            background: 'rgba(148,163,184,0.18)',
          }}
          aria-hidden="true"
        >
          <motion.div
            animate={prefersReducedMotion ? { width: '40%' } : { x: ['-100%', '250%'] }}
            transition={prefersReducedMotion ? {} : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              height: '100%',
              width: '40%',
              borderRadius: 99,
              background: 'linear-gradient(90deg, #10b981, #38bdf8, #8b5cf6)',
              boxShadow: '0 0 10px rgba(56,189,248,0.5)',
              willChange: 'transform',
            }}
          />
        </div>

        {/* ── SR-only fallback text ── */}
        <span style={visuallyHidden}>Loading, please wait.</span>
      </div>
    );
  }

  /* —————————————————————————————————————
   * Fullscreen / Auth Variant
   * Fixed overlay with a soft ambient radial glow, brand lockup,
   * progress bar, and a status hint.
   * ————————————————————————————————————— */
  return (
    <div
      className={`loader loader--fullscreen loader--${mode}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusText}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        minHeight: '100dvh',
        width: '100%',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        boxSizing: 'border-box',
        color: 'var(--text-primary)',
        background: 'radial-gradient(circle at 50% 30%, rgba(16,185,129,0.14), transparent 45%), radial-gradient(circle at 80% 80%, rgba(139,92,246,0.10), transparent 50%), var(--surface-0)',
      }}
    >
      {/* ── Ambient background glow orbs (decorative) ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden="true">
        {/* ── Blue glow orb ── */}
        <div
          style={{
            position: 'absolute',
            width: 380,
            height: 380,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 70%)',
            filter: 'blur(50px)',
            top: '45%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        {/* ── Emerald glow orb ── */}
        <div
          style={{
            position: 'absolute',
            width: 520,
            height: 520,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)',
            filter: 'blur(60px)',
            top: '52%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      {/* ── Centered content stack ── */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          position: 'relative',
          width: 'min(100%, 360px)',
          textAlign: 'center',
          zIndex: 2,
          willChange: 'opacity, transform',
        }}
      >
        {/* ── Brand badge with pulsing icon and checkmark ── */}
        <div style={{ display: 'inline-flex', position: 'relative', marginBottom: 26 }}>
          <motion.div
            aria-hidden="true"
            animate={prefersReducedMotion ? {} : { scale: [1, 1.08, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: 76,
              height: 76,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 24,
              color: '#fff',
              background: 'linear-gradient(135deg, #10b981, #06b6d4, #8b5cf6)',
              boxShadow: '0 16px 42px rgba(16,185,129,0.35), inset 0 1px rgba(255,255,255,0.4)',
              willChange: 'transform',
            }}
          >
            <Zap size={32} strokeWidth={2.4} />
          </motion.div>

          {/* ── Checkmark badge pinned to the icon ── */}
          <div
            style={{
              position: 'absolute',
              right: -7,
              bottom: -7,
              width: 26,
              height: 26,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '50%',
              color: '#fff',
              background: '#10b981',
              boxShadow: '0 0 0 3px var(--surface-0, #0f172a), 0 4px 12px rgba(16,185,129,0.35)',
            }}
          >
            <Check size={13} strokeWidth={3} />
          </div>
        </div>

        {/* ── Brand wordmark ── */}
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.35rem, 4vw, 1.7rem)', fontWeight: 800, letterSpacing: '-0.04em' }}>
          My<span style={{ color: 'var(--brand-primary)' }}>Coinwise</span>
        </div>

        {/* ── Status text ── */}
        <p style={{ margin: '8px 0 24px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{statusText}</p>

        {/* ── Progress bar (static when reduced motion) ── */}
        <div
          style={{
            height: 6,
            width: '100%',
            overflow: 'hidden',
            borderRadius: 99,
            background: 'rgba(148,163,184,0.16)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
          }}
          aria-hidden="true"
        >
          <motion.div
            animate={prefersReducedMotion ? { width: '40%' } : { x: ['-100%', '250%'] }}
            transition={prefersReducedMotion ? {} : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              height: '100%',
              width: '40%',
              borderRadius: 99,
              background: 'linear-gradient(90deg, #10b981, #38bdf8, #8b5cf6)',
              boxShadow: '0 0 14px rgba(56,189,248,0.55)',
              willChange: 'transform',
            }}
          />
        </div>

        {/* ── Bottom hint row ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            alignItems: 'center',
            marginTop: 18,
            color: 'var(--text-secondary)',
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <ArrowUpRight size={13} aria-hidden="true" /> <span>Building your financial view</span>
        </div>
      </motion.div>

      {/* ── SR-only fallback text ── */}
      <span style={visuallyHidden}>Loading, please wait.</span>
    </div>
  );
}