import React, {
  useContext, useState, useMemo, useCallback, useEffect, useRef, useId,
} from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Target,
  Download, Plus, ArrowUpRight, ArrowDownRight,
  Wallet, Sparkles, Zap, Settings, Minus,
  Rocket, LineChart, Tag, RefreshCw, Share2,
  Edit3, Trash2, ChevronDown, AlertTriangle, X,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import ErrorBoundary from '../components/ErrorBoundary';
import TransactionForm from '../components/TransactionForm';
import PropTypes from 'prop-types';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import useCountUp from '../hooks/useCountUp';
import { useToast } from '../components/ToastProvider';
import {
  convertCurrency,
  fetchRatesToInr,
  getFallbackRatesToInr,
  readCachedRatesToInr,
  resolveCurrency,
} from '../utils/currencyRates';

import { dedupeTransactions } from '../utils/transactionIntegrity';
import { getAppDate } from '../utils/dateUtils';

/* ============================================================
 * Constants
 * ============================================================ */
const PIE_COLORS = ['#059669', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];

const DEFAULT_CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Shopping', 'Entertainment', 'Health',
  'Education', 'Bills', 'Salary', 'Freelance', 'Gift', 'Rent', 'Travel',
  'Fitness', 'Subscriptions', 'Utilities', 'Insurance', 'Investment', 'Other', 'Allowance',
];

const LOCALE_MAP = {
  en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN',
};
const resolveLocale = (lang) =>
  LOCALE_MAP[lang] || 'en-IN';

const DARK_THEMES = new Set(['amoled', 'dark', 'midnight', 'black']);
const isDarkTheme = (theme) => DARK_THEMES.has(String(theme || '').toLowerCase());

const STORAGE_PREFIX = 'budgeta_dash_';

/* ============================================================
 * Utilities
 * ============================================================ */

const pad2 = (n) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD (no UTC shift). */
const toLocalDateKey = (dateInput) => {
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

/** Parse a YYYY-MM-DD string as local date; other formats go through Date. Normalizes 2026 to 2025. */
const safeParseDate = (dateInput) => {
  if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) return null;
    const copy = new Date(dateInput.getTime());
    if (copy.getFullYear() === 2026) copy.setFullYear(2025);
    return copy;
  }
  if (typeof dateInput === 'string') {
    const m = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      let yr = Number(m[1]);
      if (yr === 2026) yr = 2025;
      const d = new Date(yr, Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof dateInput !== 'string' && typeof dateInput !== 'number') return null;
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() === 2026) d.setFullYear(2025);
  return d;
};

/** Safe number conversion. */
const toNumber = (v, fallback = 0) => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
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

const canonicalCategoryName = (value) => {
  const text = String(value || '').trim();
  if (!text) return 'Other';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Safe localStorage write. */
const safeSetItem = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* quota / private mode */ }
};

/** Safe localStorage read. */
const safeGetItem = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
};

/** User-scoped key. */
const userScopedKey = (base, userId) => `${STORAGE_PREFIX}${base}_${userId || 'guest'}`;

/** Currency node for visual rendering. */
const formatCurrencyNode = (amount, safeFmt, fallbackSymbol = '$') => {
  const num = toNumber(amount, 0);
  if (safeFmt && typeof safeFmt === 'function') {
    try {
      const formatted = safeFmt(num);
      if (formatted != null) {
        return (
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
            {formatted}
          </span>
        );
      }
    } catch { /* fall through */ }
  }
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
      <span style={{ fontSize: '0.85em' }}>{fallbackSymbol}</span>
      {num.toFixed(2)}
    </span>
  );
};

/**
 * Robust plain-text currency for aria-labels and shares.
 * Deliberately gives up on extracting text from JSX elements — safe fallback.
 */
const formatCurrencyText = (amount, safeFmt, fallbackSymbol = '$') => {
  const num = toNumber(amount, 0);
  if (safeFmt && typeof safeFmt === 'function') {
    try {
      const out = safeFmt(num);
      if (typeof out === 'string') return out;
      if (typeof out === 'number') return `${fallbackSymbol}${out.toFixed(2)}`;
      // Never attempt to stringify JSX
    } catch { /* ignore */ }
  }
  return `${fallbackSymbol}${num.toFixed(2)}`;
};

/** Locale-aware human date label. */
const getDateLabel = (dateInput, locale) => {
  const date = safeParseDate(dateInput);
  if (!date) return '—';
  const today = getAppDate();
  const yesterday = getAppDate();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(locale || 'en-IN', { day: 'numeric', month: 'short' });
};

/** Validate a transaction payload. */
const validateTransaction = (transaction) => {
  const errors = [];
  if (!transaction || typeof transaction !== 'object') {
    return { isValid: false, errors: ['Invalid transaction'] };
  }
  const amt = toNumber(transaction.amount, NaN);
  if (!Number.isFinite(amt) || amt <= 0) {
    errors.push('Amount must be a positive number');
  }
  if (!transaction.category || typeof transaction.category !== 'string') {
    errors.push('Valid category is required');
  }
  if (!transaction.type || !['income', 'expense'].includes(transaction.type)) {
    errors.push('Transaction type must be "income" or "expense"');
  }
  if (transaction.date && !safeParseDate(transaction.date)) {
    errors.push('Invalid date format');
  }
  return { isValid: errors.length === 0, errors };
};

/** Financial metrics for a list of parsed transactions. */
const calculateFinancialMetrics = (transactions) => {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { income: 0, expense: 0, netSavings: 0, savingsRate: 0, expenseOfIncome: 0 };
  }
  let inc = 0;
  let exp = 0;
  for (const t of transactions) {
    if (t?.type === 'income') inc += t.displayAmount || 0;
    else if (t?.type === 'expense') exp += t.displayAmount || 0;
  }
  const net = inc - exp;
  const rate = inc > 0 ? (net / inc) * 100 : 0;
  const expPct = inc > 0 ? (exp / inc) * 100 : 0;
  return { income: inc, expense: exp, netSavings: net, savingsRate: rate, expenseOfIncome: expPct };
};

/**
 * Calculates clean, uniform ticks and domain for chart Y-axes (e.g. [0, 3000, 6000, 9000, 12000]).
 */
const calculateUniformTicks = (minVal, maxVal, desiredTicks = 5) => {
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
    return { domain: [0, 'auto'], ticks: undefined };
  }
  if (minVal === maxVal) {
    if (minVal === 0) return { domain: [0, 100], ticks: [0, 25, 50, 75, 100] };
    const pad = Math.abs(minVal) * 0.2;
    minVal -= pad;
    maxVal += pad;
  }
  const rawRange = maxVal - minVal;
  const rawStep = rawRange / Math.max(1, desiredTicks - 1);
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = Math.pow(10, exponent);
  const fraction = rawStep / magnitude;

  let stepMultiplier;
  if (fraction <= 1.2) stepMultiplier = 1;
  else if (fraction <= 2.2) stepMultiplier = 2;
  else if (fraction <= 3.2) stepMultiplier = 3;
  else if (fraction <= 6) stepMultiplier = 5;
  else stepMultiplier = 10;

  const step = stepMultiplier * magnitude;
  const niceMin = Math.floor(minVal / step) * step;
  const niceMax = Math.ceil(maxVal / step) * step;

  const ticks = [];
  for (let t = niceMin; t <= niceMax + step * 0.001; t += step) {
    ticks.push(Number(t.toFixed(2)));
  }

  return { domain: [niceMin, niceMax], ticks };
};

/** Stable per-instance SVG gradient id. */
const useStableId = (prefix) => {
  const id = useId();
  return `${prefix}-${id.replace(/:/g, '')}`;
};

/** Reactive prefers-reduced-motion. */
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
 * Sub-components
 * ============================================================ */

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 260 } },
};
const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };

