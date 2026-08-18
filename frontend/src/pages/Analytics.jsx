import React, { useContext, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppContext } from '../contexts/AppContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Calendar, Download, Share2, Sparkles, Eye, ShieldAlert,
  ArrowUpRight, ArrowDownRight, Layers, BarChart3, HelpCircle
} from 'lucide-react';
import { useToast } from '../components/ToastProvider';

// Constants
const PIE_COLORS = ['#059669', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#f97316', '#14b8a6'];
const CATEGORY_COLORS = ['#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#ef4444', '#14b8a6'];
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Utility functions
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

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, isDark, fmt }) => {
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
};

export default function Analytics() {
  const { transactions = [], theme, fmt } = useContext(AppContext);
  const { showToast } = useToast();
  
  const [periodFilter, setPeriodFilter] = useState('month'); // 'month', 'quarter', 'year', 'all'
  const [chartType, setChartType] = useState('bar');
  const [showAllEvolutionCategories, setShowAllEvolutionCategories] = useState(false);
  const [reviewedAnomalies, setReviewedAnomalies] = useState(() => new Set());
  const chartSectionRef = useRef(null);

  const isDark = theme === 'amoled';

  const validTransactions = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    return transactions.filter(validateTransaction);
  }, [transactions]);

  // ── Period Comparison Logic (Current vs Previous) ─────────────────────────
  const comparisonMetrics = useMemo(() => {
    const now = new Date();
    let currentStart, currentEnd, prevStart, prevEnd;

    if (periodFilter === 'month') {
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
      // All time
      currentStart = new Date(0);
      currentEnd = new Date();
      prevStart = new Date(0);
      prevEnd = new Date(0);
    }

    const currentTxs = validTransactions.filter(t => {
      const d = new Date(t.date);
      return d >= currentStart && d <= currentEnd;
    });

    const prevTxs = validTransactions.filter(t => {
      const d = new Date(t.date);
      return d >= prevStart && d <= prevEnd;
    });

    const sumTxs = (list) => {
      const inc = list.filter(t => t.type === 'income').reduce((a, c) => a + safeParseAmount(c.amount), 0);
      const exp = list.filter(t => t.type === 'expense').reduce((a, c) => a + safeParseAmount(c.amount), 0);
      return { income: inc, expense: exp, net: inc - exp };
    };

    const curSum = sumTxs(currentTxs);
    const prevSum = sumTxs(prevTxs);

    const calcDelta = (cur, prev) => {
      if (prev === 0) return cur > 0 ? 100 : (cur < 0 ? -100 : 0);
      return ((cur - prev) / Math.abs(prev)) * 100;
    };

    return {
      current: curSum,
      previous: prevSum,
      incomeDelta: calcDelta(curSum.income, prevSum.income),
      expenseDelta: calcDelta(curSum.expense, prevSum.expense),
      netDelta: calcDelta(curSum.net, prevSum.net)
    };
  }, [validTransactions, periodFilter]);

  // ── Monthly Aggregates ───────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const monthMap = new Map();
    
    validTransactions.forEach(t => {
      const date = new Date(t.date);
      if (isNaN(date.getTime())) return;
      
      const key = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const amount = safeParseAmount(t.amount);
      
      if (!monthMap.has(key)) {
        monthMap.set(key, { name: key, income: 0, expense: 0, timestamp: date.getTime(), savings: 0 });
      }
      
      const monthData = monthMap.get(key);
      if (t.type === 'income') monthData.income += amount;
      else monthData.expense += amount;
    });
    
    return Array.from(monthMap.values())
      .map(m => ({
        ...m,
        savings: parseFloat((m.income - m.expense).toFixed(2))
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-8);
  }, [validTransactions]);

  // ── Category Spending Evolution Over Time ─────────────────────────────────
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
      const date = new Date(t.date);
      const mKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (!monthMap[mKey]) {
        monthMap[mKey] = { name: mKey, timestamp: date.getTime() };
        activeCats.forEach(c => { monthMap[mKey][c] = 0; });
      }
      const cat = t.category || 'Other';
      if (activeCats.includes(cat)) {
        monthMap[mKey][cat] = (monthMap[mKey][cat] || 0) + safeParseAmount(t.amount);
      }
    });

    const data = Object.values(monthMap).sort((a, b) => a.timestamp - b.timestamp).slice(-6);
    return { data, categories: activeCats };
  }, [validTransactions, showAllEvolutionCategories]);

  // ── Day of Week Breakdown ─────────────────────────────────────────────────
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

    return {
      days,
      weekendExp,
      weekdayExp,
      weekendPct: (weekendExp + weekdayExp) > 0 ? ((weekendExp / (weekendExp + weekdayExp)) * 100).toFixed(0) : 0
    };
  }, [validTransactions]);

  // ── Anomaly Detection (> 2 std deviations from category mean) ─────────────
  const anomalies = useMemo(() => {
    const catStats = {};
    validTransactions.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'Other';
      if (!catStats[cat]) catStats[cat] = [];
      catStats[cat].push({ tx: t, amount: safeParseAmount(t.amount) });
    });

    const flagged = [];
    Object.entries(catStats).forEach(([cat, list]) => {
      if (list.length < 3) return; // need enough samples
      const mean = list.reduce((a, c) => a + c.amount, 0) / list.length;
      const variance = list.reduce((a, c) => a + Math.pow(c.amount - mean, 2), 0) / list.length;
      const stdDev = Math.sqrt(variance);

      list.forEach(({ tx, amount }) => {
        if (amount > mean + (2 * stdDev) && amount > 50) {
          flagged.push({
            id: tx.id || tx._id || `${cat}-${tx.date}-${amount}`,
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

  // ── Expense & Income Category Breakdown ──────────────────────────────────
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

  // ── AI Insights Cards ─────────────────────────────────────────────────────
  const generatedInsights = useMemo(() => {
    const cards = [];
    if (comparisonMetrics.expenseDelta > 15) {
      cards.push({
        type: 'warning',
        title: 'Spending Acceleration',
        message: `Your spending this period is ${comparisonMetrics.expenseDelta.toFixed(0)}% higher than the previous period. Consider reviewing discretionary expenses.`
      });
    } else if (comparisonMetrics.expenseDelta < -10) {
      cards.push({
        type: 'success',
        title: 'Spending Discipline',
        message: `Great job! Your spending is down by ${Math.abs(comparisonMetrics.expenseDelta).toFixed(0)}% compared to last period.`
      });
    }

    if (Number(dayOfWeekData.weekendPct) >= 40) {
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

    if (cards.length === 0) {
      cards.push({
        type: 'success',
        title: 'Balanced Financial Trajectory',
        message: 'Your income-to-expense distribution remains healthy and within normal variance.'
      });
    }

    return cards;
  }, [comparisonMetrics, dayOfWeekData, expenseCategories]);

  // ── Export Chart as PNG ───────────────────────────────────────────────────
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

  // ── Share Summary to Clipboard ───────────────────────────────────────────
  const handleShareSummary = () => {
    const text = `📊 MyCoinwise Financial Report (${periodFilter.toUpperCase()})
• Inflow: ${fmt(comparisonMetrics.current.income)}
• Outflow: ${fmt(comparisonMetrics.current.expense)}
• Net Savings: ${fmt(comparisonMetrics.current.net)}
• Top Category: ${expenseCategories[0]?.name || 'N/A'} (${expenseCategories[0]?.percentage || 0}%)
• Period vs Period Expense Shift: ${comparisonMetrics.expenseDelta >= 0 ? '+' : ''}${comparisonMetrics.expenseDelta.toFixed(1)}%`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast('success', 'Financial summary copied to clipboard!');
    }
  };

  const handleMarkAnomalyReviewed = (id) => {
    setReviewedAnomalies(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    showToast('success', 'Transaction marked as reviewed.');
  };

  const activeAnomalies = anomalies.filter(a => !reviewedAnomalies.has(a.id));

  return (
    <div className="shared-page analytics-page-wrap">
      <div className="spage-header">
        <div className="spage-title">
          <h2>Analytics & Intelligence Hub</h2>
          <span className="badge">AI Insights & Trends</span>
        </div>
        <div className="analytics-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={exportChartAsImage} className="btn-secondary" title="Download PNG of analytics charts">
            <Download size={15} /> Export PNG
          </button>
          <button onClick={handleShareSummary} className="btn-primary" title="Copy shareable summary report">
            <Share2 size={15} /> Share Summary
          </button>
        </div>
      </div>

      {/* Period Selector Strip */}
      <div className="analytics-period-bar glass">
        <span className="apb-label"><Calendar size={14} /> Compare Period:</span>
        <div className="apb-buttons">
          {[
            { id: 'month', label: 'This Month vs Last' },
            { id: 'quarter', label: 'This Quarter vs Last' },
            { id: 'year', label: 'Year over Year' },
            { id: 'all', label: 'All Time' }
          ].map(p => (
            <button
              key={p.id}
              className={`apb-btn ${periodFilter === p.id ? 'active' : ''}`}
              onClick={() => setPeriodFilter(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Period vs Period Comparison Cards */}
      <div className="analytics-comparison-grid">
        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Period Inflow</span>
            <span className={`sc-delta ${comparisonMetrics.incomeDelta >= 0 ? 'text-success' : 'text-danger'}`}>
              {comparisonMetrics.incomeDelta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(comparisonMetrics.incomeDelta).toFixed(1)}%
            </span>
          </div>
          <h3 className="sc-val text-success">+{fmt(comparisonMetrics.current.income)}</h3>
          <p className="sc-prev">Prev: {fmt(comparisonMetrics.previous.income)}</p>
        </motion.div>

        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Period Outflow</span>
            <span className={`sc-delta ${comparisonMetrics.expenseDelta <= 0 ? 'text-success' : 'text-danger'}`}>
              {comparisonMetrics.expenseDelta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(comparisonMetrics.expenseDelta).toFixed(1)}%
            </span>
          </div>
          <h3 className="sc-val text-danger">-{fmt(comparisonMetrics.current.expense)}</h3>
          <p className="sc-prev">Prev: {fmt(comparisonMetrics.previous.expense)}</p>
        </motion.div>

        <motion.div className="stat-card glass" whileHover={{ y: -3 }}>
          <div className="sc-header">
            <span className="sc-label">Net Position</span>
            <span className={`sc-delta ${comparisonMetrics.netDelta >= 0 ? 'text-success' : 'text-danger'}`}>
              {comparisonMetrics.netDelta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(comparisonMetrics.netDelta).toFixed(1)}%
            </span>
          </div>
          <h3 className={`sc-val ${comparisonMetrics.current.net >= 0 ? 'text-success' : 'text-danger'}`}>
            {comparisonMetrics.current.net >= 0 ? '+' : ''}{fmt(comparisonMetrics.current.net)}
          </h3>
          <p className="sc-prev">Prev: {fmt(comparisonMetrics.previous.net)}</p>
        </motion.div>
      </div>

      {/* AI Insights Strip */}
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

      {/* Anomaly Detection Banner / Table */}
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
            {activeAnomalies.slice(0, 3).map(a => (
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
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Main Charts Section for PNG Export */}
      <div ref={chartSectionRef} className="analytics-charts">
        {/* Monthly Overview Chart */}
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
                <BarChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                  <Legend />
                  <Bar dataKey="income" fill="#10b981" radius={[6, 6, 0, 0]} name="Inflow" />
                  <Bar dataKey="expense" fill="#ef4444" radius={[6, 6, 0, 0]} name="Outflow" />
                  <Bar dataKey="savings" fill="#059669" radius={[6, 6, 0, 0]} name="Net Savings" />
                </BarChart>
              ) : (
                <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                  <Legend />
                  <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} name="Inflow" />
                  <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4 }} name="Outflow" />
                  <Line type="monotone" dataKey="savings" stroke="#059669" strokeWidth={2.5} dot={{ r: 4 }} name="Net Savings" />
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty"><p>No monthly transaction records available.</p></div>
          )}
        </motion.div>

        {/* Category Spending Evolution Multi-Line Chart */}
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
              <LineChart data={categoryEvolution.data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                {categoryEvolution.categories.map((cat, idx) => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}
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

        {/* Day of Week Breakdown */}
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
              <Bar dataKey="expense" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Daily Expense" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Expense Distribution Pie */}
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
                >
                  {expenseCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
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
    </div>
  );
}
