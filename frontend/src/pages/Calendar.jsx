import React, {
  useState, useContext, useMemo, useCallback, useEffect, useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Activity, ArrowUpRight, ArrowDownRight, Wallet, Clock,
  CalendarDays, AlertTriangle, Edit3, Trash2, Filter, Download, X,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import TransactionForm from '../components/TransactionForm';
import { useToast } from '../components/ToastProvider';

/* ============================================================
 * Constants
 * ============================================================ */
const LOCALE_MAP = {
  en: 'en-US', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN',
};
const resolveLocale = (lang) =>
  LOCALE_MAP[lang] || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

/* ============================================================
 * Date helpers (UTC-safe)
 * ============================================================ */
const pad2 = (n) => String(n).padStart(2, '0');

const normalizeDateKey = (dateInput) => {
  if (!dateInput) return null;
  if (typeof dateInput === 'string') {
    const m = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const parseKeyLocal = (key) => {
  if (!key) return null;
  const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatMonthYear = (year, month, locale) =>
  new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

const formatMonthLong = (year, month, locale) =>
  new Date(year, month, 1).toLocaleDateString(locale, { month: 'long' });

const formatFullDate = (key, locale) => {
  const d = parseKeyLocal(key);
  if (!d) return '';
  return d.toLocaleDateString(locale, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
};

const formatShortDay = (d, locale) =>
  d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

const formatDayWithYear = (d, locale) =>
  d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

const getWeekDays = (locale) => {
  const base = new Date(2021, 0, 3);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d.toLocaleDateString(locale, { weekday: 'short' });
  });
};

const escapeCsvField = (raw) => {
  const str = raw == null ? '' : String(raw);
  const needsPrefix = /^[=+\-@\t\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  const prefixed = needsPrefix ? `'${escaped}` : escaped;
  const needsQuotes = needsPrefix || /[",\n\r\t]/.test(prefixed);
  return needsQuotes ? `"${prefixed}"` : quoted(prefixed);
};
// Small helper to avoid duplicating the quote logic in the ternary above.
const quoted = (s) => `"${s}"`;

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** True only if the transaction is a live (non-deleted) record. */
const isLiveTransaction = (tx) =>
  tx && typeof tx === 'object' && tx.is_deleted !== true;

/* ============================================================
 * Focus trap for modals
 * ============================================================ */
function useFocusTrap(ref, isActive) {
  useEffect(() => {
    if (!isActive || !ref.current) return undefined;
    const node = ref.current;
    const previousActive = document.activeElement;

    const getFocusable = () => {
      const selector =
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(node.querySelectorAll(selector)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
    };

    const focusables = getFocusable();
    if (focusables.length > 0) focusables[0].focus();

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const list = getFocusable();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;

      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !node.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousActive && previousActive.focus) {
        try { previousActive.focus(); } catch { /* ignore */ }
      }
    };
  }, [ref, isActive]);
}

/* ============================================================
 * Component
 * ============================================================ */
export default function Calendar() {
  const {
    transactions = [],
    addTransaction,
    updateTransaction,
    deleteTransaction,
    fmt: contextFmt,
    t,
    lang = 'en',
    loading,
  } = useContext(AppContext);
  const { showToast } = useToast();

  const locale = useMemo(() => resolveLocale(lang), [lang]);
  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  const fmt = useCallback(
    (value) => {
      if (contextFmt) {
        try {
          const out = contextFmt(value);
          if (out != null) return out;
        } catch { /* fall through */ }
      }
      const num = Number(value);
      const safe = Number.isFinite(num) ? num : 0;
      return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(safe);
    },
    [contextFmt, locale]
  );

  /* ---------------- State ---------------- */
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('monthly');
  const [selectedDate, setSelectedDate] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [newTxDate, setNewTxDate] = useState('');
  const [heatmapMetric, setHeatmapMetric] = useState('expense');
  const [dayFilterType, setDayFilterType] = useState('all');
  const [pendingDelete, setPendingDelete] = useState(null);

  const dayModalRef = useRef(null);
  const deleteModalRef = useRef(null);

  /* ---------------- Derived calendar bounds ---------------- */
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  /* ---------------- Transaction index (soft-delete aware) ---------------- */
  const liveTransactions = useMemo(() => {
    const list = Array.isArray(transactions) ? transactions : [];
    return list.filter(isLiveTransaction);
  }, [transactions]);

  const txByDate = useMemo(() => {
    const map = Object.create(null);
    for (const tx of liveTransactions) {
      const key = normalizeDateKey(tx.date);
      if (!key) continue;
      if (!map[key]) map[key] = { items: [], income: 0, expense: 0, net: 0 };
      map[key].items.push(tx);
      const amt = toNumber(tx.amount);
      if (tx.type === 'income') map[key].income += amt;
      else if (tx.type === 'expense') map[key].expense += amt;
      map[key].net = map[key].income - map[key].expense;
    }
    return map;
  }, [liveTransactions]);

  /* ---------------- Heatmap scaling ---------------- */
  const heatmapStats = useMemo(() => {
    let max = 0;
    let min = 0;
    for (const key in txByDate) {
      const val = toNumber(txByDate[key][heatmapMetric]);
      if (val > max) max = val;
      if (val < min) min = val;
    }
    const maxAbs = Math.max(Math.abs(max), Math.abs(min), 1);
    return { max, min, maxAbs };
  }, [txByDate, heatmapMetric]);

  /* ---------------- Current-month transactions ---------------- */
  const currentMonthTransactions = useMemo(() => {
    return liveTransactions.filter((t) => {
      const key = normalizeDateKey(t.date);
      if (!key) return false;
      const [y, m] = key.split('-').map(Number);
      return y === year && m === month + 1;
    });
  }, [liveTransactions, year, month]);

  const monthlyIncome = useMemo(
    () => currentMonthTransactions
      .filter((t) => t.type === 'income')
      .reduce((a, c) => a + toNumber(c.amount), 0),
    [currentMonthTransactions]
  );
  const monthlyExpense = useMemo(
    () => currentMonthTransactions
      .filter((t) => t.type === 'expense')
      .reduce((a, c) => a + toNumber(c.amount), 0),
    [currentMonthTransactions]
  );
  const monthlyNet = monthlyIncome - monthlyExpense;

  /* ---------------- Selected day ---------------- */
  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    return txByDate[selectedDate] || { items: [], income: 0, expense: 0, net: 0 };
  }, [selectedDate, txByDate]);

  const dayCategoryTotals = useMemo(() => {
    if (!selectedDayData) return [];
    const acc = new Map();
    for (const tx of selectedDayData.items) {
      const cat = tx.category || 'Other';
      if (!acc.has(cat)) acc.set(cat, { category: cat, income: 0, expense: 0 });
      const bucket = acc.get(cat);
      const amt = toNumber(tx.amount);
      if (tx.type === 'income') bucket.income += amt;
      else if (tx.type === 'expense') bucket.expense += amt;
    }
    return Array.from(acc.values()).sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }, [selectedDayData]);

  const filteredDayItems = useMemo(() => {
    if (!selectedDayData) return [];
    if (dayFilterType === 'all') return selectedDayData.items;
    return selectedDayData.items.filter((tx) => tx.type === dayFilterType);
  }, [selectedDayData, dayFilterType]);

  /* ============================================================
   * Navigation
   * ============================================================ */

  const prevPeriod = useCallback(() => {
    if (viewMode === 'weekly') {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() - 7);
        return next;
      });
    } else {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  }, [viewMode, year, month]);

  const nextPeriod = useCallback(() => {
    if (viewMode === 'weekly') {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 7);
        return next;
      });
    } else {
      setCurrentDate(new Date(year, month + 1, 1));
    }
  }, [viewMode, year, month]);

  const jumpToToday = useCallback(() => setCurrentDate(new Date()), []);

  const goToMonthYear = useCallback((targetYear, targetMonth) => {
    setCurrentDate(new Date(targetYear, targetMonth, 1));
  }, []);

  /* ============================================================
   * Modal handlers
   * ============================================================ */

  const openDayDetails = useCallback((dateKey) => {
    setSelectedDate(dateKey);
    setDayFilterType('all');
  }, []);

  const closeDayDetails = useCallback(() => {
    setSelectedDate(null);
    setDayFilterType('all');
  }, []);

  const openAddForDate = useCallback((dateKey, e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    setNewTxDate(dateKey);
    setIsAdding(true);
    setSelectedDate(null);
  }, []);

  const openEditForTransaction = useCallback((tx, e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    setEditingTx(tx);
    setIsEditing(true);
    setSelectedDate(null);
  }, []);

  const closeAdd = useCallback(() => {
    setIsAdding(false);
    setNewTxDate('');
  }, []);

  const closeEdit = useCallback(() => {
    setIsEditing(false);
    setEditingTx(null);
  }, []);

  /* Memoize the initial data objects so TransactionForm doesn't re-render unnecessarily. */
  const addInitialData = useMemo(() => ({ date: newTxDate }), [newTxDate]);

  /* ============================================================
   * CRUD
   * ============================================================ */

  const handleAddSubmit = useCallback(async (txData) => {
    try {
      await addTransaction(txData);
      showToast('success', tr('tx_added', 'Transaction added successfully.'));
      closeAdd();
    } catch (err) {
      showToast('error', err?.message || tr('tx_add_failed', 'Failed to add transaction.'));
    }
  }, [addTransaction, showToast, closeAdd, tr]);

  const handleEditSubmit = useCallback(async (txData) => {
    if (!editingTx) return;
    const id = editingTx.id || editingTx._id;
    if (!id) {
      showToast('error', tr('tx_invalid', 'Invalid transaction.'));
      closeEdit();
      return;
    }
    try {
      await updateTransaction(id, txData);
      showToast('success', tr('tx_updated', 'Transaction updated.'));
      closeEdit();
    } catch (err) {
      showToast('error', err?.message || tr('tx_update_failed', 'Failed to update transaction.'));
    }
  }, [updateTransaction, editingTx, showToast, closeEdit, tr]);

  const requestDelete = useCallback((tx) => setPendingDelete(tx), []);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id || pendingDelete._id;
    if (!id) {
      showToast('error', tr('tx_invalid', 'Invalid transaction.'));
      setPendingDelete(null);
      return;
    }
    try {
      await deleteTransaction(id);
      showToast('success', tr('tx_deleted', 'Transaction deleted.'));
      setPendingDelete(null);
    } catch (err) {
      showToast('error', err?.message || tr('tx_delete_failed', 'Failed to delete transaction.'));
    }
  }, [pendingDelete, deleteTransaction, showToast, tr]);

  /* ============================================================
   * CSV export
   * ============================================================ */

  const exportMonthCSV = useCallback(() => {
    const headers = ['Date', 'Type', 'Category', 'Amount', 'Note'];
    const rows = currentMonthTransactions.map((tx) => [
      normalizeDateKey(tx.date),
      tx.type,
      tx.category || 'Other',
      toNumber(tx.amount).toFixed(2),
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
    link.download = `transactions_${year}-${pad2(month + 1)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', tr('csv_exported', 'CSV exported successfully.'));
  }, [currentMonthTransactions, year, month, showToast, tr]);

  /* ============================================================
   * Escape closes whichever modal is on top
   * ============================================================ */
  useEffect(() => {
    if (!selectedDate && !pendingDelete) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (pendingDelete) {
        cancelDelete();
      } else if (selectedDate) {
        closeDayDetails();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedDate, pendingDelete, closeDayDetails, cancelDelete]);

  /* ---------------- Focus traps ---------------- */
  useFocusTrap(dayModalRef, Boolean(selectedDate));
  useFocusTrap(deleteModalRef, Boolean(pendingDelete));

  /* ============================================================
   * Render helpers
   * ============================================================ */

  const renderMonthYearPicker = () => {
    const years = Array.from({ length: 21 }, (_, i) => year - 10 + i);
    const months = Array.from({ length: 12 }, (_, i) => i);
    return (
      <div className="cal-picker-group">
        <select
          value={year}
          onChange={(e) => goToMonthYear(Number(e.target.value), month)}
          aria-label={tr('select_year', 'Select year')}
          className="cal-select"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={month}
          onChange={(e) => goToMonthYear(year, Number(e.target.value))}
          aria-label={tr('select_month', 'Select month')}
          className="cal-select"
        >
          {months.map((m) => (
            <option key={m} value={m}>{formatMonthLong(year, m, locale)}</option>
          ))}
        </select>
      </div>
    );
  };

  /* ---------------- Monthly grid ---------------- */
  const renderMonthlyGrid = () => {
    const weekDays = getWeekDays(locale);
    const todayStr = normalizeDateKey(new Date());
    const cells = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<div key={`empty-${i}`} className="cal-day empty" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dayData = txByDate[key];
      const isToday = key === todayStr;
      const hasData = Boolean(dayData && (dayData.income > 0 || dayData.expense > 0));
      const netClass = hasData ? (dayData.net >= 0 ? 'net-positive' : 'net-negative') : '';

      cells.push(
        <div
          key={`day-${d}`}
          className={`cal-day ${isToday ? 'today' : ''} ${netClass}`}
          onClick={() => openDayDetails(key)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDayDetails(key);
            }
          }}
          title={hasData ? `+${fmt(dayData.income)} / -${fmt(dayData.expense)}` : ''}
          aria-label={`${d} ${formatMonthLong(year, month, locale)}${hasData ? ', has transactions' : ', no transactions'}`}
        >
          <div className="cal-day-top-row">
            <span className="cal-date-num">{d}</span>
            <button
              type="button"
              className="cal-day-quick-add"
              onClick={(e) => openAddForDate(key, e)}
              title={tr('add_transaction', 'Add transaction for this day')}
              aria-label={tr('add_transaction', 'Add transaction')}
            >
              <Plus size={12} />
            </button>
          </div>
          {dayData && (
            <div className="cal-day-summaries">
              {dayData.income > 0 && (
                <div className="cal-sum-badge income">+{fmt(dayData.income)}</div>
              )}
              {dayData.expense > 0 && (
                <div className="cal-sum-badge expense">-{fmt(dayData.expense)}</div>
              )}
              {dayData.items.length > 0 && (
                <div className="cal-dots-row">
                  {dayData.items.slice(0, 4).map((item, idx) => (
                    <span
                      key={item.id || item._id || idx}
                      className={`cal-dot ${item.type}`}
                      title={`${item.category || ''}: ${fmt(item.amount)}`}
                    />
                  ))}
                  {dayData.items.length > 4 && (
                    <span className="cal-dot-more" title={`${dayData.items.length - 4} more`}>
                      +{dayData.items.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <>
        {weekDays.map((day) => <div key={day} className="cal-weekday">{day}</div>)}
        {cells}
      </>
    );
  };

  /* ---------------- Weekly grid ---------------- */
  const renderWeeklyGrid = () => {
    const ref = new Date(currentDate);
    ref.setHours(0, 0, 0, 0);
    const dayOfWeek = ref.getDay();
    const startOfWeek = new Date(ref);
    startOfWeek.setDate(ref.getDate() - dayOfWeek);

    const weekDays = getWeekDays(locale);
    const todayStr = normalizeDateKey(new Date());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const spansYears = startOfWeek.getFullYear() !== endOfWeek.getFullYear();
    const rangeLabel = spansYears
      ? `${formatDayWithYear(startOfWeek, locale)} – ${formatDayWithYear(endOfWeek, locale)}`
      : `${formatShortDay(startOfWeek, locale)} – ${formatShortDay(endOfWeek, locale)}, ${endOfWeek.getFullYear()}`;

    return (
      <>
        <div
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
            textAlign: 'center',
          }}
        >
          {rangeLabel}
        </div>
        <div className="cal-weekly-grid">
          {Array.from({ length: 7 }, (_, i) => {
            const dayDate = new Date(startOfWeek);
            dayDate.setDate(startOfWeek.getDate() + i);
            const key = normalizeDateKey(dayDate);
            const dayData = txByDate[key] || { items: [], income: 0, expense: 0, net: 0 };
            const isToday = key === todayStr;
            return (
              <div key={key} className={`cal-week-card glass ${isToday ? 'today' : ''}`}>
                <div className="cwc-header">
                  <span className="cwc-day-name">{weekDays[i]}</span>
                  <span className="cwc-day-num">{dayDate.getDate()}</span>
                  <button
                    type="button"
                    className="cwc-add-btn"
                    onClick={(e) => openAddForDate(key, e)}
                    title={tr('add_transaction', 'Add for this day')}
                    aria-label={tr('add_transaction', 'Add transaction')}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="cwc-totals">
                  <div className="cwc-total-row text-success">
                    <span>{tr('inflow', 'Inflow')}</span>
                    <strong>+{fmt(dayData.income)}</strong>
                  </div>
                  <div className="cwc-total-row text-danger">
                    <span>{tr('outflow', 'Outflow')}</span>
                    <strong>-{fmt(dayData.expense)}</strong>
                  </div>
                  <div className={`cwc-total-row net ${dayData.net >= 0 ? 'text-success' : 'text-danger'}`}>
                    <span>{tr('net', 'Net')}</span>
                    <strong>{fmt(dayData.net)}</strong>
                  </div>
                </div>
                <div className="cwc-items-list">
                  {dayData.items.length > 0 ? (
                    dayData.items.map((tx, idx) => (
                      <div
                        key={tx.id || tx._id || idx}
                        className="cwc-item"
                        onClick={() => openDayDetails(key)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDayDetails(key);
                          }
                        }}
                      >
                        <span className="cwc-item-cat">
                          {tx.category || tr('uncategorized', 'Uncategorized')}
                        </span>
                        <span className={`cwc-item-amt ${tx.type}`}>
                          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="cwc-empty">{tr('no_entries', 'No entries')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  /* ---------------- Heatmap ---------------- */
  const renderHeatmap = () => {
    const todayStr = normalizeDateKey(new Date());
    const cells = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<div key={`empty-${i}`} className="cal-day empty" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dayData = txByDate[key] || { expense: 0, income: 0, net: 0 };
      const raw = toNumber(dayData[heatmapMetric]);
      const scaled = Math.abs(raw);
      const level = heatmapStats.maxAbs === 0
        ? 0
        : Math.min(Math.ceil((scaled / heatmapStats.maxAbs) * 4), 4);
      const isNegative = raw < 0;
      const isToday = key === todayStr;

      cells.push(
        <div
          key={`day-${d}`}
          className={`cal-day heatmap-level-${level} ${isToday ? 'today' : ''} ${isNegative ? 'heatmap-negative' : ''}`}
          onClick={() => openDayDetails(key)}
          title={`${heatmapMetric}: ${fmt(raw)}`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDayDetails(key);
            }
          }}
          aria-label={`${d} ${formatMonthLong(year, month, locale)}, ${heatmapMetric}: ${fmt(raw)}`}
        >
          <span className="cal-date-num">{d}</span>
        </div>
      );
    }
    return cells;
  };

  /* ============================================================
   * Loading
   * ============================================================ */
  if (loading && liveTransactions.length === 0) {
    return (
      <div className="calendar-page-content">
        <div className="masonry-header">
          <div className="mh-titles">
            <h2>{tr('calendar_hub', 'Calendar Hub')}</h2>
          </div>
        </div>
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Clock size={40} style={{ opacity: 0.5, marginBottom: '1rem' }} />
          <p style={{ color: 'var(--text-muted)' }}>{tr('loading_calendar', 'Loading calendar…')}</p>
        </div>
      </div>
    );
  }

  /* ============================================================
   * Render
   * ============================================================ */
  return (
    <div className="calendar-page-content">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{tr('calendar_hub', 'Calendar Hub')}</h2>
          <span className="mh-badge">
            {currentMonthTransactions.length} {tr('transactions_this_month', 'transactions this month')}
          </span>
        </div>
        <div className="cal-header-controls">
          <button
            type="button"
            className="btn-secondary cal-today-btn"
            onClick={jumpToToday}
            title={tr('jump_today', 'Jump to today')}
            aria-label={tr('today', 'Today')}
          >
            <Clock size={15} /> {tr('today', 'Today')}
          </button>
          {renderMonthYearPicker()}

          <div className="view-toggles glass">
            {[
              { id: 'monthly', label: tr('month', 'Month'), Icon: CalendarIcon },
              { id: 'weekly', label: tr('week', 'Week'), Icon: CalendarDays },
              { id: 'heatmap', label: tr('heatmap', 'Heatmap'), Icon: Activity },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`vt-btn ${viewMode === tab.id ? 'active' : ''}`}
                onClick={() => setViewMode(tab.id)}
                aria-pressed={viewMode === tab.id}
                aria-label={`${tab.label} view`}
              >
                <tab.Icon size={15} /> {tab.label}
              </button>
            ))}
          </div>

          {viewMode === 'heatmap' && (
            <div className="heatmap-toggle glass">
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {tr('metric', 'Metric')}:
              </span>
              {['expense', 'income', 'net'].map((metric) => (
                <button
                  key={metric}
                  type="button"
                  className={`btn-sm ${heatmapMetric === metric ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setHeatmapMetric(metric)}
                  style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '8px' }}
                  aria-pressed={heatmapMetric === metric}
                >
                  {tr(metric, metric.charAt(0).toUpperCase() + metric.slice(1))}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn-secondary cal-csv-btn"
            onClick={exportMonthCSV}
            aria-label={tr('export_csv', 'Export month data as CSV')}
          >
            <Download size={15} /> CSV
          </button>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="btn-primary cal-new-btn"
            onClick={() => openAddForDate(normalizeDateKey(new Date()))}
          >
            <Plus size={16} /> {tr('new_entry', 'New Entry')}
          </motion.button>
        </div>
      </div>

      {/* Month metrics */}
      <div className="dashboard-row calendar-stats-row">
        <div className="glass stat-card cal-metric-card">
          <p className="stat-lbl">{tr('monthly_inflow', 'Monthly Inflow')}</p>
          <h3 className="stat-val text-success">+{fmt(monthlyIncome)}</h3>
        </div>
        <div className="glass stat-card cal-metric-card">
          <p className="stat-lbl">{tr('monthly_outflow', 'Monthly Outflow')}</p>
          <h3 className="stat-val text-danger">-{fmt(monthlyExpense)}</h3>
        </div>
        <div className="glass stat-card cal-metric-card">
          <p className="stat-lbl">{tr('net_position', 'Net Position')}</p>
          <h3 className={`stat-val ${monthlyNet >= 0 ? 'text-success' : 'text-danger'}`}>
            {monthlyNet >= 0 ? '+' : ''}{fmt(monthlyNet)}
          </h3>
        </div>
      </div>

      <div className="calendar-container glass">
        <div className="cal-header">
          <button
            type="button"
            className="ibtn"
            onClick={prevPeriod}
            aria-label={viewMode === 'weekly'
              ? tr('previous_week', 'Previous week')
              : tr('previous_month', 'Previous month')}
          >
            <ChevronLeft size={18} />
          </button>
          <h3 className="cal-month-title">
            {viewMode === 'weekly'
              ? tr('weekly_view', 'Weekly View')
              : formatMonthYear(year, month, locale)}
          </h3>
          <button
            type="button"
            className="ibtn"
            onClick={nextPeriod}
            aria-label={viewMode === 'weekly'
              ? tr('next_week', 'Next week')
              : tr('next_month', 'Next month')}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {viewMode === 'weekly' ? (
          renderWeeklyGrid()
        ) : (
          <div className="cal-grid">
            {viewMode === 'heatmap' ? renderHeatmap() : renderMonthlyGrid()}
          </div>
        )}
      </div>

      {/* Modals */}
      {createPortal(
        <AnimatePresence mode="wait">
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
                ref={dayModalRef}
                className="modal-box glass"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 680, maxHeight: '80vh', overflowY: 'auto' }}
                role="dialog"
                aria-modal="true"
                aria-label={tr('day_details', 'Day details')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                      {formatFullDate(selectedDate, locale)}
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {selectedDayData.items.length} {tr('records', 'record(s)')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ibtn"
                    onClick={closeDayDetails}
                    aria-label={tr('close', 'Close')}
                  >
                    <X size={18} />
                  </button>
                </div>

                {selectedDayData.items.length > 0 && (
                  <div
                    className="day-breakdown-stats-strip glass"
                    style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0.75rem' }}
                  >
                    <div className="db-stat">
                      <span className="db-lbl">{tr('inflow', 'Inflow')}</span>
                      <span className="db-val text-success">+{fmt(selectedDayData.income)}</span>
                    </div>
                    <div className="db-stat">
                      <span className="db-lbl">{tr('outflow', 'Outflow')}</span>
                      <span className="db-val text-danger">-{fmt(selectedDayData.expense)}</span>
                    </div>
                    <div className="db-stat">
                      <span className="db-lbl">{tr('net', 'Net')}</span>
                      <span className={`db-val ${selectedDayData.net >= 0 ? 'text-success' : 'text-danger'}`}>
                        {fmt(selectedDayData.net)}
                      </span>
                    </div>
                  </div>
                )}

                {dayCategoryTotals.length > 0 && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {dayCategoryTotals.map(({ category, income, expense }) => (
                      <span
                        key={category}
                        className="badge"
                        style={{
                          background: 'var(--bg-color)',
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: '0.75rem',
                        }}
                      >
                        {category}
                        {income > 0 && <> · <span className="text-success">+{fmt(income)}</span></>}
                        {expense > 0 && <> · <span className="text-danger">-{fmt(expense)}</span></>}
                      </span>
                    ))}
                  </div>
                )}

                {selectedDayData.items.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
                    <Filter size={14} />
                    {[
                      { id: 'all', label: tr('all', 'All') },
                      { id: 'income', label: tr('income', 'Income') },
                      { id: 'expense', label: tr('expense', 'Expense') },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className={`btn-sm ${dayFilterType === id ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setDayFilterType(id)}
                        aria-pressed={dayFilterType === id}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="day-transactions-list" style={{ maxHeight: 320, overflowY: 'auto', marginTop: 14 }}>
                  {filteredDayItems.length === 0 ? (
                    <div className="glass empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <Wallet size={42} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
                      <h3 style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: '1rem' }}>
                        {tr('no_transactions', 'No Transactions')}
                      </h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {tr('no_transactions_filter', 'No transactions match the current filter.')}
                      </p>
                    </div>
                  ) : (
                    filteredDayItems.map((tx, idx) => (
                      <div
                        key={tx.id || tx._id || `dtx-${idx}`}
                        className="day-tx-row"
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                          <div className={`day-tx-badge ${tx.type}`}>
                            {tx.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>
                              {tx.category || tr('uncategorized', 'Uncategorized')}
                            </p>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                              {tx.note || tr('no_note', 'No note')}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span
                            style={{
                              fontWeight: 700, fontSize: '0.92rem',
                              color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)',
                            }}
                          >
                            {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => openEditForTransaction(tx, e)}
                            className="ibtn"
                            aria-label={tr('edit_transaction', 'Edit transaction')}
                            style={{ padding: 2 }}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(tx)}
                            className="ibtn"
                            aria-label={tr('delete_transaction', 'Delete transaction')}
                            style={{ padding: 2, color: 'var(--danger)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="btn-secondary" onClick={closeDayDetails}>
                    {tr('close', 'Close')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => openAddForDate(selectedDate)}
                  >
                    <Plus size={16} /> {tr('add_for_date', 'Add For This Date')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {isAdding && (
            <TransactionForm
              key="add-modal"
              isOpen
              initialData={addInitialData}
              onClose={closeAdd}
              onSubmit={handleAddSubmit}
            />
          )}

          {isEditing && editingTx && (
            <TransactionForm
              key={`edit-modal-${editingTx.id || editingTx._id || 'tx'}`}
              isOpen
              initialData={editingTx}
              onClose={closeEdit}
              onSubmit={handleEditSubmit}
            />
          )}

          {pendingDelete && (
            <motion.div
              key="delete-modal"
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={cancelDelete}
            >
              <motion.div
                ref={deleteModalRef}
                className="modal-box glass"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={tr('delete_transaction_title', 'Delete transaction')}
                style={{ maxWidth: 460 }}
              >
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <AlertTriangle size={20} color="var(--danger-color, #ef4444)" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                    {tr('delete_transaction_title', 'Delete transaction')}
                  </h3>
                </div>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {tr('delete_transaction_confirm', 'Are you sure you want to delete this')}{' '}
                  <strong>{pendingDelete.type}</strong>{' '}
                  {tr('of', 'of')} <strong>{fmt(pendingDelete.amount)}</strong>?
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
                  {tr('cannot_be_undone', 'This action cannot be undone.')}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn-secondary" onClick={cancelDelete}>
                    {tr('cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ background: 'var(--danger-color, #ef4444)' }}
                    onClick={confirmDelete}
                  >
                    {tr('delete', 'Delete')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}