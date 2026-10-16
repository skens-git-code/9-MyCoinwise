/* —————————————————————————————————————
 * Dashboard Page
 * Primary financial overview with:
 *   - Hero balance card (starting balance + net of live transactions).
 *   - Income / expense stat cards with month-over-month deltas.
 *   - Recent transactions list (grouped by day, capped at 4).
 *   - Daily spending vs. income area chart.
 *   - Net worth over time area chart.
 *   - Monthly savings goal progress card.
 *   - Category breakdown pie chart.
 *   - Transaction add/edit form, delete confirmation modal.
 *
 * Key behaviors:
 *   - Respects `prefers-reduced-motion` (chart + counter animations).
 *   - Filters persist per-user in localStorage.
 *   - Starting balance is derived from liquid-type accounts.
 *   - Goal progress is computed from *this month's* net savings (not
 *     all-time) so a small monthly target isn't falsely inverted.
 *   - All amounts are FX-converted to the display currency.
 * ————————————————————————————————————— */

import React, {
  useState, useMemo, useCallback, useEffect, useRef, useId,
} from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  TrendingUp, TrendingDown, Target,
  Download, Plus, ArrowUpRight, ArrowDownRight,
  Wallet, Sparkles, Zap, Settings, Minus,
  Rocket, LineChart, Tag, RefreshCw, Share2,
  Edit3, Trash2, ChevronDown, AlertTriangle, X, PieChart as PieIcon,
  Eye, EyeOff, Calendar,
} from 'lucide-react';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { api } from '../services/api';
import ErrorBoundary from '../components/ErrorBoundary';
import TransactionForm from '../components/TransactionForm';
import PropTypes from 'prop-types';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import AnimatedNumber from '../components/AnimatedNumber';
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
import { isMobileTier } from '../utils/deviceTier';

/* ============================================================
 * Constants
 * ============================================================ */

// ── Pie chart color palette ──
const PIE_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6'];

// ── Default category suggestions (union with user's actual categories) ──
const DEFAULT_CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Shopping', 'Entertainment', 'Health',
  'Education', 'Bills', 'Salary', 'Freelance', 'Gift', 'Rent', 'Travel',
  'Fitness', 'Subscriptions', 'Utilities', 'Insurance', 'Investment', 'Other', 'Allowance',
];

// ── Locale map aligned with the rest of the app ──
const LOCALE_MAP = {
  en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN',
};
const resolveLocale = (lang) =>
  LOCALE_MAP[lang] || 'en-IN';

// ── Dark-theme detection ──
const DARK_THEMES = new Set(['amoled', 'dark', 'midnight', 'black']);
const isDarkTheme = (theme) => DARK_THEMES.has(String(theme || '').toLowerCase());

// ── localStorage key prefix for user-scoped filters ──
const STORAGE_PREFIX = 'budgeta_dash_';

/* ============================================================
 * Utilities
 * ============================================================ */

// ── Zero-pad a number to 2 digits ──
const pad2 = (n) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD (no UTC shift). */
const toLocalDateKey = (dateInput) => {
  if (!dateInput) return null;
  if (typeof dateInput === 'string') {
    const m = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Parse a YYYY-MM-DD string as local date; other formats go through Date. */
const safeParseDate = (dateInput) => {
  if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) return null;
    return new Date(dateInput.getTime());
  }
  if (typeof dateInput === 'string') {
    const m = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof dateInput !== 'string' && typeof dateInput !== 'number') return null;
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
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

// ── Capitalize the first letter of a category label ──
const canonicalCategoryName = (value) => {
  const text = String(value || '').trim();
  if (!text) return 'Other';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// ── Smart category-aware icon/emoji mapping ──
const getCategoryEmojiOrIcon = (category, type) => {
  const cat = String(category || '').toLowerCase().trim();
  if (cat.includes('food') || cat.includes('dining') || cat.includes('restaurant') || cat.includes('cafe')) return '🍔';
  if (cat.includes('grocer')) return '🛒';
  if (cat.includes('transport') || cat.includes('fuel') || cat.includes('uber') || cat.includes('cab') || cat.includes('car')) return '🚗';
  if (cat.includes('shopping') || cat.includes('cloth')) return '🛍️';
  if (cat.includes('salary') || cat.includes('income') || cat.includes('freelance') || cat.includes('paycheck')) return '💼';
  if (cat.includes('bill') || cat.includes('utility') || cat.includes('electric') || cat.includes('water')) return '⚡';
  if (cat.includes('rent') || cat.includes('mortgage') || cat.includes('home') || cat.includes('house')) return '🏠';
  if (cat.includes('entertain') || cat.includes('movie') || cat.includes('game') || cat.includes('netflix')) return '🎬';
  if (cat.includes('health') || cat.includes('med') || cat.includes('doctor') || cat.includes('pharm')) return '💊';
  if (cat.includes('invest') || cat.includes('stock') || cat.includes('crypto')) return '📈';
  if (cat.includes('travel') || cat.includes('flight') || cat.includes('hotel')) return '✈️';
  if (cat.includes('gift') || cat.includes('donat')) return '🎁';
  if (cat.includes('educat') || cat.includes('course') || cat.includes('book')) return '📚';
  if (cat.includes('fit') || cat.includes('gym')) return '💪';
  return type === 'income' ? '💰' : '🏷️';
};

const storageCache = new Map();

/** Safe localStorage write with in-memory cache update. */
const safeSetItem = (key, value) => {
  storageCache.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* quota / private mode */ }
};

/** Safe localStorage read with in-memory caching to avoid blocking main thread. */
const safeGetItem = (key, fallback) => {
  if (storageCache.has(key)) return storageCache.get(key);
  try {
    const v = localStorage.getItem(key);
    const result = v == null ? fallback : v;
    storageCache.set(key, result);
    return result;
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
    const type = String(t?.type || '').trim().toLowerCase();
    const amt = Number(t?.displayAmount ?? t?.amount) || 0;
    if (type === 'income') inc += amt;
    else if (type === 'expense') exp += amt;
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
 * Sub-Components
 * ============================================================ */

// ── Shared animation variants for cards ──
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 260 } },
};
const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };

// ── Stat tile with icon, label, value, and optional trend ──
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
      {/* ── Header: label + icon squircle badge ── */}
      <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 10 }}>
        <span className="stat-label" style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
        {Icon && (
          <div
            className="stat-icon"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: `rgba(${colorRgb}, 0.12)`,
              color: accentColor || `rgb(${colorRgb})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <Icon size={18} strokeWidth={2.4} />
          </div>
        )}
      </div>

      {/* ── Value ── */}
      <div
        className="stat-value"
        style={{
          color: accentColor || 'var(--text-primary)',
          fontSize: 'clamp(1.75rem, 3.8vw, 2.3rem)',
          fontWeight: 800,
          margin: '8px 0 6px',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>

      {/* ── Bottom row: left-aligned subtitle + optional trend indicator ── */}
      <div className="stat-bottom-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', marginTop: 4 }}>
        {subtitle && (
          <span className="stat-subtitle" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'left', fontWeight: 500 }}>
            {subtitle}
          </span>
        )}
        {trendVal !== undefined && isValidTrend && (
          <div
            className={`stat-trend ${trend} sentiment-${sentimentClass}`}
            aria-label={`Trend: ${trendVal}`}
            style={{ marginLeft: 6 }}
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

// ── Skeleton placeholder shown while the dashboard is loading ──
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

// ── Empty state shown when there are no transactions ──
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

// ── Delete confirmation modal with focus management + Escape handling ──
const ConfirmDeleteModal = ({ tx, onCancel, onConfirm, safeFmt, currencySymbol }) => {
  // The shared hook supplies initial focus, Escape, Tab trapping, scroll lock,
  // back-gesture handling and focus restoration. The previous inline effect did
  // initial focus + Escape + restore but NOT Tab trapping, so this dialog
  // declared `aria-modal="true"` while focus could still leave it.
  const confirmRef = useRef(null);
  useFocusTrap({ isOpen: Boolean(tx), onClose: onCancel, containerRef: confirmRef });

  if (!tx) return null;
  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      role="presentation"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        ref={confirmRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Delete transaction"
        className="modal-box glass"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '90%', borderRadius: 14, padding: '1.25rem', background: 'var(--bg-color)' }}
      >
        {/* ── Header: warning icon + title + close ── */}
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

        {/* ── Message ── */}
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Delete this <strong>{tx.type}</strong> of{' '}
          <strong>{formatCurrencyText(tx.amount, safeFmt, currencySymbol)}</strong>?
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
          This action cannot be undone.
        </p>

        {/* ── Actions ── */}
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
  const {
    user = null,
    transactions: rawTransactions = [],
    accounts = [],
    subscriptions = [],
    goals = [],
    theme = 'light',
    USER_ID = null,
    lang = 'en',
    currency = 'INR',
    currencyInfo,
    loading,
  } = useAppState();

  const {
    addTransaction,
    updateTransaction,
    deleteTransaction,
    fmt,
    t,
    fetchTransactions,
  } = useAppActions();

  const { showToast } = useToast();
  const prefersReducedMotion = usePrefersReducedMotion();

  // ── Derived theme / locale / currency ──
  const locale = useMemo(() => resolveLocale(lang), [lang]);
  const isDark = useMemo(() => isDarkTheme(theme), [theme]);
  const displayCurrency = useMemo(() => resolveCurrency(currency, 'INR'), [currency]);

  // ── FX rates to INR (cache or bundled fallback) ──
  const [fxRatesToInr, setFxRatesToInr] = useState(() => (
    readCachedRatesToInr() || getFallbackRatesToInr()
  ));

  // ── Fetch fresh FX rates on mount; keep bundled rates while offline ──
  useEffect(() => {
    const controller = new AbortController();
    fetchRatesToInr(controller.signal)
      .then((rates) => setFxRatesToInr(rates))
      .catch(() => { /* Offline mode keeps the bundled fallback rates. */ });
    return () => controller.abort();
  }, []);

  // ── Map account id → resolved currency ──
  const accountCurrencies = useMemo(() => {
    const result = new Map();
    for (const account of accounts) {
      if (account?.id || account?._id) {
        result.set(String(account.id || account._id), resolveCurrency(account.currency, displayCurrency));
      }
    }
    return result;
  }, [accounts, displayCurrency]);

  // ── Safe currency formatter with locale/currency fallback ──
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

  // ── Stable animated number formatter ensuring React.memo(AnimatedNumber) is not defeated ──
  const formatAnimatedCurrency = useCallback(
    (num) => formatCurrencyText(num, safeFmt, currencySymbol),
    [safeFmt, currencySymbol]
  );

  /* ---------------- State ---------------- */

  // ── Per-user storage keys for the filters ──
  const dateFilterKey = useMemo(() => userScopedKey('date_filter', USER_ID), [USER_ID]);
  const categoryFilterKey = useMemo(() => userScopedKey('category_filter', USER_ID), [USER_ID]);

  // ── UI state ──
  const [showForm, setShowForm] = useState(false);
  const [formInstanceId, setFormInstanceId] = useState(0);
  const [editingTx, setEditingTx] = useState(null);
  const [dateFilter, setDateFilter] = useState(() => safeGetItem(dateFilterKey, 'all'));
  const [categoryFilter, setCategoryFilter] = useState(() => safeGetItem(categoryFilterKey, 'all'));
  const [hoveredPieIndex, setHoveredPieIndex] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showBalance, setShowBalance] = useState(() => {
    const saved = safeGetItem('budgeta_dash_show_balance', 'true');
    return saved !== 'false';
  });
  const toggleShowBalance = useCallback(() => {
    setShowBalance((prev) => {
      const next = !prev;
      safeSetItem('budgeta_dash_show_balance', String(next));
      return next;
    });
  }, []);
  const hasLoadedOnceRef = useRef(!loading);
  if (!loading) {
    hasLoadedOnceRef.current = true;
  }
  const hasLoadedOnce = hasLoadedOnceRef.current;

  const handleOpenAddForm = useCallback(() => {
    setEditingTx(null);
    setFormInstanceId((prev) => prev + 1);
    setShowForm(true);
  }, []);

  /* ---------------- Reload filters when USER_ID changes ---------------- */
  const prevDateKeyRef = useRef(dateFilterKey);
  if (prevDateKeyRef.current !== dateFilterKey) {
    prevDateKeyRef.current = dateFilterKey;
    setDateFilter(safeGetItem(dateFilterKey, 'all'));
  }
  const prevCatKeyRef = useRef(categoryFilterKey);
  if (prevCatKeyRef.current !== categoryFilterKey) {
    prevCatKeyRef.current = categoryFilterKey;
    setCategoryFilter(safeGetItem(categoryFilterKey, 'all'));
  }

  /* ---------------- Persist filters ---------------- */
  useEffect(() => { safeSetItem(dateFilterKey, dateFilter); }, [dateFilterKey, dateFilter]);
  useEffect(() => { safeSetItem(categoryFilterKey, categoryFilter); }, [categoryFilterKey, categoryFilter]);

  /* ============================================================
   * Data Processing
   * ============================================================ */

  // 1. Parse all transactions
  //    Filter: not deleted, past or today, valid date and amount,
  //    FX-converted to display currency. Future-dated rows are
  //    excluded so projections aren't skewed. Type is normalized
  //    case-insensitively so backend variants (INCOME/Expense) still chart.
  const allParsed = useMemo(() => {
    if (!Array.isArray(rawTransactions)) return [];
    const deduped = dedupeTransactions(rawTransactions, { excludeFuture: false });
    const out = [];
    const endOfToday = getAppDate();
    endOfToday.setHours(23, 59, 59, 999);
    for (const tx of deduped) {
      if (!tx || typeof tx !== 'object') continue;
      if (tx.is_deleted === true || tx.is_deleted === 'true') continue;
      const txType = String(tx.type || '').trim().toLowerCase();
      if (txType !== 'income' && txType !== 'expense') continue;
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
        type: txType,
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
  //    Unfiltered metrics drive the hero + income + expense cards.
  //    Filtered metrics drive the charts and category breakdown.
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

  // 5. Starting balance from liquid-type accounts (FX-converted)
  // Missing/unknown account types are treated as liquid so the net-worth
  // chart still seeds correctly instead of flat-lining at net savings.
  const startingBalance = useMemo(() => {
    if (!Array.isArray(accounts) || accounts.length === 0) return 0;
    const liquidTypes = new Set(['bank', 'wallet', 'cash', 'credit_card', 'other']);
    return accounts
      .filter((a) => {
        if (!a || a.is_active === false) return false;
        const t = String(a.type || '').trim().toLowerCase();
        return t === '' || liquidTypes.has(t);
      })
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

  // Primary active goal fallback from user goals collection
  const primaryGoal = useMemo(() => {
    if (!Array.isArray(goals) || goals.length === 0) return null;
    return (
      goals.find(
        (g) => !g.is_completed && !g.is_archived && toNumber(g.saved, 0) < toNumber(g.target, 0)
      ) || goals[0]
    );
  }, [goals]);

  const activeGoalTarget = useMemo(() => {
    if (monthlyGoal > 0) return monthlyGoal;
    if (primaryGoal) return toNumber(primaryGoal.target, 0);
    return 0;
  }, [monthlyGoal, primaryGoal]);

  const activeGoalSaved = useMemo(() => {
    if (monthlyGoal > 0) return Math.max(0, monthlyNetSavings);
    if (primaryGoal) return toNumber(primaryGoal.saved, 0);
    return 0;
  }, [monthlyGoal, monthlyNetSavings, primaryGoal]);

  const hasSavingsGoal = activeGoalTarget > 0;

  // ── Spendable balance: liquid opening balances + all-time net ──
  const spendableBalance = useMemo(() => {
    const liquidTypes = new Set(['bank', 'wallet', 'cash', 'credit_card', 'other']);
    const liquidOpeningBalance = (Array.isArray(accounts) ? accounts : [])
      .filter((account) => {
        if (!account || account?.is_active === false) return false;
        const t = String(account?.type || '').trim().toLowerCase();
        return t === '' || liquidTypes.has(t);
      })
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

  // ── Safe-to-spend daily amount (after recurring bills, capped) ──
  const safeToSpend = useMemo(() => {
    if (spendableBalance <= 0) return 0;
    const today = getAppDate();
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const daysRemaining = Math.max(1, monthEnd.getDate() - today.getDate() + 1);
    const recurringBills = (Array.isArray(subscriptions) ? subscriptions : [])
      .filter((sub) => !sub?.is_paused && !sub?.cancelled_at)
      .reduce((sum, sub) => {
        const rawAmount = toNumber(sub?.amount, 0);
        const subCurrency = resolveCurrency(sub?.currency, displayCurrency);
        const amount = convertCurrency(rawAmount, subCurrency, displayCurrency, fxRatesToInr) ?? rawAmount;
        const cycle = String(sub?.cycle || sub?.billing_cycle || sub?.frequency || 'monthly').toLowerCase();
        if (cycle === 'yearly' || cycle === 'annual') return sum + amount / 12;
        if (cycle === 'quarterly') return sum + amount / 3;
        if (cycle === 'weekly') return sum + amount * 4.33;
        if (cycle === 'daily') return sum + amount * 30;
        return sum + amount;
      }, 0);
    const netAvailable = Math.max(0, spendableBalance - recurringBills);
    const dailyRaw = netAvailable / daysRemaining;
    const dailyCapped = Math.min(dailyRaw, Math.max(100, spendableBalance * 0.05));
    return Math.max(0, dailyCapped);
  }, [spendableBalance, subscriptions, displayCurrency, fxRatesToInr]);

  // 7. Animated counter completion state for hero card glow
  const [balanceDone, setBalanceDone] = useState(false);
  const handleBalanceComplete = useCallback(() => setBalanceDone(true), []);
  const goalProgress = useMemo(() => {
    if (activeGoalTarget <= 0) return 0;
    return Math.max(0, Math.min((activeGoalSaved / activeGoalTarget) * 100, 100));
  }, [activeGoalSaved, activeGoalTarget]);

  // 9. Daily average spend over the last 30 days
  const dailyAverageSpend = useMemo(() => {
    if (!Array.isArray(allParsed) || allParsed.length === 0) return 0;
    const cutoff = getAppDate();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 30);
    let total = 0;
    for (const t of allParsed) {
      const type = String(t?.type || '').trim().toLowerCase();
      if (type !== 'expense') continue;
      if (t.parsedDate < cutoff) continue;
      total += Number(t.displayAmount ?? t.amount) || 0;
    }
    return total / 30;
  }, [allParsed]);

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
      const amt = Number(t.displayAmount ?? t.amount) || 0;
      const type = String(t.type || '').trim().toLowerCase();
      const inCurrent = d >= currentStart && dMs <= nowMs;
      const inPrev = d >= prevStart && d <= prevEnd;
      if (type === 'income') {
        if (inCurrent) curIncome += amt;
        else if (inPrev) prevIncome += amt;
      } else if (type === 'expense') {
        if (inCurrent) curExpense += amt;
        else if (inPrev) prevExpense += amt;
      }
    }

    // ── Percent change with fallbacks for zero baselines ──
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
      const type = String(t?.type || '').trim().toLowerCase();
      const amt = Number(t?.displayAmount ?? t?.amount) || 0;
      const delta = type === 'income' ? amt : type === 'expense' ? -amt : 0;
      buckets.set(key, (buckets.get(key) || 0) + delta);
    }
    const sorted = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length < 5) return null;
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
      const type = String(t?.type || '').trim().toLowerCase();
      const amt = Number(t?.displayAmount ?? t?.amount) || 0;
      if (type === 'income') entry.income += amt;
      else if (type === 'expense') entry.expense += amt;
      const category = canonicalCategoryName(t.category);
      entry.categories.set(category, (entry.categories.get(category) || 0) + amt);
    }

    // ── Determine the full day range based on the active date filter ──
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

    // ── Enumerate every day in the range ──
    const allDays = [];
    const curr = new Date(start);
    while (curr <= end) {
      allDays.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    const daysToUse = allDays.length > 30 ? allDays.slice(-30) : allDays;

    // ── Fill in zero-days so the chart is continuous ──
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

    // ── Final labels (with year when the range spans years) ──
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
  // The window always extends to today with a minimum 7-day span so that
  // even a single day of activity renders a visible trajectory instead of
  // collapsing to one point (which recharts cannot draw as an area).
  const netWorthData = useMemo(() => {
    if (sortedAscAll.length === 0) return [];
    const deltaMap = new Map();
    for (const t of sortedAscAll) {
      const key = toLocalDateKey(t.parsedDate);
      if (!key) continue;
      const type = String(t?.type || '').trim().toLowerCase();
      const amt = Number(t?.displayAmount ?? t?.amount) || 0;
      const delta = type === 'income' ? amt : type === 'expense' ? -amt : 0;
      deltaMap.set(key, (deltaMap.get(key) || 0) + delta);
    }

    const firstTxDate = sortedAscAll[0].parsedDate;
    const lastTxDate = sortedAscAll[sortedAscAll.length - 1].parsedDate;
    const now = getAppDate();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start = new Date(firstTxDate.getFullYear(), firstTxDate.getMonth(), firstTxDate.getDate());
    let end = new Date(lastTxDate.getFullYear(), lastTxDate.getMonth(), lastTxDate.getDate());
    if (end < today) end = today;
    const MIN_SPAN_DAYS = 7;
    const spanDays = Math.round((end - start) / 86400000);
    if (spanDays < MIN_SPAN_DAYS) {
      start = new Date(end);
      start.setDate(start.getDate() - (MIN_SPAN_DAYS - 1));
    }

    const allDays = [];
    const curr = new Date(start);
    while (curr <= end) {
      allDays.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    const daysToUse = allDays.length > 30 ? allDays.slice(-30) : allDays;

    // ── Seed the running total with starting balance + pre-window deltas ──
    let running = startingBalance;
    const firstUsedDate = daysToUse[0];
    for (const t of sortedAscAll) {
      const day = new Date(t.parsedDate.getFullYear(), t.parsedDate.getMonth(), t.parsedDate.getDate());
      if (day < firstUsedDate) {
        const type = String(t?.type || '').trim().toLowerCase();
        const amt = Number(t?.displayAmount ?? t?.amount) || 0;
        running += (type === 'income' ? amt : type === 'expense' ? -amt : 0);
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

  // ── Net worth flatness check ──
  // Only hide the chart when there are fewer than 2 points. A constant
  // balance still renders (Y-axis is padded by calculateUniformTicks), so
  // users with a single day of activity see a chart instead of "steady".
  const isNetWorthFlat = useMemo(() => {
    try {
      if (netWorthData.length < 2) return true;
      return false;
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
      const type = String(t?.type || '').trim().toLowerCase();
      if (type !== 'expense') continue;
      const amt = Math.abs(Number(t?.displayAmount ?? t?.amount) || 0);
      if (amt <= 0) continue;
      const cat = canonicalCategoryName(t.category);
      map.set(cat, (map.get(cat) || 0) + amt);
      totalExp += amt;
    }
    if (map.size === 0 || totalExp === 0) return null;
    const [name, amount] = Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0];
    return { name, amount, pct: ((amount / totalExp) * 100).toFixed(0) };
  }, [parsedTransactions]);

  // 15. Pie data (top 5 categories + 'Other' for the selected period, ensuring 100% mathematical integrity)
  const pieData = useMemo(() => {
    const catMap = new Map();
    for (const t of parsedTransactions) {
      const type = String(t?.type || '').trim().toLowerCase();
      if (type !== 'expense') continue;
      const amt = Math.abs(Number(t?.displayAmount ?? t?.amount) || 0);
      if (amt <= 0) continue;
      const category = canonicalCategoryName(t.category);
      catMap.set(category, (catMap.get(category) || 0) + amt);
    }
    const entries = Array.from(catMap.entries())
      .filter(([_, val]) => val > 0)
      .sort((a, b) => b[1] - a[1]);

    if (entries.length <= 6) {
      return entries.map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
    }

    const top5 = entries.slice(0, 5).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
    const remainder = entries.slice(5).reduce((sum, [_, val]) => sum + val, 0);
    if (remainder > 0) {
      top5.push({ name: 'Other', value: Number(remainder.toFixed(2)) });
    }
    return top5;
  }, [parsedTransactions]);

  const pieTotal = useMemo(
    () => Number(pieData.reduce((sum, entry) => sum + entry.value, 0).toFixed(2)),
    [pieData]
  );

  // 16. Grouped recent transactions (Clean teaser capped at 4 items)
  const groupedTxns = useMemo(() => {
    const list = sortedDescFiltered.slice(0, 4);
    const groups = [];
    let lastLabel = '';
    for (const tx of list) {
      const label = getDateLabel(tx.date || tx.parsedDate, locale);
      if (label !== lastLabel && label !== '—') {
        groups.push({ type: 'header', label, key: `h-${label}-${groups.length}` });
        lastLabel = label;
      }
      groups.push({ type: 'tx', data: tx, key: tx.id || tx._id || `t-${groups.length}` });
    }
    return groups;
  }, [sortedDescFiltered, locale]);

  // 17. Category options (defaults ∪ actual categories)
  const categoryOptions = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES);
    for (const t of allParsed) {
      if (t.category) set.add(canonicalCategoryName(t.category));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allParsed]);

  /* ---------------- Localization Helper ---------------- */
  const tr = useCallback((key, fallback) => {
    const value = t && typeof t === 'function' ? t(key) : null;
    return value && value !== key ? value : fallback;
  }, [t]);

  /* ---------------- Theme Colors ---------------- */
  const balanceHex = rawBalance >= 0
    ? (isDark ? '#f8fafc' : '#0f172a')
    : (isDark ? '#f87171' : '#dc2626');

  const balanceTrendColor = rawBalance >= 0
    ? (isDark ? '#34d399' : '#10b981')
    : (isDark ? '#f87171' : '#dc2626');

  // ── Chart tooltip style (dark / light aware) ──
  const tooltipStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(8,8,22,0.98)' : 'rgba(255,255,255,0.97)',
    border: `1px solid ${isDark ? 'rgba(5,150,105,0.3)' : 'rgba(5,150,105,0.2)'}`,
    borderRadius: 12,
    color: isDark ? '#f8fafc' : '#0f172a',
    boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 24px rgba(15,23,42,0.12)',
    backdropFilter: 'blur(12px)',
  }), [isDark]);

  // ── Stable SVG gradient ids for each chart ──
  const gInId = useStableId('gIn');
  const gExId = useStableId('gEx');
  const gNWId = useStableId('gNW');

  // ── Explicit chart heights: recharts ResponsiveContainer with height="100%"
  // needs a definite parent height, otherwise it computes 0 inside auto-height
  // flex parents (especially on mobile where min-height is removed). ──
  const SPENDING_CHART_HEIGHT = 260;
  const NETWORTH_CHART_HEIGHT = 180;

  /* ============================================================
   * Event Handlers
   * ============================================================ */

  // ── Export the transaction set as CSV (via backend API, with local fallback) ──
  const handleExportCSV = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const activeUserId = USER_ID || user?._id || user?.id;
      if (activeUserId && typeof api?.exportData === 'function') {
        try {
          await api.exportData(activeUserId, { format: 'csv' });
          showToast('success', 'CSV exported from backend successfully!');
          return;
        } catch (backendErr) {
          console.warn('Backend export failed, falling back to local export:', backendErr);
        }
      }

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
  }, [USER_ID, user, allParsed, parsedTransactions, isExporting, showToast, displayCurrency]);

  // ── Refresh transaction data from the API ──
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

  // ── Share a plain-text summary (Web Share API, else clipboard) ──
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

  // ── Add a new transaction ──
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
      const errorMsg =
        err?.userMessage ||
        err?.response?.data?.error ||
        err?.response?.data?.errors?.[0]?.msg ||
        err?.message ||
        'Failed to add transaction.';
      showToast('error', errorMsg);
    } finally {
      setIsLoadingAction(false);
    }
  }, [addTransaction, showToast]);

  // ── Open the form in edit mode for a transaction ──
  const handleEditTransaction = useCallback((tx) => {
    setEditingTx(tx);
    setFormInstanceId((prev) => prev + 1);
    setShowForm(true);
  }, []);

  // ── Update an existing transaction ──
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
      const errorMsg =
        err?.userMessage ||
        err?.response?.data?.error ||
        err?.response?.data?.errors?.[0]?.msg ||
        err?.message ||
        'Failed to update transaction.';
      showToast('error', errorMsg);
    } finally {
      setIsLoadingAction(false);
    }
  }, [updateTransaction, editingTx, showToast]);

  // ── Delete flow: request → confirm → delete ──
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
      showToast('error', err?.userMessage || err?.message || 'Failed to delete transaction.');
    } finally {
      setIsLoadingAction(false);
    }
  }, [pendingDelete, deleteTransaction, showToast]);

  /* ---------------- Keyboard: Ctrl+N only ---------------- */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleOpenAddForm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleOpenAddForm]);

  /* ============================================================
   * Modal Initial Data (stable)
   * ============================================================ */
  const todayKey = useMemo(() => toLocalDateKey(getAppDate()), []);
  const initialFormData = useMemo(
    () => editingTx || { date: todayKey },
    [editingTx, todayKey]
  );

  /* ============================================================
   * Render
   * ============================================================ */

  // ── Early exit: show the loading skeleton until we have a user ──
  if ((loading && !user) || !user) return <DashboardSkeleton />;

  const periodIncome = financialMetrics.income;
  const periodExpense = financialMetrics.expense;
  const periodExpenseGreaterThanIncome = periodExpense > periodIncome;

  return (
    <ErrorBoundary>
      <div className="bento-dashboard">
        {/* ===================== Header ===================== */}
        <div className="bento-header">
          <div className="bento-title-wrap">
            <h2 className="bento-page-title">{tr('dashboard', 'Dashboard')}</h2>
            <div className="dashboard-live-badge" title="Live financial overview">
              <span className="live-dot" />
              <span>Live Overview</span>
            </div>
          </div>
          <div className="bento-actions">
            {/* ── Refresh ── */}
            <motion.button
              type="button"
              className="bbtn-icon bbtn-refresh"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh"
              aria-label="Refresh data"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
            </motion.button>

            {/* ── Share ── */}
            <motion.button
              type="button"
              className="bbtn-icon bbtn-share"
              onClick={handleShare}
              title="Share dashboard"
              aria-label="Share"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Share2 size={16} />
            </motion.button>

            {/* ── Export CSV ── */}
            <div className="export-group">
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

            {/* ── Add transaction ── */}
            <motion.button
              type="button"
              className="bbtn-pri bbtn-full"
              onClick={handleOpenAddForm}
              title="Ctrl+N"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={16} />
              <span>{tr('add_transaction', 'Add Transaction')}</span>
            </motion.button>
          </div>
        </div>

        {/* ===================== Quick stats strip ===================== */}
        <motion.div
          className="dashboard-quick-stats-strip"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* ── Savings rate ── */}
          <div className="dqs-pill">
            <span className="dqs-label">
              <TrendingUp size={13} style={{ color: '#10b981' }} aria-hidden="true" />
              Savings Rate:
            </span>
            <span className="dqs-val">{savingsRate.toFixed(1)}%</span>
            <span className={`dqs-badge ${savingsRate >= 20 ? 'pos' : 'neutral'}`}>
              {savingsRate >= 20 ? 'Healthy' : savingsRate > 0 ? 'Active' : 'Low'}
            </span>
          </div>

          <div className="dqs-divider" />

          {/* ── Top expense category ── */}
          <div className="dqs-pill">
            <span className="dqs-label">
              <Tag size={13} style={{ color: '#0ea5e9' }} aria-hidden="true" />
              Top Expense:
            </span>
            <span className="dqs-val">
              {topExpenseCategory ? topExpenseCategory.name : '—'}
            </span>
            {topExpenseCategory ? (
              <span className="dqs-badge neutral">
                {topExpenseCategory.pct}% of total
              </span>
            ) : (
              <span className="dqs-badge neutral">None</span>
            )}
          </div>

          <div className="dqs-divider" />

          {/* ── Daily average spend (30d) ── */}
          <div className="dqs-pill">
            <span className="dqs-label">
              <Zap size={13} style={{ color: '#f59e0b' }} aria-hidden="true" />
              Daily Avg Spend:
            </span>
            <span className="dqs-val">
              {formatCurrencyNode(dailyAverageSpend, safeFmt, currencySymbol)}
            </span>
            <span className="dqs-badge neutral">
              30d avg
            </span>
          </div>
        </motion.div>

        {/* ===================== Filters ===================== */}
        <motion.div
          className="bento-filters"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          role="search"
          aria-label="Filter transactions"
        >
          {/* ── Quick Preset Pills ── */}
          <div className="dashboard-presets">
            {[
              { id: 'all', label: tr('all_time', 'All Time') },
              { id: 'thisMonth', label: tr('this_month', 'This Month') },
              { id: '30days', label: tr('last_30_days', 'Last 30 Days') },
              { id: '7days', label: tr('last_7_days', 'Last 7 Days') },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`dashboard-preset-btn ${dateFilter === preset.id ? 'active' : ''}`}
                onClick={() => setDateFilter(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* ── Date filter select (responsive & accessible) ── */}
          <div className="filter-select-wrap">
            <span className="filter-select-icon" aria-hidden="true">
              <Calendar size={13} />
            </span>
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
            <span className="filter-select-arrow" aria-hidden="true">
              <ChevronDown size={14} />
            </span>
          </div>

          {/* ── Category filter select ── */}
          <div className="filter-select-wrap">
            <span className="filter-select-icon" aria-hidden="true">
              <Tag size={13} />
            </span>
            <select
              className="filter-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="all">{tr('all_categories', 'All Categories')}</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="filter-select-arrow" aria-hidden="true">
              <ChevronDown size={14} />
            </span>
          </div>

          {/* ── Clear filters (only when a filter is active) ── */}
          {(dateFilter !== 'all' || categoryFilter !== 'all') && (
            <button
              type="button"
              className="filter-clear"
              onClick={() => { setDateFilter('all'); setCategoryFilter('all'); }}
              aria-label="Clear filters"
            >
              <X size={13} aria-hidden="true" />
              {tr('clear_filters', 'Clear Filters')}
            </button>
          )}
        </motion.div>

        {/* ===================== Bento grid ===================== */}
        <motion.div className="bento-grid" variants={STAGGER} initial="hidden" animate="show">
          {/* ── Ambient decorative orbs (Desktop only) ── */}
          {!isMobileTier() && (
            <>
              <div className="ambient-orb orb-chart" style={{ top: '15%', right: '5%' }} aria-hidden="true" />
              <div className="ambient-orb orb-goal" style={{ bottom: '10%', left: '10%' }} aria-hidden="true" />
              <div className="ambient-orb orb-ai" style={{ bottom: '2%', right: '2%' }} aria-hidden="true" />
            </>
          )}

          {/* ===================== Hero — Total Balance ===================== */}
          <motion.div
            variants={CARD_VARIANTS}
            className={`bento-tile bento-hero stat-card glass ${balanceDone ? 'numberGlow' : ''}`}
            role="region"
            aria-label={`Total balance: ${formatCurrencyText(rawBalance, safeFmt, currencySymbol)}`}
            aria-live="polite"
          >
            <div
              className="blob-glow"
              style={{
                background: rawBalance >= 0
                  ? 'rgba(16, 185, 129, 0.16)'
                  : 'rgba(239, 68, 68, 0.16)',
              }}
            />
            <div className="bh-top">
              <span className="bh-label">
                <span className="bh-indicator-dot" style={{ background: rawBalance >= 0 ? '#10b981' : '#ef4444' }} aria-hidden="true" />
                {tr('total_balance', 'Total Balance')}
              </span>
              <div className="bh-top-actions">
                <button
                  type="button"
                  className="bh-eye-btn"
                  onClick={toggleShowBalance}
                  title={showBalance ? 'Hide balance' : 'Show balance'}
                  aria-label={showBalance ? 'Hide balance' : 'Show balance'}
                >
                  {showBalance ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <div className="bh-icon-wrap" aria-hidden="true">
                  <Wallet size={18} strokeWidth={2} />
                </div>
              </div>
            </div>
            <div className="bh-mid">
              <h2
                className="bh-balance-num"
                style={{
                  fontSize: 'clamp(2.4rem, 5.5vw, 3.4rem)',
                  fontWeight: 800,
                  color: balanceHex,
                  margin: '4px 0 8px',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.05,
                }}
              >
                <span style={{ fontSize: 'inherit', color: 'inherit', fontWeight: 'inherit' }}>
                  {loading && !hasLoadedOnce ? (
                    <span className="balance-placeholder" style={{ opacity: 0.6 }}>--</span>
                  ) : !showBalance ? (
                    <span>••••••••</span>
                  ) : (
                    <AnimatedNumber
                      value={rawBalance}
                      duration={900}
                      format={formatAnimatedCurrency}
                      onComplete={handleBalanceComplete}
                      skipAnimationOnMount
                    />
                  )}
                </span>
              </h2>

              {/* ── Sparkline (net trajectory) ── */}
              {sparklineSvgPath && (
                <div className="bh-sparkline-wrap" title="Net trajectory">
                  <svg className="bh-sparkline-svg" viewBox="0 0 240 48" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
                    <path
                      d={sparklineSvgPath}
                      fill="none"
                      stroke={balanceTrendColor}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}

              {/* ── Net position + month-over-month trend ── */}
              <div className="bh-bottom-meta">
                <span className="bh-net-label">
                  {tr('net_position', 'Net Position')}
                </span>
                {momMetrics.balance.val !== 'New' && dateFilter !== 'all' && (
                  <div className={`bh-trend ${momMetrics.balance.dir}`}>
                    {momMetrics.balance.dir === 'up' && <ArrowUpRight size={13} aria-hidden="true" />}
                    {momMetrics.balance.dir === 'down' && <ArrowDownRight size={13} aria-hidden="true" />}
                    {momMetrics.balance.dir === 'neutral' && <Minus size={13} aria-hidden="true" />}
                    <span>{momMetrics.balance.val} vs last month</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ===================== Income card ===================== */}
          <StatCard
            icon={ArrowUpRight}
            label={tr('total_income', 'Total Income')}
            value={
              loading && !hasLoadedOnce ? (
                <span style={{ opacity: 0.6 }}>--</span>
              ) : (
                <AnimatedNumber
                  value={rawIncome}
                  duration={800}
                  format={formatAnimatedCurrency}
                  skipAnimationOnMount
                />
              )
            }
            valueText={formatCurrencyText(rawIncome, safeFmt, currencySymbol)}
            colorRgb={isDark ? '52, 211, 153' : '16, 185, 129'}
            accentColor={isDark ? '#34d399' : '#10b981'}
            subtitle={tr('all_time', 'All time')}
            trend={dateFilter === 'all' || momMetrics.income.val === 'New' ? undefined : momMetrics.income.dir}
            trendVal={dateFilter === 'all' || momMetrics.income.val === 'New' ? undefined : momMetrics.income.val}
            className="bento-income"
          />

          {/* ===================== Expense card ===================== */}
          {/* Expense card — truthful trend direction; sentiment in CSS */}
          <StatCard
            icon={ArrowDownRight}
            label={tr('total_expenses', 'Total Expenses')}
            value={
              loading && !hasLoadedOnce ? (
                <span style={{ opacity: 0.6 }}>--</span>
              ) : (
                <AnimatedNumber
                  value={rawExpense}
                  duration={800}
                  format={formatAnimatedCurrency}
                  skipAnimationOnMount
                />
              )
            }
            valueText={formatCurrencyText(rawExpense, safeFmt, currencySymbol)}
            colorRgb={isDark ? '248, 113, 113' : '220, 38, 38'}
            accentColor={isDark ? '#f87171' : '#dc2626'}
            subtitle={tr('all_time', 'All time')}
            trend={dateFilter === 'all' || momMetrics.expense.val === 'New' ? undefined : momMetrics.expense.dir}
            trendVal={dateFilter === 'all' || momMetrics.expense.val === 'New' ? undefined : momMetrics.expense.val}
            className="bento-expense"
            invertTrendColor
          />

          {/* ===================== Recent transactions ===================== */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-recent glass">
            <div className="bt-header">
              <h3 className="heading-accent">{tr('recent_transactions', 'Recent Transactions')}</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <NavLink to="/transactions" className="bt-link" title="View all transactions">View all →</NavLink>
                <button
                  type="button"
                  className="bt-icon-btn"
                  onClick={handleOpenAddForm}
                  title="Add transaction"
                  aria-label="Add transaction"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {parsedTransactions.length === 0 ? (
              <EmptyTransactionState onAddClick={handleOpenAddForm} />
            ) : (
              <>
                {/* ── Grouped list (header rows + tx rows) ── */}
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
                        <div className={`bt-icn ${tx.type}`}>
                          <span className="bt-cat-emoji" aria-hidden="true">
                            {getCategoryEmojiOrIcon(tx.category, tx.type)}
                          </span>
                        </div>
                        <div className="bt-info">
                          <span className="bt-cat">{tx.category || 'Uncategorized'}</span>
                          <span className="bt-date">{getDateLabel(tx.date, locale)}</span>
                          {tx.note && tx.note.trim().toLowerCase() !== String(tx.category || '').trim().toLowerCase() && (
                            <span className="bt-note">{tx.note}</span>
                          )}
                        </div>
                        <div className="bt-amt-group">
                          {/* ── Signed amount ── */}
                          <div className={`bt-amt ${tx.type}`}>
                            {tx.type === 'income' ? '+' : '-'}
                            {formatCurrencyNode(tx.displayAmount, safeFmt, currencySymbol)}
                          </div>

                          {/* ── Edit / delete actions ── */}
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

                {/* ── "View all" footer when more than 4 transactions exist ── */}
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

          {/* ===================== Spending vs Income chart ===================== */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-chart glass">
            <div className="bt-header">
              <h3 className="heading-accent">{tr('spending_vs_income', 'Spending vs Income')}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* ── Filter-active hint ── */}
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

            <div className="bt-chart-wrap" style={{ height: SPENDING_CHART_HEIGHT, minHeight: 220 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={SPENDING_CHART_HEIGHT} minWidth={1} minHeight={200}>
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -5, bottom: 0 }}>
                    <defs>
                      {/* ── Income area gradient ── */}
                      <linearGradient id={gInId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
                        <stop offset="65%" stopColor="#10b981" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>

                      {/* ── Expense area gradient ── */}
                      <linearGradient id={gExId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.28} />
                        <stop offset="65%" stopColor="#ef4444" stopOpacity={0.06} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
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
                      formatter={(val, name) => [
                        formatCurrencyText(val, safeFmt, currencySymbol),
                        name === 'income' ? tr('income_label', 'Income') : tr('expense_label', 'Expenses'),
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: 12, fontSize: '0.78rem', fontWeight: 700 }}
                      formatter={(value) => (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {value === 'income' ? tr('income_label', 'Income') : tr('expense_label', 'Expenses')}
                        </span>
                      )}
                    />

                    {/* ── Income series ── */}
                    <Area
                      isAnimationActive={!prefersReducedMotion && !loading}
                      animationBegin={100}
                      animationDuration={900}
                      animationEasing="ease-out"
                      type="monotone"
                      dataKey="income"
                      stroke="#10b981"
                      fill={`url(#${gInId})`}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      dot={chartData.length <= 4 ? { r: 3, strokeWidth: 1.5, fill: '#10b981' } : { r: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                    />

                    {/* ── Expense series ── */}
                    <Area
                      isAnimationActive={!prefersReducedMotion && !loading}
                      animationBegin={100}
                      animationDuration={900}
                      animationEasing="ease-out"
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
                /* ── Empty state when there is no chart data ── */
                <div className="bento-empty">
                  <span className="bento-empty-icon" aria-hidden="true">
                    <LineChart size={42} strokeWidth={1.5} opacity={0.5} />
                  </span>
                  <p className="bento-empty-title">{tr('story_starts', 'Your story starts here')}</p>
                  <p className="bento-empty-sub">{tr('add_tx_timeline', 'Add transactions to see your spending timeline.')}</p>
                </div>
              )}
            </div>

            {/* ── Insight summary under the chart ── */}
            {chartData.length > 0 && (
              <div className="bt-chart-summary" role="note">
                {periodExpenseGreaterThanIncome
                  ? periodIncome > 0
                    ? `⚠️ You spent ${expenseOfIncome.toFixed(0)}% of your income this period`
                    : `⚠️ You had ${formatCurrencyText(periodExpense, safeFmt, currencySymbol)} in expenses with no income this period`
                  : periodIncome > 0
                    ? `✅ You saved ${savingsRate.toFixed(1)}% of your income this period`
                    : 'Add income transactions to see your savings rate'}
              </div>
            )}
          </motion.div>

          {/* ===================== Net worth over time ===================== */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-networth glass">
            <div className="bt-header">
              <h3 className="heading-accent">Net Worth Over Time</h3>
              <LineChart size={16} className="bt-icon-muted" aria-hidden="true" />
            </div>

            {isNetWorthFlat ? (
              /* ── Steady state: flat net worth ── */
              <div className="bento-empty" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: 'calc(100% - 36px)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                  <TrendingUp size={13} /> Steady at {formatCurrencyText(rawBalance, safeFmt, currencySymbol)}
                </div>
                <p className="bento-empty-sub" style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                  Net worth has remained steady this period.
                </p>
              </div>
            ) : (
              /* ── Net worth chart ── */
              <div className="bt-chart-wrap" style={{ height: NETWORTH_CHART_HEIGHT, minHeight: 160 }}>
                <ResponsiveContainer width="100%" height={NETWORTH_CHART_HEIGHT} minWidth={1} minHeight={160}>
                  <AreaChart data={netWorthData} margin={{ top: 5, right: 8, left: -5, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gNWId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={balanceTrendColor} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={balanceTrendColor} stopOpacity={0} />
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
                      animationBegin={100}
                      animationDuration={900}
                      animationEasing="ease-out"
                      type="monotone"
                      dataKey="balance"
                      stroke={balanceTrendColor}
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

          {/* ===================== Savings goal ===================== */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-goal glass">
            <div className="bt-header">
              <h3 className="heading-accent">{primaryGoal?.name || tr('savings_goal', 'Savings Goal')}</h3>
              <Target size={16} className="bt-icon-muted" aria-hidden="true" />
            </div>

            {hasSavingsGoal ? (
              <>
                {/* ── Goal HUD: percentage + overflow badge + fraction ── */}
                <div className="bg-hud">
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="bg-pct">
                      {`${activeGoalTarget > 0 ? Math.floor((activeGoalSaved / activeGoalTarget) * 100) : 0}%`}
                    </span>
                    {activeGoalSaved > activeGoalTarget && (
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
                        +{Math.floor((activeGoalSaved / activeGoalTarget) * 100) - 100}% surplus
                      </span>
                    )}
                  </div>
                  <span className="bg-frac">
                    {formatCurrencyNode(Math.max(0, activeGoalSaved), safeFmt, currencySymbol)} / {formatCurrencyNode(activeGoalTarget, safeFmt, currencySymbol)}
                  </span>
                </div>

                {/* ── Animated progress bar ── */}
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

                  {/* ── Overflow glow when the goal is exceeded ── */}
                  {activeGoalSaved > activeGoalTarget && (
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

                {/* ── Goal nudge + top-up button ── */}
                <div className="bg-goal-actions-row">
                  <p className="bg-nudge">
                    {activeGoalSaved > activeGoalTarget
                      ? `Goal met · +${formatCurrencyText(activeGoalSaved - activeGoalTarget, safeFmt, currencySymbol)} surplus`
                      : goalProgress >= 100
                        ? '🎉 Target achieved!'
                        : goalProgress < 15
                          ? 'Every bit counts. Keep going!'
                          : `${(100 - goalProgress).toFixed(0)}% to reach target`}
                  </p>
                  <NavLink
                    to="/goals"
                    className="bg-topup-btn"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    title="Manage savings goals"
                  >
                    <Plus size={12} /> Top Up
                  </NavLink>
                </div>

                {/* ── Safe-to-spend footer ── */}
                <p className="bg-safe-spend">
                  Safe to spend: <strong>{formatCurrencyText(safeToSpend, safeFmt, currencySymbol)}</strong> / day after recurring bills
                </p>
              </>
            ) : (
              /* ── Empty state: no savings goal set ── */
              <div className="bento-empty">
                <span className="bento-empty-icon" aria-hidden="true">
                  <Target size={42} strokeWidth={1.5} opacity={0.5} />
                </span>
                <p className="bento-empty-title">{tr('set_savings_goal', 'Set a savings goal')}</p>
                <p className="bento-empty-sub">{tr('track_progress_target', 'Track your progress toward a savings target.')}</p>
                <NavLink
                  to="/goals"
                  className="bento-empty-cta pulse-encouragement"
                  style={{ textDecoration: 'none' }}
                >
                  <Target size={13} /> {tr('set_goal_cta', 'Set Goal →')}
                </NavLink>
              </div>
            )}
          </motion.div>

          {/* ===================== Pie chart (category breakdown) ===================== */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-pie glass">
            <div className="bt-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 className="heading-accent">{tr('breakdown', 'Breakdown')}</h3>
                {pieTotal > 0 && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                    }}
                  >
                    {formatCurrencyText(pieTotal, safeFmt, currencySymbol)}
                  </span>
                )}
                {categoryFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter('all');
                    }}
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: 'var(--brand-primary, #6366f1)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    title="Clear category filter"
                  >
                    {categoryFilter} <X size={10} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTx({ type: 'expense' });
                    setFormInstanceId((prev) => prev + 1);
                    setShowForm(true);
                  }}
                  className="bg-topup-btn"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    borderRadius: 6,
                    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
                    background: 'var(--surface-hover, rgba(255, 255, 255, 0.06))',
                    color: 'var(--text-secondary, #94a3b8)',
                    cursor: 'pointer',
                  }}
                  title="Add an expense in breakdown"
                >
                  <Plus size={12} /> Add
                </button>
                <NavLink
                  to="/analytics"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--text-muted, #94a3b8)',
                    textDecoration: 'none',
                  }}
                  className="hover-brand"
                  title="View detailed category analytics"
                >
                  <PieIcon size={16} className="bt-icon-muted" aria-hidden="true" />
                </NavLink>
              </div>
            </div>
            <div className="bt-pie-wrap" style={{ height: 215, minHeight: 180, position: 'relative' }}>
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={215} minWidth={1} minHeight={180}>
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                        isAnimationActive={!prefersReducedMotion && !loading}
                        animationBegin={100}
                        animationDuration={900}
                        animationEasing="ease-out"
                        data={pieData}
                        cx="50%"
                        cy="44%"
                        startAngle={90}
                        endAngle={-270}
                        innerRadius="50%"
                        outerRadius="74%"
                        paddingAngle={pieData.length > 1 ? 4 : 0}
                        cornerRadius={pieData.length > 1 ? 5 : 0}
                        dataKey="value"
                        nameKey="name"
                        stroke={pieData.length > 1 ? "var(--surface-card, #ffffff)" : "none"}
                        strokeWidth={pieData.length > 1 ? 2 : 0}
                        onMouseEnter={(_, index) => setHoveredPieIndex(index)}
                        onMouseLeave={() => setHoveredPieIndex(null)}
                        onClick={(entry) => {
                          const catName = entry?.name;
                          if (catName) {
                            setCategoryFilter((prev) => (prev.toLowerCase() === catName.toLowerCase() ? 'all' : catName));
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {pieData.map((entry, i) => (
                          <Cell
                            key={`cell-${String(entry.name || i).replace(/\s+/g, '-')}-${i}`}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(val, name) => {
                          const amount = Number(val) || 0;
                          const pct = pieTotal > 0 ? ((amount / pieTotal) * 100).toFixed(1) : '0.0';
                          return [`${formatCurrencyText(amount, safeFmt, currencySymbol)} (${pct}%)`, name];
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '0.74rem', fontWeight: 600, paddingTop: 4, cursor: 'pointer' }}
                        onClick={(e) => {
                          const catName = e?.value;
                          if (catName) {
                            setCategoryFilter((prev) => (prev.toLowerCase() === catName.toLowerCase() ? 'all' : catName));
                          }
                        }}
                        formatter={(value) => {
                          const item = pieData.find((p) => p.name === value);
                          const pct = item && pieTotal > 0 ? ` (${((item.value / pieTotal) * 100).toFixed(0)}%)` : '';
                          const isSelected = categoryFilter.toLowerCase() === String(value || '').toLowerCase();
                          return (
                            <span style={{
                              color: isSelected ? 'var(--brand-primary, #6366f1)' : 'var(--text-secondary)',
                              fontWeight: isSelected ? 700 : 600,
                            }}>
                              {value}{pct}
                            </span>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* ── Donut Center Badge (Category / Total Amount) ── */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '44%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      maxWidth: '42%',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--text-muted, #94a3b8)',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                      }}
                    >
                      {hoveredPieIndex !== null && pieData[hoveredPieIndex]
                        ? pieData[hoveredPieIndex].name
                        : pieData.length === 1
                          ? pieData[0].name
                          : tr('total', 'Total')}
                    </div>
                    <div
                      style={{
                        fontSize: '0.92rem',
                        fontWeight: 800,
                        color: 'var(--text-primary, #0f172a)',
                        fontVariantNumeric: 'tabular-nums',
                        lineHeight: 1.15,
                        marginTop: 1,
                      }}
                    >
                      {hoveredPieIndex !== null && pieData[hoveredPieIndex]
                        ? formatCurrencyText(pieData[hoveredPieIndex].value, safeFmt, currencySymbol)
                        : formatCurrencyText(pieTotal, safeFmt, currencySymbol)}
                    </div>
                  </div>
                </>
              ) : (
                /* ── Empty state when there are no expenses yet ── */
                <div className="bento-empty">
                  <span className="bento-empty-icon" aria-hidden="true">
                    <Tag size={42} strokeWidth={1.5} opacity={0.5} />
                  </span>
                  <p className="bento-empty-title">{tr('no_exp_yet', 'No expenses yet')}</p>
                  <p className="bento-empty-sub">{tr('track_spend_breakdown', 'Track spending to see category breakdown.')}</p>
                  <button
                    type="button"
                    className="bento-empty-cta pulse-encouragement"
                    onClick={handleOpenAddForm}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <Plus size={13} /> {tr('add_expense', 'Add Expense')}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* ===================== Transaction form ===================== */}
        <TransactionForm
          key={editingTx ? `edit-${editingTx.id || editingTx._id}-${formInstanceId}` : `add-${formInstanceId}`}
          isOpen={showForm}
          initialData={initialFormData}
          onClose={() => { setShowForm(false); setEditingTx(null); }}
          onSubmit={editingTx ? handleUpdateTransaction : handleAddTransaction}
          isLoading={isLoadingAction}
        />

        {/* ===================== Delete confirmation ===================== */}
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