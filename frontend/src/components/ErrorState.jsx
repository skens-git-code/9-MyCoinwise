/* —————————————————————————————————————
 * Error State Component
 * Reusable error card with an icon, title, message, and optional
 * retry button. Used inline or as a full-screen overlay.
 *
 * Props:
 *   - title      : heading text (default: "Data Synchronization Failed").
 *   - message    : body text (default: a network-error message).
 *   - onRetry    : optional callback; when provided, a "Try Again"
 *                  button is shown.
 *   - fullScreen : when true, renders as a fixed full-viewport
 *                  overlay with a blurred backdrop. Default false.
 *
 * Behavior:
 *   - The card uses Framer Motion for a subtle scale/fade entrance.
 *   - Button hover effects are applied imperatively via mouse
 *     handlers (background, border, transform, shadow).
 * ————————————————————————————————————— */

import React from 'react';
import { motion } from 'framer-motion';
import { AlertOctagon, RefreshCw } from 'lucide-react';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function ErrorState({ title = "Data Synchronization Failed", message = "We couldn't connect to the server. Please check your network and try again.", onRetry, fullScreen = false }) {
  // ── Outer container styles: full-screen overlay vs. inline block ──
  const containerStyle = fullScreen
    ? {
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-0)',
        backdropFilter: 'blur(20px)',
      }
    : {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px', height: '100%', width: '100%',
        minHeight: '300px'
      };

  return (
    <div style={containerStyle}>
      {/* ── Animated error card ── */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        style={{
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '24px',
          padding: '32px',
          maxWidth: '420px',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}
      >
        {/* ── Icon badge ── */}
        <div style={{
          width: '64px', height: '64px', borderRadius: '20px',
          background: 'rgba(239, 68, 68, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--danger)', marginBottom: '8px'
        }}>
          <AlertOctagon size={32} strokeWidth={1.5} />
        </div>

        {/* ── Title ── */}
        <h3 style={{
          margin: 0, fontSize: '1.25rem', fontWeight: 800,
          fontFamily: 'var(--font-head)', color: 'var(--text-primary)',
          letterSpacing: '-0.5px'
        }}>
          {title}
        </h3>

        {/* ── Message ── */}
        <p style={{
          margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)',
          lineHeight: 1.5, fontWeight: 500
        }}>
          {message}
        </p>

        {/* ── Optional retry button ── */}
        {onRetry && (
          <button 
            onClick={onRetry}
            style={{
              marginTop: '12px',
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 24px',
              background: 'var(--glass-1)',
              border: '1px solid var(--glass-border)',
              borderRadius: '14px',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            /* ── Hover-in: lift, tint border, add glow ── */
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--glass-2)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 10px 20px rgba(239, 68, 68, 0.15)';
            }}
            /* ── Hover-out: restore base styles ── */
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--glass-1)';
              e.currentTarget.style.borderColor = 'var(--glass-border)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <RefreshCw size={18} />
            Try Again
          </button>
        )}
      </motion.div>
    </div>
  );
}