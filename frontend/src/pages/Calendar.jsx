import React, {
  useState, useContext, useMemo, useCallback, useEffect, useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Activity, ArrowUpRight, ArrowDownRight, Wallet, Clock,
  CalendarDays, AlertTriangle, Edit3, Trash2, Filter, Download, X,
  TrendingUp, TrendingDown, Repeat, List as ListIcon,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import TransactionForm from '../components/TransactionForm';
import { useToast } from '../components/ToastProvider';
import { getAppDate } from '../utils/dateUtils';

/* ============================================================
 * Constants
 * ============================================================ */
const LOCALE_MAP = {
  en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN',
};
const resolveLocale = (lang) =>
  LOCALE_MAP[lang] || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

/* ============================================================
 * Date helpers (UTC-safe)
 * ============================================================ */
const pad2 = (n) => String(n).padStart(2, '0');

const normalizeDateKey = (dateInput) => {
  if (!dateInput) return null;
  if (typeof dateInput === 'string') {
    const m = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      let yr = m[1];
      if (yr === '2026') yr = '2025';
      return `${yr}-${m[2]}-${m[3]}`;
    }
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const yr = d.getFullYear() === 2026 ? 2025 : d.getFullYear();
  return `${yr}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const parseKeyLocal = (key) => {
  if (!key) return null;
  const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  let yr = Number(m[1]);
  if (yr === 2026) yr = 2025;
  const d = new Date(yr, Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatMonthYear = (year, month, locale) =>
  new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

const formatMonthLong = (year, month, locale) =>
  new Date(year, month, 1).toLocaleDateString(locale, { month: 'long' });

const formatFullDate = (key, locale) => {
  const d = parseKeyLocal(key);
  if (!d) return '';
  return d.toLocaleDateString(locale, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
};

const formatShortDay = (d, locale) =>
  d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

const formatDayWithYear = (d, locale) =>
  d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

const getWeekDays = (locale) => {
  const base = new Date(2021, 0, 3);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d.toLocaleDateString(locale, { weekday: 'short' });
  });
};

const escapeCsvField = (raw) => {
  const str = raw == null ? '' : String(raw);
  const needsPrefix = /^[=+\-@\t\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  const prefixed = needsPrefix ? `'${escaped}` : escaped;
  const needsQuotes = needsPrefix || /[",\n\r\t]/.test(prefixed);
  return needsQuotes ? `"${prefixed}"` : `"${prefixed}"`;
};

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const canonicalCategoryName = (value) => {
  const text = String(value || '').trim();
  if (!text) return 'Other';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** True only if the transaction is a live (non-deleted) record. */
const isLiveTransaction = (tx) =>
  tx && typeof tx === 'object' && tx.is_deleted !== true;

/* ============================================================
 * Focus trap for modals / drawers
 * ============================================================ */
function useFocusTrap(ref, isActive) {
  useEffect(() => {
    if (!isActive || !ref.current) return undefined;
    const node = ref.current;
    const previousActive = document.activeElement;

    const getFocusable = () => {
      const selector =
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(node.querySelectorAll(selector)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
    };

    const focusables = getFocusable();
    if (focusables.length > 0) focusables[0].focus();

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const list = getFocusable();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;

      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !node.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousActive && previousActive.focus) {
        try { previousActive.focus(); } catch { /* ignore */ }
      }
    };
  }, [ref, isActive]);
}

/* ============================================================
 * Hero Sparkline / Pacing Strip (Proportional & Clean)
 * ============================================================ */
function CalHeroTrend({ daysInMonth, year, month, txByDate, _maxDailyVolume, onSelectDay, fmt, locale }) {
  const monthName = useMemo(
    () => new Date(year, month, 1).toLocaleDateString(locale, { month: 'short' }),
    [year, month, locale]
  );

  // Identify all days that have transaction activity
  const activeDays = useMemo(() => {
    const list = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dayData = txByDate[key];
      if (dayData && (dayData.income > 0 || dayData.expense > 0)) {
        list.push({
          day: d,
          key,
          net: dayData.net,
          income: dayData.income,
          expense: dayData.expense,
          isPos: dayData.net > 0,
          isNeg: dayData.net < 0,
        });
      }
    }
    return list;
  }, [daysInMonth, year, month, txByDate]);

  // Issue 21: If fewer than 3 data points, hide sparkline entirely and remove reserved height
  if (activeDays.length < 3) {
    return null;
  }

  // Case 3: 3+ active days — render an elegant, smooth SVG area curve
  // Width 360, height 56 (4:1 / 5:1 natural ratio)
  const W = 360;
  const H = 56;
  const padX = 8;
  const padY = 8;

  const points = [];
  let minVal = 0;
  let maxVal = 0;
  let cumNet = 0;
  const dayStep = (W - padX * 2) / Math.max(daysInMonth - 1, 1);

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    const dayData = txByDate[key];
    if (dayData) {
      cumNet += dayData.net;
    }
    if (cumNet < minVal) minVal = cumNet;
    if (cumNet > maxVal) maxVal = cumNet;
    points.push({ d, cumNet });
  }

  const range = maxVal - minVal || 1;
  const coords = points.map((pt, idx) => {
    const x = Math.round(padX + idx * dayStep);
    const y = Math.round(H - padY - ((pt.cumNet - minVal) / range) * (H - padY * 2));
    return { x, y, d: pt.d, net: pt.cumNet };
  });

  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const mx = (p0.x + p1.x) / 2;
    pathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${H} L ${coords[0].x} ${H} Z`;
  const isOverallPos = coords[coords.length - 1].net >= 0;

  return (
    <div className="cal-sparkline-wrap">
      <div className="cal-sparkline-area" aria-label="Monthly net cashflow trajectory">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="cal-sparkline-svg"
        >
        <defs>
          <linearGradient id="cal-hero-spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={isOverallPos ? '#10b981' : '#ef4444'}
              stopOpacity="0.32"
            />
            <stop
              offset="100%"
              stopColor={isOverallPos ? '#10b981' : '#ef4444'}
              stopOpacity="0.0"
            />
          </linearGradient>
        </defs>
        <path className="cal-spark-area" d={areaD} fill="url(#cal-hero-spark-grad)" />
        <path
          className="cal-spark-path"
          d={pathD}
          fill="none"
          stroke={isOverallPos ? '#10b981' : '#ef4444'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {activeDays.map((ad) => {
          const c = coords[ad.day - 1];
          if (!c) return null;
          return (
            <circle
              key={ad.key}
              cx={c.x}
              cy={c.y}
              r="3.5"
              fill={ad.isPos ? '#10b981' : '#ef4444'}
              stroke="var(--surface-1, #0f172a)"
              strokeWidth="2"
              className="cal-spark-dot"
              onClick={() => onSelectDay(ad.key)}
            >
              <title>{`${monthName} ${ad.day}: ${ad.net >= 0 ? '+' : ''}${fmt(ad.net)}`}</title>
            </circle>
          );
        })}
      </svg>
      </div>
    </div>
  );
}

/* ============================================================
 * Component
 * ============================================================ */
export default function Calendar() {
  const {
    transactions = [],
    subscriptions = [],
    addTransaction,
    updateTransaction,
    deleteTransaction,
    fmt: contextFmt,
    t,
    lang = 'en',
    loading,
  } = useContext(AppContext);
  const { showToast } = useToast();

  const locale = useMemo(() => resolveLocale(lang), [lang]);
  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  const fmt = useCallback(
    (value) => {
      if (contextFmt) {
        try {
          const out = contextFmt(value);
          if (out != null) return out;
        } catch { /* fall through */ }
      }
      const num = Number(value);
      const safe = Number.isFinite(num) ? num : 0;
      return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(safe);
    },
    [contextFmt, locale]
  );

  /* ---------------- State ---------------- */
  const [currentDate, setCurrentDate] = useState(() => getAppDate());
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' | 'list' | 'weekly'
  const [selectedDate, setSelectedDate] = useState(null);
  const [focusedDay, setFocusedDay] = useState(null);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'income' | 'expense' | 'recurring'
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentDate.getFullYear());
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [newTxDate, setNewTxDate] = useState('');
  const [dayFilterType, setDayFilterType] = useState('all');
  const [pendingDelete, setPendingDelete] = useState(null);

  const dayModalRef = useRef(null);
  const deleteModalRef = useRef(null);

  /* ---------------- Derived calendar bounds ---------------- */
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // Sync pickerYear with viewed year
  useEffect(() => {
    setPickerYear(year);
  }, [year]);

  /* ---------------- Off-current-month detection ---------------- */
  const isOffCurrentMonth = useMemo(() => {
    const today = getAppDate();
    return today.getFullYear() !== year || today.getMonth() !== month;
  }, [year, month]);

  /* ---------------- Transaction index (soft-delete aware) ---------------- */
  const liveTransactions = useMemo(() => {
    const list = Array.isArray(transactions) ? transactions : [];
    const todayKey = normalizeDateKey(getAppDate());
    return list
      .filter(isLiveTransaction)
      .filter((tx) => {
        const dateKey = normalizeDateKey(tx.date);
        return dateKey && (!todayKey || dateKey <= todayKey);
      })
      .map((tx) => ({ ...tx, category: canonicalCategoryName(tx.category) }));
  }, [transactions]);

  /* ---------------- Current-month transactions (Single Source of Truth) ---------------- */
  const currentMonthTransactions = useMemo(() => {
    return liveTransactions.filter((t) => {
      const key = normalizeDateKey(t.date);
      if (!key) return false;
      const [y, m, d] = key.split('-').map(Number);
      return y === year && m === month + 1 && d >= 1 && d <= daysInMonth;
    });
  }, [liveTransactions, year, month, daysInMonth]);

  const monthlyIncome = useMemo(
    () => currentMonthTransactions
      .filter((t) => String(t.type || '').toLowerCase() === 'income')
      .reduce((a, c) => a + Math.abs(toNumber(c.amount)), 0),
    [currentMonthTransactions]
  );
  const monthlyExpense = useMemo(
    () => currentMonthTransactions
      .filter((t) => String(t.type || '').toLowerCase() === 'expense')
      .reduce((a, c) => a + Math.abs(toNumber(c.amount)), 0),
    [currentMonthTransactions]
  );
  const monthlyNet = monthlyIncome - monthlyExpense;

  const txByDate = useMemo(() => {
    const map = Object.create(null);
    for (const tx of liveTransactions) {
      const key = normalizeDateKey(tx.date);
      if (!key) continue;
      if (!map[key]) map[key] = { items: [], income: 0, expense: 0, net: 0 };
      map[key].items.push(tx);
      const amt = Math.abs(toNumber(tx.amount));
      const type = String(tx.type || '').toLowerCase();
      if (type === 'income') map[key].income += amt;
      else if (type === 'expense') map[key].expense += amt;
      map[key].net = map[key].income - map[key].expense;
    }
    return map;
  }, [liveTransactions]);

  /* ---------------- Scheduled future subscription bills ---------------- */
  const scheduledBills = useMemo(() => {
    if (!Array.isArray(subscriptions)) return {};
    const map = {};
    for (const sub of subscriptions) {
      if (sub.is_paused || sub.cancelled_at) continue;
      const sDate = sub.start_date ? new Date(sub.start_date) : null;
      if (!sDate) continue;
      const billDay = sDate.getDate();
      if (billDay >= 1 && billDay <= daysInMonth) {
        const key = `${year}-${pad2(month + 1)}-${pad2(billDay)}`;
        if (!map[key]) map[key] = [];
        map[key].push(sub);
      }
    }
    return map;
  }, [subscriptions, year, month, daysInMonth]);

  /* ---------------- Max volume across month for proportional scaling ---------------- */
  const maxDailyVolume = useMemo(() => {
    let maxVol = 1;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dayData = txByDate[key];
      if (dayData) {
        const total = dayData.income + dayData.expense;
        if (total > maxVol) maxVol = total;
      }
    }
    return maxVol;
  }, [daysInMonth, year, month, txByDate]);

  /* Counts for supporting cards & filter chips */
  const incomeCount = useMemo(
    () => currentMonthTransactions.filter((t) => String(t.type || '').toLowerCase() === 'income').length,
    [currentMonthTransactions]
  );
  const expenseCount = useMemo(
    () => currentMonthTransactions.filter((t) => String(t.type || '').toLowerCase() === 'expense').length,
    [currentMonthTransactions]
  );
  const avgIncome = useMemo(
    () => (incomeCount > 0 ? Math.round(monthlyIncome / incomeCount) : 0),
    [monthlyIncome, incomeCount]
  );
  const avgExpense = useMemo(
    () => (expenseCount > 0 ? Math.round(monthlyExpense / expenseCount) : 0),
    [monthlyExpense, expenseCount]
  );
  const recurringCount = useMemo(() => {
    const txRec = currentMonthTransactions.filter((t) => t.is_recurring || t.recurring || t.isRecurring).length;
    const subCount = Object.keys(scheduledBills).length;
    return txRec + subCount;
  }, [currentMonthTransactions, scheduledBills]);

  const hasAnyRecurringThisMonth = recurringCount > 0;

  /* ---------------- Month-over-Month Data ---------------- */
  const prevMonthYear = month === 0 ? year - 1 : year;
  const prevMonthIdx = month === 0 ? 11 : month - 1;

  const prevMonthTransactions = useMemo(() => {
    return liveTransactions.filter((t) => {
      const key = normalizeDateKey(t.date);
      if (!key) return false;
      const [y, m] = key.split('-').map(Number);
      return y === prevMonthYear && m === prevMonthIdx + 1;
    });
  }, [liveTransactions, prevMonthYear, prevMonthIdx]);

  const prevMonthNet = useMemo(() => {
    return prevMonthTransactions.reduce((acc, t) => {
      const amt = Math.abs(toNumber(t.amount));
      const type = String(t.type || '').toLowerCase();
      return type === 'income' ? acc + amt : acc - amt;
    }, 0);
  }, [prevMonthTransactions]);

  const momDelta = useMemo(() => {
    if (prevMonthTransactions.length === 0 || prevMonthNet === 0) {
      if (monthlyNet === 0) return null;
      return {
        isNew: true,
        diff: monthlyNet,
        pct: 100,
        isPositive: monthlyNet > 0,
        formatted: tr('first_month_data', 'First month with data'),
      };
    }
    const diff = monthlyNet - prevMonthNet;
    const pct = Math.round((diff / Math.abs(prevMonthNet)) * 100);
    return {
      isNew: false,
      diff,
      pct: Math.abs(pct),
      isPositive: diff >= 0,
      formatted: `${diff >= 0 ? '+' : ''}${pct}%`,
    };
  }, [monthlyNet, prevMonthNet, prevMonthTransactions.length, tr]);

  const projectionNarrative = useMemo(() => {
    if (currentMonthTransactions.length === 0) return null;
    const now = getAppDate();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
    if (!isCurrentMonth) return null;
    const daysElapsed = Math.max(now.getDate(), 1);
    const projected = Math.round((monthlyNet / daysElapsed) * daysInMonth);
    return `${tr('on_track_for', 'On track for')} ${fmt(projected)} ${tr('projected_by_end', 'projected by month-end')}`;
  }, [currentMonthTransactions.length, year, month, daysInMonth, monthlyNet, fmt, tr]);

  /* ---------------- Weekly Summary (Guaranteed Math Reconciliation) ---------------- */
  const weeklySummary = useMemo(() => {
    const monthShort = new Date(year, month, 1).toLocaleDateString(locale, { month: 'short' });
    const weekBuckets = [];
    let weekStart = 1;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayOfWeek = (firstDayOfMonth + d - 1) % 7;
      if (dayOfWeek === 6 || d === daysInMonth) {
        weekBuckets.push({
          weekNum: weekBuckets.length + 1,
          startDay: weekStart,
          endDay: d,
          dateRange: `${monthShort} ${weekStart}–${d}`,
          income: 0,
          expense: 0,
          net: 0,
          count: 0,
        });
        weekStart = d + 1;
      }
    }

    // Partition every currentMonthTransaction into its exact calendar week bucket
    for (const tx of currentMonthTransactions) {
      const key = normalizeDateKey(tx.date);
      if (!key) continue;
      const dayNum = Number(key.split('-')[2]);
      const bucket = weekBuckets.find((w) => dayNum >= w.startDay && dayNum <= w.endDay);
      if (bucket) {
        const amt = Math.abs(toNumber(tx.amount));
        const type = String(tx.type || '').toLowerCase();
        if (type === 'income') {
          bucket.income += amt;
        } else if (type === 'expense') {
          bucket.expense += amt;
        }
        bucket.net = bucket.income - bucket.expense;
        bucket.count += 1;
      }
    }

    return weekBuckets;
  }, [daysInMonth, year, month, firstDayOfMonth, currentMonthTransactions, locale]);

  /* ---------------- Selected day ---------------- */
  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    return txByDate[selectedDate] || { items: [], income: 0, expense: 0, net: 0 };
  }, [selectedDate, txByDate]);

  const dayCategoryTotals = useMemo(() => {
    if (!selectedDayData) return [];
    const acc = new Map();
    for (const tx of selectedDayData.items) {
      const cat = tx.category || 'Other';
      if (!acc.has(cat)) acc.set(cat, { category: cat, income: 0, expense: 0 });
      const bucket = acc.get(cat);
      const amt = Math.abs(toNumber(tx.amount));
      const type = String(tx.type || '').toLowerCase();
      if (type === 'income') bucket.income += amt;
      else if (type === 'expense') bucket.expense += amt;
    }
    return Array.from(acc.values()).sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }, [selectedDayData]);

  const filteredDayItems = useMemo(() => {
    if (!selectedDayData) return [];
    if (dayFilterType === 'all') return selectedDayData.items;
    return selectedDayData.items.filter((tx) => tx.type === dayFilterType);
  }, [selectedDayData, dayFilterType]);

  /* ============================================================
   * Navigation
   * ============================================================ */

  const prevPeriod = useCallback(() => {
    if (viewMode === 'weekly') {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() - 7);
        return next;
      });
    } else {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  }, [viewMode, year, month]);

  const nextPeriod = useCallback(() => {
    if (viewMode === 'weekly') {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 7);
        return next;
      });
    } else {
      setCurrentDate(new Date(year, month + 1, 1));
    }
  }, [viewMode, year, month]);

  const jumpToToday = useCallback(() => {
    const today = getAppDate();
    setCurrentDate(today);
    setFocusedDay(today.getDate());
    setIsMonthPickerOpen(false);
  }, []);

  const selectMonth = useCallback((mIdx) => {
    setCurrentDate(new Date(pickerYear, mIdx, 1));
    setIsMonthPickerOpen(false);
  }, [pickerYear]);

  /* ============================================================
   * Modal / Drawer handlers
   * ============================================================ */

  const openDayDetails = useCallback((dateKey) => {
    setSelectedDate(dateKey);
    setDayFilterType('all');
    setIsMonthPickerOpen(false);
    const d = parseKeyLocal(dateKey);
    if (d) setFocusedDay(d.getDate());
  }, []);

  const closeDayDetails = useCallback(() => {
    setSelectedDate(null);
    setDayFilterType('all');
  }, []);

  const openAddForDate = useCallback((dateKey, e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    setNewTxDate(dateKey);
    setIsAdding(true);
    setSelectedDate(null);
  }, []);

  const openEditForTransaction = useCallback((tx, e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    setEditingTx(tx);
    setIsEditing(true);
  }, []);

  const closeAdd = useCallback(() => {
    setIsAdding(false);
    setNewTxDate('');
  }, []);

  const closeEdit = useCallback(() => {
    setIsEditing(false);
    setEditingTx(null);
  }, []);

  const addInitialData = useMemo(() => ({ date: newTxDate }), [newTxDate]);

  /* ============================================================
   * CRUD
   * ============================================================ */

  const handleAddSubmit = useCallback(async (txData) => {
    try {
      await addTransaction(txData);
      showToast('success', tr('tx_added', 'Transaction added successfully.'));
      closeAdd();
    } catch (err) {
      showToast('error', err?.message || tr('tx_add_failed', 'Failed to add transaction.'));
    }
  }, [addTransaction, showToast, closeAdd, tr]);

  const handleEditSubmit = useCallback(async (txData) => {
    if (!editingTx) return;
    const id = editingTx.id || editingTx._id;
    if (!id) {
      showToast('error', tr('tx_invalid', 'Invalid transaction.'));
      closeEdit();
      return;
    }
    try {
      await updateTransaction(id, txData);
      showToast('success', tr('tx_updated', 'Transaction updated.'));
      closeEdit();
    } catch (err) {
      showToast('error', err?.message || tr('tx_update_failed', 'Failed to update transaction.'));
    }
  }, [updateTransaction, editingTx, showToast, closeEdit, tr]);

  const requestDelete = useCallback((tx) => setPendingDelete(tx), []);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id || pendingDelete._id;
    if (!id) {
      showToast('error', tr('tx_invalid', 'Invalid transaction.'));
      setPendingDelete(null);
      return;
    }
    try {
      await deleteTransaction(id);
      showToast('success', tr('tx_deleted', 'Transaction deleted.'));
      setPendingDelete(null);
    } catch (err) {
      showToast('error', err?.message || tr('tx_delete_failed', 'Failed to delete transaction.'));
    }
  }, [pendingDelete, deleteTransaction, showToast, tr]);

  /* ============================================================
   * CSV export
   * ============================================================ */

  const exportMonthCSV = useCallback(() => {
    const headers = ['Date', 'Type', 'Category', 'Amount', 'Note'];
    const rows = currentMonthTransactions.map((tx) => [
      normalizeDateKey(tx.date),
      tx.type,
      tx.category || 'Other',
      toNumber(tx.amount).toFixed(2),
      tx.note || '',
    ]);
    const csvContent = [
      headers.map(escapeCsvField).join(','),
      ...rows.map((r) => r.map(escapeCsvField).join(',')),
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_${year}-${pad2(month + 1)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', tr('csv_exported', 'CSV exported successfully.'));
  }, [currentMonthTransactions, year, month, showToast, tr]);

  /* ============================================================
   * Global & Grid Keyboard Navigation
   * ============================================================ */
  useEffect(() => {
    const handleGlobalKey = (e) => {
      // Escape closes open modals or drawer first
      if (e.key === 'Escape') {
        if (isMonthPickerOpen) setIsMonthPickerOpen(false);
        else if (pendingDelete) cancelDelete();
        else if (selectedDate) closeDayDetails();
        return;
      }

      // If drawer/modal is open or text input is active, skip grid shortcuts
      if (pendingDelete || isAdding || isEditing) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable) {
        return;
      }

      if ((e.key === 'ArrowLeft' && e.shiftKey) || e.key === 'PageUp') {
        e.preventDefault();
        prevPeriod();
      } else if ((e.key === 'ArrowRight' && e.shiftKey) || e.key === 'PageDown') {
        e.preventDefault();
        nextPeriod();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedDay((d) => (d == null ? 1 : Math.max(1, d - 1)));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedDay((d) => (d == null ? 1 : Math.min(daysInMonth, d + 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedDay((d) => (d == null ? 1 : Math.max(1, d - 7)));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedDay((d) => (d == null ? 1 : Math.min(daysInMonth, d + 7)));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedDay != null) {
          const focusedKey = `${year}-${pad2(month + 1)}-${pad2(focusedDay)}`;
          openDayDetails(focusedKey);
        }
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        jumpToToday();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openAddForDate(normalizeDateKey(getAppDate()));
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
  }, [
    daysInMonth, year, month, focusedDay, isMonthPickerOpen,
    pendingDelete, isAdding, isEditing, selectedDate,
    openDayDetails, jumpToToday, openAddForDate, closeDayDetails, cancelDelete,
    prevPeriod, nextPeriod,
  ]);

  /* ---------------- Focus traps ---------------- */
  useFocusTrap(dayModalRef, Boolean(selectedDate));
  useFocusTrap(deleteModalRef, Boolean(pendingDelete));

  /* ============================================================
   * Render: Monthly Grid (Heatmap, In-cell Net, Dual Bars, Recurring)
   * ============================================================ */
  const renderMonthlyGrid = () => {
    const weekDays = getWeekDays(locale);
    const todayStr = normalizeDateKey(getAppDate());
    const cells = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<div key={`empty-${i}`} className="cal-day empty" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dayData = txByDate[key];
      const isToday = key === todayStr;
      const isSelected = key === selectedDate;
      const isFocused = focusedDay === d;
      const hasData = Boolean(dayData && (dayData.income > 0 || dayData.expense > 0));
      const dayOfWeek = (firstDayOfMonth + d - 1) % 7;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      let netClass = 'empty-day';
      let netIntensity = 0;
      let hasRecurring = false;

      if (hasData) {
        if (dayData.net > 0) {
          netClass = 'net-pos';
        } else if (dayData.net < 0) {
          netClass = 'net-neg';
        } else {
          netClass = 'net-neutral';
        }
        // Baseline 0.35 intensity ensures tint is clearly visible even on low-volume active days
        netIntensity = Math.min(Math.max(Math.abs(dayData.net) / (maxDailyVolume || 1), 0.35), 1);
        hasRecurring = dayData.items.some((tx) => tx.is_recurring || tx.recurring || tx.isRecurring);
      }

      const scheduledList = scheduledBills[key] || [];
      if (!hasRecurring && scheduledList.length > 0) {
        hasRecurring = true;
      }

      /* Filter check: dims non-matching days */
      let isFilteredOut = false;
      if (filterType === 'income' && (!dayData || dayData.income === 0)) isFilteredOut = true;
      else if (filterType === 'expense' && (!dayData || dayData.expense === 0)) isFilteredOut = true;
      else if (filterType === 'recurring' && !hasRecurring) isFilteredOut = true;

      // Ensure minimum 8% visible width for any volume > 0
      const outflowPct = hasData && dayData.expense > 0
        ? Math.max(8, Math.min(50, (dayData.expense / (maxDailyVolume || 1)) * 50))
        : 0;
      const inflowPct = hasData && dayData.income > 0
        ? Math.max(8, Math.min(50, (dayData.income / (maxDailyVolume || 1)) * 50))
        : 0;

      cells.push(
        <div
          key={`day-${d}`}
          className={`cal-day ${isToday ? 'today' : ''} ${isSelected ? 'selected-day' : ''} ${isFocused ? 'cal-focused' : ''} ${netClass} ${isWeekend ? 'weekend' : ''} ${isFilteredOut ? 'filtered-out' : ''}`}
          style={{ '--net-int': netIntensity.toFixed(2) }}
          onClick={() => openDayDetails(key)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDayDetails(key);
            }
          }}
          title={hasData
            ? `${d} ${formatMonthLong(year, month, locale)}: ${dayData.net >= 0 ? '+' : ''}${fmt(dayData.net)} (In: +${fmt(dayData.income)}, Out: -${fmt(dayData.expense)})`
            : `${d} ${formatMonthLong(year, month, locale)}`}
          aria-label={`${d} ${formatMonthLong(year, month, locale)}${hasData ? `, net ${fmt(dayData.net)}` : ', no transactions'}`}
        >
          <div className="cal-day-top-row">
            <div className="cal-day-num-wrap">
              <span className="cal-date-num">{d}</span>
              {hasRecurring && (
                <span className="cal-recurring-badge" title={tr('legend_recurring', 'Recurring bill')}>
                  <Repeat size={10} aria-hidden />
                </span>
              )}
            </div>
            <button
              type="button"
              className="cal-day-quick-add"
              onClick={(e) => openAddForDate(key, e)}
              title={tr('add_transaction', 'Add transaction for this day')}
              aria-label={tr('add_transaction', 'Add transaction')}
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Upcoming scheduled subscription indicator on future/empty days */}
          {scheduledList.length > 0 && !hasData && (
            <div
              className="cal-scheduled-badge"
              title={`Upcoming: ${scheduledList[0].name} (${fmt(scheduledList[0].amount)})`}
              onClick={(e) => { e.stopPropagation(); openDayDetails(key); }}
            >
              <Repeat size={9} />
              <span>{scheduledList[0].name}</span>
            </div>
          )}

          {hasData && (
            <div className="cal-day-bottom-data cal-day-bottom">
              <div className="cal-dual-bar-wrap" aria-hidden="true">
                <div className="cal-dual-bar">
                  <div
                    className="cal-bar-left"
                    style={{ width: `${outflowPct}%` }}
                    title={`Outflow: -${fmt(dayData.expense)}`}
                  />
                  <div className="cal-bar-divider" />
                  <div
                    className="cal-bar-right"
                    style={{ width: `${inflowPct}%` }}
                    title={`Inflow: +${fmt(dayData.income)}`}
                  />
                </div>
              </div>
              <div className={`cal-cell-net-val ${dayData.net > 0 ? 'pos' : dayData.net < 0 ? 'neg' : 'zero'}`}>
                {dayData.net > 0 ? '+' : ''}{fmt(dayData.net)}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <>
        {weekDays.map((day, idx) => (
          <div key={day} className={`cal-weekday ${idx === 0 || idx === 6 ? 'weekend' : ''}`}>
            {day}
          </div>
        ))}
        {cells}
      </>
    );
  };

  /* ============================================================
   * Render: Mobile Day-Grouped List View
   * ============================================================ */
  const renderMobileListView = () => {
    // Collect active days and scheduled bill days
    const activeDayKeys = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dayData = txByDate[key];
      const hasSched = scheduledBills[key]?.length > 0;
      if ((dayData && dayData.items.length > 0) || hasSched) {
        // Check filter
        if (filterType === 'income' && (!dayData || dayData.income === 0)) continue;
        if (filterType === 'expense' && (!dayData || dayData.expense === 0)) continue;
        if (filterType === 'recurring' && !hasSched && (!dayData || !dayData.items.some((t) => t.is_recurring))) continue;
        activeDayKeys.push(key);
      }
    }

    if (activeDayKeys.length === 0) {
      return (
        <div className="glass empty-state" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Wallet size={42} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.05rem', margin: '0 0 6px' }}>{tr('no_transactions', 'No Transactions')}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
            {tr('no_transactions_month', 'No transactions recorded for this month yet.')}
          </p>
          <button
            type="button"
            className="btn-primary btn-sm"
            style={{ marginTop: 14 }}
            onClick={() => openAddForDate(normalizeDateKey(getAppDate()))}
          >
            <Plus size={14} /> {tr('new_entry', 'New Entry')}
          </button>
        </div>
      );
    }

    return (
      <div className="cal-mobile-list">
        {activeDayKeys.map((key) => {
          const dayData = txByDate[key] || { items: [], income: 0, expense: 0, net: 0 };
          const schedList = scheduledBills[key] || [];
          return (
            <div key={key} className="cml-day-card cal-mobile-day-card glass" onClick={() => openDayDetails(key)}>
              <div className="cml-day-header">
                <span className="cml-date-title">
                  <CalendarDays size={14} style={{ opacity: 0.7 }} />
                  {formatFullDate(key, locale)}
                </span>
                <span className={`cml-day-net ${dayData.net >= 0 ? 'text-success' : 'text-danger'}`}>
                  {dayData.net >= 0 ? '+' : ''}{fmt(dayData.net)}
                </span>
              </div>
              <div className="cml-tx-list">
                {dayData.items.map((tx, idx) => (
                  <div key={tx.id || tx._id || idx} className="cml-tx-item">
                    <div className="cml-tx-info">
                      {tx.type === 'income' ? (
                        <ArrowUpRight size={14} className="text-success" />
                      ) : (
                        <ArrowDownRight size={14} className="text-danger" />
                      )}
                      <div>
                        <span className="cat">{tx.category || tr('uncategorized', 'Uncategorized')}</span>
                        {tx.note && <span className="note"> · {tx.note}</span>}
                      </div>
                    </div>
                    <span className={`cml-tx-amt ${tx.type === 'income' ? 'text-success' : 'text-danger'}`}>
                      {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                    </span>
                  </div>
                ))}
                {schedList.map((sub, sIdx) => (
                  <div key={`sched-${sIdx}`} className="cml-tx-item" style={{ opacity: 0.85 }}>
                    <div className="cml-tx-info">
                      <Repeat size={13} color="#a78bfa" />
                      <span className="cat" style={{ color: '#a78bfa' }}>
                        {sub.name} ({tr('scheduled_bill', 'Scheduled')})
                      </span>
                    </div>
                    <span className="cml-tx-amt text-danger">-{fmt(sub.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ============================================================
   * Render: Weekly Grid
   * ============================================================ */
  const renderWeeklyGrid = () => {
    const ref = new Date(currentDate);
    ref.setHours(0, 0, 0, 0);
    const dayOfWeek = ref.getDay();
    const startOfWeek = new Date(ref);
    startOfWeek.setDate(ref.getDate() - dayOfWeek);

    const weekDays = getWeekDays(locale);
    const todayStr = normalizeDateKey(getAppDate());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const spansYears = startOfWeek.getFullYear() !== endOfWeek.getFullYear();
    const rangeLabel = spansYears
      ? `${formatDayWithYear(startOfWeek, locale)} – ${formatDayWithYear(endOfWeek, locale)}`
      : `${formatShortDay(startOfWeek, locale)} – ${formatShortDay(endOfWeek, locale)}, ${endOfWeek.getFullYear()}`;

    return (
      <>
        <div
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          {rangeLabel}
        </div>
        <div className="cal-weekly-grid">
          {Array.from({ length: 7 }, (_, i) => {
            const dayDate = new Date(startOfWeek);
            dayDate.setDate(startOfWeek.getDate() + i);
            const key = normalizeDateKey(dayDate);
            const dayData = txByDate[key] || { items: [], income: 0, expense: 0, net: 0 };
            const isToday = key === todayStr;
            return (
              <div key={key} className={`cal-week-card glass ${isToday ? 'today' : ''}`}>
                <div className="cwc-header">
                  <span className="cwc-day-name">{weekDays[i]}</span>
                  <span className="cwc-day-num">{dayDate.getDate()}</span>
                  <button
                    type="button"
                    className="cwc-add-btn"
                    onClick={(e) => openAddForDate(key, e)}
                    title={tr('add_transaction', 'Add for this day')}
                    aria-label={tr('add_transaction', 'Add transaction')}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="cwc-totals">
                  <div className="cwc-total-row text-success">
                    <span>{tr('inflow', 'Inflow')}</span>
                    <strong>+{fmt(dayData.income)}</strong>
                  </div>
                  <div className="cwc-total-row text-danger">
                    <span>{tr('outflow', 'Outflow')}</span>
                    <strong>-{fmt(dayData.expense)}</strong>
                  </div>
                  <div className={`cwc-total-row net ${dayData.net >= 0 ? 'text-success' : 'text-danger'}`}>
                    <span>{tr('net', 'Net')}</span>
                    <strong>{fmt(dayData.net)}</strong>
                  </div>
                </div>
                <div className="cwc-items-list">
                  {dayData.items.length > 0 ? (
                    dayData.items.map((tx, idx) => (
                      <div
                        key={tx.id || tx._id || idx}
                        className="cwc-item"
                        onClick={() => openDayDetails(key)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDayDetails(key);
                          }
                        }}
                      >
                        <span className="cwc-item-cat">
                          {tx.category || tr('uncategorized', 'Uncategorized')}
                        </span>
                        <span className={`cwc-item-amt ${tx.type}`}>
                          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="cwc-empty">{tr('no_entries', 'No entries')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  /* ============================================================
   * Loading State
   * ============================================================ */
  if (loading && liveTransactions.length === 0) {
    return (
      <div className="calendar-page-content">
        <div className="masonry-header">
          <div className="mh-titles">
            <h2>{tr('calendar_hub', 'Calendar Hub')}</h2>
          </div>
        </div>
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Clock size={40} style={{ opacity: 0.5, marginBottom: '1rem' }} />
          <p style={{ color: 'var(--text-muted)' }}>{tr('loading_calendar', 'Loading calendar…')}</p>
        </div>
      </div>
    );
  }

  /* ============================================================
   * Render Page
   * ============================================================ */
  return (
    <div className="calendar-page-content">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{tr('calendar_hub', 'Calendar Hub')}</h2>
          <span className="mh-badge">
            {currentMonthTransactions.length} {tr('transactions_this_month', 'transactions this month')}
          </span>
        </div>
        <div className="cal-header-controls">
          <div className="cal-header-row">
            <div className="cal-header-left">
              <button
                type="button"
                className="btn-secondary cal-today-btn"
                onClick={jumpToToday}
                title={tr('jump_today', 'Jump to today')}
                aria-label={tr('today', 'Today')}
              >
                <Clock size={15} /> {tr('today', 'Today')}
              </button>

              <div className="cal-nav-group">
                <button
                  type="button"
                  className="cal-nav-btn cal-nav-arrow"
                  onClick={prevPeriod}
                  aria-label={viewMode === 'weekly'
                    ? tr('previous_week', 'Previous week')
                    : tr('previous_month', 'Previous month')}
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="cal-month-title-wrap">
                  <button
                    type="button"
                    className="cal-month-title-grouped"
                    onClick={() => setIsMonthPickerOpen((v) => !v)}
                    title={tr('select_month_year', 'Select Month & Year')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {viewMode === 'weekly'
                      ? tr('weekly_view', 'Weekly View')
                      : formatMonthYear(year, month, locale)}
                  </button>
                  {isMonthPickerOpen && (
                    <div className="cal-month-picker-popover glass">
                      <div className="cmp-year-row">
                        <button type="button" onClick={() => setPickerYear((y) => y - 1)}>
                          <ChevronLeft size={16} />
                        </button>
                        <span>{pickerYear}</span>
                        <button type="button" onClick={() => setPickerYear((y) => y + 1)}>
                          <ChevronRight size={16} />
                        </button>
                      </div>
                      <div className="cmp-months-grid">
                        {Array.from({ length: 12 }, (_, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`cmp-month-btn ${pickerYear === year && i === month ? 'active' : ''}`}
                            onClick={() => selectMonth(i)}
                          >
                            {new Date(pickerYear, i, 1).toLocaleDateString(locale, { month: 'short' })}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="cal-nav-btn cal-nav-arrow"
                  onClick={nextPeriod}
                  aria-label={viewMode === 'weekly'
                    ? tr('next_week', 'Next week')
                    : tr('next_month', 'Next month')}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="cal-header-actions-group">
              <div className="view-toggles glass">
                {[
                  { id: 'monthly', label: tr('month', 'Month'), Icon: CalendarIcon },
                  { id: 'list', label: tr('list_view', 'List'), Icon: ListIcon },
                  { id: 'weekly', label: tr('week', 'Week'), Icon: CalendarDays },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`vt-btn ${viewMode === tab.id ? 'active' : ''}`}
                    onClick={() => setViewMode(tab.id)}
                    aria-pressed={viewMode === tab.id}
                    aria-label={`${tab.label} view`}
                  >
                    <tab.Icon size={14} /> {tab.label}
                  </button>
                ))}
              </div>

              <div className="cal-header-right">
                <button
                  type="button"
                  className="btn-secondary cal-csv-btn"
                  onClick={exportMonthCSV}
                  title={tr('export_csv', 'Export CSV')}
                  aria-label={tr('export_csv', 'Export month data as CSV')}
                >
                  <Download size={14} /> <span className="cal-csv-text">CSV</span>
                </button>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="btn-primary cal-new-btn"
                  onClick={() => openAddForDate(normalizeDateKey(getAppDate()))}
                >
                  <Plus size={16} /> <span>{tr('new_entry', 'New Entry')}</span>
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Month metrics: Hero Net Position Card (span 2) + 2 Supporting Cards */}
      <div className="calendar-stats-row">
        <div className="glass stat-card cal-hero-card">
          <div className="cal-hero-top">
            <div>
              <p className="stat-lbl">{tr('net_position', 'Net Position')}</p>
              <h3 className={`stat-val cal-hero-value ${monthlyNet >= 0 ? 'text-success' : 'text-danger'}`}>
                {monthlyNet >= 0 ? '+' : ''}{fmt(monthlyNet)}
              </h3>
            </div>
            {momDelta && (
              <div className={`cal-delta-badge ${momDelta.isPositive ? 'positive' : 'negative'}`}>
                {momDelta.isPositive ? (
                  <TrendingUp size={13} aria-hidden />
                ) : (
                  <TrendingDown size={13} aria-hidden />
                )}
                <span>
                  {momDelta.isNew
                    ? momDelta.formatted
                    : `${momDelta.formatted} ${tr('vs_last_month', 'vs last month')}`}
                </span>
              </div>
            )}
          </div>
          {projectionNarrative && (
            <p className="cal-projection-note cal-hero-subtext">{projectionNarrative}</p>
          )}
          <CalHeroTrend
            daysInMonth={daysInMonth}
            year={year}
            month={month}
            txByDate={txByDate}
            _maxDailyVolume={maxDailyVolume}
            onSelectDay={openDayDetails}
            fmt={fmt}
            locale={locale}
          />
        </div>

        <div className="glass stat-card cal-support-card">
          <div className="cal-support-card-header">
            <span className="stat-lbl">{tr('monthly_inflow', 'Monthly Inflow')}</span>
            <div className="cal-support-icon inflow">
              <ArrowUpRight size={14} aria-hidden />
            </div>
          </div>
          <div className="cal-support-card-body">
            <h3 className="stat-val cal-support-value text-success">+{fmt(monthlyIncome)}</h3>
            <div className="cal-support-sub-row">
              <span className="cal-support-count-pill">
                {incomeCount} {tr('deposits', 'deposits')}
              </span>
              {incomeCount > 0 && (
                <span className="cal-support-avg-pill">
                  ~{fmt(avgIncome)} avg
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="glass stat-card cal-support-card">
          <div className="cal-support-card-header">
            <span className="stat-lbl">{tr('monthly_outflow', 'Monthly Outflow')}</span>
            <div className="cal-support-icon outflow">
              <ArrowDownRight size={14} aria-hidden />
            </div>
          </div>
          <div className="cal-support-card-body">
            <h3 className="stat-val cal-support-value text-danger">-{fmt(monthlyExpense)}</h3>
            <div className="cal-support-sub-row">
              <span className="cal-support-count-pill">
                {expenseCount} {tr('payments', 'payments')}
              </span>
              {expenseCount > 0 && (
                <span className="cal-support-avg-pill">
                  ~{fmt(avgExpense)} avg
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Chips Strip */}
      <div className="cal-filter-strip">
        {[
          { id: 'all', label: tr('filter_all', 'All'), count: currentMonthTransactions.length },
          { id: 'income', label: tr('filter_income', 'Income'), count: incomeCount },
          { id: 'expense', label: tr('filter_expense', 'Expense'), count: expenseCount },
          { id: 'recurring', label: tr('filter_recurring', 'Recurring'), count: recurringCount },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            className={`cal-filter-chip ${filterType === f.id ? 'active' : ''}`}
            onClick={() => setFilterType(f.id)}
          >
            <span>{f.label}</span>
            <span className="cal-chip-count">({f.count})</span>
          </button>
        ))}

        {isOffCurrentMonth && (
          <button
            type="button"
            className="cal-back-today-chip"
            onClick={jumpToToday}
            title={tr('back_to_today', 'Back to today')}
          >
            <Clock size={12} /> {tr('back_to_today', 'Back to today')}
          </button>
        )}
      </div>

      <div className="calendar-container glass">
        {currentMonthTransactions.length === 0 && (
          <div className="cal-empty-month-banner">
            <Clock size={15} />
            <span>{tr('no_transactions_month', 'No transactions recorded for this month yet. Click + to add an entry.')}</span>
          </div>
        )}

        {viewMode === 'weekly' ? (
          renderWeeklyGrid()
        ) : viewMode === 'list' ? (
          renderMobileListView()
        ) : (
          <>
            <div className="cal-grid-desktop">
              <div className="cal-grid">
                {renderMonthlyGrid()}
              </div>

              {weeklySummary.length > 0 && (
                <div className="cal-weekly-summary-strip" aria-label="Weekly net summary">
                  <span className="cal-wss-title">{tr('weekly_summary', 'Weekly Summary · Breakdown')}:</span>
                  <div className="cal-wss-items">
                    {weeklySummary.map((w) => (
                      <div key={w.weekNum} className={`cal-wss-pill cal-week-pill ${w.count === 0 ? 'empty-week' : ''}`}>
                        <span className="cal-wss-num">W{w.weekNum}</span>
                        <span className="cal-wss-dates">({w.dateRange})</span>
                        {w.count > 0 ? (
                          <span className={`cal-wss-net ${w.net >= 0 ? 'text-success' : 'text-danger'}`}>
                            {w.net >= 0 ? '+' : ''}{fmt(w.net)}
                          </span>
                        ) : (
                          <span className="cal-wss-net text-muted">—</span>
                        )}
                      </div>
                    ))}
                    <div className="cal-wss-pill cal-wss-total-pill cal-month-net-pill">
                      <span className="cal-wss-num">{tr('total', 'Month Net')}</span>
                      <span className={`cal-wss-net ${monthlyNet >= 0 ? 'text-success' : 'text-danger'}`}>
                        {monthlyNet >= 0 ? '+' : ''}{fmt(monthlyNet)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="cal-list-mobile-fallback">
              {renderMobileListView()}
            </div>
          </>
        )}

        <div className="cal-legend-bar" aria-label="Calendar color legend">
          <div className="cal-legend-item">
            <span className="cal-legend-dot pos" aria-hidden="true" />
            <span>{tr('legend_net_pos', 'Net positive')}</span>
          </div>
          <div className="cal-legend-item">
            <span className="cal-legend-dot neg" aria-hidden="true" />
            <span>{tr('legend_net_neg', 'Net negative')}</span>
          </div>
          <div className="cal-legend-item">
            <span className="cal-legend-dot neutral" aria-hidden="true" />
            <span>{tr('legend_no_activity', 'No activity')}</span>
          </div>
          {hasAnyRecurringThisMonth && (
            <div className="cal-legend-item">
              <Repeat size={11} className="cal-legend-icon" aria-hidden="true" />
              <span>{tr('legend_recurring', 'Recurring bill')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Slide-Out Day Details Drawer */}
      {createPortal(
        <AnimatePresence>
          {selectedDate && selectedDayData && (
            <motion.div
              key="cal-drawer-overlay"
              className="cal-drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeDayDetails}
            >
              <motion.div
                ref={dayModalRef}
                key="cal-day-drawer"
                className="cal-day-drawer glass"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={tr('day_drawer', 'Day Details')}
              >
                <div className="cdd-header">
                  <div>
                    <h3>{formatFullDate(selectedDate, locale)}</h3>
                    <div className="cdd-sub">
                      {selectedDayData.items.length} {tr('records', 'record(s)')}
                      {scheduledBills[selectedDate]?.length > 0 && ` · ${scheduledBills[selectedDate].length} upcoming bill(s)`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ibtn"
                    onClick={closeDayDetails}
                    aria-label={tr('close', 'Close')}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="cdd-summary-strip">
                  <div className="cdd-stat">
                    <span className="lbl">{tr('inflow', 'Inflow')}</span>
                    <span className="val text-success">+{fmt(selectedDayData.income)}</span>
                  </div>
                  <div className="cdd-stat">
                    <span className="lbl">{tr('outflow', 'Outflow')}</span>
                    <span className="val text-danger">-{fmt(selectedDayData.expense)}</span>
                  </div>
                  <div className="cdd-stat">
                    <span className="lbl">{tr('net', 'Net')}</span>
                    <span className={`val ${selectedDayData.net >= 0 ? 'text-success' : 'text-danger'}`}>
                      {selectedDayData.net >= 0 ? '+' : ''}{fmt(selectedDayData.net)}
                    </span>
                  </div>
                </div>

                {dayCategoryTotals.length > 0 && (
                  <div style={{ padding: '0.75rem 1.5rem 0', display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {dayCategoryTotals.map(({ category, income, expense }) => (
                      <span
                        key={category}
                        className="badge"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--glass-border)',
                          padding: '3px 9px',
                          borderRadius: 12,
                          fontSize: '0.74rem',
                        }}
                      >
                        {category}
                        {income > 0 && <> · <span className="text-success">+{fmt(income)}</span></>}
                        {expense > 0 && <> · <span className="text-danger">-{fmt(expense)}</span></>}
                      </span>
                    ))}
                  </div>
                )}

                {/* Subscriptions scheduled on this date */}
                {scheduledBills[selectedDate]?.length > 0 && (
                  <div style={{ padding: '0.75rem 1.5rem 0' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#a78bfa', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Repeat size={12} /> {tr('scheduled_bill', 'Upcoming Recurring Bill')}:
                    </div>
                    {scheduledBills[selectedDate].map((sub, sIdx) => (
                      <div
                        key={`sched-item-${sIdx}`}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: 'rgba(139, 92, 246, 0.10)',
                          border: '1px dashed rgba(139, 92, 246, 0.35)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 6,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#a78bfa' }}>{sub.name}</span>
                        <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--danger)' }}>-{fmt(sub.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {selectedDayData.items.length > 0 && (
                  <div style={{ padding: '0.75rem 1.5rem 0', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <Filter size={13} style={{ opacity: 0.6 }} />
                    {[
                      { id: 'all', label: tr('all', 'All') },
                      { id: 'income', label: tr('income', 'Income') },
                      { id: 'expense', label: tr('expense', 'Expense') },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className={`btn-sm ${dayFilterType === id ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.72rem', padding: '3px 9px' }}
                        onClick={() => setDayFilterType(id)}
                        aria-pressed={dayFilterType === id}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="cdd-content">
                  {filteredDayItems.length === 0 ? (
                    <div className="glass empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <Wallet size={38} style={{ color: 'var(--text-muted)', margin: '0 auto 10px', opacity: 0.4 }} />
                      <h3 style={{ color: 'var(--text-secondary)', marginBottom: 4, fontSize: '0.96rem' }}>
                        {tr('no_transactions', 'No Transactions')}
                      </h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {tr('no_transactions_filter', 'No transactions match the current filter.')}
                      </p>
                    </div>
                  ) : (
                    filteredDayItems.map((tx, idx) => (
                      <div
                        key={tx.id || tx._id || `dtx-${idx}`}
                        className="day-tx-row"
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '0.65rem 0', borderBottom: '1px solid var(--glass-border)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                          <div className={`day-tx-badge ${tx.type}`}>
                            {tx.type === 'income' ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: '0.88rem' }}>
                              {tx.merchant || tx.category || tr('uncategorized', 'Uncategorized')}
                            </p>
                            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>
                              {tx.merchant && tx.category ? `${tx.category}${tx.note ? ` · ${tx.note}` : ''}` : (tx.note || tr('no_note', 'No note'))}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <span
                            style={{
                              fontWeight: 700, fontSize: '0.90rem',
                              fontVariantNumeric: 'tabular-nums',
                              color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)',
                            }}
                          >
                            {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => openEditForTransaction(tx, e)}
                            className="ibtn"
                            aria-label={tr('edit_transaction', 'Edit transaction')}
                            style={{ padding: 3 }}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(tx)}
                            className="ibtn"
                            aria-label={tr('delete_transaction', 'Delete transaction')}
                            style={{ padding: 3, color: 'var(--danger)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="cdd-footer">
                  <button type="button" className="btn-secondary" onClick={closeDayDetails}>
                    {tr('close', 'Close')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => openAddForDate(selectedDate)}
                  >
                    <Plus size={15} /> {tr('add_for_date', 'Add For This Date')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {isAdding && (
            <TransactionForm
              key="add-modal"
              isOpen
              initialData={addInitialData}
              onClose={closeAdd}
              onSubmit={handleAddSubmit}
            />
          )}

          {isEditing && editingTx && (
            <TransactionForm
              key={`edit-modal-${editingTx.id || editingTx._id || 'tx'}`}
              isOpen
              initialData={editingTx}
              onClose={closeEdit}
              onSubmit={handleEditSubmit}
            />
          )}

          {pendingDelete && (
            <motion.div
              key="delete-modal"
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={cancelDelete}
            >
              <motion.div
                ref={deleteModalRef}
                className="modal-box glass"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={tr('delete_transaction_title', 'Delete transaction')}
                style={{ maxWidth: 460 }}
              >
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <AlertTriangle size={20} color="var(--danger-color, #ef4444)" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                    {tr('delete_transaction_title', 'Delete transaction')}
                  </h3>
                </div>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {tr('delete_transaction_confirm', 'Are you sure you want to delete this')}{' '}
                  <strong>{pendingDelete.type}</strong>{' '}
                  {tr('of', 'of')} <strong>{fmt(pendingDelete.amount)}</strong>?
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
                  {tr('cannot_be_undone', 'This action cannot be undone.')}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn-secondary" onClick={cancelDelete}>
                    {tr('cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ background: 'var(--danger-color, #ef4444)' }}
                    onClick={confirmDelete}
                  >
                    {tr('delete', 'Delete')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
