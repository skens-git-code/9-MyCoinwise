import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/* ── Keyframes injected once into <head> ────────────────────────────────── */
const KEYFRAMES = `
@keyframes blobMorph {
  0%   { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
  25%  { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
  50%  { border-radius: 50% 60% 30% 40% / 40% 50% 60% 50%; }
  75%  { border-radius: 40% 30% 60% 70% / 60% 40% 50% 40%; }
  100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
}
@keyframes shimmerText {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
`;

let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.innerHTML = KEYFRAMES;
  document.head.appendChild(style);
  injected = true;
}

export default function Loader({ fullScreen = false }) {
  injectKeyframes();

  /* ── Respect OS reduced-motion preference ───────────────────────────── */
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Realistic progress bar (random increments up to 92%, then holds) ── */
  const [progress, setProgress] = useState(0);
  const [slowConnection, setSlowConnection] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!fullScreen) return;
    intervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 92) {
          clearInterval(intervalRef.current);
          return 92;
        }
        const increment = Math.random() * (prev < 40 ? 12 : prev < 70 ? 7 : 2);
        return Math.min(prev + increment, 92);
      });
    }, 220);

    // Show slow-connection hint after 5 seconds
    const slowTimer = setTimeout(() => setSlowConnection(true), 5000);

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(slowTimer);
    };
  }, [fullScreen]);

  /* ── Framer Motion variants — disabled if reduced motion ────────────── */
  const spin = prefersReducedMotion
    ? {}
    : { animate: { rotate: 360 }, transition: { repeat: Infinity, duration: 3, ease: 'linear' } };

  const counterSpin = prefersReducedMotion
    ? {}
    : { animate: { rotate: -360 }, transition: { repeat: Infinity, duration: 2, ease: 'linear' } };

  const fastSpin = prefersReducedMotion
    ? {}
    : { animate: { rotate: 360 }, transition: { repeat: Infinity, duration: 1.1, ease: 'linear' } };

  const pulse = prefersReducedMotion
    ? {}
    : { animate: { scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }, transition: { repeat: Infinity, duration: 2, ease: 'easeInOut' } };

  const dotPulse = (i) => prefersReducedMotion
    ? {}
    : { animate: { opacity: [0.3, 1, 0.3], scale: [0.7, 1.3, 0.7] }, transition: { repeat: Infinity, duration: 1.4, delay: i * 0.22, ease: 'easeInOut' } };

  /* ── Styles ─────────────────────────────────────────────────────────── */
  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
    background: 'linear-gradient(135deg, rgba(0,0,0,0.92) 0%, rgba(5,5,20,0.95) 100%)',
    backdropFilter: 'blur(40px) saturate(200%)',
    WebkitBackdropFilter: 'blur(40px) saturate(200%)',
  };

  const inline = {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    padding: '40px', flexDirection: 'column', gap: 16,
  };

  return (
    <div
      style={fullScreen ? overlay : inline}
      aria-label="Loading MyCoinwise"
      aria-live="polite"
      role="status"
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {/* Liquid Glass Blob — only when animations are allowed */}
        {fullScreen && !prefersReducedMotion && (
          <div style={{
            position: 'absolute',
            width: 120, height: 120,
            background: 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(56,189,248,0.18), rgba(251,146,60,0.12))',
            filter: 'blur(18px)',
            animation: 'blobMorph 6s ease-in-out infinite',
            zIndex: 0,
          }} />
        )}

        {/* 3-Ring Spinner Hub */}
        <div style={{ position: 'relative', width: 72, height: 72, zIndex: 1 }}>

          {/* Outer ring — brand green */}
          <motion.div
            {...spin}
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid transparent',
              borderTop: '2px solid #10b981',
              borderRight: '2px solid rgba(16,185,129,0.3)',
              boxShadow: '0 0 12px rgba(16,185,129,0.5)',
              willChange: prefersReducedMotion ? 'auto' : 'transform',
            }}
          />

          {/* Mid ring — cyan counter-spin */}
          <motion.div
            {...counterSpin}
            style={{
              position: 'absolute', inset: 10, borderRadius: '50%',
              border: '2px solid transparent',
              borderBottom: '2px solid #38bdf8',
              borderLeft: '2px solid rgba(56,189,248,0.3)',
              boxShadow: '0 0 10px rgba(56,189,248,0.4)',
              willChange: prefersReducedMotion ? 'auto' : 'transform',
            }}
          />

          {/* Inner ring — orange fast */}
          <motion.div
            {...fastSpin}
            style={{
              position: 'absolute', inset: 20, borderRadius: '50%',
              border: '2px solid transparent',
              borderTop: '2px solid #fb923c',
              borderRight: '2px solid rgba(251,146,60,0.3)',
              boxShadow: '0 0 8px rgba(251,146,60,0.4)',
              willChange: prefersReducedMotion ? 'auto' : 'transform',
            }}
          />

          {/* Center glow dot */}
          <motion.div
            {...pulse}
            style={{
              position: 'absolute', inset: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981, #38bdf8)',
              boxShadow: '0 0 20px rgba(16,185,129,0.8), 0 0 40px rgba(56,189,248,0.4)',
              willChange: prefersReducedMotion ? 'auto' : 'transform',
            }}
          />
        </div>
      </div>

      {/* Brand text + dots — fullscreen only */}
      {fullScreen && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.25, type: 'spring', damping: 18, stiffness: 120 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 24 }}
        >
          {/* Shimmer brand name */}
          <span style={{
            fontFamily: "'Space Grotesk', 'Outfit', sans-serif",
            fontWeight: 800, fontSize: '1.35rem', letterSpacing: '-0.5px',
            background: 'linear-gradient(90deg, #10b981 0%, #38bdf8 30%, #fb923c 60%, #10b981 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            animation: prefersReducedMotion ? 'none' : 'shimmerText 2.5s linear infinite',
          }}>
            MyCoinwise
          </span>

          <span style={{ fontSize: '0.78rem', color: 'rgba(148,163,184,0.8)', fontWeight: 500, letterSpacing: '0.04em' }}>
            {slowConnection
              ? '⚡ Backend warming up — almost there...'
              : 'Loading your finances...'
            }
          </span>

          {/* Animated dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            {['#10b981', '#38bdf8', '#fb923c'].map((color, i) => (
              <motion.div
                key={i}
                {...dotPulse(i)}
                style={{ width: 6, height: 6, borderRadius: '50%', background: color }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Realistic progress bar — tied to actual useState counter */}
      {fullScreen && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: 3,
          background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #10b981, #38bdf8, #fb923c)',
            borderRadius: '0 2px 2px 0',
            transition: prefersReducedMotion ? 'none' : 'width 0.22s ease-out',
          }} />
        </div>
      )}

      {/* Screen reader only text */}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
        Loading, please wait…
      </span>
    </div>
  );
}
