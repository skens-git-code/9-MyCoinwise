import React from 'react';
import PropTypes from 'prop-types';
import { motion, useTransform } from 'framer-motion';
import { useCountUpMotion } from '../hooks/useCountUp';

/**
 * AnimatedNumber Component (Stage 2, RC#3)
 * Renders a numeric counter animated via Framer Motion MotionValue.
 * Updates the DOM text node directly on each animation frame, completely
 * bypassing React component re-renders.
 */
function AnimatedNumber({
  value,
  duration = 800,
  format = (val) => val,
  prefix = '',
  suffix = '',
  className = '',
  style = {},
  onComplete,
}) {
  const mv = useCountUpMotion(value, duration, onComplete);
  const display = useTransform(mv, (latest) => {
    const formatted = format(latest);
    return `${prefix}${formatted != null ? formatted : ''}${suffix}`;
  });

  return (
    <motion.span
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {display}
    </motion.span>
  );
}

AnimatedNumber.propTypes = {
  value: PropTypes.number.isRequired,
  duration: PropTypes.number,
  format: PropTypes.func,
  prefix: PropTypes.string,
  suffix: PropTypes.string,
  className: PropTypes.string,
  style: PropTypes.object,
  onComplete: PropTypes.func,
};

export default React.memo(AnimatedNumber);
