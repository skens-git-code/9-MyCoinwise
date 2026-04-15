import React, { useContext, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppContext } from '../App';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';

// Constants
const PIE_COLORS = ['#059669', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#f97316', '#14b8a6'];
const DATE_FORMAT_OPTIONS = { month: 'short', year: '2-digit' };
const MAX_MONTHS_DISPLAY = 6;
const MAX_CATEGORIES_DISPLAY = 7;

// Utility functions
const validateTransaction = (t) => {
  if (!t || typeof t !== 'object') return false;
  if (!t.date || isNaN(new Date(t.date).getTime())) return false;
  if (!t.type || !['income', 'expense'].includes(t.type)) return false;
  // MySQL returns amount as a string — accept both string and number
  const amt = Number(t.amount);
  if (t.amount === undefined || t.amount === null || isNaN(amt) || amt < 0) return false;
  if (!t.category || typeof t.category !== 'string') return false;
  return true;
};

const safeParseAmount = (amount) => {
  const num = Number(amount);
  return isNaN(num) || num < 0 ? 0 : num;
};

const formatCurrency = (value, fmt) => {
  if (typeof fmt !== 'function') return `$${value.toFixed(2)}`;
  return fmt(value);
};

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, isDark, fmt }) => {
  if (!active || !payload || !payload.length) return null;
  
  return (
    <div className="custom-tooltip" style={{
      backgroundColor: isDark ? 'rgba(10,10,26,0.97)' : 'rgba(255,255,255,0.97)',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(5, 150, 105,0.2)'}`,
      borderRadius: '12px',
      padding: '12px 16px',
      color: isDark ? '#f8fafc' : '#0f172a',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
    }}>
      <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>{label}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ margin: '4px 0', color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value, fmt)}
        </p>
      ))}
    </div>
  );
};

