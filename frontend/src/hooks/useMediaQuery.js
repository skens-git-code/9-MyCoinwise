import { useSyncExternalStore, useCallback } from 'react';

function formatMediaQuery(query) {
  if (typeof query === 'string') return query;
  if (!query || typeof query !== 'object') return '';

  const parts = [];
  if (query.minWidth !== undefined) {
    const val = typeof query.minWidth === 'number' ? `${query.minWidth}px` : query.minWidth;
    parts.push(`(min-width: ${val})`);
  }
  if (query.maxWidth !== undefined) {
    const val = typeof query.maxWidth === 'number' ? `${query.maxWidth}px` : query.maxWidth;
    parts.push(`(max-width: ${val})`);
  }
  if (query.minHeight !== undefined) {
    const val = typeof query.minHeight === 'number' ? `${query.minHeight}px` : query.minHeight;
    parts.push(`(min-height: ${val})`);
  }
  if (query.maxHeight !== undefined) {
    const val = typeof query.maxHeight === 'number' ? `${query.maxHeight}px` : query.maxHeight;
    parts.push(`(max-height: ${val})`);
  }
  if (query.orientation !== undefined) {
    parts.push(`(orientation: ${query.orientation})`);
  }
  return parts.join(' and ');
}

/**
 * useMediaQuery – Modern React hook for CSS media queries using useSyncExternalStore.
 * Replaces external dependencies with native `window.matchMedia` without cascading re-renders or SSR mismatches.
 *
 * @param {string|object} query - CSS Media Query string (e.g. '(max-width: 768px)') or query object (e.g. { maxWidth: 767 })
 * @returns {boolean} matches - Current boolean state of the media query match
 */
export function useMediaQuery(query) {
  const normalizedQuery = typeof query === 'string' ? query : formatMediaQuery(query);

  const subscribe = useCallback(
    (callback) => {
      if (typeof window === 'undefined' || !window.matchMedia || !normalizedQuery) {
        return () => {};
      }

      const matchMediaList = window.matchMedia(normalizedQuery);
      
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
    [normalizedQuery]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia || !normalizedQuery) {
      return false;
    }
    return window.matchMedia(normalizedQuery).matches;
  }, [normalizedQuery]);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useMediaQuery;

