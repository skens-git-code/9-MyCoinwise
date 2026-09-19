import React, {
  useContext, useMemo, useState, useRef, useCallback, useEffect, memo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppContext } from '../contexts/AppContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import {
  TrendingUp, TrendingDown, CheckCircle2,
  Calendar, Download, Share2, Sparkles, ShieldAlert,
  ArrowUpRight, ArrowDownRight, X, Filter, RotateCcw, Loader2,
  ChevronDown, Check,
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { dedupeTransactions } from '../utils/transactionIntegrity';

/* ============================================================
 * Constants
 * ============================================================ */
const PIE_COLORS_LIGHT = ['#059669', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#f97316', '#14b8a6'];
const PIE_COLORS_DARK  = ['#34d399', '#22d3ee', '#fbbf24', '#6ee7b7', '#f87171', '#f472b6', '#a78bfa', '#60a5fa', '#fb923c', '#5eead4'];
const CATEGORY_COLORS_LIGHT = ['#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#ef4444', '#14b8a6'];
const CATEGORY_COLORS_DARK  = ['#34d399', '#22d3ee', '#fbbf24', '#a78bfa', '#f472b6', '#60a5fa', '#f87171', '#5eead4'];

const REVIEWED_KEY = 'mycoinwise-reviewed-anomalies';
const MAX_MONTHS_MONTHLY_CHART = 12;
const MAX_MONTHS_EVOLUTION = 6;
const ANOMALY_MIN_SAMPLES = 4;
const ANOMALY_SIGMA = 2;
const ANOMALY_MIN_AMOUNT = 50;
const ANOMALY_WINDOW_DAYS = 180; // only consider recent transactions

/** Locale map aligned with the rest of the app (Calendar page uses the same). */
const LOCALE_MAP = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
  bgc: 'hi-IN',
  kn: 'kn-IN',
};
const resolveLocale = (lang) => LOCALE_MAP[lang] || 'en-IN';

/** Robust dark-theme detection. */
const DARK_THEMES = new Set(['amoled', 'dark', 'midnight', 'black']);
const isDarkTheme = (theme) => DARK_THEMES.has(String(theme || '').toLowerCase());

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);
  return reduced;
};

/* ============================================================
 * Utilities
 * ============================================================ */

const isValidDate = (value) => {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(d.getTime());
};

const validateTransaction = (t) => {
  if (!t || typeof t !== 'object') return false;
  if (!isValidDate(t.date)) return false;
  if (!t.type || (t.type !== 'income' && t.type !== 'expense')) return false;
  const amt = Number(t.amount);
  if (t.amount === undefined || t.amount === null) return false;
  if (!Number.isFinite(amt) || amt < 0) return false;
  return true;
};

const safeParseAmount = (amount) => {
  const num = Number(amount);
  return Number.isFinite(num) && num >= 0 ? num : 0;
};

const canonicalCategoryName = (value) => {
  const text = String(value || '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Other';
};

/** Stable hash so the same anomaly keeps the same id across renders. */
const stableHash = (str) => {
  let h = 0;
  if (!str) return '0';
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
};

const anomalyId = (tx, category) =>
  stableHash(
    `${category}|${tx.date || ''}|${tx.amount || ''}|${tx.note || ''}|${tx.account_id || tx.accountId || ''}`
  );

/** Proper CSV field escape + injection prevention. */
const escapeCsvField = (raw) => {
  const str = raw == null ? '' : String(raw);
  const needsPrefix = /^[=+\-@\t\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  const prefixed = needsPrefix ? `'${escaped}` : escaped;
  const needsQuotes = needsPrefix || /[",\n\r\t]/.test(prefixed);
  return needsQuotes ? `"${prefixed}"` : prefixed;
};

/** Structured delta — no magic strings, no NaN leaks. */
const computeDelta = (cur, prev) => {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) {
    return { display: 'N/A', direction: 'flat', valid: false, value: null };
  }
  if (prev === 0 && cur === 0) {
    return { display: '0%', direction: 'flat', valid: true, value: 0 };
  }
  if (prev === 0) {
    return {
      display: cur > 0 ? 'New' : '-New',
      direction: cur > 0 ? 'up' : 'down',
      valid: false,
      value: null,
    };
  }
  const raw = ((cur - prev) / Math.abs(prev)) * 100;
  if (!Number.isFinite(raw)) {
    return { display: 'N/A', direction: 'flat', valid: false, value: null };
  }
  const capped = Math.max(-9999, Math.min(9999, raw));
  const prefix = capped >= 0 ? '+' : '';
  return {
    display: `${prefix}${capped.toFixed(1)}%`,
    direction: capped > 0.05 ? 'up' : capped < -0.05 ? 'down' : 'flat',
    valid: true,
    value: capped,
  };
};

/** Local YYYY-MM key — no UTC drift. */
const toMonthKey = (dateInput) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Local start-of-month timestamp. */
const monthStartTimestamp = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).getTime();
};

