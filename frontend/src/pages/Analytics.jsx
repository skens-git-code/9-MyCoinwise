import React, {
  useContext, useMemo, useState, useRef, useCallback, useEffect, memo
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppContext } from '../contexts/AppContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Calendar, Download, Share2, Sparkles, Eye, ShieldAlert,
  ArrowUpRight, ArrowDownRight, Layers, BarChart3, HelpCircle,
  X, Filter, ChevronDown, ChevronUp
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';

// ---------- Constants ----------
const PIE_COLORS_LIGHT = ['#059669', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#f97316', '#14b8a6'];
const PIE_COLORS_DARK = ['#34d399', '#22d3ee', '#fbbf24', '#6ee7b7', '#f87171', '#f472b6', '#a78bfa', '#60a5fa', '#fb923c', '#5eead4'];
const CATEGORY_COLORS_LIGHT = ['#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#ef4444', '#14b8a6'];
const CATEGORY_COLORS_DARK = ['#34d399', '#22d3ee', '#fbbf24', '#a78bfa', '#f472b6', '#60a5fa', '#f87171', '#5eead4'];

// ---------- Utilities ----------
const validateTransaction = (t) => {
  if (!t || typeof t !== 'object') return false;
  if (!t.date || isNaN(new Date(t.date).getTime())) return false;
  if (!t.type || !['income', 'expense'].includes(t.type)) return false;
  const amt = Number(t.amount);
  if (t.amount === undefined || t.amount === null || isNaN(amt) || amt < 0) return false;
  return true;
};

const safeParseAmount = (amount) => {
  const num = Number(amount);
  return isNaN(num) || num < 0 ? 0 : num;
};

const formatDelta = (cur, prev) => {
  if (prev === 0) {
    return cur > 0 ? '+∞' : cur < 0 ? '-∞' : '0%';
  }
  if (Math.abs(prev) < 0.01 && Math.abs(cur) < 0.01) return '0%';
  const delta = ((cur - prev) / Math.abs(prev)) * 100;
  if (!Number.isFinite(delta)) return '∞';
  if (Math.abs(delta) > 9999) return delta > 0 ? '>9999%' : '<-9999%';
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
};

const toMonthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (key) => {
  const [year, month] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

// ---------- Custom Tooltip (memoized) ----------
const CustomTooltip = memo(({ active, payload, label, isDark, fmt }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="custom-tooltip glass" style={{
      backgroundColor: isDark ? 'rgba(10,10,26,0.95)' : 'rgba(255,255,255,0.95)',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(5, 150, 105, 0.2)'}`,
      borderRadius: '12px',
      padding: '10px 14px',
      color: isDark ? '#f8fafc' : '#0f172a',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      fontSize: '0.82rem'
    }}>
      <p style={{ margin: '0 0 6px 0', fontWeight: 'bold' }}>{label}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ margin: '3px 0', color: entry.color, fontWeight: 600 }}>
          {entry.name}: {typeof fmt === 'function' ? fmt(entry.value) : `$${entry.value}`}
        </p>
      ))}
    </div>
  );
});

