import React, {
  useState, useContext, useMemo, useCallback, useEffect, useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Edit3, RefreshCw, Calendar, TrendingDown,
  Pause, Play, XCircle, AlertCircle, Clock, CheckCircle2,
  CalendarDays, CreditCard, Zap, Tv, Music, PlaySquare, Cloud,
  Gamepad2, Package, Sparkles, Loader2, X, Palette, Search,
  ArrowUpRight, ArrowDownRight, PiggyBank, Undo2,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

/* ============================================================
 * Constants
 * ============================================================ */
const ICON_MAP = { Tv, Music, PlaySquare, Cloud, Gamepad2, Package, Sparkles };

const PRESET_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

const CYCLE_OPTIONS = [
  { value: 'daily', labelKey: 'cycle_daily', fallback: 'Daily', days: 1 },
  { value: 'weekly', labelKey: 'cycle_weekly', fallback: 'Weekly', days: 7 },
  { value: 'monthly', labelKey: 'cycle_monthly', fallback: 'Monthly', days: 30 },
  { value: 'quarterly', labelKey: 'cycle_quarterly', fallback: 'Quarterly', days: 91 },
  { value: 'yearly', labelKey: 'cycle_yearly', fallback: 'Yearly', days: 365 },
];

const PAYMENT_METHODS = [
  { value: 'card', labelKey: 'pm_card', fallback: 'Credit / Debit Card' },
  { value: 'bank_transfer', labelKey: 'pm_bank', fallback: 'Bank Transfer / Direct Debit' },
  { value: 'upi', labelKey: 'pm_upi', fallback: 'UPI' },
  { value: 'wallet', labelKey: 'pm_wallet', fallback: 'Digital Wallet / PayPal' },
  { value: 'other', labelKey: 'pm_other', fallback: 'Other' },
];

// Presets are currency-agnostic — the UI applies the symbol from `fmt`
const PRESETS = [
  { name: 'Netflix', amount: 15.99, icon: 'Tv', color: '#ef4444' },
  { name: 'Spotify', amount: 9.99, icon: 'Music', color: '#10b981' },
  { name: 'YouTube Premium', amount: 11.99, icon: 'PlaySquare', color: '#f59e0b' },
  { name: 'Apple iCloud', amount: 2.99, icon: 'Cloud', color: '#6b7280' },
  { name: 'Discord Nitro', amount: 9.99, icon: 'Gamepad2', color: '#059669' },
  { name: 'Xbox Game Pass', amount: 14.99, icon: 'Gamepad2', color: '#10b981' },
  { name: 'Amazon Prime', amount: 14.99, icon: 'Package', color: '#f59e0b' },
  { name: 'Disney+', amount: 7.99, icon: 'Sparkles', color: '#06b6d4' },
];

const DAYS_MS = 1000 * 60 * 60 * 24;

const matchesId = (a, b) => String(a ?? '') === String(b ?? '');

/* ============================================================
 * Helpers
 * ============================================================ */
const pad2 = (n) => String(n).padStart(2, '0');

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toFixed2 = (n) => Math.round(safeNumber(n) * 100) / 100;

const toLocalDateInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const parseLocalDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const d = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysBetween = (a, b) =>
  Math.round((a.getTime() - b.getTime()) / DAYS_MS);

/** Compute the monthly equivalent cost of a subscription. */
const getMonthlyEquivalent = (sub) => {
  if (!sub || sub.is_paused || sub.cancelled_at) return 0;
  const amt = safeNumber(sub.amount, 0);
  switch (sub.cycle) {
    case 'yearly': return amt / 12;
    case 'quarterly': return amt / 3;
    case 'weekly': return amt * (52 / 12);
    case 'daily': return amt * (365.25 / 12);
    case 'monthly':
    default: return amt;
  }
};

/** Humanize a cycle for display. */
const getCycleLabel = (cycle, t) => {
  const opt = CYCLE_OPTIONS.find((c) => c.value === cycle);
  if (!opt) return cycle || 'monthly';
  return t?.(opt.labelKey) || opt.fallback;
};

/** Advance a date by one billing cycle. */
const advanceByCycle = (date, cycle) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const preserveDayMonth = (offset) => {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  };

  switch (cycle) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      return d;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      return d;
    case 'monthly':
      preserveDayMonth(1);
      return d;
    case 'quarterly':
      preserveDayMonth(3);
      return d;
    case 'yearly': {
      const day = d.getDate();
      d.setDate(1);
      d.setFullYear(d.getFullYear() + 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, lastDay));
      return d;
    }
    default:
      preserveDayMonth(1);
      return d;
  }
};

/**
 * Compute the next `count` billing dates for a subscription, starting
 * from `next_billing_date` (or today + one cycle if missing/past).
 */
