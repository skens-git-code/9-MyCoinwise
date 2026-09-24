/* —————————————————————————————————————
 * Keyboard Shortcuts Modal
 * Displays the app's keyboard shortcuts grouped by category, with
 * platform-aware key labels (Mac vs. everything else).
 *
 * Props:
 *   - isOpen  : controls visibility.
 *   - onClose : callback to dismiss the modal.
 *
 * Behavior:
 *   - Keys shown depend on `navigator.platform` (⌘ on macOS, Ctrl
 *     elsewhere).
 *   - Backdrop click closes the modal; clicks inside the panel stop
 *     propagation.
 *   - Renders nothing when `isOpen` is false.
 *   - The footer reminds the user that Escape or an outside click
 *     dismisses the modal.
 * ————————————————————————————————————— */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X, Command } from 'lucide-react';

/* —————————————————————————————————————
 * Shortcut Groups
 * Each group has a title and a list of shortcuts. Each shortcut
 * provides both a `keys` (non-Mac) and `macKeys` variant.
 * ————————————————————————————————————— */
const SHORTCUT_GROUPS = [
  {
    title: 'General Navigation',
    shortcuts: [
      { keys: ['Ctrl', 'K'], macKeys: ['⌘', 'K'], label: 'Open Global Search & Command Palette' },
      { keys: ['Ctrl', 'B'], macKeys: ['⌘', 'B'], label: 'Toggle Sidebar Collapse' },
      { keys: ['?'], macKeys: ['?'], label: 'Open Keyboard Shortcuts Guide' },
      { keys: ['Esc'], macKeys: ['Esc'], label: 'Close active modal / dropdown' }
    ]
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['Ctrl', 'N'], macKeys: ['Ctrl', 'N'], label: 'Quick Add Transaction' },
      { keys: ['Ctrl', 'R'], macKeys: ['Ctrl', 'R'], label: 'Refresh Financial Data' }
    ]
  }
];

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  // ── Detect macOS to choose ⌘ vs. Ctrl labels ──
  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().indexOf('MAC') >= 0;

  // ── Render nothing when closed ──
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {/* ── Backdrop: click to close ── */}
      <div className="shortcuts-backdrop" onClick={onClose}>
        {/* ── Modal panel: stops propagation so clicks inside stay inside ── */}
        <motion.div
          className="shortcuts-modal glass"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
        >
          {/* ── Header: title and close button ── */}
          <div className="shortcuts-header">
            <div className="shortcuts-title-row">
              <Keyboard size={20} className="shortcuts-icon" />
              <h3>Keyboard Shortcuts</h3>
            </div>
            <button className="shortcuts-close-btn" onClick={onClose} aria-label="Close shortcuts">
              <X size={18} />
            </button>
          </div>

          {/* ── Shortcut groups ── */}
          <div className="shortcuts-body">
            {SHORTCUT_GROUPS.map((group, gIdx) => (
              <div key={gIdx} className="shortcuts-group">
                {/* ── Group title ── */}
                <h4>{group.title}</h4>

                {/* ── Rows for each shortcut in the group ── */}
                <div className="shortcuts-list">
                  {group.shortcuts.map((sc, sIdx) => {
                    // ── Choose Mac or non-Mac key labels ──
                    const keysToDisplay = isMac ? sc.macKeys : sc.keys;
                    return (
                      <div key={sIdx} className="shortcut-row">
                        {/* ── Action description ── */}
                        <span className="shortcut-label">{sc.label}</span>

                        {/* ── Key chips separated by "+" ── */}
                        <div className="shortcut-keys">
                          {keysToDisplay.map((k, kIdx) => (
                            <React.Fragment key={kIdx}>
                              <kbd>{k}</kbd>
                              {kIdx < keysToDisplay.length - 1 && <span className="key-separator">+</span>}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ── Footer hint ── */}
          <div className="shortcuts-footer">
            <span>Press <kbd>Esc</kbd> or click outside to dismiss</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}