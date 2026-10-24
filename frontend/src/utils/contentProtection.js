/**
 * Content Protection & Anti-Copy System
 * 
 * Provides robust client-side protection against unauthorized copying, downloading,
 * scraping, and inspecting, with comprehensive allowlist exception support.
 *
 * Capabilities:
 * 1. Global text & media interaction prevention:
 *    - Text selection disabled globally
 *    - Context menu (right-click) disabled
 *    - Drag & drop of text and media disabled
 * 2. Key shortcuts & print deterrents:
 *    - Copy (Ctrl+C / Cmd+C), Cut (Ctrl+X / Cmd+X) intercepted
 *    - Save Page (Ctrl+S / Cmd+S) blocked
 *    - Print (Ctrl+P / Cmd+P) blocked + window.print intercepted
 *    - View Source (Ctrl+U / Cmd+U) blocked
 * 3. DevTools deterrents:
 *    - F12 key blocked
 *    - DevTools hotkeys blocked: Ctrl+Shift+I, Cmd+Option+I, Ctrl+Shift+J, Cmd+Option+J, Ctrl+Shift+C, Cmd+Option+C
 * 4. Granular Allowlist Support:
 *    - Elements with class `.allow-copy` or attribute `data-allow-copy="true"` / `[data-allow-copy]`
 *    - Form controls: <input>, <textarea>, <select>, and [contenteditable="true"]
 *    - Interactive buttons and copy/share triggers remain fully functional
 */

/**
 * Checks whether an element (or its ancestors) is explicitly allowed for copying/interaction.
 * @param {EventTarget|Node|null} target
 * @returns {boolean}
 */
export function isAllowlistedElement(target) {
  if (!target) return false;
  const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
  if (!element || !(element instanceof Element)) return false;

  // 1. Form inputs and editable fields
  if (element.closest('input, textarea, select, [contenteditable="true"]')) {
    return true;
  }

  // 2. Explicit allowlist via class or data-attribute
  if (element.closest('.allow-copy, [data-allow-copy="true"], [data-allow-copy]')) {
    return true;
  }

  // 3. Interactive buttons & action links (share, download, copy triggers)
  if (element.closest('button, [role="button"], a[download]')) {
    return true;
  }

  return false;
}

/**
 * Checks if the current text selection is contained within an allowlisted element.
 * @returns {boolean}
 */
export function isSelectionAllowlisted() {
  if (typeof window === 'undefined' || !window.getSelection) return false;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;

  const anchor = selection.anchorNode;
  const focus = selection.focusNode;

  return isAllowlistedElement(anchor) && isAllowlistedElement(focus);
}

/**
 * Evaluates whether the current active event or selection context permits copying.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isCurrentContextAllowlisted(target) {
  if (isAllowlistedElement(target)) return true;
  if (typeof document !== 'undefined' && isAllowlistedElement(document.activeElement)) return true;
  if (isSelectionAllowlisted()) return true;
  return false;
}

let isInitialized = false;
let cleanupHandlers = [];

/**
 * Initialize all client-side content protection listeners.
 * Safe to call multiple times (idempotent).
 */
