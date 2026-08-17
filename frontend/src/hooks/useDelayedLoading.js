import { useState, useEffect } from 'react';

/**
 * useDelayedLoading
 * Only sets `showLoader` to true if the `isLoading` state persists longer than the `delay`.
 * Prevents UI flicker for extremely fast network requests.
 */
export default function useDelayedLoading(isLoading, delay = 250) {
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    let timeoutId;
    if (isLoading) {
      timeoutId = setTimeout(() => {
        setShowLoader(true);
      }, delay);
    } else {
      // Keep the state transition asynchronous so the effect only schedules
      // synchronization work and does not cascade a render synchronously.
      timeoutId = setTimeout(() => {
        setShowLoader(false);
      }, 0);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isLoading, delay]);

  return showLoader;
}
