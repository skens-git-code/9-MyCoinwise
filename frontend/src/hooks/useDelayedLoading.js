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
      setShowLoader(false);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isLoading, delay]);

  return showLoader;
}
