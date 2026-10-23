/* —————————————————————————————————————————————————————————
 * Coinwise Brand Components
 * Official vector mark, badge lockup, and full logo.
 * Precision-aligned to the official brand guidelines.
 * ————————————————————————————————————————————————————————— */

import React from 'react';

/**
 * Official Coinwise Red Chevron Mark (Vector SVG)
 * Precision geometric paths:
 * - Left angular chevron spine
 * - Top-right slanted parallelogram bar
 * - Bottom-right slanted parallelogram bar
 */
export const CoinwiseMark = ({
  size = 22,
  color = '#FC0100',
  className = '',
  style = {},
  ...props
}) => {
  // Emblem native bounding box is 604 x 520 (aspect ratio ~1.161)
  const width = size;
  const height = Math.round(size * (520 / 604));

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 604 520"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`coinwise-mark ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      {/* Main Left Chevron Piece */}
      <polygon
        points="186,0 363,0 177,186 177,332 363,518 186,518 0,332 0,186"
        fill={color}
      />
      {/* Top-Right Slanted Bar */}
      <polygon
        points="427,0 603,0 476,127 300,127"
        fill={color}
      />
      {/* Bottom-Right Slanted Bar */}
      <polygon
        points="300,391 476,391 603,518 427,518"
        fill={color}
      />
    </svg>
  );
};

/**
 * Official Coinwise Badge (Icon container)
 * Used in navigation headers, auth pages, loaders, and footer.
 */
export const CoinwiseBadge = ({
  size = 38,
  iconSize,
  radius = 12,
  variant = 'surface', // 'surface' | 'glass' | 'white' | 'accent' | 'plain'
  className = '',
  style = {},
  children,
  ...props
}) => {
  const resolvedIconSize = iconSize || Math.round(size * 0.58);

  return (
    <div
      className={`coinwise-badge coinwise-badge--${variant} ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: radius,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {children || <CoinwiseMark size={resolvedIconSize} />}
    </div>
  );
};

/**
 * Official Coinwise Full Logo
 * Features the red geometric chevron emblem + "COINWISE" wordmark.
 * Supports auto light/dark theme adaptation.
 */
export const CoinwiseLogo = ({
  height = 32,
  variant = 'auto', // 'auto' | 'dark' | 'light'
  className = '',
  style = {},
  alt = 'Coinwise',
  ...props
}) => {
  // Aspect ratio is 984 / 349 ≈ 2.819
  const calculatedWidth = Math.round(height * 2.819);

  return (
    <span
      className={`coinwise-logo-wrap coinwise-logo--${variant} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        lineHeight: 1,
        verticalAlign: 'middle',
        ...style,
      }}
      {...props}
    >
      {/* Light-theme logo (dark text) */}
      <img
        src="/coinwise-logo.png"
        alt={alt}
        width={calculatedWidth}
        height={height}
        className="coinwise-logo-img coinwise-logo-img--dark-text"
        style={{
          height,
          width: calculatedWidth,
          objectFit: 'contain',
          display: 'block',
        }}
        loading="eager"
        decoding="async"
      />
      {/* Dark/AMOLED-theme logo (white text) */}
      <img
        src="/coinwise-logo-light.png"
        alt=""
        aria-hidden="true"
        width={calculatedWidth}
        height={height}
        className="coinwise-logo-img coinwise-logo-img--white-text"
        style={{
          height,
          width: calculatedWidth,
          objectFit: 'contain',
          display: 'none',
        }}
        loading="eager"
        decoding="async"
      />
    </span>
  );
};

export default CoinwiseLogo;