// ---------- Drill‑Down Modal ----------
const DrillDownModal = ({ isOpen, onClose, title, transactions, fmt }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-color)', maxWidth: '600px', width: '90%', maxHeight: '80vh', borderRadius: '16px', padding: '1.5rem', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close modal"><X size={20} /></button>
        </div>
        {transactions.length === 0 ? (
          <p>No transactions found.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {transactions.map((t, idx) => (
              <li key={t.id || t._id || idx} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{t.note || t.category || 'Uncategorized'} – {new Date(t.date).toLocaleDateString()}</span>
                <span style={{ fontWeight: 'bold' }}>{fmt ? fmt(t.amount) : t.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ---------- Main Component ----------
export default function Analytics() {
  const { transactions = [], theme, fmt: contextFmt } = useContext(AppContext);
  const { showToast } = useToast();
  const isDark = theme === 'amoled';

  // Fallback fmt
  const fmt = useCallback(
    (value) => {
      if (contextFmt) return contextFmt(value);
      if (value === undefined || value === null) return '$0.00';
      const num = Number(value);
      if (isNaN(num)) return '$0.00';
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
    },
    [contextFmt]
  );

  // ---------- State ----------
  const [periodFilter, setPeriodFilter] = useState('month');
  const [chartType, setChartType] = useState('bar');
  const [showAllEvolutionCategories, setShowAllEvolutionCategories] = useState(false);
  const [reviewedAnomalies, setReviewedAnomalies] = useState(() => {
    try {
      const stored = localStorage.getItem('mycoinwise-reviewed-anomalies');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [drillData, setDrillData] = useState({ isOpen: false, title: '', transactions: [] });

  const chartSectionRef = useRef(null);

  // ---------- Persist reviewed anomalies ----------
  useEffect(() => {
    localStorage.setItem('mycoinwise-reviewed-anomalies', JSON.stringify([...reviewedAnomalies]));
  }, [reviewedAnomalies]);

  // ---------- Stable Transactions Memo ----------
  const validTransactions = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    // Use a stable serialization to avoid recomputation on reference changes
    return transactions.filter(validateTransaction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(transactions)]);

  // ---------- Period Comparison Logic ----------
  const comparisonMetrics = useMemo(() => {
    const now = new Date();
    let currentStart, currentEnd, prevStart, prevEnd;
    const isAll = periodFilter === 'all';

    if (isAll) {
      currentStart = new Date(0);
      currentEnd = new Date();
      prevStart = null;
      prevEnd = null;
    } else if (periodFilter === 'month') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (periodFilter === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      currentStart = new Date(now.getFullYear(), q * 3, 1);
      currentEnd = new Date(now.getFullYear(), (q + 1) * 3, 0, 23, 59, 59);
      prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
      prevEnd = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59);
    } else if (periodFilter === 'year') {
      currentStart = new Date(now.getFullYear(), 0, 1);
      currentEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      prevStart = new Date(now.getFullYear() - 1, 0, 1);
      prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
    } else {
      // custom range
      if (customRange.start && customRange.end) {
        currentStart = new Date(customRange.start);
        currentEnd = new Date(customRange.end);
        // For custom, we don't compute previous automatically; we'll show only current
        prevStart = null;
        prevEnd = null;
      } else {
        currentStart = new Date(0);
        currentEnd = new Date();
        prevStart = null;
        prevEnd = null;
      }
    }

    const filterTxs = (start, end) => {
      if (!start || !end) return [];
      return validTransactions.filter(t => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      });
    };

    const currentTxs = filterTxs(currentStart, currentEnd);
    const prevTxs = (prevStart && prevEnd) ? filterTxs(prevStart, prevEnd) : [];

    const sumTxs = (list) => {
      const inc = list.filter(t => t.type === 'income').reduce((a, c) => a + safeParseAmount(c.amount), 0);
      const exp = list.filter(t => t.type === 'expense').reduce((a, c) => a + safeParseAmount(c.amount), 0);
      return { income: inc, expense: exp, net: inc - exp, count: list.length };
    };

    const curSum = sumTxs(currentTxs);
    const prevSum = sumTxs(prevTxs);

    const deltaIncome = prevStart ? formatDelta(curSum.income, prevSum.income) : 'N/A';
    const deltaExpense = prevStart ? formatDelta(curSum.expense, prevSum.expense) : 'N/A';
    const deltaNet = prevStart ? formatDelta(curSum.net, prevSum.net) : 'N/A';

    // Savings rate
    const savingsRate = curSum.income > 0 ? ((curSum.net / curSum.income) * 100) : 0;

    return {
      current: curSum,
      previous: prevSum,
      incomeDelta: deltaIncome,
      expenseDelta: deltaExpense,
      netDelta: deltaNet,
      savingsRate,
      hasComparison: !!prevStart
    };
  }, [validTransactions, periodFilter, customRange]);

  // ---------- Monthly Aggregates ----------
  const monthlyData = useMemo(() => {
    const monthMap = new Map();
    validTransactions.forEach(t => {
      const key = toMonthKey(t.date);
      const amount = safeParseAmount(t.amount);
      if (!monthMap.has(key)) {
        monthMap.set(key, { name: key, income: 0, expense: 0, timestamp: new Date(t.date).getTime() });
      }
      const data = monthMap.get(key);
      if (t.type === 'income') data.income += amount;
      else data.expense += amount;
    });
    return Array.from(monthMap.values())
      .map(m => ({
        ...m,
        savings: parseFloat((m.income - m.expense).toFixed(2)),
        displayName: formatMonthLabel(m.name)
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-8);
  }, [validTransactions]);

  // ---------- Category Evolution ----------
  const categoryEvolution = useMemo(() => {
    const catTotals = {};
    validTransactions.filter(t => t.type === 'expense').forEach(t => {
      const c = t.category || 'Other';
      catTotals[c] = (catTotals[c] || 0) + safeParseAmount(t.amount);
    });
    const sortedCats = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .map(e => e[0]);
    const activeCats = showAllEvolutionCategories ? sortedCats.slice(0, 8) : sortedCats.slice(0, 5);

    const monthMap = {};
    validTransactions.filter(t => t.type === 'expense').forEach(t => {
      const mKey = toMonthKey(t.date);
      if (!monthMap[mKey]) {
        monthMap[mKey] = { name: mKey, timestamp: new Date(t.date).getTime() };
        activeCats.forEach(c => { monthMap[mKey][c] = 0; });
      }
      const cat = t.category || 'Other';
      if (activeCats.includes(cat)) {
        monthMap[mKey][cat] = (monthMap[mKey][cat] || 0) + safeParseAmount(t.amount);
      }
    });

    const data = Object.values(monthMap)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-6)
      .map(d => ({ ...d, displayName: formatMonthLabel(d.name) }));

    return { data, categories: activeCats };
  }, [validTransactions, showAllEvolutionCategories]);

  // ---------- Day of Week ----------
  const dayOfWeekData = useMemo(() => {
    const days = [
      { name: 'Sun', expense: 0, income: 0, count: 0 },
      { name: 'Mon', expense: 0, income: 0, count: 0 },
      { name: 'Tue', expense: 0, income: 0, count: 0 },
      { name: 'Wed', expense: 0, income: 0, count: 0 },
      { name: 'Thu', expense: 0, income: 0, count: 0 },
      { name: 'Fri', expense: 0, income: 0, count: 0 },
      { name: 'Sat', expense: 0, income: 0, count: 0 },
    ];
    let weekendExp = 0, weekdayExp = 0;
    validTransactions.forEach(t => {
      const d = new Date(t.date).getDay();
      const amt = safeParseAmount(t.amount);
      if (t.type === 'expense') {
        days[d].expense += amt;
        if (d === 0 || d === 6) weekendExp += amt;
        else weekdayExp += amt;
      } else {
        days[d].income += amt;
      }
      days[d].count++;
    });
    const totalExp = weekendExp + weekdayExp;
    const weekendPct = totalExp > 0 ? ((weekendExp / totalExp) * 100).toFixed(0) : '0';
    return { days, weekendExp, weekdayExp, weekendPct: Number(weekendPct) };
  }, [validTransactions]);

  // ---------- Anomaly Detection ----------
  const anomalies = useMemo(() => {
    const catStats = {};
    validTransactions.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'Other';
      if (!catStats[cat]) catStats[cat] = [];
      catStats[cat].push({ tx: t, amount: safeParseAmount(t.amount) });
    });
    const flagged = [];
    Object.entries(catStats).forEach(([cat, list]) => {
      if (list.length < 3) return;
      const mean = list.reduce((a, c) => a + c.amount, 0) / list.length;
      const variance = list.reduce((a, c) => a + Math.pow(c.amount - mean, 2), 0) / list.length;
      const stdDev = Math.sqrt(variance);
      list.forEach(({ tx, amount }) => {
        if (amount > mean + (2 * stdDev) && amount > 50) {
          const id = tx.id || tx._id || `${cat}-${tx.date}-${amount}-${Math.random()}`;
          flagged.push({
            id,
            tx,
            mean,
            stdDev,
            ratio: (amount / (mean || 1)).toFixed(1)
          });
        }
      });
    });
    return flagged.sort((a, b) => new Date(b.tx.date) - new Date(a.tx.date));
  }, [validTransactions]);

  const activeAnomalies = useMemo(
    () => anomalies.filter(a => !reviewedAnomalies.has(a.id)),
    [anomalies, reviewedAnomalies]
  );

  // ---------- Expense Categories ----------
  const expenseCategories = useMemo(() => {
    const map = new Map();
    validTransactions.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'Other';
      map.set(cat, (map.get(cat) || 0) + safeParseAmount(t.amount));
    });
    const total = Array.from(map.values()).reduce((a, c) => a + c, 0);
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value: parseFloat(value.toFixed(2)),
      percentage: total > 0 ? ((value / total) * 100).toFixed(1) : 0
    })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [validTransactions]);

  // ---------- AI Insights ----------
  const generatedInsights = useMemo(() => {
    const cards = [];
    const expDelta = comparisonMetrics.expenseDelta;
    if (typeof expDelta === 'string' && expDelta.startsWith('+')) {
      const num = parseFloat(expDelta);
      if (num > 15) {
        cards.push({
          type: 'warning',
          title: 'Spending Acceleration',
          message: `Your spending this period is ${num.toFixed(0)}% higher than the previous period. Consider reviewing discretionary expenses.`
        });
      }
    } else if (typeof expDelta === 'string' && expDelta.startsWith('-')) {
      const num = parseFloat(expDelta);
      if (num < -10) {
        cards.push({
          type: 'success',
          title: 'Spending Discipline',
          message: `Great job! Your spending is down by ${Math.abs(num).toFixed(0)}% compared to last period.`
        });
      }
    }
    if (dayOfWeekData.weekendPct >= 40) {
      cards.push({
        type: 'info',
        title: 'Weekend Outflow Concentration',
        message: `${dayOfWeekData.weekendPct}% of your total expenses occur on Saturdays & Sundays.`
      });
    }
    if (expenseCategories.length > 0 && Number(expenseCategories[0]?.percentage) > 35) {
      cards.push({
        type: 'info',
        title: `Heavy ${expenseCategories[0].name} Concentration`,
        message: `${expenseCategories[0].name} accounts for ${expenseCategories[0].percentage}% of total expenses. Diversifying or budgeting this area will boost net savings.`
      });
    }
    if (comparisonMetrics.savingsRate < 10 && comparisonMetrics.savingsRate >= 0) {
      cards.push({
        type: 'warning',
        title: 'Low Savings Rate',
        message: `Your savings rate is only ${comparisonMetrics.savingsRate.toFixed(1)}%. Consider cutting non‑essential expenses.`
      });
    }
    if (cards.length === 0) {
      cards.push({
        type: 'success',
        title: 'Balanced Financial Trajectory',
        message: 'Your income-to-expense distribution remains healthy and within normal variance.'
      });
    }
    return cards;
  }, [comparisonMetrics, dayOfWeekData, expenseCategories]);

  // ---------- Handlers ----------
  const handleMarkAnomalyReviewed = useCallback((id) => {
    setReviewedAnomalies(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast('success', 'Transaction marked as reviewed.');
  }, [showToast]);

  const handleDismissAnomaly = useCallback((id) => {
    setReviewedAnomalies(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast('success', 'Anomaly dismissed.');
  }, [showToast]);

  const exportChartAsImage = async () => {
    try {
      const { default: html2canvas } = await import('html2canvas');
      if (!chartSectionRef.current) return;
      const canvas = await html2canvas(chartSectionRef.current, {
        scale: 2,
        backgroundColor: isDark ? '#090d16' : '#ffffff',
        useCORS: true
      });
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `mycoinwise_analytics_${new Date().toISOString().split('T')[0]}.png`;
      link.click();
      showToast('success', 'Chart image downloaded as PNG!');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to export chart image.');
    }
  };

  const exportCSV = useCallback(() => {
    const headers = ['Date', 'Type', 'Category', 'Amount', 'Note'];
    const rows = validTransactions.map(t => [
      t.date,
      t.type,
      t.category || 'Other',
      safeParseAmount(t.amount),
      t.note || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mycoinwise_data_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'CSV exported successfully!');
  }, [validTransactions, showToast]);

  const handleShareSummary = useCallback(() => {
    const text = `📊 MyCoinwise Financial Report (${periodFilter.toUpperCase()})
• Inflow: ${fmt(comparisonMetrics.current.income)}
• Outflow: ${fmt(comparisonMetrics.current.expense)}
• Net Savings: ${fmt(comparisonMetrics.current.net)}
• Savings Rate: ${comparisonMetrics.savingsRate.toFixed(1)}%
• Top Category: ${expenseCategories[0]?.name || 'N/A'} (${expenseCategories[0]?.percentage || 0}%)
• Period vs Period Expense Shift: ${comparisonMetrics.expenseDelta}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast('success', 'Financial summary copied to clipboard!');
    } else {
      showToast('error', 'Clipboard not available.');
    }
  }, [periodFilter, fmt, comparisonMetrics, expenseCategories, showToast]);

  const handleChartClick = useCallback((data, chartType) => {
    if (!data) return;
    let title = '';
    let filtered = [];
    if (chartType === 'bar' && data.activeLabel) {
      // Click on a monthly bar – show transactions in that month
      const monthKey = data.activeLabel; // this is the display name, but we need to map back to YYYY-MM
      // Find the month key from monthlyData
      const monthEntry = monthlyData.find(m => m.displayName === monthKey);
      if (monthEntry) {
        const key = monthEntry.name;
        const start = new Date(key);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        filtered = validTransactions.filter(t => {
          const d = new Date(t.date);
          return d >= start && d <= end;
        });
        title = `Transactions for ${monthKey}`;
      }
    } else if (chartType === 'pie' && data && data.name) {
      // Click on a pie slice – show transactions in that category
      const cat = data.name;
      filtered = validTransactions.filter(t => (t.category || 'Other') === cat && t.type === 'expense');
      title = `Expenses in "${cat}"`;
    }
    if (filtered.length > 0) {
      setDrillData({ isOpen: true, title, transactions: filtered });
    } else {
      showToast('info', 'No transactions found for this selection.');
    }
  }, [monthlyData, validTransactions, showToast]);

  // ---------- Custom Range ----------
  const applyCustomRange = useCallback(() => {
    if (customRange.start && customRange.end) {
      setPeriodFilter('custom');
      showToast('success', 'Custom range applied.');
    } else {
      showToast('error', 'Please select both start and end dates.');
    }
  }, [customRange, showToast]);

  // ---------- Theme-aware colours ----------
  const pieColors = isDark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;
  const categoryColors = isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;

  // ---------- Render ----------
  return (
    <div className="shared-page analytics-page-wrap">
      <div className="spage-header">
        <div className="spage-title">
          <h2>Analytics & Intelligence</h2>
          <span className="badge">AI Insights</span>
        </div>
        <div className="analytics-actions">
          <button onClick={exportChartAsImage} className="btn-secondary" title="Download PNG of analytics charts">
            <Download size={15} /> Export PNG
          </button>
          <button onClick={exportCSV} className="btn-secondary" title="Export data as CSV">
            <Download size={15} /> CSV
          </button>
          <button onClick={handleShareSummary} className="btn-primary" title="Copy shareable summary report">
            <Share2 size={15} /> Share Summary
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="analytics-period-bar glass">
        <span className="apb-label"><Calendar size={14} /> Compare Period:</span>
        <div className="apb-buttons">
          {[
            { id: 'month', label: 'This Month vs Last' },
            { id: 'quarter', label: 'This Quarter vs Last' },
            { id: 'year', label: 'Year over Year' },
          ].map(p => (
            <button
              key={p.id}
              className={`apb-btn ${periodFilter === p.id ? 'active' : ''}`}
              onClick={() => setPeriodFilter(p.id)}
            >
              {p.label}
            </button>
          ))}
          <button
            className={`apb-btn ${periodFilter === 'custom' ? 'active' : ''}`}
            onClick={() => setShowCustomRange(!showCustomRange)}
          >
            <Filter size={14} /> Custom
          </button>
        </div>
      </div>

      {/* Custom Range Inputs */}
      {showCustomRange && (
        <div className="custom-range-panel glass" style={{ padding: '0.75rem', marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label>Start: <input type="date" value={customRange.start} onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))} /></label>
          <label>End: <input type="date" value={customRange.end} onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))} /></label>
          <button className="btn-secondary" onClick={applyCustomRange}>Apply</button>
          <button className="btn-secondary" onClick={() => { setShowCustomRange(false); setPeriodFilter('month'); }}>Cancel</button>
        </div>
      )}

      {/* Comparison Cards */}
      <div className="analytics-comparison-grid">
        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Period Inflow</span>
            <span className={`sc-delta ${comparisonMetrics.incomeDelta !== 'N/A' && !comparisonMetrics.incomeDelta.startsWith('-') ? 'text-success' : 'text-danger'}`}>
              {comparisonMetrics.incomeDelta !== 'N/A' ? (comparisonMetrics.incomeDelta.startsWith('+') ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />) : null}
              {comparisonMetrics.incomeDelta}
            </span>
          </div>
          <h3 className="sc-val text-success">+{fmt(comparisonMetrics.current.income)}</h3>
          {comparisonMetrics.hasComparison && <p className="sc-prev">Prev: {fmt(comparisonMetrics.previous.income)}</p>}
        </motion.div>

        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Period Outflow</span>
            <span className={`sc-delta ${comparisonMetrics.expenseDelta !== 'N/A' && comparisonMetrics.expenseDelta.startsWith('-') ? 'text-success' : 'text-danger'}`}>
              {comparisonMetrics.expenseDelta !== 'N/A' ? (comparisonMetrics.expenseDelta.startsWith('-') ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />) : null}
              {comparisonMetrics.expenseDelta}
            </span>
          </div>
          <h3 className="sc-val text-danger">-{fmt(comparisonMetrics.current.expense)}</h3>
          {comparisonMetrics.hasComparison && <p className="sc-prev">Prev: {fmt(comparisonMetrics.previous.expense)}</p>}
        </motion.div>

        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Net Position</span>
            <span className={`sc-delta ${comparisonMetrics.netDelta !== 'N/A' && comparisonMetrics.netDelta.startsWith('+') ? 'text-success' : 'text-danger'}`}>
              {comparisonMetrics.netDelta !== 'N/A' ? (comparisonMetrics.netDelta.startsWith('+') ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />) : null}
              {comparisonMetrics.netDelta}
            </span>
          </div>
          <h3 className={`sc-val ${comparisonMetrics.current.net >= 0 ? 'text-success' : 'text-danger'}`}>
            {comparisonMetrics.current.net >= 0 ? '+' : ''}{fmt(comparisonMetrics.current.net)}
          </h3>
          {comparisonMetrics.hasComparison && <p className="sc-prev">Prev: {fmt(comparisonMetrics.previous.net)}</p>}
        </motion.div>

        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Savings Rate</span>
            <span className={`sc-delta ${comparisonMetrics.savingsRate >= 15 ? 'text-success' : 'text-warning'}`}>
              {comparisonMetrics.savingsRate >= 15 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            </span>
          </div>
          <h3 className="sc-val">{comparisonMetrics.savingsRate.toFixed(1)}%</h3>
          <p className="sc-prev">of income saved</p>
        </motion.div>
      </div>

      {/* AI Insights */}
      <div className="analytics-ai-strip">
        {generatedInsights.map((ins, i) => (
          <div key={i} className={`ai-insight-card glass ${ins.type}`}>
            <div className="aic-icon">
              <Sparkles size={16} />
            </div>
            <div className="aic-body">
              <strong>{ins.title}</strong>
              <p>{ins.message}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Anomalies */}
      {activeAnomalies.length > 0 && (
        <motion.div className="analytics-anomaly-box glass" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="aab-header">
            <div className="aab-title">
              <ShieldAlert size={18} className="text-warning" />
              <h4>Unusual Spending Detected ({activeAnomalies.length})</h4>
            </div>
            <span className="aab-sub">Transactions {'>'}2 standard deviations above category average</span>
          </div>
          <div className="aab-list">
            {activeAnomalies.slice(0, 5).map(a => (
              <div key={a.id} className="aab-row">
                <div className="aab-info">
                  <span className="aab-cat">{a.tx.category}</span>
                  <span className="aab-date">{new Date(a.tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
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

      {/* Charts Section */}
      <div ref={chartSectionRef} className="analytics-charts">
        <motion.div className="chart-card glass chart-card-large" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="chart-header">
            <h3>Monthly Financial Trajectory</h3>
            <div className="chart-controls">
              <button onClick={() => setChartType('bar')} className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}>Bar</button>
              <button onClick={() => setChartType('line')} className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}>Line</button>
            </div>
          </div>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              {chartType === 'bar' ? (
                <BarChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }} onClick={(data) => handleChartClick(data, 'bar')}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="displayName" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                  <Legend />
                  <Bar dataKey="income" fill={isDark ? '#34d399' : '#10b981'} radius={[6, 6, 0, 0]} name="Inflow" />
                  <Bar dataKey="expense" fill={isDark ? '#f87171' : '#ef4444'} radius={[6, 6, 0, 0]} name="Outflow" />
                  <Bar dataKey="savings" fill={isDark ? '#6ee7b7' : '#059669'} radius={[6, 6, 0, 0]} name="Net Savings" />
                </BarChart>
              ) : (
                <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }} onClick={(data) => handleChartClick(data, 'line')}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="displayName" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                  <Legend />
                  <Line type="monotone" dataKey="income" stroke={isDark ? '#34d399' : '#10b981'} strokeWidth={2.5} dot={{ r: 4 }} name="Inflow" />
                  <Line type="monotone" dataKey="expense" stroke={isDark ? '#f87171' : '#ef4444'} strokeWidth={2.5} dot={{ r: 4 }} name="Outflow" />
                  <Line type="monotone" dataKey="savings" stroke={isDark ? '#6ee7b7' : '#059669'} strokeWidth={2.5} dot={{ r: 4 }} name="Net Savings" />
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty"><p>No monthly transaction records available.</p></div>
          )}
        </motion.div>

        <motion.div className="chart-card glass chart-card-large" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="chart-header">
            <div>
              <h3>Category Spending Evolution</h3>
              <span className="chart-badge">Historical Category Trends</span>
            </div>
            <button
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => setShowAllEvolutionCategories(prev => !prev)}
            >
              {showAllEvolutionCategories ? 'Show Top 5' : 'Show All (Top 8)'}
            </button>
          </div>
          {categoryEvolution.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={categoryEvolution.data.map(d => ({ ...d, displayName: d.displayName }))} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                <XAxis dataKey="displayName" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                {categoryEvolution.categories.map((cat, idx) => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={categoryColors[idx % categoryColors.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty"><p>Not enough category history to render evolution chart.</p></div>
          )}
        </motion.div>

        <motion.div className="chart-card glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="chart-header">
            <h3>Day of Week Outflow</h3>
            <span className="chart-badge">{dayOfWeekData.weekendPct}% Weekend</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dayOfWeekData.days} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
              <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
              <Bar dataKey="expense" fill={isDark ? '#fbbf24' : '#f59e0b'} radius={[6, 6, 0, 0]} name="Daily Expense" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div className="chart-card glass" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="chart-header">
            <h3>Expense Allocation</h3>
            <span className="chart-badge">By Category</span>
          </div>
          {expenseCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={expenseCategories}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  onClick={(data) => handleChartClick(data, 'pie')}
                >
                  {expenseCategories.map((entry, index) => (
                    <Cell key={`cell-${entry.name.replace(/\s+/g, '-')}-${index}`} fill={pieColors[index % pieColors.length]} />
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
        onClose={() => setDrillData({ isOpen: false, title: '', transactions: [] })}
        title={drillData.title}
        transactions={drillData.transactions}
        fmt={fmt}
      />
    </div>
  );
}