/* —————————————————————————————————————
 * Wealth Portfolio Page
 * Tracks assets and liabilities with:
 *   - Net worth hero card (assets − liabilities).
 *   - Asset allocation pie chart + net worth trajectory chart.
 *   - High-interest debt warning.
 *   - AI wealth advisor card.
 *   - Debt payoff simulator with base vs. accelerated payments.
 *   - Searchable / filterable / sortable portfolio list.
 *   - Add / edit / delete entries with an undo toast.
 *   - JSON / PDF export and clipboard summary.
 *
 * Key behaviors:
 *   - Dates are treated as local (YYYY-MM-DD), never UTC.
 *   - Deleting an entry offers a 6-second undo that re-creates it.
 *   - Debt simulator enforces a payment that covers monthly interest.
 *   - AI insights are debounced and throttled by a trigger key.
 *   - Keyboard: `/` focuses search, `N` opens add, `Escape` clears search.
 * ————————————————————————————————————— */

import React, {
  useState, useEffect, useCallback, useContext, useMemo, useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts';
import {
  Briefcase, AlertOctagon, Sparkles, RefreshCw, Plus, X, Trash2,
  Edit3, ShieldAlert, Calculator, DollarSign, Download, FileText,
  Search, ArrowUpDown, Undo2, Copy, Keyboard, TrendingUp, TrendingDown,
  Loader2, Filter, ChevronDown, CheckCircle2,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';
import { api } from '../services/api';

/* ============================================================
 * Constants
 * ============================================================ */

// ── Color per asset class (used by charts and accents) ──
const CLASS_COLORS = {
  liquid_asset: '#3b82f6',
  illiquid_asset: '#8b5cf6',
  business_equity: '#10b981',
  retirement: '#f59e0b',
  liability: '#ef4444',
};

// ── Verbose labels per asset class (for select options and badges) ──
const CLASS_LABELS = {
  liquid_asset: '💧 Stocks, Cash & Crypto',
  illiquid_asset: '🏠 Real Estate, Gold & Physical',
  business_equity: '💼 Business Equity',
  retirement: '🛡️ Retirement & Pension',
  liability: '💳 Liability / Debt',
};

// ── Short labels per asset class (for chart legends and pills) ──
const CLASS_SHORT = {
  liquid_asset: 'Liquid',
  illiquid_asset: 'Physical',
  business_equity: 'Business',
  retirement: 'Retirement',
  liability: 'Liability',
};

// ── Allowed asset classes ──
const ASSET_CLASSES = ['liquid_asset', 'illiquid_asset', 'business_equity', 'retirement', 'liability'];

// ── Sort menu options ──
const SORT_OPTIONS = [
  { value: 'value_desc', labelKey: 'sort_value_high', fallback: 'Value (High → Low)' },
  { value: 'value_asc', labelKey: 'sort_value_low', fallback: 'Value (Low → High)' },
  { value: 'name_asc', labelKey: 'sort_name', fallback: 'Name (A–Z)' },
  { value: 'class_asc', labelKey: 'sort_class', fallback: 'Category' },
  { value: 'newest', labelKey: 'sort_newest', fallback: 'Newest' },
  { value: 'oldest', labelKey: 'sort_oldest', fallback: 'Oldest' },
];

// ── Undo window and field limits ──
const UNDO_TIMEOUT_MS = 6000;
const MAX_DEBT_MONTHS = 600;
const MAX_SYMBOL_LENGTH = 12;
const MAX_NOTE_LENGTH = 200;

/* ============================================================
 * Helpers
 * ============================================================ */

// ── Zero-pad a number to 2 digits ──
const pad2 = (n) => String(n).padStart(2, '0');

// ── Coerce a value into a finite number with fallback ──
const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ── Normalize a date into a local YYYY-MM-DD string ──
const toLocalDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// ── Parse YYYY-MM-DD as a local Date (never UTC) ──
const parseLocalDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ── Extract an id from a doc / plain object ──
const getId = (item) => {
  const id = item?._id ?? item?.id;
  return id == null ? '' : String(id);
};

// ── True when the item is not soft-deleted ──
const isLiveItem = (item) => item && typeof item === 'object' && item.is_deleted !== true;

// ── Normalize history payloads into { month, netWorth } rows ──
const formatHistoryData = (rawData) => {
  if (!Array.isArray(rawData)) return [];
  return rawData
    .map((item) => {
      const month = item.month || (item.date ? String(item.date).slice(0, 7) : null);
      const netWorth = safeNumber(item.netWorth ?? item.value ?? item.net_worth, 0);
      if (!month) return null;
      return { month, netWorth };
    })
    .filter(Boolean);
};

/* ============================================================
 * Main Component
 * ============================================================ */
export default function Wealth() {
  // ── App context: formatter, auth token, i18n, theme, logout ──
  const { fmt, token, t, theme, logout } = useContext(AppContext);
  const { showToast } = useToast();

  // ── Translation helper with inline fallback ──
  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  // ── Dark theme detection for chart strokes and tooltips ──
  const isDark = useMemo(() => {
    const themes = new Set(['amoled', 'dark', 'midnight', 'black']);
    return themes.has(String(theme || '').toLowerCase());
  }, [theme]);

  /* ---------------- Data State ---------------- */

  // ── Portfolio items, net-worth history, and loading state ──
  const [wealthItems, setWealthItems] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [aiInsight, setAiInsight] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  /* ---------------- Modal / CRUD State ---------------- */

  // ── Add / edit / delete modals and their in-flight flags ──
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  /* ---------------- UI State: search, filter, sort ---------------- */

  // ── List controls ──
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [sortBy, setSortBy] = useState('value_desc');
  const [showExportMenu, setShowExportMenu] = useState(false);

  /* ---------------- Debt Simulator State ---------------- */

  // ── Target debt and payment inputs ──
  const [selectedDebtId, setSelectedDebtId] = useState('');
  const [extraPayment, setExtraPayment] = useState(2000);
  const [monthlyBasePayment, setMonthlyBasePayment] = useState(5000);

  /* ---------------- Undo State ---------------- */

  // ── Undo toast + auto-dismiss timer ──
  const [undoState, setUndoState] = useState(null);
  const undoTimerRef = useRef(null);

  /* ---------------- Refs ---------------- */

  // ── AI throttle refs + search input ref ──
  const aiTriggerKey = useRef('');
  const aiCooldown = useRef(0);
  const searchRef = useRef(null);

  // ── Clear pending undo timer on unmount ──
  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  /* ============================================================
   * Form State
   * ============================================================ */

  // ── Build an empty form payload for add / reset ──
  const emptyForm = useCallback(() => ({
    name: '',
    asset_class: 'liquid_asset',
    base_value: '',
    symbol: '',
    quantity: '',
    interest_rate: '',
    acquisition_date: toLocalDateKey(new Date()),
    note: '',
  }), []);

  // ── Form values + validation error ──
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  /* ============================================================
   * Data Fetching
   * ============================================================ */
  const fetchWealthData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const [itemsRes, histRes] = await Promise.all([
        api.getWealthItems ? api.getWealthItems()
          : Promise.reject(new Error('getWealthItems missing')),
        api.getWealthHistory ? api.getWealthHistory().catch(() => []) : Promise.resolve([]),
      ]);
      setWealthItems(Array.isArray(itemsRes) ? itemsRes : (itemsRes?.data || []));
      setHistoryData(formatHistoryData(Array.isArray(histRes) ? histRes : (histRes?.data || [])));
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        setFetchError(tr('session_expired', 'Session expired. Please log in again.'));
        showToast('error', tr('session_expired_short', 'Session expired.'));
        logout?.();
      } else {
        setFetchError(tr('cannot_reach_server', 'Cannot reach the server.'));
        showToast('error', tr('fetch_failed', 'Failed to load portfolio.'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, showToast, tr, logout]);

  // ── Fetch on mount / when the token becomes available ──
  useEffect(() => {
    if (token) fetchWealthData();
  }, [token, fetchWealthData]);

  /* ============================================================
   * Derived Metrics
   * ============================================================ */

  // ── Live items only ──
  const liveItems = useMemo(
    () => (Array.isArray(wealthItems) ? wealthItems.filter(isLiveItem) : []),
    [wealthItems]
  );

  // ── Totals, allocation, and liability lists derived from live items ──
  const metrics = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;
    let liquid = 0;
    let physical = 0;
    const toxic = [];
    const liabList = [];
    const classTotals = {};

    for (const item of liveItems) {
      const val = safeNumber(item.current_value ?? item.base_value, 0);
      const absVal = Math.abs(val);
      if (item.asset_class === 'liability') {
        totalLiabilities += absVal;
        const debt = { ...item, computedValue: absVal };
        liabList.push(debt);
        if (safeNumber(item.interest_rate, 0) > 12) toxic.push(debt);
      } else {
        totalAssets += val;
        classTotals[item.asset_class] = (classTotals[item.asset_class] || 0) + val;
        if (item.asset_class === 'liquid_asset') liquid += val;
        if (item.asset_class === 'illiquid_asset') physical += val;
      }
    }

    const allocation = Object.entries(classTotals)
      .filter(([, v]) => v > 0)
      .map(([cls, v]) => ({
        name: CLASS_SHORT[cls] || cls,
        value: v,
        color: CLASS_COLORS[cls] || '#64748b',
      }));

    const dta = totalAssets > 0 ? totalLiabilities / totalAssets : 0;

    return {
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      liquidAssets: liquid,
      physicalAssets: physical,
      assetAllocationData: allocation,
      liabilitiesList: liabList,
      toxicDebts: toxic,
      hasHighInterestDebts: toxic.length > 0,
      debtToAssetRatio: dta,
    };
  }, [liveItems]);

  // ── Color for the net worth hero (positive/negative) ──
  const nwColor = metrics.netWorth >= 0 ? 'var(--brand-primary)' : 'var(--danger)';

  /* ============================================================
   * Filtered + Sorted List
   * ============================================================ */
  const filteredSortedItems = useMemo(() => {
    let list = liveItems;
    if (classFilter !== 'all') list = list.filter((i) => i.asset_class === classFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        String(i.name || '').toLowerCase().includes(q) ||
        String(i.symbol || '').toLowerCase().includes(q) ||
        String(i.note || '').toLowerCase().includes(q)
      );
    }

    const copy = [...list];
    const value = (i) => safeNumber(i.current_value ?? i.base_value, 0);
    switch (sortBy) {
      case 'value_asc': copy.sort((a, b) => value(a) - value(b)); break;
      case 'name_asc': copy.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))); break;
      case 'class_asc': copy.sort((a, b) => String(a.asset_class || '').localeCompare(String(b.asset_class || ''))); break;
      case 'newest': copy.sort((a, b) => {
        const ta = parseLocalDate(a.acquisition_date)?.getTime() || 0;
        const tb = parseLocalDate(b.acquisition_date)?.getTime() || 0;
        return tb - ta;
      }); break;
      case 'oldest': copy.sort((a, b) => {
        const ta = parseLocalDate(a.acquisition_date)?.getTime() || 0;
        const tb = parseLocalDate(b.acquisition_date)?.getTime() || 0;
        return ta - tb;
      }); break;
      case 'value_desc':
      default: copy.sort((a, b) => value(b) - value(a));
    }
    return copy;
  }, [liveItems, classFilter, search, sortBy]);

  /* ============================================================
   * AI Insights
   * Debounced request throttled by payload equality + cooldown.
   * ============================================================ */
  useEffect(() => {
    if (liveItems.length === 0 || !token) {
      setAiInsight(tr('ai_empty', 'Add assets and liabilities to unlock your AI wealth strategy.'));
      return undefined;
    }

    const payload = {
      totalAssets: Math.round(metrics.totalAssets),
      liquidAssets: Math.round(metrics.liquidAssets),
      physicalAssets: Math.round(metrics.physicalAssets),
      liabilities: Math.round(metrics.totalLiabilities),
    };
    const newKey = JSON.stringify(payload);
    const now = Date.now();
    if (newKey === aiTriggerKey.current && now - aiCooldown.current < 30000) return undefined;

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      aiTriggerKey.current = newKey;
      aiCooldown.current = Date.now();
      setIsAiLoading(true);
      try {
        const insight = await api.getWealthAiInsights
          ? await api.getWealthAiInsights(payload)
          : null;
        if (!cancelled) setAiInsight(insight || tr('ai_default', 'Portfolio strategy active.'));
      } catch {
        if (!cancelled) {
          setAiInsight(tr(
            'ai_fallback',
            'Maintain balanced asset allocation and pay down high-interest liabilities first.'
          ));
        }
      } finally {
        if (!cancelled) setIsAiLoading(false);
      }
    }, 1500);

    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [
    metrics.totalAssets, metrics.totalLiabilities, metrics.liquidAssets,
    metrics.physicalAssets, token, liveItems.length, tr,
  ]);

  /* ============================================================
   * Debt Payoff Simulator
   * Enforces a payment that covers monthly interest.
   * ============================================================ */
  const debtPayoff = useMemo(() => {
    const list = metrics.liabilitiesList;
    if (list.length === 0) return null;
    const debt = list.find((d) => getId(d) === String(selectedDebtId)) || list[0];
    const principal = safeNumber(debt.computedValue ?? debt.base_value, 0);
    if (principal <= 0) return null;

    const annualRate = safeNumber(debt.interest_rate, 0) / 100;
    const monthlyRate = annualRate / 12;
    const monthlyInterestAtStart = principal * monthlyRate;

    // Enforce a minimum payment that exceeds interest
    const minRequired = monthlyInterestAtStart + Math.max(principal * 0.005, 50);
    const basePay = Math.max(monthlyBasePayment, minRequired);
    const acceleratedPay = basePay + Math.max(0, safeNumber(extraPayment, 0));

    // If base payment doesn't cover interest, warn
    const baseCoversInterest = basePay > monthlyInterestAtStart;

    // ── Month-by-month simulation with a hard cap ──
    const simulate = (payment) => {
      let balance = principal;
      let months = 0;
      let interest = 0;
      while (balance > 0 && months < MAX_DEBT_MONTHS) {
        const mo = balance * monthlyRate;
        interest += mo;
        balance = balance + mo - payment;
        months += 1;
      }
      return { months, interest, payoffReached: balance <= 0 };
    };

    const base = simulate(basePay);
    const acc = simulate(acceleratedPay);

    return {
      debt,
      debtName: debt.name,
      principal,
      monthsBase: base.months,
      monthsAcc: acc.months,
      totalInterestBase: base.interest,
      totalInterestAcc: acc.interest,
      savedMonths: Math.max(0, base.months - acc.months),
      savedInterest: Math.max(0, base.interest - acc.interest),
      baseCoversInterest,
      baseReachedZero: base.payoffReached,
    };
  }, [metrics.liabilitiesList, selectedDebtId, extraPayment, monthlyBasePayment]);

  /* ============================================================
   * CRUD Handlers
   * ============================================================ */

  // ── Reset the form to its empty state ──
  const resetForm = useCallback(() => {
    setFormData(emptyForm());
    setFormError('');
  }, [emptyForm]);

  // ── Open the add modal ──
  const openAdd = useCallback(() => {
    resetForm();
    setEditingItem(null);
    setIsAddingItem(true);
  }, [resetForm]);

  // ── Populate the form for editing an existing item ──
  const openEdit = useCallback((item) => {
    if (!item) return;
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      asset_class: item.asset_class || 'liquid_asset',
      base_value: item.base_value != null ? String(item.base_value) : '',
      symbol: item.symbol || '',
      quantity: item.quantity != null ? String(item.quantity) : '',
      interest_rate: item.interest_rate != null ? String(item.interest_rate) : '',
      acquisition_date: toLocalDateKey(item.acquisition_date) || toLocalDateKey(new Date()),
      note: item.note || '',
    });
    setFormError('');
  }, []);

  // ── Close the form modal and clear the form ──
  const closeFormModal = useCallback(() => {
    setIsAddingItem(false);
    setEditingItem(null);
    resetForm();
  }, [resetForm]);

  // ── Clear the form error when the user edits any field ──
  const clearError = useCallback(() => {
    setFormError((prev) => (prev ? '' : prev));
  }, []);

  // ── Validate and persist the form ──
  const handleSaveItem = useCallback(async () => {
    if (isSubmitting) return;

    const trimmedName = formData.name.trim();
    const baseVal = parseFloat(formData.base_value);

    if (!trimmedName) { setFormError(tr('name_required', 'Please enter a name.')); return; }
    if (trimmedName.length > 100) { setFormError(tr('name_too_long', 'Name is too long.')); return; }
    if (!Number.isFinite(baseVal) || baseVal <= 0) {
      setFormError(tr('value_positive', 'Value must be a positive number.')); return;
    }
    if (baseVal > 1e12) { setFormError(tr('value_too_large', 'Value is too large.')); return; }

    if (formData.asset_class === 'liability' && formData.interest_rate !== '') {
      const rate = parseFloat(formData.interest_rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        setFormError(tr('rate_invalid', 'Interest rate must be between 0 and 100.')); return;
      }
    }

    if (formData.quantity) {
      const q = parseFloat(formData.quantity);
      if (!Number.isFinite(q) || q < 0) {
        setFormError(tr('quantity_invalid', 'Quantity must be a positive number.')); return;
      }
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      // ── Build the payload with normalized values ──
      const payload = {
        name: trimmedName,
        asset_class: formData.asset_class,
        base_value: Math.round(baseVal * 100) / 100,
        symbol: formData.symbol.trim().slice(0, MAX_SYMBOL_LENGTH).toUpperCase() || undefined,
        quantity: formData.quantity ? safeNumber(formData.quantity, 0) : undefined,
        interest_rate: formData.asset_class === 'liability'
          ? safeNumber(formData.interest_rate, 0)
          : undefined,
        acquisition_date: formData.acquisition_date || toLocalDateKey(new Date()),
        note: formData.note.trim().slice(0, MAX_NOTE_LENGTH) || undefined,
      };

      // ── Update vs. create ──
      if (editingItem) {
        const id = getId(editingItem);
        if (!id) {
          setFormError(tr('invalid_item', 'Invalid item reference.'));
          return;
        }
        await api.updateWealthItem(id, payload);
        showToast('success', tr('item_updated', 'Entry updated successfully'));
      } else {
        await api.createWealthItem(payload);
        showToast('success', tr('item_added', 'Entry added successfully'));
      }

      closeFormModal();
      await fetchWealthData();
    } catch (err) {
      showToast('error', err?.response?.data?.error || tr('save_failed', 'Failed to save entry.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, formData, editingItem, tr, showToast,
    closeFormModal, fetchWealthData,
  ]);

  /* ============================================================
   * Delete (with undo)
   * ============================================================ */

  // ── Show the undo bar for the configured window ──
  const armUndo = useCallback((label, restoreFn) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState({ label, restoreFn });
    undoTimerRef.current = setTimeout(() => setUndoState(null), UNDO_TIMEOUT_MS);
  }, []);

  // ── Execute the pending undo action ──
  const runUndo = useCallback(async () => {
    if (!undoState) return;
    const { restoreFn } = undoState;
    setUndoState(null);
    try {
      await restoreFn();
      await fetchWealthData();
      showToast('success', tr('undo_success', 'Restored'));
    } catch {
      showToast('error', tr('undo_failed', 'Could not undo'));
    }
  }, [undoState, fetchWealthData, showToast, tr]);

  // ── Confirm and execute a delete, then arm the undo bar ──
  const confirmDelete = useCallback(async () => {
    if (!itemToDelete || isDeleting) return;
    const item = liveItems.find((i) => getId(i) === String(itemToDelete));
    if (!item) {
      setItemToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      await api.deleteWealthItem(getId(item));
      setItemToDelete(null);
      await fetchWealthData();
      showToast('success', tr('item_deleted', 'Entry deleted'));

      const snapshot = {
        name: item.name,
        asset_class: item.asset_class,
        base_value: item.base_value,
        symbol: item.symbol,
        quantity: item.quantity,
        interest_rate: item.interest_rate,
        acquisition_date: toLocalDateKey(item.acquisition_date),
        note: item.note,
      };
      armUndo(tr('item_deleted', 'Entry deleted'), async () => {
        await api.createWealthItem(snapshot);
      });
    } catch (err) {
      showToast('error', err?.response?.data?.error || tr('delete_failed', 'Failed to delete entry.'));
    } finally {
      setIsDeleting(false);
    }
  }, [itemToDelete, isDeleting, liveItems, fetchWealthData, showToast, tr, armUndo]);

  /* ============================================================
   * Export
   * ============================================================ */

  // ── Export the portfolio as a sanitized JSON file ──
  const exportPortfolioJSON = useCallback(() => {
    if (liveItems.length === 0) {
      showToast('info', tr('nothing_to_export', 'Nothing to export.'));
      return;
    }
    try {
      const sanitized = liveItems.map((i) => ({
        name: i.name,
        asset_class: i.asset_class,
        base_value: safeNumber(i.base_value, 0),
        current_value: safeNumber(i.current_value ?? i.base_value, 0),
        symbol: i.symbol,
        quantity: i.quantity,
        interest_rate: i.interest_rate,
        acquisition_date: toLocalDateKey(i.acquisition_date),
        note: i.note,
      }));
      const blob = new Blob([JSON.stringify(sanitized, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wealth_portfolio_${toLocalDateKey(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', tr('exported_json', 'Portfolio exported as JSON.'));
      setShowExportMenu(false);
    } catch (err) {
      console.error(err);
      showToast('error', tr('export_failed', 'Export failed.'));
    }
  }, [liveItems, showToast, tr]);

  // ── Export the portfolio as a PDF via the shared exporter ──
  const exportPortfolioPDF = useCallback(async () => {
    if (liveItems.length === 0 || isExportingPDF) {
      showToast('info', tr('nothing_to_export', 'Nothing to export.'));
      return;
    }
    setIsExportingPDF(true);
    setShowExportMenu(false);
    try {
      const { exportToPDF } = await import('../services/pdfExport');
      if (typeof exportToPDF === 'function') {
        await exportToPDF(
          { name: 'Wealth Portfolio' },
          liveItems.map((i) => ({
            date: i.acquisition_date,
            category: CLASS_SHORT[i.asset_class] || i.asset_class,
            type: i.asset_class === 'liability' ? 'expense' : 'income',
            amount: safeNumber(i.current_value ?? i.base_value, 0),
            note: i.name,
          })),
          null,
        );
        showToast('success', tr('exported_pdf', 'PDF generated.'));
      } else {
        showToast('error', tr('pdf_unavailable', 'PDF export unavailable.'));
      }
    } catch (err) {
      console.error(err);
      showToast('error', tr('pdf_failed', 'Failed to generate PDF.'));
    } finally {
      setIsExportingPDF(false);
    }
  }, [liveItems, isExportingPDF, showToast, tr]);

  // ── Copy a plain-text portfolio summary to the clipboard ──
  const copyPortfolioSummary = useCallback(async () => {
    const summary = [
      `${tr('net_worth', 'Net Worth')}: ${fmt(metrics.netWorth)}`,
      `${tr('assets', 'Assets')}: ${fmt(metrics.totalAssets)}`,
      `${tr('liabilities', 'Liabilities')}: ${fmt(metrics.totalLiabilities)}`,
      `${tr('debt_to_asset', 'Debt-to-Asset')}: ${(metrics.debtToAssetRatio * 100).toFixed(1)}%`,
      `${tr('items_count', 'Items')}: ${liveItems.length}`,
    ].join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        showToast('success', tr('copied', 'Copied to clipboard'));
      } else {
        showToast('error', tr('clipboard_unavailable', 'Clipboard not available'));
      }
    } catch {
      showToast('error', tr('copy_failed', 'Failed to copy'));
    }
  }, [fmt, metrics, liveItems.length, showToast, tr]);

  /* ============================================================
   * Keyboard Shortcuts
   * `/` focuses search, `N` opens add, `Escape` clears search.
   * ============================================================ */
  useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      const inField = target instanceof HTMLElement && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (inField) return;

      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        openAdd();
      } else if (e.key === 'Escape' && search) {
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openAdd, search]);

  /* ============================================================
   * Loading State
   * ============================================================ */

  // ── Show the loading skeleton until the first fetch resolves ──
  if (isLoading && wealthItems.length === 0) {
    return (
      <div className="masonry-layout-page wealth-page-wrap">
        <div className="masonry-header">
          <div className="mh-titles">
            <h2>{tr('wealth', 'Wealth Portfolio')}</h2>
          </div>
        </div>
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Loader2 className="spin" size={36} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
          <p style={{ color: 'var(--text-muted)' }}>{tr('loading_portfolio', 'Loading portfolio…')}</p>
        </div>
      </div>
    );
  }

  /* ============================================================
   * Render
   * ============================================================ */
  return (
    <div className="masonry-layout-page wealth-page-wrap">
      {/* ── Local spin keyframe ── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      {/* ===================== Header ===================== */}
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{tr('wealth', 'Wealth Portfolio')}</h2>
          <span className="mh-badge">
            {liveItems.length} {liveItems.length === 1 ? tr('item', 'item') : tr('items', 'items')}
          </span>
        </div>
        <div className="mh-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* ── Refresh ── */}
          <button
            type="button"
            className="btn-secondary"
            onClick={fetchWealthData}
            disabled={isLoading}
            aria-label={tr('refresh', 'Refresh portfolio data')}
          >
            {isLoading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} {tr('refresh', 'Refresh')}
          </button>

          {/* ── Export dropdown ── */}
          <div className="dropdown-container" style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowExportMenu((v) => !v)}
              aria-expanded={showExportMenu}
              aria-haspopup="menu"
            >
              <Download size={15} /> {tr('export', 'Export')} <ChevronDown size={14} />
            </button>
            <AnimatePresence>
              {showExportMenu && (
                <motion.div
                  className="tx-export-dropdown glass"
                  role="menu"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* ── JSON export ── */}
                  <button type="button" role="menuitem" className="tx-export-item" onClick={exportPortfolioJSON}>
                    <FileText size={15} className="text-success" aria-hidden /> {tr('export_json', 'Export JSON')}
                  </button>
                  {/* ── PDF export ── */}
                  <button
                    type="button"
                    role="menuitem"
                    className="tx-export-item"
                    onClick={exportPortfolioPDF}
                    disabled={isExportingPDF}
                  >
                    {isExportingPDF ? <Loader2 size={15} className="spin" /> : <FileText size={15} className="text-danger" aria-hidden />}
                    {isExportingPDF ? tr('generating', 'Generating…') : tr('export_pdf', 'Export PDF')}
                  </button>
                  {/* ── Copy summary ── */}
                  <button type="button" role="menuitem" className="tx-export-item" onClick={copyPortfolioSummary}>
                    <Copy size={15} aria-hidden /> {tr('copy_summary', 'Copy summary')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Add entry ── */}
          <button
            type="button"
            className="btn-primary"
            onClick={openAdd}
            aria-label={tr('add_entry', 'Add new asset or liability')}
          >
            <Plus size={16} /> {tr('add_entry', 'Add Entry')}
          </button>
        </div>
      </div>

      {/* ===================== Fetch Error Banner ===================== */}
      {fetchError && (
        <div
          className="glass"
          role="alert"
          style={{
            margin: '0 0 20px', padding: '12px 18px',
            borderLeft: '4px solid var(--danger)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <AlertOctagon size={18} style={{ color: 'var(--danger)' }} aria-hidden />
          <span style={{ flex: 1 }}>{fetchError}</span>
          <button type="button" className="btn-secondary" onClick={fetchWealthData}>
            {tr('retry', 'Retry')}
          </button>
        </div>
      )}

      {/* ===================== Hero Net Worth Card ===================== */}
      <motion.div
        className="glass bento-tile hero-networth-card"
        style={{
          padding: '36px 24px', textAlign: 'center', borderColor: nwColor,
          boxShadow: `0 8px 40px 0 ${metrics.netWorth >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.2)'}`,
          marginBottom: 20,
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        role="region"
        aria-label={`${tr('net_worth', 'Total Net Worth')}: ${fmt(metrics.netWorth)}`}
        aria-live="polite"
      >
        <h3 style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.8rem', marginBottom: 8 }}>
          {tr('net_worth', 'Total Net Worth')}
        </h3>
        <div style={{ fontSize: 'clamp(2.4rem, 5vw, 3.4rem)', fontWeight: 900, fontFamily: 'var(--font-mono)', color: nwColor }}>
          {fmt(metrics.netWorth)}
        </div>
        {/* ── Sub-stats: assets, liabilities, debt-to-asset ── */}
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{tr('assets', 'Assets')}</div>
            <div style={{ fontWeight: 700, color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingUp size={14} aria-hidden /> {fmt(metrics.totalAssets)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{tr('liabilities', 'Liabilities')}</div>
            <div style={{ fontWeight: 700, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingDown size={14} aria-hidden /> -{fmt(metrics.totalLiabilities)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{tr('debt_to_asset', 'Debt-to-Asset')}</div>
            <div style={{ fontWeight: 700, color: metrics.debtToAssetRatio > 0.5 ? 'var(--warning)' : 'var(--brand-primary)' }}>
              {(metrics.debtToAssetRatio * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </motion.div>

      {/* ===================== High-Interest Debt Warning ===================== */}
      {metrics.hasHighInterestDebts && (
        <motion.div
          className="glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: 16, borderLeft: '4px solid var(--danger)',
            background: 'rgba(239,68,68,0.06)', borderRadius: 12, marginBottom: 20,
          }}
          role="alert"
        >
          <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', margin: '0 0 4px 0' }}>
            <ShieldAlert size={18} aria-hidden /> {tr('high_interest_warning', 'High-Interest Debt Warning')}
          </h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
            {tr('high_interest_body', 'You have high-interest debt exceeding 12%:')}{' '}
            {metrics.toxicDebts.map((d) => `${d.name} @ ${d.interest_rate}%`).join(', ')}
          </p>
        </motion.div>
      )}

      {/* ===================== AI Advisor Card ===================== */}
      <motion.div
        className="glass bento-tile"
        style={{
          padding: 20, marginBottom: 20,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, transparent 100%)',
          border: '1px solid rgba(139,92,246,0.2)',
        }}
      >
        <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a78bfa', fontSize: '0.95rem' }}>
          <Sparkles size={16} aria-hidden /> {tr('ai_advisor', 'MyCoinwise AI Wealth Advisor')}
        </h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: '0.88rem', lineHeight: 1.5 }}>
          {isAiLoading ? tr('analyzing', 'Analyzing portfolio…') : aiInsight}
        </p>
      </motion.div>

      {/* ===================== Charts ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>
        {/* ── Net worth trajectory ── */}
        <motion.div className="glass bento-tile" style={{ padding: 20 }}>
          <h3 className="heading-accent" style={{ fontSize: '0.95rem', marginBottom: 12 }}>{tr('net_worth_trajectory', 'Net Worth Trajectory')}</h3>
          <div style={{ height: 220 }}>
            {historyData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 320, height: 240 }}>
                <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                  <Tooltip contentStyle={{ background: 'var(--surface-1)', borderRadius: 10 }} formatter={(v) => fmt(v)} />
                  <Area type="monotone" dataKey="netWorth" stroke="#10b981" fill="url(#nwGrad)" strokeWidth={2} name={tr('net_worth', 'Net Worth')} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex-center" style={{ height: '100%', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                {tr('no_history', 'Historical snapshots will appear here as your wealth updates over time.')}
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Asset allocation pie ── */}
        <motion.div className="glass bento-tile" style={{ padding: 20 }}>
          <h3 className="heading-accent" style={{ fontSize: '0.95rem', marginBottom: 12 }}>{tr('asset_allocation', 'Asset Allocation')}</h3>
          <div style={{ height: 220, position: 'relative' }}>
            {metrics.assetAllocationData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 320, height: 240 }}>
                <PieChart>
                  <Pie data={metrics.assetAllocationData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                    {metrics.assetAllocationData.map((e, idx) => (
                      <Cell key={`cell-${e.name}-${idx}`} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface-1)', borderRadius: 10 }} formatter={(v) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex-center" style={{ height: '100%', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {tr('no_assets', 'No assets logged yet.')}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ===================== Debt Payoff Simulator ===================== */}
      {metrics.liabilitiesList.length > 0 && debtPayoff && (
        <motion.div className="glass bento-tile" style={{ padding: 22, marginBottom: 20 }}>
          <div className="bt-header" style={{ marginBottom: 14 }}>
            <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
              <Calculator size={18} style={{ color: 'var(--brand-primary)' }} aria-hidden />
              {tr('debt_simulator', 'Debt Payoff & Interest Savings Simulator')}
            </h3>
          </div>

          {/* ── Inputs: target debt, base pay, extra pay ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div>
              <label htmlFor="debt_select" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {tr('target_liability', 'Target Liability')}
              </label>
              <select
                id="debt_select"
                value={getId(debtPayoff.debt)}
                onChange={(e) => setSelectedDebtId(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
              >
                {metrics.liabilitiesList.map((l) => (
                  <option key={getId(l)} value={getId(l)}>
                    {l.name} ({fmt(l.computedValue)} @ {l.interest_rate || 0}%)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="base_pay" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {tr('standard_pay', 'Standard Monthly Pay')}
              </label>
              <input
                id="base_pay"
                type="number"
                min="0"
                step="100"
                value={monthlyBasePayment}
                onChange={(e) => setMonthlyBasePayment(Math.max(0, safeNumber(e.target.value, 0)))}
                style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 8 }}
                placeholder="e.g. 5000"
                inputMode="decimal"
              />
            </div>

            <div>
              <label htmlFor="extra_pay" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {tr('extra_pay', 'Extra Monthly Payment')}
              </label>
              <input
                id="extra_pay"
                type="number"
                min="0"
                step="100"
                value={extraPayment}
                onChange={(e) => setExtraPayment(Math.max(0, safeNumber(e.target.value, 0)))}
                style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 8 }}
                placeholder="e.g. 2000"
                inputMode="decimal"
              />
            </div>
          </div>

          {/* ── Low-payment warning ── */}
          {!debtPayoff.baseCoversInterest && (
            <div
              role="alert"
              style={{
                padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)',
                fontSize: '0.82rem', marginBottom: 14,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <AlertOctagon size={16} aria-hidden />
              {tr('payment_too_low', 'Your standard payment does not cover the monthly interest. Increase it or the balance will grow.')}
            </div>
          )}

          {/* ── Result summary ── */}
          <div
            className="glass"
            style={{
              padding: '12px 16px', borderRadius: 10,
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tr('interest_saved', 'Interest Saved')}</div>
              <strong style={{ color: 'var(--success)', fontSize: '1.2rem' }}>+{fmt(debtPayoff.savedInterest)}</strong>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tr('time_cut', 'Time Cut Off')}</div>
              <strong style={{ color: 'var(--brand-primary)', fontSize: '1.2rem' }}>
                {debtPayoff.savedMonths} {tr('months', 'months')}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tr('accelerated_payoff', 'Accelerated Payoff')}</div>
              <strong>~{debtPayoff.monthsAcc} {tr('months', 'months')}</strong>
            </div>
          </div>
        </motion.div>
      )}

      {/* ===================== Portfolio List ===================== */}
      <motion.div className="glass bento-tile" style={{ padding: 22 }}>
        <div
          className="bt-header"
          style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap',
          }}
        >
          <h3 className="heading-accent" style={{ margin: 0 }}>
            {tr('portfolio_items', 'Portfolio Assets & Liabilities')}
          </h3>
        </div>

        {/* ── Search / sort / filter toolbar ── */}
        <div
          style={{
            display: 'flex', gap: 8, flexWrap: 'wrap',
            alignItems: 'center', marginBottom: 16,
          }}
          role="search"
          aria-label={tr('search_portfolio', 'Search portfolio')}
        >
          {/* Original search input with flex: '1 1 200px' without maxWidth, causing stretched input and active filter pill overlap glitch (Image 2):
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search
              size={14}
              aria-hidden
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('search_portfolio_placeholder', 'Search name, symbol, note…')}
              aria-label={tr('search_portfolio', 'Search portfolio')}
              style={{ width: '100%', paddingLeft: 32, fontSize: '0.85rem' }}
            />
          </div>
          */}
          {/* ── Search input (fixed max width) ── */}
          <div style={{ position: 'relative', flex: '0 1 280px', minWidth: 200, maxWidth: 320 }}>
            <Search
              size={14}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('search_portfolio_placeholder', 'Search name, symbol, note…')}
              aria-label={tr('search_portfolio', 'Search portfolio')}
              style={{
                width: '100%',
                paddingLeft: 34,
                paddingRight: search ? 30 : 12,
                height: 36,
                borderRadius: 9999,
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-card)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {/* ── Clear search ── */}
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={tr('clear_search', 'Clear search')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 4,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* ── Class filter pills ── */}
          <div
            role="group"
            aria-label={tr('filter_by_class', 'Filter by class')}
            style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
          >
            <button
              type="button"
              className={`gcf-pill ${classFilter === 'all' ? 'active' : ''}`}
              onClick={() => setClassFilter('all')}
              aria-pressed={classFilter === 'all'}
            >
              {tr('all', 'All')} ({liveItems.length})
            </button>
            {ASSET_CLASSES.map((cls) => {
              const count = liveItems.filter((i) => i.asset_class === cls).length;
              if (count === 0) return null;
              return (
                <button
                  key={cls}
                  type="button"
                  className={`gcf-pill ${classFilter === cls ? 'active' : ''}`}
                  onClick={() => setClassFilter(cls)}
                  aria-pressed={classFilter === cls}
                >
                  {CLASS_SHORT[cls]} ({count})
                </button>
              );
            })}
          </div>

          {/* ── Sort selector ── */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label={tr('sort_by', 'Sort by')}
            style={{ fontSize: '0.85rem' }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {tr(o.labelKey, o.fallback)}
              </option>
            ))}
          </select>
        </div>

        {/* ── Keyboard hint ── */}
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right', marginBottom: 8 }}>
          <Keyboard size={11} aria-hidden /> {tr('shortcuts', 'Press / to search, N for new')}
        </div>

        {/* ── Empty / no-match / list branches ── */}
        {liveItems.length === 0 ? (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Briefcase size={40} style={{ margin: '0 auto 10px', opacity: 0.3 }} aria-hidden />
            <p>{tr('portfolio_empty', 'Your portfolio is empty. Add your first asset or debt.')}</p>
            <button type="button" className="btn-primary" onClick={openAdd} style={{ marginTop: 10 }}>
              <Plus size={14} aria-hidden /> {tr('add_first_entry', 'Add First Entry')}
            </button>
          </div>
        ) : filteredSortedItems.length === 0 ? (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Filter size={40} style={{ margin: '0 auto 10px', opacity: 0.3 }} aria-hidden />
            <p>{tr('no_matches', 'No items match your search.')}</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setSearch(''); setClassFilter('all'); }}
              style={{ marginTop: 10 }}
            >
              {tr('clear_filters', 'Clear filters')}
            </button>
          </div>
        ) : (
          <div role="list">
            {filteredSortedItems.map((item) => {
              const id = getId(item);
              const val = safeNumber(item.current_value ?? item.base_value, 0);
              const isLiability = item.asset_class === 'liability';
              return (
                <div
                  key={id}
                  role="listitem"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', borderBottom: '1px solid var(--glass-border)',
                    flexWrap: 'wrap', gap: 8,
                  }}
                >
                  {/* ── Item info column ── */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2, flexWrap: 'wrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="badge" style={{ background: 'var(--glass-2)' }}>
                        {CLASS_LABELS[item.asset_class] || item.asset_class}
                      </span>
                      {item.symbol && (
                        <span style={{ color: '#3b82f6', fontWeight: 600 }}>
                          {item.symbol} {item.quantity ? `× ${item.quantity}` : ''}
                        </span>
                      )}
                      {isLiability && item.interest_rate != null && (
                        <span style={{ color: 'var(--danger)' }}>
                          {item.interest_rate}% {tr('interest', 'interest')}
                        </span>
                      )}
                      {item.note && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          · {item.note}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Value + actions column ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        fontWeight: 800, fontSize: '1.05rem',
                        color: isLiability ? 'var(--danger)' : 'var(--brand-primary)',
                      }}
                    >
                      {isLiability ? '-' : ''}{fmt(val)}
                    </div>
                    {/* ── Edit ── */}
                    <button
                      type="button"
                      className="del-btn"
                      onClick={() => openEdit(item)}
                      aria-label={`${tr('edit', 'Edit')} ${item.name}`}
                      title={tr('edit', 'Edit')}
                    >
                      <Edit3 size={15} aria-hidden />
                    </button>
                    {/* ── Delete ── */}
                    <button
                      type="button"
                      className="del-btn"
                      onClick={() => setItemToDelete(id)}
                      aria-label={`${tr('delete', 'Delete')} ${item.name}`}
                      title={tr('delete', 'Delete')}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* ===================== Add / Edit Modal ===================== */}
      <Modal
        isOpen={isAddingItem || editingItem !== null}
        onClose={isSubmitting ? null : closeFormModal}
        title={editingItem
          ? `✏️ ${tr('edit', 'Edit')} ${editingItem.name}`
          : `💎 ${tr('add_entry_title', 'Add Wealth Portfolio Entry')}`}
        confirmText={editingItem ? tr('update', 'Update Entry') : tr('save', 'Save Entry')}
        onConfirm={handleSaveItem}
        isLoading={isSubmitting}
      >
        {/* ── Name ── */}
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label htmlFor="wealth_name">{tr('name_required', 'Name *')}</label>
          <input
            id="wealth_name"
            value={formData.name}
            onChange={(e) => { setFormData({ ...formData, name: e.target.value }); clearError(); }}
            placeholder={tr('name_placeholder', 'e.g. HDFC FD, S&P 500 ETF, Home Mortgage')}
            autoFocus
            maxLength={100}
            aria-required="true"
          />
        </div>

        {/* ── Class + value ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="form-group">
            <label htmlFor="wealth_class">{tr('asset_class', 'Asset Category')}</label>
            <select
              id="wealth_class"
              value={formData.asset_class}
              onChange={(e) => { setFormData({ ...formData, asset_class: e.target.value }); clearError(); }}
              style={{ width: '100%' }}
            >
              {ASSET_CLASSES.map((cls) => (
                <option key={cls} value={cls}>{CLASS_LABELS[cls]}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="wealth_value">
              {formData.asset_class === 'liability'
                ? tr('principal_owed', 'Principal Owed *')
                : tr('base_value', 'Base Valuation *')}
            </label>
            <input
              id="wealth_value"
              type="number"
              min="0.01"
              step="0.01"
              value={formData.base_value}
              onChange={(e) => { setFormData({ ...formData, base_value: e.target.value }); clearError(); }}
              placeholder="0.00"
              inputMode="decimal"
              aria-required="true"
            />
          </div>
        </div>

        {/* ── Liquid-asset extras: symbol + quantity ── */}
        {formData.asset_class === 'liquid_asset' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label htmlFor="wealth_symbol">{tr('ticker_symbol', 'Ticker Symbol')}</label>
              <input
                id="wealth_symbol"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase().slice(0, MAX_SYMBOL_LENGTH) })}
                placeholder="AAPL, BTC, INFY"
                maxLength={MAX_SYMBOL_LENGTH}
              />
            </div>
            <div className="form-group">
              <label htmlFor="wealth_qty">{tr('quantity', 'Quantity / Units')}</label>
              <input
                id="wealth_qty"
                type="number"
                min="0"
                step="0.0001"
                value={formData.quantity}
                onChange={(e) => { setFormData({ ...formData, quantity: e.target.value }); clearError(); }}
                placeholder="e.g. 10"
                inputMode="decimal"
              />
            </div>
          </div>
        )}

        {/* ── Liability extra: interest rate ── */}
        {formData.asset_class === 'liability' && (
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label htmlFor="wealth_rate">{tr('interest_rate', 'Annual Interest Rate (%)')}</label>
            <input
              id="wealth_rate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.interest_rate}
              onChange={(e) => { setFormData({ ...formData, interest_rate: e.target.value }); clearError(); }}
              placeholder="e.g. 8.5"
              inputMode="decimal"
            />
          </div>
        )}

        {/* ── Acquisition date + note ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="form-group">
            <label htmlFor="wealth_date">{tr('acquisition_date', 'Acquisition Date')}</label>
            <input
              id="wealth_date"
              type="date"
              value={formData.acquisition_date}
              onChange={(e) => setFormData({ ...formData, acquisition_date: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="wealth_note">
              {tr('note', 'Note')} <span className="form-label-hint">({tr('optional', 'optional')})</span>
            </label>
            <input
              id="wealth_note"
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value.slice(0, MAX_NOTE_LENGTH) })}
              placeholder={tr('note_placeholder', 'e.g. Bought at discount')}
              maxLength={MAX_NOTE_LENGTH}
            />
          </div>
        </div>

        {/* ── Form error ── */}
        {formError && (
          <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
            <AlertOctagon size={14} aria-hidden /> {formError}
          </p>
        )}
      </Modal>

      {/* ===================== Delete Modal ===================== */}
      <Modal
        isOpen={itemToDelete !== null}
        onClose={isDeleting ? null : () => setItemToDelete(null)}
        title={tr('delete_item', 'Delete Entry?')}
        confirmText={tr('delete', 'Delete')}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
          {tr('delete_item_confirm', 'Permanently remove')}{' '}
          <strong>{liveItems.find((i) => getId(i) === String(itemToDelete))?.name || tr('this_entry', 'this entry')}</strong>{' '}
          {tr('from_portfolio', 'from your portfolio?')}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {tr('delete_item_hint', `You can undo for ${Math.floor(UNDO_TIMEOUT_MS / 1000)} seconds.`)}
        </p>
      </Modal>

      {/* ===================== Undo Bar ===================== */}
      <AnimatePresence>
        {undoState && (
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
            <span style={{ fontSize: '0.88rem' }}>{undoState.label}</span>
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
              onClick={() => setUndoState(null)}
              aria-label={tr('dismiss', 'Dismiss')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}