// Main Component
export default function Analytics() {
  const { transactions, theme, fmt } = useContext(AppContext);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [chartType, setChartType] = useState('bar'); // 'bar', 'line'
  const [showComparative, setShowComparative] = useState(false);
  
  const isDark = theme === 'dark';
  
  // Memoized filtered transactions based on date range
  const filteredTransactions = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    
    let filtered = transactions.filter(validateTransaction);
    
    if (dateRange.start) {
      filtered = filtered.filter(t => new Date(t.date) >= dateRange.start);
    }
    if (dateRange.end) {
      filtered = filtered.filter(t => new Date(t.date) <= dateRange.end);
    }
    
    return filtered;
  }, [transactions, dateRange]);
  
  // Memoized summary calculations
  const summary = useMemo(() => {
    const totalIncome = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + safeParseAmount(t.amount), 0);
    
    const totalExpense = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + safeParseAmount(t.amount), 0);
    
    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100) : 0;
    const avgTransaction = filteredTransactions.length > 0 
      ? (totalIncome + totalExpense) / filteredTransactions.length 
      : 0;
    
    return {
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate: savingsRate.toFixed(1),
      avgTransaction,
      transactionCount: filteredTransactions.length
    };
  }, [filteredTransactions]);
  
  // Memoized monthly data
  const monthlyData = useMemo(() => {
    const monthMap = new Map();
    
    filteredTransactions.forEach(t => {
      const date = new Date(t.date);
      if (isNaN(date.getTime())) return;
      
      const key = date.toLocaleDateString('en-US', DATE_FORMAT_OPTIONS);
      const amount = safeParseAmount(t.amount);
      
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          name: key,
          income: 0,
          expense: 0,
          timestamp: date.getTime(),
          savings: 0
        });
      }
      
      const monthData = monthMap.get(key);
      if (t.type === 'income') {
        monthData.income += amount;
      } else {
        monthData.expense += amount;
      }
    });
    
    // Calculate savings and sort by date
    const data = Array.from(monthMap.values())
      .map(m => ({
        ...m,
        savings: parseFloat((m.income - m.expense).toFixed(2))
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_MONTHS_DISPLAY);
    
    return data;
  }, [filteredTransactions]);
  
  // Memoized expense categories
  const expenseCategories = useMemo(() => {
    const categoryMap = new Map();
    
    filteredTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const category = t.category || 'Uncategorized';
        const amount = safeParseAmount(t.amount);
        categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
      });
    
    const total = Array.from(categoryMap.values()).reduce((sum, val) => sum + val, 0);
    
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ 
        name: name.replace(/[<>]/g, ''), // Sanitize category names
        value: parseFloat(value.toFixed(2)),
        percentage: total > 0 ? ((value / total) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_CATEGORIES_DISPLAY);
  }, [filteredTransactions]);
  
  // Memoized income categories
  const incomeCategories = useMemo(() => {
    const categoryMap = new Map();
    
    filteredTransactions
      .filter(t => t.type === 'income')
      .forEach(t => {
        const category = t.category || 'Uncategorized';
        const amount = safeParseAmount(t.amount);
        categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
      });
    
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ 
        name: name.replace(/[<>]/g, ''),
        value: parseFloat(value.toFixed(2))
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_CATEGORIES_DISPLAY);
  }, [filteredTransactions]);
  
  // Memoized comparative data (month-over-month growth)
  const comparativeData = useMemo(() => {
    if (monthlyData.length < 2) return [];
    
    return monthlyData.map((month, index) => {
      if (index === 0) return { name: month.name, growth: 0 };
      
      const prevMonth = monthlyData[index - 1];
      const growth = prevMonth.savings !== 0 
        ? ((month.savings - prevMonth.savings) / Math.abs(prevMonth.savings)) * 100
        : month.savings > 0 ? 100 : 0;
      
      return {
        name: month.name,
        growth: parseFloat(growth.toFixed(1))
      };
    });
  }, [monthlyData]);
  
  // Summary tiles configuration
  const summaryTiles = useMemo(() => [
    { 
      label: 'Total Income', 
      value: formatCurrency(summary.totalIncome, fmt), 
      color: '#10b981',
      icon: '📈'
    },
    { 
      label: 'Total Expenses', 
      value: formatCurrency(summary.totalExpense, fmt), 
      color: '#ef4444',
      icon: '📉'
    },
    { 
      label: 'Net Savings', 
      value: formatCurrency(summary.netSavings, fmt), 
      color: summary.netSavings >= 0 ? '#059669' : '#dc2626',
      icon: '💰'
    },
    { 
      label: 'Savings Rate', 
      value: `${summary.savingsRate}%`, 
      color: '#8b5cf6',
      icon: '🎯'
    },
    { 
      label: 'Avg Transaction', 
      value: formatCurrency(summary.avgTransaction, fmt), 
      color: '#06b6d4',
      icon: '📊'
    },
    { 
      label: 'Transactions', 
      value: summary.transactionCount, 
      color: '#f59e0b',
      icon: '🔄'
    }
  ], [summary, fmt]);
  
  const topExpenseCategory = expenseCategories[0]?.name || 'N/A';
  const topIncomeCategory = incomeCategories[0]?.name || 'N/A';
  
  // Reset date range handler
  const resetDateRange = useCallback(() => {
    setDateRange({ start: null, end: null });
  }, []);
  
  // Export data handler
  const exportAnalytics = useCallback(() => {
    const exportData = {
      summary,
      monthlyData,
      expenseCategories,
      incomeCategories,
      comparativeData,
      exportDate: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `analytics_export_${new Date().toISOString().slice(0,19)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [summary, monthlyData, expenseCategories, incomeCategories, comparativeData]);
  
  // Loading state
  if (!transactions) {
    return (
      <div className="shared-page">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading analytics data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="shared-page">
      <div className="spage-header">
        <div className="spage-title">
          <h2>Analytics Dashboard</h2>
          <span className="badge">Financial Insights</span>
        </div>
        <div className="analytics-actions">
          <button onClick={exportAnalytics} className="export-btn">
            📥 Export Data
          </button>
          <button onClick={resetDateRange} className="reset-btn">
            Reset Filters
          </button>
        </div>
      </div>
      
      {/* Summary Tiles Grid */}
      <div className="analytics-summary-grid">
        {summaryTiles.map((tile, idx) => (
          <motion.div
            key={tile.label}
            className="summary-tile glass"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
          >
            <div className="tile-icon">{tile.icon}</div>
            <div className="tile-content">
              <p className="tile-value" style={{ color: tile.color }}>
                {tile.value}
              </p>
              <p className="tile-label">{tile.label}</p>
            </div>
          </motion.div>
        ))}
      </div>
      
      {/* Key Insights Bar */}
      <div className="key-insights">
        <div className="insight-item">
          <span className="insight-label">🏆 Top Expense:</span>
          <span className="insight-value">{topExpenseCategory}</span>
        </div>
        <div className="insight-item">
          <span className="insight-label">⭐ Top Income:</span>
          <span className="insight-value">{topIncomeCategory}</span>
        </div>
        <div className="insight-item">
          <span className="insight-label">📅 Period:</span>
          <span className="insight-value">
            {dateRange.start && dateRange.end 
              ? `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`
              : 'All Time'}
          </span>
        </div>
      </div>
      
      {/* Charts Section */}
      <div className="analytics-charts">
        {/* Monthly Overview Chart */}
        <motion.div 
          className="chart-card glass chart-card-large"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="chart-header">
            <h3>Monthly Financial Overview</h3>
            <div className="chart-controls">
              <button 
                onClick={() => setChartType('bar')}
                className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
              >
                Bar
              </button>
              <button 
                onClick={() => setChartType('line')}
                className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}
              >
                Line
              </button>
              <button 
                onClick={() => setShowComparative(!showComparative)}
                className={`chart-type-btn ${showComparative ? 'active' : ''}`}
              >
                {showComparative ? 'Hide Growth' : 'Show Growth'}
              </button>
            </div>
          </div>
          
          {monthlyData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={320}>
                {chartType === 'bar' ? (
                  <BarChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                    <Legend />
                    <Bar dataKey="income" fill="#10b981" radius={[6, 6, 0, 0]} name="Income" />
                    <Bar dataKey="expense" fill="#ef4444" radius={[6, 6, 0, 0]} name="Expense" />
                    <Bar dataKey="savings" fill="#059669" radius={[6, 6, 0, 0]} name="Savings" />
                  </BarChart>
                ) : (
                  <LineChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                    <Legend />
                    <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="savings" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
              
              {showComparative && comparativeData.length > 0 && (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={comparativeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                    <Line type="monotone" dataKey="growth" stroke="#8b5cf6" strokeWidth={2} name="Month-over-Month Growth (%)" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </>
          ) : (
            <div className="chart-empty">
              <p>📊 No transaction data available for the selected period.</p>
              <p className="chart-empty-hint">Add some transactions to see your financial analytics!</p>
            </div>
          )}
        </motion.div>
        
        {/* Expense Breakdown Pie Chart */}
        <motion.div 
          className="chart-card glass"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="chart-header">
            <h3>Expense Distribution</h3>
            <span className="chart-badge">By Category</span>
          </div>
          
          {expenseCategories.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expenseCategories}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {expenseCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-stats">
                <p>Total Expenses: {formatCurrency(summary.totalExpense, fmt)}</p>
                <p>Top Category: {expenseCategories[0]?.name} ({expenseCategories[0]?.percentage}%)</p>
              </div>
            </>
          ) : (
            <div className="chart-empty">
              <p>💸 No expense data available.</p>
            </div>
          )}
        </motion.div>
        
        {/* Income Breakdown Pie Chart */}
        <motion.div 
          className="chart-card glass"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="chart-header">
            <h3>Income Distribution</h3>
            <span className="chart-badge">By Source</span>
          </div>
          
          {incomeCategories.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={incomeCategories}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {incomeCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-stats">
                <p>Total Income: {formatCurrency(summary.totalIncome, fmt)}</p>
                <p>Top Source: {incomeCategories[0]?.name}</p>
              </div>
            </>
          ) : (
            <div className="chart-empty">
              <p>💰 No income data available.</p>
            </div>
          )}
        </motion.div>
        
        {/* Savings Trend Area Chart */}
        <motion.div 
          className="chart-card glass chart-card-fullwidth"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="chart-header">
            <h3>Savings Performance Trend</h3>
            <span className="chart-badge">Net Monthly Savings</span>
          </div>
          
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip isDark={isDark} fmt={fmt} />} />
                <Area
                  type="monotone"
                  dataKey="savings"
                  stroke="#059669"
                  fill="url(#savingsGradient)"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#059669', strokeWidth: 2 }}
                  activeDot={{ r: 7 }}
                  name="Net Savings"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">
              <p>📈 Add transactions across multiple months to see savings trends.</p>
            </div>
          )}
        </motion.div>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .analytics-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }
        
        .summary-tile {
          display: flex;
          align-items: center;
          padding: 1rem;
          background: var(--bg-secondary);
          border-radius: 16px;
          transition: all 0.3s ease;
          cursor: pointer;
        }
        
        .tile-icon {
          font-size: 2rem;
          margin-right: 1rem;
        }
        
        .tile-content {
          flex: 1;
        }
        
        .tile-value {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0;
          font-family: 'Space Grotesk', monospace;
        }
        
        .tile-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin: 0.25rem 0 0 0;
          font-weight: 500;
        }
        
        .key-insights {
          display: flex;
          gap: 2rem;
          padding: 1rem;
          background: var(--bg-secondary);
          border-radius: 12px;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }
        
        .insight-item {
          display: flex;
          gap: 0.5rem;
          align-items: baseline;
        }
        
        .insight-label {
          font-weight: 600;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
        
        .insight-value {
          font-weight: 700;
          color: var(--text-primary);
        }
        
        .analytics-actions {
          display: flex;
          gap: 1rem;
        }
        
        .export-btn, .reset-btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        
        .export-btn {
          background: var(--accent);
          color: white;
        }
        
        .reset-btn {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border);
        }
        
        .chart-card {
          background: var(--bg-secondary);
          border-radius: 20px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .chart-card-large {
          grid-column: 1 / -1;
        }
        
        .chart-card-fullwidth {
          grid-column: 1 / -1;
        }
        
        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }
        
        .chart-header h3 {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 600;
        }
        
        .chart-badge {
          font-size: 0.75rem;
          padding: 0.25rem 0.75rem;
          background: var(--bg-tertiary);
          border-radius: 20px;
          color: var(--text-secondary);
        }
        
        .chart-controls {
          display: flex;
          gap: 0.5rem;
        }
        
        .chart-type-btn {
          padding: 0.25rem 0.75rem;
          border: 1px solid var(--border);
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.75rem;
          transition: all 0.2s ease;
        }
        
        .chart-type-btn.active {
          background: var(--accent);
          color: white;
          border-color: var(--accent);
        }
        
        .chart-empty {
          text-align: center;
          padding: 3rem;
          color: var(--text-secondary);
        }
        
        .chart-empty-hint {
          font-size: 0.875rem;
          margin-top: 0.5rem;
        }
        
        .chart-stats {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
        }
        
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }
        
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @media (max-width: 768px) {
          .analytics-summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }
          
          .tile-value {
            font-size: 1.125rem;
          }
          
          .key-insights {
            gap: 1rem;
          }
          
          .chart-header {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}} />
    </div>
  );
}