import React, { useState, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Activity, ArrowUpRight, ArrowDownRight, Wallet, Clock,
  CalendarDays, Zap, CheckCircle2, TrendingUp, TrendingDown
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import TransactionForm from '../components/TransactionForm';

export default function Calendar() {
  const { transactions = [], addTransaction, fmt } = useContext(AppContext);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly', 'weekly', 'heatmap'

  // Modals
  const [selectedDate, setSelectedDate] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTxDate, setNewTxDate] = useState('');

  // Derived Data
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const jumpToToday = () => setCurrentDate(new Date());

  // Build Transaction Map by Date: YYYY-MM-DD
  const txByDate = useMemo(() => {
    const map = {};
    transactions?.forEach(tx => {
      const dStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0];
      const key = dStr;
      if (!map[key]) map[key] = { items: [], income: 0, expense: 0, net: 0 };
      map[key].items.push(tx);
      if (tx.type === 'income') map[key].income += Number(tx.amount);
      if (tx.type === 'expense') map[key].expense += Number(tx.amount);
      map[key].net = map[key].income - map[key].expense;
    });
    return map;
  }, [transactions]);

  // Max expense for Heatmap scaling
  const maxExpense = useMemo(() => {
    let max = 0;
    Object.values(txByDate).forEach(day => {
      if (day.expense > max) max = day.expense;
    });
    return max || 1;
  }, [txByDate]);

  const openDayDetails = (dateKey) => {
    setSelectedDate(dateKey);
  };

  const openAddForDate = (dateKey, e) => {
    if (e) e.stopPropagation();
    setNewTxDate(dateKey);
    setIsAdding(true);
    setSelectedDate(null);
  };

  const currentMonthTransactions = useMemo(() => {
    return transactions?.filter(t => {
      const dStr = typeof t.date === 'string' ? t.date.split('T')[0] : new Date(t.date).toISOString().split('T')[0];
      const [y, m] = dStr.split('-');
      return parseInt(m, 10) === (currentDate.getMonth() + 1) && parseInt(y, 10) === currentDate.getFullYear();
    }) || [];
  }, [transactions, currentDate]);

  const monthlyIncome = currentMonthTransactions.filter(t => t.type === 'income').reduce((a, c) => a + Number(c.amount), 0);
  const monthlyExpense = currentMonthTransactions.filter(t => t.type === 'expense').reduce((a, c) => a + Number(c.amount), 0);
  const monthlyNet = monthlyIncome - monthlyExpense;

  // Selected Day summary data
  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    return txByDate[selectedDate] || { items: [], income: 0, expense: 0, net: 0 };
  }, [selectedDate, txByDate]);

  // Render Monthly Grid
  const renderMonthlyGrid = () => {
    if (!transactions) return <div style={{ padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>Loading calendar...</div>;
    if (daysInMonth === 0) return null;
    const calendarDays = [];
    for (let i = 0; i < firstDayOfMonth; i++) calendarDays.push(<div key={`empty-${i}`} className="cal-day empty" />);

    const todayStr = new Date().toISOString().split('T')[0];

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = txByDate[key];
      const isToday = key === todayStr;
      const hasNet = dayData && (dayData.income > 0 || dayData.expense > 0);

      calendarDays.push(
        <div
          key={`day-${d}`}
          className={`cal-day ${isToday ? 'today' : ''} ${hasNet ? (dayData.net >= 0 ? 'net-positive' : 'net-negative') : ''}`}
          onClick={() => openDayDetails(key)}
          role="button"
          tabIndex="0"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayDetails(key); } }}
        >
          <div className="cal-day-top-row">
            <span className="cal-date-num">{d}</span>
            <button
              className="cal-day-quick-add"
              onClick={(e) => openAddForDate(key, e)}
              title={`Add transaction for ${key}`}
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
                  {dayData.items.slice(0, 4).map((item, iIdx) => (
                    <span key={iIdx} className={`cal-dot ${item.type}`} />
                  ))}
                  {dayData.items.length > 4 && <span className="cal-dot-more">+{dayData.items.length - 4}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return calendarDays;
  };

  // Render Weekly Timeline View
  const renderWeeklyGrid = () => {
    const today = new Date(currentDate);
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);

    const weekDays = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + i);
      const key = dayDate.toISOString().split('T')[0];
      const dayData = txByDate[key] || { items: [], income: 0, expense: 0, net: 0 };
      const isToday = key === todayStr;

      weekDays.push(
        <div key={`week-${i}`} className={`cal-week-card glass ${isToday ? 'today' : ''}`}>
          <div className="cwc-header">
            <span className="cwc-day-name">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</span>
            <span className="cwc-day-num">{dayDate.getDate()}</span>
            <button
              className="cwc-add-btn"
              onClick={(e) => openAddForDate(key, e)}
              title="Add for this day"
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
              dayData.items.map(t => (
                <div key={t.id || t._id} className="cwc-item" onClick={() => openDayDetails(key)}>
                  <span className="cwc-item-cat">{t.category}</span>
                  <span className={`cwc-item-amt ${t.type}`}>{t.type === 'income' ? '+' : '-'}{fmt(t.amount)}</span>
                </div>
              ))
            ) : (
              <p className="cwc-empty">No entries</p>
            )}
          </div>
        </div>
      );
    }

    return <div className="cal-weekly-grid">{weekDays}</div>;
  };

  // Render Heatmap View
  const renderHeatmap = () => {
    if (!transactions) return <div style={{ padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>Loading calendar...</div>;
    if (daysInMonth === 0) return null;
    const calendarDays = [];
    for (let i = 0; i < firstDayOfMonth; i++) calendarDays.push(<div key={`empty-${i}`} className="cal-day empty" />);

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = txByDate[key] || { expense: 0 };
      const heatLevel = maxExpense === 0 ? 0 : Math.min(Math.ceil((dayData.expense / maxExpense) * 4), 4);

      calendarDays.push(
        <div
          key={`day-${d}`}
          className={`cal-day heatmap-level-${heatLevel}`}
          onClick={() => openDayDetails(key)}
          title={dayData.expense > 0 ? `Expense: ${fmt(dayData.expense)}` : 'No expenses'}
          role="button"
          tabIndex="0"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayDetails(key); } }}
        >
          <span className="cal-date-num">{d}</span>
        </div>
      );
    }
    return calendarDays;
  };

  return (
    <div className="calendar-page-content">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>Calendar Hub</h2>
          <span className="mh-badge">{currentMonthTransactions.length} transactions this month</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={jumpToToday} title="Jump to today">
            <Clock size={14} /> Today
          </button>
          <div className="view-toggles glass">
            <button className={`vt-btn ${viewMode === 'monthly' ? 'active' : ''}`} onClick={() => setViewMode('monthly')}>
              <CalendarIcon size={15} /> Month
            </button>
            <button className={`vt-btn ${viewMode === 'weekly' ? 'active' : ''}`} onClick={() => setViewMode('weekly')}>
              <CalendarDays size={15} /> Week
            </button>
            <button className={`vt-btn ${viewMode === 'heatmap' ? 'active' : ''}`} onClick={() => setViewMode('heatmap')}>
              <Activity size={15} /> Heatmap
            </button>
          </div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn-primary" onClick={() => openAddForDate(new Date().toISOString().split('T')[0])}>
            <Plus size={16} /> New Entry
          </motion.button>
        </div>
      </div>

      {/* Month Metrics Header Cards */}
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
          <h3 className="cal-month-title">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
          <button className="ibtn" onClick={nextMonth} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>

        {viewMode === 'weekly' ? (
          renderWeeklyGrid()
        ) : (
          <div className="cal-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="cal-weekday">{day}</div>
            ))}
            {viewMode === 'heatmap' ? renderHeatmap() : renderMonthlyGrid()}
          </div>
        )}
      </div>

      {/* Day Details Drilldown Modal */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedDate(null)}>
            <motion.div className="modal-box glass" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Transactions for {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedDayData?.items.length || 0} record(s)</span>
                </div>
                <button className="ibtn" onClick={() => setSelectedDate(null)}>✕</button>
              </div>

              {/* Day Summary Header */}
              {selectedDayData && selectedDayData.items.length > 0 && (
                <div className="day-breakdown-stats-strip glass">
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

              <div className="day-transactions-list" style={{ maxHeight: '360px', overflowY: 'auto', marginTop: 14 }}>
                {(!selectedDayData || selectedDayData.items.length === 0) ? (
                  <div className="glass empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <Wallet size={42} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
                    <h3 style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: '1rem' }}>No Transactions</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No transactions recorded on this day.</p>
                  </div>
                ) : (
                  selectedDayData.items.map((tx, idx) => (
                    <div key={tx.id || `dtx-${idx}`} className="day-tx-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className={`day-tx-badge ${tx.type}`}>
                          {tx.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, margin: '0 0 2px 0', fontSize: '0.9rem' }}>{tx.category}</p>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>{tx.note || 'No note'}</p>
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn-secondary" onClick={() => setSelectedDate(null)}>Close</button>
                <button className="btn-primary" onClick={() => openAddForDate(selectedDate)}><Plus size={16} /> Add For This Date</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isAdding && (
          <TransactionForm
            key="tx-form"
            initialData={{ date: newTxDate }}
            onClose={() => setIsAdding(false)}
            onSubmit={async (tx) => {
              await addTransaction(tx);
              setIsAdding(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
