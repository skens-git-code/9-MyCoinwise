/* —————————————————————————————————————
 * AlertsCenter Component (Notification Center)
 * Enterprise-grade, accessible, and responsive Notification Center.
 *
 * Features:
 *   - Live prioritization (Critical, Warning, Success, Info, Tip).
 *   - Smart category filtering (All, Unread, Critical, Budget, Goals, Insights, Archived).
 *   - Real-time instant search across titles, messages, categories, and details.
 *   - Pinned / starred important alerts.
 *   - Read / unread toggle and bulk actions ("Mark all as read", "Archive all").
 *   - Notification delivery modes: Normal, Priority Only, and Silent (DND).
 *   - Expandable notification cards with contextual explanation & quick actions.
 *   - Cross-window & localStorage synchronized via notificationManager.
 *   - Keyboard navigation, ARIA live regions, focus trap, and responsive bottom sheet.
 * ————————————————————————————————————— */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bell, X, AlertTriangle, Info, CheckCircle,
  Lightbulb, ShieldAlert, Trash2, Search,
  CheckCheck, Archive, Star, ChevronDown, ChevronUp,
  ArrowUpRight, Volume2, VolumeX, Sparkles, RotateCcw,
  SlidersHorizontal, Check,
} from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { notificationManager } from '../utils/notificationManager';

/* —————————————————————————————————————
 * Type Configuration
 * ————————————————————————————————————— */
const TYPE_CONFIG = {
  danger: {
    color: 'var(--danger, #ef4444)',
    bg: 'rgba(239, 68, 68, 0.10)',
    border: 'rgba(239, 68, 68, 0.28)',
    icon: ShieldAlert,
    label: 'Critical',
    badgeClass: 'badge-danger',
  },
  warning: {
    color: 'var(--warning, #f59e0b)',
    bg: 'rgba(245, 158, 11, 0.10)',
    border: 'rgba(245, 158, 11, 0.28)',
    icon: AlertTriangle,
    label: 'Warning',
    badgeClass: 'badge-warning',
  },
  info: {
    color: 'var(--info, #06b6d4)',
    bg: 'rgba(6, 182, 212, 0.10)',
    border: 'rgba(6, 182, 212, 0.28)',
    icon: Info,
    label: 'Info',
    badgeClass: 'badge-info',
  },
  success: {
    color: 'var(--success, #10b981)',
    bg: 'rgba(16, 185, 129, 0.10)',
    border: 'rgba(16, 185, 129, 0.28)',
    icon: CheckCircle,
    label: 'Milestone',
    badgeClass: 'badge-success',
  },
  tip: {
    color: 'var(--brand-secondary, #8b5cf6)',
    bg: 'rgba(139, 92, 246, 0.10)',
    border: 'rgba(139, 92, 246, 0.28)',
    icon: Lightbulb,
    label: 'Pro Tip',
    badgeClass: 'badge-tip',
  },
};

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'critical', label: 'Critical' },
  { id: 'budget', label: 'Budget' },
  { id: 'goal', label: 'Goals' },
  { id: 'spending', label: 'Spending' },
  { id: 'archived', label: 'Archived' },
];

function stableId(alert, index) {
  return alert.id ?? `${alert.type ?? 'info'}-${index}-${String(alert.message ?? alert.title ?? '').slice(0, 24)}`;
}

/* —————————————————————————————————————
 * Animation Variants
 * ————————————————————————————————————— */
const panelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 340, damping: 28 },
  },
  exit: { opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.16 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i * 0.03, 0.2), duration: 0.2 },
  }),
  exit: {
    opacity: 0,
    x: 20,
    height: 0,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    transition: { duration: 0.18 },
  },
};

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function AlertsCenter({
  alerts = [],
  onClose,
  onDismissOne,
  onDismissAll,
}) {
  const navigate = useNavigate();
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);

  // ── Sync State with notificationManager ──
  const [readIds, setReadIds] = useState(() => notificationManager.getReadIds());
  const [archivedIds, setArchivedIds] = useState(() => notificationManager.getArchivedIds());
  const [pinnedIds, setPinnedIds] = useState(() => notificationManager.getPinnedIds());
  const [deliveryMode, setDeliveryMode] = useState(() => notificationManager.getMode());

  // ── UI States ──
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('priority'); // 'priority' | 'newest'
  const [expandedId, setExpandedId] = useState(null);
  const [showModeMenu, setShowModeMenu] = useState(false);

  // Subscribe to changes from other tabs or components
  useEffect(() => {
    return notificationManager.subscribe(() => {
      setReadIds(notificationManager.getReadIds());
      setArchivedIds(notificationManager.getArchivedIds());
      setPinnedIds(notificationManager.getPinnedIds());
      setDeliveryMode(notificationManager.getMode());
    });
  }, []);

  // ── Enrich alerts with stable IDs and uniform schema ──
  const enrichedAlerts = useMemo(() => {
    return alerts.map((a, i) => {
      const sid = stableId(a, i);
      return {
        ...a,
        _sid: sid,
        id: a.id || sid,
        category: a.category || (a.type === 'tip' ? 'tip' : a.type === 'danger' ? 'budget' : 'spending'),
        timestamp: a.timestamp || new Date().toISOString(),
      };
    });
  }, [alerts]);

  // ── Handlers ──
  const handleMarkAsRead = useCallback((id, e) => {
    e?.stopPropagation?.();
    notificationManager.markAsRead(id);
    setReadIds(notificationManager.getReadIds());
  }, []);

  const handleMarkAsUnread = useCallback((id, e) => {
    e?.stopPropagation?.();
    notificationManager.markAsUnread(id);
    setReadIds(notificationManager.getReadIds());
  }, []);

  const handleTogglePin = useCallback((id, e) => {
    e?.stopPropagation?.();
    notificationManager.togglePin(id);
    setPinnedIds(notificationManager.getPinnedIds());
  }, []);

  const handleArchiveOne = useCallback((id, rawId, e) => {
    e?.stopPropagation?.();
    notificationManager.archive(id);
    if (rawId && rawId !== id) notificationManager.archive(rawId);
    setArchivedIds(notificationManager.getArchivedIds());
    if (typeof onDismissOne === 'function') onDismissOne(rawId || id);
  }, [onDismissOne]);

  const handleRestoreOne = useCallback((id, e) => {
    e?.stopPropagation?.();
    notificationManager.unarchive(id);
    setArchivedIds(notificationManager.getArchivedIds());
  }, []);

  const handleMarkAllRead = useCallback(() => {
    const idsToMark = enrichedAlerts
      .filter((a) => !archivedIds.has(a._sid) && !archivedIds.has(a.id))
      .map((a) => a._sid);
    notificationManager.markAllAsRead(idsToMark);
    setReadIds(notificationManager.getReadIds());
  }, [enrichedAlerts, archivedIds]);

  const handleArchiveAllActive = useCallback(() => {
    const idsToArchive = enrichedAlerts
      .filter((a) => !archivedIds.has(a._sid) && !archivedIds.has(a.id))
      .map((a) => a._sid);
    notificationManager.archiveAll(idsToArchive);
    setArchivedIds(notificationManager.getArchivedIds());
    if (typeof onDismissAll === 'function') onDismissAll();
  }, [enrichedAlerts, archivedIds, onDismissAll]);

  const handleClearHistory = useCallback(() => {
    notificationManager.clearAllHistory();
    setArchivedIds(new Set());
    setReadIds(new Set());
    setPinnedIds(new Set());
  }, []);

  const handleModeChange = useCallback((mode) => {
    notificationManager.setMode(mode);
    setDeliveryMode(mode);
    setShowModeMenu(false);
  }, []);

  const handleActionClick = useCallback((actionRoute, alertId, e) => {
    e?.stopPropagation?.();
    if (alertId) notificationManager.markAsRead(alertId);
    if (actionRoute) {
      onClose();
      navigate(actionRoute);
    }
  }, [navigate, onClose]);

  // ── Filtered & Sorted Alerts ──
  const { visibleAlerts, unreadCount, criticalCount, totalActiveCount } = useMemo(() => {
    // Determine active vs archived list
    const isArchivedView = activeCategory === 'archived';

    let list = enrichedAlerts.filter((a) => {
      const isArch = archivedIds.has(a._sid) || archivedIds.has(a.id);
      return isArchivedView ? isArch : !isArch;
    });

    // Counts on all active alerts
    const allActive = enrichedAlerts.filter((a) => !archivedIds.has(a._sid) && !archivedIds.has(a.id));
    const unread = allActive.filter((a) => !readIds.has(a._sid) && !readIds.has(a.id)).length;
    const critical = allActive.filter((a) => a.type === 'danger' || a.type === 'warning').length;
    const totalActive = allActive.length;

    // Delivery mode filtering (Priority mode hides tips/info from active view)
    if (!isArchivedView && deliveryMode === 'priority') {
      list = list.filter((a) => a.type === 'danger' || a.type === 'warning' || pinnedIds.has(a._sid) || pinnedIds.has(a.id));
    }

    // Category filtering
    if (activeCategory === 'unread') {
      list = list.filter((a) => !readIds.has(a._sid) && !readIds.has(a.id));
    } else if (activeCategory === 'critical') {
      list = list.filter((a) => a.type === 'danger' || a.type === 'warning');
    } else if (activeCategory === 'budget') {
      list = list.filter((a) => a.category === 'budget');
    } else if (activeCategory === 'goal') {
      list = list.filter((a) => a.category === 'goal');
    } else if (activeCategory === 'spending') {
      list = list.filter((a) => a.category === 'spending');
    }

    // Search query filtering
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((a) => {
        const title = String(a.title || '').toLowerCase();
        const msg = String(a.message || '').toLowerCase();
        const cat = String(a.category || '').toLowerCase();
        const details = String(a.details || '').toLowerCase();
        return title.includes(q) || msg.includes(q) || cat.includes(q) || details.includes(q);
      });
    }

    // Sort order: Pinned always float to top, followed by Priority or Newest
    list.sort((a, b) => {
      const aPinned = pinnedIds.has(a._sid) || pinnedIds.has(a.id);
      const bPinned = pinnedIds.has(b._sid) || pinnedIds.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      if (sortBy === 'newest') {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      }
      // default: priority (1=Critical first)
      return (a.priority || 5) - (b.priority || 5);
    });

    return {
      visibleAlerts: list,
      unreadCount: unread,
      criticalCount: critical,
      totalActiveCount: totalActive,
    };
  }, [
    enrichedAlerts,
    archivedIds,
    readIds,
    pinnedIds,
    activeCategory,
    deliveryMode,
    searchQuery,
    sortBy,
  ]);

  // ── Focus Management ──
  useFocusTrap({
    isOpen: true,
    onClose,
    containerRef: modalRef,
    closeOnEscape: true,
    lockScroll: true,
  });

  return createPortal(
    <motion.div
      className="ac-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      aria-hidden="true"
    >
      <motion.div
        ref={modalRef}
        className="ac-panel glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-title"
        variants={panelVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Mobile drag indicator handle ── */}
        <div className="ac-mobile-handle" aria-hidden="true" />

        {/* ── Header ── */}
        <div className="ac-header">
          <div className="ac-title-group">
            <div className={`ac-title-icon ${deliveryMode === 'silent' ? 'silent' : ''}`}>
              <Bell size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 id="ac-title" className="ac-title">Notification Center</h2>
                {unreadCount > 0 && (
                  <span className="ac-unread-indicator-badge">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <span className="ac-subtitle">
                {deliveryMode === 'silent' ? 'Muted (Do Not Disturb)' : deliveryMode === 'priority' ? 'Priority Filtered' : 'Real-time financial intelligence'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* ── Mode selector dropdown ── */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn-secondary ac-mode-btn"
                onClick={() => setShowModeMenu((v) => !v)}
                title={`Delivery mode: ${deliveryMode}`}
                aria-label={`Delivery mode: ${deliveryMode}`}
                aria-expanded={showModeMenu}
              >
                {deliveryMode === 'silent' ? (
                  <VolumeX size={14} style={{ color: 'var(--text-muted)' }} />
                ) : deliveryMode === 'priority' ? (
                  <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                ) : (
                  <Volume2 size={14} style={{ color: 'var(--brand-primary)' }} />
                )}
                <span className="ac-mode-text">{deliveryMode.toUpperCase()}</span>
                <ChevronDown size={12} style={{ opacity: 0.6 }} />
              </button>

              <AnimatePresence>
                {showModeMenu && (
                  <motion.div
                    className="ac-mode-dropdown glass"
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  >
                    {[
                      { id: 'normal', label: 'Normal Mode', desc: 'Deliver all smart alerts & tips', icon: Volume2 },
                      { id: 'priority', label: 'Priority Only', desc: 'Critical alerts & warnings only', icon: AlertTriangle },
                      { id: 'silent', label: 'Silent Mode', desc: 'Mute badge pulses & sound', icon: VolumeX },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`ac-mode-opt ${deliveryMode === m.id ? 'active' : ''}`}
                        onClick={() => handleModeChange(m.id)}
                      >
                        <m.icon size={14} />
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{m.label}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.desc}</div>
                        </div>
                        {deliveryMode === m.id && <Check size={13} style={{ marginLeft: 'auto', color: 'var(--brand-primary)' }} />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Close Button ── */}
            <motion.button
              className="ibtn ac-close-btn"
              onClick={onClose}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Close notification center"
            >
              <X size={16} />
            </motion.button>
          </div>
        </div>

        {/* ── Search Bar ── */}
        <div className="ac-search-bar">
          <Search size={14} className="ac-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="ac-search-input"
            placeholder="Search alerts, categories, or insights…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search notifications"
          />
          {searchQuery && (
            <button
              type="button"
              className="ac-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search query"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* ── Filter Tabs ── */}
        <div className="ac-tabs-bar" role="tablist">
          {CATEGORIES.map((cat) => {
            let countBadge = null;
            if (cat.id === 'unread' && unreadCount > 0) countBadge = unreadCount;
            else if (cat.id === 'critical' && criticalCount > 0) countBadge = criticalCount;
            else if (cat.id === 'archived' && archivedIds.size > 0) countBadge = archivedIds.size;

            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={activeCategory === cat.id}
                className={`ac-tab-btn ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span>{cat.label}</span>
                {countBadge != null && (
                  <span className={`ac-tab-count ${cat.id === 'critical' ? 'danger' : ''}`}>
                    {countBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Bulk Actions & Sort Toolbar ── */}
        <div className="ac-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {visibleAlerts.length} {visibleAlerts.length === 1 ? 'alert' : 'alerts'}
            </span>
            <button
              type="button"
              className="ac-sort-toggle"
              onClick={() => setSortBy((s) => (s === 'priority' ? 'newest' : 'priority'))}
              title={`Sorted by ${sortBy === 'priority' ? 'Severity Priority' : 'Most Recent'}`}
            >
              <SlidersHorizontal size={11} /> {sortBy === 'priority' ? 'By Severity' : 'Newest'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {activeCategory !== 'archived' ? (
              <>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="ac-action-link"
                    onClick={handleMarkAllRead}
                    title="Mark all active notifications as read"
                  >
                    <CheckCheck size={13} /> Mark read
                  </button>
                )}
                {totalActiveCount > 0 && (
                  <button
                    type="button"
                    className="ac-action-link"
                    onClick={handleArchiveAllActive}
                    title="Archive all active notifications"
                  >
                    <Archive size={13} /> Archive all
                  </button>
                )}
              </>
            ) : (
              archivedIds.size > 0 && (
                <button
                  type="button"
                  className="ac-action-link danger"
                  onClick={handleClearHistory}
                  title="Permanently remove archived history"
                >
                  <Trash2 size={13} /> Clear history
                </button>
              )
            )}
          </div>
        </div>

        {/* ── Notifications Scroll List ── */}
        <div className="ac-list" role="list">
          <AnimatePresence mode="popLayout">
            {visibleAlerts.length === 0 ? (
              <motion.div
                key="ac-empty"
                className="ac-empty"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18 }}
              >
                <div className="ac-empty-icon">
                  {searchQuery ? (
                    <Search size={34} style={{ opacity: 0.5 }} />
                  ) : activeCategory === 'archived' ? (
                    <Archive size={34} style={{ opacity: 0.5 }} />
                  ) : (
                    <CheckCircle size={38} style={{ color: 'var(--brand-primary)' }} />
                  )}
                </div>
                <p className="ac-empty-title">
                  {searchQuery
                    ? 'No matching notifications found'
                    : activeCategory === 'unread'
                      ? 'You are all caught up!'
                      : activeCategory === 'archived'
                        ? 'Archive is empty'
                        : 'No active alerts'}
                </p>
                <p className="ac-empty-sub">
                  {searchQuery
                    ? `No notifications found matching "${searchQuery}". Try a different keyword.`
                    : activeCategory === 'unread'
                      ? 'All current notifications have been read.'
                      : activeCategory === 'archived'
                        ? 'Notifications you dismiss will appear here for reference.'
                        : 'Your finances look healthy. Keep up the disciplined habits!'}
                </p>
              </motion.div>
            ) : (
              visibleAlerts.map((alert, idx) => {
                const cfg = TYPE_CONFIG[String(alert.type || '').toLowerCase()] ?? TYPE_CONFIG.info;
                const Icon = cfg.icon;
                const isRead = readIds.has(alert._sid) || readIds.has(alert.id);
                const isPinned = pinnedIds.has(alert._sid) || pinnedIds.has(alert.id);
                const isArchived = archivedIds.has(alert._sid) || archivedIds.has(alert.id);
                const isExpanded = expandedId === alert._sid;

                return (
                  <motion.div
                    key={alert._sid}
                    className={`ac-item ${isRead ? 'read' : 'unread'} ${isPinned ? 'pinned' : ''}`}
                    role="listitem"
                    custom={idx}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    style={{
                      '--ac-color': cfg.color,
                      '--ac-bg': cfg.bg,
                      '--ac-border': cfg.border,
                    }}
                    onClick={() => {
                      if (!isRead) handleMarkAsRead(alert._sid);
                    }}
                  >
                    {/* ── Left color indicator stripe ── */}
                    <div className="ac-item-stripe" aria-hidden="true" />

                    {/* ── Type Icon Box ── */}
                    <div className="ac-item-icon-box" aria-hidden="true">
                      <Icon size={16} />
                    </div>

                    {/* ── Main Content Body ── */}
                    <div className="ac-item-body">
                      <div className="ac-item-meta">
                        <span className={`ac-item-badge ${cfg.badgeClass}`}>
                          {cfg.label}
                        </span>
                        {alert.category && (
                          <span className="ac-item-cat-tag">
                            {alert.category}
                          </span>
                        )}
                        <span className="ac-item-time">
                          {notificationManager.formatRelativeTime(alert.timestamp)}
                        </span>
                        {!isRead && <span className="ac-unread-dot" title="Unread" />}
                      </div>

                      {alert.title && <p className="ac-item-title">{alert.title}</p>}
                      <p className="ac-item-msg">{alert.message}</p>

                      {/* ── Expandable Details Panel ── */}
                      {alert.details && (
                        <div className="ac-details-wrap">
                          <button
                            type="button"
                            className="ac-details-toggle"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId((prev) => (prev === alert._sid ? null : alert._sid));
                            }}
                            aria-expanded={isExpanded}
                          >
                            <span>{isExpanded ? 'Hide details' : 'View explanation'}</span>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                className="ac-details-content"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                              >
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                                  {alert.details}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* ── Quick Action Button (if applicable) ── */}
                      {alert.actionRoute && (
                        <div className="ac-item-actions-row">
                          <button
                            type="button"
                            className="ac-primary-action-btn"
                            onClick={(e) => handleActionClick(alert.actionRoute, alert._sid, e)}
                          >
                            <span>{alert.actionLabel || 'Take Action'}</span>
                            <ArrowUpRight size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ── Right Action Controls ── */}
                    <div className="ac-item-tools" onClick={(e) => e.stopPropagation()}>
                      {/* Pin Toggle */}
                      <button
                        type="button"
                        className={`ac-tool-btn ${isPinned ? 'pinned active' : ''}`}
                        onClick={(e) => handleTogglePin(alert._sid, e)}
                        title={isPinned ? 'Unpin notification' : 'Pin notification to top'}
                        aria-label={isPinned ? 'Unpin notification' : 'Pin notification'}
                      >
                        <Star size={13} fill={isPinned ? 'var(--warning)' : 'none'} />
                      </button>

                      {/* Mark Read/Unread */}
                      <button
                        type="button"
                        className="ac-tool-btn"
                        onClick={(e) => {
                          if (isRead) handleMarkAsUnread(alert._sid, e);
                          else handleMarkAsRead(alert._sid, e);
                        }}
                        title={isRead ? 'Mark as unread' : 'Mark as read'}
                        aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
                      >
                        <CheckCheck size={13} style={{ color: isRead ? 'var(--brand-primary)' : 'inherit' }} />
                      </button>

                      {/* Archive or Restore */}
                      {isArchived ? (
                        <button
                          type="button"
                          className="ac-tool-btn"
                          onClick={(e) => handleRestoreOne(alert._sid, e)}
                          title="Restore notification"
                          aria-label="Restore notification"
                        >
                          <RotateCcw size={13} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ac-tool-btn danger"
                          onClick={(e) => handleArchiveOne(alert._sid, alert.id, e)}
                          title="Dismiss notification"
                          aria-label={`Dismiss: ${alert.title || alert.message}`}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* ── Footer ── */}
        <div className="ac-footer">
          <span className="ac-footer-note">
            <Sparkles size={13} style={{ color: 'var(--brand-primary)' }} />
            Powered by MyCoinwise Autonomous Risk & Budget Monitoring
          </span>
          <button
            type="button"
            className="btn-secondary ac-footer-close-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
