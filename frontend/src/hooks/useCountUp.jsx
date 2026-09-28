import { useEffect, useRef } from 'react';
import { useMotionValue, animate } from 'framer-motion';

/**
 * High-performance motion value hook for number tweening (Stage 2, RC#3).
 * Returns a Framer Motion `motionValue` directly and does NOT call `setState`
 * during animation frames, eliminating React component re-renders.
 *
 * @param {number} targetValue - Target number to tween to
 * @param {number} duration - Duration in ms (default: 800ms)
 * @returns {import('framer-motion').MotionValue<number>} Framer Motion motion value
 */
export function useCountUpMotion(targetValue, duration = 800) {
  const motionVal = useMotionValue(targetValue);
  const prevTargetRef = useRef(targetValue);

  useEffect(() => {
    const isHidden = typeof document !== 'undefined' && document.hidden;
    const prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    // Immediately snap to target if motion is reduced, tab is hidden, duration is 0, or values match
    if (prefersReducedMotion || isHidden || duration <= 0 || prevTargetRef.current === targetValue) {
      motionVal.set(targetValue);
      prevTargetRef.current = targetValue;
      return undefined;
    }

    const durationSeconds = duration > 10 ? duration / 1000 : duration;

    const controls = animate(motionVal, targetValue, {
      duration: durationSeconds,
      ease: [0.16, 1, 0.3, 1], // easeOutExpo
      onComplete: () => {
        motionVal.set(targetValue);
        prevTargetRef.current = targetValue;
      },
    });

    const handleVisibilityChange = () => {
      if (document.hidden) {
        controls.stop();
        motionVal.set(targetValue);
        prevTargetRef.current = targetValue;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      controls.stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [targetValue, duration, motionVal]);

  return motionVal;
}

export default useCountUpMotion;
