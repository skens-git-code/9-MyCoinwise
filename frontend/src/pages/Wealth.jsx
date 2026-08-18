import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from 'recharts';
import {
  Briefcase, TrendingUp, AlertOctagon, Sparkles,
  RefreshCw, Plus, X, Trash2, Edit3, ShieldAlert,
  Calculator, CheckCircle2, DollarSign, Clock, ArrowUpRight
} from 'lucide-react';
import axios from 'axios';
import { AppContext } from '../contexts/AppContext';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

const API_BASE = import.meta.env.VITE_API_URL || 'https://nine-budgettracker.onrender.com/api';

const CLASS_COLORS = {
  liquid_asset: '#3b82f6',
  illiquid_asset: '#8b5cf6',
  business_equity: '#10b981',
  retirement: '#f59e0b',
  liability: '#ef4444',
};

const CLASS_LABELS = {
  liquid_asset: '💧 Stocks, Cash & Crypto',
  illiquid_asset: '🏠 Real Estate, Gold & Physical',
  business_equity: '💼 Business Equity',
  retirement: '🛡️ Retirement & Pension',
  liability: '💳 Liability / Debt',
};

export default function Wealth() {
  const { fmt, token, t, theme } = useContext(AppContext);
  const { showToast } = useToast();

  const [wealthItems, setWealthItems] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Modals & CRUD
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Debt Payoff Simulator state
  const [selectedDebtId, setSelectedDebtId] = useState('');
  const [extraPayment, setExtraPayment] = useState(2000);
  const [monthlyBasePayment, setMonthlyBasePayment] = useState(5000);

  const aiTriggerKey = useRef('');
  const aiCooldown = useRef(0);
  const isDark = theme === 'amoled';

  const [formData, setFormData] = useState({
    name: '',
    asset_class: 'liquid_asset',
    base_value: '',
    symbol: '',
    quantity: '',
    interest_rate: '',
    acquisition_date: new Date().toISOString().split('T')[0],
  });

  // Fetch Wealth Data & History
  const fetchWealthData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const cfg = { headers: { Authorization: `Bearer ${token}` } };
      const [itemsRes, histRes] = await Promise.all([
        axios.get(`${API_BASE}/wealth/items`, cfg),
        axios.get(`${API_BASE}/wealth/history`, cfg).catch(() => ({ data: [] }))
      ]);
      setWealthItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setHistoryData(Array.isArray(histRes.data) ? histRes.data : []);
    } catch (err) {
      if (err.response?.status === 401) {
        setFetchError('Session expired. Please log out and log back in.');
        showToast('error', 'Session expired.');
      } else {
        setFetchError('Cannot reach server.');
        showToast('error', 'Failed to fetch wealth data.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    if (token) fetchWealthData();
  }, [token, fetchWealthData]);

  // Core Financial Maths
  const {
    totalAssets,
    totalLiabilities,
    netWorth,
    liquidAssets,
    physicalAssets,
    assetAllocationData,
    liabilitiesList,
    toxicDebts,
    hasHighInterestDebts,
  } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    let liquid = 0;
    let physical = 0;
    const tDebts = [];
    const liabList = [];
    const classTotals = {};

    wealthItems.forEach(item => {
      const val = item.current_value ?? item.base_value ?? 0;

      if (item.asset_class === 'liability') {
        liabilities += Math.abs(val);
        const debtObj = { ...item, computedValue: Math.abs(val) };
        liabList.push(debtObj);
        if ((item.interest_rate || 0) > 12) tDebts.push(debtObj);
      } else {
        assets += val;
        classTotals[item.asset_class] = (classTotals[item.asset_class] || 0) + val;
        if (item.asset_class === 'liquid_asset') liquid += val;
        if (item.asset_class === 'illiquid_asset') physical += val;
      }
    });

    const allocation = Object.entries(classTotals)
      .filter(([, v]) => v > 0)
      .map(([cls, v]) => ({
        name: CLASS_LABELS[cls]?.split(' ')[1] || cls,
        value: v,
        color: CLASS_COLORS[cls] || '#64748b',
      }));

    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      netWorth: assets - liabilities,
      liquidAssets: liquid,
      physicalAssets: physical,
      assetAllocationData: allocation,
      liabilitiesList: liabList,
      toxicDebts: tDebts,
      hasHighInterestDebts: tDebts.length > 0,
    };
  }, [wealthItems]);

  const nwColor = netWorth >= 0 ? 'var(--brand-primary)' : 'var(--danger)';

  // AI Strategy Insights
  useEffect(() => {
    if (wealthItems.length === 0 || !token) {
      setAiInsight('Add assets and liabilities to unlock your AI wealth strategy.');
      return;
    }

    const payload = { totalAssets, liquidAssets, physicalAssets, liabilities: totalLiabilities };
    const newKey = JSON.stringify(payload);

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
        if (!cancelled) setAiInsight(res.data.insight || 'Portfolio strategy active.');
      } catch {
        if (!cancelled) setAiInsight('Maintain balanced asset allocation and pay down high-interest liabilities first.');
      } finally {
        if (!cancelled) setIsAiLoading(false);
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(fetchDebounced);
    };
  }, [totalAssets, totalLiabilities, liquidAssets, physicalAssets, token, wealthItems.length]);

  // Debt Payoff Simulator Math
  const debtPayoffCalculation = useMemo(() => {
    const debt = liabilitiesList.find(d => (d._id === selectedDebtId || d.id === selectedDebtId)) || liabilitiesList[0];
    if (!debt) return null;

    const principal = debt.computedValue || debt.base_value || 0;
    if (principal <= 0) return null;
    const annualRate = Math.max(0.1, debt.interest_rate || 10) / 100;
    const monthlyRate = annualRate / 12;

    const minRequiredPay = (principal * monthlyRate) + 50;
    const basePay = Math.max(monthlyBasePayment, minRequiredPay);
    const acceleratedPay = basePay + Math.max(0, Number(extraPayment));

    // Standard payoff months
    let balanceBase = principal;
    let monthsBase = 0;
    let totalInterestBase = 0;
    while (balanceBase > 0 && monthsBase < 360) {
      const interest = balanceBase * monthlyRate;
      totalInterestBase += interest;
      balanceBase = balanceBase + interest - basePay;
      monthsBase++;
      if (balanceBase <= 0) break;
    }

    // Accelerated payoff months
    let balanceAcc = principal;
    let monthsAcc = 0;
    let totalInterestAcc = 0;
    while (balanceAcc > 0 && monthsAcc < 360) {
      const interest = balanceAcc * monthlyRate;
      totalInterestAcc += interest;
      balanceAcc = balanceAcc + interest - acceleratedPay;
      monthsAcc++;
      if (balanceAcc <= 0) break;
    }

    return {
      debtName: debt.name,
      principal,
      monthsBase,
      monthsAcc,
      savedMonths: Math.max(0, monthsBase - monthsAcc),
      savedInterest: Math.max(0, totalInterestBase - totalInterestAcc)
    };
  }, [liabilitiesList, selectedDebtId, extraPayment, monthlyBasePayment]);

  // Form Handlers
  const openEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      asset_class: item.asset_class || 'liquid_asset',
      base_value: String(item.base_value || ''),
      symbol: item.symbol || '',
      quantity: String(item.quantity || ''),
      interest_rate: String(item.interest_rate || ''),
      acquisition_date: item.acquisition_date ? new Date(item.acquisition_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    });
  };

  const handleSaveItem = async () => {
    if (!formData.name.trim() || formData.base_value === '') {
      showToast('error', 'Please enter a name and base value.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        await axios.put(`${API_BASE}/wealth/items/${editingItem._id || editingItem.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        showToast('success', 'Entry updated successfully');
      } else {
        await axios.post(`${API_BASE}/wealth/items`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        showToast('success', 'Entry added successfully');
      }

      setIsAddingItem(false);
      setEditingItem(null);
      setFormData({
        name: '', asset_class: 'liquid_asset', base_value: '',
        symbol: '', quantity: '', interest_rate: '',
        acquisition_date: new Date().toISOString().split('T')[0],
      });
      fetchWealthData();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to save entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const id = itemToDelete;
    setIsSubmitting(true);
    try {
      await axios.delete(`${API_BASE}/wealth/items/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItemToDelete(null);
      fetchWealthData();
      showToast('success', 'Item deleted');
    } catch {
      showToast('error', 'Failed to delete item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="masonry-layout-page wealth-page-wrap">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{t('wealth')}</h2>
          <span className="mh-badge">Live Market Connected</span>
        </div>
        <div className="mh-actions" style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={fetchWealthData} title="Refresh valuations and live market prices">
            <RefreshCw size={15} className={isLoading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn-primary" onClick={() => { setEditingItem(null); setIsAddingItem(true); }}>
            <Plus size={16} /> Add Entry
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="glass error-banner" style={{ margin: '0 0 20px', padding: '12px 18px', borderLeft: '4px solid var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertOctagon size={18} className="text-danger" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Hero Net Worth Card */}
      <motion.div
        className="glass bento-tile hero-networth-card"
        style={{
          padding: '36px 24px', textAlign: 'center', borderColor: nwColor,
          boxShadow: `0 8px 40px 0 ${netWorth >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.2)'}`,
          marginBottom: 20
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.8rem', marginBottom: 8 }}>
          Total Net Worth
        </h3>
        <div style={{ fontSize: 'clamp(2.4rem, 5vw, 3.4rem)', fontWeight: 900, fontFamily: 'var(--font-mono)', color: nwColor }}>
          {fmt(netWorth)}
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 32 }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>Assets</div>
            <div style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{fmt(totalAssets)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>Liabilities</div>
            <div style={{ fontWeight: 700, color: 'var(--danger)' }}>-{fmt(totalLiabilities)}</div>
          </div>
        </div>
      </motion.div>

      {/* Warning: High Interest Debt */}
      {hasHighInterestDebts && (
        <motion.div className="glass" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 16, borderLeft: '4px solid var(--danger)', background: 'rgba(239,68,68,0.06)', borderRadius: 12, marginBottom: 20 }}>
          <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', margin: '0 0 4px 0' }}>
            <ShieldAlert size={18} /> High-Interest Debt Warning
          </h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
            You have {toxicDebts.length} high-interest debt(s) exceeding 12% interest ({toxicDebts.map(d => `${d.name} @ ${d.interest_rate}%`).join(', ')}). Use the Debt Payoff Simulator below to cut repayment interest.
          </p>
        </motion.div>
      )}

      {/* AI Strategy Coach */}
      <motion.div className="glass bento-tile" style={{ padding: 20, marginBottom: 20, background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, transparent 100%)', border: '1px solid rgba(139,92,246,0.2)' }}>
        <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a78bfa', fontSize: '0.95rem' }}>
          <Sparkles size={16} /> MyCoinwise AI Wealth Advisor
        </h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: '0.88rem', lineHeight: 1.5, margin: '8px 0 0 0' }}>
          {isAiLoading ? 'Analyzing portfolio asset allocation and debt-to-asset metrics…' : aiInsight}
        </p>
      </motion.div>

      {/* Charts Grid: Historical Net Worth Growth + Asset Allocation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>
        {/* Historical Net Worth Area Chart */}
        <motion.div className="glass bento-tile" style={{ padding: 20 }}>
          <h3 className="heading-accent" style={{ fontSize: '0.95rem', marginBottom: 12 }}>Net Worth Trajectory</h3>
          <div style={{ height: 220 }}>
            {historyData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} tickFormatter={v => fmt(v)} />
                  <Tooltip contentStyle={{ background: 'var(--surface-1)', borderRadius: 10 }} formatter={v => fmt(v)} />
                  <Area type="monotone" dataKey="netWorth" stroke="#10b981" fill="url(#nwGrad)" strokeWidth={2} name="Net Worth" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex-center" style={{ height: '100%', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Historical snapshots will appear here as your wealth updates over time.
              </div>
            )}
          </div>
        </motion.div>

        {/* Asset Allocation Pie */}
        <motion.div className="glass bento-tile" style={{ padding: 20 }}>
          <h3 className="heading-accent" style={{ fontSize: '0.95rem', marginBottom: 12 }}>Asset Allocation</h3>
          <div style={{ height: 220, position: 'relative' }}>
            {assetAllocationData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={assetAllocationData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                    {assetAllocationData.map((e, idx) => (
                      <Cell key={idx} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface-1)', borderRadius: 10 }} formatter={v => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex-center" style={{ height: '100%', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No assets logged yet.
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Debt Payoff / Loan Amortization Simulator */}
      {liabilitiesList.length > 0 && debtPayoffCalculation && (
        <motion.div className="glass bento-tile" style={{ padding: 22, marginBottom: 20 }}>
          <div className="bt-header" style={{ marginBottom: 14 }}>
            <h3 className="heading-accent" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>
              <Calculator size={18} className="text-brand" /> Debt Payoff & Interest Savings Simulator
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Liability</label>
              <select
                value={selectedDebtId || liabilitiesList[0]?._id}
                onChange={e => setSelectedDebtId(e.target.value)}
                className="filter-select"
                style={{ width: '100%', marginTop: 4 }}
              >
                {liabilitiesList.map(l => (
                  <option key={l._id || l.id} value={l._id || l.id}>
                    {l.name} ({fmt(l.computedValue)} @ {l.interest_rate || 10}%)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Standard Monthly Pay</label>
              <input
                type="number"
                value={monthlyBasePayment}
                onChange={e => setMonthlyBasePayment(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 8 }}
                placeholder="e.g. 5000"
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Extra Monthly Payment</label>
              <input
                type="number"
                value={extraPayment}
                onChange={e => setExtraPayment(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 8 }}
                placeholder="e.g. 2000"
              />
            </div>
          </div>

          <div className="debt-savings-banner glass" style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Interest Saved</div>
              <strong className="text-success" style={{ fontSize: '1.2rem' }}>+{fmt(debtPayoffCalculation.savedInterest)}</strong>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Time Cut Off</div>
              <strong className="text-brand" style={{ fontSize: '1.2rem' }}>{debtPayoffCalculation.savedMonths} Months Sooner</strong>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Accelerated Payoff</div>
              <strong>~{debtPayoffCalculation.monthsAcc} Months total</strong>
            </div>
          </div>
        </motion.div>
      )}

      {/* Portfolio Items Table */}
      <motion.div className="glass bento-tile" style={{ padding: 22 }}>
        <h3 className="heading-accent" style={{ marginBottom: 16 }}>Portfolio Assets & Liabilities</h3>
        {wealthItems.length === 0 ? (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Briefcase size={40} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
            <p>Your portfolio is empty. Add your first asset or debt above.</p>
          </div>
        ) : (
          wealthItems.map((item, idx) => (
            <div key={item._id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{item.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  <span className="badge" style={{ background: 'var(--glass-2)', marginRight: 6 }}>{CLASS_LABELS[item.asset_class] || item.asset_class}</span>
                  {item.symbol && <span style={{ color: '#3b82f6', fontWeight: 600 }}>{item.symbol} {item.quantity ? `× ${item.quantity}` : ''}</span>}
                  {item.interest_rate ? <span style={{ color: 'var(--danger)', marginLeft: 6 }}>{item.interest_rate}% interest</span> : null}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: item.asset_class === 'liability' ? 'var(--danger)' : 'var(--brand-primary)' }}>
                  {item.asset_class === 'liability' ? '-' : ''}{fmt(item.current_value ?? item.base_value)}
                </div>
                <button className="del-btn" onClick={() => openEdit(item)} title="Edit entry"><Edit3 size={15} /></button>
                <button className="del-btn" onClick={() => setItemToDelete(item._id || item.id)} title="Delete entry"><Trash2 size={15} /></button>
              </div>
            </div>
          ))
        )}
      </motion.div>

      {/* Add / Edit Wealth Modal */}
      <Modal
        isOpen={isAddingItem || editingItem !== null}
        onClose={() => { setIsAddingItem(false); setEditingItem(null); }}
        title={editingItem ? `✏️ Edit ${editingItem.name}` : `💎 Add Wealth Portfolio Entry`}
        confirmText={editingItem ? 'Update Entry' : 'Save Entry'}
        onConfirm={handleSaveItem}
        isLoading={isSubmitting}
      >
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Name</label>
          <input
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. HDFC Fixed Deposit, S&P 500 ETF, Home Mortgage"
            autoFocus
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="form-group">
            <label>Asset Category</label>
            <select
              value={formData.asset_class}
              onChange={e => setFormData({ ...formData, asset_class: e.target.value })}
              className="filter-select"
              style={{ width: '100%' }}
            >
              <option value="liquid_asset">💧 Stocks, Cash & Crypto</option>
              <option value="illiquid_asset">🏠 Real Estate, Gold & Physical</option>
              <option value="business_equity">💼 Business Equity</option>
              <option value="retirement">🛡️ Retirement & Pension</option>
              <option value="liability">💳 Liability / Debt</option>
            </select>
          </div>

          <div className="form-group">
            <label>{formData.asset_class === 'liability' ? 'Principal Owed' : 'Base Valuation'}</label>
            <input
              type="number"
              value={formData.base_value}
              onChange={e => setFormData({ ...formData, base_value: e.target.value })}
              placeholder="0.00"
            />
          </div>
        </div>

        {formData.asset_class === 'liquid_asset' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label>Ticker Symbol (optional)</label>
              <input
                value={formData.symbol}
                onChange={e => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                placeholder="AAPL, BTC, INFY"
              />
            </div>
            <div className="form-group">
              <label>Quantity / Units</label>
              <input
                type="number"
                value={formData.quantity}
                onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="e.g. 10"
              />
            </div>
          </div>
        )}

        {formData.asset_class === 'liability' && (
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Annual Interest Rate (%)</label>
            <input
              type="number"
              value={formData.interest_rate}
              onChange={e => setFormData({ ...formData, interest_rate: e.target.value })}
              placeholder="e.g. 8.5"
            />
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        title={t("delete_item")}
        confirmText={t("delete")}
        onConfirm={confirmDelete}
        isLoading={isSubmitting}
        danger={true}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
          Are you sure you want to completely remove this entry from your wealth portfolio?
        </p>
      </Modal>
    </div>
  );
}
