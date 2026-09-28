import { useState, useEffect, useRef } from 'react';
import { useMotionValue, animate } from 'framer-motion';

/**
 * High-performance number tweening hook using Framer Motion's internal animation loop.
 * Respects prefers-reduced-motion and document.hidden with instant snapping
 * and deterministic stop() cleanup on unmount.
 */
export default function useCountUp(targetValue, duration = 800) {
  const [value, setValue] = useState(targetValue);
  const [isFinished, setIsFinished] = useState(true);
  const motionVal = useMotionValue(targetValue);
  const prevTargetRef = useRef(targetValue);

  useEffect(() => {
    const isHidden = typeof document !== 'undefined' && document.hidden;
    const prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    // Immediately snap to target if motion is reduced, tab is hidden, or values match
    if (prefersReducedMotion || isHidden || prevTargetRef.current === targetValue) {
      motionVal.set(targetValue);
      setValue(targetValue);
      prevTargetRef.current = targetValue;
      setIsFinished(true);
      return undefined;
    }

    setIsFinished(false);
    // Convert ms to seconds if > 10 (framer-motion expects seconds)
    const durationSeconds = duration > 10 ? duration / 1000 : duration;

    const controls = animate(motionVal, targetValue, {
      duration: durationSeconds,
      ease: [0.16, 1, 0.3, 1], // easeOutExpo
      onUpdate: (latest) => {
        setValue(latest);
      },
      onComplete: () => {
        setValue(targetValue);
        prevTargetRef.current = targetValue;
        setIsFinished(true);
      },
    });

    const handleVisibilityChange = () => {
      if (document.hidden) {
        controls.stop();
        motionVal.set(targetValue);
        setValue(targetValue);
        prevTargetRef.current = targetValue;
        setIsFinished(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      controls.stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [targetValue, duration, motionVal]);

  return { value, isFinished };
}
