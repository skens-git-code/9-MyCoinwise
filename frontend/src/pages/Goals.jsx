import React, {
  useState, useContext, useMemo, useRef, useEffect, useCallback,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Target, Trash2, Edit3, PlusCircle, Clock, Zap,
  FileText, Calendar, AlertTriangle, ArrowUpDown, History,
  Undo2, Download, LayoutTemplate, X, CheckCircle2, Sparkles, Search,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { predictTimeToGoal } from '../services/aiEngine';
import { api } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

/* ============================================================
 * Constants
 * ============================================================ */
const GOAL_COLORS = [
  '#059669', '#06b6d4', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#3b82f6', '#ef4444',
];

const GOAL_ICONS = ['🎯', '💻', '✈️', '🎮', '📚', '🏋️', '🎸', '🚗', '🏠', '💍', '🛡️', '📈'];

const GOAL_CATEGORIES = [
  { key: 'all', labelKey: 'category_all', fallback: 'All' },
  { key: 'emergency_fund', labelKey: 'category_emergency_fund', fallback: 'Emergency Fund' },
  { key: 'vacation', labelKey: 'category_vacation', fallback: 'Vacation' },
  { key: 'gadget', labelKey: 'category_gadget', fallback: 'Gadget' },
  { key: 'investment', labelKey: 'category_investment', fallback: 'Investment' },
  { key: 'vehicle', labelKey: 'category_vehicle', fallback: 'Vehicle' },
  { key: 'home', labelKey: 'category_home', fallback: 'Home' },
  { key: 'education', labelKey: 'category_education', fallback: 'Education' },
  { key: 'other', labelKey: 'category_other', fallback: 'Other' },
];

/* ✨ NEW: Sort options */
const SORT_OPTIONS = [
  { key: 'created_desc', labelKey: 'sort_newest', fallback: 'Newest first' },
  { key: 'progress_asc', labelKey: 'sort_least_progress', fallback: 'Least progress' },
  { key: 'progress_desc', labelKey: 'sort_most_progress', fallback: 'Most progress' },
  { key: 'deadline_asc', labelKey: 'sort_deadline', fallback: 'Deadline soonest' },
  { key: 'target_desc', labelKey: 'sort_target', fallback: 'Largest target' },
  { key: 'name_asc', labelKey: 'sort_name', fallback: 'Name (A–Z)' },
];

/* ✨ NEW: Goal templates */
const GOAL_TEMPLATES = [
  {
    key: 'emergency',
    icon: '🛡️',
    category: 'emergency_fund',
    nameKey: 'template_emergency_name',
    nameFallback: 'Emergency Fund',
    descKey: 'template_emergency_desc',
    descFallback: 'Six months of living expenses',
    targetMultiplier: 6,
    monthsDeadline: 12,
  },
  {
    key: 'vacation',
    icon: '✈️',
    category: 'vacation',
    nameKey: 'template_vacation_name',
    nameFallback: 'Dream Vacation',
    descKey: 'template_vacation_desc',
    descFallback: 'A well-deserved break',
    target: 2000,
    monthsDeadline: 12,
  },
  {
    key: 'gadget',
    icon: '💻',
    category: 'gadget',
    nameKey: 'template_gadget_name',
    nameFallback: 'New Laptop',
    descKey: 'template_gadget_desc',
    descFallback: 'Upgrade the daily driver',
    target: 1500,
    monthsDeadline: 6,
  },
  {
    key: 'investment',
    icon: '📈',
    category: 'investment',
    nameKey: 'template_investment_name',
    nameFallback: 'Investment Pool',
    descKey: 'template_investment_desc',
    descFallback: 'Long-term growth fund',
    target: 5000,
    monthsDeadline: 24,
  },
];

const HISTORY_KEY_PREFIX = 'mcw_goal_history_';
const UNDO_TIMEOUT_MS = 6000;

/* ============================================================
 * Utilities
 * ============================================================ */
const pad2 = (n) => String(n).padStart(2, '0');

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toFixed2 = (n) => Math.round(safeNumber(n) * 100) / 100;

/** Extract local YYYY-MM-DD from any date-like input (no UTC shift). */
const toLocalDateInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Parse YYYY-MM-DD as local date — never UTC. */
const parseLocalDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const d = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getCategoryKey = (cat) => {
  if (!cat) return 'other';
  const clean = String(cat).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['emergency_fund', 'savings'].includes(clean)) return 'emergency_fund';
  if (['vacation', 'trip', 'holiday'].includes(clean)) return 'vacation';
  if (['gadget', 'tech', 'electronics'].includes(clean)) return 'gadget';
  if (['investment', 'stocks', 'crypto'].includes(clean)) return 'investment';
  if (['vehicle', 'car', 'bike'].includes(clean)) return 'vehicle';
  if (['home', 'house', 'property'].includes(clean)) return 'home';
  if (['education', 'course', 'college'].includes(clean)) return 'education';
  if (['debt', 'loan', 'purchase', 'other'].includes(clean)) return 'other';
  return clean;
};

const getCategoryLabel = (cat, t) => {
  const key = getCategoryKey(cat);
  const knownKey = GOAL_CATEGORIES.some((c) => c.key === key) ? key : 'other';
  return t?.(`category_${knownKey}`) || t?.(knownKey) || cat || 'Goal';
};

const pickColor = (existingGoals) => {
  const used = new Set(
    (existingGoals || []).map((g) => g?.color).filter(Boolean)
  );
  const free = GOAL_COLORS.find((c) => !used.has(c));
  if (free) return free;
  const len = (existingGoals || []).length;
  return GOAL_COLORS[len % GOAL_COLORS.length];
};

