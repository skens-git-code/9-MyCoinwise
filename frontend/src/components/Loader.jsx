// import React from 'react';
// import { motion } from 'framer-motion';
// import { Zap } from 'lucide-react';

// export default function Loader({ fullScreen = false, mode = 'inline', text }) {
//   const prefersReducedMotion = typeof window !== 'undefined' &&
//     typeof window.matchMedia === 'function' &&
//     window.matchMedia('(prefers-reduced-motion: reduce)').matches;

//   if (mode === 'button') {
//     return (
//       <span className="loader loader--button" role="status" aria-label={text || 'Loading'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
//         <motion.span
//           animate={prefersReducedMotion ? {} : { rotate: 360 }}
//           transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
//           style={{
//             width: 16,
//             height: 16,
//             borderRadius: '50%',
//             border: '2px solid rgba(255, 255, 255, 0.3)',
//             borderTopColor: '#ffffff',
//             display: 'inline-block'
//           }}
//         />
//       </span>
//     );
//   }

//   const isFull = fullScreen || mode === 'auth';

//   return (
//     <div
//       className={`loader ${isFull ? 'loader--fullscreen' : 'loader--inline'} loader--${mode}`}
//       style={{
//         display: 'flex',
//         flexDirection: 'column',
//         alignItems: 'center',
//         justifyContent: 'center',
//         gap: '16px',
//         width: '100%',
//         minHeight: isFull ? '100dvh' : '220px',
//         position: isFull ? 'fixed' : 'relative',
//         inset: isFull ? 0 : 'auto',
//         zIndex: isFull ? 9999 : 1,
//         background: isFull ? 'var(--surface-0)' : 'transparent',
//         backdropFilter: isFull ? 'blur(28px) saturate(160%)' : 'none',
//         WebkitBackdropFilter: isFull ? 'blur(28px) saturate(160%)' : 'none',
//         boxSizing: 'border-box',
//         padding: '24px'
//       }}
//       aria-label={text || 'Loading'}
//       aria-busy="true"
//       aria-live="polite"
//       role="status"
//     >
//       {/* Central Spinner Container */}
//       <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//         {/* Outer glowing orbital ring */}
//         {!prefersReducedMotion && (
//           <motion.div
//             animate={{ rotate: 360 }}
//             transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
//             style={{
//               position: 'absolute',
//               inset: 0,
//               borderRadius: '50%',
//               background: 'conic-gradient(from 0deg, transparent 0%, rgba(16, 185, 129, 0.2) 50%, #10b981 100%)',
//               maskImage: 'radial-gradient(circle, transparent 28px, black 30px)',
//               WebkitMaskImage: 'radial-gradient(circle, transparent 28px, black 30px)',
//               filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.5))'
//             }}
//           />
//         )}

//         {/* Pulsing inner ring */}
//         <motion.div
//           animate={prefersReducedMotion ? {} : { scale: [0.95, 1.05, 0.95], opacity: [0.7, 1, 0.7] }}
//           transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
//           style={{
//             position: 'absolute',
//             width: 46,
//             height: 46,
//             borderRadius: '14px',
//             background: 'var(--brand-gradient)',
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//             boxShadow: '0 0 24px var(--brand-glow), inset 0 1px 1px rgba(255, 255, 255, 0.3)',
//             color: '#ffffff'
//           }}
//         >
//           <Zap size={22} />
//         </motion.div>
//       </div>

//       {/* Branded Label */}
//       <motion.div
//         initial={{ opacity: 0, y: 6 }}
//         animate={{ opacity: 1, y: 0 }}
//         transition={{ delay: 0.15 }}
//         style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
//       >
//         <span
//           style={{
//             fontFamily: 'var(--font-head)',
//             fontWeight: 800,
//             fontSize: isFull ? '1.2rem' : '0.95rem',
//             letterSpacing: '-0.3px',
//             color: 'var(--text-primary)'
//           }}
//         >
//           MyCoinwise
//         </span>
//         <span
//           style={{
//             fontSize: '0.78rem',
//             color: 'var(--brand-primary)',
//             fontWeight: 600,
//             letterSpacing: '0.02em',
//             textTransform: 'uppercase'
//           }}
//         >
//           {text || (mode === 'auth' ? 'Authenticating…' : 'Loading experience…')}
//         </span>
//       </motion.div>