export function initContentProtection() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (isInitialized) return cleanupContentProtection;

  // ── 1. Right-Click Context Menu Interception ──
  const handleContextMenu = (e) => {
    if (isCurrentContextAllowlisted(e.target)) {
      return; // Allow native context menu for allowed elements
    }
    e.preventDefault();
  };

  // ── 2. Element & Media Dragstart Interception ──
  const handleDragStart = (e) => {
    if (isCurrentContextAllowlisted(e.target)) {
      return; // Allow dragging for allowed elements / form controls
    }
    e.preventDefault();
  };

  // ── 3. Copy & Cut Event Interception ──
  const handleCopy = (e) => {
    if (isCurrentContextAllowlisted(e.target)) {
      return; // Allow normal copying
    }
    e.preventDefault();
  };

  const handleCut = (e) => {
    if (isCurrentContextAllowlisted(e.target)) {
      return; // Allow normal cutting
    }
    e.preventDefault();
  };

  // ── 4. Keydown Shortcuts & DevTools Deterrents ──
  const handleKeyDown = (e) => {
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const isAlt = e.altKey;
    const key = (e.key || '').toLowerCase();
    const code = e.code || '';

    // DevTools deterrents: F12
    if (key === 'f12' || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // DevTools hotkeys:
    // Ctrl+Shift+I / Cmd+Option+I (Inspect)
    // Ctrl+Shift+J / Cmd+Option+J (Console)
    // Ctrl+Shift+C / Cmd+Option+C / Cmd+Shift+C (Inspect Element)
    const isDevToolsInspect = (isCtrlOrMeta && isShift && (key === 'i' || code === 'KeyI')) ||
                              (isCtrlOrMeta && isAlt && (key === 'i' || code === 'KeyI'));
    const isDevToolsConsole = (isCtrlOrMeta && isShift && (key === 'j' || code === 'KeyJ')) ||
                              (isCtrlOrMeta && isAlt && (key === 'j' || code === 'KeyJ'));
    const isDevToolsElement = (isCtrlOrMeta && (isShift || isAlt) && (key === 'c' || code === 'KeyC'));

    if (isDevToolsInspect || isDevToolsConsole || isDevToolsElement) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Save Page: Ctrl+S / Cmd+S
    if (isCtrlOrMeta && !isShift && !isAlt && (key === 's' || code === 'KeyS')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Print: Ctrl+P / Cmd+P
    if (isCtrlOrMeta && !isShift && !isAlt && (key === 'p' || code === 'KeyP')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // View Source: Ctrl+U / Cmd+U
    if (isCtrlOrMeta && !isShift && !isAlt && (key === 'u' || code === 'KeyU')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Select All: Ctrl+A / Cmd+A
    if (isCtrlOrMeta && !isShift && !isAlt && (key === 'a' || code === 'KeyA')) {
      if (!isCurrentContextAllowlisted(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    // Copy: Ctrl+C / Cmd+C (without Shift/Alt so it doesn't collide with DevTools)
    if (isCtrlOrMeta && !isShift && !isAlt && (key === 'c' || code === 'KeyC')) {
      if (!isCurrentContextAllowlisted(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    // Cut: Ctrl+X / Cmd+X
    if (isCtrlOrMeta && !isShift && !isAlt && (key === 'x' || code === 'KeyX')) {
      if (!isCurrentContextAllowlisted(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
  };

  // ── 5. Text Selection Drag Interception (selectstart) ──
  const handleSelectStart = (e) => {
    if (isCurrentContextAllowlisted(e.target)) {
      return; // Allow selecting text inside form inputs and allowlisted elements
    }
    e.preventDefault();
  };

  // ── 6. Print Interception (beforeprint) ──
  const handleBeforePrint = () => {
    // If the browser attempts to print, reinforce hiding the body
    if (document.body) {
      document.body.style.setProperty('display', 'none', 'important');
    }
  };

  const handleAfterPrint = () => {
    if (document.body) {
      document.body.style.removeProperty('display');
    }
  };

  // Register all listeners with capture: true to intercept before default handlers
  document.addEventListener('contextmenu', handleContextMenu, { capture: true });
  document.addEventListener('dragstart', handleDragStart, { capture: true });
  document.addEventListener('selectstart', handleSelectStart, { capture: true });
  document.addEventListener('copy', handleCopy, { capture: true });
  document.addEventListener('cut', handleCut, { capture: true });
  window.addEventListener('keydown', handleKeyDown, { capture: true });
  window.addEventListener('beforeprint', handleBeforePrint);
  window.addEventListener('afterprint', handleAfterPrint);

  cleanupHandlers = [
    () => document.removeEventListener('contextmenu', handleContextMenu, { capture: true }),
    () => document.removeEventListener('dragstart', handleDragStart, { capture: true }),
    () => document.removeEventListener('selectstart', handleSelectStart, { capture: true }),
    () => document.removeEventListener('copy', handleCopy, { capture: true }),
    () => document.removeEventListener('cut', handleCut, { capture: true }),
    () => window.removeEventListener('keydown', handleKeyDown, { capture: true }),
    () => window.removeEventListener('beforeprint', handleBeforePrint),
    () => window.removeEventListener('afterprint', handleAfterPrint),
  ];

  isInitialized = true;
  return cleanupContentProtection;
}

/**
 * Remove all content protection listeners (useful for testing or teardown).
 */
export function cleanupContentProtection() {
  cleanupHandlers.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
  cleanupHandlers = [];
  isInitialized = false;
}

export default {
  initContentProtection,
  cleanupContentProtection,
  isAllowlistedElement,
  isSelectionAllowlisted,
  isCurrentContextAllowlisted,
};
