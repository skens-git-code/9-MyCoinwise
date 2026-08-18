import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Check, Zap } from 'lucide-react';

const visuallyHidden = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 };

export default function Loader({ fullScreen = false, mode = 'inline', text }) {
  const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (mode === 'button') {
    return <span className="loader loader--button" role="status" aria-label={text || 'Loading'}>
      <motion.span aria-hidden="true" animate={prefersReducedMotion ? {} : { rotate: 360 }} transition={{ duration: .85, repeat: Infinity, ease: 'linear' }} style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
      <span style={visuallyHidden}>{text || 'Loading'}</span>
    </span>;
  }

  const isFull = fullScreen || mode === 'auth';
  const statusText = text || (mode === 'auth' ? 'Securing your session' : 'Preparing your workspace');

  return <div className={`loader loader--${isFull ? 'fullscreen' : 'inline'} loader--${mode}`} role="status" aria-live="polite" aria-busy="true" aria-label={statusText} style={{ position: isFull ? 'fixed' : 'relative', inset: isFull ? 0 : 'auto', zIndex: isFull ? 9999 : 1, minHeight: isFull ? '100dvh' : 240, width: '100%', overflow: 'hidden', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box', color: 'var(--text-primary)', background: isFull ? 'radial-gradient(circle at 50% 30%, rgba(16,185,129,.14), transparent 45%), radial-gradient(circle at 80% 80%, rgba(139,92,246,.10), transparent 50%), var(--surface-0)' : 'transparent' }}>
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden="true">
      <motion.div
        animate={prefersReducedMotion ? {} : { scale: [1, 1.15, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', width: 450, height: 450, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 68%)', top: '10%', left: '20%', filter: 'blur(40px)' }}
      />
      <motion.div
        animate={prefersReducedMotion ? {} : { scale: [1.1, 0.95, 1.1], rotate: [0, -90, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.15) 0%, transparent 70%)', bottom: '10%', right: '15%', filter: 'blur(40px)' }}
      />
      <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', border: '1px solid rgba(59,130,246,.12)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      <div style={{ position: 'absolute', width: 440, height: 440, borderRadius: '50%', border: '1px solid rgba(16,185,129,.08)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
    </div>
    <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }} style={{ position: 'relative', width: 'min(100%, 360px)', textAlign: 'center', zIndex: 2 }}>
      <div style={{ display: 'inline-flex', position: 'relative', marginBottom: 26 }}>
        <motion.div aria-hidden="true" animate={prefersReducedMotion ? {} : { scale: [1, 1.08, 1] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} style={{ width: 76, height: 76, display: 'grid', placeItems: 'center', borderRadius: 24, color: '#fff', background: 'linear-gradient(135deg, #10b981, #06b6d4, #8b5cf6)', boxShadow: '0 16px 42px rgba(16,185,129,.35), inset 0 1px rgba(255,255,255,.4)' }}><Zap size={32} strokeWidth={2.4} /></motion.div>
        <div style={{ position: 'absolute', right: -7, bottom: -7, width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: '50%', color: '#fff', background: '#10b981', border: '4px solid var(--surface-0)' }}><Check size={13} strokeWidth={3} /></div>
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.35rem, 4vw, 1.7rem)', fontWeight: 800, letterSpacing: '-.04em' }}>My<span style={{ color: 'var(--brand-primary)' }}>Coinwise</span></div>
      <p style={{ margin: '8px 0 24px', color: 'var(--text-secondary)', fontSize: '.9rem' }}>{statusText}</p>
      <div style={{ height: 6, width: '100%', overflow: 'hidden', borderRadius: 99, background: 'rgba(148,163,184,.16)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.2)' }} aria-hidden="true">
        <motion.div animate={prefersReducedMotion ? { width: '55%' } : { x: ['-100%', '180%'] }} transition={prefersReducedMotion ? {} : { duration: 1.55, repeat: Infinity, ease: 'easeInOut' }} style={{ height: '100%', width: '55%', borderRadius: 99, background: 'linear-gradient(90deg, #10b981, #38bdf8, #8b5cf6)', boxShadow: '0 0 14px rgba(56,189,248,.55)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'center', marginTop: 18, color: 'var(--text-secondary)', fontSize: '.72rem', letterSpacing: '.08em', textTransform: 'uppercase' }}><ArrowUpRight size={13} aria-hidden="true" /> <span>Building your financial view</span></div>
    </motion.div>
    <span style={visuallyHidden}>Loading, please wait.</span>
  </div>;
}
