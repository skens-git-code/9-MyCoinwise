import React, {
  useState, useContext, useMemo, useEffect, useRef, useCallback, useId,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid,
  XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts';
import {
  AlertTriangle, Target, Zap, BrainCircuit,
  CheckCircle, Sliders, Download, Layers,
  RotateCcw,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { useToast } from '../components/ToastProvider';
import { api } from '../services/api';
import {
  convertCurrency,
  fetchRatesToInr,
  getFallbackRatesToInr,
  readCachedRatesToInr,
  resolveCurrency,
} from '../utils/currencyRates';

/* ============================================================
 * Constants
 * ============================================================ */
const STORAGE_PREFIX = 'mcw-cf-';

const DEFAULT_STATE = {
  horizon: 90,
  showBaseline: false,
  scenarioType: 'oneTime',
  whatIfAmount: '',
  frequency: 'monthly',
  months: 6,
  startDay: 1,
  safety: 5000,
  critical: 2000,
};

const HORIZON_OPTIONS = [30, 60, 90, 180, 365];
const LOOKBACK_DAYS = 90;
const MAX_SCENARIO_START = 365;
const MAX_SCENARIO_MONTHS = 24;

/* ============================================================
 * Helpers
 * ============================================================ */
const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const readStoredNumber = (key, fallback, { min = -Infinity, max = Infinity } = {}) => {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  } catch {
    return fallback;
  }
};

const readStoredString = (key, fallback) => {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
};

const readStoredBool = (key, fallback) => {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return raw == null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
};

const writeStored = (key, value) => {
  try { localStorage.setItem(`${STORAGE_PREFIX}${key}`, String(value)); } catch { /* quota */ }
};

/** Locale-aware short date. */
const formatShortDate = (dateInput, locale) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
};

/** Locale-aware full date. */
const formatLongDate = (dateInput, locale) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale || undefined);
};

