import React from 'react';
import { motion } from 'framer-motion';

export default function Loader({ fullScreen = false, mode = 'inline' }) {
  // mode: 'auth' (with text), 'inline' (just the pulse), 'button' (very tiny)
  
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const containerStyle = fullScreen
    ? {
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        background: 'var(--surface-0)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      }
    : {
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: mode === 'button' ? '0' : '40px', 
        flexDirection: 'column', gap: '16px',
        width: '100%', height: '100%'
      };

  const size = mode === 'button' ? 20 : mode === 'auth' ? 64 : 48;

  const pulseTransition = prefersReducedMotion
    ? {}
    : {
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      };

  return (
    <div
      style={containerStyle}
      aria-label="Loading..."
      aria-live="polite"
      role="status"
    >
      <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Core glowing dot */}
        <motion.div
          animate={prefersReducedMotion ? {} : { scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
          transition={pulseTransition}
          style={{
            position: 'absolute',
            width: size * 0.4,
            height: size * 0.4,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981, #38bdf8)',
            boxShadow: '0 0 16px rgba(56, 189, 248, 0.6), 0 0 32px rgba(16, 185, 129, 0.4)'
          }}
        />
        
        {/* Expanding ripple ring 1 */}
        {!prefersReducedMotion && (
          <motion.div
            animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
            transition={{ ...pulseTransition, duration: 2 }}
            style={{
              position: 'absolute',
              width: size * 0.5,
              height: size * 0.5,
              borderRadius: '50%',
              border: '2px solid rgba(56, 189, 248, 0.5)',
            }}
          />
        )}
      </div>

      {mode === 'auth' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '16px' }}
        >
          <span style={{
            fontFamily: 'var(--font-head)',
            fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.5px',
            color: 'var(--text-primary)'
          }}>
            MyCoinwise
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
            Authenticating...
          </span>
        </motion.div>
      )}

      {/* Screen reader only text */}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
        Loading, please wait...
      </span>
    </div>
  );
}
