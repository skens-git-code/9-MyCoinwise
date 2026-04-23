import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell
} from 'recharts';
import {
  Briefcase, TrendingUp, AlertOctagon, Sparkles,
  RefreshCw, Plus, X, Trash2, Camera, ShieldAlert
} from 'lucide-react';
import axios from 'axios';
import { AppContext } from '../App';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Palette for dynamic asset class pie slices
const CLASS_COLORS = {
  liquid_asset: '#3b82f6',
  illiquid_asset: '#8b5cf6',
  liability: '#ef4444',
};

const CLASS_LABELS = {
  liquid_asset: 'Liquid Assets',
  illiquid_asset: 'Physical Assets',
  liability: 'Liabilities',
};

export default function Wealth() {
  const { fmt, token, t } = useContext(AppContext);

  const [wealthItems, setWealthItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Stable refs to prevent AI refetching
  const aiTriggerKey = useRef('');
  const aiCooldown = useRef(0);

  const [formData, setFormData] = useState({
    name: '',
    asset_class: 'liquid_asset',
    base_value: '',
    symbol: '',
    quantity: '',
    interest_rate: '',
    acquisition_date: new Date().toISOString().split('T')[0],
  });

  // ─── 1. Fetch from Backend ────────────────────────────────────────────────
  const fetchWealthData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const cfg = { headers: { Authorization: `Bearer ${token}` } };
      const itemsRes = await axios.get(`${API_BASE}/wealth/items`, cfg);
      setWealthItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
    } catch (err) {
      if (err.response?.status === 401) {
        setFetchError('Session expired. Please log out and log back in.');
      } else {
        setFetchError('Cannot reach the MyCoinwise server. Is the backend running?');
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchWealthData();
  }, [token, fetchWealthData]);

  // ─── 2. Core Financial Maths (frontend display only — values from backend) ─
  const {
    totalAssets,
    totalLiabilities,
    netWorth,
    liquidAssets,
    physicalAssets,
    assetAllocationData,
    toxicDebts,
    hasHighInterestDebts,
  } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    let liquid = 0;
    let physical = 0;
    const tDebts = [];
    const classTotals = {};

    wealthItems.forEach(item => {
      // Backend has already computed the canonical current_value (with depreciation / live price)
      const val = item.current_value ?? item.base_value ?? 0;

      if (item.asset_class === 'liability') {
        liabilities += Math.abs(val);
        tDebts.push({ ...item, computedValue: Math.abs(val) });
      } else {
        assets += val;
        classTotals[item.asset_class] = (classTotals[item.asset_class] || 0) + val;
        if (item.asset_class === 'liquid_asset') liquid += val;
        if (item.asset_class === 'illiquid_asset') physical += val;
      }
    });

    // Dynamic allocation data — one slice per unique non-liability asset class
    const allocation = Object.entries(classTotals)
      .filter(([, v]) => v > 0)
      .map(([cls, v]) => ({
        name: CLASS_LABELS[cls] || cls,
        value: v,
        color: CLASS_COLORS[cls] || '#64748b',
      }));

    // High interest debts: show warning for ANY >15% interest debt,
    // severity level determined by liquid asset ratio
    const highDebts = tDebts.filter(d => (d.interest_rate || 0) > 15);
    const highDebtTotal = highDebts.reduce((s, d) => s + d.computedValue, 0);

    let debtSeverity = 'info';
    let debtMsg = 'Consider paying off high-interest debt soon.';
    if (highDebts.length > 0) {
      if (liquid === 0 || highDebtTotal > liquid * 0.5) {
        debtSeverity = 'critical';
        debtMsg = 'CRITICAL RISK: High-interest debt exceeds 50% of your liquid assets.';
      } else if (highDebtTotal > liquid * 0.3) {
        debtSeverity = 'warning';
        debtMsg = 'WARNING: High-interest debt is consuming a large portion of your liquidity.';
      }
    }

    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      netWorth: assets - liabilities,
      liquidAssets: liquid,
      physicalAssets: physical,
      assetAllocationData: allocation,
      toxicDebts: highDebts,
      debtSeverity,
      debtMsg,
      hasHighInterestDebts: highDebts.length > 0,
    };
  }, [wealthItems]);

  const nwColor = netWorth >= 0 ? 'var(--brand-primary)' : 'var(--danger)';

  // ─── 3. AI Insights — Stable Dependencies, No Infinite Loop ──────────────
  useEffect(() => {
    if (wealthItems.length === 0 || !token) {
      setAiInsight('Add assets and liabilities to unlock your AI wealth strategy.');
      return;
    }

    const payload = { totalAssets, liquidAssets, physicalAssets, liabilities: totalLiabilities };
    const newKey = JSON.stringify(payload);

    // Prevent refetch if data hasn't changed or cooldown applies
    const now = Date.now();
    if (newKey === aiTriggerKey.current && now - aiCooldown.current < 30000) return;

    let cancelled = false;

    const fetchDebounced = setTimeout(async () => {
      aiTriggerKey.current = newKey;
      aiCooldown.current = Date.now();
      setIsAiLoading(true);
      try {
        const res = await axios.post(
          `${API_BASE}/wealth/ai-insights`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!cancelled) setAiInsight(res.data.insight || 'Neural network offline.');
      } catch {
        if (!cancelled) setAiInsight('AI Coach is temporarily offline. Your wealth data is secure.');
      } finally {
        if (!cancelled) setIsAiLoading(false);
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(fetchDebounced);
    };
  }, [totalAssets, totalLiabilities, liquidAssets, physicalAssets, token, wealthItems.length]);

  // ─── 4. CRUD Actions ──────────────────────────────────────────────────────
  const handleAddItem = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (formData.asset_class === 'liquid_asset') {
      const hasSymbol = formData.symbol && formData.symbol.trim() !== '';
      const hasQuantity = formData.quantity && Number(formData.quantity) > 0;

      if (hasSymbol && !hasQuantity) {
        setFormError('A valid Quantity (> 0) is required when a Ticker is provided.');
        return;
      }
    }

    try {
      await axios.post(`${API_BASE}/wealth/items`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsAddingItem(false);
      setFormData({
        name: '', asset_class: 'liquid_asset', base_value: '',
        symbol: '', quantity: '', interest_rate: '',
        acquisition_date: new Date().toISOString().split('T')[0],
      });
      fetchWealthData();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save entry. Please try again.');
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const id = itemToDelete;

    // Optimistic UI deletion
    const backupItems = [...wealthItems];
    setWealthItems(prev => prev.filter(item => item._id !== id));
    setItemToDelete(null);

    try {
      await axios.delete(`${API_BASE}/wealth/items/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Silent refresh to update backend historical snaps quietly
      fetchWealthData();
    } catch (err) {
      console.error('Delete Error:', err.response?.data || err.message);
      setWealthItems(backupItems); // Revert
      setFetchError('Failed to delete item from cloud. Local state reverted.');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="masonry-layout-page" style={{ opacity: 0.7 }}>
        <div className="masonry-header shimmer" style={{ height: 60, borderRadius: 16, marginBottom: 24 }}></div>
        <div className="masonry-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr)', gap: 24 }}>
          <div className="glass bento-tile shimmer" style={{ height: 240, borderRadius: 24 }}></div>
          <div className="glass bento-tile shimmer" style={{ height: 180, borderRadius: 24 }}></div>
          <div className="glass bento-tile shimmer" style={{ height: 320, borderRadius: 24 }}></div>
          <div className="glass bento-tile shimmer" style={{ height: 300, borderRadius: 24 }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="masonry-layout-page">

      {/* ── Header ── */}
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{t('wealth')}</h2>
          <span className="mh-badge">Live Market Connected</span>
        </div>
        <div className="mh-actions">
          <button className="btn-primary" onClick={() => setIsAddingItem(true)}>
            <Plus size={18} /> Add Entry
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {fetchError && (
        <div className="glass" style={{
          margin: '0 0 24px', padding: '12px 20px',
          borderLeft: '4px solid var(--danger)',
          background: 'rgba(239,68,68,0.05)',
          color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <AlertOctagon size={20} />
          <span>{fetchError}</span>
          <button onClick={fetchWealthData} className="btn-glass" style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '0.8rem' }}>
            Retry
          </button>
        </div>
      )}

      <div className="masonry-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr)' }}>

        {/* ── Hero: Net Worth ── */}
        <motion.div
          className="glass bento-tile"
          style={{
            padding: 40, textAlign: 'center',
            borderColor: nwColor,
            boxShadow: `0 8px 40px 0 ${netWorth >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.2)'}`,
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4 }}
        >
          <h3 style={{
            color: 'var(--text-secondary)', textTransform: 'uppercase',
            letterSpacing: 3, fontSize: '0.8rem', marginBottom: 12,
          }}>
            Total Net Worth
          </h3>
          <div style={{
            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
            fontWeight: 900, fontFamily: 'var(--font-mono)',
            color: nwColor, textShadow: `0 0 40px ${nwColor}`,
          }}>
            {fmt(netWorth)}
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 32 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Assets</div>
              <div style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{fmt(totalAssets)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Liabilities</div>
              <div style={{ fontWeight: 700, color: 'var(--danger)' }}>-{fmt(totalLiabilities)}</div>
            </div>
          </div>
        </motion.div>

        {/* ── Warning: High Interest Debt ── */}
        {hasHighInterestDebts && (
          <motion.div
            className="glass"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: 20, borderLeft: '4px solid var(--danger)', background: 'rgba(239,68,68,0.05)' }}
          >
            <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={20} />
              {toxicDebts.some(d => d.computedValue > liquidAssets * 0.3 && liquidAssets > 0)
                ? 'Critical Debt Risk'
                : 'High-Interest Debt Detected'}
            </h3>
            <p style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              You have {toxicDebts.length} debt(s) above 15% interest
              ({toxicDebts.map(d => `${d.name} @ ${d.interest_rate}%`).join(', ')}).
              Prioritize payoff to reclaim wealth trajectory.
            </p>
          </motion.div>
        )}

        {/* ── AI Coach ── */}
        <motion.div
          className="glass bento-tile"
          style={{
            padding: 24, marginTop: 12,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, transparent 100%)',
            border: '1px solid rgba(139,92,246,0.25)',
          }}
          whileHover={{ scale: 1.01 }}
        >
          <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a78bfa' }}>
            <Sparkles size={18} /> MyCoinwise AI Coach
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: 12, fontSize: '0.95rem', lineHeight: 1.6 }}>
            {isAiLoading
              ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Synthesizing portfolio vectors…</span>
              : aiInsight}
          </p>
        </motion.div>

        {/* ── Charts Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginTop: 12 }}>



          {/* Asset Allocation Donut */}
          <motion.div className="glass bento-tile" style={{ padding: 24, minHeight: 320 }} whileHover={{ y: -3 }}>
            <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Briefcase size={18} /> Asset Allocation
            </h3>
            <div style={{ height: 200, marginTop: 16, position: 'relative' }}>
              {totalAssets <= 0 || assetAllocationData.length === 0 ? (
                <div className="flex-center" style={{ height: '100%', color: 'var(--text-muted)' }}>
                  No assets logged.
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', borderRadius: 10 }}
                        formatter={v => fmt(v)}
                      />
                      <Pie
                        data={assetAllocationData}
                        cx="50%" cy="50%"
                        innerRadius={60} outerRadius={85}
                        paddingAngle={4}
                        dataKey="value" stroke="none"
                      >
                        {assetAllocationData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total</div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--brand-primary)' }}>{fmt(totalAssets)}</div>
                  </div>
                </>
              )}
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 12 }}>
              {assetAllocationData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  {d.name}
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── Portfolio Details List ── */}
        <motion.div className="glass bento-tile" style={{ padding: 24, marginTop: 12 }} whileHover={{ y: -2 }}>
          <h3 className="heading-accent" style={{ marginBottom: 16 }}>Portfolio Details</h3>
          {wealthItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <Briefcase size={36} opacity={0.3} style={{ marginBottom: 12 }} />
              <p>Your portfolio is empty. Add an asset or liability to get started.</p>
            </div>
          ) : (
            wealthItems.map((item, idx) => (
              <div key={item._id || idx} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 0', borderBottom: '1px solid var(--glass-border)',
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {CLASS_LABELS[item.asset_class] || item.asset_class}
                    {item.symbol && (
                      <span style={{ marginLeft: 8, color: '#3b82f6', fontWeight: 600 }}>
                        {item.symbol}
                        {item.quantity && ` × ${item.quantity}`}
                        {item.live_price && ` @ ${fmt(item.live_price)}`}
                      </span>
                    )}
                    {item.interest_rate && (
                      <span style={{ marginLeft: 8, color: 'var(--danger)' }}>
                        {item.interest_rate}% interest
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, textAlign: 'right' }}>
                  <div style={{
                    fontWeight: 800, fontSize: '1.05rem',
                    color: item.asset_class === 'liability' ? 'var(--danger)' : 'var(--brand-primary)',
                  }}>
                    {item.asset_class === 'liability' ? '-' : ''}{fmt(item.current_value ?? item.base_value)}
                  </div>
                  <button
                    onClick={() => setItemToDelete(item._id)}
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                    title="Remove from portfolio"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </motion.div>

      </div>

      {/* ── Add Entry Modal ── */}
      <AnimatePresence>
        {isAddingItem && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsAddingItem(false); }}>
            <motion.div
              className="glass-deep modal-content"
              style={{ maxWidth: 500 }}
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 10, opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, m: 0 }}>New Wealth Entry</h2>
                <button
                  onClick={() => setIsAddingItem(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, display: 'flex' }}
                >
                  <X size={20} />
                </button>
              </div>

              {formError && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: 'var(--danger)', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertOctagon size={16} /> {formError}
                </div>
              )}

              <form onSubmit={handleAddItem}>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6, fontWeight: 600 }}>Name</label>
                  <input
                    style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', padding: '12px 14px', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s' }}
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required placeholder="e.g. HDFC Savings, Honda City, SBI Home Loan"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6, fontWeight: 600 }}>Type</label>
                    <select
                      style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', padding: '12px 14px', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
                      value={formData.asset_class}
                      onChange={e => setFormData({ ...formData, asset_class: e.target.value })}
                    >
                      <option value="liquid_asset" style={{ background: '#1a1a1a' }}>💧 Liquid Asset</option>
                      <option value="illiquid_asset" style={{ background: '#1a1a1a' }}>🏠 Physical Asset</option>
                      <option value="liability" style={{ background: '#1a1a1a' }}>💳 Liability / Debt</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6, fontWeight: 600 }}>
                      {formData.asset_class === 'liability' ? 'Principal Owed' : 'Base Value (₹)'}
                    </label>
                    <input
                      type="number"
                      style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', padding: '12px 14px', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
                      value={formData.base_value}
                      onChange={e => setFormData({ ...formData, base_value: e.target.value })}
                      required min="0" step="any" placeholder="0.00"
                    />
                  </div>
                </div>

                {formData.asset_class === 'liquid_asset' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                    <div>
                      <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6, fontWeight: 600 }}>Ticker (optional)</label>
                      <input
                        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', padding: '12px 14px', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
                        value={formData.symbol}
                        onChange={e => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                        placeholder="AAPL / BTC-USD"
                      />
                    </div>
                    <div>
                      <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6, fontWeight: 600 }}>Quantity / Units</label>
                      <input
                        type="number"
                        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', padding: '12px 14px', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
                        value={formData.quantity}
                        onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                        min="0" step="any" placeholder="0"
                      />
                    </div>
                  </div>
                )}

                {formData.asset_class === 'liability' && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6, fontWeight: 600 }}>Annual Interest Rate (%)</label>
                    <input
                      type="number"
                      style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', padding: '12px 14px', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
                      value={formData.interest_rate}
                      onChange={e => setFormData({ ...formData, interest_rate: e.target.value })}
                      min="0" max="100" step="0.1" placeholder="e.g. 18"
                    />
                  </div>
                )}

                {formData.asset_class === 'illiquid_asset' && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6, fontWeight: 600 }}>Acquisition Date</label>
                    <input
                      type="date"
                      style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', padding: '12px 14px', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
                      value={formData.acquisition_date}
                      onChange={e => setFormData({ ...formData, acquisition_date: e.target.value })}
                    />
                  </div>
                )}

                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 12, padding: '14px', fontSize: '1rem', fontWeight: 600, justifyContent: 'center' }}>
                  Save Entry
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {itemToDelete && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setItemToDelete(null); }}>
            <motion.div
              className="glass-deep modal-content"
              style={{ maxWidth: 400, textAlign: 'center', padding: '32px 24px' }}
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 10, opacity: 0, scale: 0.95 }}
            >
              <Trash2 size={48} color="var(--danger)" style={{ marginBottom: 16, opacity: 0.8 }} />
              <h3 style={{ marginBottom: 8 }}>Delete Item?</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.9rem' }}>
                Are you sure you want to completely remove this from your portfolio? This action cannot be undone.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button onClick={() => setItemToDelete(null)} className="btn-glass" style={{ justifyContent: 'center' }}>Cancel</button>
                <button onClick={confirmDelete} className="btn-primary" style={{ background: 'var(--danger)', justifyContent: 'center' }}>Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}