const getNextBillDates = (sub, count = 3, now = new Date()) => {
  const anchor = sub.next_billing_date
    ? parseLocalDate(sub.next_billing_date)
    : (sub.start_date ? parseLocalDate(sub.start_date) : null);

  const cycle = sub.cycle || 'monthly';

  let cursor;
  if (anchor && anchor >= now) {
    cursor = anchor;
  } else if (anchor) {
    // Roll forward until we land on or after `now`
    cursor = new Date(anchor);
    let safety = 0;
    while (cursor < now && safety < 500) {
      cursor = advanceByCycle(cursor, cycle);
      safety += 1;
    }
  } else {
    // No anchor — default to one cycle from today
    const base = startOfToday();
    cursor = advanceByCycle(base, cycle) || new Date(base);
  }

  const dates = [];
  for (let i = 0; i < count; i += 1) {
    dates.push(new Date(cursor));
    const next = advanceByCycle(cursor, cycle);
    if (!next) break;
    cursor = next;
  }
  return dates;
};

/* ============================================================
 * Main component
 * ============================================================ */
export default function Subscriptions() {
  const {
    fmt,
    subscriptions: subs = [],
    transactions = [],
    refetch,
    USER_ID,
    t,
    lang = 'en',
    loading: contextLoading,
  } = useContext(AppContext);
  const { showToast } = useToast();

  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);
  const locale = useMemo(() => {
    const map = { en: 'en-US', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN' };
    return map[lang] || undefined;
  }, [lang]);

  /* ---------------- UI state ---------------- */
  const [showAdd, setShowAdd] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [subToDelete, setSubToDelete] = useState(null);
  const [subToCancel, setSubToCancel] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  /* ---------------- Independent loading flags ---------------- */
  const [isSaving, setIsSaving] = useState(false);
  const [actingIds, setActingIds] = useState(() => new Set()); // per-sub pause/resume/delete
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  /* ---------------- Form state ---------------- */
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState('monthly');
  const [icon, setIcon] = useState('💳');
  const [color, setColor] = useState('#059669');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [formError, setFormError] = useState('');

  /* ---------------- Undo state ---------------- */
  const [undoAction, setUndoAction] = useState(null);
  const undoTimerRef = useRef(null);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  const armUndo = useCallback((label, restoreFn) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction({ label, restoreFn });
    undoTimerRef.current = setTimeout(() => setUndoAction(null), 6000);
  }, []);

  const runUndo = useCallback(async () => {
    if (!undoAction) return;
    const { restoreFn } = undoAction;
    setUndoAction(null);
    try {
      await restoreFn();
      await refetch();
      showToast('success', tr('undo_success', 'Restored'));
    } catch {
      showToast('error', tr('undo_failed', 'Could not undo'));
    }
  }, [undoAction, refetch, showToast, tr]);

  /* ============================================================
   * Derived metrics
   * ============================================================ */
  const activeSubs = useMemo(
    () => subs.filter((s) => !s.is_paused && !s.cancelled_at),
    [subs]
  );

  const pausedSubs = useMemo(
    () => subs.filter((s) => s.is_paused && !s.cancelled_at),
    [subs]
  );

  const cancelledSubs = useMemo(
    () => subs.filter((s) => s.cancelled_at),
    [subs]
  );

  const monthlyTotal = useMemo(
    () => activeSubs.reduce((sum, s) => sum + getMonthlyEquivalent(s), 0),
    [activeSubs]
  );
  const yearlyTotal = monthlyTotal * 12;

  /** Average monthly income over the last 90 days (better than all-time). */
  const avgMonthlyIncome = useMemo(() => {
    if (!Array.isArray(transactions) || transactions.length === 0) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    let total = 0;
    for (const tx of transactions) {
      if (!tx || tx.is_deleted === true || tx.type !== 'income') continue;
      const d = new Date(tx.date);
      if (Number.isNaN(d.getTime()) || d < cutoff) continue;
      total += safeNumber(tx.amount, 0);
    }
    return total / 3; // 90 days ≈ 3 months
  }, [transactions]);

  const incomePct = avgMonthlyIncome > 0
    ? ((monthlyTotal / avgMonthlyIncome) * 100).toFixed(1)
    : '0.0';

  /** Savings opportunity: which subscriptions are the biggest cost? */
  const topExpensive = useMemo(() => {
    return [...activeSubs]
      .map((s) => ({ sub: s, monthly: getMonthlyEquivalent(s) }))
      .sort((a, b) => b.monthly - a.monthly)
      .slice(0, 3);
  }, [activeSubs]);

  /** ✨ NEW: upcoming charges within the next 30 days, cycle-aware. */
  const upcomingBills = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 30);

    const bills = [];
    for (const sub of activeSubs) {
      const dates = getNextBillDates(sub, 4, now);
      for (const d of dates) {
        if (d > horizon) break;
        const daysLeft = daysBetween(d, now);
        bills.push({
          sub,
          date: d,
          daysLeft,
          amount: safeNumber(sub.amount, 0),
        });
      }
    }
    return bills.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [activeSubs]);

  const totalDue = useMemo(
    () => upcomingBills.reduce((sum, b) => sum + b.amount, 0),
    [upcomingBills]
  );

  const upcomingPreview = useMemo(
    () => upcomingBills.slice(0, 8),
    [upcomingBills]
  );

  /* ============================================================
   * Filtering + search
   * ============================================================ */
  const filteredSubs = useMemo(() => {
    let list = subs;
    if (statusFilter === 'active') list = activeSubs;
    else if (statusFilter === 'paused') list = pausedSubs;
    else if (statusFilter === 'cancelled') list = cancelledSubs;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.notes || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [subs, statusFilter, activeSubs, pausedSubs, cancelledSubs, search]);

  const presetAlreadyAdded = useCallback(
    (pName) => subs.some(
      (s) => String(s.name || '').toLowerCase() === pName.toLowerCase() &&
      !s.cancelled_at
    ),
    [subs]
  );

  /* ============================================================
   * Form helpers
   * ============================================================ */
  const resetForm = useCallback(() => {
    setName('');
    setAmount('');
    setCycle('monthly');
    setIcon('💳');
    setColor('#059669');
    setNextBillingDate('');
    setNotes('');
    setPaymentMethod('card');
    setFormError('');
    setEditingSub(null);
  }, []);

  const openAdd = useCallback(() => {
    resetForm();
    setShowAdd(true);
  }, [resetForm]);

  const handlePresetClick = useCallback((preset) => {
    resetForm();
    setName(preset.name);
    setAmount(String(preset.amount));
    setCycle('monthly');
    setIcon(preset.icon);
    setColor(preset.color);
    // Default next renewal: 30 days from today, local time
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setNextBillingDate(toLocalDateInput(d));
    setShowAdd(true);
  }, [resetForm]);

  const openEdit = useCallback((sub) => {
    if (!sub) return;
    setEditingSub(sub);
    setName(sub.name || '');
    setAmount(sub.amount != null ? String(sub.amount) : '');
    setCycle(sub.cycle || 'monthly');
    setIcon(sub.icon || '💳');
    setColor(sub.color || '#059669');
    setNextBillingDate(toLocalDateInput(sub.next_billing_date));
    setNotes(sub.notes || '');
    setPaymentMethod(sub.payment_method || 'card');
    setFormError('');
  }, []);

  const closeFormModal = useCallback(() => {
    setShowAdd(false);
    resetForm();
  }, [resetForm]);

  const clearError = useCallback(() => {
    setFormError((prev) => (prev ? '' : prev));
  }, []);

  /* ============================================================
   * Save
   * ============================================================ */
  const handleSaveSub = useCallback(async () => {
    if (isSaving) return;

    const trimmedName = name.trim();
    const numAmt = parseFloat(amount);

    if (!trimmedName) {
      setFormError(tr('sub_name_required', 'Please enter a subscription name.'));
      return;
    }
    if (!Number.isFinite(numAmt) || numAmt <= 0) {
      setFormError(tr('sub_amount_positive', 'Amount must be a positive number.'));
      return;
    }
    if (numAmt > 1e9) {
      setFormError(tr('sub_amount_too_large', 'Amount is too large.'));
      return;
    }
    if (nextBillingDate) {
      const d = parseLocalDate(nextBillingDate);
      if (!d) {
        setFormError(tr('sub_date_invalid', 'Next renewal date is invalid.'));
        return;
      }
    }
    if (!USER_ID) {
      showToast('error', tr('session_expired', 'Session expired. Please log in again.'));
      return;
    }

    setIsSaving(true);
    setFormError('');
    try {
      const payload = {
        user_id: USER_ID,
        name: trimmedName,
        amount: toFixed2(numAmt),
        cycle,
        color,
        icon,
        notes: notes.trim() || undefined,
        payment_method: paymentMethod,
        // Send local YYYY-MM-DD string — backend should treat as date-only
        next_billing_date: nextBillingDate || null,
      };

      if (editingSub) {
        const id = editingSub.id || editingSub._id;
        if (!id) {
          showToast('error', tr('sub_invalid', 'Invalid subscription reference.'));
          return;
        }
        await api.updateSubscription(id, payload);
        showToast('success', tr('sub_updated', 'Subscription updated successfully!'));
      } else {
        await api.createSubscription(payload);
        showToast('success', tr('sub_created', 'Subscription created successfully!'));
      }

      await refetch();
      closeFormModal();
    } catch (err) {
      showToast('error', err?.response?.data?.error || tr('sub_save_failed', 'Failed to save subscription'));
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving, name, amount, cycle, color, icon, notes, paymentMethod,
    nextBillingDate, editingSub, USER_ID, refetch, closeFormModal, showToast, tr,
  ]);

  /* ============================================================
   * Pause / Resume
   * ============================================================ */
  const togglePauseStatus = useCallback(async (sub) => {
    const subId = sub.id || sub._id;
    if (!subId || actingIds.has(subId)) return;

    const wasPaused = Boolean(sub.is_paused);
    setActingIds((prev) => { const n = new Set(prev); n.add(subId); return n; });

    try {
      await api.updateSubscription(subId, { is_paused: !wasPaused });
      await refetch();
      showToast('success', wasPaused ? tr('sub_resumed', `Resumed ${sub.name}`) : tr('sub_paused', `Paused ${sub.name}`));
    } catch (err) {
      showToast('error', err?.response?.data?.error || tr('sub_status_failed', 'Failed to update status'));
    } finally {
      setActingIds((prev) => { const n = new Set(prev); n.delete(subId); return n; });
    }
  }, [actingIds, refetch, showToast, tr]);

  /* ============================================================
   * Delete (with undo)
   * ============================================================ */
  const confirmDelete = useCallback(async () => {
    if (!subToDelete || isDeleting) return;
    const id = subToDelete;
    const sub = subs.find((s) => matchesId(s.id || s._id, id));
    if (!sub) {
      setSubToDelete(null);
      return;
    }
    setIsDeleting(true);
    try {
      await api.deleteSubscription(id);
      await refetch();
      setSubToDelete(null);
      showToast('success', tr('sub_deleted', 'Subscription deleted'));

      // Snapshot for potential undo
      const snapshot = {
        user_id: USER_ID,
        name: sub.name,
        amount: safeNumber(sub.amount, 0),
        cycle: sub.cycle || 'monthly',
        color: sub.color,
        icon: sub.icon,
        notes: sub.notes,
        payment_method: sub.payment_method,
        next_billing_date: sub.next_billing_date,
      };
      armUndo(tr('sub_deleted', 'Subscription deleted'), async () => {
        await api.createSubscription(snapshot);
      });
    } catch (err) {
      showToast('error', err?.response?.data?.error || tr('sub_delete_failed', 'Failed to delete subscription'));
    } finally {
      setIsDeleting(false);
    }
  }, [subToDelete, isDeleting, subs, refetch, showToast, tr, armUndo, USER_ID]);

  /* ============================================================
   * ✨ NEW: Cancel subscription (keeps history)
   * ============================================================ */
  const confirmCancel = useCallback(async () => {
    if (!subToCancel || isCancelling) return;
    const id = subToCancel;
    const sub = subs.find((s) => matchesId(s.id || s._id, id));
    if (!sub) {
      setSubToCancel(null);
      return;
    }
    setIsCancelling(true);
    try {
      await api.updateSubscription(id, { cancelled_at: new Date().toISOString(), is_paused: false });
      await refetch();
      setSubToCancel(null);
      showToast('success', tr('sub_cancelled', `Cancelled ${sub.name}`));
    } catch (err) {
      showToast('error', err?.response?.data?.error || tr('sub_cancel_failed', 'Failed to cancel'));
    } finally {
      setIsCancelling(false);
    }
  }, [subToCancel, isCancelling, subs, refetch, showToast, tr]);

  const reactivateSub = useCallback(async (sub) => {
    const subId = sub.id || sub._id;
    if (!subId || actingIds.has(subId)) return;
    setActingIds((prev) => { const n = new Set(prev); n.add(subId); return n; });
    try {
      await api.updateSubscription(subId, { cancelled_at: null, is_paused: false });
      await refetch();
      showToast('success', tr('sub_reactivated', `Reactivated ${sub.name}`));
    } catch (err) {
      showToast('error', err?.response?.data?.error || tr('sub_reactivate_failed', 'Failed to reactivate'));
    } finally {
      setActingIds((prev) => { const n = new Set(prev); n.delete(subId); return n; });
    }
  }, [actingIds, refetch, showToast, tr]);

  /* ---------------- Loading state ---------------- */
  if (contextLoading && subs.length === 0) {
    return (
      <div className="masonry-layout-page subscriptions-page-wrap">
        <div className="masonry-header">
          <div className="mh-titles">
            <h2>{tr('subscriptions_hub_title', 'Subscriptions & Recurring Hub')}</h2>
          </div>
        </div>
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Loader2 className="spin" size={36} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
          <p style={{ color: 'var(--text-muted)' }}>{tr('loading', 'Loading…')}</p>
        </div>
      </div>
    );
  }

  /* ============================================================
   * Render
   * ============================================================ */
  return (
    <div className="masonry-layout-page subscriptions-page-wrap">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{tr('subscriptions_hub_title', 'Subscriptions & Recurring Hub')}</h2>
          <span className="mh-badge">
            {activeSubs.length} {tr('active_services_count', 'Active Services')}
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="btn-primary"
          onClick={openAdd}
        >
          <Plus size={16} /> {tr('add_subscription_btn', 'Add Subscription')}
        </motion.button>
      </div>

      {/* Summary */}
      <div className="carousel-wrapper" style={{ minHeight: 90 }}>
        <div className="carousel-track">
          {[
            { label: tr('monthly_cost', 'Monthly Cost'), value: fmt(monthlyTotal), color: 'var(--danger)', icon: <Calendar size={18} /> },
            { label: tr('annual_cost', 'Annual Cost'), value: fmt(yearlyTotal), color: 'var(--warning)', icon: <TrendingDown size={18} /> },
            { label: tr('pct_of_income', '% of Income'), value: `${incomePct}%`, color: '#0ea5e9', icon: <Zap size={18} /> },
            { label: tr('active_subs', 'Active Subs'), value: activeSubs.length, color: 'var(--brand-primary)', icon: <CreditCard size={18} /> },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              className="carousel-item glass"
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: i * 0.08, type: 'spring' }}
              style={{ border: `1px solid ${s.color}33`, boxShadow: `0 8px 24px ${s.color}15` }}
            >
              <div className="ci-icon-box" style={{ background: `${s.color}15`, color: s.color }} aria-hidden>
                {s.icon}
              </div>
              <div className="ci-info">
                <p className="ci-val" style={{ color: s.color }}>{s.value}</p>
                <p className="ci-lbl">{s.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ✨ NEW: Savings opportunity strip */}
      {topExpensive.length > 0 && monthlyTotal > 0 && (
        <motion.div
          className="glass"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '12px 16px', borderRadius: 14, marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
          }}
        >
          <PiggyBank size={18} style={{ color: '#10b981', flexShrink: 0 }} aria-hidden />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {tr('savings_tip', 'Biggest subscriptions:')}{' '}
            {topExpensive.map(({ sub, monthly }, i) => (
              <React.Fragment key={sub.id || sub._id}>
                <strong>{sub.name}</strong> ({fmt(monthly)}/{tr('per_month', 'mo')})
                {i < topExpensive.length - 1 ? ', ' : ''}
              </React.Fragment>
            ))}
          </span>
        </motion.div>
      )}

      {/* Upcoming charges */}
      {upcomingPreview.length > 0 && (
        <motion.div className="sub-timeline-box glass" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="stb-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={16} className="text-brand" aria-hidden />
              <h4>{tr('upcoming_charges', 'Upcoming Charges (Next 30 Days)')}</h4>
            </div>
            <span className="stb-total">
              {tr('total_due', 'Total due')}: <strong>{fmt(totalDue)}</strong>
            </span>
          </div>

          <div className="stb-track">
            {upcomingPreview.map(({ sub, date, daysLeft, amount }) => {
              const subId = sub.id || sub._id;
              const IconCmp = sub.icon && ICON_MAP[sub.icon] ? ICON_MAP[sub.icon] : null;
              return (
                <div key={`${subId}-${date.toISOString()}`} className={`stb-item glass ${daysLeft <= 3 ? 'due-soon' : ''}`}>
                  <span className="stb-icon" aria-hidden>
                    {IconCmp ? <IconCmp size={20} /> : '💳'}
                  </span>
                  <div className="stb-info">
                    <strong>{sub.name}</strong>
                    <span>
                      {daysLeft === 0
                        ? tr('due_today', 'Due Today')
                        : `${tr('in', 'in')} ${daysLeft} ${tr('days_left', 'days')}`}{' '}
                      ({date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })})
                    </span>
                  </div>
                  <span className="stb-amt text-danger">-{fmt(amount)}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Presets */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <h4
          style={{
            marginBottom: 14, fontWeight: 800, fontFamily: 'var(--font-head)',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem',
          }}
        >
          {tr('quick_add_popular', 'Quick Add Popular Services')}
        </h4>
        <div className="carousel-wrapper" style={{ paddingBottom: 12 }}>
          <div className="carousel-track">
            {PRESETS.map((p) => {
              const added = presetAlreadyAdded(p.name);
              const IconCmp = ICON_MAP[p.icon];
              return (
                <motion.button
                  key={p.name}
                  type="button"
                  className="preset-btn"
                  disabled={added}
                  whileHover={added ? {} : { scale: 1.05, y: -4 }}
                  whileTap={added ? {} : { scale: 0.97 }}
                  onClick={() => !added && handlePresetClick(p)}
                  aria-label={added
                    ? `${p.name} — ${tr('already_added', 'already added')}`
                    : `${tr('add', 'Add')} ${p.name} ${tr('subscription', 'subscription')}`}
                  style={{
                    scrollSnapAlign: 'start', flex: '0 0 150px', padding: '16px 12px', borderRadius: 16,
                    background: added ? 'var(--surface-1)' : 'var(--glass-1)',
                    border: added ? `1px solid ${p.color}22` : `1px solid ${p.color}44`,
                    boxShadow: added ? 'none' : `0 8px 24px ${p.color}15`,
                    opacity: added ? 0.6 : 1, cursor: added ? 'default' : 'pointer', position: 'relative',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.3s',
                  }}
                >
                  {added && (
                    <span
                      style={{
                        position: 'absolute', top: 6, right: 6, fontSize: '0.65rem',
                        background: 'rgba(16,185,129,0.2)', color: 'var(--success)',
                        padding: '2px 6px', borderRadius: 100, fontWeight: 800,
                      }}
                    >
                      {tr('added', 'Added')}
                    </span>
                  )}
                  <div
                    style={{
                      width: 48, height: 48, borderRadius: 14, background: `${p.color}15`,
                      color: p.color, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', marginBottom: 12,
                    }}
                    aria-hidden
                  >
                    {IconCmp ? <IconCmp size={24} /> : '💳'}
                  </div>
                  <strong style={{ display: 'block', fontSize: '0.95rem', marginBottom: 4 }}>{p.name}</strong>
                  <span
                    style={{
                      color: p.color, fontWeight: 700, fontSize: '0.78rem',
                      background: `${p.color}15`, padding: '2px 8px', borderRadius: 100,
                    }}
                  >
                    {fmt(p.amount)}/{tr('per_month', 'mo')}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Toolbar: filter tabs + search */}
      <div className="sub-filter-strip" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { id: 'all', label: `${tr('all', 'All')} (${subs.length})` },
          { id: 'active', label: `${tr('active', 'Active')} (${activeSubs.length})` },
          { id: 'paused', label: `${tr('paused', 'Paused')} (${pausedSubs.length})` },
          { id: 'cancelled', label: `${tr('cancelled', 'Cancelled')} (${cancelledSubs.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`sfs-btn ${statusFilter === tab.id ? 'active' : ''}`}
            onClick={() => setStatusFilter(tab.id)}
            aria-pressed={statusFilter === tab.id}
          >
            {tab.label}
          </button>
        ))}

        <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 200 }}>
          <Search
            size={14}
            aria-hidden
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('search_subscriptions', 'Search subscriptions…')}
            aria-label={tr('search_subscriptions', 'Search subscriptions')}
            style={{ width: '100%', paddingLeft: 32, fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* List */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        {filteredSubs.length === 0 ? (
          <motion.div
            className="glass empty-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: '40px 20px', textAlign: 'center' }}
          >
            <RefreshCw size={42} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} aria-hidden />
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: '1rem' }}>
              {search
                ? tr('no_matches', 'No matching subscriptions')
                : tr('no_subscriptions_found', 'No Subscriptions Found')}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {search
                ? tr('try_different_search', 'Try a different search term.')
                : tr('add_custom_subs_desc', 'Add custom subscriptions or use the quick presets above.')}
            </p>
          </motion.div>
        ) : (
          <div className="masonry-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            <AnimatePresence>
              {filteredSubs.map((s, i) => {
                const subId = s.id || s._id;
                const monthly = getMonthlyEquivalent(s);
                const isPaused = Boolean(s.is_paused);
                const isCancelled = Boolean(s.cancelled_at);
                const acting = actingIds.has(subId);
                const IconCmp = s.icon && ICON_MAP[s.icon] ? ICON_MAP[s.icon] : null;

                return (
                  <motion.div
                    key={subId || `sub-${i}`}
                    className={`masonry-card glass ${isPaused ? 'sub-paused' : ''} ${isCancelled ? 'sub-cancelled' : ''}`}
                    initial={{ opacity: 0, scale: 0.93, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.88, y: 10 }}
                    layout
                    transition={{ delay: i * 0.04, type: 'spring', damping: 20 }}
                    style={{
                      '--mc-color': s.color,
                      padding: 18,
                      ...(isCancelled && {
                        borderLeft: '4px solid var(--danger)',
                        background: 'rgba(239,68,68,0.04)',
                      }),
                    }}
                  >
                    <div className="mc-header" style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="mc-icon" aria-hidden>
                          {IconCmp ? <IconCmp size={24} /> : (s.icon || '💳')}
                        </div>
                        {isPaused && !isCancelled && (
                          <span
                            className="badge"
                            style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--warning)' }}
                          >
                            {tr('paused', 'Paused')}
                          </span>
                        )}
                        {isCancelled && (
                          <span
                            className="badge"
                            style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }}
                          >
                            {tr('cancelled', 'Cancelled')}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 4 }}>
                        {isCancelled ? (
                          <button
                            type="button"
                            className="del-btn"
                            onClick={() => reactivateSub(s)}
                            disabled={acting}
                            aria-label={`${tr('reactivate', 'Reactivate')} ${s.name || ''}`.trim()}
                            title={tr('reactivate', 'Reactivate')}
                          >
                            {acting ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="del-btn"
                              onClick={() => togglePauseStatus(s)}
                              disabled={acting}
                              aria-label={isPaused
                                ? `${tr('resume', 'Resume')} ${s.name || ''}`.trim()
                                : `${tr('pause', 'Pause')} ${s.name || ''}`.trim()}
                              title={isPaused ? tr('resume', 'Resume') : tr('pause', 'Pause')}
                            >
                              {acting ? <Loader2 size={14} className="spin" /> : (isPaused ? <Play size={14} /> : <Pause size={14} />)}
                            </button>
                            <button
                              type="button"
                              className="del-btn"
                              onClick={() => openEdit(s)}
                              aria-label={`${tr('edit', 'Edit')} ${s.name || ''}`.trim()}
                              title={tr('edit', 'Edit')}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              className="del-btn"
                              onClick={() => setSubToCancel(subId)}
                              aria-label={`${tr('cancel', 'Cancel')} ${s.name || ''}`.trim()}
                              title={tr('cancel', 'Cancel')}
                            >
                              <XCircle size={14} />
                            </button>
                            <button
                              type="button"
                              className="del-btn"
                              onClick={() => setSubToDelete(subId)}
                              aria-label={`${tr('delete', 'Delete')} ${s.name || ''}`.trim()}
                              title={tr('delete', 'Delete')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <h3 className="mc-title">{s.name}</h3>

                    <div className="mc-amounts" style={{ marginBottom: 12, alignItems: 'center' }}>
                      <span className="mc-saved" style={{ fontSize: '1.6rem', letterSpacing: '-0.5px' }}>
                        {fmt(s.amount)}
                      </span>
                      <span
                        className="mc-target"
                        style={{
                          textTransform: 'capitalize', background: 'var(--surface-1)',
                          padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem',
                        }}
                      >
                        /{getCycleLabel(s.cycle, t)}
                      </span>
                    </div>

                    {s.notes && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 10px', fontStyle: 'italic' }}>
                        {s.notes}
                      </p>
                    )}

                    <div
                      className="mc-footer"
                      style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: 12 }}
                    >
                      <div
                        className="mc-ai-pred"
                        style={{ justifyContent: 'space-between', background: 'var(--surface-1)', border: 'none' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem' }}>
                          <Calendar size={12} aria-hidden /> {tr('monthly_equivalent', 'Monthly Equivalent')}
                        </span>
                        <span
                          style={{
                            color: isPaused || isCancelled ? 'var(--text-muted)' : 'var(--text-primary)',
                            fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
                          }}
                        >
                          {isPaused || isCancelled ? tr('inactive', 'Inactive') : `~${fmt(monthly)}`}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Add / Edit modal */}
      <Modal
        isOpen={showAdd || editingSub !== null}
        onClose={closeFormModal}
        title={editingSub
          ? `✏️ ${tr('edit', 'Edit')} ${editingSub.name}`
          : `💳 ${tr('add_custom_subscription', 'Add Custom Subscription')}`}
        confirmText={editingSub ? tr('update_subscription', 'Update Subscription') : tr('save_subscription', 'Save Subscription')}
        onConfirm={handleSaveSub}
        isLoading={isSaving}
      >
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label htmlFor="sub_name">{tr('service_name', 'Service Name')}</label>
          <input
            id="sub_name"
            value={name}
            onChange={(e) => { setName(e.target.value); clearError(); }}
            placeholder={tr('service_name_placeholder', 'e.g. Netflix, Gym, AWS')}
            autoFocus
            maxLength={80}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label htmlFor="sub_amount">{tr('amount', 'Amount')}</label>
          <input
            id="sub_amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); clearError(); }}
            placeholder="0.00"
            inputMode="decimal"
          />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label htmlFor="sub_cycle">{tr('billing_cycle', 'Billing Cycle')}</label>
          <select
            id="sub_cycle"
            value={cycle}
            onChange={(e) => { setCycle(e.target.value); clearError(); }}
            style={{ width: '100%' }}
          >
            {CYCLE_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {tr(c.labelKey, c.fallback)}
              </option>
            ))}
          </select>
        </div>

        {/* ✨ NEW: icon + color pickers */}
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>{tr('icon', 'Icon')}</label>
          <div role="group" aria-label={tr('choose_icon', 'Choose icon')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['💳', 'Tv', 'Music', 'PlaySquare', 'Cloud', 'Gamepad2', 'Package', 'Sparkles'].map((ic) => {
              const IconCmp = ICON_MAP[ic];
              const isSelected = icon === ic;
              return (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  aria-pressed={isSelected}
                  aria-label={`${tr('choose_icon', 'Choose icon')} ${ic}`}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    border: isSelected ? '2px solid var(--brand-primary)' : '1px solid var(--glass-border)',
                    background: isSelected ? 'rgba(var(--brand-primary-rgb),0.08)' : 'var(--surface-1)',
                    cursor: 'pointer', display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem',
                  }}
                >
                  {IconCmp ? <IconCmp size={18} /> : ic}
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>{tr('color', 'Color')}</label>
          <div role="group" aria-label={tr('choose_color', 'Choose color')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                aria-label={`${tr('choose_color', 'Choose color')} ${c}`}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: c,
                  border: color === c ? '3px solid var(--text-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label htmlFor="sub_next_date">{tr('next_renewal_date', 'Next Renewal Date')}</label>
          <input
            id="sub_next_date"
            type="date"
            value={nextBillingDate}
            onChange={(e) => { setNextBillingDate(e.target.value); clearError(); }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label htmlFor="sub_pm">{tr('payment_method', 'Payment Method')}</label>
          <select
            id="sub_pm"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            style={{ width: '100%' }}
          >
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm.value} value={pm.value}>
                {tr(pm.labelKey, pm.fallback)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label htmlFor="sub_notes">
            {tr('notes', 'Notes')}{' '}
            <span className="form-label-hint">({tr('optional', 'optional')})</span>
          </label>
          <textarea
            id="sub_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr('notes_placeholder', 'e.g. Shared with family, renews automatically')}
            maxLength={500}
            rows={3}
          />
        </div>

        {formError && (
          <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertCircle size={14} aria-hidden /> {formError}
          </p>
        )}
      </Modal>

      {/* Delete modal */}
      <Modal
        isOpen={subToDelete !== null}
        onClose={() => (isDeleting ? null : setSubToDelete(null))}
        title={tr('delete_subscription', 'Delete Subscription')}
        confirmText={tr('delete', 'Delete')}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
          {tr('delete_subscription_confirm', 'Are you sure you want to permanently delete')}{' '}
          <strong>{subs.find((s) => matchesId(s.id || s._id, subToDelete))?.name || tr('this_subscription', 'this subscription')}</strong>?
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          {tr('delete_subscription_hint', 'Tip: cancel instead to keep a record of it.')}
        </p>
      </Modal>

      {/* ✨ NEW: Cancel modal */}
      <Modal
        isOpen={subToCancel !== null}
        onClose={() => (isCancelling ? null : setSubToCancel(null))}
        title={tr('cancel_subscription', 'Cancel Subscription')}
        confirmText={tr('confirm_cancel', 'Yes, Cancel It')}
        onConfirm={confirmCancel}
        isLoading={isCancelling}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16, lineHeight: 1.55 }}>
          {tr('cancel_subscription_confirm', 'Mark')}{' '}
          <strong>{subs.find((s) => matchesId(s.id || s._id, subToCancel))?.name || tr('this_subscription', 'this subscription')}</strong>{' '}
          {tr('cancel_subscription_body', 'as cancelled? You can reactivate it later.')}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          {tr('cancel_subscription_hint', 'The subscription stays in your history but is removed from active totals.')}
        </p>
      </Modal>

      {/* ✨ NEW: Undo bar */}
      <AnimatePresence>
        {undoAction && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1100, display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px', borderRadius: 999,
              background: 'var(--glass-2)', border: '1px solid var(--glass-border)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.28)', backdropFilter: 'blur(16px)',
            }}
          >
            <Undo2 size={16} aria-hidden />
            <span style={{ fontSize: '0.88rem' }}>{undoAction.label}</span>
            <button
              type="button"
              className="btn-secondary"
              onClick={runUndo}
              style={{ padding: '4px 12px', fontSize: '0.8rem' }}
            >
              {tr('undo', 'Undo')}
            </button>
            <button
              type="button"
              onClick={() => setUndoAction(null)}
              aria-label={tr('dismiss', 'Dismiss')}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .sub-paused { opacity: 0.85; }
      `}</style>
    </div>
  );
}