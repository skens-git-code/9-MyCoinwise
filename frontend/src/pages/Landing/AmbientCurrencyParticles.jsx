import React from 'react';
import PropTypes from 'prop-types';

const PARTICLES = [
  { symbol: '₹', top: '12%', left: '8%', size: '1.8rem', dur: '26s', delay: '0s', opacity: 0.035 },
  { symbol: '$', top: '22%', left: '88%', size: '1.4rem', dur: '30s', delay: '-5s', opacity: 0.03 },
  { symbol: '€', top: '38%', left: '16%', size: '1.6rem', dur: '24s', delay: '-12s', opacity: 0.025 },
  { symbol: '₹', top: '48%', left: '92%', size: '2.2rem', dur: '28s', delay: '-2s', opacity: 0.04 },
  { symbol: '£', top: '64%', left: '6%', size: '1.5rem', dur: '32s', delay: '-18s', opacity: 0.025 },
  { symbol: '¥', top: '72%', left: '84%', size: '1.3rem', dur: '27s', delay: '-7s', opacity: 0.028 },
  { symbol: '₹', top: '85%', left: '22%', size: '1.9rem', dur: '25s', delay: '-14s', opacity: 0.035 },
  { symbol: '$', top: '92%', left: '76%', size: '1.7rem', dur: '34s', delay: '-9s', opacity: 0.03 },
];

export default function AmbientCurrencyParticles({ prefersReduced = false }) {
  if (prefersReduced) return null;

  return (
    <div className="ambient-currency-particles" aria-hidden="true">
      {PARTICLES.map((p, idx) => (
        <span
          key={idx}
          className="currency-particle"
          style={{
            top: p.top,
            left: p.left,
            fontSize: p.size,
            opacity: p.opacity,
            animationDuration: p.dur,
            animationDelay: p.delay,
          }}
        >
          {p.symbol}
        </span>
      ))}
    </div>
  );
}

AmbientCurrencyParticles.propTypes = {
  prefersReduced: PropTypes.bool,
};

