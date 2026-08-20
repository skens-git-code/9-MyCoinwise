import React, { useState, useContext, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid,
  XAxis, YAxis, Tooltip, ReferenceLine, Line
} from 'recharts';
import {
  AlertTriangle, Target, Zap, Activity, BrainCircuit,
  TrendingDown, CheckCircle, Sliders, Download, Layers,
  Calendar, RotateCcw, ShieldAlert, Sparkles
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { useToast } from '../components/ToastProvider';

// ==================== CUSTOM DOT ====================
const CustomizedDot = ({ cx, cy, payload }) => {
  if (payload?.isDanger) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill="#ef4444"
        stroke="#fff"
        strokeWidth={1.5}
        filter="drop-shadow(0 0 6px rgba(239,68,68,0.8))"
      />
    );
  }
  if (payload?.isCritical) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#dc2626"
        stroke="#fff"
        strokeWidth={1}
        filter="drop-shadow(0 0 6px rgba(220,38,38,0.8))"
      />
    );
  }
  return null;
};

const API_BASE = import.meta.env.VITE_API_URL || 'https://nine-budgettracker.onrender.com/api';

// ==================== MAIN COMPONENT ====================
export default function Cashflow() {
  const { transactions = [], subscriptions = [], fmt, t, token, theme } = useContext(AppContext);
  const { showToast } = useToast();

  // ---------- State (with localStorage persistence) ----------
  const [forecastHorizon, setForecastHorizon] = useState(
    () => Number(localStorage.getItem('mcw-cf-horizon')) || 90
  );
  const [showScenarioComparison, setShowScenarioComparison] = useState(
    () => localStorage.getItem('mcw-cf-show-baseline') === 'true'
  );
  const [scenarioType, setScenarioType] = useState(
    () => localStorage.getItem('mcw-cf-type') || 'oneTime'
  );
  const [whatIfAmount, setWhatIfAmount] = useState(
    () => localStorage.getItem('mcw-cf-amt') || ''
  );
  const [scenarioFrequency, setScenarioFrequency] = useState(
    () => localStorage.getItem('mcw-cf-freq') || 'monthly'
  );
  const [scenarioMonths, setScenarioMonths] = useState(
    () => Number(localStorage.getItem('mcw-cf-months')) || 6
  );
  const [scenarioStartDay, setScenarioStartDay] = useState(
    () => Number(localStorage.getItem('mcw-cf-start-day')) || 1
  );
  const [safetyThreshold, setSafetyThreshold] = useState(
    () => Number(localStorage.getItem('mcw-cf-safety')) || 5000
  );
  const [criticalThreshold, setCriticalThreshold] = useState(
    () => Number(localStorage.getItem('mcw-cf-critical')) || 2000
  );

  const [aiSummary, setAiSummary] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiTriggerRef = useRef('');
  const chartContainerRef = useRef(null);

  const isDark = theme === 'amoled';

  // Persist all settings
  useEffect(() => {
    localStorage.setItem('mcw-cf-horizon', String(forecastHorizon));
    localStorage.setItem('mcw-cf-show-baseline', String(showScenarioComparison));
    localStorage.setItem('mcw-cf-type', scenarioType);
    localStorage.setItem('mcw-cf-amt', whatIfAmount);
    localStorage.setItem('mcw-cf-freq', scenarioFrequency);
    localStorage.setItem('mcw-cf-months', String(scenarioMonths));
    localStorage.setItem('mcw-cf-start-day', String(scenarioStartDay));
    localStorage.setItem('mcw-cf-safety', String(safetyThreshold));
    localStorage.setItem('mcw-cf-critical', String(criticalThreshold));
  }, [
    forecastHorizon,
    showScenarioComparison,
    scenarioType,
    whatIfAmount,
    scenarioFrequency,
    scenarioMonths,
    scenarioStartDay,
    safetyThreshold,
    criticalThreshold,
  ]);

  // ---------- Current Balance ----------
  const currentBalance = useMemo(() => {
    return transactions.reduce(
      (acc, tx) => (tx.type === 'income' ? acc + Number(tx.amount) : acc - Number(tx.amount)),
      0
    );
  }, [transactions]);

  // ---------- Forecasting Engine ----------
  const { projectionData, baselineData, dangerZone, dailyIncome, dailyVariableBurn } = useMemo(() => {
    const data = [];
    const baseData = [];
    const now = new Date();
    const lookbackDays = Math.min(90, forecastHorizon);
    const lookbackDate = new Date();
    lookbackDate.setDate(now.getDate() - lookbackDays);

    const recentTx = transactions.filter((tx) => new Date(tx.date) >= lookbackDate);
    const subNames = new Set(subscriptions.map((s) => (s.name || '').toLowerCase()));

    let recentIncome = 0;
    const variableExpenses = [];

    recentTx.forEach((tx) => {
      if (tx.type === 'income') {
        recentIncome += Number(tx.amount);
      } else if (
        tx.type === 'expense' &&
        !(tx.name && subNames.has(tx.name.toLowerCase())) &&
        !tx.is_one_time
      ) {
        variableExpenses.push(Number(tx.amount));
      }
    });

    const dailyIncome = recentIncome / (lookbackDays || 1) || 0;
    const avgEventsPerDay = variableExpenses.length / (lookbackDays || 1);
    variableExpenses.sort((a, b) => a - b);
    let medianExpense = 1;
    if (variableExpenses.length > 0) {
      const mid = Math.floor(variableExpenses.length / 2);
      const medianTx =
        variableExpenses.length % 2 !== 0
          ? variableExpenses[mid]
          : (variableExpenses[mid - 1] + variableExpenses[mid]) / 2;
      medianExpense = medianTx * avgEventsPerDay || 1;
    }
    const dailyVariableBurn = Math.max(medianExpense, 1);

    const parsedWhatIf = parseFloat(whatIfAmount) || 0;

    let balance = currentBalance;
    let baselineBalance = currentBalance;
    let dangerHit = null;

    for (let i = 1; i <= forecastHorizon; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);

      let dailyOutflow = dailyVariableBurn;

      // Deduct subscriptions
      subscriptions.forEach((sub) => {
        if (sub.is_paused || sub.cancelled_at) return;
        const amt = Number(sub.amount);
        const fallback = new Date();
        const t1 = sub.next_billing_date ? new Date(sub.next_billing_date) : null;
        const t2 = sub.start_date ? new Date(sub.start_date) : null;
        const parsedDate =
          t1 && !isNaN(t1.getTime())
            ? t1
            : t2 && !isNaN(t2.getTime())
              ? t2
              : fallback;

        if (sub.cycle === 'daily') {
          dailyOutflow += amt;
        } else if (sub.cycle === 'weekly' && d.getDay() === parsedDate.getDay()) {
          dailyOutflow += amt;
        } else if (sub.cycle === 'monthly' && d.getDate() === parsedDate.getDate()) {
          dailyOutflow += amt;
        } else if (sub.cycle === 'quarterly') {
          // Quarterly: same day every 3 months
          if (
            d.getDate() === parsedDate.getDate() &&
            (d.getMonth() - parsedDate.getMonth()) % 3 === 0 &&
            d.getMonth() >= parsedDate.getMonth()
          ) {
            dailyOutflow += amt;
          }
        } else if (sub.cycle === 'yearly') {
          if (d.getDate() === parsedDate.getDate() && d.getMonth() === parsedDate.getMonth()) {
            dailyOutflow += amt;
          }
        }
      });

      // Baseline (no scenario)
      baselineBalance = baselineBalance + dailyIncome - dailyOutflow;

      // Apply What-If Scenario
      let scenarioAdj = 0;
      if (parsedWhatIf !== 0) {
        if (scenarioType === 'oneTime' && i === scenarioStartDay) {
          scenarioAdj = -parsedWhatIf;
        } else if (scenarioType === 'recurring' && i <= scenarioMonths * 30) {
          if (scenarioFrequency === 'daily') {
            scenarioAdj = -parsedWhatIf;
          } else if (scenarioFrequency === 'weekly' && d.getDay() === 1) {
            // Monday as week start
            scenarioAdj = -parsedWhatIf;
          } else if (scenarioFrequency === 'monthly' && d.getDate() === 1) {
            scenarioAdj = -parsedWhatIf;
          }
        }
      }

      balance = balance + dailyIncome - dailyOutflow + scenarioAdj;

      // Track first danger day
      if (balance < safetyThreshold && !dangerHit) {
        dangerHit = { day: i, date: new Date(d), balance };
      }

      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      data.push({
        dayIndex: i,
        dateStr,
        balance: parseFloat(balance.toFixed(2)),
        baseline: parseFloat(baselineBalance.toFixed(2)),
        isDanger: balance < safetyThreshold,
        isCritical: balance < criticalThreshold,
      });
      baseData.push({
        dayIndex: i,
        dateStr,
        balance: parseFloat(baselineBalance.toFixed(2)),
      });
    }

    return {
      projectionData: data,
      baselineData: baseData,
      dangerZone: dangerHit,
      dailyIncome,
      dailyVariableBurn,
    };
  }, [
    transactions,
    subscriptions,
    currentBalance,
    forecastHorizon,
    whatIfAmount,
    scenarioType,
    scenarioFrequency,
    scenarioMonths,
    scenarioStartDay,
    safetyThreshold,
    criticalThreshold,
  ]);

  const projectedFinal = projectionData[projectionData.length - 1]?.balance ?? currentBalance;
  const baselineFinal = baselineData[baselineData.length - 1]?.balance ?? currentBalance;
  const projectedChange = projectedFinal - currentBalance;

  const volatility = Math.abs(projectedChange) * 0.2;
  const bestCaseFinal = projectedFinal + volatility;
  const worstCaseFinal = projectedFinal - volatility;
  const isSafe = !dangerZone;

  // ---------- AI Insights ----------
  useEffect(() => {
    if (transactions.length === 0) {
      setAiSummary('Add some transactions to enable AI forecasting analysis.');
      return;
    }

    const triggerKey = `${Math.round(currentBalance)}_${forecastHorizon}_${
      dangerZone?.day ?? 'none'
    }_${Math.round(projectedFinal)}`;
    if (triggerKey === aiTriggerRef.current) return;
    aiTriggerRef.current = triggerKey;

    if (!token) return;
    let cancelled = false;
    setIsAiLoading(true);

    const analyzeWithAI = async () => {
      try {
        const payload = {
          averageDailyIncome: Math.round(dailyIncome),
          medianDailyExpense: Math.round(dailyVariableBurn),
          subscriptionsCount: subscriptions.length,
          subscriptionsCost: subscriptions.reduce((s, sub) => s + Number(sub.amount), 0),
          whatIfAmount: parseFloat(whatIfAmount) || 0,
          dangerDay: dangerZone?.day || null,
          horizon: forecastHorizon,
        };
        const res = await fetch(`${API_BASE}/cashflow/ai-insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setAiSummary(data.insight || 'Trajectory analysis complete.');
      } catch {
        if (!cancelled) {
          setAiSummary(
            `${forecastHorizon}-day projection${
              dangerZone ? ` approaches minimum floor around day ${dangerZone.day}` : ' remains positive'
            }. ${dangerZone ? 'Consider deferring discretionary purchases.' : 'Keep maintaining consistent cash reserves.'}`
          );
        }
      } finally {
        if (!cancelled) setIsAiLoading(false);
      }
    };

    analyzeWithAI();
    return () => {
      cancelled = true;
    };
  }, [
    currentBalance,
    forecastHorizon,
    dangerZone,
    projectedFinal,
    transactions.length,
    token,
    dailyIncome,
    dailyVariableBurn,
    subscriptions,
    whatIfAmount,
  ]);

  // ---------- Export CSV ----------
  const handleExportCSV = () => {
    if (projectionData.length === 0) return;
    const headers = ['Day', 'Date', 'Projected Balance', 'Baseline Balance', 'Below Safety Floor'];
    const rows = projectionData.map((r) => [
      r.dayIndex,
      r.dateStr,
      r.balance,
      r.baseline,
      r.isDanger ? 'YES' : 'NO',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `forecast_${forecastHorizon}d_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Forecast projection CSV downloaded!');
  };

  // ---------- Reset Scenario ----------
  const resetScenario = () => {
    setWhatIfAmount('');
    setScenarioType('oneTime');
    setScenarioFrequency('monthly');
    setScenarioMonths(6);
    setScenarioStartDay(1);
    showToast('info', 'Scenario reset to baseline.');
  };

  // ---------- Render ----------
  const gradientColor = isSafe ? '#10b981' : '#ef4444';
  const hasWhatIf = parseFloat(whatIfAmount) !== 0 && !isNaN(parseFloat(whatIfAmount));

  return (
    <div className="masonry-layout-page cashflow-page-wrap">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{t('cashflow') || 'Forecasting & Cashflow'}</h2>
          <span className="mh-badge">{forecastHorizon}-Day Predictive Engine</span>
        </div>
        <div className="mh-actions" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={handleExportCSV} title="Download projection as CSV">
            <Download size={15} /> Export CSV
          </button>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Current
              </div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {fmt(currentBalance)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                {forecastHorizon}d Forecast
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

      {/* Controls Bar */}
      <div className="forecast-controls-bar glass">
        <div className="fcb-left">
          <span className="fcb-label"><Sliders size={15} /> Projection Horizon:</span>
          <div className="fcb-pills">
            {[30, 60, 90, 180, 365].map((days) => (
              <button
                key={days}
                className={`fcb-pill ${forecastHorizon === days ? 'active' : ''}`}
                onClick={() => setForecastHorizon(days)}
                aria-label={`${days}-day forecast`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>

        <div className="fcb-right">
          <button
            className={`btn-secondary ${showScenarioComparison ? 'active' : ''}`}
            onClick={() => setShowScenarioComparison((prev) => !prev)}
            style={{ fontSize: '0.82rem', padding: '6px 12px' }}
            aria-label="Toggle baseline overlay"
          >
            <Layers size={15} /> {showScenarioComparison ? 'Hide Baseline Overlay' : 'Compare Baseline'}
          </button>
        </div>
      </div>

      <div className="masonry-grid" style={{ gridTemplateColumns: '1fr' }}>
        {/* Danger Zone Alert */}
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
                <AlertTriangle size={18} /> Safety Floor Warning
              </h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                Your balance is projected to dip below the <strong>{fmt(safetyThreshold)}</strong> safety buffer to{' '}
                <strong className="text-danger">{fmt(dangerZone.balance)}</strong> on{' '}
                <strong>{dangerZone.date.toLocaleDateString()}</strong> (in {dangerZone.day} days).
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Chart */}
        {transactions.length > 0 ? (
          <motion.div
            ref={chartContainerRef}
            className="glass bento-tile"
            style={{ padding: 24, minHeight: 400 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="bt-header">
              <h3 className="heading-accent">Projected Liquidity Curve</h3>
              <span className="bt-badge">{forecastHorizon}-Day Trajectory</span>
            </div>

            <div style={{ height: 340, width: '100%', marginTop: 20 }}>
              <ResponsiveContainer>
                <AreaChart data={projectionData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cashflowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={gradientColor} stopOpacity={0.7} />
                      <stop offset="95%" stopColor={gradientColor} stopOpacity={0.05} />
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
                      name === 'baseline' ? 'Baseline' : 'Scenario / Forecast',
                    ]}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                  />
                  <ReferenceLine
                    y={safetyThreshold}
                    stroke="var(--warning)"
                    strokeDasharray="5 3"
                    label={{
                      position: 'insideTopLeft',
                      value: 'Safety Floor',
                      fill: 'var(--warning)',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                  <ReferenceLine
                    y={criticalThreshold}
                    stroke="var(--danger)"
                    strokeDasharray="3 3"
                    label={{
                      position: 'insideTopLeft',
                      value: 'Critical Floor',
                      fill: 'var(--danger)',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />

                  {/* Baseline Overlay */}
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
                    dataKey="balance"
                    stroke={gradientColor}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#cashflowGradient)"
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
              No transactions yet. Add some to enable forecasting.
            </p>
          </motion.div>
        )}

        {/* AI Summary Card */}
        {transactions.length > 0 && (
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
            <h3
              className="heading-accent"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <BrainCircuit size={18} style={{ color: '#a78bfa' }} />
              AI Trajectory Analysis
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
                  <CheckCircle size={14} /> Healthy
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
                  <AlertTriangle size={14} /> Attention Needed
                </span>
              )}
            </h3>
            <div style={{ color: 'var(--text-secondary)', marginTop: 10, fontSize: '0.9rem', lineHeight: 1.6 }}>
              {isAiLoading ? (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Analyzing financial trajectory…
                </span>
              ) : (
                <p>{aiSummary}</p>
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
                    Optimistic (+20%)
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
                    Conservative (-20%)
                  </div>
                  <div style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmt(worstCaseFinal)}</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Controls: Thresholds + What‑If Simulator */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {/* Thresholds Console */}
          <motion.div className="glass bento-tile" style={{ padding: 22 }} whileHover={{ y: -2 }}>
            <div className="bt-header" style={{ marginBottom: 14 }}>
              <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={18} /> {t('safety_floors') || 'Safety & Critical Floors'}
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
                {t('safety_buffer') || 'Safety Buffer'}: <strong>{fmt(safetyThreshold)}</strong>
              </label>
              <input
                id="safety-slider"
                type="range"
                min="0"
                max="50000"
                step="500"
                value={safetyThreshold}
                onChange={(e) => setSafetyThreshold(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--warning)', cursor: 'pointer' }}
                aria-label="Safety threshold slider"
                aria-valuenow={safetyThreshold}
                aria-valuemin={0}
                aria-valuemax={50000}
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
                {t('critical_warning_floor') || 'Critical Warning Floor'}: <strong>{fmt(criticalThreshold)}</strong>
              </label>
              <input
                id="critical-slider"
                type="range"
                min="0"
                max="25000"
                step="250"
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--danger)', cursor: 'pointer' }}
                aria-label="Critical threshold slider"
                aria-valuenow={criticalThreshold}
                aria-valuemin={0}
                aria-valuemax={25000}
              />
            </div>
          </motion.div>

          {/* What-If Simulator */}
          <motion.div className="glass bento-tile" style={{ padding: 22 }} whileHover={{ y: -2 }}>
            <div className="bt-header" style={{ marginBottom: 12 }}>
              <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} /> {t('what_if_modeler') || 'What-If Scenario Modeler'}
              </h3>
              <button
                className="btn-secondary"
                onClick={resetScenario}
                style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                aria-label="Reset scenario"
              >
                <RotateCcw size={14} /> {t('reset') || 'Reset'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                className={`fcb-pill ${scenarioType === 'oneTime' ? 'active' : ''}`}
                onClick={() => setScenarioType('oneTime')}
                aria-label="One-time scenario"
              >
                {t('one_time') || 'One-Time'}
              </button>
              <button
                className={`fcb-pill ${scenarioType === 'recurring' ? 'active' : ''}`}
                onClick={() => setScenarioType('recurring')}
                aria-label="Recurring scenario"
              >
                {t('recurring') || 'Recurring'}
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="whatif-amount"
                style={{ fontSize: '0.76rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}
              >
                {scenarioType === 'oneTime' ? (t('one_off_expense_inflow') || 'One-off Expense / Inflow') : (t('recurring_amount') || 'Recurring Amount')}
              </label>
              <input
                id="whatif-amount"
                type="number"
                value={whatIfAmount}
                onChange={(e) => setWhatIfAmount(e.target.value)}
                placeholder="e.g. 5000 (positive to spend, negative to gain)"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8 }}
                aria-label="What-if amount"
              />
            </div>

            {scenarioType === 'recurring' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label htmlFor="scenario-freq" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {t('frequency') || 'Frequency'}
                  </label>
                  <select
                    id="scenario-freq"
                    value={scenarioFrequency}
                    onChange={(e) => setScenarioFrequency(e.target.value)}
                    className="filter-select"
                    style={{ width: '100%' }}
                    aria-label="Scenario frequency"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="scenario-months" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {t('duration_months') || 'Duration (Months)'}
                  </label>
                  <input
                    id="scenario-months"
                    type="number"
                    min="1"
                    max="12"
                    value={scenarioMonths}
                    onChange={(e) => setScenarioMonths(Number(e.target.value))}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 8 }}
                    aria-label="Scenario duration in months"
                  />
                </div>
              </div>
            )}

            {/* Start Day */}
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="scenario-start" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {t('start_day_today') || 'Start Day (1 = today)'}
              </label>
              <input
                id="scenario-start"
                type="number"
                min="1"
                max="30"
                value={scenarioStartDay}
                onChange={(e) => setScenarioStartDay(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 8 }}
                aria-label="Scenario start day"
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
                <span>Impact vs Baseline: </span>
                <strong className={projectedFinal >= baselineFinal ? 'text-success' : 'text-danger'}>
                  {projectedFinal >= baselineFinal ? '+' : ''}
                  {fmt(projectedFinal - baselineFinal)}
                </strong>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
