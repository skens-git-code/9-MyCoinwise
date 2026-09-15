import React, {
  useState, useContext, useMemo, useCallback, useEffect, useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit3, Trash2, AlertCircle, Calendar, Wallet, Copy,
  ToggleLeft, ToggleRight, Eye, EyeOff, Loader2,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

/* ============================================================
 * Constants
 * ============================================================ */
const BUDGET_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#3b82f6', '#f43f5e', '#14b8a6',
];
const BUDGET_TYPES = ['monthly', 'weekly', 'custom'];
const WARNING_THRESHOLD = 80;
const CRITICAL_THRESHOLD = 100;
const MAX_LIMIT = 999_999_999.99;
const LIMIT_REGEX = /^\d+(\.\d{1,2})?$/;
const MAX_NAME_LENGTH = 100;
const DUPLICATE_SUFFIX = ' (Copy)';
const DUPLICATE_BASE_MAX = MAX_NAME_LENGTH - DUPLICATE_SUFFIX.length;

const LOCALE_MAP = {
  en: 'en-US', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN',
};
const resolveLocale = (lang) => LOCALE_MAP[lang] || undefined;

/* ============================================================
 * Date helpers — UTC-safe
 * ============================================================ */

/** Extract YYYY-MM-DD from a string, or fall back to local components. */
const toLocalDateInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Parse a YYYY-MM-DD string as a local Date (no UTC shift). */
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

