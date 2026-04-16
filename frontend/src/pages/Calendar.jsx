import React, { useState, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Activity, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { AppContext } from '../App';
import TransactionForm from '../components/TransactionForm';

export default function Calendar() {
  const { transactions, addTransaction, fmt } = useContext(AppContext);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly', 'heatmap'

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

  // Build Transaction Map by Date: YYYY-MM-DD
  const txByDate = useMemo(() => {
    const map = {};
    transactions?.forEach(tx => {
      // Force extraction of YYYY-MM-DD from DB ISO strings to prevent browser timezone shifting
      const dStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0];
      const key = dStr;
      if (!map[key]) map[key] = { items: [], income: 0, expense: 0 };
      map[key].items.push(tx);
      if (tx.type === 'income') map[key].income += Number(tx.amount);
      if (tx.type === 'expense') map[key].expense += Number(tx.amount);
    });
    return map;
  }, [transactions]);

  // Max expense for Heatmap scaling
  const maxExpense = useMemo(() => {
    let max = 0;
    Object.values(txByDate).forEach(day => {
      if (day.expense > max) max = day.expense;
    });
    return max || 1; // avoid div by 0
  }, [txByDate]);

  const openDayDetails = (dateKey) => {
    setSelectedDate(dateKey);
  };

  const openAddForDate = (dateKey) => {
    setNewTxDate(dateKey);
    setIsAdding(true);
    setSelectedDate(null);
  };

  const currentMonthTransactions = useMemo(() => {
    return transactions?.filter(t => {
      const dStr = typeof t.date === 'string' ? t.date.split('T')[0] : new Date(t.date).toISOString().split('T')[0];
      // Note: splitting "YYYY-MM-DD" means string parts are exactly year and month
      const [y, m] = dStr.split('-');
      return parseInt(m, 10) === (currentDate.getMonth() + 1) && parseInt(y, 10) === currentDate.getFullYear();
    }) || [];
  }, [transactions, currentDate]);

  const monthlyIncome = currentMonthTransactions.filter(t => t.type === 'income').reduce((a, c) => a + Number(c.amount), 0);
  const monthlyExpense = currentMonthTransactions.filter(t => t.type === 'expense').reduce((a, c) => a + Number(c.amount), 0);
  const monthlyNet = monthlyIncome - monthlyExpense;

  // Render Grid
  const renderGrid = () => {
    if (!transactions) return <div style={{ padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>Loading calendar...</div>;
    if (daysInMonth === 0) return null;
    const calendarDays = [];
    for (let i = 0; i < firstDayOfMonth; i++) calendarDays.push(<div key={`empty-${i}`} className="cal-day empty" />);

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = txByDate[key];
      const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), d).toDateString();

      calendarDays.push(
        <div key={`day-${d}`} className={`cal-day ${isToday ? 'today' : ''}`} onClick={() => openDayDetails(key)}>
          <span className="cal-date-num">{d}</span>
          {dayData && (
            <div className="cal-day-summaries">
              {dayData.income > 0 && <div className="cal-sum-badge income">+{fmt(dayData.income)}</div>}
              {dayData.expense > 0 && <div className="cal-sum-badge expense">-{fmt(dayData.expense)}</div>}
            </div>
          )}
        </div>
      );
    }
    return calendarDays;
  };

  const renderHeatmap = () => {
    if (!transactions) return <div style={{ padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>Loading calendar...</div>;
    if (daysInMonth === 0) return null;
    const calendarDays = [];
    for (let i = 0; i < firstDayOfMonth; i++) calendarDays.push(<div key={`empty-${i}`} className="cal-day empty" />);

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = txByDate[key] || { expense: 0 };
      const heatLevel = Math.min(Math.ceil((dayData.expense / maxExpense) * 4), 4); // 0 to 4

      calendarDays.push(
        <div key={`day-${d}`} className={`cal-day heatmap-level-${heatLevel}`} onClick={() => openDayDetails(key)} title={dayData.expense > 0 ? `Expense: ${fmt(dayData.expense)}` : 'No expenses'}>
          <span className="cal-date-num">{d}</span>
        </div>
      );
    }
    return calendarDays;
  };

  return (
    <div className="calendar-page-content" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        .view-toggles {
          display: flex;
          background: var(--glass-2, rgba(0,0,0,0.05));
          border-radius: 8px;
          padding: 4px;
          border: 1px solid var(--glass-border);
        }
        .vt-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.9rem;
          cursor: pointer;
          transition: 0.2s;
        }
        .vt-btn.active {
          background: var(--color-primary, #10B981);
          color: white;
        }
        .cal-day-summaries {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: auto;
        }
        .cal-sum-badge {
          font-size: 0.75rem;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }
        .cal-sum-badge.income { background: rgba(16, 185, 129, 0.2); color: var(--success, #10b981); }
        .cal-sum-badge.expense { background: rgba(239, 68, 68, 0.2); color: var(--danger, #ef4444); }
        
        /* Heatmap levels */
        .heatmap-level-0 { background: rgba(239, 68, 68, 0.05); }
        .heatmap-level-1 { background: rgba(239, 68, 68, 0.25); border-color: rgba(239, 68, 68, 0.3); }
        .heatmap-level-2 { background: rgba(239, 68, 68, 0.50); border-color: rgba(239, 68, 68, 0.6); }
        .heatmap-level-3 { background: rgba(239, 68, 68, 0.75); border-color: rgba(239, 68, 68, 0.8); }
        .heatmap-level-3 .cal-date-num, .heatmap-level-4 .cal-date-num { color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
        .heatmap-level-4 { background: rgba(239, 68, 68, 1.00); border-color: rgba(239, 68, 68, 1); color: white; }
      `}</style>

      <div className="masonry-header">
        <div className="mh-titles">
          <h2>Calendar Hub</h2>
          <span className="mh-badge">{currentMonthTransactions.length} transactions this month</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="view-toggles glass">
            <button className={`vt-btn ${viewMode === 'monthly' ? 'active' : ''}`} onClick={() => setViewMode('monthly')}><CalendarIcon size={16} /> Monthly</button>
            <button className={`vt-btn ${viewMode === 'heatmap' ? 'active' : ''}`} onClick={() => setViewMode('heatmap')}><Activity size={16} /> Heatmap</button>
          </div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn-primary" onClick={() => openAddForDate(new Date().toISOString().split('T')[0])}>
            <Plus size={16} /> New Entry
          </motion.button>
        </div>
      </div>

      <div className="dashboard-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="glass stat-card" style={{ padding: '1.25rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p className="stat-lbl" style={{ color: 'var(--text-secondary, #666)', fontSize: '0.85rem', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly Income</p>
          <h3 className="stat-val" style={{ color: 'var(--color-success, #10B981)', margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>+{fmt(monthlyIncome)}</h3>
        </div>
        <div className="glass stat-card" style={{ padding: '1.25rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p className="stat-lbl" style={{ color: 'var(--text-secondary, #666)', fontSize: '0.85rem', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly Expense</p>
          <h3 className="stat-val" style={{ color: 'var(--color-danger, #EF4444)', margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>-{fmt(monthlyExpense)}</h3>
        </div>
        <div className="glass stat-card" style={{ padding: '1.25rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p className="stat-lbl" style={{ color: 'var(--text-secondary, #666)', fontSize: '0.85rem', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Net Savings</p>
          <h3 className="stat-val" style={{ color: 'var(--text-primary, #111)', margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{fmt(monthlyNet)}</h3>
        </div>
      </div>

      <div className="calendar-container glass">
        <div className="cal-header">
          <button className="ibtn" onClick={prevMonth}><ChevronLeft /></button>
          <h3 className="cal-month-title">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
          <button className="ibtn" onClick={nextMonth}><ChevronRight /></button>
        </div>
        <div className="cal-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="cal-weekday">{day}</div>)}
          {viewMode === 'heatmap' ? renderHeatmap() : renderGrid()}
        </div>
      </div>

      <AnimatePresence>
        {selectedDate && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedDate(null)}>
            <motion.div className="modal-box glass" initial={{ scale: 0.88, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 24 }} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3>Transactions for {selectedDate}</h3>
                <button className="ibtn" onClick={() => setSelectedDate(null)}>×</button>
              </div>

              <div className="day-transactions-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {(!txByDate[selectedDate] || txByDate[selectedDate].items.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                    <Wallet size={32} style={{ margin: '0 auto 10px' }} />
                    <p>No transactions on this day.</p>
                  </div>
                ) : (
                  txByDate[selectedDate].items.map(tx => (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem', borderBottom: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ padding: 8, borderRadius: 8, background: tx.type === 'income' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                          {tx.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, margin: 0 }}>{tx.category}</p>
                          <p style={{ fontSize: '0.8rem', opacity: 0.6, margin: 0 }}>{tx.note || 'No note'}</p>
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: '2rem', textAlign: 'right' }}>
                <button className="btn-primary" onClick={() => openAddForDate(selectedDate)}><Plus size={16} /> Add Entry</button>
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
