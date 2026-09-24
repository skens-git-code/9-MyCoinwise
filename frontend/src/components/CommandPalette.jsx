/* —————————————————————————————————————
 * Command Palette Component
 * Modal search palette that lets the user quickly jump to pages,
 * transactions, goals, or subscriptions.
 *
 * Props:
 *   - isOpen  : controls visibility.
 *   - onClose : callback to dismiss the palette.
 *
 * Behavior:
 *   - With an empty query, shows 4 quick page links and the 4 most
 *     recent transactions.
 *   - With a query, matches pages, transactions, goals, and
 *     subscriptions (case-insensitive substring match, capped at 12
 *     results).
 *   - Keyboard: ArrowUp / ArrowDown navigate, Enter selects,
 *     Escape closes.
 *   - The selected row is kept scrolled into view.
 *   - Query and selection are reset each time the palette opens.
 * ————————————————————————————————————— */

import React, { useState, useMemo, useEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ArrowRight, Wallet, Target, CreditCard,
  Briefcase, Calendar, Settings, BarChart3,
  ArrowLeftRight, X, Zap, Tag, ReceiptText
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function CommandPalette({ isOpen, onClose }) {
  // ── Router and app context ──
  const navigate = useNavigate();
  const { transactions = [], goals = [], subscriptions = [], fmt } = useContext(AppContext);

  // ── Local state: query, selected index, refs ──
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ── Reset query and selection whenever the palette transitions
  //    from closed to open (state update derived from props). ──
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }

  // ── Focus the input shortly after opening ──
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  /* —————————————————————————————————————
   * Static Navigation Items
   * Fixed list of page shortcuts shown as results.
   * ————————————————————————————————————— */
  const navigationItems = useMemo(() => [
    { id: 'nav-dash', type: 'page', title: 'Dashboard', subtitle: 'Overview of finances', icon: Wallet, to: '/' },
    { id: 'nav-tx', type: 'page', title: 'Transactions', subtitle: 'View & filter all records', icon: ArrowLeftRight, to: '/transactions' },
    { id: 'nav-cal', type: 'page', title: 'Calendar', subtitle: 'Monthly timeline & schedule', icon: Calendar, to: '/calendar' },
    { id: 'nav-ana', type: 'page', title: 'Analytics', subtitle: 'Detailed breakdowns & charts', icon: BarChart3, to: '/analytics' },
    { id: 'nav-goal', type: 'page', title: 'Savings Goals', subtitle: 'Track targets & milestones', icon: Target, to: '/goals' },
    { id: 'nav-sub', type: 'page', title: 'Subscriptions', subtitle: 'Recurring monthly & annual bills', icon: CreditCard, to: '/subscriptions' },
    { id: 'nav-wealth', type: 'page', title: 'Wealth & Assets', subtitle: 'Net worth & asset management', icon: Briefcase, to: '/wealth' },
    { id: 'nav-set', type: 'page', title: 'Settings', subtitle: 'Preferences, security & profile', icon: Settings, to: '/settings' },
    { id: 'nav-tax', type: 'page', title: 'Tax Center', subtitle: 'Profiles, estimates & reports', icon: ReceiptText, to: '/tax' },
  ], []);

  /* —————————————————————————————————————
   * Search Indexing & Fuzzy Filtering
   * Empty query  → 4 quick pages + 4 most recent transactions.
   * Non-empty    → matches across pages, transactions, goals, and
   *                subscriptions, capped at 12 results.
   * ————————————————————————————————————— */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    // ── Default view: quick pages + recent transactions ──
    if (!q) {
      // Default: show quick pages + recent 4 transactions
      const recentTx = transactions.slice(0, 4).map(t => ({
        id: `tx-${t.id || t._id}`,
        type: 'transaction',
        title: `${t.category} — ${t.type === 'income' ? '+' : '-'}${fmt ? fmt(t.amount) : t.amount}`,
        subtitle: t.note ? `${t.note} (${t.date ? new Date(t.date).toLocaleDateString() : ''})` : (t.date ? new Date(t.date).toLocaleDateString() : ''),
        icon: t.type === 'income' ? Zap : Tag,
        to: '/transactions',
        highlight: t.category
      }));
      return [...navigationItems.slice(0, 4), ...recentTx];
    }

    const matched = [];

    // ── Match Pages ──
    navigationItems.forEach(item => {
      if (item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)) {
        matched.push(item);
      }
    });

    // ── Match Transactions (category, note, amount, or type) ──
    transactions.forEach(t => {
      const matchCat = t.category?.toLowerCase().includes(q);
      const matchNote = t.note?.toLowerCase().includes(q);
      const matchAmt = String(t.amount).includes(q);
      const matchType = t.type?.toLowerCase() === q;
      if (matchCat || matchNote || matchAmt || matchType) {
        matched.push({
          id: `tx-${t.id || t._id}`,
          type: 'transaction',
          title: `${t.category} (${t.type === 'income' ? '+' : '-'}${fmt ? fmt(t.amount) : t.amount})`,
          subtitle: t.note ? `${t.note} · ${new Date(t.date).toLocaleDateString()}` : new Date(t.date).toLocaleDateString(),
          icon: t.type === 'income' ? Zap : ArrowLeftRight,
          to: '/transactions',
          badge: t.type
        });
      }
    });

    // ── Match Goals ──
    goals.forEach(g => {
      if (g.name?.toLowerCase().includes(q) || g.notes?.toLowerCase().includes(q)) {
        matched.push({
          id: `goal-${g.id || g._id}`,
          type: 'goal',
          title: `Goal: ${g.name}`,
          subtitle: `Target: ${fmt ? fmt(g.target) : g.target} (Saved: ${fmt ? fmt(g.saved || 0) : g.saved})`,
          icon: Target,
          to: '/goals'
        });
      }
    });

    // ── Match Subscriptions ──
    subscriptions.forEach(s => {
      if (s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q)) {
        matched.push({
          id: `sub-${s.id || s._id}`,
          type: 'subscription',
          title: `Subscription: ${s.name}`,
          subtitle: `${fmt ? fmt(s.amount) : s.amount}/${s.cycle || 'month'}`,
          icon: CreditCard,
          to: '/subscriptions'
        });
      }
    });

    // ── Cap the total number of results ──
    return matched.slice(0, 12);
  }, [query, navigationItems, transactions, goals, subscriptions, fmt]);

  /* —————————————————————————————————————
   * Keyboard Navigation
   * ArrowUp / ArrowDown cycle the selection, Enter navigates and
   * closes, Escape closes. Bound only while the palette is open.
   * ————————————————————————————————————— */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, results.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % Math.max(1, results.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          navigate(results[selectedIndex].to);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, navigate, onClose]);

  /* —————————————————————————————————————
   * Scroll Active Item Into View
   * Ensures the currently selected row stays visible while the user
   * navigates with the keyboard.
   * ————————————————————————————————————— */
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // ── Render nothing when closed ──
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {/* ── Backdrop: click outside to close ── */}
      <div className="cmd-palette-backdrop" onClick={onClose}>
        <motion.div
          className="cmd-palette-modal glass"
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Global Command Palette"
        >
          {/* ── Search input row ── */}
          <div className="cmd-search-box">
            <Search size={18} className="cmd-search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="cmd-input"
              placeholder="Search transactions, goals, subscriptions, pages..."
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
              aria-autocomplete="list"
            />

            {/* ── Clear button (only shown when there is a query) ── */}
            {query && (
              <button className="cmd-clear-btn" onClick={() => setQuery('')}>
                <X size={15} />
              </button>
            )}

            <kbd className="cmd-kbd-badge">ESC</kbd>
          </div>

          {/* ── Results list ── */}
          <div className="cmd-results-list" ref={listRef} role="listbox">
            {results.length > 0 ? (
              results.map((item, idx) => {
                const IconComponent = item.icon || ArrowRight;
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    className={`cmd-result-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      navigate(item.to);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {/* ── Item icon ── */}
                    <div className="cmd-item-icon">
                      <IconComponent size={16} />
                    </div>

                    {/* ── Item info: title row + subtitle ── */}
                    <div className="cmd-item-info">
                      <div className="cmd-item-title-row">
                        <span className="cmd-item-title">{item.title}</span>
                        {item.badge && (
                          <span className={`cmd-badge ${item.badge}`}>{item.badge}</span>
                        )}
                        <span className="cmd-item-type">{item.type}</span>
                      </div>
                      {item.subtitle && <span className="cmd-item-sub">{item.subtitle}</span>}
                    </div>

                    {/* ── Trailing enter arrow ── */}
                    <ArrowRight size={14} className="cmd-enter-icon" />
                  </div>
                );
              })
            ) : (
              /* ── Empty state ── */
              <div className="cmd-empty">
                <p>No results found for &ldquo;{query}&rdquo;</p>
                <span>Try searching for a category like &ldquo;Food&rdquo;, a goal, or a route name.</span>
              </div>
            )}
          </div>

          {/* ── Footer: keyboard hints ── */}
          <div className="cmd-footer">
            <span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}