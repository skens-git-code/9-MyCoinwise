import { useState, useEffect } from 'react';

/**
 * Custom hook that tracks document visibility using the Page Visibility API.
 * Returns true when the page is active/visible, and false when the tab is hidden or backgrounded.
 *
 * Essential for pausing polling intervals, animation loops, and auto-backups to eliminate CPU waste.
 */
export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === 'undefined') return true;
    return !document.hidden;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

export default usePageVisibility;
