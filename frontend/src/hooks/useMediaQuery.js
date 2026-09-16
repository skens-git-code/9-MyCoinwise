import { useSyncExternalStore, useCallback } from 'react';

/**
 * useMediaQuery – Modern React hook for CSS media queries using useSyncExternalStore.
 * Replaces external dependencies with native `window.matchMedia` without cascading re-renders or SSR mismatches.
 *
 * @param {string} query - CSS Media Query string (e.g. '(max-width: 768px)')
 * @returns {boolean} matches - Current boolean state of the media query match
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (callback) => {
      if (typeof window === 'undefined' || !window.matchMedia) {
        return () => {};
      }

      const matchMediaList = window.matchMedia(query);
      
      if (matchMediaList.addEventListener) {
        matchMediaList.addEventListener('change', callback);
        return () => matchMediaList.removeEventListener('change', callback);
      }

      if (matchMediaList.addListener) {
        matchMediaList.addListener(callback);
        return () => matchMediaList.removeListener(callback);
      }

      return () => {};
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useMediaQuery;
