import React, { useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, TrendingUp, TrendingDown, Target,
  Download, Plus, ArrowUpRight, ArrowDownRight,
  Wallet, Sparkles, Zap, Brain, AlertTriangle,
  Settings, Minus, XCircle, Rocket, LineChart, Tag,
  RefreshCw, Share2
} from 'lucide-react';
import { AppContext } from '../App';
import TransactionForm from '../components/TransactionForm';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import useCountUp from '../hooks/useCountUp';

const ToastItem = ({ toast, onRemove }) => {
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isPaused) {
      timerRef.current = setTimeout(onRemove, 3000); // 3s dismiss
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPaused, onRemove]);

  return (
    <motion.div
      className={`notification-toast ${toast.type}`}
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.9 }}
      role="alert"
      layout
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '10px', width: 'auto', left: 'auto', transform: 'none'
      }}
    >
      {toast.type === 'error' && <XCircle size={16} />}
      <span>{toast.msg}</span>
      {toast.type === 'error' && <button onClick={onRemove} aria-label="Dismiss error" style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginLeft: 'auto', opacity: 0.7 }}>×</button>}
    </motion.div>
  );
};

// ==================== CONSTANTS ====================

const CATEGORY_ICONS = {
  Food: '🍔', Groceries: '🛒', Transport: '🚌', Shopping: '🛍️',
  Entertainment: '🎬', Health: '💊', Education: '📚', Bills: '📄',
  Salary: '💰', Freelance: '💻', Gift: '🎁', Rent: '🏠',
  Travel: '✈️', Fitness: '🏋️', Subscriptions: '📱', Utilities: '⚡',
  Insurance: '🛡️', Investment: '📈', Other: '📌', Allowance: '💵',
};

const PIE_COLORS = ['#059669', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];

// ==================== SAFE HELPER FUNCTIONS ====================

const safeFormatCurrency = (amount, fmt) => {
  try {
    let numAmount = typeof amount === 'string' ? parseFloat(amount) : (typeof amount === 'number' ? amount : 0);
    if (isNaN(numAmount)) return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>₹<span style={{ fontSize: '0.85em' }}>0.00</span></span>;
    if (fmt && typeof fmt === 'function') {
      const formatted = fmt(numAmount);
      return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatted}</span>;
    }
    return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}><span style={{ fontSize: '0.85em' }}>₹</span>{numAmount.toFixed(2)}</span>;
  } catch (error) {
    console.error('Currency formatting error:', error);
    return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}><span style={{ fontSize: '0.85em' }}>₹</span>0.00</span>;
  }
};

const safeParseDate = (dateInput) => {
  if (typeof dateInput !== "string" && typeof dateInput !== "number") {
    return null;
  }

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

const getCatIcon = (category) => {
  if (!category || typeof category !== 'string') return '📌';
  return CATEGORY_ICONS[category] || '📌';
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

  const inc = transactions.filter(t => t?.type === 'income').reduce((sum, t) => sum + t.parsedAmount, 0);
  const exp = transactions.filter(t => t?.type === 'expense').reduce((sum, t) => sum + t.parsedAmount, 0);

  const net = inc - exp;
  const rate = inc > 0 ? ((net / inc) * 100).toFixed(1) : 0;
  const expPct = inc > 0 ? ((exp / inc) * 100).toFixed(0) : 0;

  return { income: inc, expense: exp, netSavings: net, savingsRate: rate, expenseOfIncome: expPct };
};

// ==================== SUB-COMPONENTS ====================

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
            style={{
              background: `rgba(${colorRgb}, 0.15)`,
              color: `rgb(${colorRgb})`
            }}
            aria-hidden="true"
          >
            <Icon size={18} />
          </div>
        )}
      </div>

      <div
        className="stat-value"
        style={{ color: accentColor || "var(--text-primary)" }}
      >
        {value}
      </div>

      <div className="stat-bottom-row">
        {subtitle && (
          <span
            className="stat-subtitle"
            style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
          >
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

const DashboardLoading = () => (
  <div className="loading-container" role="status" aria-label="Loading dashboard">
    <div className="loading-spinner"></div>
    <p>Loading dashboard...</p>
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

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 260 } }
};

const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };

// ==================== MAIN COMPONENT ====================

