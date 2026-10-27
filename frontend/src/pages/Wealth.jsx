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
  useState, useEffect, useCallback, useMemo, useRef, useId,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FixedSizeList } from '../components/FixedSizeList';
import debounce from 'lodash.debounce';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts';
import {
  Briefcase, AlertOctagon, Sparkles, RefreshCw, Plus, X, Trash2,
  Edit3, ShieldAlert, Calculator, DollarSign, Download, FileText,
  Search, ArrowUpDown, Undo2, Copy, Keyboard, TrendingUp, TrendingDown,
  Loader2, Filter, ChevronDown, CheckCircle2, Sliders, Target, RotateCcw,
} from 'lucide-react';
import { useAppState, useAppActions } from '../contexts/AppContext';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';
import { api } from '../services/api';
import { rafThrottle } from '../utils/performanceOptimizer';
import {
  convertCurrency,
  readCachedRatesToInr,
  getFallbackRatesToInr,
  resolveCurrency,
} from '../utils/currencyRates';

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

// ── Clean and parse number input with support for Indian (1,00,000) and European (1.234,56) formatting ──
const cleanNumberInput = (raw) => {
  let val = String(raw || '').trim();
  if (!val) return '';
  // Indian or standard comma thousands separators: e.g. 1,00,000 or 100,000.50
  if (/^\d{1,3}(,\d{2,3})+(\.\d+)?$/.test(val)) {
    return val.replace(/,/g, '');
  }
  // European format: 1.234,56
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(val)) {
    return val.replace(/\./g, '').replace(',', '.');
  }
  // Single comma used as decimal separator: 100,50
  if (/^\d+,\d+$/.test(val)) {
    return val.replace(',', '.');
  }
  return val.replace(/,/g, '');
};

