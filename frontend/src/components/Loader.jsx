import React from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

export default function Loader({ fullScreen = false, mode = 'inline', text }) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (mode === 'button') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.span
          animate={prefersReducedMotion ? {} : { rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderTopColor: '#ffffff',
            display: 'inline-block'
          }}
        />
      </span>
    );
  }

  const isFull = fullScreen || mode === 'auth';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        width: '100%',
        minHeight: isFull ? '100vh' : '220px',
        position: isFull ? 'fixed' : 'relative',
        inset: isFull ? 0 : 'auto',
        zIndex: isFull ? 9999 : 1,
        background: isFull ? 'var(--surface-0)' : 'transparent',
        backdropFilter: isFull ? 'blur(28px) saturate(160%)' : 'none',
        WebkitBackdropFilter: isFull ? 'blur(28px) saturate(160%)' : 'none',
        boxSizing: 'border-box',
        padding: '24px'
      }}
      aria-label="Loading..."
      aria-live="polite"
      role="status"
    >
      {/* Central Spinner Container */}
      <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Outer glowing orbital ring */}
        {!prefersReducedMotion && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'conic-gradient(from 0deg, transparent 0%, rgba(16, 185, 129, 0.2) 50%, #10b981 100%)',
              maskImage: 'radial-gradient(circle, transparent 28px, black 30px)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 28px, black 30px)',
              filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.5))'
            }}
          />
        )}

        {/* Pulsing inner ring */}
        <motion.div
          animate={prefersReducedMotion ? {} : { scale: [0.95, 1.05, 0.95], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: 46,
            height: 46,
            borderRadius: '14px',
            background: 'var(--brand-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px var(--brand-glow), inset 0 1px 1px rgba(255, 255, 255, 0.3)',
            color: '#ffffff'
          }}
        >
          <Zap size={22} />
        </motion.div>
      </div>

      {/* Branded Label */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-head)',
            fontWeight: 800,
            fontSize: isFull ? '1.2rem' : '0.95rem',
            letterSpacing: '-0.3px',
            color: 'var(--text-primary)'
          }}
        >
          MyCoinwise
        </span>
        <span
          style={{
            fontSize: '0.78rem',
            color: 'var(--brand-primary)',
            fontWeight: 600,
            letterSpacing: '0.02em',
            textTransform: 'uppercase'
          }}
        >
          {text || (mode === 'auth' ? 'Authenticating…' : 'Loading experience…')}
        </span>
      </motion.div>

      {/* Accessible screen-reader note */}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
        Loading, please wait...
      </span>
    </div>
  );
}
