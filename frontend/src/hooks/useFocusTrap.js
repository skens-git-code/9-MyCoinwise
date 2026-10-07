import { useEffect, useRef } from 'react';

/**
 * Focus management for modal-like surfaces.
 *
 * WHY THIS EXISTS
 * ---------------
 * The codebase had two correct dialog implementations (`Modal.jsx`,
 * `AlertsCenter.jsx`) and five incorrect ones that declared `aria-modal="true"`
 * without honouring it. This hook is the single shared implementation, so the
 * behaviour cannot drift again.
 *
 * It provides the four things WCAG 2.2 AA requires of a modal:
 *   1. Focus moves into the dialog when it opens.
 *   2. Tab / Shift+Tab cycle within the dialog (no keyboard trap escaping into
 *      the page behind it).
 *   3. Escape closes it.
 *   4. Focus returns to the element that opened it, on close.
 *
 * It also locks background scroll so a touch user cannot drag the page behind
 * the dialog, and treats the browser Back gesture as "close the dialog" rather
 * than "navigate away" (required on Android/iOS where Back is a swipe).
 *
 * @param {object} options
 * @param {boolean} options.isOpen Whether the surface is currently open.
 * @param {() => void} options.onClose Called on Escape or Back.
 * @param {import('react').RefObject<HTMLElement>} [options.containerRef]
 *   Ref to the dialog element. When omitted the hook still handles Escape,
 *   focus restoration and scroll lock, but cannot trap Tab.
 * @param {boolean} [options.closeOnEscape=true] Set false when a request is in
 *   flight and dismissing would lose work.
 * @param {boolean} [options.lockScroll=true] Set false for non-modal drawers.
 * @param {string} [options.initialFocusSelector] Overrides the default
 *   "first focusable descendant".
 * @returns {void}
 */
export function useFocusTrap({
  isOpen,
  onClose,
  containerRef,
  closeOnEscape = true,
  lockScroll = true,
  initialFocusSelector,
}) {
  // Remember what had focus so it can be restored on close.
  const previouslyFocusedRef = useRef(null);

  // Keep the latest close handler without re-running the effect on every render
  // (callers commonly pass an inline arrow function).
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current =
      typeof document !== 'undefined' ? document.activeElement : null;

    const getFocusable = () => {
      const root = containerRef?.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
          'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    };

    // ── 1. Move focus into the dialog ──
    const focusTimer = setTimeout(() => {
      const root = containerRef?.current;
      if (!root) return;
      const target = initialFocusSelector
        ? root.querySelector(initialFocusSelector)
        : getFocusable()[0];
      // Fall back to the container itself so focus never stays behind the dialog.
      (target || root).focus?.({ preventScroll: true });
    }, 0);

    // ── 2 & 3. Trap Tab, close on Escape ──
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        // Nothing to focus inside: keep focus on the dialog itself.
        event.preventDefault();
        containerRef?.current?.focus?.({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !containerRef?.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    // ── Back gesture closes the dialog instead of navigating away ──
    let pushedHistoryEntry = false;
    try {
      window.history.pushState({ __dshModal: true }, '');
      pushedHistoryEntry = true;
    } catch { /* history may be unavailable in tests */ }

    const handlePopState = () => {
      pushedHistoryEntry = false;
      onCloseRef.current?.();
    };
    window.addEventListener('popstate', handlePopState);

    // ── Background scroll lock (compensate for the scrollbar to avoid a jump) ──
    let previousOverflow = '';
    let previousPaddingRight = '';
    if (lockScroll && typeof document !== 'undefined') {
      const { body } = document;
      previousOverflow = body.style.overflow;
      previousPaddingRight = body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('popstate', handlePopState);

      // If we pushed a history entry and the dialog is closing some other way,
      // consume it so the user does not have to press Back twice.
      if (pushedHistoryEntry) {
        try { window.history.back(); } catch { /* ignore */ }
      }

      if (lockScroll && typeof document !== 'undefined') {
        document.body.style.overflow = previousOverflow;
        document.body.style.paddingRight = previousPaddingRight;
      }

      // ── 4. Restore focus to the trigger ──
      const previous = previouslyFocusedRef.current;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [isOpen, containerRef, closeOnEscape, lockScroll, initialFocusSelector]);
}

export default useFocusTrap;