/** CSV escape + injection prevention. */
const escapeCsvField = (raw) => {
  const str = raw == null ? '' : String(raw);
  const needsPrefix = /^[=+\-@\t\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  const prefixed = needsPrefix ? `'${escaped}` : escaped;
  const needsQuotes = needsPrefix || /[",\n\r\t]/.test(prefixed);
  return needsQuotes ? `"${prefixed}"` : prefixed;
};

/** ✨ NEW: milestone crossing detection. */
const getCrossedMilestones = (prevPct, newPct) =>
  [25, 50, 75, 100].filter((m) => prevPct < m && newPct >= m);

/** ✨ NEW: contribution history (localStorage-backed). */
const getHistoryKey = (userId, goalId) =>
  `${HISTORY_KEY_PREFIX}${userId || 'guest'}_${goalId}`;

const readHistory = (userId, goalId) => {
  try {
    const raw = localStorage.getItem(getHistoryKey(userId, goalId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeHistory = (userId, goalId, entries) => {
  try {
    const trimmed = Array.isArray(entries) ? entries.slice(-50) : [];
    localStorage.setItem(getHistoryKey(userId, goalId), JSON.stringify(trimmed));
  } catch { /* quota / private */ }
};

const appendHistory = (userId, goalId, entry) => {
  const current = readHistory(userId, goalId);
  const next = [...current, entry];
  writeHistory(userId, goalId, next);
  return next;
};

const formatTimestamp = (ts, locale) => {
  try {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(locale || 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
};

/* ============================================================
 * Confetti — cancelable, DPR-aware
 * ============================================================ */
function fireConfetti(canvas) {
  if (!canvas || typeof window === 'undefined') return () => {};

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.offsetWidth;
  const cssHeight = canvas.offsetHeight;
  const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const particles = Array.from({ length: 60 }).map(() => ({
    x: cssWidth / 2,
    y: cssHeight / 2,
    vx: (Math.random() - 0.5) * 8,
    vy: (Math.random() - 0.7) * 9,
    size: Math.random() * 6 + 3,
    color: ['#10B981', '#059669', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6'][
      Math.floor(Math.random() * 6)
    ],
    alpha: 1,
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 10,
  }));

  let frameId = null;
  let cancelled = false;

  const render = () => {
    if (cancelled) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    let alive = false;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.alpha -= 0.015;
      p.rotation += p.rotSpeed;

      if (p.alpha > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    }

    if (alive) {
      frameId = requestAnimationFrame(render);
    } else {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
    }
  };

  frameId = requestAnimationFrame(render);

  return () => {
    cancelled = true;
    if (frameId != null) cancelAnimationFrame(frameId);
    try { ctx.clearRect(0, 0, cssWidth, cssHeight); } catch { /* ignore */ }
  };
}

/* ============================================================
 * ✨ NEW: Undo toast
 * ============================================================ */
function UndoToast({ state, onUndo, onDismiss, tr }) {
  if (!state) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      className="undo-toast glass"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        borderRadius: 999,
        boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
      }}
    >
      <Undo2 size={16} aria-hidden="true" />
      <span style={{ fontSize: '0.88rem' }}>{state.message}</span>
      <button
        type="button"
        className="btn-secondary"
        onClick={onUndo}
        style={{ padding: '4px 12px', fontSize: '0.8rem' }}
      >
        {tr('undo', 'Undo')}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={tr('dismiss', 'Dismiss')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

/* ============================================================
 * Goals Skeleton Loader (Zero Layout Shift)
 * ============================================================ */
const GoalsSkeleton = ({ tr }) => (
  <div className="masonry-layout-page goals-page-wrap" aria-label={tr?.('loading_goals', 'Loading savings goals') || 'Loading savings goals'} role="status">
    <div className="masonry-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div className="skeleton" style={{ height: 38, width: 220, borderRadius: 12 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="skeleton" style={{ height: 38, width: 84, borderRadius: 10 }} />
        <div className="skeleton" style={{ height: 38, width: 114, borderRadius: 10 }} />
      </div>
    </div>
    {/* Summary banner skeleton */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 96, borderRadius: 16 }} />
      ))}
    </div>
    {/* Toolbar skeleton */}
    <div className="glass" style={{ height: 56, borderRadius: 14, marginBottom: 16, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
      <div className="skeleton" style={{ height: 32, width: 160, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 34, width: 240, borderRadius: 9999, marginLeft: 'auto' }} />
    </div>
    {/* Category strip skeleton */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflow: 'hidden' }}>
      {[70, 130, 90, 80, 100, 85].map((w, idx) => (
        <div key={idx} className="skeleton" style={{ height: 36, width: w, borderRadius: 9999, flexShrink: 0 }} />
      ))}
    </div>
    {/* Masonry cards skeleton */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 20 }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="glass skeleton" style={{ height: 280, borderRadius: 18 }} />
      ))}
    </div>
  </div>
);

/* ============================================================
 * Main Component
 * ============================================================ */
export default function Goals() {
  /* Original context destructuring without loading:
  const {
    transactions = [],
    goals = [],
    fmt,
    refetch,
    USER_ID,
    t,
    lang = 'en',
  } = useContext(AppContext);
  // Issue: loading was not destructured, preventing Goals from showing a loading skeleton while fetching.
  */
  const {
    transactions = [],
    goals = [],
    fmt,
    refetch,
    USER_ID,
    t,
    lang = 'en',
    loading,
  } = useContext(AppContext);
  const { showToast } = useToast();

  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  const locale = useMemo(() => {
    const map = { en: 'en-US', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN' };
    return map[lang] || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  }, [lang]);

  /* ---------------- UI state ---------------- */
  const [showAdd, setShowAdd] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalToDelete, setGoalToDelete] = useState(null);
  const [contributeGoal, setContributeGoal] = useState(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('all');

  /* ✨ NEW: view / sort / filter / search state */
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [historyGoal, setHistoryGoal] = useState(null);
  const [undoState, setUndoState] = useState(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  /* ---------------- Form state ---------------- */
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('emergency_fund');
  const [notes, setNotes] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🎯');

  /* ---------------- Independent submitting flags ---------------- */
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isContributing, setIsContributing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const confettiCanvasRef = useRef(null);
  const cancelConfettiRef = useRef(null);

  /* ---------------- Cleanup ---------------- */
  useEffect(() => () => {
    cancelConfettiRef.current?.();
    if (undoState?.timeoutId) clearTimeout(undoState.timeoutId);
  }, [undoState]);

  /* ============================================================
   * Derived data
   * ============================================================ */

  const netCashflow = useMemo(() => {
    if (!Array.isArray(transactions)) return 0;
    let total = 0;
    for (const tx of transactions) {
      if (!tx || tx.is_deleted === true) continue;
      const amt = safeNumber(tx.amount, 0);
      if (tx.type === 'income') total += amt;
      else if (tx.type === 'expense') total -= amt;
    }
    return total;
  }, [transactions]);

  const predictions = useMemo(() => {
    const map = new Map();
    const txs = Array.isArray(transactions) ? transactions : [];
    for (const g of goals) {
      const id = g?.id || g?._id;
      if (!id) continue;
      try {
        map.set(id, predictTimeToGoal(g, txs));
      } catch (err) {
        console.warn('Prediction failed for goal', id, err);
        map.set(id, null);
      }
    }
    return map;
  }, [goals, transactions]);

  /** ✨ NEW: progress percentage helper. */
  const getPct = useCallback((g) => {
    const tgt = safeNumber(g.target, 0);
    const svd = safeNumber(g.saved, 0);
    return tgt > 0 ? Math.max(0, Math.min(100, (svd / tgt) * 100)) : 0;
  }, []);

  /** ✨ NEW: is goal overdue. */
  const isOverdue = useCallback((g) => {
    if (!g.deadline) return false;
    if (getPct(g) >= 100) return false;
    const dl = parseLocalDate(g.deadline);
    if (!dl) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dl.setHours(0, 0, 0, 0);
    return dl < today;
  }, [getPct]);

  /** ✨ NEW: sort + filter + completion view + live search. */
  /* Original filteredGoals without search query filtering:
  const filteredGoals = useMemo(() => {
    let list = goals;

    // Category filter
    if (activeCategoryFilter !== 'all') {
      list = list.filter((g) => getCategoryKey(g.category) === activeCategoryFilter);
    }

    // Overdue filter
    if (showOverdueOnly) {
      list = list.filter((g) => isOverdue(g));
    }

    // Completion filter
    if (!showCompleted) {
      list = list.filter((g) => getPct(g) < 100);
    } else {
      // When showing completed, still show everything unless category restricts
    }

    // Sort
    const sorted = [...list];
    switch (sortBy) {
      case 'progress_asc':
        sorted.sort((a, b) => getPct(a) - getPct(b));
        break;
      case 'progress_desc':
        sorted.sort((a, b) => getPct(b) - getPct(a));
        break;
      case 'deadline_asc': {
        const farFuture = Number.MAX_SAFE_INTEGER;
        sorted.sort((a, b) => {
          const da = a.deadline ? (parseLocalDate(a.deadline)?.getTime() ?? farFuture) : farFuture;
          const db = b.deadline ? (parseLocalDate(b.deadline)?.getTime() ?? farFuture) : farFuture;
          return da - db;
        });
        break;
      }
      case 'target_desc':
        sorted.sort((a, b) => safeNumber(b.target, 0) - safeNumber(a.target, 0));
        break;
      case 'name_asc':
        sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        break;
      case 'created_desc':
      default: {
        const zero = 0;
        sorted.sort((a, b) => {
          const da = new Date(a.created_at || a.createdAt || zero).getTime() || 0;
          const db = new Date(b.created_at || b.createdAt || zero).getTime() || 0;
          return db - da;
        });
      }
    }
    return sorted;
  }, [goals, activeCategoryFilter, showOverdueOnly, showCompleted, sortBy, getPct, isOverdue]);
  */

  const filteredGoals = useMemo(() => {
    let list = goals;

    // Search query filter (matches goal name, notes, or localized category)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) => {
        const nameMatch = String(g.name || '').toLowerCase().includes(q);
        const notesMatch = String(g.notes || '').toLowerCase().includes(q);
        const catLabel = getCategoryLabel(g.category, t).toLowerCase();
        const catMatch = catLabel.includes(q);
        return nameMatch || notesMatch || catMatch;
      });
    }

    // Category filter
    if (activeCategoryFilter !== 'all') {
      list = list.filter((g) => getCategoryKey(g.category) === activeCategoryFilter);
    }

    // Overdue filter
    if (showOverdueOnly) {
      list = list.filter((g) => isOverdue(g));
    }

    // Completion filter
    if (!showCompleted) {
      list = list.filter((g) => getPct(g) < 100);
    }

    // Sort
    const sorted = [...list];
    switch (sortBy) {
      case 'progress_asc':
        sorted.sort((a, b) => getPct(a) - getPct(b));
        break;
      case 'progress_desc':
        sorted.sort((a, b) => getPct(b) - getPct(a));
        break;
      case 'deadline_asc': {
        const farFuture = Number.MAX_SAFE_INTEGER;
        sorted.sort((a, b) => {
          const da = a.deadline ? (parseLocalDate(a.deadline)?.getTime() ?? farFuture) : farFuture;
          const db = b.deadline ? (parseLocalDate(b.deadline)?.getTime() ?? farFuture) : farFuture;
          return da - db;
        });
        break;
      }
      case 'target_desc':
        sorted.sort((a, b) => safeNumber(b.target, 0) - safeNumber(a.target, 0));
        break;
      case 'name_asc':
        sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        break;
      case 'created_desc':
      default: {
        const zero = 0;
        sorted.sort((a, b) => {
          const da = new Date(a.created_at || a.createdAt || zero).getTime() || 0;
          const db = new Date(b.created_at || b.createdAt || zero).getTime() || 0;
          return db - da;
        });
      }
    }
    return sorted;
  }, [goals, searchQuery, activeCategoryFilter, showOverdueOnly, showCompleted, sortBy, getPct, isOverdue, t]);

  /** Auto-reset category if empty. */
  useEffect(() => {
    if (activeCategoryFilter === 'all' || goals.length === 0) return;
    const stillHas = goals.some((g) => getCategoryKey(g.category) === activeCategoryFilter);
    if (!stillHas) setActiveCategoryFilter('all');
  }, [goals, activeCategoryFilter]);

  /** Summary totals — reflect the current filter. */
  const summaryTotals = useMemo(() => {
    let targetSum = 0;
    let savedSum = 0;
    for (const g of filteredGoals) {
      targetSum += safeNumber(g.target, 0);
      savedSum += safeNumber(g.saved, 0);
    }
    return { targetSum, savedSum };
  }, [filteredGoals]);

  /** ✨ NEW: overdue count for the filter chip badge. */
  const overdueCount = useMemo(
    () => goals.filter((g) => isOverdue(g)).length,
    [goals, isOverdue]
  );

  /** ✨ NEW: completed count. */
  const completedCount = useMemo(
    () => goals.filter((g) => getPct(g) >= 100).length,
    [goals, getPct]
  );

  /* ============================================================
   * Form helpers
   * ============================================================ */

  const resetForm = useCallback(() => {
    setName('');
    setTarget('');
    setSaved('');
    setDeadline('');
    setCategory('emergency_fund');
    setNotes('');
    setSelectedIcon('🎯');
    setEditingGoal(null);
    setShowTemplatePicker(false);
  }, []);

  const openAdd = useCallback(() => {
    resetForm();
    setShowAdd(true);
    setShowTemplatePicker(true);
  }, [resetForm]);

  const openEdit = useCallback((g) => {
    if (!g) return;
    setEditingGoal(g);
    setName(g.name || '');
    setTarget(g.target != null ? String(g.target) : '');
    setSaved(g.saved != null ? String(g.saved) : '');
    setDeadline(toLocalDateInput(g.deadline));
    setCategory(getCategoryKey(g.category));
    setNotes(g.notes || '');
    setSelectedIcon(g.icon || '🎯');
    setShowTemplatePicker(false);
  }, []);

  const closeGoalModal = useCallback(() => {
    setShowAdd(false);
    resetForm();
  }, [resetForm]);

  /* ============================================================
   * ✨ NEW: Apply template
   * ============================================================ */

  const applyTemplate = useCallback((template) => {
    if (!template) return;

    // Estimate monthly expense from last 3 months of transactions
    let avgMonthlyExpense = 0;
    if (Array.isArray(transactions) && transactions.length > 0) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 3);
      let recentTotal = 0;
      let hasRecent = false;
      for (const tx of transactions) {
        if (!tx || tx.is_deleted === true || tx.type !== 'expense') continue;
        const d = new Date(tx.date);
        if (Number.isNaN(d.getTime()) || d < cutoff) continue;
        recentTotal += safeNumber(tx.amount, 0);
        hasRecent = true;
      }
      if (hasRecent) avgMonthlyExpense = recentTotal / 3;
    }

    let targetNum = template.target;
    if (template.targetMultiplier && avgMonthlyExpense > 0) {
      targetNum = Math.round(avgMonthlyExpense * template.targetMultiplier);
    }

    setName(tr(template.nameKey, template.nameFallback));
    setCategory(template.category);
    setSelectedIcon(template.icon);
    if (targetNum) setTarget(String(targetNum));
    setSaved('0');
    const d = new Date();
    d.setMonth(d.getMonth() + (template.monthsDeadline || 12));
    setDeadline(toLocalDateInput(d));
    setNotes(tr(template.descKey, template.descFallback));
    setShowTemplatePicker(false);
  }, [transactions, tr]);

  /* ============================================================
   * ✨ NEW: Suggested deadline
   * ============================================================ */

  const suggestedDeadline = useMemo(() => {
    const targetNum = parseFloat(target);
    const savedNum = parseFloat(saved) || 0;
    if (!Number.isFinite(targetNum) || targetNum <= 0) return null;
    const remaining = Math.max(0, targetNum - savedNum);
    if (remaining === 0) return null;

    // Estimate monthly contribution capacity from net cashflow
    const monthlyCapacity = Math.max(100, netCashflow > 0 ? netCashflow / 12 : 300);
    const months = Math.max(3, Math.ceil(remaining / monthlyCapacity));
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return { months, date: toLocalDateInput(d) };
  }, [target, saved, netCashflow]);

  /* ============================================================
   * Save (create / update)
   * ============================================================ */

  const handleSaveGoal = useCallback(async () => {
    if (isSavingGoal) return;

    const trimmedName = name.trim();
    const targetNum = parseFloat(target);
    const savedNum = parseFloat(saved) || 0;

    if (!trimmedName) {
      showToast('error', tr('enter_goal_name', 'Please enter a goal name.'));
      return;
    }
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      showToast('error', tr('target_positive_error', 'Target amount must be a positive number.'));
      return;
    }
    if (savedNum < 0) {
      showToast('error', tr('saved_negative_error', 'Saved amount cannot be negative.'));
      return;
    }
    if (savedNum > targetNum) {
      showToast('error', tr('saved_exceed_error', 'Saved amount cannot exceed the target.'));
      return;
    }

    setIsSavingGoal(true);
    try {
      const payload = {
        user_id: USER_ID,
        name: trimmedName,
        target: toFixed2(targetNum),
        saved: toFixed2(savedNum),
        color: editingGoal?.color || pickColor(goals),
        icon: selectedIcon,
        category: getCategoryKey(category),
        deadline: deadline || null,
        notes: notes.trim() || undefined,
      };

      if (editingGoal) {
        const goalId = editingGoal.id || editingGoal._id;
        if (!goalId) {
          showToast('error', tr('invalid_goal', 'Invalid goal reference.'));
          return;
        }
        await api.updateGoal(goalId, payload);
        showToast('success', tr('goal_updated', 'Goal updated successfully!'));
      } else {
        await api.createGoal(payload);
        showToast('success', tr('goal_created', 'Goal created successfully!'));
      }

      await refetch();
      closeGoalModal();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to save goal';
      showToast('error', msg);
    } finally {
      setIsSavingGoal(false);
    }
  }, [
    isSavingGoal, name, target, saved, editingGoal, goals, selectedIcon,
    category, deadline, notes, USER_ID, refetch, closeGoalModal, showToast, tr,
  ]);

  /* ============================================================
   * Delete
   * ============================================================ */

  const handleConfirmDelete = useCallback(async () => {
    if (isDeleting) return;
    const id = goalToDelete;
    if (!id) {
      setGoalToDelete(null);
      return;
    }
    setIsDeleting(true);
    try {
      await api.deleteGoal(id);
      await refetch();
      setGoalToDelete(null);
      // Cleanup history
      try { localStorage.removeItem(getHistoryKey(USER_ID, id)); } catch { /* ignore */ }
      showToast('success', tr('goal_deleted', 'Goal deleted'));
    } catch (err) {
      const msg = err?.response?.data?.error || tr('goal_delete_failed', 'Failed to delete goal');
      showToast('error', msg);
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, goalToDelete, refetch, showToast, tr, USER_ID]);

  /* ============================================================
   * ✨ NEW: Undo handler
   * ============================================================ */

  const performUndo = useCallback(async () => {
    if (!undoState) return;
    const { goalId, previousSaved, timeoutId } = undoState;
    if (timeoutId) clearTimeout(timeoutId);
    setUndoState(null);
    try {
      await api.updateGoal(goalId, { saved: previousSaved });
      await refetch();
      showToast('success', tr('contribution_undone', 'Contribution undone'));
    } catch {
      showToast('error', tr('undo_failed', 'Could not undo the change'));
    }
  }, [undoState, refetch, showToast, tr]);

  const dismissUndo = useCallback(() => {
    if (undoState?.timeoutId) clearTimeout(undoState.timeoutId);
    setUndoState(null);
  }, [undoState]);

  const triggerUndo = useCallback((goalId, previousSaved, message) => {
    if (undoState?.timeoutId) clearTimeout(undoState.timeoutId);
    const timeoutId = setTimeout(() => setUndoState(null), UNDO_TIMEOUT_MS);
    setUndoState({ goalId, previousSaved, message, timeoutId });
  }, [undoState]);

  /* ============================================================
   * Contribute (with history + milestones + undo)
   * ============================================================ */

  const handleContribute = useCallback(async () => {
    if (isContributing) return;

    const amt = parseFloat(contributeAmount);
    if (!Number.isFinite(amt) || amt === 0) {
      showToast('error', tr('enter_nonzero_amount', 'Please enter a non-zero amount.'));
      return;
    }

    const id = contributeGoal;
    const goal = goals.find((g) => g.id === id || g._id === id);
    if (!goal) {
      showToast('error', tr('goal_not_found', 'Goal not found. It may have been deleted.'));
      setContributeGoal(null);
      setContributeAmount('');
      return;
    }

    const currentSaved = safeNumber(goal.saved, 0);
    const targetNum = safeNumber(goal.target, 0);
    const desiredSaved = currentSaved + amt;
    const clampedSaved = Math.min(targetNum, Math.max(0, toFixed2(desiredSaved)));
    const wasClamped = toFixed2(desiredSaved) !== clampedSaved;
    const actualDelta = toFixed2(clampedSaved - currentSaved);

    const prevPct = targetNum > 0 ? (currentSaved / targetNum) * 100 : 0;
    const newPct = targetNum > 0 ? (clampedSaved / targetNum) * 100 : 0;
    const crossed = getCrossedMilestones(prevPct, newPct);
    const willHit100 = clampedSaved >= targetNum && currentSaved < targetNum;

    setIsContributing(true);
    try {
      await api.updateGoal(id, { saved: clampedSaved });

      // ✨ NEW: log to local history
      if (actualDelta !== 0) {
        appendHistory(USER_ID, id, {
          amount: actualDelta,
          previousSaved: currentSaved,
          newSaved: clampedSaved,
          timestamp: new Date().toISOString(),
        });
      }

      await refetch();
      setContributeGoal(null);
      setContributeAmount('');

      if (willHit100 && confettiCanvasRef.current) {
        cancelConfettiRef.current?.();
        cancelConfettiRef.current = fireConfetti(confettiCanvasRef.current);
        showToast('success', tr('goal_achieved', '🎉 Congratulations! You reached your goal target!'));
      } else if (crossed.length > 0) {
        // ✨ NEW: milestone celebration
        const milestone = crossed[crossed.length - 1];
        showToast('success', tr('milestone_reached', `🎉 ${milestone}% milestone reached!`));
      } else if (wasClamped) {
        const notApplied = Math.abs(toFixed2(desiredSaved) - clampedSaved);
        showToast(
          'info',
          tr('contribution_capped', `Capped at target. ${notApplied.toFixed(2)} was not applied.`)
        );
      } else {
        showToast(
          'success',
          amt > 0
            ? tr('funds_added', 'Funds added to goal!')
            : tr('funds_removed', 'Funds removed from goal!')
        );
      }

      // ✨ NEW: offer undo for non-final changes
      if (!willHit100 && actualDelta !== 0) {
        triggerUndo(
          id,
          currentSaved,
          `${actualDelta > 0 ? '+' : ''}${fmt(actualDelta)}`
        );
      }
    } catch (err) {
      const msg = err?.response?.data?.error || tr('goal_update_failed', 'Failed to update goal');
      showToast('error', msg);
    } finally {
      setIsContributing(false);
    }
  }, [
    isContributing, contributeAmount, contributeGoal, goals,
    refetch, showToast, tr, USER_ID, fmt, triggerUndo,
  ]);

  /* ============================================================
   * ✨ NEW: Export CSV
   * ============================================================ */

  const handleExportCSV = useCallback(() => {
    if (isExporting) return;
    if (!Array.isArray(goals) || goals.length === 0) {
      showToast('info', tr('nothing_to_export', 'Nothing to export.'));
      return;
    }
    setIsExporting(true);
    try {
      const headers = [
        'Name', 'Category', 'Icon', 'Target', 'Saved', 'Progress %',
        'Deadline', 'Overdue', 'Notes', 'Created',
      ];
      const rows = goals.map((g) => {
        const tgt = safeNumber(g.target, 0);
        const svd = safeNumber(g.saved, 0);
        const pct = tgt > 0 ? ((svd / tgt) * 100).toFixed(1) : '0.0';
        return [
          g.name || '',
          getCategoryLabel(g.category, t),
          g.icon || '',
          tgt.toFixed(2),
          svd.toFixed(2),
          pct,
          toLocalDateInput(g.deadline) || '',
          isOverdue(g) ? 'YES' : 'NO',
          g.notes || '',
          g.created_at || g.createdAt || '',
        ];
      });
      const csvContent = [
        headers.map(escapeCsvField).join(','),
        ...rows.map((r) => r.map(escapeCsvField).join(',')),
      ].join('\n');

      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `goals_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', tr('goals_exported', 'Goals exported'));
    } catch (err) {
      console.error(err);
      showToast('error', tr('export_failed', 'Failed to export'));
    } finally {
      setIsExporting(false);
    }
  }, [goals, isExporting, showToast, tr, t, isOverdue]);

  /* ============================================================
   * Modal open/close helpers
   * ============================================================ */

  const openContribute = useCallback((id) => {
    if (!id) return;
    setContributeGoal(id);
    setContributeAmount('');
  }, []);

  const closeContribute = useCallback(() => {
    setContributeGoal(null);
    setContributeAmount('');
  }, []);

  const openDelete = useCallback((id) => {
    if (!id) return;
    setGoalToDelete(id);
  }, []);

  const closeDelete = useCallback(() => setGoalToDelete(null), []);

  const openHistory = useCallback((id) => {
    if (!id) return;
    setHistoryGoal(id);
  }, []);

  const closeHistory = useCallback(() => setHistoryGoal(null), []);

  /* ============================================================
   * Render helpers
   * ============================================================ */

  const contributeAmountNum = parseFloat(contributeAmount);
  const contributeIsRemoval = Number.isFinite(contributeAmountNum) && contributeAmountNum < 0;
  const contributeConfirmText = contributeIsRemoval
    ? tr('remove_funds', 'Remove Funds')
    : tr('add_funds', 'Add Funds');

  const deletingGoal = goals.find((g) => g.id === goalToDelete || g._id === goalToDelete);
  const contributingGoal = goals.find(
    (g) => g.id === contributeGoal || g._id === contributeGoal
  );
  const viewingHistoryGoal = goals.find(
    (g) => g.id === historyGoal || g._id === historyGoal
  );

  /** ✨ NEW: history entries for the current goal. */
  const historyEntries = useMemo(() => {
    if (!historyGoal) return [];
    return readHistory(USER_ID, historyGoal).slice().reverse();
  }, [historyGoal, USER_ID]);

  /* ============================================================
   * Render
   * ============================================================ */
  /* Original render without loading check:
  return (
    <div className="masonry-layout-page goals-page-wrap">
  // Issue: When goals were loading, page immediately flashed 0 goals and empty state.
  */
  /* Original single-box loading state causing jarring layout flash and layout shift:
  if (loading && goals.length === 0) {
    return (
      <div className="masonry-layout-page goals-page-wrap">
        <div className="masonry-header">
          <div className="mh-titles">
            <h2>{tr('goals', 'Savings Goals')}</h2>
          </div>
        </div>
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Clock className="spin" size={36} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
          <p style={{ color: 'var(--text-muted)' }}>{tr('loading', 'Loading goals…')}</p>
        </div>
      </div>
    );
  }
  */
  if (loading && goals.length === 0) {
    return <GoalsSkeleton tr={tr} />;
  }

  return (
    <div className="masonry-layout-page goals-page-wrap">
      <canvas
        ref={confettiCanvasRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          width: '100vw',
          height: '100vh',
        }}
      />

      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{tr('goals', 'Savings Goals')}</h2>
          <span className="mh-badge">
            {goals.length} {tr('active', 'active')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* ✨ NEW: export */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="btn-secondary"
            onClick={handleExportCSV}
            disabled={isExporting}
            aria-label={tr('export_csv', 'Export CSV')}
            title={tr('export_csv', 'Export CSV')}
          >
            <Download size={16} /> CSV
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="btn-primary"
            onClick={openAdd}
            aria-label={tr('new_goal', 'New Goal')}
          >
            <Plus size={16} /> {tr('new_goal', 'New Goal')}
          </motion.button>
        </div>
      </div>

      {/* Summary banner */}
      <div className="carousel-wrapper" style={{ minHeight: 110 }}>
        <div className="carousel-track">
          {[
            {
              label: tr('net_cashflow', 'Net Cashflow'),
              value: fmt(netCashflow),
              color: netCashflow >= 0 ? 'var(--success)' : 'var(--danger)',
              icon: '💰',
              key: 'cashflow',
            },
            {
              label: tr('target_amount', 'Target Amount'),
              value: fmt(summaryTotals.targetSum),
              color: 'var(--brand-primary)',
              icon: '🎯',
              key: 'target',
            },
            {
              label: tr('contributed', 'Contributed'),
              value: fmt(summaryTotals.savedSum),
              color: 'var(--brand-secondary)',
              icon: '✅',
              key: 'saved',
            },
          ].map((s, i) => (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: i * 0.1, type: 'spring' }}
              className="carousel-item glass"
              style={{
                border: `1px solid ${s.color}44`,
                boxShadow: `0 8px 32px ${s.color}15`,
              }}
            >
              <div
                className="ci-icon-box"
                style={{ background: `${s.color}22`, color: s.color }}
                aria-hidden="true"
              >
                {s.icon}
              </div>
              <div className="ci-info">
                <p className="ci-val" style={{ color: s.color }}>{s.value}</p>
                <p className="ci-lbl">{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Toolbar — sort + search + completed/overdue toggles */}
      <div
        className="goals-toolbar glass"
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderRadius: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label
            htmlFor="goals-sort"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}
          >
            <ArrowUpDown size={14} aria-hidden="true" />
            <span>{tr('sort_by', 'Sort by')}</span>
          </label>
          <select
            id="goals-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
            style={{ minWidth: 150, fontSize: '0.82rem' }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {t?.(o.labelKey) || o.fallback}
              </option>
            ))}
          </select>
        </div>

        {/* Search input matching Image 1 */}
        <div style={{ position: 'relative', flex: '0 1 260px', minWidth: 180, maxWidth: 320 }}>
          <Search
            size={14}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr('search_goals', 'Search goals…')}
            aria-label={tr('search_goals', 'Search goals')}
            style={{
              width: '100%',
              paddingLeft: 34,
              paddingRight: searchQuery ? 30 : 12,
              height: 36,
              borderRadius: 9999,
              border: '1px solid var(--glass-border)',
              background: 'var(--glass-card)',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={tr('clear_search', 'Clear search')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 4,
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`gcf-pill ${showCompleted ? 'active' : ''}`}
            onClick={() => setShowCompleted((v) => !v)}
            aria-pressed={showCompleted}
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            {tr('completed', 'Completed')}
            {completedCount > 0 && ` (${completedCount})`}
          </button>

          {overdueCount > 0 && (
            <button
              type="button"
              className={`gcf-pill ${showOverdueOnly ? 'active' : ''}`}
              onClick={() => setShowOverdueOnly((v) => !v)}
              aria-pressed={showOverdueOnly}
              style={{ color: 'var(--danger)' }}
            >
              <AlertTriangle size={14} aria-hidden="true" />
              {tr('overdue', 'Overdue')} ({overdueCount})
            </button>
          )}
        </div>
      </div>

      {/* Category filter strip */}
      <div
        className="goals-category-filter-strip"
        role="group"
        aria-label={tr('filter_by_category', 'Filter by category')}
      >
        {GOAL_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            aria-pressed={activeCategoryFilter === cat.key}
            className={`gcf-pill ${activeCategoryFilter === cat.key ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter(cat.key)}
          >
            {t?.(cat.labelKey) || cat.fallback}
          </button>
        ))}
      </div>

      {/* Goals grid */}
      {filteredGoals.length === 0 ? (
        <motion.div
          className="glass empty-state"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Target size={52} aria-hidden="true" />
          {goals.length === 0 ? (
            <>
              <p className="primary-msg">{tr('no_goals_yet', 'No goals yet.')}</p>
              <p className="secondary-msg">
                {tr(
                  'set_first_savings_target',
                  'Set your first savings target for a trip, a gadget, or an emergency fund.'
                )}
              </p>
              <motion.button
                whileHover={{ scale: 1.04 }}
                className="btn-primary"
                style={{ marginTop: 20 }}
                onClick={openAdd}
              >
                <Plus size={16} /> {tr('create_goal', 'Create Goal')}
              </motion.button>
            </>
          ) : (
            <>
              <p className="primary-msg">
                {searchQuery
                  ? tr('no_matching_goals', 'No goals match your search.')
                  : showOverdueOnly
                    ? tr('no_overdue_goals', 'No overdue goals. Nice!')
                    : showCompleted
                      ? tr('no_completed_goals', 'No completed goals yet.')
                      : tr('no_goals_match_filter', 'No goals match the current filters.')}
              </p>
              <motion.button
                whileHover={{ scale: 1.04 }}
                className="btn-secondary"
                style={{ marginTop: 20 }}
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategoryFilter('all');
                  setShowOverdueOnly(false);
                  setShowCompleted(false);
                }}
              >
                {searchQuery ? tr('clear_search', 'Clear search') : tr('clear_filters', 'Clear filters')}
              </motion.button>
            </>
          )}
        </motion.div>
      ) : (
        <div className="masonry-grid">
          <AnimatePresence>
            {filteredGoals.map((g, i) => {
              const goalId = g.id || g._id;
              const key = goalId || `goal-idx-${i}`;
              const targetNum = safeNumber(g.target, 0);
              const savedNum = safeNumber(g.saved, 0);
              const pct = getPct(g);
              const done = pct >= 100;
              const overdue = isOverdue(g);

              const createdRaw = g.created_at || g.createdAt;
              const createdDate = createdRaw ? new Date(createdRaw) : null;
              const ageInDays =
                createdDate && !Number.isNaN(createdDate.getTime())
                  ? Math.floor((Date.now() - createdDate.getTime()) / 86400000)
                  : null;
              const isStuck = pct < 15 && ageInDays !== null && ageInDays > 14;

              let daysLeft = null;
              let monthlyNeeded = null;
              if (g.deadline && !done && !overdue) {
                const dl = parseLocalDate(g.deadline);
                if (dl) {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const dlLocal = new Date(dl);
                  dlLocal.setHours(0, 0, 0, 0);
                  const diff = Math.ceil((dlLocal - today) / 86400000);
                  daysLeft = Math.max(0, diff);
                  const remaining = Math.max(0, targetNum - savedNum);
                  const months = Math.max(0.5, daysLeft / 30);
                  monthlyNeeded = remaining / months;
                }
              }

              const pred = predictions.get(goalId) || null;
              const predShowsMonths = pred && !pred.achieved && pred.months;
              const predShowsEmpty = pred && !pred.achieved && !pred.months;

              return (
                <motion.div
                  key={key}
                  className={`masonry-card glass ${done ? 'masonry-card-done' : ''}`}
                  initial={{ opacity: 0, scale: 0.93, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.88, y: 10 }}
                  transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
                  style={{ '--mc-color': g.color }}
                >
                  {done && (
                    <motion.div
                      className="mc-badge"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: 0.3 }}
                    >
                      🎉 {tr('achieved', 'Achieved!')}
                    </motion.div>
                  )}

                  {overdue && !done && (
                    <div className="mc-badge mc-badge-danger" role="status">
                      <AlertTriangle size={12} aria-hidden="true" /> {tr('overdue', 'Overdue')}
                    </div>
                  )}

                  <div className="mc-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="mc-icon" aria-hidden="true">{g.icon || '🎯'}</div>
                      <span className="goal-category-tag badge">
                        {getCategoryLabel(g.category, t)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {/* ✨ NEW: history button */}
                      <button
                        type="button"
                        className="del-btn"
                        onClick={() => openHistory(goalId)}
                        title={tr('view_history', 'View contribution history')}
                        aria-label={`${tr('history', 'History')} ${g.name || ''}`.trim()}
                      >
                        <History size={15} />
                      </button>
                      <button
                        type="button"
                        className="del-btn"
                        onClick={() => openEdit(g)}
                        title={tr('edit_goal', 'Edit goal')}
                        aria-label={`${tr('edit', 'Edit')} ${g.name || ''}`.trim()}
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        className="del-btn"
                        onClick={() => openDelete(goalId)}
                        title={tr('delete_goal', 'Delete goal')}
                        aria-label={`${tr('delete', 'Delete')} ${g.name || ''}`.trim()}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <h3 className="mc-title">{g.name}</h3>

                  {g.notes && (
                    <p className="mc-notes">
                      <FileText
                        size={12}
                        style={{
                          marginRight: 5,
                          opacity: 0.55,
                          flexShrink: 0,
                          verticalAlign: 'middle',
                        }}
                        aria-hidden="true"
                      />
                      {g.notes}
                    </p>
                  )}

                  {g.deadline && !done && (
                    <div className="goal-deadline-strip">
                      {overdue ? (
                        <span className="gds-item gds-overdue">
                          <AlertTriangle size={13} aria-hidden="true" />{' '}
                          {tr('overdue', 'Overdue')}
                        </span>
                      ) : (
                        <span className="gds-item">
                          <Calendar size={13} aria-hidden="true" />{' '}
                          {daysLeft} {tr('days_left', 'days left')}
                        </span>
                      )}
                      {monthlyNeeded != null && monthlyNeeded > 0 && (
                        <span className="gds-item text-brand">
                          {tr('target', 'Target')}: {fmt(monthlyNeeded)}/
                          {tr('monthly_short', 'mo')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mc-amounts">
                    <span className="mc-saved">{fmt(savedNum)}</span>
                    <span className="mc-target">
                      {tr('of', 'of')} {fmt(targetNum)}
                    </span>
                  </div>

                  <div className="mc-progress-box">
                    <div className="mc-progress-track">
                      <motion.div
                        className={`mc-progress-fill ${isStuck ? 'pulse-encouragement' : ''}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                      />
                    </div>

                    <div
                      className="goal-milestones-row"
                      role="list"
                      aria-label={tr('progress_milestones', 'Progress milestones')}
                    >
                      {[25, 50, 75, 100].map((m) => {
                        const reached = pct >= m;
                        return (
                          <span
                            key={m}
                            role="listitem"
                            className={`g-milestone ${reached ? 'reached' : ''}`}
                            aria-label={`${m}% ${reached ? tr('reached', 'reached') : tr('not_reached', 'not reached')}`}
                          >
                            {m}%
                          </span>
                        );
                      })}
                    </div>

                    <div className="mc-progress-stats">
                      <span>{pct.toFixed(0)}% {tr('completed', 'completed')}</span>
                      <span>
                        {fmt(Math.max(0, targetNum - savedNum))} {tr('left', 'left')}
                      </span>
                    </div>
                  </div>

                  <div className="mc-footer">
                    {!done && (
                      <motion.button
                        type="button"
                        className="mc-contribute-btn"
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => openContribute(goalId)}
                      >
                        <PlusCircle size={14} />{' '}
                        {tr('contribute', 'Add / Remove Funds')}
                      </motion.button>
                    )}

                    {!done && predShowsMonths && (
                      <motion.div
                        className="mc-ai-pred"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <Clock size={12} aria-hidden="true" />{' '}
                        <span>
                          ~{pred.months} {tr('months', 'mo')}
                        </span>{' '}
                        @ {fmt(pred.savingsPerMonth)}/{tr('monthly_short', 'mo')}
                      </motion.div>
                    )}

                    {!done && predShowsEmpty && (
                      <div className="mc-ai-pred mc-ai-empty">
                        <Zap size={12} aria-hidden="true" />{' '}
                        {tr('save_regularly_ai', 'Save regularly for AI predictions')}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit goal modal */}
      <Modal
        isOpen={showAdd || editingGoal !== null}
        onClose={closeGoalModal}
        title={
          editingGoal
            ? `✏️ ${tr('edit', 'Edit')} ${tr('goals', 'Goal')}`
            : `🎯 ${tr('new_goal', 'New Savings Goal')}`
        }
        confirmText={
          editingGoal ? tr('save', 'Update Goal') : tr('save_goal', 'Save Goal')
        }
        onConfirm={handleSaveGoal}
        isLoading={isSavingGoal}
      >
        {/* ✨ NEW: Template picker (only in create mode) */}
        {!editingGoal && (
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <LayoutTemplate size={14} aria-hidden="true" />
              {tr('start_from_template', 'Start from a template')}
              <button
                type="button"
                onClick={() => setShowTemplatePicker((v) => !v)}
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--brand-primary)',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                }}
              >
                {showTemplatePicker ? tr('hide', 'Hide') : tr('show', 'Show')}
              </button>
            </label>
            <AnimatePresence>
              {showTemplatePicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden', marginTop: 8 }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {GOAL_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => applyTemplate(tpl)}
                        className="goal-template-btn glass"
                        style={{
                          padding: '10px 8px',
                          borderRadius: 10,
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          textAlign: 'center',
                          background: 'var(--bg-color)',
                        }}
                      >
                        <div style={{ fontSize: '1.4rem', marginBottom: 4 }} aria-hidden="true">
                          {tpl.icon}
                        </div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                          {tr(tpl.nameKey, tpl.nameFallback)}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {tr(tpl.descKey, tpl.descFallback)}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="goal-name">{tr('goal_name', 'Goal Name')}</label>
          <input
            id="goal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr('goal_name_placeholder', 'e.g. Dream Vacation')}
            autoFocus
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label htmlFor="goal-category">{tr('category', 'Category')}</label>
          <select
            id="goal-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="filter-select"
            style={{ width: '100%' }}
          >
            {GOAL_CATEGORIES.filter((c) => c.key !== 'all').map((c) => (
              <option key={c.key} value={c.key}>
                {t?.(c.labelKey) || c.fallback}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>{tr('choose_icon', 'Choose Icon')}</label>
          <div
            className="goal-icon-picker"
            role="group"
            aria-label={tr('choose_icon', 'Choose Icon')}
          >
            {GOAL_ICONS.map((ic, idx) => {
              const isSelected = selectedIcon === ic;
              return (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setSelectedIcon(ic)}
                  className={`goal-icon-btn${isSelected ? ' selected' : ''}`}
                  aria-label={`${tr('choose_icon', 'Choose icon')} ${idx + 1}`}
                  aria-pressed={isSelected}
                >
                  <span aria-hidden="true">{ic}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="goal-target">{tr('target_amount', 'Target Amount')}</label>
          <input
            id="goal-target"
            type="number"
            min="0.01"
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
        </div>

        <div className="form-group">
          <label htmlFor="goal-saved">{tr('already_saved', 'Already Saved')}</label>
          <input
            id="goal-saved"
            type="number"
            min="0"
            step="0.01"
            value={saved}
            onChange={(e) => setSaved(e.target.value)}
            placeholder="0"
            inputMode="decimal"
          />
        </div>

        <div className="form-group">
          <label htmlFor="goal-deadline">
            {tr('target_deadline', 'Target Deadline')}{' '}
            <span className="form-label-hint">({tr('optional', 'optional')})</span>
          </label>
          <input
            id="goal-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          {/* ✨ NEW: suggested deadline hint */}
          {suggestedDeadline && !deadline && (
            <button
              type="button"
              onClick={() => setDeadline(suggestedDeadline.date)}
              style={{
                marginTop: 6,
                background: 'transparent',
                border: 'none',
                color: 'var(--brand-primary)',
                cursor: 'pointer',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Sparkles size={12} aria-hidden="true" />
              {tr('suggest_deadline', 'Suggest')} ~{suggestedDeadline.months}{' '}
              {tr('months', 'months')} ({suggestedDeadline.date})
            </button>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="goal-notes">
            {tr('description', 'Description')}{' '}
            <span className="form-label-hint">({tr('optional', 'optional')})</span>
          </label>
          <textarea
            id="goal-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr('notes_placeholder', 'e.g. Saving for a trip to Japan in 2026…')}
            maxLength={1000}
            rows={3}
          />
        </div>
      </Modal>

      {/* Contribute modal */}
      <Modal
        isOpen={contributeGoal !== null}
        onClose={closeContribute}
        title={tr('contribute', 'Add / Remove Funds')}
        confirmText={contributeConfirmText}
        onConfirm={handleContribute}
        isLoading={isContributing}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          {tr('updating', 'Updating')}:{' '}
          <strong>{contributingGoal?.name || '—'}</strong>
        </p>
        <div className="form-group">
          <label htmlFor="contribute-amount">
            {tr('amount', 'Amount')}{' '}
            <span className="form-label-hint">
              ({tr('negative_to_remove', 'Use negative to remove')})
            </span>
          </label>
          <input
            id="contribute-amount"
            type="number"
            step="0.01"
            value={contributeAmount}
            onChange={(e) => setContributeAmount(e.target.value)}
            placeholder="e.g. 25.00 or -10.00"
            autoFocus
            inputMode="decimal"
          />
        </div>
      </Modal>

      {/* Confirm delete modal */}
      <Modal
        isOpen={goalToDelete !== null}
        onClose={closeDelete}
        title={tr('delete_goal', 'Delete Goal?')}
        confirmText={tr('delete', 'Delete')}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
          {tr('are_you_sure_delete_goal', 'Are you sure you want to delete')}{' '}
          <strong>{deletingGoal?.name || tr('this_goal', 'this goal')}</strong>?
        </p>
      </Modal>

      {/* ✨ NEW: Contribution history modal */}
      <Modal
        isOpen={historyGoal !== null}
        onClose={closeHistory}
        title={tr('contribution_history', 'Contribution History')}
        confirmText={tr('close', 'Close')}
        onConfirm={closeHistory}
        hideCancel
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          <strong>{viewingHistoryGoal?.name || '—'}</strong>
        </p>
        {historyEntries.length === 0 ? (
          <div className="glass" style={{ padding: 24, textAlign: 'center', borderRadius: 10 }}>
            <History size={32} style={{ opacity: 0.4, marginBottom: 8 }} aria-hidden="true" />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              {tr('no_history_yet', 'No contributions logged yet.')}
            </p>
          </div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {historyEntries.map((entry, idx) => {
              const amt = safeNumber(entry.amount, 0);
              return (
                <div
                  key={`${entry.timestamp}-${idx}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border-color)',
                    fontSize: '0.86rem',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: amt > 0 ? 'var(--success)' : 'var(--danger)',
                      }}
                    >
                      {amt > 0 ? '+' : ''}{fmt(amt)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {formatTimestamp(entry.timestamp, locale)}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    {fmt(entry.previousSaved)} → {fmt(entry.newSaved)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ✨ NEW: Undo bar */}
      <AnimatePresence>
        {undoState && (
          <UndoToast
            state={undoState}
            onUndo={performUndo}
            onDismiss={dismissUndo}
            tr={tr}
          />
        )}
      </AnimatePresence>
    </div>
  );
}