/** CSV escape + injection prevention. */
const escapeCsvField = (raw) => {
  const str = raw == null ? '' : String(raw);
  const needsPrefix = /^[=+\-@\t\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  const prefixed = needsPrefix ? `'${escaped}` : escaped;
  const needsQuotes = needsPrefix || /[",\n\r\t]/.test(prefixed);
  return needsQuotes ? `"${prefixed}"` : prefixed;
};

/** True only if the transaction should be counted. */
const isLiveTx = (tx) =>
  tx && typeof tx === 'object' && tx.is_deleted !== true;

/** True if the subscription is active on the given date. */
const isSubscriptionActiveOn = (sub, date) => {
  if (!sub) return false;
  if (sub.is_paused) return false;
  if (sub.cancelled_at) {
    const cancelled = new Date(sub.cancelled_at);
    if (!Number.isNaN(cancelled.getTime()) && cancelled <= date) return false;
  }
  if (sub.end_date) {
    const end = new Date(sub.end_date);
    if (!Number.isNaN(end.getTime()) && end < date) return false;
  }
  return true;
};

/**
 * Returns true if the subscription bills on this exact date.
 * Handles month-length edge cases (e.g. billing on the 31st in February).
 */
const subscriptionBillsOn = (sub, date) => {
  if (!isSubscriptionActiveOn(sub, date)) return false;

  const cycle = String(sub.cycle || '').toLowerCase();
  const anchor = sub.next_billing_date
    ? new Date(sub.next_billing_date)
    : sub.start_date
      ? new Date(sub.start_date)
      : null;
  if (!anchor || Number.isNaN(anchor.getTime())) return false;

  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  const anchorDay = anchor.getDate();
  const anchorMonth = anchor.getMonth();
  const anchorYear = anchor.getFullYear();

  // Last day of the target month — for billing on "the Nth day" fallback.
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  // Billing day for the target month is min(anchorDay, lastDayOfMonth).
  const effectiveDay = Math.min(anchorDay, lastDayOfMonth);

  switch (cycle) {
    case 'daily':
      return true;
    case 'weekly':
      return date.getDay() === anchor.getDay();
    case 'biweekly': {
      const diffDays = Math.round((date - anchor) / 86400000);
      return diffDays >= 0 && diffDays % 14 === 0;
    }
    case 'monthly':
      return day === effectiveDay;
    case 'quarterly': {
      if (day !== effectiveDay) return false;
      const monthsDiff =
        (year - anchorYear) * 12 + (month - anchorMonth);
      return monthsDiff >= 0 && monthsDiff % 3 === 0;
    }
    case 'yearly':
      return day === effectiveDay && month === anchorMonth;
    default:
      return false;
  }
};

/** A unique-but-stable ID for the SVG gradient, per instance. */
const useStableId = (prefix) => {
  const id = useId();
  return `${prefix}-${id.replace(/:/g, '')}`;
};

/* ============================================================
 * Custom dot
 * ============================================================ */
const CustomizedDot = ({ cx, cy, payload }) => {
  if (!payload) return null;
  if (payload.isCritical) {
    return (
      <circle
        cx={cx} cy={cy} r={5}
        fill="#dc2626" stroke="#fff" strokeWidth={1.5}
        filter="drop-shadow(0 0 6px rgba(220,38,38,0.85))"
      />
    );
  }
  if (payload.isDanger) {
    return (
      <circle
        cx={cx} cy={cy} r={4}
        fill="#f97316" stroke="#fff" strokeWidth={1.2}
        filter="drop-shadow(0 0 6px rgba(249,115,22,0.8))"
      />
    );
  }
  return null;
};

/* ============================================================
 * Component
 * ============================================================ */
export default function Cashflow() {
  const {
    transactions = [],
    subscriptions = [],
    accounts = [],
    currency = 'USD',
    fmt,
    t,
    token,
    theme,
    lang,
    loading,
  } = useContext(AppContext);
  const { showToast } = useToast();

  const locale = useMemo(() => {
    const map = { en: 'en-US', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN' };
    return map[lang] || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  }, [lang]);

  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);
  const displayCurrency = useMemo(() => resolveCurrency(currency, 'USD'), [currency]);

  const isDark = useMemo(() => {
    const themes = new Set(['amoled', 'dark', 'midnight', 'black']);
    return themes.has(String(theme || '').toLowerCase());
  }, [theme]);

  const [fxRatesToInr, setFxRatesToInr] = useState(() => (
    readCachedRatesToInr() || getFallbackRatesToInr()
  ));

  useEffect(() => {
    const controller = new AbortController();
    fetchRatesToInr(controller.signal)
      .then((rates) => setFxRatesToInr(rates))
      .catch(() => { /* Keep bundled rates while offline. */ });
    return () => controller.abort();
  }, []);

  const accountCurrencies = useMemo(() => {
    const result = new Map();
    for (const account of accounts) {
      if (account?.id || account?._id) {
        result.set(String(account.id || account._id), resolveCurrency(account.currency, displayCurrency));
      }
    }
    return result;
  }, [accounts, displayCurrency]);

  /* ---------------- State ---------------- */
  const [forecastHorizon, setForecastHorizon] = useState(() =>
    readStoredNumber('horizon', DEFAULT_STATE.horizon, { min: 7, max: 1095 })
  );
  const [showScenarioComparison, setShowScenarioComparison] = useState(() =>
    readStoredBool('show-baseline', DEFAULT_STATE.showBaseline)
  );
  const [scenarioType, setScenarioType] = useState(() =>
    readStoredString('type', DEFAULT_STATE.scenarioType)
  );
  const [whatIfAmount, setWhatIfAmount] = useState(() =>
    readStoredString('amt', DEFAULT_STATE.whatIfAmount)
  );
  const [scenarioFrequency, setScenarioFrequency] = useState(() =>
    readStoredString('freq', DEFAULT_STATE.frequency)
  );
  const [scenarioMonths, setScenarioMonths] = useState(() =>
    readStoredNumber('months', DEFAULT_STATE.months, { min: 1, max: MAX_SCENARIO_MONTHS })
  );
  const [scenarioStartDay, setScenarioStartDay] = useState(() =>
    readStoredNumber('start-day', DEFAULT_STATE.startDay, { min: 1, max: MAX_SCENARIO_START })
  );
  const [safetyThreshold, setSafetyThreshold] = useState(() =>
    readStoredNumber('safety', DEFAULT_STATE.safety, { min: 0, max: 10_000_000 })
  );
  const [criticalThreshold, setCriticalThreshold] = useState(() =>
    readStoredNumber('critical', DEFAULT_STATE.critical, { min: 0, max: 10_000_000 })
  );

  const [aiSummary, setAiSummary] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiTriggerRef = useRef('');

  const gradientId = useStableId('cashflow-gradient');
  const uncertaintyId = useStableId('cashflow-uncertainty');

  /* ---------------- Persist settings ---------------- */
  useEffect(() => {
    writeStored('horizon', forecastHorizon);
    writeStored('show-baseline', showScenarioComparison);
    writeStored('type', scenarioType);
    writeStored('amt', whatIfAmount);
    writeStored('freq', scenarioFrequency);
    writeStored('months', scenarioMonths);
    writeStored('start-day', scenarioStartDay);
    writeStored('safety', safetyThreshold);
    writeStored('critical', criticalThreshold);
  }, [
    forecastHorizon, showScenarioComparison, scenarioType, whatIfAmount,
    scenarioFrequency, scenarioMonths, scenarioStartDay,
    safetyThreshold, criticalThreshold,
  ]);

  /* ---------------- Live transactions ---------------- */
  const liveTransactions = useMemo(
    () => {
      if (!Array.isArray(transactions)) return [];
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      return transactions
        .filter(isLiveTx)
        .map((tx) => {
          const date = new Date(tx.date);
          if (Number.isNaN(date.getTime()) || date > endOfToday) return null;
          const sourceCurrency = resolveCurrency(
            tx.currency || accountCurrencies.get(String(tx.account_id || '')) || displayCurrency,
            displayCurrency
          );
          const displayAmount = convertCurrency(
            safeNumber(tx.amount, 0),
            sourceCurrency,
            displayCurrency,
            fxRatesToInr
          );
          return displayAmount === null ? null : { ...tx, displayAmount };
        })
        .filter(Boolean);
    }, [transactions, accountCurrencies, displayCurrency, fxRatesToInr]
  );

  /* ---------------- Current Balance ---------------- */
  // Starting balance = sum of account initial balances + net of transactions.
  // If accounts aren't available, fall back to transactions-only.
  const startingBalance = useMemo(() => {
    let base = 0;
    if (Array.isArray(accounts) && accounts.length > 0) {
      base = accounts
        .filter((a) => a && a.is_active !== false)
        .reduce((sum, a) => {
          const bal = Number(a.initial_balance);
          if (!Number.isFinite(bal)) return sum;
          const converted = convertCurrency(
            bal,
            resolveCurrency(a.currency, displayCurrency),
            displayCurrency,
            fxRatesToInr
          );
          return sum + (converted === null ? 0 : converted);
        }, 0);
    }
    return base;
  }, [accounts, displayCurrency, fxRatesToInr]);

  const transactionNet = useMemo(() => {
    let net = 0;
    for (const tx of liveTransactions) {
      const amt = safeNumber(tx.displayAmount, 0);
      if (tx.type === 'income') net += amt;
      else if (tx.type === 'expense') net -= amt;
    }
    return net;
  }, [liveTransactions]);

  const currentBalance = startingBalance + transactionNet;

  /* ---------------- Sanitised thresholds ---------------- */
  const { safeThreshold, critThreshold } = useMemo(() => {
    const s = Math.max(0, safetyThreshold);
    const c = Math.max(0, criticalThreshold);
    // Critical must be less than or equal to safety for meaningful alerts.
    return { safeThreshold: s, critThreshold: Math.min(c, s) };
  }, [safetyThreshold, criticalThreshold]);

  /* ============================================================
   * Forecast engine
   * ============================================================ */
  const {
    projectionData,
    baselineData,
    dangerZone,
    criticalZone,
    dailyIncome,
    dailyVariableBurn,
  } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const lookbackStart = new Date(now);
    lookbackStart.setDate(now.getDate() - LOOKBACK_DAYS);

    // Filter to lookback window
    const recent = liveTransactions.filter((tx) => {
      const d = new Date(tx.date);
      return !Number.isNaN(d.getTime()) && d >= lookbackStart;
    });

    // Subscription name index for exclusion from variable burn
    const subNames = new Set(
      (subscriptions || [])
        .map((s) => String(s?.name || '').toLowerCase())
        .filter(Boolean)
    );

    // Daily income: income events / lookbackDays
    let recentIncome = 0;
    const variableExpenses = [];
    for (const tx of recent) {
      if (tx.type === 'income') {
        recentIncome += safeNumber(tx.displayAmount, 0);
      } else if (
        tx.type === 'expense' &&
        !(tx.name && subNames.has(String(tx.name).toLowerCase())) &&
        !tx.is_one_time
      ) {
        variableExpenses.push(safeNumber(tx.displayAmount, 0));
      }
    }

    const days = Math.max(1, LOOKBACK_DAYS);
    const dailyIncome = recentIncome / days;

    // Robust daily burn: median expense × frequency
    variableExpenses.sort((a, b) => a - b);
    let dailyVariableBurn = 0;
    if (variableExpenses.length > 0) {
      const mid = Math.floor(variableExpenses.length / 2);
      const median = variableExpenses.length % 2 !== 0
        ? variableExpenses[mid]
        : (variableExpenses[mid - 1] + variableExpenses[mid]) / 2;
      const eventsPerDay = variableExpenses.length / days;
      dailyVariableBurn = Math.max(0, median * eventsPerDay);
    }
    // Never artificially inflate burn — 0 is a valid value.
    // If you want a floor, uncomment the next line.
    // dailyVariableBurn = Math.max(dailyVariableBurn, 1);

    const parsedWhatIf = safeNumber(whatIfAmount, 0);

    // Enumerate days
    const data = [];
    const baseData = [];
    const dailyVolatility = Math.max(dailyVariableBurn, dailyIncome, 1) * 0.35;
    let balance = currentBalance;
    let baselineBalance = currentBalance;
    let dangerHit = null;
    let criticalHit = null;

    // Pre-compute subscription anchor dates once per subscription
    const preparedSubs = (subscriptions || []).map((sub) => {
      const amount = safeNumber(sub?.amount, 0);
      return { sub, amount };
    });

    for (let i = 1; i <= forecastHorizon; i += 1) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);

      // Subscription outflows for this day
      let dailySubOutflow = 0;
      for (const { sub, amount } of preparedSubs) {
        if (subscriptionBillsOn(sub, d)) {
          dailySubOutflow += amount;
        }
      }

      const dailyOutflow = dailyVariableBurn + dailySubOutflow;

      // Baseline (no scenario)
      baselineBalance = baselineBalance + dailyIncome - dailyOutflow;

      // Scenario adjustment
      let scenarioAdj = 0;
      if (parsedWhatIf !== 0) {
        if (scenarioType === 'oneTime') {
          // i = 1 means tomorrow; startDay = 1 should mean "tomorrow"
          // to stay consistent with the loop indexing.
          if (i === scenarioStartDay) scenarioAdj = -parsedWhatIf;
        } else if (scenarioType === 'recurring') {
          // End date = start day + months*30 (approximation)
          const endDay = scenarioStartDay + scenarioMonths * 30;
          if (i >= scenarioStartDay && i < endDay) {
            if (scenarioFrequency === 'daily') {
              scenarioAdj = -parsedWhatIf;
            } else if (scenarioFrequency === 'weekly' && d.getDay() === 1) {
              scenarioAdj = -parsedWhatIf;
            } else if (scenarioFrequency === 'monthly' && d.getDate() === 1) {
              scenarioAdj = -parsedWhatIf;
            }
          }
        }
      }

      balance = balance + dailyIncome - dailyOutflow + scenarioAdj;

      const isCritical = balance < critThreshold;
      const isDanger = balance < safeThreshold;

      if (isDanger && !dangerHit) {
        dangerHit = { day: i, date: new Date(d), balance };
      }
      if (isCritical && !criticalHit) {
        criticalHit = { day: i, date: new Date(d), balance };
      }

      const row = {
        dayIndex: i,
        dateStr: formatShortDate(d, locale),
        balance: Number(balance.toFixed(2)),
        baseline: Number(baselineBalance.toFixed(2)),
        uncertaintyBase: Number((balance - dailyVolatility * Math.sqrt(i)).toFixed(2)),
        uncertaintyBand: Number((2 * dailyVolatility * Math.sqrt(i)).toFixed(2)),
        isDanger,
        isCritical,
      };
      data.push(row);
      baseData.push({ dayIndex: i, dateStr: row.dateStr, balance: row.baseline });
    }

    return {
      projectionData: data,
      baselineData: baseData,
      dangerZone: dangerHit,
      criticalZone: criticalHit,
      dailyIncome,
      dailyVariableBurn,
    };
  }, [
    liveTransactions, subscriptions, currentBalance, forecastHorizon,
    whatIfAmount, scenarioType, scenarioFrequency, scenarioMonths,
    scenarioStartDay, safeThreshold, critThreshold, locale,
  ]);

  const projectedFinal = projectionData.at(-1)?.balance ?? currentBalance;
  const baselineFinal = baselineData.at(-1)?.balance ?? currentBalance;
  const projectedChange = projectedFinal - currentBalance;

  const volatility = Math.abs(projectedChange) * 0.2;
  const bestCaseFinal = projectedFinal + volatility;
  const worstCaseFinal = projectedFinal - volatility;
  // Healthy only if neither a danger NOR a critical breach was predicted.
  const isSafe = !dangerZone && !criticalZone;
  const localAiFallback = dangerZone
    ? tr(
      'ai_fallback_danger',
      `${forecastHorizon}-day projection approaches the safety floor around day ${dangerZone.day}. Consider deferring discretionary purchases.`,
    )
    : tr(
      'ai_fallback_safe',
      `${forecastHorizon}-day projection remains above the safety floor. Keep maintaining consistent cash reserves.`,
    );

  /* ============================================================
   * AI insights (with proper trigger key + cleanup)
   * ============================================================ */
  useEffect(() => {
    if (liveTransactions.length === 0) {
      setAiSummary(tr('ai_need_tx', 'Add some transactions to enable AI forecasting analysis.'));
      setIsAiLoading(false);
      aiTriggerRef.current = '';
      return undefined;
    }

    if (!token) {
      setAiSummary(tr('ai_unavailable', 'AI insights are unavailable right now.'));
      setIsAiLoading(false);
      return undefined;
    }

    // Trigger key includes subscription count and rounded thresholds
    const triggerKey = [
      Math.round(currentBalance),
      forecastHorizon,
      dangerZone?.day ?? 'none',
      Math.round(projectedFinal),
      subscriptions.length,
      Math.round(dailyVariableBurn),
      Math.round(safeThreshold),
    ].join('|');

    if (triggerKey === aiTriggerRef.current) return undefined;
    aiTriggerRef.current = triggerKey;

    const controller = new AbortController();
    setIsAiLoading(true);

    const run = async () => {
      try {
        const payload = {
          averageDailyIncome: Math.round(dailyIncome),
          medianDailyExpense: Math.round(dailyVariableBurn),
          subscriptionsCount: subscriptions.length,
          subscriptionsCost: subscriptions.reduce(
            (s, sub) => s + safeNumber(sub?.amount, 0), 0
          ),
          whatIfAmount: safeNumber(whatIfAmount, 0),
          dangerDay: dangerZone?.day || null,
          horizon: forecastHorizon,
        };

        const json = await api.getCashflowAiInsights(payload, {
          signal: controller.signal,
        });
        setAiSummary(json?.insight || tr('ai_complete', 'Trajectory analysis complete.'));
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        const fallback = dangerZone
          ? tr('ai_fallback_danger', `${forecastHorizon}-day projection approaches the safety floor around day ${dangerZone.day}. Consider deferring discretionary purchases.`)
          : tr('ai_fallback_safe', `${forecastHorizon}-day projection remains above the safety floor. Keep maintaining consistent cash reserves.`);
        setAiSummary(fallback);
      } finally {
        setIsAiLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [
    currentBalance,
    forecastHorizon,
    dangerZone,
    projectedFinal,
    liveTransactions.length,
    token,
    dailyIncome,
    dailyVariableBurn,
    subscriptions,
    whatIfAmount,
    safeThreshold,
    tr,
  ]);

  /* ============================================================
   * Handlers
   * ============================================================ */

  const handleExportCSV = useCallback(() => {
    if (projectionData.length === 0) {
      showToast('error', tr('nothing_to_export', 'Nothing to export.'));
      return;
    }
    const headers = ['Day', 'Date', 'Projected Balance', 'Baseline Balance', 'Below Safety Floor', 'Below Critical Floor'];
    const rows = projectionData.map((r) => [
      r.dayIndex,
      r.dateStr,
      r.balance.toFixed(2),
      r.baseline.toFixed(2),
      r.isDanger ? 'YES' : 'NO',
      r.isCritical ? 'YES' : 'NO',
    ]);
    const csvContent = [
      headers.map(escapeCsvField).join(','),
      ...rows.map((r) => r.map(escapeCsvField).join(',')),
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `forecast_${forecastHorizon}d_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', tr('csv_exported', 'Forecast projection CSV downloaded!'));
  }, [projectionData, forecastHorizon, showToast, tr]);

  const resetScenario = useCallback(() => {
    setWhatIfAmount('');
    setScenarioType('oneTime');
    setScenarioFrequency('monthly');
    setScenarioMonths(DEFAULT_STATE.months);
    setScenarioStartDay(DEFAULT_STATE.startDay);
    showToast('info', tr('scenario_reset', 'Scenario reset to baseline.'));
  }, [showToast, tr]);

  /* ============================================================
   * Render values
   * ============================================================ */
  const gradientColor = isSafe ? '#10b981' : '#ef4444';
  const parsedWhatIf = safeNumber(whatIfAmount, 0);
  const hasWhatIf = parsedWhatIf !== 0;
  const baselineImpact = projectedFinal - baselineFinal;

  /* ============================================================
   * Loading
   * ============================================================ */
  if (loading && liveTransactions.length === 0) {
    return (
      <div className="masonry-layout-page cashflow-page-wrap">
        <div className="masonry-header">
          <div className="mh-titles">
            <h2>{tr('cashflow', 'Forecasting & Cashflow')}</h2>
          </div>
        </div>
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <p style={{ color: 'var(--text-muted)' }}>{tr('loading', 'Loading…')}</p>
        </div>
      </div>
    );
  }

  /* ============================================================
   * Render
   * ============================================================ */
  return (
    <div className="masonry-layout-page cashflow-page-wrap">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{tr('cashflow', 'Forecasting & Cashflow')}</h2>
          <span className="mh-badge">
            {forecastHorizon}-{tr('day', 'Day')} {tr('predictive_engine', 'Predictive Engine')}
          </span>
        </div>
        <div className="mh-actions" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCSV}
            title={tr('export_csv_title', 'Download projection as CSV')}
          >
            <Download size={15} /> {tr('export_csv', 'Export CSV')}
          </button>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                {tr('current', 'Current')}
              </div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {fmt(currentBalance)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                {forecastHorizon}d {tr('forecast', 'Forecast')}
              </div>
              <div
                style={{
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  color: projectedChange >= 0 ? 'var(--brand-primary)' : 'var(--danger)',
                }}
              >
                {fmt(projectedFinal)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="forecast-controls-bar glass">
        <div className="fcb-left">
          <span className="fcb-label">
            <Sliders size={15} /> {tr('projection_horizon', 'Projection Horizon')}:
          </span>
          <div className="fcb-pills">
            {HORIZON_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                className={`fcb-pill ${forecastHorizon === days ? 'active' : ''}`}
                onClick={() => setForecastHorizon(days)}
                aria-pressed={forecastHorizon === days}
                aria-label={`${days}-day forecast`}
              >
                {days} {tr('days', 'Days')}
              </button>
            ))}
          </div>
        </div>
        <div className="fcb-right">
          <button
            type="button"
            className={`btn-secondary ${showScenarioComparison ? 'active' : ''}`}
            onClick={() => setShowScenarioComparison((prev) => !prev)}
            style={{ fontSize: '0.82rem', padding: '6px 12px' }}
            aria-pressed={showScenarioComparison}
            aria-label={tr('toggle_baseline', 'Toggle baseline overlay')}
          >
            <Layers size={15} />{' '}
            {showScenarioComparison
              ? tr('hide_baseline', 'Hide Baseline Overlay')
              : tr('compare_baseline', 'Compare Baseline')}
          </button>
        </div>
      </div>

      <div className="masonry-grid" style={{ gridTemplateColumns: '1fr' }}>
        {/* Danger alert */}
        <AnimatePresence>
          {dangerZone && (
            <motion.div
              className="glass"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{
                padding: 18,
                borderRadius: 14,
                borderLeft: '4px solid var(--danger)',
                background: 'rgba(239,68,68,0.06)',
              }}
            >
              <h3
                style={{
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '1rem',
                  margin: '0 0 6px 0',
                }}
              >
                <AlertTriangle size={18} /> {tr('safety_floor_warning', 'Safety Floor Warning')}
              </h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                {tr('safety_floor_body', 'Your balance is projected to dip below the safety buffer to')}{' '}
                <strong className="text-danger">{fmt(dangerZone.balance)}</strong>{' '}
                {tr('on', 'on')}{' '}
                <strong>{formatLongDate(dangerZone.date, locale)}</strong>{' '}
                ({tr('in', 'in')} {dangerZone.day} {tr('days', 'days')}).
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main chart */}
        {liveTransactions.length > 0 ? (
          <motion.div
            className="glass bento-tile"
            style={{ padding: 24, minHeight: 400 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="bt-header">
              <h3 className="heading-accent">{tr('liquidity_curve', 'Projected Liquidity Curve')}</h3>
              <span className="bt-badge">
                {forecastHorizon}-{tr('day', 'Day')} {tr('trajectory', 'Trajectory')}
              </span>
            </div>

            <div style={{ height: 340, width: '100%', marginTop: 20 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}>
                <AreaChart data={projectionData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={gradientColor} stopOpacity={0.7} />
                      <stop offset="95%" stopColor={gradientColor} stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id={uncertaintyId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                  />
                  <XAxis
                    dataKey="dateStr"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={35}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={65}
                    tickFormatter={(val) => fmt(val)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 12,
                    }}
                    formatter={(val, name) => [
                      fmt(val),
                      name === 'baseline'
                        ? tr('baseline', 'Baseline')
                        : name === 'uncertaintyBand'
                          ? tr('uncertainty', 'Uncertainty range')
                          : name === 'balance'
                            ? tr('scenario_forecast', 'Scenario / Forecast')
                            : name,
                    ]}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                  />
                  <ReferenceLine
                    y={safeThreshold}
                    stroke="var(--warning)"
                    strokeDasharray="5 3"
                    label={{
                      position: 'insideTopLeft',
                      value: tr('safety_floor', 'Safety Floor'),
                      fill: 'var(--warning)',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                  {critThreshold > 0 && (
                    <ReferenceLine
                      y={critThreshold}
                      stroke="var(--danger)"
                      strokeDasharray="3 3"
                      label={{
                        position: 'insideBottomLeft',
                        value: tr('critical_floor', 'Critical Floor'),
                        fill: 'var(--danger)',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                  )}

                  {showScenarioComparison && (
                    <Area
                      type="monotone"
                      dataKey="baseline"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      fill="none"
                      name="baseline"
                    />
                  )}

                  <Area
                    type="monotone"
                    dataKey="uncertaintyBase"
                    stackId="uncertainty"
                    stroke="none"
                    fill="transparent"
                    isAnimationActive={false}
                    name="uncertaintyBase"
                  />
                  <Area
                    type="monotone"
                    dataKey="uncertaintyBand"
                    stackId="uncertainty"
                    stroke="none"
                    fill={`url(#${uncertaintyId})`}
                    isAnimationActive
                    name="uncertaintyBand"
                  />

                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={gradientColor}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill={`url(#${gradientId})`}
                    activeDot={{ r: 6, fill: gradientColor, strokeWidth: 0 }}
                    dot={<CustomizedDot />}
                    name="balance"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        ) : (
          <motion.div
            className="glass bento-tile"
            style={{ padding: 40, textAlign: 'center' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
              {tr('no_transactions_forecast', 'No transactions yet. Add some to enable forecasting.')}
            </p>
          </motion.div>
        )}

        {/* AI summary */}
        {liveTransactions.length > 0 && (
          <motion.div
            className="glass bento-tile"
            style={{
              padding: 22,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, transparent 100%)',
              border: '1px solid rgba(139,92,246,0.2)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BrainCircuit size={18} style={{ color: '#a78bfa' }} />
              {tr('ai_trajectory', 'AI Trajectory Analysis')}
              {isSafe ? (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.75rem',
                    color: 'var(--brand-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <CheckCircle size={14} /> {tr('healthy', 'Healthy')}
                </span>
              ) : (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.75rem',
                    color: 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AlertTriangle size={14} /> {tr('attention_needed', 'Attention Needed')}
                </span>
              )}
            </h3>
            <div style={{ color: 'var(--text-secondary)', marginTop: 10, fontSize: '0.9rem', lineHeight: 1.6 }}>
              {isAiLoading ? (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {tr('analyzing', 'Analyzing financial trajectory…')}
                </span>
              ) : (
                <p>{aiSummary || localAiFallback}</p>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                <div
                  style={{
                    background: 'var(--glass-1)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    flex: 1,
                    minWidth: 140,
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {tr('optimistic', 'Optimistic (+20%)')}
                  </div>
                  <div style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>{fmt(bestCaseFinal)}</div>
                </div>
                <div
                  style={{
                    background: 'var(--glass-1)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    flex: 1,
                    minWidth: 140,
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {tr('conservative', 'Conservative (-20%)')}
                  </div>
                  <div style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmt(worstCaseFinal)}</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Thresholds + What-If */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          <motion.div className="glass bento-tile" style={{ padding: 22 }} whileHover={{ y: -2 }}>
            <div className="bt-header" style={{ marginBottom: 14 }}>
              <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={18} /> {tr('safety_floors', 'Safety & Critical Floors')}
              </h3>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="safety-slider"
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                {tr('safety_buffer', 'Safety Buffer')}: <strong>{fmt(safeThreshold)}</strong>
              </label>
              <input
                id="safety-slider"
                type="range"
                min="0"
                max={Math.max(50_000, Math.ceil(currentBalance * 0.5))}
                step="500"
                value={safetyThreshold}
                onChange={(e) => setSafetyThreshold(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--warning)', cursor: 'pointer' }}
                aria-label={tr('safety_threshold', 'Safety threshold slider')}
              />
            </div>

            <div>
              <label
                htmlFor="critical-slider"
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                {tr('critical_warning_floor', 'Critical Warning Floor')}: <strong>{fmt(critThreshold)}</strong>
              </label>
              <input
                id="critical-slider"
                type="range"
                min="0"
                max={Math.max(25_000, Math.ceil(currentBalance * 0.25))}
                step="250"
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--danger)', cursor: 'pointer' }}
                aria-label={tr('critical_threshold', 'Critical threshold slider')}
              />
              {criticalThreshold > safetyThreshold && (
                <p style={{ fontSize: '0.72rem', color: 'var(--warning-color, #f59e0b)', margin: '6px 0 0' }}>
                  {tr('critical_exceeds_safety', 'Critical floor is capped at the safety buffer for alerting.')}
                </p>
              )}
            </div>
          </motion.div>

          <motion.div className="glass bento-tile" style={{ padding: 22 }} whileHover={{ y: -2 }}>
            <div className="bt-header" style={{ marginBottom: 12 }}>
              <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} /> {tr('what_if_modeler', 'What-If Scenario Modeler')}
              </h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={resetScenario}
                style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                aria-label={tr('reset_scenario', 'Reset scenario')}
              >
                <RotateCcw size={14} /> {tr('reset', 'Reset')}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[
                { id: 'oneTime', label: tr('one_time', 'One-Time') },
                { id: 'recurring', label: tr('recurring', 'Recurring') },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`fcb-pill ${scenarioType === id ? 'active' : ''}`}
                  onClick={() => setScenarioType(id)}
                  aria-pressed={scenarioType === id}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="whatif-amount"
                style={{
                  fontSize: '0.76rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                {scenarioType === 'oneTime'
                  ? tr('one_off_expense_inflow', 'One-off Expense / Inflow')
                  : tr('recurring_amount', 'Recurring Amount')}
              </label>
              <input
                id="whatif-amount"
                type="number"
                value={whatIfAmount}
                onChange={(e) => setWhatIfAmount(e.target.value)}
                placeholder={tr('whatif_placeholder', 'e.g. 5000 (positive to spend, negative to gain)')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8 }}
                aria-label={tr('whatif_amount', 'What-if amount')}
              />
            </div>

            {scenarioType === 'recurring' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label htmlFor="scenario-freq" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {tr('frequency', 'Frequency')}
                  </label>
                  <select
                    id="scenario-freq"
                    value={scenarioFrequency}
                    onChange={(e) => setScenarioFrequency(e.target.value)}
                    className="filter-select"
                    style={{ width: '100%' }}
                    aria-label={tr('scenario_frequency', 'Scenario frequency')}
                  >
                    <option value="monthly">{tr('monthly', 'Monthly')}</option>
                    <option value="weekly">{tr('weekly', 'Weekly')}</option>
                    <option value="daily">{tr('daily', 'Daily')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="scenario-months" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {tr('duration_months', 'Duration (Months)')}
                  </label>
                  <input
                    id="scenario-months"
                    type="number"
                    min="1"
                    max={MAX_SCENARIO_MONTHS}
                    value={scenarioMonths}
                    onChange={(e) => setScenarioMonths(
                      Math.max(1, Math.min(MAX_SCENARIO_MONTHS, Number(e.target.value) || 1))
                    )}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 8 }}
                    aria-label={tr('scenario_duration', 'Scenario duration in months')}
                  />
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label htmlFor="scenario-start" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {tr('start_day_tomorrow', 'Start Day (1 = tomorrow)')}
              </label>
              <input
                id="scenario-start"
                type="number"
                min="1"
                max={forecastHorizon}
                value={scenarioStartDay}
                onChange={(e) => setScenarioStartDay(
                  Math.max(1, Math.min(forecastHorizon, Number(e.target.value) || 1))
                )}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 8 }}
                aria-label={tr('scenario_start', 'Scenario start day')}
              />
            </div>

            {hasWhatIf && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--glass-2)',
                  fontSize: '0.82rem',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <span>{tr('impact_vs_baseline', 'Impact vs Baseline')}: </span>
                <strong className={baselineImpact >= 0 ? 'text-success' : 'text-danger'}>
                  {baselineImpact >= 0 ? '+' : ''}{fmt(baselineImpact)}
                </strong>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
