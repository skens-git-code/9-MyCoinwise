import { useState, useEffect, useRef } from 'react';

// Cubic ease-out for natural deceleration
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export default function useCountUp(targetValue, duration = 800) {
  const [value, setValue] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const requestRef = useRef(null);
  const startTimeRef = useRef(null);
  const startValueRef = useRef(0); // Where the current animation started

  // Track system preference without causing hydration mismatches
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  useEffect(() => {
    if (prefersReducedMotion) {
      setTimeout(() => {
        setValue(targetValue);
        startValueRef.current = targetValue;
        setIsFinished(true);
      }, 0);
      return;
    }

    // Prepare fresh animation
    setTimeout(() => {
      setIsFinished(false);
    }, 0);
    startTimeRef.current = undefined;

    // Animate from wherever we currently are
    const fromValue = startValueRef.current;

    // If we're already exactly at the target, skip animation to save cycles
    if (fromValue === targetValue) {
      setTimeout(() => {
        setValue(targetValue);
        setIsFinished(true);
      }, 0);
      return;
    }

    const animate = (time) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      const elapsedTime = time - startTimeRef.current;

      if (elapsedTime >= duration) {
        setValue(targetValue);
        startValueRef.current = targetValue;
        setIsFinished(true);
        return;
      }

      const progress = easeOutCubic(elapsedTime / duration);
      const nextValue = fromValue + (targetValue - fromValue) * progress;

      setValue(nextValue);
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [targetValue, duration, prefersReducedMotion]);

  return { value, isFinished };
}
