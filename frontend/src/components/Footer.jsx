import React from 'react';

export default function Footer() {
  return (
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
      <p>&copy; {new Date().getFullYear()} Zenith Spend. All rights reserved.</p>
      <p style={{ marginTop: '4px', opacity: 0.7 }}>Designed for the Future of Finance.</p>
    </footer>
  );
}
