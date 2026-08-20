import React, { useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Target,
  Download, Plus, ArrowUpRight, ArrowDownRight,
  Wallet, Sparkles, Zap, Settings, Minus, XCircle,
  Rocket, LineChart, Tag, RefreshCw, Share2,
  Edit3, Trash2, ChevronDown, ChevronUp, Loader
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import ErrorBoundary from '../components/ErrorBoundary';
import TransactionForm from '../components/TransactionForm';
import PropTypes from 'prop-types';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import useCountUp from '../hooks/useCountUp';
import { useToast } from '../components/ToastProvider';

// ==================== CONSTANTS ====================

const PIE_COLORS = ['#059669', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];
const CATEGORY_OPTIONS = [
  'Food', 'Groceries', 'Transport', 'Shopping', 'Entertainment', 'Health',
  'Education', 'Bills', 'Salary', 'Freelance', 'Gift', 'Rent', 'Travel',
  'Fitness', 'Subscriptions', 'Utilities', 'Insurance', 'Investment', 'Other', 'Allowance'
];

// ==================== SAFE HELPER FUNCTIONS ====================

const safeFormatCurrency = (amount, fmt, fallbackSymbol = '$') => {
  try {
    let numAmount = typeof amount === 'string' ? parseFloat(amount) : (typeof amount === 'number' ? amount : 0);
    if (isNaN(numAmount)) {
      return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
        {fallbackSymbol}<span style={{ fontSize: '0.85em' }}>0.00</span>
      </span>;
    }
    if (fmt && typeof fmt === 'function') {
      return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(numAmount)}</span>;
    }
    return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
      <span style={{ fontSize: '0.85em' }}>{fallbackSymbol}</span>{numAmount.toFixed(2)}
    </span>;
  } catch (error) {
    console.error('Currency formatting error:', error);
    return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
      <span style={{ fontSize: '0.85em' }}>{fallbackSymbol}</span>0.00
    </span>;
  }
};

const safeParseDate = (dateInput) => {
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput !== "string" && typeof dateInput !== "number") return null;
  const date = new Date(dateInput);
  return Number.isNaN(date.getTime()) ? null : date;
};

const validateTransaction = (transaction) => {
  const errors = [];
  if (!transaction.amount || isNaN(parseFloat(transaction.amount))) {
    errors.push('Amount must be a valid number');
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

const getDateLabel = (dateStr) => {
  const date = safeParseDate(dateStr);
  if (!date) return 'Invalid Date';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
};

const calculateFinancialMetrics = (transactions) => {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { income: 0, expense: 0, netSavings: 0, savingsRate: 0, expenseOfIncome: 0 };
  }
  const inc = transactions.filter(t => t?.type === 'income').reduce((sum, t) => sum + (t.parsedAmount || 0), 0);
  const exp = transactions.filter(t => t?.type === 'expense').reduce((sum, t) => sum + (t.parsedAmount || 0), 0);
  const net = inc - exp;
  const rate = inc > 0 ? ((net / inc) * 100).toFixed(1) : 0;
  const expPct = inc > 0 ? ((exp / inc) * 100).toFixed(0) : 0;
  return { income: inc, expense: exp, netSavings: net, savingsRate: rate, expenseOfIncome: expPct };
};

// ==================== SUB-COMPONENTS ====================

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 260 } }
};

const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };

const StatCard = React.memo(({
  icon: Icon,
  label = "Unknown",
  value = "-",
  colorRgb = "255,255,255",
  trend,
  trendVal,
  accentColor,
  subtitle,
  className = ''
}) => {
  const isValidTrend = ["up", "down", "neutral"].includes(trend);
  return (
    <motion.div
      variants={CARD_VARIANTS}
      className={`stat-card glass ${className}`}
      role="region"
      aria-label={`${label} statistic: ${value}`}
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
      <div className="stat-value" style={{ color: accentColor || "var(--text-primary)" }}>
        {value}
      </div>
      <div className="stat-bottom-row">
        {subtitle && (
          <span className="stat-subtitle" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {subtitle}
          </span>
        )}
        {trendVal !== undefined && isValidTrend && (
          <div className={`stat-trend ${trend}`}>
            {trend === "up" && <ArrowUpRight size={13} />}
            {trend === "down" && <ArrowDownRight size={13} />}
            {trend === "neutral" && <Minus size={13} />}
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
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  colorRgb: PropTypes.string,
  trend: PropTypes.oneOf(['up', 'down', 'neutral']),
  trendVal: PropTypes.string,
  accentColor: PropTypes.string,
  subtitle: PropTypes.string,
  className: PropTypes.string
};

const DashboardSkeleton = () => (
  <div className="bento-dashboard" aria-label="Loading dashboard data..." role="status">
    <div className="bento-header shimmer" style={{ height: '40px', borderRadius: '14px', width: '200px', marginBottom: '24px', border: '1px solid var(--glass-border)' }}></div>
    <div className="bento-grid">
      <div className="bento-tile bento-hero glass shimmer" style={{ minHeight: '180px' }}></div>
      <div className="bento-tile bento-income glass shimmer" style={{ minHeight: '140px' }}></div>
      <div className="bento-tile bento-expense glass shimmer" style={{ minHeight: '140px' }}></div>
      <div className="bento-tile bento-recent glass shimmer" style={{ minHeight: '360px' }}></div>
      <div className="bento-tile bento-chart glass shimmer" style={{ minHeight: '320px' }}></div>
      <div className="bento-tile bento-goal glass shimmer" style={{ minHeight: '220px' }}></div>
      <div className="bento-tile bento-pie glass shimmer" style={{ minHeight: '220px' }}></div>
    </div>
  </div>
);

const EmptyTransactionState = ({ onAddClick }) => (
  <div className="bento-empty">
    <span className="bento-empty-icon" aria-hidden="true"><Rocket size={42} strokeWidth={1.5} opacity={0.5} /></span>
    <p className="bento-empty-title">Start your journey</p>
    <p className="bento-empty-sub">Add your first transaction to begin tracking your finances.</p>
    <button className="bento-empty-cta pulse-encouragement" onClick={onAddClick} aria-label="Add your first transaction">
      <Plus size={16} /> Get Started
    </button>
  </div>
);
EmptyTransactionState.propTypes = { onAddClick: PropTypes.func.isRequired };

// ==================== MAIN COMPONENT ====================

export default function Dashboard() {
  const contextValue = useContext(AppContext);
  const context = useMemo(() => contextValue || {}, [contextValue]);

  const {
    user = null, transactions: rawTransactions = [], theme = 'light',
    addTransaction, updateTransaction, deleteTransaction,
    USER_ID = null, fmt, t, fetchTransactions, currencyInfo
  } = context;

  const currencySymbol = currencyInfo?.symbol || '$';
  const safeFmt = useCallback(
    (val) => (fmt && typeof fmt === 'function' ? fmt(val) : `${currencySymbol}${Number(val).toFixed(2)}`),
    [fmt, currencySymbol]
  );

  const { showToast } = useToast();

  // State
  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [dateFilter, setDateFilter] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('budgeta_date_filter') || 'all';
    return 'all';
  });
  const [categoryFilter, setCategoryFilter] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('budgeta_category_filter') || 'all';
    return 'all';
  });
  const [exportFilter, setExportFilter] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('budgeta_export_filter') || 'all';
    return 'all';
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [recentLimit, setRecentLimit] = useState(8);
  const [isLoadingAction, setIsLoadingAction] = useState(false);

  // Persist filters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('budgeta_date_filter', dateFilter);
      localStorage.setItem('budgeta_category_filter', categoryFilter);
      localStorage.setItem('budgeta_export_filter', exportFilter);
    }
  }, [dateFilter, categoryFilter, exportFilter]);

  // ==================== DATA PROCESSING ====================

  // 1. Parse transactions (all, unfiltered)
  const allParsed = useMemo(() => {
    if (!Array.isArray(rawTransactions)) return [];
    return rawTransactions
      .filter(tx => tx && typeof tx === 'object')
      .map(tx => ({
        ...tx,
        parsedDate: safeParseDate(tx.date),
        parsedAmount: parseFloat(tx.amount) || 0
      }))
      .filter(tx => tx.parsedDate !== null);
  }, [rawTransactions]);

  // 2. Filtered transactions (for UI)
  const parsedTransactions = useMemo(() => {
    let processed = allParsed;
    if (categoryFilter !== 'all') {
      processed = processed.filter(tx => tx.category === categoryFilter);
    }
    if (dateFilter !== 'all') {
      const now = new Date();
      processed = processed.filter(tx => {
        const diffTime = Math.abs(now - tx.parsedDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (dateFilter === '7days') return diffDays <= 7;
        if (dateFilter === '30days') return diffDays <= 30;
        if (dateFilter === 'thisMonth') {
          return tx.parsedDate.getMonth() === now.getMonth() && tx.parsedDate.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }
    return processed;
  }, [allParsed, categoryFilter, dateFilter]);

  // 3. Unfiltered metrics (hero stats)
  const unfilteredMetrics = useMemo(() => {
    return calculateFinancialMetrics(allParsed);
  }, [allParsed]);

  // 4. Filtered metrics (for chart summary)
  const financialMetrics = useMemo(() => calculateFinancialMetrics(parsedTransactions), [parsedTransactions]);
  const { savingsRate, expenseOfIncome } = financialMetrics;

  // 5. Sorted lists
  const sortedDescAll = useMemo(() => [...allParsed].sort((a, b) => b.parsedDate - a.parsedDate), [allParsed]);
  const sortedAscAll = useMemo(() => [...sortedDescAll].reverse(), [sortedDescAll]);
  const sortedDescFiltered = useMemo(() => [...parsedTransactions].sort((a, b) => b.parsedDate - a.parsedDate), [parsedTransactions]);
  const sortedAscFiltered = useMemo(() => [...sortedDescFiltered].reverse(), [sortedDescFiltered]);

  // 6. Hero stats (unfiltered)
  const rawBalance = unfilteredMetrics.netSavings;
  const rawIncome = unfilteredMetrics.income;
  const rawExpense = unfilteredMetrics.expense;
  const netSavings = unfilteredMetrics.netSavings;
  const monthlyGoal = user?.monthly_goal || 0;

  // 7. Animated counters
  const { value: animatedBalance, isFinished: balanceDone } = useCountUp(rawBalance, 900);
  const { value: animatedIncome } = useCountUp(rawIncome, 800);
  const { value: animatedExpense } = useCountUp(rawExpense, 800);

  // 8. Goal progress
  const goalProgress = useMemo(() => {
    if (monthlyGoal <= 0) return 0;
    return Math.max(0, Math.min((netSavings / monthlyGoal) * 100, 100));
  }, [netSavings, monthlyGoal]);

  // 9. Daily average spend (fixed)
  const dailyAverageSpend = useMemo(() => {
    if (parsedTransactions.length === 0) return 0;
    const totalExpense = parsedTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.parsedAmount, 0);
    if (totalExpense === 0) return 0;

    // Get date range of filtered transactions
    const dates = parsedTransactions.map(t => t.parsedDate.getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const dayDiff = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) || 1;
    return totalExpense / dayDiff;
  }, [parsedTransactions]);

  // 10. Sparkline (unfiltered, all time)
  const sparklineSvgPath = useMemo(() => {
    if (sortedAscAll.length < 2) return null;
    let running = 0;
    const points = sortedAscAll.slice(-12).map(t => {
      running += (t.type === 'income' ? t.parsedAmount : -t.parsedAmount);
      return running;
    });
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 120;
    const height = 36;
    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${coords.join(' L ')}`;
  }, [sortedAscAll]);

  // 11. Chart data (filtered)
  const chartData = useMemo(() => {
    if (sortedAscFiltered.length === 0) return [];
    const map = new Map();
    sortedAscFiltered.forEach(t => {
      const label = t.parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!map.has(label)) {
        map.set(label, { name: label, income: 0, expense: 0, timestamp: t.parsedDate.getTime() });
      }
      const entry = map.get(label);
      if (t.type === 'income') entry.income += t.parsedAmount;
      else entry.expense += t.parsedAmount;
    });
    return Array.from(map.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-10);
  }, [sortedAscFiltered]);

  // 12. Net worth over time (unfiltered)
  const netWorthData = useMemo(() => {
    if (sortedAscAll.length === 0) return [];
    let running = 0;
    const data = [];
    sortedAscAll.forEach(t => {
      running += (t.type === 'income' ? t.parsedAmount : -t.parsedAmount);
      data.push({
        name: t.parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        balance: running,
        timestamp: t.parsedDate.getTime()
      });
    });
    // Keep last 20 points for performance
    return data.slice(-20);
  }, [sortedAscAll]);

  // 13. Top expense category (filtered)
  const topExpenseCategory = useMemo(() => {
    const map = {};
    parsedTransactions.filter(t => t.type === 'expense').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.parsedAmount;
    });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return null;
    const totalExp = parsedTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.parsedAmount, 0) || 1;
    return {
      name: entries[0][0],
      amount: entries[0][1],
      pct: ((entries[0][1] / totalExp) * 100).toFixed(0)
    };
  }, [parsedTransactions]);

  // 14. Pie data (filtered)
  const pieData = useMemo(() => {
    const catMap = new Map();
    parsedTransactions.filter(t => t.type === 'expense').forEach(t => {
      const category = t.category || 'Other';
      catMap.set(category, (catMap.get(category) || 0) + t.parsedAmount);
    });
    return Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  }, [parsedTransactions]);

  // 15. Grouped transactions (filtered, limited)
  const groupedTxns = useMemo(() => {
    const list = sortedDescFiltered.slice(0, recentLimit);
    const groups = [];
    let lastLabel = '';
    list.forEach(tx => {
      const label = getDateLabel(tx.date);
      if (label !== lastLabel && label !== 'Invalid Date') {
        groups.push({ type: 'header', label });
        lastLabel = label;
      }
      groups.push({ type: 'tx', data: tx });
    });
    return groups;
  }, [sortedDescFiltered, recentLimit]);

  // ==================== LOCALISATION ====================

  const getLocalizedText = useCallback((key, fallback) => {
    const translation = t && typeof t === 'function' && t(key) !== key ? t(key) : null;
    return translation || fallback;
  }, [t]);

  const savingsRateText = useMemo(() => {
    if (parsedTransactions.length === 0) return getLocalizedText('no_transactions', 'No transactions yet');
    if (Number.isNaN(Number(savingsRate)) || Number(savingsRate) <= 0) {
      return 'No savings yet — let\'s change that 📈';
    }
    return `Saving ${savingsRate}% · ${parsedTransactions.length} transactions`;
  }, [parsedTransactions, savingsRate, getLocalizedText]);

  // ==================== THEME ====================

  const balanceColor = rawBalance >= 0 ? 'var(--balance-accent)' : 'var(--danger)';
  const isDark = theme === 'amoled';
  const tooltipStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(8,8,22,0.98)' : 'rgba(255,255,255,0.97)',
    border: `1px solid ${isDark ? 'rgba(5, 150, 105,0.3)' : 'rgba(5, 150, 105,0.2)'}`,
    borderRadius: '12px',
    color: isDark ? '#f8fafc' : '#0f172a',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(12px)'
  }), [isDark]);

  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // ==================== EVENT HANDLERS ====================

  const handleExportJSON = useCallback(async () => {
    setIsExporting(true);
    try {
      const dataToExport = exportFilter === 'all' ? allParsed : parsedTransactions;
      const dataStr = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transactions_${new Date().toISOString()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', 'Data exported to JSON successfully!');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to export data');
    } finally {
      setIsExporting(false);
    }
  }, [allParsed, parsedTransactions, exportFilter, showToast]);

  const handleExportCSV = useCallback(async () => {
    setIsExporting(true);
    try {
      const dataToExport = exportFilter === 'all' ? allParsed : parsedTransactions;
      const headers = ['Date', 'Type', 'Category', 'Amount', 'Note'];
      const rows = dataToExport.map(tx => [
        tx.date,
        tx.type,
        tx.category || 'Other',
        tx.parsedAmount.toFixed(2),
        tx.note || ''
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transactions_${new Date().toISOString()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', 'CSV exported successfully!');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  }, [allParsed, parsedTransactions, exportFilter, showToast]);

  const handleRefresh = useCallback(async () => {
    if (fetchTransactions) {
      setIsRefreshing(true);
      try {
        await fetchTransactions();
        showToast('success', 'Data refreshed successfully');
      } catch (err) {
        console.error(err);
        showToast('error', 'Failed to refresh data');
      } finally {
        setIsRefreshing(false);
      }
    } else {
      showToast('success', 'Data is up to date');
    }
  }, [fetchTransactions, showToast]);

  const handleShare = useCallback(async () => {
    const summary = `My Budget Dashboard\nBalance: ${safeFmt(rawBalance)}\nNet Savings: ${safeFmt(netSavings)}\nSavings Rate: ${savingsRate}%`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Financial Dashboard', text: summary });
      } else {
        await navigator.clipboard.writeText(summary);
        showToast('success', 'Dashboard summary copied to clipboard!');
      }
    } catch (err) {
      if (err.name !== 'AbortError') showToast('error', 'Sharing failed');
    }
  }, [rawBalance, netSavings, savingsRate, safeFmt, showToast]);

  const handleAddTransaction = useCallback(async (tx) => {
    const validation = validateTransaction(tx);
    if (!validation.isValid) {
      return showToast('error', `Validation failed: ${validation.errors.join(', ')}`);
    }
    try {
      await addTransaction(tx);
      setShowForm(false);
      showToast('success', 'Transaction added successfully!');
    } catch (error) {
      showToast('error', error.message || 'Failed to add transaction. Please try again.');
    }
  }, [addTransaction, showToast]);

  const handleEditTransaction = useCallback((tx) => {
    setEditingTx(tx);
    setShowForm(true);
  }, []);

  const handleUpdateTransaction = useCallback(async (tx) => {
    setIsLoadingAction(true);
    try {
      await updateTransaction(editingTx.id || editingTx._id, tx);
      setShowForm(false);
      setEditingTx(null);
      showToast('success', 'Transaction updated successfully!');
    } catch (error) {
      showToast('error', error.message || 'Failed to update transaction.');
    } finally {
      setIsLoadingAction(false);
    }
  }, [updateTransaction, editingTx, showToast]);

  const handleDeleteTransaction = useCallback(async (tx) => {
    if (!window.confirm(`Delete this ${tx.type} of ${safeFmt(tx.amount)}?`)) return;
    setIsLoadingAction(true);
    try {
      await deleteTransaction(tx.id || tx._id);
      showToast('success', 'Transaction deleted.');
    } catch (error) {
      showToast('error', error.message || 'Failed to delete transaction.');
    } finally {
      setIsLoadingAction(false);
    }
  }, [deleteTransaction, safeFmt, showToast]);

  const loadMore = useCallback(() => {
    setRecentLimit(prev => prev + 8);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowForm(true);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleRefresh();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRefresh]);

  // ==================== RENDER ====================

  const categoryOptions = useMemo(() =>
    CATEGORY_OPTIONS.map(cat => <option key={cat} value={cat}>{cat}</option>),
    []
  );

  if (!user) return <DashboardSkeleton />;

  return (
    <ErrorBoundary>
      <div className="bento-dashboard">
        <div className="bento-header">
          <motion.div className="bento-insight-pill" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
            <Sparkles size={14} />{savingsRateText}
          </motion.div>
          <div className="bento-actions">
            <motion.button
              className="bbtn-icon bbtn-refresh"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh (Ctrl+R)"
              aria-label="Refresh Data"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
            >
              <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
            </motion.button>
            <motion.button
              className="bbtn-icon bbtn-share"
              onClick={handleShare}
              title="Share Dashboard"
              aria-label="Share"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
            >
              <Share2 size={16} />
            </motion.button>
            <div className="export-group" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <select
                className="export-filter-select"
                value={exportFilter}
                onChange={(e) => setExportFilter(e.target.value)}
                aria-label="Export data scope"
                style={{ background: 'var(--glass-2)', color: 'var(--text-main)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.7rem' }}
              >
                <option value="all">All</option>
                <option value="filtered">Filtered</option>
              </select>
              <motion.button
                className="bbtn-icon bbtn-export bbtn-export-json"
                onClick={handleExportJSON}
                disabled={isExporting}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                title={isExporting ? "Exporting..." : "Export JSON"}
                aria-label="Export JSON"
              >
                {isExporting ? <RefreshCw size={16} className="spinning" /> : <Download size={16} />}
                <span className="bbtn-export-label">JSON</span>
              </motion.button>
              <motion.button
                className="bbtn-icon bbtn-export bbtn-export-csv"
                onClick={handleExportCSV}
                disabled={isExporting}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                title={isExporting ? "Exporting..." : "Export CSV"}
                aria-label="Export CSV"
              >
                {isExporting ? <RefreshCw size={16} className="spinning" /> : <Download size={16} />}
                <span className="bbtn-export-label">CSV</span>
              </motion.button>
            </div>
            <motion.button
              className="bbtn-pri bbtn-full"
              onClick={() => setShowForm(true)}
              title="Ctrl+N"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={14} /> {getLocalizedText('add_transaction', 'Add Transaction')}
            </motion.button>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <motion.div
          className="dashboard-quick-stats-strip glass"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="dqs-pill">
            <Zap size={14} className="dqs-icon text-brand" />
            <span className="dqs-label">Savings Rate:</span>
            <span className="dqs-val">{savingsRate}%</span>
          </div>
          {topExpenseCategory && (
            <div className="dqs-pill">
              <Tag size={14} className="dqs-icon text-danger" />
              <span className="dqs-label">Top Expense:</span>
              <span className="dqs-val">{topExpenseCategory.name} ({topExpenseCategory.pct}%)</span>
            </div>
          )}
          <div className="dqs-pill">
            <TrendingDown size={14} className="dqs-icon text-warning" />
            <span className="dqs-label">Daily Avg Spend:</span>
            <span className="dqs-val">{safeFmt(dailyAverageSpend)}</span>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          className="bento-filters"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}
          role="search"
          aria-label="Filter transactions"
        >
          <select
            className="filter-select"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter by date"
          >
            <option value="all">All Time</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
          </select>
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {categoryOptions}
          </select>
          {(dateFilter !== 'all' || categoryFilter !== 'all') && (
            <button
              className="filter-clear"
              onClick={() => { setDateFilter('all'); setCategoryFilter('all'); }}
              aria-label="Clear filters"
            >
              Clear Filters
            </button>
          )}
        </motion.div>

        {/* Bento Grid */}
        <motion.div className="bento-grid" variants={STAGGER} initial="hidden" animate="show">
          <div className="ambient-orb orb-chart" style={{ top: '15%', right: '5%' }} aria-hidden="true"></div>
          <div className="ambient-orb orb-goal" style={{ bottom: '10%', left: '10%' }} aria-hidden="true"></div>
          <div className="ambient-orb orb-ai" style={{ bottom: '2%', right: '2%' }} aria-hidden="true"></div>

          {/* Hero Balance */}
          <motion.div
            variants={CARD_VARIANTS}
            className={`bento-tile bento-hero glass ${balanceDone ? 'numberGlow' : ''}`}
            style={{ borderColor: rawBalance >= 0 ? 'rgba(var(--balance-accent-rgb), 0.34)' : 'rgba(var(--danger-rgb), 0.3)' }}
            role="region"
            aria-label="Account balance"
          >
            <div className="blob-glow" style={{ background: rawBalance >= 0 ? 'rgba(var(--balance-accent-rgb), 0.15)' : 'rgba(var(--danger-rgb), 0.15)' }}></div>
            <div className="bh-top">
              <span className="bh-label">{getLocalizedText('total_balance', 'Total Balance')}</span>
              <Wallet size={20} className="bh-icon" style={{ color: balanceColor }} />
            </div>
            <div className="bh-mid">
              <h2 style={{ fontSize: 'clamp(1.8rem, 10vw, 2.4rem)', fontWeight: '900', color: balanceColor, margin: '8px 0' }}>
                {safeFormatCurrency(animatedBalance, safeFmt, currencySymbol)}
              </h2>
              {sparklineSvgPath && (
                <div className="bh-sparkline-wrap" title="Net trajectory">
                  <svg className="bh-sparkline-svg" viewBox="0 0 120 36">
                    <path
                      d={sparklineSvgPath}
                      fill="none"
                      stroke={rawBalance >= 0 ? '#10b981' : '#ef4444'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{getLocalizedText('net_position', 'Net position')}</span>
                <div className="bh-trend neutral" style={{ background: 'var(--glass-2)' }}>
                  <Minus size={14} /><span>{getLocalizedText('vs_last_month', '+0% vs last month')}</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Income & Expense Cards */}
          <StatCard
            icon={TrendingUp}
            label={getLocalizedText('total_income', 'Total Income')}
            value={safeFormatCurrency(animatedIncome, safeFmt, currencySymbol)}
            colorRgb="34, 197, 94"
            accentColor="var(--success)"
            subtitle={getLocalizedText('all_time', 'All time')}
            trend="neutral"
            trendVal={getLocalizedText('vs_last_month', '+0% vs last month')}
            className="bento-income"
          />
          <StatCard
            icon={TrendingDown}
            label={getLocalizedText('total_expenses', 'Total Expenses')}
            value={safeFormatCurrency(animatedExpense, safeFmt, currencySymbol)}
            colorRgb="239, 68, 68"
            accentColor="var(--danger)"
            subtitle={getLocalizedText('all_time', 'All time')}
            trend="neutral"
            trendVal={getLocalizedText('vs_last_month', '+0% vs last month')}
            className="bento-expense"
          />

          {/* Recent Transactions */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-recent glass">
            <div className="bt-header">
              <h3 className="heading-accent">{getLocalizedText('recent_transactions', 'Recent Transactions')}</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <NavLink to="/transactions" className="bt-link" title="View all transactions">View All →</NavLink>
                <button className="bt-icon-btn" onClick={() => setShowForm(true)} title="Add transaction"><Plus size={16} /></button>
              </div>
            </div>
            {parsedTransactions.length === 0 ? (
              <EmptyTransactionState onAddClick={() => setShowForm(true)} />
            ) : (
              <>
                <div className="bt-list" role="list">
                  {groupedTxns.map((item, idx) => {
                    if (item.type === 'header') {
                      return (
                        <div key={`hdr-${idx}`} className="bt-date-group" role="heading" aria-level={4}>
                          {item.label}
                        </div>
                      );
                    }
                    const tx = item.data;
                    return (
                      <div key={tx.id || `tx-${idx}`} className="bt-item" role="listitem">
                        <div className={`bt-icn ${tx.type}`}><Tag size={16} aria-hidden="true" /></div>
                        <div className="bt-info">
                          <span className="bt-cat">{tx.category || 'Uncategorized'}</span>
                          <span className="bt-date">{getDateLabel(tx.date)}</span>
                          {tx.note && <span className="bt-note">{tx.note}</span>}
                        </div>
                        <div className="bt-amt-group">
                          <div className={`bt-amt ${tx.type}`}>
                            {tx.type === 'income' ? '+' : '-'}{safeFormatCurrency(tx.amount, safeFmt, currencySymbol)}
                          </div>
                          <div className="bt-actions">
                            <button
                              className="bt-action-btn"
                              onClick={() => handleEditTransaction(tx)}
                              aria-label="Edit transaction"
                              title="Edit"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              className="bt-action-btn danger"
                              onClick={() => handleDeleteTransaction(tx)}
                              aria-label="Delete transaction"
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
                {sortedDescFiltered.length > recentLimit && (
                  <button className="bt-load-more" onClick={loadMore} aria-label="Load more transactions">
                    Load More <ChevronDown size={14} />
                  </button>
                )}
              </>
            )}
          </motion.div>

          {/* Spending vs Income Chart */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-chart glass">
            <div className="bt-header">
              <h3 className="heading-accent">{getLocalizedText('spending_vs_income', 'Spending vs Income')}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(dateFilter !== 'all' || categoryFilter !== 'all') && (
                  <span className="bt-badge" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    filtered view
                  </span>
                )}
                <span className="bt-badge">{getLocalizedText('daily_trend', 'Daily Trend')}</span>
              </div>
            </div>
            <div className="bt-chart-wrap">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.75} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gEx" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.65} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(val) => safeFormatCurrency(val, safeFmt, currencySymbol)} />
                    <Legend
                      wrapperStyle={{ paddingTop: 12, fontSize: '0.78rem', fontWeight: 700 }}
                      formatter={(value) => (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {value === 'income' ? getLocalizedText('income_label', 'Income') : getLocalizedText('expense_label', 'Expenses')}
                        </span>
                      )}
                    />
                    <Area
                      isAnimationActive={!prefersReducedMotion}
                      animationBegin={800}
                      type="monotone"
                      dataKey="income"
                      stroke="#10b981"
                      fill="url(#gIn)"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      dot={{ r: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                    />
                    <Area
                      isAnimationActive={!prefersReducedMotion}
                      animationBegin={800}
                      type="monotone"
                      dataKey="expense"
                      stroke="#ef4444"
                      fill="url(#gEx)"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      dot={{ r: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#ef4444' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="bento-empty">
                  <span className="bento-empty-icon" aria-hidden="true"><LineChart size={42} strokeWidth={1.5} opacity={0.5} /></span>
                  <p className="bento-empty-title">{getLocalizedText('story_starts', 'Your story starts here')}</p>
                  <p className="bento-empty-sub">{getLocalizedText('add_tx_timeline', 'Add transactions to see your spending timeline.')}</p>
                </div>
              )}
            </div>
            {chartData.length > 0 && (
              <div className="bt-chart-summary" role="note">
                {rawExpense > rawIncome
                  ? getLocalizedText('spent_pct', `⚠️ You spent {pct}% of your income this period`).replace('{pct}', expenseOfIncome)
                  : rawIncome > 0
                    ? getLocalizedText('saved_pct', `✅ You saved {pct}% of your income this period`).replace('{pct}', savingsRate)
                    : getLocalizedText('add_income_rate', 'Add income transactions to see your savings rate')
                }
              </div>
            )}
          </motion.div>

          {/* Net Worth History (NEW) */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-networth glass">
            <div className="bt-header">
              <h3 className="heading-accent">Net Worth Over Time</h3>
              <LineChart size={16} className="bt-icon-muted" />
            </div>
            <div className="bt-chart-wrap" style={{ height: '120px' }}>
              {netWorthData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={netWorthData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gNW" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={balanceColor} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={balanceColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(val) => safeFormatCurrency(val, safeFmt, currencySymbol)} />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke={balanceColor}
                      fill="url(#gNW)"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="bento-empty" style={{ padding: '1rem' }}>
                  <p className="bento-empty-sub">Add transactions to see your net worth trajectory.</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Savings Goal */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-goal glass">
            <div className="bt-header">
              <h3 className="heading-accent">{getLocalizedText('savings_goal', 'Savings Goal')}</h3>
              <Target size={16} className="bt-icon-muted" />
            </div>
            {monthlyGoal > 0 ? (
              <>
                <div className="bg-hud">
                  <span className="bg-pct">{goalProgress.toFixed(0)}%</span>
                  <span className="bg-frac">{safeFormatCurrency(Math.max(0, netSavings), safeFmt)} / {safeFormatCurrency(monthlyGoal, safeFmt)}</span>
                </div>
                <div className="bg-track">
                  <motion.div
                    className={`bg-fill ${goalProgress < 15 ? 'breathing' : ''}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${goalProgress}%` }}
                    transition={{ duration: 1.5, delay: 0.5 }}
                  >
                    <div className="bg-glow-dot"></div>
                  </motion.div>
                </div>
                <div className="bg-goal-actions-row">
                  <p className="bg-nudge">
                    {goalProgress >= 100
                      ? '🎉 Monthly Target Achieved!'
                      : goalProgress < 15
                        ? 'Every bit counts. Keep going!'
                        : `${(100 - goalProgress).toFixed(0)}% to reach target`
                    }
                  </p>
                  <button
                    className="bg-topup-btn"
                    onClick={() => setShowForm(true)}
                    title="Contribute towards goal"
                  >
                    <Plus size={12} /> Top Up
                  </button>
                </div>
              </>
            ) : (
              <div className="bento-empty">
                <span className="bento-empty-icon" aria-hidden="true"><Target size={42} strokeWidth={1.5} opacity={0.5} /></span>
                <p className="bento-empty-title">{getLocalizedText('set_savings_goal', 'Set a savings goal')}</p>
                <p className="bento-empty-sub">{getLocalizedText('track_progress_target', 'Track your progress toward a monthly target.')}</p>
                <NavLink to="/settings" className="bento-empty-cta pulse-encouragement" style={{ textDecoration: 'none' }}>
                  <Settings size={13} /> {getLocalizedText('set_goal_cta', 'Set Goal →')}
                </NavLink>
              </div>
            )}
          </motion.div>

          {/* Pie Chart */}
          <motion.div variants={CARD_VARIANTS} className="bento-tile bento-pie glass">
            <div className="bt-header"><h3 className="heading-accent">{getLocalizedText('breakdown', 'Breakdown')}</h3></div>
            <div className="bt-pie-wrap">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      isAnimationActive={!prefersReducedMotion}
                      animationBegin={800}
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={`cell-${entry.name.replace(/\s+/g, '-')}-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(val) => safeFormatCurrency(val, safeFmt, currencySymbol)} />
                    <Legend
                      wrapperStyle={{ fontSize: '0.72rem', fontWeight: 700 }}
                      formatter={(value) => <span style={{ color: 'var(--text-secondary)' }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="bento-empty">
                  <span className="bento-empty-icon" aria-hidden="true"><Tag size={42} strokeWidth={1.5} opacity={0.5} /></span>
                  <p className="bento-empty-title">{getLocalizedText('no_exp_yet', 'No expenses yet')}</p>
                  <p className="bento-empty-sub">{getLocalizedText('track_spend_breakdown', 'Track spending to see category breakdown.')}</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* Transaction Form Modal */}
        <TransactionForm
          isOpen={showForm}
          initialData={editingTx || { date: new Date().toISOString().split('T')[0] }}
          onClose={() => {
            setShowForm(false);
            setEditingTx(null);
          }}
          onSubmit={editingTx ? handleUpdateTransaction : handleAddTransaction}
          isLoading={isLoadingAction}
        />
      </div>
    </ErrorBoundary>
  );
}
