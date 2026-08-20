import React, { useState, useContext, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Activity, ArrowUpRight, ArrowDownRight, Wallet, Clock,
  CalendarDays, Zap, CheckCircle2, TrendingUp, TrendingDown,
  Edit3, Trash2, Filter, Download, X
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import TransactionForm from '../components/TransactionForm';
import { useToast } from '../components/ToastProvider';

// ---------- Utility Functions ----------
const normalizeDateKey = (dateInput) => {
  if (!dateInput) return null;
  let date;
  if (typeof dateInput === 'string') {
    // If it's a full ISO string, take first 10 chars
    if (dateInput.includes('T')) return dateInput.split('T')[0];
    // If it's YYYY-MM-DD, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
    // Otherwise try parsing
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else if (typeof dateInput === 'number') {
    date = new Date(dateInput);
  } else {
    return null;
  }
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

const formatMonthYear = (year, month, locale = 'en-US') => {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
};

const getWeekDays = (locale = 'en-US') => {
  const base = new Date(2021, 0, 3); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d.toLocaleDateString(locale, { weekday: 'short' });
  });
};

// ---------- Main Component ----------
export default function Calendar() {
  const { transactions = [], addTransaction, updateTransaction, deleteTransaction, fmt: contextFmt } = useContext(AppContext);
  const { showToast } = useToast();
  const locale = navigator.language || 'en-US';

  // Fallback formatter
  const fmt = useCallback(
    (value) => {
      if (contextFmt) return contextFmt(value);
      if (value === undefined || value === null) return '$0.00';
      const num = Number(value);
      if (isNaN(num)) return '$0.00';
      return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(num);
    },
    [contextFmt, locale]
  );

  // ---------- State ----------
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly', 'weekly', 'heatmap'
  const [selectedDate, setSelectedDate] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [newTxDate, setNewTxDate] = useState('');
  const [heatmapMetric, setHeatmapMetric] = useState('expense'); // 'expense', 'income', 'net'
  const [dayFilterType, setDayFilterType] = useState('all'); // 'all', 'income', 'expense'

  // ---------- Derived Data ----------
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // Transaction map by date (YYYY-MM-DD)
  const txByDate = useMemo(() => {
    const map = {};
    transactions?.forEach(tx => {
      const key = normalizeDateKey(tx.date);
      if (!key) return;
      if (!map[key]) map[key] = { items: [], income: 0, expense: 0, net: 0 };
      map[key].items.push(tx);
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income') map[key].income += amt;
      else if (tx.type === 'expense') map[key].expense += amt;
      map[key].net = map[key].income - map[key].expense;
    });
    return map;
  }, [transactions]);

  // Max value for heatmap scaling (based on selected metric)
  const heatmapMax = useMemo(() => {
    let max = 0;
    Object.values(txByDate).forEach(day => {
      const val = day[heatmapMetric] || 0;
      if (val > max) max = val;
    });
    return max || 1;
  }, [txByDate, heatmapMetric]);

  // Transactions for current month
  const currentMonthTransactions = useMemo(() => {
    return transactions?.filter(t => {
      const key = normalizeDateKey(t.date);
      if (!key) return false;
      const [y, m] = key.split('-').map(Number);
      return y === year && m === month + 1;
    }) || [];
  }, [transactions, year, month]);

  const monthlyIncome = currentMonthTransactions.filter(t => t.type === 'income').reduce((a, c) => a + Number(c.amount), 0);
  const monthlyExpense = currentMonthTransactions.filter(t => t.type === 'expense').reduce((a, c) => a + Number(c.amount), 0);
  const monthlyNet = monthlyIncome - monthlyExpense;

  // Selected day data
  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    return txByDate[selectedDate] || { items: [], income: 0, expense: 0, net: 0 };
  }, [selectedDate, txByDate]);

  // Category breakdown for selected day
  const dayCategoryTotals = useMemo(() => {
    if (!selectedDayData) return {};
    const totals = {};
    selectedDayData.items.forEach(tx => {
      const cat = tx.category || 'Other';
      totals[cat] = (totals[cat] || 0) + Number(tx.amount);
    });
    return totals;
  }, [selectedDayData]);

  // Filtered items for day modal
  const filteredDayItems = useMemo(() => {
    if (!selectedDayData) return [];
    if (dayFilterType === 'all') return selectedDayData.items;
    return selectedDayData.items.filter(tx => tx.type === dayFilterType);
  }, [selectedDayData, dayFilterType]);

  // ---------- Handlers ----------
  const prevMonth = useCallback(() => {
    setCurrentDate(new Date(year, month - 1, 1));
  }, [year, month]);

  const nextMonth = useCallback(() => {
    setCurrentDate(new Date(year, month + 1, 1));
  }, [year, month]);

  const jumpToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const goToMonthYear = useCallback((targetYear, targetMonth) => {
    setCurrentDate(new Date(targetYear, targetMonth, 1));
  }, []);

  const openDayDetails = useCallback((dateKey) => {
    setSelectedDate(dateKey);
  }, []);

  const closeDayDetails = useCallback(() => {
    setSelectedDate(null);
    setDayFilterType('all');
  }, []);

  const openAddForDate = useCallback((dateKey, e) => {
    if (e) e.stopPropagation();
    setNewTxDate(dateKey);
    setIsAdding(true);
    setSelectedDate(null);
  }, []);

  const openEditForTransaction = useCallback((tx, e) => {
    e.stopPropagation();
    setEditingTx(tx);
    setIsEditing(true);
    setSelectedDate(null);
  }, []);

  const handleAddSubmit = useCallback(async (txData) => {
    try {
      await addTransaction(txData);
      showToast('success', 'Transaction added successfully.');
      setIsAdding(false);
    } catch (err) {
      showToast('error', err.message || 'Failed to add transaction.');
    }
  }, [addTransaction, showToast]);

  const handleEditSubmit = useCallback(async (txData) => {
    try {
      await updateTransaction(editingTx.id || editingTx._id, txData);
      showToast('success', 'Transaction updated.');
      setIsEditing(false);
      setEditingTx(null);
    } catch (err) {
      showToast('error', err.message || 'Failed to update transaction.');
    }
  }, [updateTransaction, editingTx, showToast]);

  const handleDeleteTransaction = useCallback(async (tx) => {
    if (!window.confirm(`Delete this ${tx.type} of ${fmt(tx.amount)}?`)) return;
    try {
      await deleteTransaction(tx.id || tx._id);
      showToast('success', 'Transaction deleted.');
      // Refresh the day view
      setSelectedDate(prev => prev); // trigger re-render
    } catch (err) {
      showToast('error', err.message || 'Failed to delete transaction.');
    }
  }, [deleteTransaction, fmt, showToast]);

  const exportMonthCSV = useCallback(() => {
    const headers = ['Date', 'Type', 'Category', 'Amount', 'Note'];
    const rows = currentMonthTransactions.map(tx => [
      normalizeDateKey(tx.date),
      tx.type,
      tx.category || 'Other',
      Number(tx.amount).toFixed(2),
      tx.note || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_${year}-${String(month+1).padStart(2,'0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'CSV exported successfully.');
  }, [currentMonthTransactions, year, month, showToast]);

  // ---------- Render Helpers ----------
  const renderMonthYearPicker = () => {
    const years = Array.from({ length: 21 }, (_, i) => year - 10 + i);
    const months = Array.from({ length: 12 }, (_, i) => i);
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <select
          value={year}
          onChange={(e) => goToMonthYear(Number(e.target.value), month)}
          aria-label="Select year"
          style={{ background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.25rem 0.5rem' }}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={month}
          onChange={(e) => goToMonthYear(year, Number(e.target.value))}
          aria-label="Select month"
          style={{ background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.25rem 0.5rem' }}
        >
          {months.map(m => (
            <option key={m} value={m}>
              {new Date(year, m, 1).toLocaleDateString(locale, { month: 'long' })}
            </option>
          ))}
        </select>
      </div>
    );
  };

  // Monthly grid
  const renderMonthlyGrid = useCallback(() => {
    const weekDays = getWeekDays(locale);
    const todayStr = normalizeDateKey(new Date());
    const cells = [];
    // Empty cells before first day
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<div key={`empty-${i}`} className="cal-day empty" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = txByDate[key];
      const isToday = key === todayStr;
      const hasData = dayData && (dayData.income > 0 || dayData.expense > 0);
      cells.push(
        <div
          key={`day-${d}`}
          className={`cal-day ${isToday ? 'today' : ''} ${hasData ? (dayData.net >= 0 ? 'net-positive' : 'net-negative') : ''}`}
          onClick={() => openDayDetails(key)}
          role="button"
          tabIndex="0"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayDetails(key); } }}
          title={hasData ? `Income: ${fmt(dayData.income)}\nExpense: ${fmt(dayData.expense)}` : 'No transactions'}
          aria-label={`${d} ${new Date(year, month, d).toLocaleDateString(locale, { month: 'long' })}, ${dayData ? 'has transactions' : 'no transactions'}`}
        >
          <div className="cal-day-top-row">
            <span className="cal-date-num">{d}</span>
            <button
              className="cal-day-quick-add"
              onClick={(e) => openAddForDate(key, e)}
              title="Add transaction for this day"
              aria-label="Add transaction"
            >
              <Plus size={12} />
            </button>
          </div>
          {dayData && (
            <div className="cal-day-summaries">
              {dayData.income > 0 && <div className="cal-sum-badge income">+{fmt(dayData.income)}</div>}
              {dayData.expense > 0 && <div className="cal-sum-badge expense">-{fmt(dayData.expense)}</div>}
              {dayData.items.length > 0 && (
                <div className="cal-dots-row">
                  {dayData.items.slice(0, 4).map((item, idx) => (
                    <span key={idx} className={`cal-dot ${item.type}`} title={`${item.category}: ${fmt(item.amount)}`} />
                  ))}
                  {dayData.items.length > 4 && <span className="cal-dot-more">+{dayData.items.length - 4}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return (
      <>
        {weekDays.map(day => <div key={day} className="cal-weekday">{day}</div>)}
        {cells}
      </>
    );
  }, [year, month, firstDayOfMonth, daysInMonth, txByDate, fmt, locale, openDayDetails, openAddForDate]);

  // Weekly view
  const renderWeeklyGrid = useCallback(() => {
    const today = new Date(year, month, 1);
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    const weekDays = getWeekDays(locale);
    const todayStr = normalizeDateKey(new Date());

    return (
      <div className="cal-weekly-grid">
        {Array.from({ length: 7 }, (_, i) => {
          const dayDate = new Date(startOfWeek);
          dayDate.setDate(startOfWeek.getDate() + i);
          const key = normalizeDateKey(dayDate);
          const dayData = txByDate[key] || { items: [], income: 0, expense: 0, net: 0 };
          const isToday = key === todayStr;
          return (
            <div key={`week-${i}`} className={`cal-week-card glass ${isToday ? 'today' : ''}`}>
              <div className="cwc-header">
                <span className="cwc-day-name">{weekDays[i]}</span>
                <span className="cwc-day-num">{dayDate.getDate()}</span>
                <button
                  className="cwc-add-btn"
                  onClick={(e) => openAddForDate(key, e)}
                  title="Add for this day"
                  aria-label="Add transaction"
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="cwc-totals">
                <div className="cwc-total-row text-success">
                  <span>Inflow</span>
                  <strong>+{fmt(dayData.income)}</strong>
                </div>
                <div className="cwc-total-row text-danger">
                  <span>Outflow</span>
                  <strong>-{fmt(dayData.expense)}</strong>
                </div>
                <div className={`cwc-total-row net ${dayData.net >= 0 ? 'text-success' : 'text-danger'}`}>
                  <span>Net</span>
                  <strong>{fmt(dayData.net)}</strong>
                </div>
              </div>
              <div className="cwc-items-list">
                {dayData.items.length > 0 ? (
                  dayData.items.map(tx => (
                    <div key={tx.id || tx._id} className="cwc-item" onClick={() => openDayDetails(key)}>
                      <span className="cwc-item-cat">{tx.category}</span>
                      <span className={`cwc-item-amt ${tx.type}`}>{tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="cwc-empty">No entries</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [year, month, txByDate, fmt, locale, openAddForDate, openDayDetails]);

  // Heatmap
  const renderHeatmap = useCallback(() => {
    const todayStr = normalizeDateKey(new Date());
    const cells = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<div key={`empty-${i}`} className="cal-day empty" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = txByDate[key] || { expense: 0, income: 0, net: 0 };
      const value = dayData[heatmapMetric] || 0;
      const level = heatmapMax === 0 ? 0 : Math.min(Math.ceil((value / heatmapMax) * 4), 4);
      const isToday = key === todayStr;
      cells.push(
        <div
          key={`day-${d}`}
          className={`cal-day heatmap-level-${level} ${isToday ? 'today' : ''}`}
          onClick={() => openDayDetails(key)}
          title={`${heatmapMetric}: ${fmt(value)}`}
          role="button"
          tabIndex="0"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayDetails(key); } }}
          aria-label={`${d} ${new Date(year, month, d).toLocaleDateString(locale, { month: 'long' })}, ${heatmapMetric}: ${fmt(value)}`}
        >
          <span className="cal-date-num">{d}</span>
        </div>
      );
    }
    return cells;
  }, [year, month, firstDayOfMonth, daysInMonth, txByDate, heatmapMetric, heatmapMax, fmt, locale, openDayDetails]);

  // ---------- Render ----------
  return (
    <div className="calendar-page-content">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>Calendar Hub</h2>
          <span className="mh-badge">{currentMonthTransactions.length} transactions this month</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={jumpToToday} title="Jump to today" aria-label="Go to today">
            <Clock size={14} /> Today
          </button>
          {renderMonthYearPicker()}
          <div className="view-toggles glass">
            <button className={`vt-btn ${viewMode === 'monthly' ? 'active' : ''}`} onClick={() => setViewMode('monthly')} aria-label="Monthly view">
              <CalendarIcon size={15} /> Month
            </button>
            <button className={`vt-btn ${viewMode === 'weekly' ? 'active' : ''}`} onClick={() => setViewMode('weekly')} aria-label="Weekly view">
              <CalendarDays size={15} /> Week
            </button>
            <button className={`vt-btn ${viewMode === 'heatmap' ? 'active' : ''}`} onClick={() => setViewMode('heatmap')} aria-label="Heatmap view">
              <Activity size={15} /> Heatmap
            </button>
          </div>
          {viewMode === 'heatmap' && (
            <div className="heatmap-toggle" style={{ display: 'flex', gap: '4px', alignItems: 'center', background: 'var(--bg-color)', padding: '2px 6px', borderRadius: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Metric:</span>
              {['expense', 'income', 'net'].map(metric => (
                <button
                  key={metric}
                  className={`btn-sm ${heatmapMetric === metric ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setHeatmapMetric(metric)}
                  style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                >
                  {metric.charAt(0).toUpperCase() + metric.slice(1)}
                </button>
              ))}
            </div>
          )}
          <button className="btn-secondary" onClick={exportMonthCSV} aria-label="Export month data as CSV">
            <Download size={14} /> CSV
          </button>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn-primary" onClick={() => openAddForDate(normalizeDateKey(new Date()))}>
            <Plus size={16} /> New Entry
          </motion.button>
        </div>
      </div>

      {/* Month Metrics */}
      <div className="dashboard-row calendar-stats-row">
        <div className="glass stat-card cal-metric-card">
          <p className="stat-lbl">Monthly Inflow</p>
          <h3 className="stat-val text-success">+{fmt(monthlyIncome)}</h3>
        </div>
        <div className="glass stat-card cal-metric-card">
          <p className="stat-lbl">Monthly Outflow</p>
          <h3 className="stat-val text-danger">-{fmt(monthlyExpense)}</h3>
        </div>
        <div className="glass stat-card cal-metric-card">
          <p className="stat-lbl">Net Position</p>
          <h3 className={`stat-val ${monthlyNet >= 0 ? 'text-success' : 'text-danger'}`}>
            {monthlyNet >= 0 ? '+' : ''}{fmt(monthlyNet)}
          </h3>
        </div>
      </div>

      <div className="calendar-container glass">
        <div className="cal-header">
          <button className="ibtn" onClick={prevMonth} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <h3 className="cal-month-title">{formatMonthYear(year, month, locale)}</h3>
          <button className="ibtn" onClick={nextMonth} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>

        {viewMode === 'weekly' ? (
          renderWeeklyGrid()
        ) : (
          <div className="cal-grid">
            {viewMode === 'heatmap' ? renderHeatmap() : renderMonthlyGrid()}
          </div>
        )}
      </div>

      {/* Modals Portal */}
      {createPortal(
        <AnimatePresence mode="wait">
          {/* Day Details Modal */}
          {selectedDate && selectedDayData && (
            <motion.div
              key="day-modal"
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDayDetails}
            >
              <motion.div
                className="modal-box glass"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '680px', maxHeight: '80vh', overflowY: 'auto' }}
                role="dialog"
                aria-label="Day details"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                      {new Date(selectedDate).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedDayData.items.length} record(s)</span>
                  </div>
                  <button className="ibtn" onClick={closeDayDetails} aria-label="Close modal">✕</button>
                </div>

                {/* Day summary */}
                {selectedDayData.items.length > 0 && (
                  <div className="day-breakdown-stats-strip glass" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0.75rem' }}>
                    <div className="db-stat">
                      <span className="db-lbl">Inflow</span>
                      <span className="db-val text-success">+{fmt(selectedDayData.income)}</span>
                    </div>
                    <div className="db-stat">
                      <span className="db-lbl">Outflow</span>
                      <span className="db-val text-danger">-{fmt(selectedDayData.expense)}</span>
                    </div>
                    <div className="db-stat">
                      <span className="db-lbl">Net</span>
                      <span className={`db-val ${selectedDayData.net >= 0 ? 'text-success' : 'text-danger'}`}>
                        {fmt(selectedDayData.net)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Category breakdown */}
                {selectedDayData.items.length > 0 && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {Object.entries(dayCategoryTotals).map(([cat, total]) => (
                      <span key={cat} className="badge" style={{ background: 'var(--bg-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>
                        {cat}: {fmt(total)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Filter */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
                  <Filter size={14} />
                  <button className={`btn-sm ${dayFilterType === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDayFilterType('all')}>All</button>
                  <button className={`btn-sm ${dayFilterType === 'income' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDayFilterType('income')}>Income</button>
                  <button className={`btn-sm ${dayFilterType === 'expense' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDayFilterType('expense')}>Expense</button>
                </div>

                <div className="day-transactions-list" style={{ maxHeight: '320px', overflowY: 'auto', marginTop: 14 }}>
                  {filteredDayItems.length === 0 ? (
                    <div className="glass empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <Wallet size={42} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
                      <h3 style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: '1rem' }}>No Transactions</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No transactions match the current filter.</p>
                    </div>
                  ) : (
                    filteredDayItems.map((tx, idx) => (
                      <div key={tx.id || `dtx-${idx}`} className="day-tx-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                          <div className={`day-tx-badge ${tx.type}`}>
                            {tx.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>{tx.category}</p>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>{tx.note || 'No note'}</p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                            {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                          </span>
                          <button
                            onClick={(e) => openEditForTransaction(tx, e)}
                            className="ibtn"
                            aria-label="Edit transaction"
                            style={{ padding: '2px' }}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteTransaction(tx)}
                            className="ibtn"
                            aria-label="Delete transaction"
                            style={{ padding: '2px', color: 'var(--danger)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn-secondary" onClick={closeDayDetails}>Close</button>
                  <button className="btn-primary" onClick={() => openAddForDate(selectedDate)}><Plus size={16} /> Add For This Date</button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Add Transaction Modal */}
          {isAdding && (
            <TransactionForm
              key="add-modal"
              isOpen={true}
              initialData={{ date: newTxDate }}
              onClose={() => { setIsAdding(false); setNewTxDate(''); }}
              onSubmit={handleAddSubmit}
            />
          )}

          {/* Edit Transaction Modal */}
          {isEditing && editingTx && (
            <TransactionForm
              key="edit-modal"
              isOpen={true}
              initialData={editingTx}
              onClose={() => { setIsEditing(false); setEditingTx(null); }}
              onSubmit={handleEditSubmit}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}