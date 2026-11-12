import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop
 * Automatically resets scroll position to the top upon route navigation,
 * or scrolls smoothly to the target hash element (e.g. #features, #faq, #simulator)
 * when an anchor hash is provided in the URL.
 * Also resets the inner scroll container for .island-main to eliminate scroll carryover glitches.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const timer = setTimeout(() => {
        try {
          const element = document.querySelector(hash);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        } catch {
          // Fallback if selector is not standard
        }
      }, 60);
      return () => clearTimeout(timer);
    }

    // Instantly reset window and layout scroll to top on page navigation
    if (typeof window !== 'undefined') {
      try {
        window.scrollTo(0, 0);
      } catch {
        // Safe in environments where window.scrollTo is not implemented
      }
      const contentWrapper = document.querySelector('.island-content-wrapper');
      if (contentWrapper && contentWrapper.scrollTop !== 0) {
        if (typeof contentWrapper.scrollTo === 'function') {
          contentWrapper.scrollTo({ top: 0, behavior: 'instant' });
        } else {
          contentWrapper.scrollTop = 0;
        }
      }
      const mainEl = document.querySelector('.island-main');
      if (mainEl && mainEl.scrollTop !== 0) {
        mainEl.scrollTop = 0;
      }
    }
    return undefined;
  }, [pathname, hash]);

  return null;
}