export default function Dashboard() {
  const context = useContext(AppContext) || {};

  const {
    user = null, transactions: rawTransactions = [], theme = 'light',
    addTransaction, USER_ID = null, fmt, t
  } = context;

  const safeFmt = useCallback(
    (val) => (fmt && typeof fmt === 'function' ? fmt(val) : `₹${Number(val).toFixed(2)}`),
    [fmt]
  );

  const [showForm, setShowForm] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [dateFilter, setDateFilter] = useState(() => localStorage.getItem('budgeta_date_filter') || 'all');
  const [categoryFilter, setCategoryFilter] = useState(() => localStorage.getItem('budgeta_category_filter') || 'all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    localStorage.setItem('budgeta_date_filter', dateFilter);
    localStorage.setItem('budgeta_category_filter', categoryFilter);
  }, [dateFilter, categoryFilter]);

  const addToast = useCallback((msg, type = 'success') => {
    setToasts(prev => {
      const updated = [...prev, { id: Date.now() + Math.random(), msg, type }];
      return updated.slice(-3); // Limit to max 3 toasts
    });
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // 1. BASE DATA: Parse numbers and dates exactly once
  const parsedTransactions = useMemo(() => {
    if (!Array.isArray(rawTransactions)) return [];
    let processed = rawTransactions
      .filter(tx => tx && typeof tx === 'object')
      .map(tx => ({
        ...tx,
        parsedDate: safeParseDate(tx.date),
        parsedAmount: parseFloat(tx.amount) || 0
      }))
      .filter(tx => tx.parsedDate !== null);

    // Apply Category Filter
    if (categoryFilter !== 'all') {
      processed = processed.filter(tx => tx.category === categoryFilter);
    }
    
    // Apply Date Filter
    if (dateFilter !== 'all') {
      const now = new Date();
      processed = processed.filter(tx => {
        const diffTime = Math.abs(now - tx.parsedDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (dateFilter === '7days') return diffDays <= 7;
        if (dateFilter === '30days') return diffDays <= 30;
        if (dateFilter === 'thisMonth') return tx.parsedDate.getMonth() === now.getMonth() && tx.parsedDate.getFullYear() === now.getFullYear();
        return true;
      });
    }
      
    return processed;
  }, [rawTransactions, categoryFilter, dateFilter]);

  // 2. SORTED DATA: Single source of truth for sorted lists to prevent lag
  const sortedDescTransactions = useMemo(() => {
    return [...parsedTransactions].sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());
  }, [parsedTransactions]);

  const sortedAscTransactions = useMemo(() => {
    return [...sortedDescTransactions].reverse();
  }, [sortedDescTransactions]);

  // 3. METRICS: Calculated from the safe parsed list
  const financialMetrics = useMemo(() => calculateFinancialMetrics(parsedTransactions), [parsedTransactions]);
  const { income: rawIncome, expense: rawExpense, netSavings, savingsRate, expenseOfIncome } = financialMetrics;

  const rawBalance = useMemo(() => isNaN(Number(user?.balance)) ? 0 : Number(user?.balance), [user?.balance]);
  const monthlyGoal = useMemo(() => isNaN(Number(user?.monthly_goal)) ? 0 : Number(user?.monthly_goal), [user?.monthly_goal]);

  const { value: animatedBalance, isFinished: balanceDone } = useCountUp(rawBalance, 900);
  const { value: animatedIncome } = useCountUp(rawIncome, 800);
  const { value: animatedExpense } = useCountUp(rawExpense, 800);
  const dataVersion = parsedTransactions.length;

  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const goalProgress = useMemo(() => {
    if (monthlyGoal <= 0) return 0;
    return Math.max(0, Math.min((netSavings / monthlyGoal) * 100, 100));
  }, [netSavings, monthlyGoal]);

  // 4. CHART DATA: Uses the ascending sorted list
  const chartData = useMemo(() => {
    if (sortedAscTransactions.length === 0) return [];

    const map = new Map();

    sortedAscTransactions.forEach(t => {
      const label = t.parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!map.has(label)) {
        map.set(label, { name: label, income: 0, expense: 0, timestamp: t.parsedDate.getTime() });
      }

      const entry = map.get(label);
      if (t.type === 'income') entry.income += t.parsedAmount;
      else if (t.type === 'expense') entry.expense += t.parsedAmount;
    });

    // Convert to array, sort by timestamp strictly, take last 10
    return Array.from(map.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-10);
  }, [sortedAscTransactions]);

  const pieData = useMemo(() => {
    const catMap = new Map();
    parsedTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const category = t.category || 'Other';
        catMap.set(category, (catMap.get(category) || 0) + t.parsedAmount);
      });

    return Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  }, [parsedTransactions]);

  const groupedTxns = useMemo(() => {
    if (sortedDescTransactions.length === 0) return [];

    const top8 = sortedDescTransactions.slice(0, 8);
    const groups = [];
    let lastLabel = '';

    top8.forEach(tx => {
      const label = getDateLabel(tx.date);
      if (label !== lastLabel && label !== 'Invalid Date') {
        groups.push({ type: 'header', label });
        lastLabel = label;
      }
      groups.push({ type: 'tx', data: tx });
    });

    return groups;
  }, [sortedDescTransactions]);

  const getLocalizedText = useCallback((key, fallback) => {
    const translation = t && typeof t === 'function' && t(key) !== key ? t(key) : null;
    return translation || fallback;
  }, [t]);

  const savingsRateText = useMemo(() => {
    if (parsedTransactions.length === 0) return getLocalizedText('no_transactions', 'No transactions yet');
    if (Number(savingsRate) <= 0) return 'No savings yet — let\'s change that 📈';
    return `Saving ${savingsRate}% · ${parsedTransactions.length} transactions`;
  }, [parsedTransactions, savingsRate, getLocalizedText]);



  const balanceColor = rawBalance >= 0 ? 'var(--success)' : 'var(--danger)';
  const isDark = theme === 'dark' || theme === 'amoled';

  const tooltipStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(8,8,22,0.98)' : 'rgba(255,255,255,0.97)',
    border: `1px solid ${isDark ? 'rgba(5, 150, 105,0.3)' : 'rgba(5, 150, 105,0.2)'}`,
    borderRadius: '12px',
    color: isDark ? '#f8fafc' : '#0f172a',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(12px)'
  }), [isDark]);

  // ==================== EVENT HANDLERS ====================

  const handleExportJSON = useCallback(() => {
    const dataStr = JSON.stringify(parsedTransactions, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transactions_export.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('Data exported to JSON successfully!', 'success');
  }, [parsedTransactions, addToast]);

  const handleRefresh = useCallback(async () => {
    if (context.fetchTransactions) {
      setIsRefreshing(true);
      try {
        await context.fetchTransactions();
        addToast('Data refreshed successfully', 'success');
      } catch (err) {
        console.error(err);
        addToast('Failed to refresh data', 'error');
      } finally {
        setIsRefreshing(false);
      }
    } else {
      addToast('Data is up to date', 'success'); // fallback if fetchTransactions is unavailable
    }
  }, [context, addToast]);

  const handleShare = useCallback(async () => {
    const summary = `My Budget Dashboard\nBalance: ${safeFmt ? safeFmt(rawBalance) : rawBalance}\nNet Savings: ${safeFmt ? safeFmt(netSavings) : netSavings}\nSavings Rate: ${savingsRate}%`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Financial Dashboard', text: summary });
      } else {
        await navigator.clipboard.writeText(summary);
        addToast('Dashboard summary copied to clipboard!', 'success');
      }
    } catch (err) {
      console.error(err);
      if (err.name !== 'AbortError') addToast('Sharing failed', 'error');
    }
  }, [rawBalance, netSavings, savingsRate, safeFmt, addToast]);

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

  const handleAddTransaction = useCallback(async (tx) => {
    const validation = validateTransaction(tx);
    if (!validation.isValid) return addToast(`Validation failed: ${validation.errors.join(', ')}`, 'error');

    try {
      await addTransaction(tx);
      setShowForm(false);
      addToast('Transaction added successfully!', 'success');
    } catch (error) {
      addToast(error.message || 'Failed to add transaction. Please try again.', 'error');
    }
  }, [addTransaction, addToast]);

  // ==================== RENDER ====================

  if (!user) return <DashboardLoading />;

  return (
    <div className="bento-dashboard">
      <div className="toast-queue-container" style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-end', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <AnimatePresence>
            {toasts.map(t => (
              <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="bento-header">
        <motion.div className="bento-insight-pill" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
          <Sparkles size={14} />{savingsRateText}
        </motion.div>
        <div className="bento-actions">
          <motion.button className="bbtn-icon" onClick={handleRefresh} disabled={isRefreshing} title="Refresh (Ctrl+R)" aria-label="Refresh Data" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
            <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
          </motion.button>
          <motion.button className="bbtn-icon" onClick={handleShare} title="Share Dashboard" aria-label="Share" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
            <Share2 size={16} />
          </motion.button>
          <motion.button
            className="bbtn-icon"
            onClick={handleExportJSON}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            title="Export JSON"
            aria-label="Export JSON"
          >
            <Download size={16} />
          </motion.button>
          <motion.button className="bbtn-pri bbtn-full" onClick={() => setShowForm(true)} title="Ctrl+N" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Plus size={14} /> {getLocalizedText('add_transaction', 'Add Transaction')}
          </motion.button>
        </div>
      </div>

      <motion.div className="bento-filters" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }} role="search" aria-label="Filter transactions">
        <select className="filter-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date">
          <option value="all">All Time</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="thisMonth">This Month</option>
        </select>
        <select className="filter-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
          <option value="all">All Categories</option>
          {Object.keys(CATEGORY_ICONS).map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        {(dateFilter !== 'all' || categoryFilter !== 'all') && (
          <button className="filter-clear" onClick={() => { setDateFilter('all'); setCategoryFilter('all'); }} aria-label="Clear filters">Clear Filters</button>
        )}
      </motion.div>

      <motion.div className="bento-grid" variants={STAGGER} initial="hidden" animate="show">
        <div className="ambient-orb orb-chart" style={{ top: '15%', right: '5%' }} aria-hidden="true"></div>
        <div className="ambient-orb orb-goal" style={{ bottom: '10%', left: '10%' }} aria-hidden="true"></div>
        <div className="ambient-orb orb-ai" style={{ bottom: '2%', right: '2%' }} aria-hidden="true"></div>

        <motion.div variants={CARD_VARIANTS} className={`bento-tile bento-hero glass ${balanceDone ? 'numberGlow' : ''}`} style={{ borderColor: rawBalance >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }} role="region" aria-label="Account balance">
          <div className="blob-glow" style={{ background: rawBalance >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }}></div>
          <div className="bh-top"><span className="bh-label">{getLocalizedText('total_balance', 'Total Balance')}</span><Wallet size={20} className="bh-icon" style={{ color: balanceColor }} /></div>
          <div className="bh-mid">
            <h2 style={{ fontSize: '2.4rem', fontWeight: '900', color: balanceColor, margin: '8px 0' }}>{safeFormatCurrency(animatedBalance, safeFmt)}</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{getLocalizedText('net_position', 'Net position')}</span>
              <div className="bh-trend neutral" style={{ background: 'var(--glass-2)' }}><Minus size={14} /><span>{getLocalizedText('vs_last_month', '+0% vs last month')}</span></div>
            </div>
          </div>
        </motion.div>

        <StatCard icon={TrendingUp} label={getLocalizedText('total_income', 'Total Income')} value={safeFormatCurrency(animatedIncome, safeFmt)} colorRgb="16,185,129" subtitle={getLocalizedText('all_time', 'All time')} trend="neutral" trendVal={getLocalizedText('vs_last_month', '+0% vs last month')} className="bento-income" />
        <StatCard icon={TrendingDown} label={getLocalizedText('total_expenses', 'Total Expenses')} value={safeFormatCurrency(animatedExpense, safeFmt)} colorRgb="239,68,68" subtitle={getLocalizedText('all_time', 'All time')} trend="neutral" trendVal={getLocalizedText('vs_last_month', '+0% vs last month')} className="bento-expense" />

        <motion.div variants={CARD_VARIANTS} className="bento-tile bento-recent glass">
          <div className="bt-header">
            <h3 className="heading-accent">{getLocalizedText('recent_transactions', 'Recent Transactions')}</h3>
            <button className="bt-icon-btn" onClick={() => setShowForm(true)}><Plus size={16} /></button>
          </div>
          {parsedTransactions.length === 0 ? <EmptyTransactionState onAddClick={() => setShowForm(true)} /> : (
            <div className="bt-list" role="list">
              {groupedTxns.map((item, idx) => {
                if (item.type === 'header') return <div key={`hdr-${idx}`} className="bt-date-group" role="heading" aria-level={4}>{item.label}</div>;
                const tx = item.data;
                return (
                  <div key={tx.id || `tx-${idx}`} className="bt-item" role="listitem">
                    <div className={`bt-icn ${tx.type}`}><span className="bt-cat-emoji" aria-hidden="true">{getCatIcon(tx.category)}</span></div>
                    <div className="bt-info"><span className="bt-cat">{tx.category || 'Uncategorized'}</span><span className="bt-date">{tx.description || getDateLabel(tx.date)}</span></div>
                    <div className={`bt-amt ${tx.type}`}>{tx.type === 'income' ? '+' : '-'}{safeFormatCurrency(tx.amount, safeFmt)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div variants={CARD_VARIANTS} className="bento-tile bento-chart glass">
          <div className="bt-header"><h3 className="heading-accent">{getLocalizedText('spending_vs_income', 'Spending vs Income')}</h3><span className="bt-badge">{getLocalizedText('daily_trend', 'Daily Trend')}</span></div>
          <div className="bt-chart-wrap">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart key={`area-${dataVersion}`} data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.75} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gEx" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.65} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(val) => safeFormatCurrency(val, safeFmt)} />
                  <Legend wrapperStyle={{ paddingTop: 12, fontSize: '0.78rem', fontWeight: 700 }} formatter={(value) => <span style={{ color: 'var(--text-secondary)' }}>{value === 'income' ? getLocalizedText('income_label', 'Income') : getLocalizedText('expense_label', 'Expenses')}</span>} />
                  <Area isAnimationActive={!prefersReducedMotion} animationBegin={800} type="monotone" dataKey="income" stroke="#10b981" fill="url(#gIn)" strokeWidth={2.5} strokeLinecap="round" dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }} />
                  <Area isAnimationActive={!prefersReducedMotion} animationBegin={800} type="monotone" dataKey="expense" stroke="#ef4444" fill="url(#gEx)" strokeWidth={2.5} strokeLinecap="round" dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: '#ef4444' }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="bento-empty"><span className="bento-empty-icon" aria-hidden="true"><LineChart size={42} strokeWidth={1.5} opacity={0.5} /></span><p className="bento-empty-title">{getLocalizedText('story_starts', 'Your story starts here')}</p><p className="bento-empty-sub">{getLocalizedText('add_tx_timeline', 'Add transactions to see your spending timeline.')}</p></div>}
          </div>
          {chartData.length > 0 && <div className="bt-chart-summary" role="note">{rawExpense > rawIncome ? getLocalizedText('spent_pct', `⚠️ You spent {pct}% of your income this period`).replace('{pct}', expenseOfIncome) : rawIncome > 0 ? getLocalizedText('saved_pct', `✅ You saved {pct}% of your income this period`).replace('{pct}', savingsRate) : getLocalizedText('add_income_rate', 'Add income transactions to see your savings rate')}</div>}
        </motion.div>

        <motion.div variants={CARD_VARIANTS} className="bento-tile bento-goal glass">
          <div className="bt-header"><h3 className="heading-accent">{getLocalizedText('savings_goal', 'Savings Goal')}</h3><Target size={16} className="bt-icon-muted" /></div>
          {monthlyGoal > 0 ? (
            <><div className="bg-hud"><span className="bg-pct">{goalProgress.toFixed(0)}%</span><span className="bg-frac">{safeFormatCurrency(Math.max(0, netSavings), safeFmt)} / {safeFormatCurrency(monthlyGoal, safeFmt)}</span></div><div className="bg-track"><motion.div className={`bg-fill ${goalProgress < 15 ? 'breathing' : ''}`} initial={{ width: 0 }} animate={{ width: `${goalProgress}%` }} transition={{ duration: 1.5, delay: 0.5 }}><div className="bg-glow-dot"></div></motion.div></div>{goalProgress < 10 && <p className="bg-nudge">{getLocalizedText('getting_started_nudge', `You're just getting started! Keep tracking. 💪`)}</p>}</>
          ) : <div className="bento-empty"><span className="bento-empty-icon" aria-hidden="true"><Target size={42} strokeWidth={1.5} opacity={0.5} /></span><p className="bento-empty-title">{getLocalizedText('set_savings_goal', 'Set a savings goal')}</p><p className="bento-empty-sub">{getLocalizedText('track_progress_target', 'Track your progress toward a monthly target.')}</p><NavLink to="/settings" className="bento-empty-cta pulse-encouragement" style={{ textDecoration: 'none' }}><Settings size={13} /> {getLocalizedText('set_goal_cta', 'Set Goal →')}</NavLink></div>}
        </motion.div>



        <motion.div variants={CARD_VARIANTS} className="bento-tile bento-pie glass">
          <div className="bt-header"><h3 className="heading-accent">{getLocalizedText('breakdown', 'Breakdown')}</h3></div>
          <div className="bt-pie-wrap">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart key={`pie-${dataVersion}`}>
                  <Pie isAnimationActive={!prefersReducedMotion} animationBegin={800} data={pieData} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" paddingAngle={4} dataKey="value" stroke="none">{pieData.map((_, i) => <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(val) => safeFormatCurrency(val, safeFmt)} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem', fontWeight: 700 }} formatter={(value) => <span style={{ color: 'var(--text-secondary)' }}>{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="bento-empty"><span className="bento-empty-icon" aria-hidden="true"><Tag size={42} strokeWidth={1.5} opacity={0.5} /></span><p className="bento-empty-title">{getLocalizedText('no_exp_yet', 'No expenses yet')}</p><p className="bento-empty-sub">{getLocalizedText('track_spend_breakdown', 'Track spending to see category breakdown.')}</p></div>}
          </div>
        </motion.div>

      </motion.div>

      <AnimatePresence>
        {showForm && <TransactionForm onClose={() => setShowForm(false)} onSubmit={handleAddTransaction} />}
      </AnimatePresence>
    </div>
  );
}
