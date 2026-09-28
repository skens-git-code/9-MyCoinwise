import { useEffect, useRef } from 'react';
import { useMotionValue, animate, useReducedMotion } from 'framer-motion';

/**
 * High-performance motion value hook for number tweening (Stage 2, RC#3).
 * Returns a Framer Motion `motionValue` directly and does NOT call `setState`
 * during animation frames, eliminating React component re-renders.
 *
 * Mount behavior:
 * - Mount with targetValue: initializes directly to targetValue (prevents "flash of 0" on initial load/hydration).
 * - Value update (e.g. 0 -> 500 or balance update): animates smoothly from current -> new targetValue.
 * - When duration <= 0, prefersReducedMotion is active, or tab is hidden: snaps immediately.
 *
 * @param {number} targetValue - Target number to tween to
 * @param {number} [duration=800] - Duration in milliseconds
 * @param {() => void} [onComplete] - Callback invoked when the animation finishes
 * @returns {import('framer-motion').MotionValue<number>} Framer Motion motion value
 */
export function useCountUpMotion(targetValue, duration = 800, onComplete) {
  const motionVal = useMotionValue(targetValue);
  const prevTargetRef = useRef(targetValue);
  const prefersReducedMotion = useReducedMotion();
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const isHidden = typeof document !== 'undefined' && document.hidden;

    // Immediately snap to target if motion is reduced, tab is hidden, duration is 0, or values match
    if (prefersReducedMotion || isHidden || duration <= 0 || prevTargetRef.current === targetValue) {
      motionVal.set(targetValue);
      prevTargetRef.current = targetValue;
      onCompleteRef.current?.();
      return undefined;
    }

    // Always convert milliseconds to seconds with safe minimum floor (kills ambiguous heuristic)
    const durationSeconds = Math.max(0.01, duration / 1000);

    const controls = animate(motionVal, targetValue, {
      duration: durationSeconds,
      ease: [0.16, 1, 0.3, 1], // easeOutExpo
      onComplete: () => {
        motionVal.set(targetValue);
        prevTargetRef.current = targetValue;
        onCompleteRef.current?.();
      },
    });

    const handleVisibilityChange = () => {
      if (document.hidden) {
        controls.stop();
        motionVal.set(targetValue);
        prevTargetRef.current = targetValue;
        onCompleteRef.current?.();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      controls.stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [targetValue, duration, prefersReducedMotion, motionVal]);

  return motionVal;
}

/**
 * @deprecated Removed in Stage 2 (RC#3). Calling this legacy hook causes per-frame
 * React re-render storms (~54 commits during 900ms entry animation).
 * Use <AnimatedNumber /> or useCountUpMotion() instead.
 */
export function useCountUp() {
  throw new Error(
    'useCountUp has been removed to eliminate per-frame setState re-render storms. Use <AnimatedNumber /> or useCountUpMotion() instead.'
  );
}

export default useCountUpMotion;