/** Local start-of-day in ms — UTC-safe. */
const localStartMs = (value) => {
  const d = parseLocalDate(value);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Local end-of-day in ms — UTC-safe. */
const localEndMs = (value) => {
  const d = parseLocalDate(value);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/** Add N days to a YYYY-MM-DD string, UTC-safe. */
const shiftDateInput = (dateStr, days) => {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + days);
  return toLocalDateInput(d);
};

/** Inclusive day count between two YYYY-MM-DD strings, UTC-safe. */
const daysBetweenInclusive = (startStr, endStr) => {
  const s = parseLocalDate(startStr);
  const e = parseLocalDate(endStr);
  if (!s || !e) return 0;
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return Math.round((e - s) / 86400000) + 1;
};

/** Locale-aware date string, UTC-safe. */
const formatDate = (value, locale) => {
  const d = parseLocalDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(locale || undefined);
};

/* ============================================================
 * Misc helpers
 * ============================================================ */
const hashId = (id) => {
  const s = String(id ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const pickColor = (id, index) => BUDGET_COLORS[hashId(id ?? index) % BUDGET_COLORS.length];
const budgetId = (b) => b?.id ?? b?._id ?? null;

/* ============================================================
 * Sub-components
 * ============================================================ */
const IconButton = ({ onClick, label, children, disabled, tone }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    style={{
      background: 'transparent',
      border: 'none',
      color: tone === 'danger' ? 'var(--danger-color, #ef4444)' : 'var(--text-muted)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      padding: 4,
      borderRadius: 6,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: disabled ? 0.4 : 1,
    }}
  >
    {children}
  </button>
);

/* ============================================================
 * Main
 * ============================================================ */
export default function Budgets() {
  const {
    budgets = [],
    refetch,
    fmt,
    transactions = [],
    loading,
    t,
    lang,
  } = useContext(AppContext);
  const { showToast } = useToast();

  const locale = useMemo(() => resolveLocale(lang), [lang]);
  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  /* ---------------- State ---------------- */
  const [showAdd, setShowAdd] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetToDelete, setBudgetToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Ref-based in-flight tracker — synchronous, avoids stale-closure races.
  const inflightTogglesRef = useRef(new Set());
  const [, forceToggleRender] = useState(0);

  const [name, setName] = useState('');
  const [type, setType] = useState('monthly');
  const [category, setCategory] = useState('');
  const [totalLimit, setTotalLimit] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');

  /* ---------------- Category options ---------------- */
  const categoryOptions = useMemo(() => {
    const set = new Set();
    transactions.forEach((tx) => { if (tx?.category) set.add(String(tx.category)); });
    budgets.forEach((b) => { if (b?.category) set.add(String(b.category)); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [transactions, budgets]);

  /* ---------------- Pre-filtered expenses ---------------- */
  const expenseTxs = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    const out = [];
    for (const tx of transactions) {
      if (!tx || tx.type !== 'expense') continue;
      if (tx.is_deleted === true) continue;
      const ts = localStartMs(tx.date);
      if (ts == null) continue;
      const amt = Number(tx.amount);
      out.push({
        ts,
        amount: Number.isFinite(amt) && amt > 0 ? amt : 0,
        // Normalise category for case-insensitive matching
        categoryKey: (tx.category || '').trim().toLowerCase(),
      });
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }, [transactions]);

  /* ---------------- Computed budgets ---------------- */
  const computedBudgets = useMemo(() => {
    return budgets.map((b, index) => {
      const startMs = localStartMs(b.period_start);
      const endMs = localEndMs(b.period_end);
      const rangeValid = startMs != null && endMs != null && startMs <= endMs;
      const catKey = (b.category || '').trim().toLowerCase();

      let clientSpent = 0;
      if (rangeValid) {
        for (const tx of expenseTxs) {
          if (tx.ts < startMs) continue;
          if (tx.ts > endMs) break;
          if (catKey && tx.categoryKey !== catKey) continue;
          clientSpent += tx.amount;
        }
      }

      const backendSpentNum = Number(b.total_spent);
      const backendValid = Number.isFinite(backendSpentNum) && backendSpentNum >= 0;
      const spent = Math.max(clientSpent, backendValid ? backendSpentNum : 0);

      const rolloverAmount = Number.isFinite(Number(b.rollover_amount)) ? Number(b.rollover_amount) : 0;
      const baseLimit = Number.isFinite(Number(b.total_limit)) ? Number(b.total_limit) : 0;
      const limit = baseLimit + rolloverAmount;
      const remaining = limit - spent;
      const progress = limit > 0 ? (spent / limit) * 100 : 0;

      return {
        ...b,
        category: b.category || '',
        clientSpent,
        spent,
        baseLimit,
        rolloverAmount,
        limit,
        remaining,
        progress,
        rangeValid,
        color: pickColor(budgetId(b) ?? b.name, index),
      };
    });
  }, [budgets, expenseTxs]);

  const visibleBudgets = useMemo(
    () => (showInactive ? computedBudgets : computedBudgets.filter((b) => b.is_active !== false)),
    [computedBudgets, showInactive]
  );

  const stats = useMemo(() => {
    const active = computedBudgets.filter((b) => b.is_active !== false);
    const inactive = computedBudgets.filter((b) => b.is_active === false);
    const over = active.filter((b) => b.remaining < 0).length;
    const near = active.filter((b) => b.progress >= WARNING_THRESHOLD && b.progress < CRITICAL_THRESHOLD).length;
    return { total: computedBudgets.length, active: active.length, inactive: inactive.length, over, near };
  }, [computedBudgets]);

  /* ---------------- Form helpers ---------------- */
  const resetForm = useCallback(() => {
    setName(''); setType('monthly'); setCategory(''); setTotalLimit('');
    setPeriodStart(''); setPeriodEnd(''); setRolloverEnabled(false);
    setIsActive(true); setEditingBudget(null); setFormError('');
  }, []);

  const clearError = useCallback(() => {
    setFormError((prev) => (prev ? '' : prev));
  }, []);

  const populateForm = useCallback((budget, { isDuplicate = false } = {}) => {
    const baseName = String(budget.name || '');
    const nextName = isDuplicate
      ? `${baseName.slice(0, DUPLICATE_BASE_MAX)}${DUPLICATE_SUFFIX}`
      : baseName;

    let start = toLocalDateInput(budget.period_start);
    let end = toLocalDateInput(budget.period_end);
    if (isDuplicate && start && end) {
      const length = daysBetweenInclusive(start, end) || 1;
      start = shiftDateInput(start, length);
      end = shiftDateInput(end, length);
    }

    setName(nextName);
    setType(BUDGET_TYPES.includes(budget.type) ? budget.type : 'monthly');
    setCategory(budget.category || '');
    setTotalLimit(
      budget.total_limit != null && Number.isFinite(Number(budget.total_limit))
        ? String(budget.total_limit)
        : ''
    );
    setPeriodStart(start);
    setPeriodEnd(end);
    setRolloverEnabled(Boolean(budget.rollover_enabled));
    setIsActive(isDuplicate ? true : budget.is_active !== false);
    setEditingBudget(isDuplicate ? null : budget);
    setFormError('');
    setShowAdd(true);
  }, []);

  const openEdit = useCallback((budget) => populateForm(budget, { isDuplicate: false }), [populateForm]);
  const openDuplicate = useCallback((budget) => populateForm(budget, { isDuplicate: true }), [populateForm]);

  /* ---------------- Validation ---------------- */
  const validateForm = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return { ok: false, error: 'Budget name is required.' };
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
    }

    const editingId = budgetId(editingBudget);
    const duplicate = budgets.some(
      (b) =>
        String(b.name || '').toLowerCase() === trimmedName.toLowerCase() &&
        budgetId(b) !== editingId
    );
    if (duplicate) return { ok: false, error: 'A budget with that name already exists.' };

    if (!LIMIT_REGEX.test(String(totalLimit))) {
      return { ok: false, error: 'Limit must be a positive number with at most two decimal places.' };
    }
    const limitNum = Number(totalLimit);
    if (!Number.isFinite(limitNum) || limitNum <= 0) {
      return { ok: false, error: 'Limit must be greater than zero.' };
    }
    if (limitNum > MAX_LIMIT) {
      return { ok: false, error: `Limit cannot exceed ${MAX_LIMIT}.` };
    }

    if (!periodStart || !periodEnd) {
      return { ok: false, error: 'Start and end dates are required.' };
    }
    const s = parseLocalDate(periodStart);
    const e = parseLocalDate(periodEnd);
    if (!s) return { ok: false, error: 'Start date is invalid.' };
    if (!e) return { ok: false, error: 'End date is invalid.' };
    if (s > e) return { ok: false, error: 'Start date cannot be after end date.' };

    return {
      ok: true,
      payload: {
        name: trimmedName,
        type,
        category: category.trim() || null,
        total_limit: limitNum,
        period_start: periodStart,
        period_end: periodEnd,
        rollover_enabled: rolloverEnabled,
        is_active: isActive,
      },
    };
  }, [
    name, budgets, editingBudget, totalLimit, periodStart, periodEnd,
    type, category, rolloverEnabled, isActive,
  ]);

  /* ---------------- Submit ---------------- */
  const handleSubmit = useCallback(async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (isSubmitting) return;

    const result = validateForm();
    if (!result.ok) { setFormError(result.error); return; }

    setIsSubmitting(true);
    setFormError('');
    try {
      if (editingBudget) {
        await api.updateBudget(budgetId(editingBudget), result.payload);
        showToast('success', 'Budget updated successfully!');
      } else {
        await api.createBudget(result.payload);
        showToast('success', 'Budget created successfully!');
      }
      await refetch();
      setShowAdd(false);
      resetForm();
    } catch (err) {
      showToast('error', err?.response?.data?.error || 'Failed to save budget.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, validateForm, editingBudget, refetch, resetForm, showToast]);

  /* ---------------- Delete ---------------- */
  const handleDelete = useCallback(async () => {
    if (!budgetToDelete || isDeleting) return;
    const id = budgetId(budgetToDelete);
    if (!id) {
      showToast('error', 'Invalid budget reference.');
      setBudgetToDelete(null);
      return;
    }
    setIsDeleting(true);
    try {
      await api.deleteBudget(id);
      showToast('success', 'Budget deleted.');
      setBudgetToDelete(null);
      await refetch();
    } catch (err) {
      showToast('error', err?.response?.data?.error || 'Failed to delete budget.');
    } finally {
      setIsDeleting(false);
    }
  }, [budgetToDelete, isDeleting, refetch, showToast]);

  /* ---------------- Toggle active (ref-guarded) ---------------- */
  const toggleActive = useCallback(async (budget) => {
    const id = budgetId(budget);
    if (!id) return;
    if (inflightTogglesRef.current.has(id)) return;

    inflightTogglesRef.current.add(id);
    forceToggleRender((n) => n + 1);

    const currentlyActive = budget.is_active !== false;
    try {
      await api.updateBudget(id, { is_active: !currentlyActive });
      await refetch();
    } catch (err) {
      showToast('error', err?.response?.data?.error || 'Failed to update status.');
    } finally {
      inflightTogglesRef.current.delete(id);
      forceToggleRender((n) => n + 1);
    }
  }, [refetch, showToast]);

  /* ---------------- Escape closes modals ---------------- */
  useEffect(() => {
    if (!showAdd && !budgetToDelete) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (isSubmitting || isDeleting) return;
      if (budgetToDelete) setBudgetToDelete(null);
      else if (showAdd) { setShowAdd(false); resetForm(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showAdd, budgetToDelete, isSubmitting, isDeleting, resetForm]);

  /* ---------------- Loading ---------------- */
  if (loading && budgets.length === 0) {
    return (
      <div className="budget-page" style={{ padding: 'var(--spacing-lg)', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Loader2 size={40} className="spin" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
          <p style={{ color: 'var(--text-muted)' }}>{tr('loading', 'Loading budgets…')}</p>
        </div>
      </div>
    );
  }

  /* ---------------- Render ---------------- */
  return (
    <div className="budget-page" style={{ padding: 'var(--spacing-lg)', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      {/* ===================== Header ===================== */}
      <header
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 'var(--spacing-lg)', gap: '1rem', flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 300px' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            {tr('budgets', 'Budgets')}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {tr('monthly_budgets', 'Control your spending and track category limits.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {stats.inactive > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowInactive((s) => !s)}
              aria-pressed={showInactive}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {showInactive ? <EyeOff size={18} /> : <Eye size={18} />}
              {showInactive ? 'Hide Inactive' : 'Show Inactive'}
              {!showInactive && (
                <span style={{ background: 'var(--bg-color)', padding: '1px 6px', borderRadius: 10, fontSize: '0.7rem' }}>
                  {stats.inactive}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => { resetForm(); setShowAdd(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={18} /> {tr('create_budget', 'New Budget')}
          </button>
        </div>
      </header>

      {/* ===================== Summary ===================== */}
      {computedBudgets.length > 0 && (
        <div
          className="glass"
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: 12,
            marginBottom: 'var(--spacing-lg)',
          }}
        >
          {[
            { label: 'Active', value: stats.active },
            { label: 'Near Limit', value: stats.near, color: stats.near > 0 ? 'var(--warning-color, #f59e0b)' : undefined },
            { label: 'Over Budget', value: stats.over, color: stats.over > 0 ? 'var(--danger-color, #ef4444)' : undefined },
            { label: 'Total', value: stats.total },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {s.label}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.15rem', color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===================== List ===================== */}
      {visibleBudgets.length === 0 ? (
        <div className="budgets-empty glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Wallet size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }} aria-hidden />
          <h3 style={{ marginBottom: '0.5rem' }}>
            {showInactive ? tr('no_budgets', 'No budgets yet') : tr('no_budgets_yet', 'No active budgets')}
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            {tr('set_first_budget', 'Create a budget to start tracking your spending.')}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { resetForm(); setShowAdd(true); }}
          >
            <Plus size={18} /> {tr('create_budget', 'Create First Budget')}
          </button>
        </div>
      ) : (
        <div
          className="budgets-grid"
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem',
          }}
        >
          {visibleBudgets.map((b) => {
            const id = budgetId(b);
            const inactive = b.is_active === false;
            const toggling = id ? inflightTogglesRef.current.has(id) : false;
            const overspent = b.remaining < 0;
            const pct = b.progress;
            const cappedProgress = Math.max(0, Math.min(100, pct));
            const ariaNow = Math.round(cappedProgress); // respects ARIA min/max
            const progressColor = overspent
              ? 'var(--danger-color, #ef4444)'
              : pct >= WARNING_THRESHOLD
                ? 'var(--warning-color, #f59e0b)'
                : b.color;

            return (
              <motion.div
                key={id || `name:${b.name}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="budget-card glass"
                style={{
                  borderLeft: `4px solid ${inactive ? 'var(--text-muted)' : b.color}`,
                  opacity: inactive ? 0.7 : 1,
                  padding: '1rem 1.1rem', borderRadius: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.75rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3
                      style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={b.name}
                    >
                      {b.name}
                      {inactive && (
                        <span style={{ fontSize: '0.72rem', marginLeft: '0.5rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          (inactive)
                        </span>
                      )}
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <Calendar size={13} aria-hidden />
                      <span>
                        {formatDate(b.period_start, locale)} – {formatDate(b.period_end, locale)}
                      </span>
                      {b.category && (
                        <span style={{ fontSize: '0.7rem', background: 'var(--bg-color)', padding: '1px 8px', borderRadius: 10 }}>
                          {b.category}
                        </span>
                      )}
                    </div>
                    {b.rolloverAmount > 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                        Base {fmt(b.baseLimit)} + Rollover {fmt(b.rolloverAmount)} = {fmt(b.limit)}
                      </div>
                    )}
                    {!b.rangeValid && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--danger-color, #ef4444)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <AlertCircle size={13} aria-hidden /> Invalid period dates.
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.15rem', alignItems: 'center' }}>
                    <IconButton
                      onClick={() => toggleActive(b)}
                      label={inactive ? `Activate ${b.name}` : `Deactivate ${b.name}`}
                      disabled={Boolean(toggling)}
                    >
                      {toggling ? (
                        <Loader2 size={16} className="spin" />
                      ) : inactive ? (
                        <ToggleLeft size={18} color="var(--text-muted)" />
                      ) : (
                        <ToggleRight size={18} color="var(--success-color, #10b981)" />
                      )}
                    </IconButton>
                    <IconButton onClick={() => openEdit(b)} label={`Edit ${b.name}`}>
                      <Edit3 size={15} />
                    </IconButton>
                    <IconButton onClick={() => openDuplicate(b)} label={`Duplicate ${b.name}`}>
                      <Copy size={15} />
                    </IconButton>
                    <IconButton onClick={() => setBudgetToDelete(b)} label={`Delete ${b.name}`} tone="danger">
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>

                <div style={{ marginBottom: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{tr('spent', 'Spent')}</span>
                    <span style={{ fontWeight: 600, color: overspent ? 'var(--danger-color, #ef4444)' : 'var(--text-main)' }}>
                      {fmt(b.spent)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {overspent ? 'Over' : tr('remaining_budget', 'Remaining')}
                    </span>
                    <span style={{
                      fontWeight: 600,
                      color: overspent ? 'var(--danger-color, #ef4444)' : 'var(--success-color, #10b981)',
                    }}>
                      {overspent ? `-${fmt(Math.abs(b.remaining))}` : fmt(b.remaining)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{tr('budget_limit', 'Total Limit')}</span>
                    <span style={{ fontWeight: 600 }}>{fmt(b.limit)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    role="progressbar"
                    aria-valuenow={ariaNow}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${b.name} usage`}
                    style={{
                      flex: 1, height: 8, background: 'var(--bg-color)',
                      borderRadius: 4, overflow: 'hidden',
                    }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${cappedProgress}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      style={{ height: '100%', background: progressColor, borderRadius: 4 }}
                    />
                  </div>
                  {pct >= WARNING_THRESHOLD && (
                    <span
                      title={overspent ? 'Over budget' : 'Near limit'}
                      aria-label={overspent ? 'Over budget' : 'Near limit'}
                    >
                      <AlertCircle
                        size={16}
                        color={overspent ? 'var(--danger-color, #ef4444)' : 'var(--warning-color, #f59e0b)'}
                      />
                    </span>
                  )}
                </div>

                <div
                  style={{
                    textAlign: 'right', marginTop: '0.4rem', fontSize: '0.75rem',
                    color: overspent ? 'var(--danger-color, #ef4444)' : 'var(--text-muted)',
                  }}
                >
                  {pct.toFixed(0)}% used
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ===================== Add/Edit Modal ===================== */}
      <AnimatePresence>
        {showAdd && (
          <Modal
            isOpen={showAdd}
            title={editingBudget ? 'Edit Budget' : 'Create Budget'}
            onClose={() => {
              if (isSubmitting) return;
              setShowAdd(false);
              resetForm();
            }}
          >
            <form onSubmit={handleSubmit} className="budget-form" noValidate>
              <div className="form-field">
                <label htmlFor="budget-name">Budget Name *</label>
                <input
                  id="budget-name"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearError(); }}
                  required
                  maxLength={MAX_NAME_LENGTH}
                  placeholder="e.g. Monthly Essentials"
                  autoComplete="off"
                  autoFocus
                  aria-describedby={formError ? 'budget-form-error' : undefined}
                  aria-invalid={Boolean(formError)}
                />
              </div>

              <div className="budget-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-field">
                  <label htmlFor="budget-type">Budget Type</label>
                  <select
                    id="budget-type"
                    value={type}
                    onChange={(e) => { setType(e.target.value); clearError(); }}
                  >
                    {BUDGET_TYPES.map((tp) => (
                      <option key={tp} value={tp}>
                        {tp.charAt(0).toUpperCase() + tp.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="budget-category">Category (optional)</label>
                  <input
                    id="budget-category"
                    type="text"
                    list="budget-category-options"
                    value={category}
                    onChange={(e) => { setCategory(e.target.value); clearError(); }}
                    placeholder="e.g. Groceries"
                    maxLength={60}
                  />
                  <datalist id="budget-category-options">
                    {categoryOptions.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="budget-limit">Total Limit *</label>
                <input
                  id="budget-limit"
                  type="number"
                  min="0.01"
                  max={MAX_LIMIT}
                  step="0.01"
                  value={totalLimit}
                  onChange={(e) => { setTotalLimit(e.target.value); clearError(); }}
                  required
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </div>

              <div className="budget-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-field">
                  <label htmlFor="budget-start">Start Date *</label>
                  <input
                    id="budget-start"
                    type="date"
                    value={periodStart}
                    max={periodEnd || undefined}
                    onChange={(e) => { setPeriodStart(e.target.value); clearError(); }}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="budget-end">End Date *</label>
                  <input
                    id="budget-end"
                    type="date"
                    value={periodEnd}
                    min={periodStart || undefined}
                    onChange={(e) => { setPeriodEnd(e.target.value); clearError(); }}
                    required
                  />
                </div>
              </div>

              <div className="budget-rollover-field" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
                <input
                  type="checkbox"
                  id="rollover"
                  checked={rolloverEnabled}
                  onChange={(e) => setRolloverEnabled(e.target.checked)}
                />
                <label htmlFor="rollover" style={{ margin: 0 }}>
                  Enable rollover (carry remaining budget forward)
                </label>
              </div>

              <div className="budget-rollover-field" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="active-toggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <label htmlFor="active-toggle" style={{ margin: 0 }}>
                  Active (visible and tracked)
                </label>
              </div>

              {formError && (
                <p
                  id="budget-form-error"
                  className="form-error"
                  role="alert"
                  style={{
                    display: 'flex', gap: '0.4rem', alignItems: 'center',
                    color: 'var(--danger-color, #ef4444)', marginTop: '0.75rem',
                  }}
                >
                  <AlertCircle size={14} aria-hidden /> {formError}
                </p>
              )}

              <div className="budget-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setShowAdd(false); resetForm(); }}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : editingBudget ? 'Update Budget' : 'Create Budget'}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* ===================== Delete Modal ===================== */}
      <AnimatePresence>
        {budgetToDelete && (
          <Modal
            isOpen={Boolean(budgetToDelete)}
            title="Delete Budget"
            onClose={() => { if (!isDeleting) setBudgetToDelete(null); }}
          >
            <div style={{ padding: '1rem 0' }}>
              <p>
                Are you sure you want to delete the budget{' '}
                <strong>{budgetToDelete.name}</strong>?
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                This action cannot be undone. Your transactions will <strong>not</strong> be
                deleted. Consider deactivating instead.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isDeleting}
                  onClick={() => setBudgetToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'var(--danger-color, #ef4444)' }}
                  disabled={isDeleting}
                  onClick={handleDelete}
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}