const startOfDay = (input) => {
  if (!input) return null;
  const d = input instanceof Date ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (input) => {
  if (!input) return null;
  const d = input instanceof Date ? new Date(input) : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Localised month label. */
const formatMonthLabel = (key, locale) => {
  const [year, month] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(locale || 'en-IN', { month: 'short', year: 'numeric' });
};

/** Localised short date (e.g. 19 Sep). */
const formatShortDate = (input, locale) => {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale || 'en-IN', { day: 'numeric', month: 'short' });
};

/** Localised full date (e.g. 19 Sep 2026). */
const formatFullDate = (input, locale) => {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale || 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Fill every month between min and max, inclusive. */
const enumerateMonths = (minKey, maxKey) => {
  if (!minKey || !maxKey) return [];
  const [minY, minM] = minKey.split('-').map(Number);
  const [maxY, maxM] = maxKey.split('-').map(Number);
  const out = [];
  let y = minY;
  let m = minM;
  while (y < maxY || (y === maxY && m <= maxM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
};

/* ============================================================
 * Custom Tooltip (memoized)
 * ============================================================ */
const CustomTooltip = memo(({ active, payload, label, isDark, fmt }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      className="custom-tooltip glass"
      style={{
        backgroundColor: isDark ? 'rgba(10,10,26,0.95)' : 'rgba(255,255,255,0.95)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(5,150,105,0.2)'}`,
        borderRadius: 12,
        padding: '10px 14px',
        color: isDark ? '#f8fafc' : '#0f172a',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        fontSize: '0.82rem',
      }}
    >
      <p style={{ margin: '0 0 6px 0', fontWeight: 'bold' }}>{label}</p>
      {payload.map((entry, index) => (
        <p key={`${entry.dataKey}-${index}`} style={{ margin: '3px 0', color: entry.color, fontWeight: 600 }}>
          {entry.name}: {typeof fmt === 'function' ? fmt(entry.value) : String(entry.value)}
        </p>
      ))}
    </div>
  );
});

/* ============================================================
 * Drill‑Down Modal
 * ============================================================ */
const DrillDownModal = memo(({ isOpen, onClose, title, transactions, fmt, locale }) => {
  // Escape to close — depends on stable `onClose` from parent.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const total = transactions.reduce((sum, t) => sum + safeParseAmount(t.amount), 0);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Transaction details'}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-color)', maxWidth: 600, width: '90%',
          maxHeight: '80vh', borderRadius: 16, padding: '1.5rem',
          overflow: 'auto', color: 'var(--text-main)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {transactions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No transactions found.</p>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
              {transactions.length} transaction{transactions.length === 1 ? '' : 's'} · Total: {fmt(total)}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {transactions.map((t, idx) => (
                <li
                  key={t.id || t._id || `${t.date}-${idx}`}
                  style={{
                    padding: '0.55rem 0',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      {t.category || t.note || 'Uncategorized'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {formatFullDate(t.date, locale)}
                      {t.note && t.category ? ` · ${t.note}` : ''}
                    </span>
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      color: t.type === 'income' ? 'var(--success-color, #10b981)' : 'var(--danger-color, #ef4444)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.type === 'income' ? '+' : '-'}{fmt(safeParseAmount(t.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
});
DrillDownModal.displayName = 'DrillDownModal';

/* ============================================================
 * Main Component
 * ============================================================ */
export default function Analytics() {
  /* Original context destructuring without loading:
  const {
    transactions = [],
    theme,
    fmt: contextFmt,
    user,
    lang,
    currency,
    currencyInfo,
  } = useContext(AppContext);
  // Issue: loading was not destructured, preventing the component from showing a loading skeleton while fetches are in-flight.
  */
  const {
    transactions = [],
    theme,
    fmt: contextFmt,
    user,
    lang,
    currency,
    currencyInfo,
    loading,
  } = useContext(AppContext);
  const { showToast } = useToast();

  const prefersReducedMotion = usePrefersReducedMotion();
  const isDark = isDarkTheme(theme);
  const locale = useMemo(() => resolveLocale(lang), [lang]);
  const activeCurrency = currency || user?.currency || 'INR';
  const symbol = currencyInfo?.symbol || '₹';

  const fmt = useCallback(
    (value) => {
      if (contextFmt) {
        try {
          const out = contextFmt(value);
          if (out != null) return out;
        } catch { /* fall through */ }
      }
      if (value === undefined || value === null) return `${symbol}0.00`;
      const num = Number(value);
      if (!Number.isFinite(num)) return `${symbol}0.00`;
      try {
        return new Intl.NumberFormat(locale || 'en-IN', { style: 'currency', currency: activeCurrency }).format(num);
      } catch {
        return `${symbol}${num.toFixed(2)}`;
      }
    },
    [contextFmt, locale, activeCurrency, symbol]
  );

  /* ---------------- State ---------------- */
  const [periodFilter, setPeriodFilter] = useState('month');
  const [chartType, setChartType] = useState('bar');
  const [showAllEvolutionCategories, setShowAllEvolutionCategories] = useState(false);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [drillData, setDrillData] = useState({ isOpen: false, title: '', transactions: [] });
  const [isExportingPng, setIsExportingPng] = useState(false);

  const reviewedStorageKey = useMemo(
    () => (user?.id || user?._id ? `${REVIEWED_KEY}:${user.id || user._id}` : REVIEWED_KEY),
    [user]
  );

  const [reviewedAnomalies, setReviewedAnomalies] = useState(() => {
    try {
      const stored = localStorage.getItem(reviewedStorageKey);
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });

  const chartSectionRef = useRef(null);

  // Reload reviewed anomalies if the storage key changes (e.g. user switch).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(reviewedStorageKey);
      setReviewedAnomalies(new Set(stored ? JSON.parse(stored) : []));
    } catch {
      setReviewedAnomalies(new Set());
    }
  }, [reviewedStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(reviewedStorageKey, JSON.stringify([...reviewedAnomalies]));
    } catch { /* storage may be full or disabled */ }
  }, [reviewedAnomalies, reviewedStorageKey]);

  /* ---------------- Valid transactions ---------------- */
  const validTransactions = useMemo(
    () => dedupeTransactions(Array.isArray(transactions) ? transactions : [])
      .filter(validateTransaction)
      .map((transaction) => ({
        ...transaction,
        category: canonicalCategoryName(transaction.category),
      })),
    [transactions]
  );

  /* ============================================================
   * Period Date Range
   * ============================================================ */
  const periodRange = useMemo(() => {
    const now = new Date();
    let currentStart = null, currentEnd = null, prevStart = null, prevEnd = null;

    if (periodFilter === 'all') {
      currentStart = new Date(0);
      currentEnd = new Date();
    } else if (periodFilter === 'month') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (periodFilter === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      currentStart = new Date(now.getFullYear(), q * 3, 1);
      currentEnd = new Date(now.getFullYear(), (q + 1) * 3, 0, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
      prevEnd = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999);
    } else if (periodFilter === 'year') {
      currentStart = new Date(now.getFullYear(), 0, 1);
      currentEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear() - 1, 0, 1);
      prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    } else if (periodFilter === 'custom') {
      const s = startOfDay(customRange.start);
      const e = endOfDay(customRange.end);
      if (s && e && s <= e) {
        currentStart = s;
        currentEnd = e;
      } else {
        // Invalid custom range → treat as current month
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      }
    } else {
      currentStart = new Date(0);
      currentEnd = new Date();
    }
    return { currentStart, currentEnd, prevStart, prevEnd };
  }, [periodFilter, customRange]);

  /* ============================================================
   * Period Comparison
   * ============================================================ */
  const comparisonMetrics = useMemo(() => {
    const { currentStart, currentEnd, prevStart, prevEnd } = periodRange;

    const filterTxs = (start, end) => {
      if (!start || !end) return [];
      return validTransactions.filter((t) => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      });
    };

    const sumTxs = (list) => {
      let inc = 0, exp = 0;
      for (const t of list) {
        const amt = safeParseAmount(t.amount);
        if (t.type === 'income') inc += amt;
        else if (t.type === 'expense') exp += amt;
      }
      return { income: inc, expense: exp, net: inc - exp, count: list.length };
    };

    const currentTxs = filterTxs(currentStart, currentEnd);
    const prevTxs = prevStart && prevEnd ? filterTxs(prevStart, prevEnd) : [];

    const curSum = sumTxs(currentTxs);
    const prevSum = sumTxs(prevTxs);

    const hasComparison = Boolean(prevStart && prevEnd);

    const incomeDelta = hasComparison ? computeDelta(curSum.income, prevSum.income) : { display: 'N/A', direction: 'flat', valid: false, value: null };
    const expenseDelta = hasComparison ? computeDelta(curSum.expense, prevSum.expense) : { display: 'N/A', direction: 'flat', valid: false, value: null };
    const netDelta = hasComparison ? computeDelta(curSum.net, prevSum.net) : { display: 'N/A', direction: 'flat', valid: false, value: null };

    const savingsRate = curSum.income > 0 ? (curSum.net / curSum.income) * 100 : null;

    return {
      current: curSum,
      previous: prevSum,
      incomeDelta,
      expenseDelta,
      netDelta,
      savingsRate,
      hasComparison,
    };
  }, [validTransactions, periodRange]);

  /* ============================================================
   * Monthly Aggregates
   * ============================================================ */
  const monthlyData = useMemo(() => {
    const monthMap = new Map();
    validTransactions.forEach((t) => {
      const key = toMonthKey(t.date);
      if (!key) return;
      if (!monthMap.has(key)) {
        monthMap.set(key, { name: key, income: 0, expense: 0 });
      }
      const entry = monthMap.get(key);
      const amt = safeParseAmount(t.amount);
      if (t.type === 'income') entry.income += amt;
      else entry.expense += amt;
    });

    return Array.from(monthMap.values())
      .map((m) => ({
        ...m,
        savings: Number((m.income - m.expense).toFixed(2)),
        timestamp: monthStartTimestamp(m.name),
        displayName: formatMonthLabel(m.name, locale),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_MONTHS_MONTHLY_CHART);
  }, [validTransactions, locale]);

  /* ============================================================
   * Category Evolution — fills gaps, drops zero-total categories
   * ============================================================ */
  const categoryEvolution = useMemo(() => {
    const catTotals = new Map();
    validTransactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const c = t.category || 'Other';
        catTotals.set(c, (catTotals.get(c) || 0) + safeParseAmount(t.amount));
      });

    const sortedCats = Array.from(catTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);

    // Pick top N (5 or 8)
    const limit = showAllEvolutionCategories ? 8 : 5;
    const activeCats = sortedCats.slice(0, limit);

    if (activeCats.length === 0) {
      return { data: [], categories: [] };
    }

    // Determine full month range
    const monthKeys = new Set();
    validTransactions.forEach((t) => {
      if (t.type !== 'expense') return;
      const key = toMonthKey(t.date);
      if (key) monthKeys.add(key);
    });
    if (monthKeys.size === 0) {
      return { data: [], categories: activeCats };
    }

    const sortedMonthKeys = Array.from(monthKeys).sort();
    const allMonths = enumerateMonths(sortedMonthKeys[0], sortedMonthKeys[sortedMonthKeys.length - 1]);

    // Fill every month with zeros for every category
    const monthData = new Map();
    allMonths.forEach((key) => {
      const row = {
        name: key,
        timestamp: monthStartTimestamp(key),
        displayName: formatMonthLabel(key, locale),
      };
      activeCats.forEach((c) => { row[c] = 0; });
      monthData.set(key, row);
    });

    // Populate
    validTransactions.forEach((t) => {
      if (t.type !== 'expense') return;
      const cat = t.category || 'Other';
      if (!activeCats.includes(cat)) return;
      const key = toMonthKey(t.date);
      if (!key) return;
      const row = monthData.get(key);
      if (row) row[cat] += safeParseAmount(t.amount);
    });

    // Keep only the last MAX_MONTHS_EVOLUTION months
    const data = Array.from(monthData.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_MONTHS_EVOLUTION);

    // Drop categories whose total in the visible window is 0
    const visibleCats = activeCats.filter((cat) =>
      data.some((row) => Number(row[cat]) > 0)
    );

    // Trim leading all-zero months so the chart doesn't render a flat zero line followed by a spike
    const firstActiveIndex = data.findIndex((row) =>
      visibleCats.some((c) => Number(row[c]) > 0)
    );
    const finalData = firstActiveIndex > 0 ? data.slice(firstActiveIndex) : data;

    // If fewer than two months have data, hide the chart to prevent floating single dot
    if (finalData.length < 2) {
      return { data: [], categories: [] };
    }

    return { data: finalData, categories: visibleCats };
  }, [validTransactions, showAllEvolutionCategories, locale]);

  /* ============================================================
   * Day of Week
   * ============================================================ */
  const dayOfWeekData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => ({
      name, expense: 0, income: 0, count: 0,
    }));
    let weekendExp = 0, weekdayExp = 0;

    validTransactions.forEach((t) => {
      const d = new Date(t.date).getDay();
      const amt = safeParseAmount(t.amount);
      if (t.type === 'expense') {
        days[d].expense += amt;
        if (d === 0 || d === 6) weekendExp += amt;
        else weekdayExp += amt;
      } else {
        days[d].income += amt;
      }
      days[d].count += 1;
    });

    const totalExp = weekendExp + weekdayExp;
    const weekendPct = totalExp > 0 ? Math.round((weekendExp / totalExp) * 100) : 0;
    return { days, weekendExp, weekdayExp, weekendPct };
  }, [validTransactions]);

  /* ============================================================
   * Anomaly Detection — recent window, stable IDs
   * ============================================================ */
  const anomalies = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ANOMALY_WINDOW_DAYS);

    const catStats = new Map();
    validTransactions
      .filter((t) => t.type === 'expense')
      .filter((t) => new Date(t.date) >= cutoff)
      .forEach((t) => {
        const cat = t.category || 'Other';
        if (!catStats.has(cat)) catStats.set(cat, []);
        catStats.get(cat).push({ tx: t, amount: safeParseAmount(t.amount) });
      });

    const flagged = [];
    catStats.forEach((list, cat) => {
      if (list.length < ANOMALY_MIN_SAMPLES) return;
      const mean = list.reduce((a, c) => a + c.amount, 0) / list.length;
      const variance = list.reduce((a, c) => a + (c.amount - mean) ** 2, 0) / list.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev <= 0) return;

      list.forEach(({ tx, amount }) => {
        if (amount > mean + ANOMALY_SIGMA * stdDev && amount > ANOMALY_MIN_AMOUNT) {
          flagged.push({
            id: anomalyId(tx, cat),
            tx,
            category: cat,
            mean,
            stdDev,
            ratio: (amount / (mean || 1)).toFixed(1),
          });
        }
      });
    });

    return flagged.sort((a, b) => new Date(b.tx.date) - new Date(a.tx.date));
  }, [validTransactions]);

  const activeAnomalies = useMemo(
    () => anomalies.filter((a) => !reviewedAnomalies.has(a.id)),
    [anomalies, reviewedAnomalies]
  );

  /* ============================================================
   * Expense Categories (scoped by periodFilter)
   * ============================================================ */
  const expenseCategories = useMemo(() => {
    const { currentStart, currentEnd } = periodRange;
    const map = new Map();
    validTransactions
      .filter((t) => {
        if (t.type !== 'expense') return false;
        const d = new Date(t.date);
        return d >= currentStart && d <= currentEnd;
      })
      .forEach((t) => {
        const cat = t.category || 'Other';
        map.set(cat, (map.get(cat) || 0) + safeParseAmount(t.amount));
      });
    const total = Array.from(map.values()).reduce((a, c) => a + c, 0);
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        value: Number(value.toFixed(2)),
        percentage: total > 0 ? ((value / total) * 100).toFixed(1) : '0.0',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [validTransactions, periodRange]);

  /* ============================================================
   * AI Insights — NaN-safe
   * ============================================================ */
  const generatedInsights = useMemo(() => {
    const cards = [];

    const expDelta = comparisonMetrics.expenseDelta;
    if (expDelta.valid && expDelta.value != null) {
      if (expDelta.value > 15) {
        cards.push({
          type: 'warning',
          title: 'Spending Acceleration',
          message: `Your spending this period is ${expDelta.value.toFixed(0)}% higher than the previous period. Consider reviewing discretionary expenses.`,
        });
      } else if (expDelta.value < -10) {
        cards.push({
          type: 'success',
          title: 'Spending Discipline',
          message: `Great job! Your spending is down by ${Math.abs(expDelta.value).toFixed(0)}% compared to last period.`,
        });
      }
    }

    if (dayOfWeekData.weekendPct >= 40) {
      cards.push({
        type: 'info',
        title: 'Weekend Outflow Concentration',
        message: `${dayOfWeekData.weekendPct}% of your total expenses occur on Saturdays & Sundays.`,
      });
    }

    if (expenseCategories.length > 0 && Number(expenseCategories[0].percentage) > 35) {
      cards.push({
        type: 'info',
        title: `Heavy ${expenseCategories[0].name} Concentration`,
        message: `${expenseCategories[0].name} accounts for ${expenseCategories[0].percentage}% of total expenses. Diversifying or budgeting this area will boost net savings.`,
      });
    }

    if (
      comparisonMetrics.savingsRate != null &&
      comparisonMetrics.savingsRate < 10 &&
      comparisonMetrics.savingsRate >= 0
    ) {
      cards.push({
        type: 'warning',
        title: 'Low Savings Rate',
        message: `Your savings rate is only ${comparisonMetrics.savingsRate.toFixed(1)}%. Consider cutting non‑essential expenses.`,
      });
    }

    if (cards.length === 0) {
      cards.push({
        type: 'success',
        title: 'Balanced Financial Trajectory',
        message: 'Your income-to-expense distribution remains healthy and within normal variance.',
      });
    }

    return cards;
  }, [comparisonMetrics, dayOfWeekData, expenseCategories]);

  /* ============================================================
   * Handlers
   * ============================================================ */

  const handleMarkAnomalyReviewed = useCallback((id) => {
    setReviewedAnomalies((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast('success', 'Transaction marked as reviewed.');
  }, [showToast]);

  const handleDismissAnomaly = useCallback((id) => {
    setReviewedAnomalies((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast('success', 'Anomaly dismissed.');
  }, [showToast]);

  const handleResetReviewedAnomalies = useCallback(() => {
    if (reviewedAnomalies.size === 0) return;
    setReviewedAnomalies(new Set());
    showToast('success', 'Reviewed anomalies cleared.');
  }, [reviewedAnomalies, showToast]);

  const exportChartAsImage = useCallback(async () => {
    if (isExportingPng) return;
    setIsExportingPng(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      if (!chartSectionRef.current) return;
      const canvas = await html2canvas(chartSectionRef.current, {
        scale: 2,
        backgroundColor: isDark ? '#090d16' : '#ffffff',
        useCORS: true,
      });
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      const now = new Date();
      const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      link.download = `mycoinwise_analytics_${dateStamp}.png`;
      link.click();
      showToast('success', 'Chart image downloaded as PNG!');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to export chart image.');
    } finally {
      setIsExportingPng(false);
    }
  }, [isDark, isExportingPng, showToast]);

  const exportCSV = useCallback(() => {
    const headers = ['Date', 'Type', 'Category', 'Amount', 'Note'];
    const rows = validTransactions.map((t) => [
      t.date,
      t.type,
      t.category || 'Other',
      safeParseAmount(t.amount).toFixed(2),
      t.note || '',
    ]);
    const csvContent = [
      headers.map(escapeCsvField).join(','),
      ...rows.map((r) => r.map(escapeCsvField).join(',')),
    ].join('\n');

    // BOM helps Excel detect UTF-8. Some strict parsers include it in the first header.
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const now = new Date();
    const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    link.download = `mycoinwise_data_${dateStamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'CSV exported successfully!');
  }, [validTransactions, showToast]);

  const handleShareSummary = useCallback(async () => {
    const savingsRateText =
      comparisonMetrics.savingsRate != null
        ? `${comparisonMetrics.savingsRate.toFixed(1)}%`
        : 'N/A';

    const text = `📊 MyCoinwise Financial Report (${periodFilter.toUpperCase()})
• Inflow: ${fmt(comparisonMetrics.current.income)}
• Outflow: ${fmt(comparisonMetrics.current.expense)}
• Net Savings: ${fmt(comparisonMetrics.current.net)}
• Savings Rate: ${savingsRateText}
• Top Category: ${expenseCategories[0]?.name || 'N/A'} (${expenseCategories[0]?.percentage || 0}%)
• Period Expense Shift: ${comparisonMetrics.expenseDelta.display}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast('success', 'Financial summary copied to clipboard!');
      } else {
        showToast('error', 'Clipboard not available.');
      }
    } catch {
      showToast('error', 'Failed to copy summary.');
    }
  }, [periodFilter, fmt, comparisonMetrics, expenseCategories, showToast]);

  /* ============================================================
   * Drill‑down handlers (stable callbacks)
   * ============================================================ */

  const openMonthDrillDown = useCallback((monthKey) => {
    const [y, m] = monthKey.split('-').map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    const filtered = validTransactions.filter((t) => {
      const d = new Date(t.date);
      return d >= start && d <= end;
    });
    if (filtered.length === 0) {
      showToast('info', 'No transactions found for this month.');
      return;
    }
    setDrillData({
      isOpen: true,
      title: `Transactions for ${formatMonthLabel(monthKey, locale)}`,
      transactions: filtered,
    });
  }, [validTransactions, locale, showToast]);

  const openCategoryDrillDown = useCallback((category) => {
    const filtered = validTransactions.filter(
      (t) => (t.category || 'Other') === category && t.type === 'expense'
    );
    if (filtered.length === 0) {
      showToast('info', 'No expenses found for this category.');
      return;
    }
    setDrillData({
      isOpen: true,
      title: `Expenses in "${category}"`,
      transactions: filtered,
    });
  }, [validTransactions, showToast]);

  const closeDrill = useCallback(() => {
    setDrillData({ isOpen: false, title: '', transactions: [] });
  }, []);

  const handleBarClick = useCallback((data) => {
    const monthKey = data?.payload?.name;
    if (monthKey) openMonthDrillDown(monthKey);
  }, [openMonthDrillDown]);

  const handlePieClick = useCallback((data) => {
    const category = data?.name ?? data?.payload?.name;
    if (category) openCategoryDrillDown(category);
  }, [openCategoryDrillDown]);

  /* ============================================================
   * Custom Range
   * ============================================================ */
  const applyCustomRange = useCallback(() => {
    const { start, end } = customRange;
    if (!start || !end) {
      showToast('error', 'Please select both start and end dates.');
      return;
    }
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      showToast('error', 'Invalid date range.');
      return;
    }
    if (s > e) {
      showToast('error', 'Start date must be on or before end date.');
      return;
    }
    setPeriodFilter('custom');
    setShowCustomRange(false);
    showToast('success', 'Custom range applied.');
  }, [customRange, showToast]);

  const clearCustomRange = useCallback(() => {
    setShowCustomRange(false);
    setCustomRange({ start: '', end: '' });
    setPeriodFilter('month');
  }, []);

  /* ============================================================
   * Theme colours
   * ============================================================ */
  const pieColors = isDark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;
  const categoryColors = isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;

  /* ============================================================
   * Loading / Empty
   * ============================================================ */
  /* Original empty check without loading state check:
  if (validTransactions.length === 0) {
    return (
      <div className="shared-page analytics-page-wrap">
  // Issue: When transactions were in-flight, the UI prematurely rendered "No data yet", causing layout shift and flickering.
  */
  if (loading && validTransactions.length === 0) {
    return (
      <div className="shared-page analytics-page-wrap">
        <div className="spage-header">
          <div className="spage-title">
            <h2>Analytics & Intelligence</h2>
            <span className="badge">AI Insights</span>
          </div>
        </div>
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Loader2 className="spin" size={36} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading analytics…</p>
        </div>
      </div>
    );
  }

  if (validTransactions.length === 0) {
    return (
      <div className="shared-page analytics-page-wrap">
        <div className="spage-header">
          <div className="spage-title">
            <h2>Analytics & Intelligence</h2>
            <span className="badge">AI Insights</span>
          </div>
        </div>
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Sparkles size={48} style={{ opacity: 0.4, marginBottom: '1rem' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>No data yet</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            Add some transactions to unlock analytics and AI insights.
          </p>
        </div>
      </div>
    );
  }

  /* ============================================================
   * Render
   * ============================================================ */
  return (
    <div className="shared-page analytics-page-wrap">
      <div className="spage-header">
        <div className="spage-title">
          <h2>Analytics & Intelligence</h2>
          <span className="badge">AI Insights</span>
        </div>
        <div className="analytics-actions">
          <button
            onClick={exportChartAsImage}
            className="btn-secondary"
            disabled={isExportingPng}
            title="Download PNG of analytics charts"
          >
            {isExportingPng ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
            {isExportingPng ? 'Exporting…' : 'Export PNG'}
          </button>
          <button onClick={exportCSV} className="btn-secondary" title="Export data as CSV">
            <Download size={15} /> CSV
          </button>
          <button onClick={handleShareSummary} className="btn-primary" title="Copy shareable summary report">
            <Share2 size={15} /> Share Summary
          </button>
        </div>
      </div>

      {/* Period Selector — Clean Standard Dropdown */}
      <div className="analytics-period-bar glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '8px 16px', position: 'relative', width: 'auto', marginBottom: 14 }}>
        <span className="apb-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>
          <Calendar size={14} /> Compare Period:
        </span>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn-secondary period-dropdown-trigger"
            onClick={() => setIsPeriodDropdownOpen((v) => !v)}
            aria-expanded={isPeriodDropdownOpen}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>
              {periodFilter === 'month' && 'This Month vs Last'}
              {periodFilter === 'quarter' && 'This Quarter vs Last'}
              {periodFilter === 'year' && 'Year over Year'}
              {periodFilter === 'all' && 'All Time'}
              {periodFilter === 'custom' && (customRange.start && customRange.end ? `Custom (${customRange.start} → ${customRange.end})` : 'Custom Range')}
            </span>
            <ChevronDown size={14} style={{ opacity: 0.6, transform: isPeriodDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
          </button>

          <AnimatePresence>
            {isPeriodDropdownOpen && (
              <motion.div
                className="glass"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: 200,
                  zIndex: 100,
                  borderRadius: 8,
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  background: 'var(--surface-card, #ffffff)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                {[
                  { id: 'month', label: 'This Month vs Last' },
                  { id: 'quarter', label: 'This Quarter vs Last' },
                  { id: 'year', label: 'Year over Year' },
                  { id: 'all', label: 'All Time' },
                  { id: 'custom', label: 'Custom Range...' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPeriodFilter(p.id);
                      setIsPeriodDropdownOpen(false);
                      setShowCustomRange(p.id === 'custom');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: 6,
                      background: periodFilter === p.id ? 'rgba(var(--brand-primary-rgb), 0.12)' : 'transparent',
                      color: periodFilter === p.id ? 'var(--brand-primary)' : 'var(--text-primary)',
                      fontSize: '0.84rem',
                      fontWeight: periodFilter === p.id ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span>{p.label}</span>
                    {periodFilter === p.id && <Check size={14} style={{ color: 'var(--brand-primary)' }} />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {periodFilter === 'custom' && (
          <button
            type="button"
            className="btn-secondary"
            onClick={clearCustomRange}
            title="Clear custom range"
            aria-label="Clear custom range"
            style={{ padding: '6px 8px', fontSize: '0.8rem' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Custom Range Inputs */}
      <AnimatePresence>
        {showCustomRange && (
          <motion.div
            className="custom-range-panel glass"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              padding: '0.75rem',
              marginTop: '0.5rem',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              flexWrap: 'wrap',
              overflow: 'hidden',
            }}
          >
            <label>
              Start:
              <input
                type="date"
                value={customRange.start}
                max={customRange.end || undefined}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))}
                aria-label="Custom range start date"
              />
            </label>
            <label>
              End:
              <input
                type="date"
                value={customRange.end}
                min={customRange.start || undefined}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))}
                aria-label="Custom range end date"
              />
            </label>
            <button className="btn-secondary" onClick={applyCustomRange}>Apply</button>
            <button className="btn-secondary" onClick={clearCustomRange}>Cancel</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparison Cards */}
      <div className="analytics-comparison-grid">
        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Period Inflow</span>
            {comparisonMetrics.hasComparison && comparisonMetrics.incomeDelta.valid && periodFilter !== 'all' && (
              <span className={`sc-delta ${comparisonMetrics.incomeDelta.direction === 'down' ? 'text-danger' : 'text-success'}`}>
                {comparisonMetrics.incomeDelta.direction === 'up' ? <ArrowUpRight size={14} /> :
                  comparisonMetrics.incomeDelta.direction === 'down' ? <ArrowDownRight size={14} /> : null}
                {comparisonMetrics.incomeDelta.display}
              </span>
            )}
          </div>
          <h3 className="sc-val text-success">+{fmt(comparisonMetrics.current.income)}</h3>
          {comparisonMetrics.hasComparison && (
            <p className="sc-prev">Prev: {fmt(comparisonMetrics.previous.income)}</p>
          )}
        </motion.div>

        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Period Outflow</span>
            {comparisonMetrics.hasComparison && comparisonMetrics.expenseDelta.valid && periodFilter !== 'all' && (
              <span className={`sc-delta ${comparisonMetrics.expenseDelta.direction === 'down' ? 'text-success' : 'text-danger'}`}>
                {comparisonMetrics.expenseDelta.direction === 'up' ? <ArrowUpRight size={14} /> :
                  comparisonMetrics.expenseDelta.direction === 'down' ? <ArrowDownRight size={14} /> : null}
                {comparisonMetrics.expenseDelta.display}
              </span>
            )}
          </div>
          <h3 className="sc-val text-danger">-{fmt(comparisonMetrics.current.expense)}</h3>
          {comparisonMetrics.hasComparison && (
            <p className="sc-prev">Prev: {fmt(comparisonMetrics.previous.expense)}</p>
          )}
        </motion.div>

        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Net Position</span>
            {comparisonMetrics.hasComparison && comparisonMetrics.netDelta.valid && periodFilter !== 'all' && (
              <span className={`sc-delta ${comparisonMetrics.netDelta.direction === 'down' ? 'text-danger' : 'text-success'}`}>
                {comparisonMetrics.netDelta.direction === 'up' ? <ArrowUpRight size={14} /> :
                  comparisonMetrics.netDelta.direction === 'down' ? <ArrowDownRight size={14} /> : null}
                {comparisonMetrics.netDelta.display}
              </span>
            )}
          </div>
          <h3 className={`sc-val ${comparisonMetrics.current.net >= 0 ? 'text-success' : 'text-danger'}`}>
            {comparisonMetrics.current.net >= 0 ? '+' : ''}{fmt(comparisonMetrics.current.net)}
          </h3>
          {comparisonMetrics.hasComparison && (
            <p className="sc-prev">Prev: {fmt(comparisonMetrics.previous.net)}</p>
          )}
        </motion.div>

        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Savings Rate</span>
            <span className={`sc-delta ${
              comparisonMetrics.savingsRate == null
                ? ''
                : comparisonMetrics.savingsRate >= 15 ? 'text-success' : 'text-warning'
            }`}>
              {comparisonMetrics.savingsRate == null
                ? null
                : comparisonMetrics.savingsRate >= 15
                  ? <TrendingUp size={14} />
                  : <TrendingDown size={14} />}
            </span>
          </div>
          <h3 className="sc-val">
            {comparisonMetrics.savingsRate != null ? `${comparisonMetrics.savingsRate.toFixed(1)}%` : '—'}
          </h3>
          {comparisonMetrics.savingsRate != null && comparisonMetrics.savingsRate > 0 && (
            <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'rgba(0,0,0,0.06)', margin: '4px 0 6px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, comparisonMetrics.savingsRate))}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: comparisonMetrics.savingsRate >= 20 ? '#10b981' : '#3b82f6',
                }}
              />
            </div>
          )}
          <p className="sc-prev">
            {comparisonMetrics.savingsRate != null ? 'of income saved' : 'no income in period'}
          </p>
        </motion.div>
      </div>

      {/* AI Insights */}
      <div className="analytics-ai-strip">
        {generatedInsights.map((ins, i) => (
          <div key={`${ins.type}-${i}`} className={`ai-insight-card glass ${ins.type}`}>
            <div className="aic-icon"><Sparkles size={16} /></div>
            <div className="aic-body">
              <strong>{ins.title}</strong>
              <p>{ins.message}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Anomalies */}
      {activeAnomalies.length > 0 && (
        <motion.div
          className="analytics-anomaly-box glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="aab-header">
            <div className="aab-title">
              <ShieldAlert size={18} className="text-warning" />
              <h4>Unusual Spending Detected ({activeAnomalies.length})</h4>
            </div>
            <span className="aab-sub">
              Transactions &gt;{ANOMALY_SIGMA}σ above category average (last {ANOMALY_WINDOW_DAYS} days)
            </span>
          </div>
          <div className="aab-list">
            {activeAnomalies.slice(0, 5).map((a) => (
              <div key={a.id} className="aab-row">
                <div className="aab-info">
                  <span className="aab-cat">{a.category}</span>
                  <span className="aab-date">{formatShortDate(a.tx.date, locale)}</span>
                  {a.tx.note && <span className="aab-note">· {a.tx.note}</span>}
                </div>
                <div className="aab-right">
                  <span className="aab-amount text-danger">{fmt(a.tx.amount)}</span>
                  <span className="aab-ratio badge">({a.ratio}x avg)</span>
                  <button className="aab-action-btn" onClick={() => handleMarkAnomalyReviewed(a.id)}>
                    <CheckCircle2 size={14} /> Review
                  </button>
                  <button className="aab-action-btn" onClick={() => handleDismissAnomaly(a.id)}>
                    <X size={14} /> Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Reviewed Anomalies reset */}
      {reviewedAnomalies.size > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            className="btn-secondary"
            onClick={handleResetReviewedAnomalies}
            title="Bring back all dismissed anomalies"
            style={{ fontSize: '0.78rem' }}
          >
            <RotateCcw size={13} /> Restore {reviewedAnomalies.size} dismissed
          </button>
        </div>
      )}

      {/* Charts Section */}
      <div ref={chartSectionRef} className="analytics-charts">
        {/* Monthly Trajectory */}
        <motion.div className="chart-card glass chart-card-large" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="chart-header">
            <h3>Monthly Financial Trajectory</h3>
            <div className="chart-controls">
              <button onClick={() => setChartType('bar')} className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}>Bar</button>
              <button onClick={() => setChartType('line')} className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}>Line</button>
            </div>
          </div>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240} minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}>
              {chartType === 'bar' ? (
                <BarChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="displayName" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis domain={[0, (dataMax) => Math.ceil(dataMax * 1.15)]} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                  <Legend wrapperStyle={{ paddingTop: 8 }} />
                  <Bar isAnimationActive={!prefersReducedMotion && !loading} dataKey="income" fill={isDark ? '#34d399' : '#10b981'} radius={[4, 4, 0, 0]} name="Inflow" onClick={handleBarClick} cursor="pointer" />
                  <Bar isAnimationActive={!prefersReducedMotion && !loading} dataKey="expense" fill={isDark ? '#f87171' : '#ef4444'} radius={[4, 4, 0, 0]} name="Outflow" onClick={handleBarClick} cursor="pointer" />
                  <Bar isAnimationActive={!prefersReducedMotion && !loading} dataKey="savings" fill={isDark ? '#6ee7b7' : '#059669'} radius={[4, 4, 0, 0]} name="Net Savings" onClick={handleBarClick} cursor="pointer" />
                </BarChart>
              ) : (
                <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="displayName" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis domain={[0, (dataMax) => Math.ceil(dataMax * 1.15)]} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                  <Legend wrapperStyle={{ paddingTop: 8 }} />
                  <Line isAnimationActive={!prefersReducedMotion && !loading} type="monotone" dataKey="income" stroke={isDark ? '#34d399' : '#10b981'} strokeWidth={2.5} dot={{ r: 4 }} name="Inflow" />
                  <Line isAnimationActive={!prefersReducedMotion && !loading} type="monotone" dataKey="expense" stroke={isDark ? '#f87171' : '#ef4444'} strokeWidth={2.5} dot={{ r: 4 }} name="Outflow" />
                  <Line isAnimationActive={!prefersReducedMotion && !loading} type="monotone" dataKey="savings" stroke={isDark ? '#6ee7b7' : '#059669'} strokeWidth={2.5} dot={{ r: 4 }} name="Net Savings" />
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty"><p>No monthly transaction records available.</p></div>
          )}
        </motion.div>

        {/* Category Evolution */}
        <motion.div className="chart-card glass chart-card-large" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="chart-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}>Category Spending Evolution</h3>
              <span className="chart-badge">Historical Trends</span>
            </div>
            {categoryEvolution.data.length > 0 && categoryEvolution.categories.length > 0 && (
              <button
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => setShowAllEvolutionCategories((p) => !p)}
              >
                {showAllEvolutionCategories ? 'Show Top 5' : 'Show All (Top 8)'}
              </button>
            )}
          </div>
          {categoryEvolution.data.length > 0 && categoryEvolution.categories.length > 0 ? (
            <ResponsiveContainer width="100%" height={240} minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}>
              <LineChart data={categoryEvolution.data} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                <XAxis dataKey="displayName" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8 }} />
                {categoryEvolution.categories.map((cat, idx) => (
                  <Line
                    key={cat}
                    isAnimationActive={!prefersReducedMotion && !loading}
                    type="monotone"
                    dataKey={cat}
                    stroke={categoryColors[idx % categoryColors.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty" style={{ minHeight: 64, padding: '16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ margin: 0, color: '#64748B', fontSize: '0.85rem' }}>Not enough category history to render evolution chart.</p>
            </div>
          )}
        </motion.div>

        {/* Day of Week */}
        <motion.div className="chart-card glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="chart-header">
            <h3>Day of Week Outflow</h3>
            <span className="chart-badge">{dayOfWeekData.weekendPct}% Weekend</span>
          </div>
          <ResponsiveContainer width="100%" height={260} minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}>
            <BarChart data={dayOfWeekData.days} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
              <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
              <Bar isAnimationActive={!prefersReducedMotion && !loading} dataKey="expense" fill={isDark ? '#fbbf24' : '#f59e0b'} radius={[6, 6, 0, 0]} name="Daily Expense" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Expense Allocation */}
        <motion.div className="chart-card glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="chart-header">
            <h3>Expense Allocation</h3>
            <span className="chart-badge">
              {periodFilter === 'all'
                ? 'All Time'
                : periodFilter === 'month'
                ? 'This Month'
                : periodFilter === 'quarter'
                ? 'This Quarter'
                : periodFilter === 'year'
                ? 'This Year'
                : 'Selected Period'}
            </span>
          </div>
          {expenseCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={260} minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}>
              <PieChart>
                <Pie
                  isAnimationActive={!prefersReducedMotion && !loading}
                  data={expenseCategories}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  onClick={handlePieClick}
                  cursor="pointer"
                >
                  {expenseCategories.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.name.replace(/\s+/g, '-')}-${index}`}
                      fill={pieColors[index % pieColors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty"><p>No expense data available.</p></div>
          )}
        </motion.div>
      </div>

      {/* Drill‑Down Modal */}
      <DrillDownModal
        isOpen={drillData.isOpen}
        onClose={closeDrill}
        title={drillData.title}
        transactions={drillData.transactions}
        fmt={fmt}
        locale={locale}
      />

      {/* Local spin keyframe for the export button */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