// ── True when the item is not soft-deleted and not sold ──
const isLiveItem = (item) =>
  item &&
  typeof item === 'object' &&
  item.is_deleted !== true &&
  item.is_deleted !== 'true' &&
  !item.sold_at;

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
  // ── App context: formatter, auth token, i18n, theme, logout, user, currency ──
  const { token, theme, user, currency: userCurrency, currencyInfo } = useAppState();
  const { fmt, t, logout } = useAppActions();
  const { showToast } = useToast();

  const [fxRatesToInr] = useState(() => readCachedRatesToInr() || getFallbackRatesToInr());
  const activeCurrency = resolveCurrency(userCurrency || user?.currency || 'INR');

  const uniqueId = useId().replace(/:/g, '');
  const nwGradId = `nwGrad-${uniqueId}`;

  // ── Translation helper with inline fallback ──
  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  // ── Convert an item's current/base valuation to active display currency ──
  const getItemDisplayValue = useCallback((item) => {
    const rawVal = safeNumber(item?.current_value ?? item?.base_value, 0);
    const itemCurrency = resolveCurrency(item?.currency || user?.currency || activeCurrency || 'INR');
    return convertCurrency(rawVal, itemCurrency, activeCurrency, fxRatesToInr) ?? rawVal;
  }, [user?.currency, activeCurrency, fxRatesToInr]);

  // ── Convert an item's acquisition cost basis to active display currency ──
  const getItemCostBasis = useCallback((item) => {
    const rawVal = safeNumber(item?.base_value, 0);
    const itemCurrency = resolveCurrency(item?.currency || user?.currency || activeCurrency || 'INR');
    return convertCurrency(rawVal, itemCurrency, activeCurrency, fxRatesToInr) ?? rawVal;
  }, [user?.currency, activeCurrency, fxRatesToInr]);

  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(onChange);
      return () => media.removeListener(onChange);
    }
  }, []);

  // ── Dark theme detection for chart strokes and tooltips ──
  const isDark = useMemo(() => {
    const norm = String(theme || '').toLowerCase();
    if (norm === 'auto') return systemDark;
    const themes = new Set(['amoled', 'dark', 'midnight', 'black']);
    return themes.has(norm);
  }, [theme, systemDark]);

  // ── Stable timestamp for holding period calculations ──
  const [nowTimestamp] = useState(() => Date.now());

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

  // ── Dynamic Mobile Viewport & Virtual Keypad Height Tracking for Modal ──
  const isFormModalOpen = isAddingItem || editingItem !== null;
  useEffect(() => {
    if (!isFormModalOpen || typeof window === 'undefined') return undefined;

    const updateViewportBounds = rafThrottle(() => {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      const offsetTop = vv ? vv.offsetTop : 0;
      document.documentElement.style.setProperty('--tx-modal-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--tx-modal-viewport-offset-top', `${offsetTop}px`);
    });

    updateViewportBounds();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateViewportBounds);
      vv.addEventListener('scroll', updateViewportBounds);
    }
    return () => {
      updateViewportBounds.cancel();
      if (vv) {
        vv.removeEventListener('resize', updateViewportBounds);
        vv.removeEventListener('scroll', updateViewportBounds);
      }
      document.documentElement.style.removeProperty('--tx-modal-viewport-height');
      document.documentElement.style.removeProperty('--tx-modal-viewport-offset-top');
    };
  }, [isFormModalOpen]);

  /* ---------------- UI State: search, filter, sort ---------------- */

  const prefersReducedMotion = usePrefersReducedMotion();

  // ── List controls ──
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const debouncedSetSearch = useMemo(
    () => debounce((val) => setSearch(val), 300),
    []
  );

  useEffect(() => {
    return () => {
      debouncedSetSearch.cancel();
    };
  }, [debouncedSetSearch]);

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    debouncedSetSearch(val);
  }, [debouncedSetSearch]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setSearch('');
    debouncedSetSearch.cancel();
  }, [debouncedSetSearch]);

  const [classFilter, setClassFilter] = useState('all');
  const [sortBy, setSortBy] = useState('value_desc');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportDropdownRef = useRef(null);

  // ── Close export dropdown on outside click ──
  useEffect(() => {
    if (!showExportMenu) return;
    const handleOutsideClick = (e) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showExportMenu]);


  /* ---------------- Debt Simulator State ---------------- */

  // ── Target debt and payment inputs ──
  const [selectedDebtId, setSelectedDebtId] = useState('');
  const [extraPayment, setExtraPayment] = useState(2000);
  const [monthlyBasePayment, setMonthlyBasePayment] = useState(5000);

  /* ---------------- Scenario Simulator State ("What If") ---------------- */
  const [marketShockPct, setMarketShockPct] = useState(0);
  const [fxShiftPct, setFxShiftPct] = useState(0);
  const [simMonthlySip, setSimMonthlySip] = useState(0);
  const [simSipYears, setSimSipYears] = useState(5);
  const [simZeroDebt, setSimZeroDebt] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  const handleResetScenario = useCallback(() => {
    setMarketShockPct(0);
    setFxShiftPct(0);
    setSimMonthlySip(0);
    setSimSipYears(5);
    setSimZeroDebt(false);
  }, []);

  /* ---------------- Target Allocation & Drift State ---------------- */
  const [allocationView, setAllocationView] = useState('chart'); // 'chart' | 'drift'
  const [isEditingTargets, setIsEditingTargets] = useState(false);
  const [targetAllocation, setTargetAllocation] = useState(() => {
    try {
      const saved = localStorage.getItem('mycoinwise_target_allocation');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
      }
    } catch {
      // ignore JSON parse error and fallback
    }
    return { liquid_asset: 40, illiquid_asset: 30, business_equity: 15, retirement: 15 };
  });

  const handleUpdateTarget = useCallback((cls, raw) => {
    const val = Math.max(0, Math.min(100, safeNumber(raw, 0)));
    setTargetAllocation((prev) => {
      const updated = { ...prev, [cls]: val };
      try {
        localStorage.setItem('mycoinwise_target_allocation', JSON.stringify(updated));
      } catch {
        // ignore storage error
      }
      return updated;
    });
  }, []);

  const handleResetTargets = useCallback(() => {
    const defaults = { liquid_asset: 40, illiquid_asset: 30, business_equity: 15, retirement: 15 };
    setTargetAllocation(defaults);
    try {
      localStorage.setItem('mycoinwise_target_allocation', JSON.stringify(defaults));
    } catch {
      // ignore storage error
    }
  }, []);

  /* ---------------- Undo State ---------------- */

  // ── Undo toast + auto-dismiss timer ──
  const [undoState, setUndoState] = useState(null);
  const undoTimerRef = useRef(null);

  /* ---------------- Refs ---------------- */

  // ── AI throttle refs + search input ref + mounted ref ──
  const aiTriggerKey = useRef('');
  const aiCooldown = useRef(0);
  const searchRef = useRef(null);
  const isMountedRef = useRef(true);

  // ── Track mounted state and clear pending undo timer on unmount ──
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
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
      if (isMountedRef.current) {
        setWealthItems(Array.isArray(itemsRes) ? itemsRes : (itemsRes?.data || []));
        setHistoryData(formatHistoryData(Array.isArray(histRes) ? histRes : (histRes?.data || [])));
      }
    } catch (err) {
      if (!isMountedRef.current) return;
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
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [token, showToast, tr, logout]);

  // ── Fetch on mount / when the token becomes available ──
  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive && token) {
        await fetchWealthData();
      }
    })();
    return () => { alive = false; };
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
    let totalCostBasis = 0;
    let liquid = 0;
    let physical = 0;
    const toxic = [];
    const liabList = [];
    const classTotals = {};

    for (const item of liveItems) {
      const val = getItemDisplayValue(item);
      const absVal = Math.abs(val);
      if (item.asset_class === 'liability') {
        totalLiabilities += absVal;
        const debt = { ...item, computedValue: absVal };
        liabList.push(debt);
        if (safeNumber(item.interest_rate, 0) > 12) toxic.push(debt);
      } else {
        totalAssets += val;
        totalCostBasis += getItemCostBasis(item);
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
    const totalUnrealizedGain = totalAssets - totalCostBasis;
    const totalReturnPct = totalCostBasis > 0 ? (totalUnrealizedGain / totalCostBasis) * 100 : 0;

    return {
      totalAssets,
      totalLiabilities,
      totalCostBasis,
      totalUnrealizedGain,
      totalReturnPct,
      netWorth: totalAssets - totalLiabilities,
      liquidAssets: liquid,
      physicalAssets: physical,
      classTotals,
      assetAllocationData: allocation,
      liabilitiesList: liabList,
      toxicDebts: toxic,
      hasHighInterestDebts: toxic.length > 0,
      debtToAssetRatio: dta,
    };
  }, [liveItems, getItemDisplayValue, getItemCostBasis]);

  /* ---------------- Scenario Simulator Math ("What If") ---------------- */
  const scenarioResults = useMemo(() => {
    let simAssets = 0;
    let simLiabilities = 0;

    for (const item of liveItems) {
      const val = getItemDisplayValue(item);
      const absVal = Math.abs(val);
      if (item.asset_class === 'liability') {
        if (!simZeroDebt) {
          simLiabilities += absVal;
        }
      } else {
        let adjVal = val;
        // Market shock affects liquid assets & business equity
        if (item.asset_class === 'liquid_asset' || item.asset_class === 'business_equity') {
          adjVal *= (1 + marketShockPct / 100);
        }
        // FX shift affects foreign currency items
        const itemCurrency = resolveCurrency(item?.currency || user?.currency || activeCurrency || 'INR');
        if (itemCurrency !== activeCurrency) {
          adjVal *= (1 + fxShiftPct / 100);
        }
        simAssets += Math.max(0, adjVal);
      }
    }

    // Future SIP compound value (historical ~8% CAGR compounded monthly)
    const pmt = Math.max(0, safeNumber(simMonthlySip, 0));
    const r = 0.08 / 12;
    const n = Math.max(1, safeNumber(simSipYears, 5)) * 12;
    const futureSipVal = pmt > 0 ? pmt * ((Math.pow(1 + r, n) - 1) / r) : 0;
    const totalContributed = pmt * n;
    const sipInterestEarned = Math.max(0, futureSipVal - totalContributed);

    simAssets += futureSipVal;
    const simNetWorth = simAssets - simLiabilities;
    const currentNetWorth = metrics.netWorth;
    const delta = simNetWorth - currentNetWorth;
    const deltaPct = currentNetWorth !== 0 ? (delta / Math.abs(currentNetWorth)) * 100 : 0;
    const hasActiveScenario = marketShockPct !== 0 || fxShiftPct !== 0 || simMonthlySip > 0 || simZeroDebt;

    return {
      simAssets,
      simLiabilities,
      simNetWorth,
      delta,
      deltaPct,
      futureSipVal,
      totalContributed,
      sipInterestEarned,
      hasActiveScenario,
    };
  }, [
    liveItems, getItemDisplayValue, simZeroDebt, marketShockPct, fxShiftPct,
    user?.currency, activeCurrency, simMonthlySip, simSipYears, metrics.netWorth,
  ]);

  /* ---------------- Target Allocation & Drift Math ---------------- */
  const allocationDriftData = useMemo(() => {
    const totalAssets = metrics.totalAssets;
    const classes = ['liquid_asset', 'illiquid_asset', 'business_equity', 'retirement'];

    return classes.map((cls) => {
      const actualVal = metrics.classTotals?.[cls] || 0;
      const actualPct = totalAssets > 0 ? (actualVal / totalAssets) * 100 : 0;
      const targetPct = safeNumber(targetAllocation?.[cls], 0);
      const driftPct = actualPct - targetPct;
      const targetVal = totalAssets > 0 ? (targetPct / 100) * totalAssets : 0;
      const diffVal = actualVal - targetVal;

      let action = tr('balanced', 'Balanced (—)');
      let actionType = 'neutral';
      if (driftPct > 0.5) {
        action = `${tr('trim', 'Trim')} ${fmt(diffVal)}`;
        actionType = 'trim';
      } else if (driftPct < -0.5) {
        action = `${tr('allocate', 'Allocate')} ${fmt(Math.abs(diffVal))}`;
        actionType = 'buy';
      }

      return {
        cls,
        name: CLASS_SHORT[cls] || cls,
        fullName: CLASS_LABELS[cls] || cls,
        color: CLASS_COLORS[cls] || '#64748b',
        actualVal,
        actualPct,
        targetPct,
        driftPct,
        diffVal,
        action,
        actionType,
      };
    });
  }, [metrics.totalAssets, metrics.classTotals, targetAllocation, fmt, tr]);

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
    const value = (i) => getItemDisplayValue(i);
    const CLASS_ORDER = { liquid_asset: 0, illiquid_asset: 1, business_equity: 2, retirement: 3, liability: 4 };

    switch (sortBy) {
      case 'value_asc': copy.sort((a, b) => value(a) - value(b)); break;
      case 'name_asc': copy.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))); break;
      case 'class_asc': copy.sort((a, b) => (CLASS_ORDER[a.asset_class] ?? 99) - (CLASS_ORDER[b.asset_class] ?? 99)); break;
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
  }, [liveItems, classFilter, search, sortBy, getItemDisplayValue]);

  // ── Derived AI strategy string ──
  const displayedAiInsight = useMemo(() => {
    if (liveItems.length === 0 || !token) {
      return tr('ai_empty', 'Add assets and liabilities to unlock your AI wealth strategy.');
    }
    return aiInsight || tr('ai_empty', 'Add assets and liabilities to unlock your AI wealth strategy.');
  }, [liveItems.length, token, aiInsight, tr]);

  /* ============================================================
   * AI Insights
   * Debounced request throttled by payload equality + cooldown.
   * ============================================================ */
  useEffect(() => {
    if (liveItems.length === 0 || !token) {
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

    // Set synchronously to prevent burst races
    aiTriggerKey.current = newKey;
    aiCooldown.current = now;

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsAiLoading(true);
      try {
        const resData = api.getWealthAiInsights
          ? await api.getWealthAiInsights(payload)
          : null;
        const insightText =
          (typeof resData === 'string' ? resData : resData?.insight) ||
          tr('ai_default', 'Portfolio strategy active.');
        if (!cancelled) setAiInsight(insightText);
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
   * Accurately simulates payoff with user's chosen payment without
   * artificially overriding inputs, and surfaces low payment alerts.
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

    // The user's actual base payment
    const userBasePay = safeNumber(monthlyBasePayment, 0);
    const baseCoversInterest = userBasePay > monthlyInterestAtStart;

    // ── Month-by-month simulation with safety cap ──
    const simulate = (payment) => {
      if (payment <= monthlyInterestAtStart) {
        return {
          months: MAX_DEBT_MONTHS,
          interest: principal * monthlyRate * MAX_DEBT_MONTHS,
          payoffReached: false,
        };
      }
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

    const basePay = userBasePay;
    const acceleratedPay = basePay + Math.max(0, safeNumber(extraPayment, 0));

    const base = simulate(basePay);
    const acc = simulate(acceleratedPay);

    return {
      debt,
      debtName: debt.name,
      principal,
      monthlyInterestAtStart,
      monthsBase: base.months,
      monthsAcc: acc.months,
      totalInterestBase: base.interest,
      totalInterestAcc: acc.interest,
      savedMonths: Math.max(0, base.months - acc.months),
      savedInterest: Math.max(0, base.interest - acc.interest),
      baseCoversInterest,
      baseReachedZero: base.payoffReached,
      accReachedZero: acc.payoffReached,
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
      acquisition_date: toLocalDateKey(item.acquisition_date) || '',
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

  // ── Row component for virtualized wealth portfolio list (>20 items) ──
  const VirtualizedWealthRow = useCallback(({ index, style }) => {
    const item = filteredSortedItems[index];
    if (!item) return null;
    const id = getId(item);
    const val = getItemDisplayValue(item);
    const isLiability = item.asset_class === 'liability';
    const costBasis = !isLiability ? getItemCostBasis(item) : 0;
    const gain = !isLiability ? val - costBasis : 0;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    const isGain = gain >= 0;
    const gainPrefix = isGain ? '+' : '';

    let holdingBadge = null;
    if (!isLiability && item.acquisition_date) {
      const acq = parseLocalDate(item.acquisition_date);
      if (acq) {
        const diffYears = (nowTimestamp - acq.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        holdingBadge = diffYears >= 1 ? tr('ltcg_badge', 'LTCG (>1y)') : tr('stcg_badge', 'STCG (<1y)');
      }
    }

    return (
      <div style={style}>
        <div
          key={id}
          role="listitem"
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderBottom: '1px solid var(--glass-border)',
            flexWrap: 'wrap', gap: 8, height: '100%', boxSizing: 'border-box',
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
              {holdingBadge && (
                <span
                  className="badge"
                  style={{
                    background: holdingBadge.includes('LTCG') ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)',
                    color: holdingBadge.includes('LTCG') ? 'var(--brand-primary)' : '#3b82f6',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    padding: '1px 6px',
                  }}
                >
                  {holdingBadge}
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
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontWeight: 800, fontSize: '1.05rem',
                  color: isLiability ? 'var(--danger)' : 'var(--brand-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {isLiability ? '-' : ''}{fmt(val)}
              </div>
              {!isLiability && costBasis > 0 && (
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontVariantNumeric: 'tabular-nums',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 6,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>
                    {tr('basis', 'Cost')}: {fmt(costBasis)}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: isGain ? 'var(--brand-primary)' : 'var(--danger)',
                    }}
                  >
                    {gainPrefix}{fmt(gain)} ({gainPrefix}{gainPct.toFixed(1)}%)
                  </span>
                </div>
              )}
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
      </div>
    );
  }, [filteredSortedItems, fmt, tr, openEdit, getItemDisplayValue, getItemCostBasis, nowTimestamp]);


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
        setFormError(tr('quantity_invalid', 'Quantity must be zero or more.')); return;
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
        if (editingItem.current_value_override != null) {
          payload.current_value_override = editingItem.current_value_override;
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

      // Arm undo before awaiting refetch so that undo is preserved even if network hiccups
      const snapshot = {
        name: item.name,
        asset_class: item.asset_class,
        base_value: item.base_value,
        current_value_override: item.current_value_override ?? (item.current_value !== item.base_value ? item.current_value : undefined),
        symbol: item.symbol,
        quantity: item.quantity,
        interest_rate: item.interest_rate,
        acquisition_date: toLocalDateKey(item.acquisition_date),
        note: item.note,
      };
      armUndo(tr('item_deleted', 'Entry deleted'), async () => {
        await api.createWealthItem(snapshot);
      });

      setItemToDelete(null);
      showToast('success', tr('item_deleted', 'Entry deleted'));
      await fetchWealthData();
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
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          user || { username: 'Wealth Portfolio', name: 'Wealth Portfolio' },
          liveItems.map((i) => ({
            date: i.acquisition_date,
            category: CLASS_SHORT[i.asset_class] || i.asset_class,
            type: i.asset_class === 'liability' ? 'expense' : 'income',
            amount: getItemDisplayValue(i),
            note: i.name,
          })),
          currencyInfo || null,
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
  }, [liveItems, isExportingPDF, showToast, tr, user, currencyInfo, getItemDisplayValue]);

  // ── Copy a plain-text portfolio summary to the clipboard ──
  const copyPortfolioSummary = useCallback(async () => {
    const summary = [
      `${tr('net_worth', 'Net Worth')}: ${fmt(metrics.netWorth)}`,
      `${tr('assets', 'Assets')}: ${fmt(metrics.totalAssets)}`,
      `${tr('liabilities', 'Liabilities')}: ${fmt(metrics.totalLiabilities)}`,
      `${tr('unrealized_pnl', 'Unrealized P&L')}: ${metrics.totalUnrealizedGain >= 0 ? '+' : ''}${fmt(metrics.totalUnrealizedGain)} (${metrics.totalReturnPct >= 0 ? '+' : ''}${metrics.totalReturnPct.toFixed(1)}%)`,
      `${tr('debt_to_asset', 'Debt-to-Asset')}: ${(metrics.debtToAssetRatio * 100).toFixed(1)}%`,
      `${tr('items_count', 'Items')}: ${liveItems.length}`,
    ].join('\n');
    try {
      setShowExportMenu(false);
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
      } else if (e.key === 'Escape' && (searchInput || search)) {
        handleClearSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openAdd, searchInput, search, handleClearSearch]);

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

      {/* ===================== Header ===================== */}
      <header className="masonry-header island-header glass-sm">
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
          <div ref={exportDropdownRef} className="dropdown-container" style={{ position: 'relative' }}>
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
      </header>

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
        aria-label={`${tr('net_worth', 'Total Net Worth')}: ${fmt(metrics.netWorth)}, ${tr('unrealized_pnl', 'Unrealized P&L')}: ${metrics.totalUnrealizedGain >= 0 ? '+' : ''}${fmt(metrics.totalUnrealizedGain)}`}
        aria-live="polite"
      >
        <h3 style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.8rem', marginBottom: 8 }}>
          {tr('net_worth', 'Total Net Worth')}
        </h3>
        <div style={{ fontSize: 'clamp(2.4rem, 5vw, 3.4rem)', fontWeight: 900, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: nwColor }}>
          {fmt(metrics.netWorth)}
        </div>
        {/* ── Sub-stats: assets, liabilities, unrealized P&L, debt-to-asset ── */}
        <div className="wealth-substats" style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{tr('assets', 'Assets')}</div>
            <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingUp size={14} aria-hidden /> {fmt(metrics.totalAssets)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{tr('liabilities', 'Liabilities')}</div>
            <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingDown size={14} aria-hidden /> -{fmt(metrics.totalLiabilities)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{tr('unrealized_pnl', 'Unrealized P&L')}</div>
            <div
              style={{
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: metrics.totalUnrealizedGain >= 0 ? 'var(--brand-primary)' : 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {metrics.totalUnrealizedGain >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
              {metrics.totalUnrealizedGain >= 0 ? '+' : ''}{fmt(metrics.totalUnrealizedGain)} ({metrics.totalReturnPct >= 0 ? '+' : ''}{metrics.totalReturnPct.toFixed(1)}%)
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{tr('debt_to_asset', 'Debt-to-Asset')}</div>
            <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: metrics.debtToAssetRatio > 0.5 ? 'var(--warning)' : 'var(--brand-primary)' }}>
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
          {isAiLoading ? tr('analyzing', 'Analyzing portfolio…') : displayedAiInsight}
        </p>
      </motion.div>

      {/* ===================== Charts ===================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>
        {/* ── Net worth trajectory ── */}
        <motion.div className="glass bento-tile" style={{ padding: 20 }}>
          <h3 className="heading-accent" style={{ fontSize: '0.95rem', marginBottom: 12 }}>{tr('net_worth_trajectory', 'Net Worth Trajectory')}</h3>
          <div style={{ height: 220, minHeight: 220 }}>
            {historyData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={200} debounce={50} initialDimension={{ width: 320, height: 240 }}>
                <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={nwGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                  <Tooltip contentStyle={{ background: 'var(--surface-1)', borderRadius: 10 }} formatter={(v) => fmt(v)} />
                  <Area isAnimationActive={!prefersReducedMotion} type="monotone" dataKey="netWorth" stroke="#10b981" fill={`url(#${nwGradId})`} strokeWidth={2} name={tr('net_worth', 'Net Worth')} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex-center" style={{ height: '100%', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                {tr('no_history', 'Historical snapshots will appear here as your wealth updates over time.')}
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Asset allocation pie & target drift ── */}
        <motion.div className="glass bento-tile" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h3 className="heading-accent" style={{ fontSize: '0.95rem', margin: 0 }}>
              {allocationView === 'chart' ? tr('asset_allocation', 'Asset Allocation') : tr('target_allocation_drift', 'Target Allocation & Drift')}
            </h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ display: 'inline-flex', background: 'var(--glass-2)', borderRadius: 8, padding: 2 }}>
                <button
                  type="button"
                  onClick={() => setAllocationView('chart')}
                  style={{
                    padding: '3px 8px', fontSize: '0.72rem', border: 'none', borderRadius: 6, cursor: 'pointer',
                    background: allocationView === 'chart' ? 'var(--brand-primary)' : 'transparent',
                    color: allocationView === 'chart' ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 600,
                  }}
                  title={tr('pie_view', 'Pie View')}
                >
                  {tr('chart', 'Chart')}
                </button>
                <button
                  type="button"
                  onClick={() => setAllocationView('drift')}
                  style={{
                    padding: '3px 8px', fontSize: '0.72rem', border: 'none', borderRadius: 6, cursor: 'pointer',
                    background: allocationView === 'drift' ? 'var(--brand-primary)' : 'transparent',
                    color: allocationView === 'drift' ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  title={tr('drift_view', 'Target & Drift')}
                >
                  <Target size={12} aria-hidden />
                  {tr('drift', 'Drift')}
                </button>
              </div>

              {allocationView === 'drift' && (
                <button
                  type="button"
                  onClick={() => setIsEditingTargets((prev) => !prev)}
                  className="btn-secondary"
                  style={{ padding: '3px 8px', fontSize: '0.7rem', height: 'auto', borderRadius: 6 }}
                  title={tr('configure_targets', 'Configure Targets')}
                >
                  {isEditingTargets ? tr('done', 'Done') : tr('targets_btn', 'Targets')}
                </button>
              )}
            </div>
          </div>

          {allocationView === 'chart' ? (
            <div style={{ height: 220, minHeight: 220, position: 'relative' }}>
              {metrics.assetAllocationData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={200} debounce={50} initialDimension={{ width: 320, height: 240 }}>
                  <PieChart>
                    <Pie isAnimationActive={!prefersReducedMotion} data={metrics.assetAllocationData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
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
          ) : (
            <div style={{ minHeight: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isEditingTargets && (
                <div style={{ padding: '8px 10px', background: 'var(--glass-2)', borderRadius: 8, fontSize: '0.75rem', marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tr('set_target_allocations', 'Target Allocations (%)')}</span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: allocationDriftData.reduce((s, r) => s + r.targetPct, 0) === 100 ? 'var(--brand-primary)' : 'var(--warning)',
                        }}
                      >
                        Total: {allocationDriftData.reduce((s, r) => s + r.targetPct, 0)}%
                      </span>
                    </div>
                    <button type="button" onClick={handleResetTargets} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem' }}>
                      {tr('reset_defaults', 'Reset Defaults')}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 6 }}>
                    {allocationDriftData.map((row) => (
                      <div key={`target-input-${row.cls}`}>
                        <label htmlFor={`target_input_${row.cls}`} style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>{row.name}</label>
                        <input
                          id={`target_input_${row.cls}`}
                          type="number"
                          min="0"
                          max="100"
                          value={targetAllocation[row.cls] ?? 0}
                          onChange={(e) => handleUpdateTarget(row.cls, e.target.value)}
                          style={{ width: '100%', padding: '2px 6px', fontSize: '0.75rem', borderRadius: 6 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.74rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                      <th style={{ padding: '4px 6px' }}>{tr('class', 'Class')}</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>{tr('actual', 'Actual')}</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>{tr('target', 'Target')}</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>{tr('drift', 'Drift')}</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>{tr('rebalance_action', 'Action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationDriftData.map((row) => {
                      const isOverweight = row.driftPct > 0.5;
                      const isUnderweight = row.driftPct < -0.5;
                      const driftColor = isOverweight ? 'var(--warning)' : isUnderweight ? '#3b82f6' : 'var(--text-muted)';
                      return (
                        <tr key={row.cls} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          <td style={{ padding: '5px 6px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, display: 'inline-block' }} />
                            {row.name}
                          </td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {row.actualPct.toFixed(1)}%
                          </td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                            {row.targetPct.toFixed(0)}%
                          </td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: driftColor }}>
                            {row.driftPct >= 0 ? `+${row.driftPct.toFixed(1)}%` : `${row.driftPct.toFixed(1)}%`}
                          </td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                background: isOverweight ? 'rgba(245,158,11,0.1)' : isUnderweight ? 'rgba(59,130,246,0.1)' : 'transparent',
                                color: isOverweight ? 'var(--warning)' : isUnderweight ? '#3b82f6' : 'var(--text-muted)',
                              }}
                            >
                              {row.action}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ===================== Scenario Simulator ("What-If") ===================== */}
      <motion.div className="glass bento-tile" style={{ padding: 22, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', margin: 0 }}>
            <Sliders size={18} style={{ color: 'var(--brand-primary)' }} aria-hidden />
            {tr('scenario_simulator', 'Portfolio Scenario Simulator ("What-If")')}
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {scenarioResults.hasActiveScenario && (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetScenario}
                style={{ padding: '4px 10px', fontSize: '0.72rem', height: 'auto', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}
                title={tr('reset_scenario', 'Reset scenario to current baseline')}
              >
                <RotateCcw size={12} aria-hidden /> {tr('reset', 'Reset')}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsSimulatorOpen((prev) => !prev)}
              style={{ padding: '4px 10px', fontSize: '0.72rem', height: 'auto', borderRadius: 6 }}
            >
              {isSimulatorOpen ? tr('collapse', 'Collapse') : tr('expand_simulator', 'Simulate Scenarios')}
            </button>
          </div>
        </div>

        {/* ── Summary Comparison Bar (Always visible) ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            padding: '12px 16px',
            background: 'var(--glass-2)',
            borderRadius: 10,
            marginBottom: isSimulatorOpen ? 16 : 0,
          }}
        >
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{tr('baseline_net_worth', 'Current Net Worth')}</div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums', color: nwColor }}>
              {fmt(metrics.netWorth)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{tr('projected_net_worth', 'Projected Net Worth')}</div>
            <div
              style={{
                fontWeight: 800, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums',
                color: scenarioResults.simNetWorth >= metrics.netWorth ? 'var(--brand-primary)' : 'var(--danger)',
              }}
            >
              {fmt(scenarioResults.simNetWorth)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{tr('scenario_variance', 'Variance / Impact')}</div>
            <div
              style={{
                fontWeight: 800, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums',
                color: scenarioResults.delta >= 0 ? 'var(--brand-primary)' : 'var(--danger)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {scenarioResults.delta >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
              {scenarioResults.delta >= 0 ? '+' : ''}{fmt(scenarioResults.delta)} ({scenarioResults.deltaPct >= 0 ? '+' : ''}{scenarioResults.deltaPct.toFixed(1)}%)
            </div>
          </div>
        </div>

        {/* ── Expanded Controls ── */}
        <AnimatePresence>
          {isSimulatorOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 16 }}>
                {/* 1. Market Shock */}
                <div style={{ padding: 12, background: 'var(--surface-1)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label htmlFor="sim_market_shock" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {tr('market_shock', 'Market Shock / Rally')}
                    </label>
                    <span
                      style={{
                        fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: marketShockPct > 0 ? 'var(--brand-primary)' : marketShockPct < 0 ? 'var(--danger)' : 'var(--text-muted)',
                      }}
                    >
                      {marketShockPct > 0 ? `+${marketShockPct}%` : `${marketShockPct}%`}
                    </span>
                  </div>
                  <input
                    id="sim_market_shock"
                    type="range"
                    min="-50"
                    max="50"
                    step="5"
                    value={marketShockPct}
                    onChange={(e) => setMarketShockPct(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--brand-primary)' }}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {tr('market_shock_desc', 'Simulates equities & liquid assets price drop or rally.')}
                  </div>
                </div>

                {/* 2. FX Shift */}
                <div style={{ padding: 12, background: 'var(--surface-1)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label htmlFor="sim_fx_shift" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {tr('fx_shift', 'Foreign Currency Shift')}
                    </label>
                    <span
                      style={{
                        fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        color: fxShiftPct > 0 ? 'var(--brand-primary)' : fxShiftPct < 0 ? 'var(--danger)' : 'var(--text-muted)',
                      }}
                    >
                      {fxShiftPct > 0 ? `+${fxShiftPct}%` : `${fxShiftPct}%`}
                    </span>
                  </div>
                  <input
                    id="sim_fx_shift"
                    type="range"
                    min="-20"
                    max="20"
                    step="2"
                    value={fxShiftPct}
                    onChange={(e) => setFxShiftPct(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#3b82f6' }}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {tr('fx_shift_desc', 'Simulates exchange rate strengthening or devaluation.')}
                  </div>
                </div>

                {/* 3. Monthly SIP Addition */}
                <div style={{ padding: 12, background: 'var(--surface-1)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label htmlFor="sim_sip_amount" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {tr('systematic_investment', 'Monthly Investment')}
                    </label>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--brand-primary)' }}>
                      {fmt(simMonthlySip)} / mo
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      id="sim_sip_amount"
                      type="number"
                      min="0"
                      step="1000"
                      value={simMonthlySip}
                      onChange={(e) => setSimMonthlySip(Math.max(0, safeNumber(e.target.value, 0)))}
                      style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem', borderRadius: 6 }}
                      placeholder="e.g. 10000"
                    />
                    <select
                      id="sim_sip_years"
                      value={simSipYears}
                      onChange={(e) => setSimSipYears(Number(e.target.value))}
                      style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: 6 }}
                      aria-label={tr('sim_sip_years_label', 'Investment Horizon')}
                    >
                      <option value="1">1 yr</option>
                      <option value="3">3 yrs</option>
                      <option value="5">5 yrs</option>
                      <option value="10">10 yrs</option>
                    </select>
                  </div>
                  {simMonthlySip > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--brand-primary)', marginTop: 4 }}>
                      +{fmt(scenarioResults.futureSipVal)} in {simSipYears} yrs ({fmt(scenarioResults.sipInterestEarned)} interest @ 8% CAGR)
                    </div>
                  )}
                </div>

                {/* 4. Zero Debt Option */}
                <div style={{ padding: 12, background: 'var(--surface-1)', borderRadius: 10, border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={simZeroDebt}
                      onChange={(e) => setSimZeroDebt(e.target.checked)}
                      style={{ accentColor: 'var(--brand-primary)', width: 16, height: 16 }}
                    />
                    {tr('sim_zero_debt', '100% Debt-Free Simulation')}
                  </label>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, paddingLeft: 24 }}>
                    {tr('sim_zero_debt_desc', 'Eliminates all outstanding liabilities to preview pure net asset value.')}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

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

          {/* ── Unreachable 50-year payoff warning ── */}
          {debtPayoff.baseCoversInterest && !debtPayoff.baseReachedZero && (
            <div
              role="alert"
              style={{
                padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.3)', color: 'var(--warning)',
                fontSize: '0.82rem', marginBottom: 14,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <AlertOctagon size={16} aria-hidden />
              {tr('payoff_unreachable', 'At this payment rate, the debt amortizes too slowly to be cleared within 50 years. Consider a higher monthly payment.')}
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
              value={searchInput}
              onChange={handleSearchChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  handleClearSearch();
                }
              }}
              placeholder={tr('search_portfolio_placeholder', 'Search name, symbol, note…')}
              aria-label={tr('search_portfolio', 'Search portfolio')}
              style={{
                width: '100%',
                paddingLeft: 34,
                paddingRight: searchInput ? 30 : 12,
                height: 36,
                borderRadius: 9999,
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-card)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              enterKeyHint="search"
            />
            {/* ── Clear search ── */}
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
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
              onClick={() => { handleClearSearch(); setClassFilter('all'); }}
              style={{ marginTop: 10 }}
            >
              {tr('clear_filters', 'Clear filters')}
            </button>
          </div>
        ) : filteredSortedItems.length > 20 ? (
          <FixedSizeList
            height={Math.min(filteredSortedItems.length * 76, 550)}
            itemCount={filteredSortedItems.length}
            itemSize={76}
            width="100%"
          >
            {VirtualizedWealthRow}
          </FixedSizeList>
        ) : (
          <div role="list">
            {filteredSortedItems.map((item) => {
              const id = getId(item);
              const val = getItemDisplayValue(item);
              const isLiability = item.asset_class === 'liability';
              const costBasis = !isLiability ? getItemCostBasis(item) : 0;
              const gain = !isLiability ? val - costBasis : 0;
              const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
              const isGain = gain >= 0;
              const gainPrefix = isGain ? '+' : '';

              let holdingBadge = null;
              if (!isLiability && item.acquisition_date) {
                const acq = parseLocalDate(item.acquisition_date);
                if (acq) {
                  const diffYears = (nowTimestamp - acq.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                  holdingBadge = diffYears >= 1 ? tr('ltcg_badge', 'LTCG (>1y)') : tr('stcg_badge', 'STCG (<1y)');
                }
              }

              return (
                <div
                  key={id}
                  role="listitem"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: '1px solid var(--glass-border)',
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
                      {holdingBadge && (
                        <span
                          className="badge"
                          style={{
                            background: holdingBadge.includes('LTCG') ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)',
                            color: holdingBadge.includes('LTCG') ? 'var(--brand-primary)' : '#3b82f6',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            padding: '1px 6px',
                          }}
                        >
                          {holdingBadge}
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
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontWeight: 800, fontSize: '1.05rem',
                          color: isLiability ? 'var(--danger)' : 'var(--brand-primary)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {isLiability ? '-' : ''}{fmt(val)}
                      </div>
                      {!isLiability && costBasis > 0 && (
                        <div
                          style={{
                            fontSize: '0.72rem',
                            fontVariantNumeric: 'tabular-nums',
                            marginTop: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 6,
                          }}
                        >
                          <span style={{ color: 'var(--text-muted)' }}>
                            {tr('basis', 'Cost')}: {fmt(costBasis)}
                          </span>
                          <span
                            style={{
                              fontWeight: 700,
                              color: isGain ? 'var(--brand-primary)' : 'var(--danger)',
                            }}
                          >
                            {gainPrefix}{fmt(gain)} ({gainPrefix}{gainPct.toFixed(1)}%)
                          </span>
                        </div>
                      )}
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
        <div
          className="modal-form-scrollable"
          onFocusCapture={() => {
            if (typeof window !== 'undefined' && window.scrollY !== 0) {
              window.scrollTo({ top: 0, behavior: 'instant' });
            }
          }}
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
                type="text"
                value={formData.base_value}
                onChange={(e) => {
                  const clean = cleanNumberInput(e.target.value);
                  setFormData((prev) => ({ ...prev, base_value: clean }));
                  clearError();
                }}
                placeholder="0.00"
                aria-required="true"
                inputMode="decimal"
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
                  type="text"
                  value={formData.quantity}
                  onChange={(e) => {
                    const clean = cleanNumberInput(e.target.value);
                    setFormData((prev) => ({ ...prev, quantity: clean }));
                    clearError();
                  }}
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
                type="text"
                value={formData.interest_rate}
                onChange={(e) => {
                  const clean = cleanNumberInput(e.target.value);
                  setFormData((prev) => ({ ...prev, interest_rate: clean }));
                  clearError();
                }}
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
        </div>
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