//       {/* Accessible screen-reader note */}
//       <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
//         Loading, please wait...
//       </span>
//     </div>
//   );
// }


import React from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

/**
 * A modern, lightweight loader with a gradient SVG ring spinner.
 * Supports fullscreen, inline, and button modes.
 */
export default function Loader({
  fullScreen = false,
  mode = 'inline',
  text,
}) {
  // Check for reduced motion preference (client‑side only)
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----- Button mode (tiny inline spinner) -----
  if (mode === 'button') {
    return (
      <span
        className="loader loader--button"
        role="status"
        aria-label={text || 'Loading'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          className="loader__button-spinner"
          style={{
            width: 18,
            height: 18,
            display: 'inline-block',
            border: '2px solid rgba(255,255,255,0.2)',
            borderTopColor: '#ffffff',
            borderRadius: '50%',
            animation: prefersReducedMotion
              ? 'none'
              : 'loaderSpin 0.7s linear infinite',
          }}
        />
      </span>
    );
  }

  // ----- Fullscreen or inline modes -----
  const isFull = fullScreen || mode === 'auth';

  return (
    <div
      className={`loader ${isFull ? 'loader--fullscreen' : 'loader--inline'} loader--${mode}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        width: '100%',
        minHeight: isFull ? '100dvh' : '220px',
        position: isFull ? 'fixed' : 'relative',
        inset: isFull ? 0 : 'auto',
        zIndex: isFull ? 9999 : 1,
        background: isFull
          ? 'var(--surface-0, rgba(0,0,0,0.85))'
          : 'transparent',
        backdropFilter: isFull ? 'blur(20px) saturate(150%)' : 'none',
        WebkitBackdropFilter: isFull ? 'blur(20px) saturate(150%)' : 'none',
        boxSizing: 'border-box',
        padding: '24px',
      }}
      aria-label={text || 'Loading'}
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      {/* ----- Main Spinner (SVG ring with gradient dash) ----- */}
      <div
        className="loader__spinner-wrapper"
        style={{
          position: 'relative',
          width: 72,
          height: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          className="loader__spinner-svg"
          viewBox="0 0 50 50"
          style={{
            width: '100%',
            height: '100%',
            transform: 'rotate(-90deg)',
          }}
        >
          {/* Background track */}
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="var(--border-subtle, rgba(255,255,255,0.08))"
            strokeWidth="4"
          />
          {/* Animated progress ring */}
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="url(#loaderGradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="90 100"
            style={{
              animation: prefersReducedMotion
                ? 'none'
                : 'loaderDash 1.4s ease-in-out infinite',
            }}
          />
          <defs>
            <linearGradient id="loaderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--brand-primary, #10b981)" />
              <stop offset="100%" stopColor="var(--brand-secondary, #059669)" />
            </linearGradient>
          </defs>
        </svg>

        {/* Optional subtle glow behind the spinner */}
        {!prefersReducedMotion && (
          <div
            className="loader__glow"
            style={{
              position: 'absolute',
              inset: '-8px',
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
              filter: 'blur(12px)',
              pointerEvents: 'none',
              animation: 'loaderPulse 2s ease-in-out infinite alternate',
            }}
          />
        )}
      </div>

      {/* ----- Branded Label ----- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4, ease: 'easeOut' }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-head, system-ui)',
            fontWeight: 700,
            fontSize: isFull ? '1.1rem' : '0.95rem',
            letterSpacing: '-0.02em',
            color: 'var(--text-primary, #f1f5f9)',
          }}
        >
          MyCoinwise
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--text-secondary, #94a3b8)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          {text || (mode === 'auth' ? 'Authenticating…' : 'Loading…')}
        </span>
      </motion.div>

      {/* ----- Accessible screen‑reader note ----- */}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
        Loading, please wait...
      </span>

      {/* ----- Inject CSS keyframes (client‑side only) ----- */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes loaderSpin {
              to { transform: rotate(360deg); }
            }
            @keyframes loaderDash {
              0% { stroke-dashoffset: 0; }
              50% { stroke-dashoffset: -40; }
              100% { stroke-dashoffset: -90; }
            }
            @keyframes loaderPulse {
              0% { opacity: 0.4; transform: scale(0.95); }
              100% { opacity: 1; transform: scale(1.05); }
            }
          `,
        }}
      />
    </div>
  );
}