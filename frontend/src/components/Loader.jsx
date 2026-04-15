import React from 'react';
import { motion } from 'framer-motion';

const spinnerRing = {
  outer: {
    width: 56, height: 56, borderRadius: '50%', position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  inner: {
    position: 'absolute', inset: 0, borderRadius: '50%',
    border: '2px solid rgba(16, 185, 129,0.12)',
    borderTop: '2px solid #10b981',
  },
  mid: {
    position: 'absolute', inset: 8, borderRadius: '50%',
    border: '2px solid rgba(56,189,248,0.10)',
    borderBottom: '2px solid #38bdf8',
  },
  dot: {
    width: 10, height: 10, borderRadius: '50%',
    background: 'linear-gradient(135deg, #10b981, #38bdf8)',
    boxShadow: '0 0 16px rgba(16, 185, 129,0.8)',
  }
};

export default function Loader({ fullScreen = false }) {
  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(6,6,15,0.88)',
    backdropFilter: 'blur(32px) saturate(180%)',
    WebkitBackdropFilter: 'blur(32px) saturate(180%)',
  };
  const inline = { display: 'flex', justifyContent: 'center', padding: '40px' };

  return (
    <div style={fullScreen ? overlay : inline}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

        {/* iOS 26 Layered Spinner */}
        <div style={spinnerRing.outer}>
          {/* Outer ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
            style={spinnerRing.inner}
          />
          {/* Mid ring (counter spin) */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
            style={spinnerRing.mid}
          />
          {/* Center pulse dot */}
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
            style={spinnerRing.dot}
          />
        </div>

        {fullScreen && (
          <>
            {/* Brand name */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, type: 'spring', damping: 20 }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.4px',
                background: 'linear-gradient(135deg, #10b981, #38bdf8)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                Zenith Spend
              </span>

              {/* Animated dots */}
              <div style={{ display: 'flex', gap: 5 }}>
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2, ease: 'easeInOut' }}
                    style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: i === 0 ? '#10b981' : i === 1 ? '#38bdf8' : '#fb923c',
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
