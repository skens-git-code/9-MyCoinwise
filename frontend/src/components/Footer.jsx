/* —————————————————————————————————————
 * Footer Component
 * Small site footer with the copyright year and a tagline.
 *
 * Behavior:
 *   - Copyright year is derived from `new Date().getFullYear()`, so
 *     it updates automatically each calendar year.
 *   - Styling uses the shared CSS custom properties (`--text-secondary`
 *     and `--glass-border`) to stay theme-consistent.
 * ————————————————————————————————————— */

import React from 'react';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function Footer() {
  return (
    // ── Footer wrapper: pinned to the bottom of its flex container ──
    <footer style={{
      marginTop: 'auto',
      padding: '24px',
      textAlign: 'center',
      color: 'var(--text-secondary)',
      fontSize: '0.85rem',
      borderTop: '1px solid var(--glass-border)',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: '0 0 24px 24px'
    }}>
      {/* ── Copyright line with auto-updating year ── */}
      <p>&copy; {new Date().getFullYear()} MyCoinwise. All rights reserved.</p>

      {/* ── Tagline (slightly muted) ── */}
      <p style={{ marginTop: '4px', opacity: 0.7 }}>Designed for the Future of Finance.</p>
    </footer>
  );
}