const StatCard = React.memo(({
  icon: Icon,
  label = 'Unknown',
  value,
  valueText,
  colorRgb = '255,255,255',
  trend,
  trendVal,
  accentColor,
  subtitle,
  className = '',
  invertTrendColor = false,
}) => {
  const isValidTrend = ['up', 'down', 'neutral'].includes(trend);
  // Truthful direction; color conveys sentiment.
  const sentimentClass =
    trend === 'up' ? (invertTrendColor ? 'neg' : 'pos')
      : trend === 'down' ? (invertTrendColor ? 'pos' : 'neg')
        : 'neutral';

  return (
    <motion.div
      variants={CARD_VARIANTS}
      className={`stat-card glass ${className}`}
      role="region"
      aria-label={valueText ? `${label}: ${valueText}` : label}
    >
      <div className="stat-header">
        <span className="stat-label">{label}</span>
        {Icon && (
          <div
            className="stat-icon"
            style={{ background: `rgba(${colorRgb}, 0.15)`, color: `rgb(${colorRgb})` }}
            aria-hidden="true"
          >
            <Icon size={18} />
          </div>
        )}
      </div>
      <div className="stat-value" style={{ color: accentColor || 'var(--text-primary)' }}>
        {value}
      </div>
      <div className="stat-bottom-row">
        {subtitle && (
          <span className="stat-subtitle" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {subtitle}
          </span>
        )}
        {trendVal !== undefined && isValidTrend && (
          <div
            className={`stat-trend ${trend} sentiment-${sentimentClass}`}
            aria-label={`Trend: ${trendVal}`}
          >
            {trend === 'up' && <ArrowUpRight size={13} aria-hidden="true" />}
            {trend === 'down' && <ArrowDownRight size={13} aria-hidden="true" />}
            {trend === 'neutral' && <Minus size={13} aria-hidden="true" />}
            <span>{trendVal}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
});
StatCard.displayName = 'StatCard';
StatCard.propTypes = {
  icon: PropTypes.elementType,
  label: PropTypes.string,
  value: PropTypes.node,
  valueText: PropTypes.string,
  colorRgb: PropTypes.string,
  trend: PropTypes.oneOf(['up', 'down', 'neutral']),
  trendVal: PropTypes.string,
  accentColor: PropTypes.string,
  subtitle: PropTypes.string,
  className: PropTypes.string,
  invertTrendColor: PropTypes.bool,
};

const DashboardSkeleton = () => (
  <div className="bento-dashboard" aria-label="Loading dashboard data" role="status">
    <div className="bento-header shimmer" style={{ height: 40, borderRadius: 14, width: 200, marginBottom: 24, border: '1px solid var(--glass-border)' }} />
    <div className="bento-grid">
      <div className="bento-tile bento-hero glass shimmer" style={{ minHeight: 180 }} />
      <div className="bento-tile bento-income glass shimmer" style={{ minHeight: 140 }} />
      <div className="bento-tile bento-expense glass shimmer" style={{ minHeight: 140 }} />
      <div className="bento-tile bento-recent glass shimmer" style={{ minHeight: 360 }} />
      <div className="bento-tile bento-chart glass shimmer" style={{ minHeight: 320 }} />
      <div className="bento-tile bento-goal glass shimmer" style={{ minHeight: 220 }} />
      <div className="bento-tile bento-pie glass shimmer" style={{ minHeight: 220 }} />
    </div>
  </div>
);

const EmptyTransactionState = ({ onAddClick }) => (
  <div className="bento-empty">
    <span className="bento-empty-icon" aria-hidden="true">
      <Rocket size={42} strokeWidth={1.5} opacity={0.5} />
    </span>
    <p className="bento-empty-title">Start your journey</p>
    <p className="bento-empty-sub">Add your first transaction to begin tracking your finances.</p>
    <button
      type="button"
      className="bento-empty-cta pulse-encouragement"
      onClick={onAddClick}
      aria-label="Add your first transaction"
    >
      <Plus size={16} /> Get Started
    </button>
  </div>
);
EmptyTransactionState.propTypes = { onAddClick: PropTypes.func.isRequired };

const ConfirmDeleteModal = ({ tx, onCancel, onConfirm, safeFmt, currencySymbol }) => {
  const confirmRef = useRef(null);
  useEffect(() => {
    const node = confirmRef.current;
    if (!node) return undefined;
    const prev = document.activeElement;
    const btn = node.querySelector('button');
    btn?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      try { prev?.focus?.(); } catch { /* ignore */ }
    };
  }, [onCancel]);

  if (!tx) return null;
  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Delete transaction"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        ref={confirmRef}
        className="modal-box glass"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '90%', borderRadius: 14, padding: '1.25rem', background: 'var(--bg-color)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
          <AlertTriangle size={20} color="var(--danger-color, #ef4444)" aria-hidden="true" />
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Delete transaction</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Delete this <strong>{tx.type}</strong> of{' '}
          <strong>{formatCurrencyText(tx.amount, safeFmt, currencySymbol)}</strong>?
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
          This action cannot be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            style={{ background: 'var(--danger-color, #ef4444)' }}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};
ConfirmDeleteModal.propTypes = {
  tx: PropTypes.object,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  safeFmt: PropTypes.func,
  currencySymbol: PropTypes.string,
};

/* ============================================================
 * Main Component
 * ============================================================ */
export default function Dashboard() {
  const contextValue = useContext(AppContext);
  const context = useMemo(() => contextValue || {}, [contextValue]);

  const {
    user = null,
    transactions: rawTransactions = [],
    accounts = [],
    subscriptions = [],
    theme = 'light',
    addTransaction,
    updateTransaction,
    deleteTransaction,
    USER_ID = null,
    fmt,
    t,
    lang = 'en',
    currency = 'USD',
    fetchTransactions,
    currencyInfo,
    loading,
  } = context;

  const { showToast } = useToast();
  const prefersReducedMotion = usePrefersReducedMotion();

  const locale = useMemo(() => resolveLocale(lang), [lang]);
  const isDark = useMemo(() => isDarkTheme(theme), [theme]);
  const displayCurrency = useMemo(() => resolveCurrency(currency, 'USD'), [currency]);

  const [fxRatesToInr, setFxRatesToInr] = useState(() => (
    readCachedRatesToInr() || getFallbackRatesToInr()
  ));

  useEffect(() => {
    const controller = new AbortController();
    fetchRatesToInr(controller.signal)
      .then((rates) => setFxRatesToInr(rates))
      .catch(() => { /* Offline mode keeps the bundled fallback rates. */ });
    return () => controller.abort();
  }, []);

  const accountCurrencies = useMemo(() => {
    const result = new Map();
    for (const account of accounts) {
      if (account?.id || account?._id) {
        result.set(String(account.id || account._id), resolveCurrency(account.currency, displayCurrency));
      }
    }
    return result;
  }, [accounts, displayCurrency]);

  const currencySymbol = currencyInfo?.symbol || '$';
  const safeFmt = useCallback(
    (val) => {
      const num = toNumber(val, 0);
      if (fmt && typeof fmt === 'function') {
        try {
          const out = fmt(num);
          if (out != null) return out;
        } catch { /* fall through */ }
      }
      const defaultLoc = currencyInfo?.code === 'INR' ? 'en-IN' : 'en-US';
      const targetLoc = currencyInfo?.code === 'INR' ? 'en-IN' : (locale || defaultLoc);
      return new Intl.NumberFormat(targetLoc, {
        style: 'currency', currency: currencyInfo?.code || 'INR',
      }).format(num);
    },
    [fmt, locale, currencyInfo]
  );

  /* ---------------- State ---------------- */
  const dateFilterKey = useMemo(() => userScopedKey('date_filter', USER_ID), [USER_ID]);
  const categoryFilterKey = useMemo(() => userScopedKey('category_filter', USER_ID), [USER_ID]);

  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [dateFilter, setDateFilter] = useState(() => safeGetItem(dateFilterKey, 'all'));
  const [categoryFilter, setCategoryFilter] = useState(() => safeGetItem(categoryFilterKey, 'all'));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  /* ---------------- Reload filters when USER_ID changes ---------------- */
  useEffect(() => {
    setDateFilter(safeGetItem(dateFilterKey, 'all'));
    setCategoryFilter(safeGetItem(categoryFilterKey, 'all'));
  }, [dateFilterKey, categoryFilterKey]);

  /* ---------------- Persist filters ---------------- */
  useEffect(() => { safeSetItem(dateFilterKey, dateFilter); }, [dateFilterKey, dateFilter]);
  useEffect(() => { safeSetItem(categoryFilterKey, categoryFilter); }, [categoryFilterKey, categoryFilter]);

  /* ============================================================
   * Data processing
   * ============================================================ */

  // 1. Parse all transactions
  const allParsed = useMemo(() => {
    if (!Array.isArray(rawTransactions)) return [];
    const deduped = dedupeTransactions(rawTransactions, { excludeFuture: false });
    const out = [];
    const endOfToday = getAppDate();
    endOfToday.setHours(23, 59, 59, 999);
    for (const tx of deduped) {
      if (!tx || typeof tx !== 'object') continue;
      if (tx.is_deleted === true || tx.is_deleted === 'true') continue;
      const parsedDate = safeParseDate(tx.date);
      if (!parsedDate) continue;
      if (parsedDate > endOfToday) continue;
      const rawAmt = toNumber(tx.amount, NaN);
      if (!Number.isFinite(rawAmt) || rawAmt < 0) continue;
      const transactionCurrency = resolveCurrency(
        tx.currency || accountCurrencies.get(String(tx.account_id || '')) || displayCurrency,
        displayCurrency
      );
      const displayAmount = convertCurrency(
        rawAmt,
        transactionCurrency,
        displayCurrency,
        fxRatesToInr
      );
      if (displayAmount === null) continue;
      out.push({
        ...tx,
        category: canonicalCategoryName(tx.category),
        parsedDate,
        parsedAmount: rawAmt,
        displayAmount: Number(displayAmount.toFixed(2)),
        transactionCurrency,
      });
    }
    return out;
  }, [rawTransactions, accountCurrencies, displayCurrency, fxRatesToInr]);

  // 2. Apply filters
  const parsedTransactions = useMemo(() => {
    let processed = allParsed;
    if (categoryFilter !== 'all') {
      processed = processed.filter(
        (tx) => canonicalCategoryName(tx.category).toLowerCase() === categoryFilter.toLowerCase()
      );
    }
    if (dateFilter !== 'all') {
      const now = getAppDate();
      now.setHours(23, 59, 59, 999);
      const startOfToday = getAppDate();
      startOfToday.setHours(0, 0, 0, 0);
      processed = processed.filter((tx) => {
        const t = tx.parsedDate;
        if (t > now) return false;
        if (dateFilter === '7days') {
          const diff = (startOfToday - t) / 86400000;
          return diff <= 7;
        }
        if (dateFilter === '30days') {
          const diff = (startOfToday - t) / 86400000;
          return diff <= 30;
        }
        if (dateFilter === 'thisMonth') {
          return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }
    return processed;
  }, [allParsed, categoryFilter, dateFilter]);

  // 3. Metrics
  const unfilteredMetrics = useMemo(() => calculateFinancialMetrics(allParsed), [allParsed]);
  const financialMetrics = useMemo(() => calculateFinancialMetrics(parsedTransactions), [parsedTransactions]);
  const { savingsRate, expenseOfIncome } = financialMetrics;

  // 4. Sorted lists
  const sortedAscAll = useMemo(
    () => [...allParsed].sort((a, b) => a.parsedDate - b.parsedDate),
    [allParsed]
  );
  const sortedDescFiltered = useMemo(
    () => [...parsedTransactions].sort((a, b) => b.parsedDate - a.parsedDate),
    [parsedTransactions]
  );
  const sortedAscFiltered = useMemo(
    () => [...parsedTransactions].sort((a, b) => a.parsedDate - b.parsedDate),
    [parsedTransactions]
  );

  // 5. Starting balance from accounts
  const startingBalance = useMemo(() => {
    if (!Array.isArray(accounts) || accounts.length === 0) return 0;
    const liquidTypes = new Set(['bank', 'wallet', 'cash', 'credit_card', 'other']);
    return accounts
      .filter((a) => a && a.is_active !== false && liquidTypes.has(String(a.type || '').toLowerCase()))
      .reduce((sum, a) => {
        const bal = Number(a.initial_balance);
        if (!Number.isFinite(bal)) return sum;
        const accountCurrency = resolveCurrency(a.currency, displayCurrency);
        const converted = convertCurrency(bal, accountCurrency, displayCurrency, fxRatesToInr);
        return sum + (converted === null ? 0 : converted);
      }, 0);
  }, [accounts, displayCurrency, fxRatesToInr]);

  // 6. Hero stats
  const rawIncome = unfilteredMetrics.income;
  const rawExpense = unfilteredMetrics.expense;
  const netSavings = unfilteredMetrics.netSavings;
  const rawBalance = startingBalance + netSavings;
  const monthlyGoal = toNumber(user?.monthly_goal, 0);

  // Goal progress is monthly by definition. Using all-time net savings here
  // made a small monthly target look like an inverted 100%+ ratio.
  const monthlyNetSavings = useMemo(() => {
    const now = getAppDate();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return allParsed.reduce((sum, transaction) => {
      if (transaction.parsedDate < monthStart) return sum;
      return sum + (transaction.type === 'income' ? transaction.displayAmount : -transaction.displayAmount);
    }, 0);
  }, [allParsed]);

  const spendableBalance = useMemo(() => {
    const liquidTypes = new Set(['bank', 'wallet', 'cash', 'credit_card', 'other']);
    const liquidOpeningBalance = (Array.isArray(accounts) ? accounts : [])
      .filter((account) => account?.is_active !== false && liquidTypes.has(String(account?.type || '').toLowerCase()))
      .reduce((sum, account) => {
        const opening = Number(account?.initial_balance);
        if (!Number.isFinite(opening)) return sum;
        const converted = convertCurrency(
          opening,
          resolveCurrency(account.currency, displayCurrency),
          displayCurrency,
          fxRatesToInr
        );
        return sum + (converted === null ? 0 : converted);
      }, 0);
    return Math.max(0, liquidOpeningBalance + netSavings);
  }, [accounts, displayCurrency, fxRatesToInr, netSavings]);

  const safeToSpend = useMemo(() => {
    if (spendableBalance <= 0) return 0;
    const today = getAppDate();
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const daysRemaining = Math.max(1, monthEnd.getDate() - today.getDate() + 1);
    const recurringBills = (Array.isArray(subscriptions) ? subscriptions : [])
      .filter((sub) => !sub?.is_paused && !sub?.cancelled_at)
      .reduce((sum, sub) => {
        const amount = toNumber(sub?.amount, 0);
        const cycle = String(sub?.billing_cycle || sub?.frequency || 'monthly').toLowerCase();
        if (cycle === 'yearly' || cycle === 'annual') return sum + amount / 12;
        if (cycle === 'weekly') return sum + amount * 4.33;
        return sum + amount;
      }, 0);
    const netAvailable = Math.max(0, spendableBalance - recurringBills);
    const dailyRaw = netAvailable / daysRemaining;
    const dailyCapped = Math.min(dailyRaw, Math.max(100, spendableBalance * 0.05));
    return Math.max(0, dailyCapped);
  }, [spendableBalance, subscriptions]);

  // 7. Animated counters
  const { value: animatedBalance, isFinished: balanceDone } = useCountUp(rawBalance, 900);
  const { value: animatedIncome } = useCountUp(rawIncome, 800);
  const { value: animatedExpense } = useCountUp(rawExpense, 800);

  // 8. Goal progress
  const goalProgress = useMemo(() => {
    if (monthlyGoal <= 0) return 0;
    return Math.max(0, Math.min((monthlyNetSavings / monthlyGoal) * 100, 100));
  }, [monthlyNetSavings, monthlyGoal]);

  // 9. Daily average spend over the last 30 days
  const dailyAverageSpend = useMemo(() => {
    if (parsedTransactions.length === 0) return 0;
    const cutoff = getAppDate();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 30);
    let total = 0;
    for (const t of parsedTransactions) {
      if (t.type !== 'expense') continue;
      if (t.parsedDate < cutoff) continue;
      total += t.displayAmount;
    }
    return total / 30;
  }, [parsedTransactions]);

  // 10. Month-over-month (with upper bound = now)
  const momMetrics = useMemo(() => {
    const now = getAppDate();
    const nowMs = now.getTime();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    let curIncome = 0, curExpense = 0;
    let prevIncome = 0, prevExpense = 0;

    for (const t of allParsed) {
      const d = t.parsedDate;
      const dMs = d.getTime();
      const amt = t.displayAmount;
      const inCurrent = d >= currentStart && dMs <= nowMs;
      const inPrev = d >= prevStart && d <= prevEnd;
      if (t.type === 'income') {
        if (inCurrent) curIncome += amt;
        else if (inPrev) prevIncome += amt;
      } else if (t.type === 'expense') {
        if (inCurrent) curExpense += amt;
        else if (inPrev) prevExpense += amt;
      }
    }

    const pct = (cur, prev) => {
      if (prev === 0 && cur === 0) return { val: '0%', dir: 'neutral' };
      if (prev === 0) return { val: cur > 0 ? 'New' : '—', dir: cur > 0 ? 'up' : 'neutral' };
      const raw = ((cur - prev) / Math.abs(prev)) * 100;
      const rounded = Math.round(raw * 10) / 10;
      return {
        val: `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}%`,
        dir: rounded > 0.05 ? 'up' : rounded < -0.05 ? 'down' : 'neutral',
      };
    };

    return {
      income: pct(curIncome, prevIncome),
      expense: pct(curExpense, prevExpense),
      balance: pct(curIncome - curExpense, prevIncome - prevExpense),
    };
  }, [allParsed]);

  // 11. Sparkline (day-bucketed, baseline-aware)
  const sparklineSvgPath = useMemo(() => {
    if (sortedAscAll.length < 2) return null;
    const buckets = new Map();
    for (const t of sortedAscAll) {
      const key = toLocalDateKey(t.parsedDate);
      if (!key) continue;
      const delta = t.type === 'income' ? t.displayAmount : -t.displayAmount;
      buckets.set(key, (buckets.get(key) || 0) + delta);
    }
    const sorted = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length < 5) return null;
    // Start from startingBalance so the sparkline reflects true account trajectory.
    let running = startingBalance;
    const series = sorted.slice(-14).map(([, delta]) => {
      running += delta;
      return running;
    });
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const width = 240;
    const height = 48;
    const pad = 4;
    const coords = series.map((val, idx) => {
      const x = pad + (idx / (series.length - 1)) * (width - pad * 2);
      const y = height - pad - ((val - min) / range) * (height - pad * 2);
      return { x, y };
    });

    let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const mx = (p0.x + p1.x) / 2;
      d += ` C ${mx.toFixed(1)} ${p0.y.toFixed(1)}, ${mx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    return d;
  }, [sortedAscAll, startingBalance]);

  // 12. Chart data (continuous day-bucketed to eliminate misleading gaps)
  const chartData = useMemo(() => {
    if (sortedAscFiltered.length === 0) return [];
    const map = new Map();
    for (const t of sortedAscFiltered) {
      const key = toLocalDateKey(t.parsedDate);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          name: key, income: 0, expense: 0, timestamp: t.parsedDate.getTime(), categories: new Map(),
        });
      }
      const entry = map.get(key);
      if (t.type === 'income') entry.income += t.displayAmount;
      else entry.expense += t.displayAmount;
      const category = canonicalCategoryName(t.category);
      entry.categories.set(category, (entry.categories.get(category) || 0) + t.displayAmount);
    }

    const now = getAppDate();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstTxDate = sortedAscFiltered[0].parsedDate;
    const lastTxDate = sortedAscFiltered[sortedAscFiltered.length - 1].parsedDate;
    let start = new Date(firstTxDate.getFullYear(), firstTxDate.getMonth(), firstTxDate.getDate());
    let end = new Date(lastTxDate.getFullYear(), lastTxDate.getMonth(), lastTxDate.getDate());

    if (dateFilter === 'thisMonth') {
      start = monthStart;
      end = new Date(Math.max(end.getTime(), today.getTime()));
    } else if (dateFilter === '7days') {
      start = new Date(today.getTime() - 6 * 86400000);
      end = today;
    } else if (dateFilter === '30days') {
      start = new Date(today.getTime() - 29 * 86400000);
      end = today;
    } else {
      // 'all': ensure continuous curve starting from at least monthStart up to today/lastTx
      if (start.getTime() === end.getTime() || (end.getTime() - start.getTime()) < 3 * 86400000) {
        start = new Date(Math.min(start.getTime(), monthStart.getTime()));
        end = new Date(Math.max(end.getTime(), today.getTime()));
      }
    }

    const allDays = [];
    const curr = new Date(start);
    while (curr <= end) {
      allDays.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    const daysToUse = allDays.length > 30 ? allDays.slice(-30) : allDays;

    const rows = daysToUse.map((day) => {
      const key = toLocalDateKey(day);
      const existing = map.get(key);
      if (existing) {
        return {
          ...existing,
          timestamp: day.getTime(),
        };
      }
      return {
        name: key,
        income: 0,
        expense: 0,
        timestamp: day.getTime(),
        categories: new Map(),
      };
    });

    const spansMultipleYears = new Set(rows.map((row) => new Date(row.timestamp).getFullYear())).size > 1;
    return rows.map((row) => ({
      ...row,
      detail: Array.from(row.categories.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([category, amount]) => `${category} ${formatCurrencyText(amount, safeFmt, currencySymbol)}`)
        .join(' · '),
      name: new Date(row.timestamp).toLocaleDateString(locale, {
        month: 'short', day: 'numeric', ...(spansMultipleYears ? { year: 'numeric' } : {}),
      }),
    }));
  }, [sortedAscFiltered, locale, safeFmt, currencySymbol, dateFilter]);

  // Clean uniform Y-axis configuration for Spending vs Income
  const chartYAxisConfig = useMemo(() => {
    if (chartData.length === 0) return { domain: [0, 'auto'], ticks: undefined };
    const values = chartData.flatMap((d) => [d.income, d.expense]).filter((v) => Number.isFinite(v) && v > 0);
    if (values.length === 0) return { domain: [0, 'auto'], ticks: undefined };
    const maxVal = Math.max(...values);
    return calculateUniformTicks(0, maxVal, 5);
  }, [chartData]);

  // 13. Net worth over time (continuous daily running total)
  const netWorthData = useMemo(() => {
    if (sortedAscAll.length === 0) return [];
    const deltaMap = new Map();
    for (const t of sortedAscAll) {
      const key = toLocalDateKey(t.parsedDate);
      if (!key) continue;
      const delta = t.type === 'income' ? t.displayAmount : -t.displayAmount;
      deltaMap.set(key, (deltaMap.get(key) || 0) + delta);
    }

    const firstTxDate = sortedAscAll[0].parsedDate;
    const lastTxDate = sortedAscAll[sortedAscAll.length - 1].parsedDate;
    const start = new Date(firstTxDate.getFullYear(), firstTxDate.getMonth(), firstTxDate.getDate());
    const end = new Date(lastTxDate.getFullYear(), lastTxDate.getMonth(), lastTxDate.getDate());

    const allDays = [];
    const curr = new Date(start);
    while (curr <= end) {
      allDays.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    const daysToUse = allDays.length > 30 ? allDays.slice(-30) : allDays;

    let running = startingBalance;
    if (allDays.length > 30) {
      const firstUsedDate = daysToUse[0];
      for (const t of sortedAscAll) {
        if (t.parsedDate < firstUsedDate) {
          running += (t.type === 'income' ? t.displayAmount : -t.displayAmount);
        }
      }
    }

    const rows = daysToUse.map((day) => {
      const key = toLocalDateKey(day);
      const delta = deltaMap.get(key) || 0;
      running += delta;
      return {
        name: key,
        balance: Number(running.toFixed(2)),
        timestamp: day.getTime(),
      };
    });

    const spansMultipleYears = new Set(rows.map((row) => new Date(row.timestamp).getFullYear())).size > 1;
    return rows.map((row) => ({
      ...row,
      name: new Date(row.timestamp).toLocaleDateString(locale, {
        month: 'short', day: 'numeric', ...(spansMultipleYears ? { year: 'numeric' } : {}),
      }),
    }));
  }, [sortedAscAll, locale, startingBalance]);

  const isNetWorthFlat = useMemo(() => {
    try {
      if (netWorthData.length < 2) return true;
      const balances = netWorthData.map((d) => d.balance);
      const min = Math.min(...balances);
      const max = Math.max(...balances);
      return min === max;
    } catch {
      return false;
    }
  }, [netWorthData]);

  const netWorthYAxisConfig = useMemo(() => {
    if (netWorthData.length === 0) return { domain: ['auto', 'auto'], ticks: undefined };
    const values = netWorthData.map((row) => row.balance).filter(Number.isFinite);
    if (values.length === 0) return { domain: ['auto', 'auto'], ticks: undefined };
    const min = Math.min(...values);
    const max = Math.max(...values);
    return calculateUniformTicks(min, max, 5);
  }, [netWorthData]);

  // 14. Top expense category
  const topExpenseCategory = useMemo(() => {
    const map = new Map();
    let totalExp = 0;
    for (const t of parsedTransactions) {
      if (t.type !== 'expense') continue;
      const cat = canonicalCategoryName(t.category);
      map.set(cat, (map.get(cat) || 0) + t.displayAmount);
      totalExp += t.displayAmount;
    }
    if (map.size === 0 || totalExp === 0) return null;
    const [name, amount] = Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0];
    return { name, amount, pct: ((amount / totalExp) * 100).toFixed(0) };
  }, [parsedTransactions]);

  // 15. Pie data
  const pieData = useMemo(() => {
    const catMap = new Map();
    for (const t of parsedTransactions) {
      if (t.type !== 'expense') continue;
      const category = canonicalCategoryName(t.category);
      catMap.set(category, (catMap.get(category) || 0) + t.displayAmount);
    }
    return Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
  }, [parsedTransactions]);

  const pieTotal = useMemo(
    () => pieData.reduce((sum, entry) => sum + entry.value, 0),
    [pieData]
  );

  // 16. Grouped recent transactions (Clean teaser capped at 4 items)
  const groupedTxns = useMemo(() => {
    const list = sortedDescFiltered.slice(0, 4);
    const groups = [];
    let lastLabel = '';
    for (const tx of list) {
      const label = getDateLabel(tx.date, locale);
      if (label !== lastLabel && label !== '—') {
        groups.push({ type: 'header', label, key: `h-${label}-${groups.length}` });
        lastLabel = label;
      }
      groups.push({ type: 'tx', data: tx, key: tx.id || tx._id || `t-${groups.length}` });
    }
    return groups;
  }, [sortedDescFiltered, locale]);

  // 17. Category options
  const categoryOptions = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES);
    for (const t of allParsed) {
      if (t.category) set.add(canonicalCategoryName(t.category));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allParsed]);

  /* ---------------- Localisation helper ---------------- */
  const tr = useCallback((key, fallback) => {
    const value = t && typeof t === 'function' ? t(key) : null;
    return value && value !== key ? value : fallback;
  }, [t]);

  /* ---------------- Theme colours ---------------- */
  const balanceColor = rawBalance >= 0 ? 'var(--balance-accent)' : 'var(--danger)';
  const balanceHex = rawBalance >= 0 ? '#10b981' : '#ef4444';

  const tooltipStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(8,8,22,0.98)' : 'rgba(255,255,255,0.97)',
    border: `1px solid ${isDark ? 'rgba(5,150,105,0.3)' : 'rgba(5,150,105,0.2)'}`,
    borderRadius: 12,
    color: isDark ? '#f8fafc' : '#0f172a',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(12px)',
  }), [isDark]);

  const gInId = useStableId('gIn');
  const gExId = useStableId('gEx');
  const gNWId = useStableId('gNW');

  /* ============================================================
   * Event handlers
   * ============================================================ */

  const handleExportCSV = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const data = parsedTransactions.length > 0 ? parsedTransactions : allParsed;
      const headers = ['Date', 'Type', 'Category', 'Amount', 'Currency', 'Note'];
      const rows = data.map((tx) => [
        toLocalDateKey(tx.date) || '',
        tx.type || '',
        canonicalCategoryName(tx.category),
        tx.parsedAmount.toFixed(2),
        tx.transactionCurrency || displayCurrency,
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
      link.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', 'CSV exported successfully!');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  }, [allParsed, parsedTransactions, isExporting, showToast, displayCurrency]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    if (typeof fetchTransactions !== 'function') {
      showToast('info', 'Data is already up to date');
      return;
    }
    setIsRefreshing(true);
    try {
      await fetchTransactions();
      setEditingTx(null);
      setShowForm(false);
      showToast('success', 'Data refreshed successfully');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchTransactions, isRefreshing, showToast]);

  const handleShare = useCallback(async () => {
    const summary =
      `My Budget Dashboard\n` +
      `Balance: ${formatCurrencyText(rawBalance, safeFmt, currencySymbol)}\n` +
      `Net Savings: ${formatCurrencyText(netSavings, safeFmt, currencySymbol)}\n` +
      `Savings Rate: ${savingsRate.toFixed(1)}%`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Financial Dashboard', text: summary });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        showToast('success', 'Dashboard summary copied to clipboard!');
        return;
      }
      showToast('error', 'Sharing is not supported in this browser');
    } catch (err) {
      if (err?.name !== 'AbortError') showToast('error', 'Sharing failed');
    }
  }, [rawBalance, netSavings, savingsRate, safeFmt, currencySymbol, showToast]);

  const handleAddTransaction = useCallback(async (tx) => {
    if (typeof addTransaction !== 'function') {
      showToast('error', 'Transaction service unavailable');
      return;
    }
    const validation = validateTransaction(tx);
    if (!validation.isValid) {
      showToast('error', `Validation failed: ${validation.errors.join(', ')}`);
      return;
    }
    setIsLoadingAction(true);
    try {
      await addTransaction(tx);
      setShowForm(false);
      showToast('success', 'Transaction added successfully!');
    } catch (err) {
      /* Original error toast using err?.message:
      showToast('error', err?.message || 'Failed to add transaction.');
      // Issue: Masked backend error body with generic HTTP client message.
      */
      const errorMsg =
        err?.response?.data?.error ||
        err?.response?.data?.errors?.[0]?.msg ||
        err?.message ||
        'Failed to add transaction.';
      showToast('error', errorMsg);
    } finally {
      setIsLoadingAction(false);
    }
  }, [addTransaction, showToast]);

  const handleEditTransaction = useCallback((tx) => {
    setEditingTx(tx);
    setShowForm(true);
  }, []);

  const handleUpdateTransaction = useCallback(async (tx) => {
    if (typeof updateTransaction !== 'function') {
      showToast('error', 'Transaction service unavailable');
      return;
    }
    if (!editingTx) {
      showToast('error', 'No transaction selected for editing');
      return;
    }
    const validation = validateTransaction(tx);
    if (!validation.isValid) {
      showToast('error', `Validation failed: ${validation.errors.join(', ')}`);
      return;
    }
    const id = editingTx.id || editingTx._id;
    if (!id) {
      showToast('error', 'Invalid transaction reference');
      return;
    }
    setIsLoadingAction(true);
    try {
      await updateTransaction(id, tx);
      setShowForm(false);
      setEditingTx(null);
      showToast('success', 'Transaction updated successfully!');
    } catch (err) {
      /* Original error toast using err?.message:
      showToast('error', err?.message || 'Failed to update transaction.');
      // Issue: Masked backend error body with generic HTTP client message.
      */
      const errorMsg =
        err?.response?.data?.error ||
        err?.response?.data?.errors?.[0]?.msg ||
        err?.message ||
        'Failed to update transaction.';
      showToast('error', errorMsg);
    } finally {
      setIsLoadingAction(false);
    }
  }, [updateTransaction, editingTx, showToast]);

  const requestDeleteTransaction = useCallback((tx) => setPendingDelete(tx), []);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const confirmDeleteTransaction = useCallback(async () => {
    if (!pendingDelete) return;
    if (typeof deleteTransaction !== 'function') {
      showToast('error', 'Transaction service unavailable');
      setPendingDelete(null);
      return;
    }
    const id = pendingDelete.id || pendingDelete._id;
    if (!id) {
      showToast('error', 'Invalid transaction reference');
      setPendingDelete(null);
      return;
    }
    setIsLoadingAction(true);
    try {
      await deleteTransaction(id);
      showToast('success', 'Transaction deleted.');
      setPendingDelete(null);
    } catch (err) {
      showToast('error', err?.message || 'Failed to delete transaction.');
    } finally {
      setIsLoadingAction(false);
    }
  }, [pendingDelete, deleteTransaction, showToast]);

  /* ---------------- Keyboard: Ctrl+N only ---------------- */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowForm(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ============================================================
   * Modal initial data (stable)
   * ============================================================ */
  const todayKey = useMemo(() => toLocalDateKey(getAppDate()), []);
  const initialFormData = useMemo(
    () => editingTx || { date: todayKey },
    [editingTx, todayKey]
  );

  /* ============================================================
   * Render
   * ============================================================ */

  if ((loading && !user) || !user) return <DashboardSkeleton />;

  const expenseGreaterThanIncome = rawExpense > rawIncome;

  return (
    <ErrorBoundary>
      <div className="bento-dashboard">
        <div className="bento-header">
          <div className="bento-title-wrap">
            <h2 className="bento-page-title">{tr('dashboard', 'Dashboard')}</h2>
          </div>
          <div className="bento-actions">
            <motion.button
              type="button"
              className="bbtn-icon bbtn-refresh"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh"
              aria-label="Refresh data"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
            >
              <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
            </motion.button>
            <motion.button
              type="button"
              className="bbtn-icon bbtn-share"
              onClick={handleShare}
              title="Share dashboard"
              aria-label="Share"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
            >
              <Share2 size={16} />
            </motion.button>
            <div className="export-group" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <motion.button
                type="button"
                className="bbtn-icon bbtn-export"
                onClick={handleExportCSV}
                disabled={isExporting}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={isExporting ? 'Exporting…' : 'Export CSV'}
                aria-label="Export CSV"
              >
                {isExporting ? <RefreshCw size={15} className="spinning" /> : <Download size={15} />}
                <span className="bbtn-export-label">CSV</span>
              </motion.button>
            </div>
            <motion.button
              type="button"
              className="bbtn-pri bbtn-full"
              onClick={() => setShowForm(true)}
              title="Ctrl+N"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={14} /> {tr('add_transaction', 'Add Transaction')}
            </motion.button>
          </div>
        </div>

        {/* Quick stats strip — calm, restrained structure with delta badges */}
        <motion.div
          className="dashboard-quick-stats-strip"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="dqs-pill">
            <span className="dqs-label">Savings Rate:</span>
            <span className="dqs-val">{savingsRate.toFixed(1)}%</span>
            <span className={`dqs-badge ${savingsRate >= 20 ? 'pos' : 'neutral'}`}>
              {savingsRate >= 20 ? 'Healthy' : savingsRate > 0 ? 'Active' : 'Low'}
            </span>
          </div>

          <div className="dqs-pill">
            <span className="dqs-label">Top Expense:</span>
            <span className="dqs-val">
              {topExpenseCategory ? topExpenseCategory.name : '—'}
            </span>
            {topExpenseCategory && (
              <span className="dqs-badge neutral">
                {topExpenseCategory.pct}% of expenses
              </span>
            )}
          </div>

          <div className="dqs-pill">
            <span className="dqs-label">Daily Avg Spend:</span>
            <span className="dqs-val">
              {formatCurrencyNode(dailyAverageSpend, safeFmt, currencySymbol)}
            </span>
            <span className="dqs-badge neutral">
              30d pace
            </span>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          className="bento-filters"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', gap: 12, justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}
          role="search"
          aria-label="Filter transactions"
        >
          <select
            className="filter-select"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter by date"
          >
            <option value="all">{tr('all_time', 'All Time')}</option>
            <option value="7days">{tr('last_7_days', 'Last 7 Days')}</option>
            <option value="30days">{tr('last_30_days', 'Last 30 Days')}</option>
            <option value="thisMonth">{tr('this_month', 'This Month')}</option>
          </select>
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">{tr('all_categories', 'All Categories')}</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {(dateFilter !== 'all' || categoryFilter !== 'all') && (
            <button
              type="button"
              className="filter-clear"
              onClick={() => { setDateFilter('all'); setCategoryFilter('all'); }}
              aria-label="Clear filters"
            >
              {tr('clear_filters', 'Clear Filters')}
            </button>
          )}
        </motion.div>

        {/* Bento grid */}
        <motion.div className="bento-grid" variants={STAGGER} initial="hidden" animate="show">
          <div className="ambient-orb orb-chart" style={{ top: '15%', right: '5%' }} aria-hidden="true" />
          <div className="ambient-orb orb-goal" style={{ bottom: '10%', left: '10%' }} aria-hidden="true" />
          <div className="ambient-orb orb-ai" style={{ bottom: '2%', right: '2%' }} aria-hidden="true" />

          {/* Hero — Total Balance (starting balance + net of transactions) */}
          <motion.div
            variants={CARD_VARIANTS}
            className={`bento-tile bento-hero stat-card glass ${balanceDone ? 'numberGlow' : ''}`}
            style={{
              borderColor: rawBalance >= 0
                ? 'rgba(var(--balance-accent-rgb), 0.34)'
                : 'rgba(var(--danger-rgb), 0.3)',
            }}
            role="region"
            aria-label={`Total balance: ${formatCurrencyText(rawBalance, safeFmt, currencySymbol)}`}
            aria-live="polite"
          >
            <div
              className="blob-glow"
              style={{
                background: rawBalance >= 0
                  ? 'rgba(var(--balance-accent-rgb), 0.15)'
                  : 'rgba(var(--danger-rgb), 0.15)',
              }}
            />
            <div className="bh-top">
              <span className="bh-label">{tr('total_balance', 'Total Balance')}</span>
              <div
                className="bh-icon-wrap"
                style={{
                  background: rawBalance >= 0
                    ? 'rgba(var(--balance-accent-rgb), 0.12)'
                    : 'rgba(var(--danger-rgb), 0.12)',
                }}
              >
                <Wallet size={18} className="bh-icon" style={{ color: balanceColor }} />
              </div>
            </div>
            <div className="bh-mid">
              <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.1rem)', fontWeight: 800, color: balanceColor, margin: '6px 0', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {formatCurrencyNode(animatedBalance, safeFmt, currencySymbol)}
              </h2>
              {sparklineSvgPath && (
                <div className="bh-sparkline-wrap" title="Net trajectory">
                  <svg className="bh-sparkline-svg" viewBox="0 0 240 48" aria-hidden="true">
                    <path
                      d={sparklineSvgPath}
                      fill="none"
                      stroke={balanceHex}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', flexWrap: 'wrap', gap: 8,
                }}
              >
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  {tr('net_position', 'Net position')}
                </span>
                {momMetrics.balance.val !== 'New' && dateFilter !== 'all' && (
                  <div className={`bh-trend ${momMetrics.balance.dir}`} style={{ background: 'var(--glass-2)' }}>
                    {momMetrics.balance.dir === 'up' && <ArrowUpRight size={14} aria-hidden="true" />}
                    {momMetrics.balance.dir === 'down' && <ArrowDownRight size={14} aria-hidden="true" />}
                    {momMetrics.balance.dir === 'neutral' && <Minus size={14} aria-hidden="true" />}
                    <span>{momMetrics.balance.val} vs last month</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Income card */}
          <StatCard
            icon={TrendingUp}
            label={tr('total_income', 'Total Income')}
            value={formatCurrencyNode(animatedIncome, safeFmt, currencySymbol)}
            valueText={formatCurrencyText(rawIncome, safeFmt, currencySymbol)}
            colorRgb="34, 197, 94"
            accentColor="var(--success)"
            subtitle={tr('all_time', 'All time')}
            trend={dateFilter === 'all' || momMetrics.income.val === 'New' ? undefined : momMetrics.income.dir}
            trendVal={dateFilter === 'all' || momMetrics.income.val === 'New' ? undefined : momMetrics.income.val}
            className="bento-income"
          />

          {/* Expense card — truthful trend direction; sentiment in CSS */}
          <StatCard
            icon={TrendingDown}
            label={tr('total_expenses', 'Total Expenses')}
            value={formatCurrencyNode(animatedExpense, safeFmt, currencySymbol)}
            valueText={formatCurrencyText(rawExpense, safeFmt, currencySymbol)}
            colorRgb="239, 68, 68"
            accentColor="var(--danger)"
            subtitle={tr('all_time', 'All time')}
            trend={dateFilter === 'all' || momMetrics.expense.val === 'New' ? undefined : momMetrics.expense.dir}
            trendVal={dateFilter === 'all' || momMetrics.expense.val === 'New' ? undefined : momMetrics.expense.val}
            className="bento-expense"
            invertTrendColor
          />

          {/* Recent transactions */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-recent glass">
            <div className="bt-header">
              <h3 className="heading-accent">{tr('recent_transactions', 'Recent Transactions')}</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <NavLink to="/transactions" className="bt-link" title="View all transactions">View All →</NavLink>
                <button
                  type="button"
                  className="bt-icon-btn"
                  onClick={() => setShowForm(true)}
                  title="Add transaction"
                  aria-label="Add transaction"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            {parsedTransactions.length === 0 ? (
              <EmptyTransactionState onAddClick={() => setShowForm(true)} />
            ) : (
              <>
                <div className="bt-list" role="list">
                  {groupedTxns.map((item) => {
                    if (item.type === 'header') {
                      return (
                        <div key={item.key} className="bt-date-group" role="heading" aria-level={4}>
                          {item.label}
                        </div>
                      );
                    }
                    const tx = item.data;
                    return (
                      <div key={item.key} className="bt-item" role="listitem">
                        <div className={`bt-icn ${tx.type}`}><Tag size={18} aria-hidden="true" /></div>
                        <div className="bt-info">
                          <span className="bt-cat">{tx.category || 'Uncategorized'}</span>
                          <span className="bt-date">{getDateLabel(tx.date, locale)}</span>
                          {tx.note && <span className="bt-note">{tx.note}</span>}
                        </div>
                        <div className="bt-amt-group">
                          <div className={`bt-amt ${tx.type}`}>
                            {tx.type === 'income' ? '+' : '-'}
                            {formatCurrencyNode(tx.displayAmount, safeFmt, currencySymbol)}
                          </div>
                          <div className="bt-actions">
                            <button
                              type="button"
                              className="bt-action-btn"
                              onClick={() => handleEditTransaction(tx)}
                              aria-label={`Edit transaction ${tx.category || ''}`.trim()}
                              title="Edit"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              className="bt-action-btn danger"
                              onClick={() => requestDeleteTransaction(tx)}
                              aria-label={`Delete transaction ${tx.category || ''}`.trim()}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {sortedDescFiltered.length > 4 && (
                  <div className="bt-footer-action">
                    <NavLink
                      to="/transactions"
                      className="bt-view-all-btn"
                    >
                      View all {sortedDescFiltered.length} transactions →
                    </NavLink>
                  </div>
                )}
              </>
            )}
          </motion.div>

          {/* Spending vs Income chart */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-chart glass">
            <div className="bt-header">
              <h3 className="heading-accent">{tr('spending_vs_income', 'Spending vs Income')}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(dateFilter !== 'all' || categoryFilter !== 'all') && (
                  <span
                    className="bt-badge"
                    style={{
                      background: 'rgba(245,158,11,0.15)',
                      color: 'var(--warning)',
                      border: '1px solid rgba(245,158,11,0.3)',
                    }}
                  >
                    filtered view
                  </span>
                )}
                <span className="bt-badge">{tr('daily_trend', 'Daily Trend')}</span>
              </div>
            </div>
            <div className="bt-chart-wrap">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}>
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -5, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gInId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.16} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id={gExId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'} vertical={false} />
                    <XAxis
                      dataKey="name"
                      interval={chartData.length > 8 ? Math.ceil(chartData.length / 5) : 0}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={chartYAxisConfig.domain}
                      ticks={chartYAxisConfig.ticks}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      tickFormatter={(val) => {
                        if (val === 0) return '0';
                        const abs = Math.abs(val);
                        const sign = val < 0 ? '-' : '';
                        if (abs >= 1000) {
                          const k = abs / 1000;
                          return `${sign}${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
                        }
                        return String(val);
                      }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(label, payload) => {
                        const detail = payload?.[0]?.payload?.detail;
                        return detail ? `${label} · ${detail}` : label;
                      }}
                      formatter={(val) => formatCurrencyText(val, safeFmt, currencySymbol)}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: 12, fontSize: '0.78rem', fontWeight: 700 }}
                      formatter={(value) => (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {value === 'income' ? tr('income_label', 'Income') : tr('expense_label', 'Expenses')}
                        </span>
                      )}
                    />
                    <Area
                      isAnimationActive={!prefersReducedMotion && !loading}
                      animationBegin={800}
                      type="monotone"
                      dataKey="income"
                      stroke="#10b981"
                      fill={`url(#${gInId})`}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      dot={chartData.length <= 4 ? { r: 3, strokeWidth: 1.5, fill: '#10b981' } : { r: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                    />
                    <Area
                      isAnimationActive={!prefersReducedMotion && !loading}
                      animationBegin={800}
                      type="monotone"
                      dataKey="expense"
                      stroke="#ef4444"
                      fill={`url(#${gExId})`}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      dot={chartData.length <= 4 ? { r: 3, strokeWidth: 1.5, fill: '#ef4444' } : { r: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#ef4444' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="bento-empty">
                  <span className="bento-empty-icon" aria-hidden="true">
                    <LineChart size={42} strokeWidth={1.5} opacity={0.5} />
                  </span>
                  <p className="bento-empty-title">{tr('story_starts', 'Your story starts here')}</p>
                  <p className="bento-empty-sub">{tr('add_tx_timeline', 'Add transactions to see your spending timeline.')}</p>
                </div>
              )}
            </div>
            {chartData.length > 0 && (
              <div className="bt-chart-summary" role="note">
                {expenseGreaterThanIncome
                  ? `⚠️ You spent ${expenseOfIncome.toFixed(0)}% of your income this period`
                  : rawIncome > 0
                    ? `✅ You saved ${savingsRate.toFixed(1)}% of your income this period`
                    : 'Add income transactions to see your savings rate'}
              </div>
            )}
          </motion.div>

          {/* Net worth over time */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-networth glass">
            <div className="bt-header">
              <h3 className="heading-accent">Net Worth Over Time</h3>
              <LineChart size={16} className="bt-icon-muted" aria-hidden="true" />
            </div>
            {isNetWorthFlat ? (
              <div className="bento-empty" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: 'calc(100% - 36px)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                  <TrendingUp size={13} /> Steady at {formatCurrencyText(rawBalance, safeFmt, currencySymbol)}
                </div>
                <p className="bento-empty-sub" style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                  Net worth has remained steady this period.
                </p>
              </div>
            ) : (
              <div className="bt-chart-wrap" style={{ height: 120 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}>
                  <AreaChart data={netWorthData} margin={{ top: 5, right: 8, left: -5, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gNWId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={balanceHex} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={balanceHex} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={netWorthYAxisConfig.domain}
                      ticks={netWorthYAxisConfig.ticks}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      tickFormatter={(val) => {
                        if (val === 0) return '0';
                        const abs = Math.abs(val);
                        const sign = val < 0 ? '-' : '';
                        if (abs >= 1000) {
                          const k = abs / 1000;
                          return `${sign}${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
                        }
                        return String(val);
                      }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(val) => formatCurrencyText(val, safeFmt, currencySymbol)}
                    />
                    <Area
                      isAnimationActive={!prefersReducedMotion && !loading}
                      type="monotone"
                      dataKey="balance"
                      stroke={balanceHex}
                      fill={`url(#${gNWId})`}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.div>

          {/* Savings goal */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-goal glass">
            <div className="bt-header">
              <h3 className="heading-accent">{tr('savings_goal', 'Savings Goal')}</h3>
              <Target size={16} className="bt-icon-muted" aria-hidden="true" />
            </div>
            {monthlyGoal > 0 ? (
              <>
                <div className="bg-hud">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="bg-pct">
                      {`${monthlyNetSavings > 0 ? Math.floor((monthlyNetSavings / monthlyGoal) * 100) : 0}%`}
                    </span>
                    {monthlyNetSavings > monthlyGoal && (
                      <span
                        className="bg-overflow-badge"
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(16, 185, 129, 0.18)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                        }}
                      >
                        +{Math.floor((monthlyNetSavings / monthlyGoal) * 100) - 100}% surplus
                      </span>
                    )}
                  </div>
                  <span className="bg-frac">
                    {formatCurrencyNode(Math.max(0, monthlyNetSavings), safeFmt, currencySymbol)} / {formatCurrencyNode(monthlyGoal, safeFmt, currencySymbol)}
                  </span>
                </div>
                <div className="bg-track" style={{ position: 'relative', overflow: 'visible' }}>
                  <motion.div
                    className={`bg-fill ${goalProgress < 15 ? 'breathing' : ''}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, goalProgress)}%` }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : 1.5,
                      delay: prefersReducedMotion ? 0 : 0.5,
                    }}
                  >
                    <div className="bg-glow-dot" />
                  </motion.div>
                  {monthlyNetSavings > monthlyGoal && (
                    <div
                      className="bg-overflow-glow"
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: 24,
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7))',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
                <div className="bg-goal-actions-row">
                  <p className="bg-nudge">
                    {monthlyNetSavings > monthlyGoal
                      ? `Goal met · +${formatCurrencyText(monthlyNetSavings - monthlyGoal, safeFmt, currencySymbol)} surplus`
                      : goalProgress >= 100
                        ? '🎉 Monthly target achieved!'
                        : goalProgress < 15
                          ? 'Every bit counts. Keep going!'
                          : `${(100 - goalProgress).toFixed(0)}% to reach target`}
                  </p>
                  <button
                    type="button"
                    className="bg-topup-btn"
                    onClick={() => setShowForm(true)}
                    title="Contribute towards goal"
                  >
                    <Plus size={12} /> Top Up
                  </button>
                </div>
                <p className="bg-safe-spend">
                  Safe to spend: <strong>{formatCurrencyText(safeToSpend, safeFmt, currencySymbol)}</strong> / day after recurring bills
                </p>
              </>
            ) : (
              <div className="bento-empty">
                <span className="bento-empty-icon" aria-hidden="true">
                  <Target size={42} strokeWidth={1.5} opacity={0.5} />
                </span>
                <p className="bento-empty-title">{tr('set_savings_goal', 'Set a savings goal')}</p>
                <p className="bento-empty-sub">{tr('track_progress_target', 'Track your progress toward a monthly target.')}</p>
                <NavLink
                  to="/settings"
                  className="bento-empty-cta pulse-encouragement"
                  style={{ textDecoration: 'none' }}
                >
                  <Settings size={13} /> {tr('set_goal_cta', 'Set Goal →')}
                </NavLink>
              </div>
            )}
          </motion.div>

          {/* Pie chart */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-pie glass">
            <div className="bt-header">
              <h3 className="heading-accent">{tr('breakdown', 'Breakdown')}</h3>
            </div>
            <div className="bt-pie-wrap">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}>
                  <PieChart>
                    <Pie
                      isAnimationActive={!prefersReducedMotion && !loading}
                      animationBegin={800}
                      data={pieData}
                      cx="50%"
                      cy="44%"
                      innerRadius="46%"
                      outerRadius="72%"
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {pieData.map((entry, i) => (
                        <Cell
                          key={`cell-${entry.name.replace(/\s+/g, '-')}-${i}`}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(val) => {
                        const amount = Number(val) || 0;
                        const pct = pieTotal > 0 ? ((amount / pieTotal) * 100).toFixed(1) : '0.0';
                        return [`${formatCurrencyText(amount, safeFmt, currencySymbol)} · ${pct}%`, 'Spend'];
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={32}
                      wrapperStyle={{ fontSize: '0.74rem', fontWeight: 600, paddingTop: 4 }}
                      formatter={(value) => {
                        const item = pieData.find((p) => p.name === value);
                        const pct = item && pieTotal > 0 ? ` (${((item.value / pieTotal) * 100).toFixed(0)}%)` : '';
                        return <span style={{ color: 'var(--text-secondary)' }}>{value}{pct}</span>;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="bento-empty">
                  <span className="bento-empty-icon" aria-hidden="true">
                    <Tag size={42} strokeWidth={1.5} opacity={0.5} />
                  </span>
                  <p className="bento-empty-title">{tr('no_exp_yet', 'No expenses yet')}</p>
                  <p className="bento-empty-sub">{tr('track_spend_breakdown', 'Track spending to see category breakdown.')}</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* Transaction form */}
        <TransactionForm
          key={editingTx ? `edit-${editingTx.id || editingTx._id}` : `add-${showForm}`}
          isOpen={showForm}
          initialData={initialFormData}
          onClose={() => { setShowForm(false); setEditingTx(null); }}
          onSubmit={editingTx ? handleUpdateTransaction : handleAddTransaction}
          isLoading={isLoadingAction}
        />

        {/* Delete confirmation */}
        <AnimatePresence>
          {pendingDelete && (
            <ConfirmDeleteModal
              tx={pendingDelete}
              onCancel={cancelDelete}
              onConfirm={confirmDeleteTransaction}
              safeFmt={safeFmt}
              currencySymbol={currencySymbol}
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
