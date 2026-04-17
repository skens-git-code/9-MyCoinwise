import React, { useState, useContext, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid,
  XAxis, YAxis, Tooltip, ReferenceLine
} from 'recharts';
import { AlertTriangle, Target, Zap, Activity, BrainCircuit, TrendingDown, CheckCircle } from 'lucide-react';
import { AppContext } from '../App';

// ─── Custom danger dot for the area chart ─────────────────────────────────────
const CustomizedDot = ({ cx, cy, payload }) => {
  if (payload?.isDanger) {
    return (
      <circle
        cx={cx} cy={cy} r={4}
        stroke="none" fill="#ef4444"
        filter="drop-shadow(0 0 4px rgba(239,68,68,0.8))"
      />
    );
  }
  return null;
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export default function Cashflow() {
  const { transactions, subscriptions, fmt, t, currencyInfo, token } = useContext(AppContext);
  const [whatIfAmount, setWhatIfAmount] = useState('');
  const [safetyThreshold, setSafetyThreshold] = useState(5000);
  const [aiSummary, setAiSummary] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiTriggerRef = useRef('');

  // ─── 1. Current balance from all transactions ──────────────────────────────
  const currentBalance = useMemo(() => {
    return transactions.reduce((acc, tx) =>
      tx.type === 'income' ? acc + Number(tx.amount) : acc - Number(tx.amount), 0
    );
  }, [transactions]);

  // ─── 2. 90-Day Forecasting Engine ─────────────────────────────────────────
  const { projectionData, dangerZone, dailyIncome, dailyVariableBurn } = useMemo(() => {
    const data = [];
    const now = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(now.getDate() - 90);

    const recentTx = transactions.filter(tx => new Date(tx.date) >= ninetyDaysAgo);
    const subNames = new Set(subscriptions.map(s => (s.name || '').toLowerCase()));

    let recentIncome = 0;
    let variableExpenses = [];

    recentTx.forEach(tx => {
      if (tx.type === 'income') {
        recentIncome += Number(tx.amount);
      } else if (tx.type === 'expense' && !(tx.name && subNames.has(tx.name.toLowerCase())) && !tx.is_one_time) {
        variableExpenses.push(Number(tx.amount));
      }
    });

    const dailyIncome = recentIncome / 90 || 0;
    const simulatedSpend = parseFloat(whatIfAmount) || 0;
    
    // Median base for outlier filtering
    const avgEventsPerDay = variableExpenses.length / 90;
    variableExpenses.sort((a,b) => a-b);
    let medianExpense = 1;
    if (variableExpenses.length > 0) {
      const mid = Math.floor(variableExpenses.length / 2);
      const medianTx = variableExpenses.length % 2 !== 0 ? variableExpenses[mid] : (variableExpenses[mid - 1] + variableExpenses[mid]) / 2;
      medianExpense = (medianTx * avgEventsPerDay) || 1;
    }
    const dailyVariableBurn = Math.max(medianExpense, 1);

    let balance = currentBalance - simulatedSpend;
    let dangerHit = null;

    for (let i = 1; i <= 90; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);

      let dailyOutflow = dailyVariableBurn;

      subscriptions.forEach(sub => {
        const amt = Number(sub.amount);
        const fallbackDate = sub.start_date || new Date().toISOString();
        const extractedDay = sub.next_billing_date ? new Date(sub.next_billing_date).getDate() : new Date(fallbackDate).getDate() || 1;
        
        if (sub.cycle === 'monthly' && d.getDate() === extractedDay) {
          dailyOutflow += amt;
        } else if (sub.cycle === 'yearly' && d.getDate() === extractedDay && d.getMonth() === (sub.next_billing_date ? new Date(sub.next_billing_date).getMonth() : 0)) {
          dailyOutflow += amt;
        } else if (sub.cycle === 'weekly' && d.getDay() === (sub.next_billing_date ? new Date(sub.next_billing_date).getDay() : 1)) {
          dailyOutflow += amt;
        }
      });

      balance = balance + dailyIncome - dailyOutflow;

      if (balance < safetyThreshold && !dangerHit) {
        dangerHit = { day: i, date: new Date(d), balance };
      }

      data.push({
        dayIndex: i,
        dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        balance: parseFloat(balance.toFixed(2)),
        isDanger: balance < safetyThreshold,
      });
    }

    return { projectionData: data, dangerZone: dangerHit, dailyIncome, dailyVariableBurn };
  }, [transactions, subscriptions, currentBalance, whatIfAmount, safetyThreshold]);

  // ─── 3. Derived stats for the summary row ─────────────────────────────────
  const projectedFinal = projectionData[projectionData.length - 1]?.balance ?? currentBalance;
  const projectedChange = projectedFinal - currentBalance;
  
  // Predict a generic 20% variance band for Sensitivity Analysis
  const volatility = Math.abs(projectedChange) * 0.20;
  const bestCaseFinal = projectedFinal + volatility;
  const worstCaseFinal = projectedFinal - volatility;

  const isSafe = !dangerZone;

  // ─── 4. AI Forecasting Summary ─────────────────────────────────────────────
  // Only triggers when the financial picture materially changes
  useEffect(() => {
    if (transactions.length === 0) {
      setAiSummary('Add some transactions to enable AI forecasting analysis.');
      return;
    }

    const triggerKey = `${Math.round(currentBalance)}_${dangerZone?.day ?? 'none'}_${Math.round(projectedFinal)}`;
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
            dangerDay: dangerZone?.day || null
        };
        const res = await fetch(`${API_BASE}/cashflow/ai-insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setAiSummary(data.insight || 'Analysis complete.');
      } catch {
        if (!cancelled) setAiSummary(`90-day trajectory${dangerZone ? ` hits danger on day ${dangerZone.day}` : ' remains safe'}. ${dangerZone ? 'Reduce recurring costs to stabilize.' : 'Continue current spending discipline.'}`);
      } finally {
        if (!cancelled) setIsAiLoading(false);
      }
    };

    analyzeWithAI();
    return () => { cancelled = true; };
  }, [currentBalance, dangerZone, projectedFinal, transactions.length, token, dailyIncome, dailyVariableBurn, subscriptions, whatIfAmount]);

  const gradientColor = isSafe ? '#10b981' : '#ef4444';
  // FIX: Correctly check if what-if has a valid parsed number
  const hasWhatIf = parseFloat(whatIfAmount) > 0;

  return (
    <div className="masonry-layout-page">

      {/* ── Header ── */}
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{t('cashflow') || 'Forecasting'}</h2>
          <span className="mh-badge">90-Day Engine</span>
        </div>
        <div className="mh-actions">
          {/* Summary stats row */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Current</div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(currentBalance)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>90-Day Projection</div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: projectedChange >= 0 ? 'var(--brand-primary)' : 'var(--danger)' }}>
                {fmt(projectedFinal)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="masonry-grid" style={{ gridTemplateColumns: '1fr' }}>

        {/* ── Danger Zone Alert ── */}
        <AnimatePresence>
          {dangerZone && (
            <motion.div
              className="glass"
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              style={{ padding: 20, borderLeft: '4px solid var(--danger)', background: 'rgba(239,68,68,0.05)' }}
            >
              <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={20} /> Danger Zone Activated
              </h3>
              <p style={{ marginTop: 8, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Your balance is projected to fall below the <strong>{fmt(safetyThreshold)}</strong> safety threshold,
                reaching <strong style={{ color: 'var(--danger)' }}>{fmt(dangerZone.balance)}</strong> on{' '}
                <strong>{dangerZone.date.toLocaleDateString()}</strong> (in {dangerZone.day} day{dangerZone.day !== 1 ? 's' : ''}).
                Consider deferring major expenses or increasing income sources.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── No Data State ── */}
        {transactions.length === 0 && (
          <motion.div
            className="glass bento-tile"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ padding: 48, textAlign: 'center' }}
          >
            <TrendingDown size={48} style={{ color: 'var(--text-muted)', marginBottom: 16, opacity: 0.4 }} />
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>No Transactions Yet</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>
              Add your income and expense transactions to see a 90-day financial projection here.
            </p>
          </motion.div>
        )}

        {/* ── Main Area Chart ── */}
        {transactions.length > 0 && (
          <motion.div
            className="glass bento-tile"
            style={{ padding: 24, minHeight: 400 }}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="bt-header">
              <h3 className="heading-accent">{t('projected_balance') || 'Projected Balance'}</h3>
              <span className="bt-badge">{t('forecast_90_days') || '90-Day Forecast'}</span>
            </div>

            <div style={{ height: 340, width: '100%', marginTop: 24 }}>
              <ResponsiveContainer>
                <AreaChart data={projectionData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cashflowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={gradientColor} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={gradientColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="dateStr"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    axisLine={false} tickLine={false} minTickGap={30}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    axisLine={false} tickLine={false} width={62}
                    tickFormatter={val =>
                      val >= 1000 || val <= -1000
                        ? `${currencyInfo?.symbol || '₹'}${(val / 1000).toFixed(0)}k`
                        : `${currencyInfo?.symbol || '₹'}${val}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 12,
                    }}
                    formatter={val => [fmt(val), 'Balance']}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                  />
                  <ReferenceLine
                    y={safetyThreshold}
                    stroke="var(--warning)"
                    strokeDasharray="5 3"
                    label={{ position: 'insideTopLeft', value: 'Safety Floor', fill: 'var(--warning)', fontSize: 11, fontWeight: 700 }}
                  />
                  {hasWhatIf && (
                    <ReferenceLine
                      x={projectionData[0]?.dateStr}
                      stroke="var(--danger)"
                      strokeDasharray="3 3"
                      label={{ position: 'top', value: `-${fmt(parseFloat(whatIfAmount))}`, fill: 'var(--danger)', fontSize: 10 }}
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
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* ── AI Summary ── */}
        {transactions.length > 0 && (
          <motion.div
            className="glass bento-tile"
            style={{
              padding: 24,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, transparent 100%)',
              border: '1px solid rgba(139,92,246,0.2)',
            }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          >
            <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BrainCircuit size={18} style={{ color: '#a78bfa' }} />
              AI Forecast Summary
              {isSafe
                ? <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> On Track</span>
                : <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14} /> Warning</span>
              }
            </h3>
            <div style={{ color: 'var(--text-secondary)', marginTop: 12, fontSize: '0.92rem', lineHeight: 1.65 }}>
              {isAiLoading
                ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Analyzing 90-day trajectory…</span>
                : <p>{aiSummary}</p>
              }
              
              {/* Sensitivity Bounds */}
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                 <div style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', flex: 1 }}>
                     <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Best Case (+20%)</div>
                     <div style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>{fmt(bestCaseFinal)}</div>
                 </div>
                 <div style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px', flex: 1 }}>
                     <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Worst Case (-20%)</div>
                     <div style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmt(worstCaseFinal)}</div>
                 </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Action Console ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>

          {/* Safety Threshold */}
          <motion.div className="glass bento-tile" style={{ padding: 24 }} whileHover={{ y: -2 }}>
            <div className="bt-header" style={{ marginBottom: 16 }}>
              <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={18} /> {t('safety_buffer') || 'Safety Threshold'}
              </h3>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
              Your absolute minimum cash floor. The engine warns you whenever projections breach this level over 90 days.
            </p>
            <div>
              <input
                type="range"
                min="0" max="50000" step="500"
                value={safetyThreshold}
                onChange={e => setSafetyThreshold(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{fmt(0)}</span>
                <span style={{
                  color: 'var(--brand-primary)', fontWeight: 800, fontFamily: 'var(--font-mono)',
                  background: 'var(--glass-1)', padding: '5px 14px', borderRadius: 100,
                  border: '1px solid var(--glass-border)',
                }}>
                  {fmt(safetyThreshold)}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{fmt(50000)}</span>
              </div>
            </div>
          </motion.div>

          {/* What-If Simulator */}
          <motion.div className="glass bento-tile" style={{ padding: 24 }} whileHover={{ y: -2 }}>
            <div className="bt-header" style={{ marginBottom: 16 }}>
              <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} /> {t('what_if_simulator') || 'What-If Simulator'}
              </h3>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              Pre-flight a major purchase. Enter an amount below to instantly see how it warps your 90-day trajectory.
            </p>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
                {t('what_if_amount') || 'Hypothetical Purchase Amount'}
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--danger)', fontWeight: 900, fontSize: '1.1rem',
                }}>-</span>
                <input
                  type="number"
                  value={whatIfAmount}
                  onChange={e => setWhatIfAmount(e.target.value)}
                  placeholder="e.g. 15000"
                  min="0"
                  style={{
                    paddingLeft: 32, width: '100%',
                    fontSize: '1.1rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                    background: 'var(--surface-1)',
                  }}
                />
              </div>
            </div>

            {/* FIX: Only show when there's actually a valid positive number */}
            <AnimatePresence>
              {hasWhatIf && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                  style={{
                    marginTop: 16, padding: '10px 14px',
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 10, fontSize: '0.86rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)', fontWeight: 600 }}>
                    <Activity size={15} /> Simulating -{fmt(parseFloat(whatIfAmount))} outflow
                  </div>
                  <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
                    Adjusted 90-day end: <strong style={{ color: projectedFinal >= safetyThreshold ? 'var(--brand-primary)' : 'var(--danger)' }}>
                      {fmt(projectedFinal)}
                    </strong>
                    {dangerZone && (
                      <span style={{ color: 'var(--danger)' }}> · hits floor in {dangerZone.day}d</span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
