import React, { useState, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Edit3, RefreshCw, Calendar, TrendingDown,
  Pause, Play, XCircle, AlertCircle, Clock, CheckCircle2,
  CalendarDays, CreditCard, ChevronRight, Zap,
  Tv, Music, PlaySquare, Cloud, Gamepad2, Package, Sparkles
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

const PRESETS = [
  { name: 'Netflix', amount: 199.00, icon: 'Tv', color: '#ef4444' },
  { name: 'Spotify', amount: 89.00, icon: 'Music', color: '#10b981' },
  { name: 'YouTube Premium', amount: 89.00, icon: 'PlaySquare', color: '#f59e0b' },
  { name: 'Apple iCloud', amount: 1000.00, icon: 'Cloud', color: '#6b7280' },
  { name: 'Discord Nitro', amount: 9.99, icon: 'Gamepad2', color: '#059669' },
  { name: 'Xbox Game Pass', amount: 5000.00, icon: 'Gamepad2', color: '#10b981' },
  { name: 'Amazon Prime', amount: 1200.00, icon: 'Package', color: '#f59e0b' },
  { name: 'Disney+', amount: 500.00, icon: 'Sparkles', color: '#06b6d4' },
];

const IconMap = {
  Tv, Music, PlaySquare, Cloud, Gamepad2, Package, Sparkles
};

function getMonthlyEquivalent(sub) {
  const amt = Number(sub.amount) || 0;
  if (sub.is_paused || sub.cancelled_at) return 0;
  if (sub.cycle === 'yearly') return amt / 12;
  if (sub.cycle === 'quarterly') return amt / 3;
  if (sub.cycle === 'weekly') return amt * 4.333;
  if (sub.cycle === 'daily') return amt * 30;
  return amt; // monthly
}

export default function Subscriptions() {
  const { fmt, subscriptions: subs = [], transactions = [], refetch, USER_ID, t } = useContext(AppContext);
  const { showToast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [subToDelete, setSubToDelete] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'paused', 'cancelled'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState('monthly');
  const [icon, setIcon] = useState('💳');
  const [color, setColor] = useState('#059669');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');

  const handlePresetClick = (p) => {
    setName(p.name);
    setAmount(p.amount.toString());
    setCycle('monthly');
    setIcon(p.icon);
    setColor(p.color);
    setNextBillingDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setShowAdd(true);
  };

  const resetForm = () => {
    setName('');
    setAmount('');
    setCycle('monthly');
    setIcon('💳');
    setColor('#059669');
    setNextBillingDate('');
    setNotes('');
    setPaymentMethod('card');
    setEditingSub(null);
  };

  const openEdit = (s) => {
    setEditingSub(s);
    setName(s.name || '');
    setAmount(String(s.amount || ''));
    setCycle(s.cycle || 'monthly');
    setIcon(s.icon || '💳');
    setColor(s.color || '#059669');
    setNextBillingDate(s.next_billing_date ? new Date(s.next_billing_date).toISOString().split('T')[0] : '');
    setNotes(s.notes || '');
    setPaymentMethod(s.payment_method || 'card');
  };

  const handleSaveSub = async () => {
    const numAmt = parseFloat(amount);
    if (!name.trim() || isNaN(numAmt) || numAmt <= 0) {
      showToast('error', 'Please enter a valid subscription name and amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        user_id: USER_ID,
        name: name.trim(),
        amount: Math.round(numAmt * 100) / 100,
        cycle,
        color,
        icon,
        notes: notes.trim() || undefined,
        payment_method: paymentMethod,
        next_billing_date: nextBillingDate ? new Date(nextBillingDate) : undefined
      };

      if (editingSub) {
        await api.updateSubscription(editingSub.id || editingSub._id, payload);
        showToast('success', 'Subscription updated successfully!');
      } else {
        await api.createSubscription(payload);
        showToast('success', 'Subscription created successfully!');
      }

      await refetch();
      resetForm();
      setShowAdd(false);
    } catch {
      showToast('error', 'Failed to save subscription');
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePauseStatus = async (sub) => {
    const subId = sub.id || sub._id;
    const nextPaused = !sub.is_paused;
    try {
      await api.updateSubscription(subId, { is_paused: nextPaused });
      await refetch();
      showToast('success', nextPaused ? `Paused ${sub.name}` : `Resumed ${sub.name}`);
    } catch {
      showToast('error', 'Failed to update status');
    }
  };

  const confirmDelete = async () => {
    if (!subToDelete) return;
    setIsSubmitting(true);
    try {
      await api.deleteSubscription(subToDelete);
      await refetch();
      setSubToDelete(null);
      showToast('success', 'Subscription deleted');
    } catch {
      showToast('error', 'Failed to delete subscription');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Metrics
  const activeSubs = subs.filter(s => !s.is_paused && !s.cancelled_at);
  const monthlyTotal = activeSubs.reduce((a, s) => a + getMonthlyEquivalent(s), 0);
  const yearlyTotal = monthlyTotal * 12;

  // Monthly income estimate
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((a, c) => a + Number(c.amount), 0);
  const incomePct = totalIncome > 0 ? ((monthlyTotal / (totalIncome || 1)) * 100).toFixed(1) : 0;

  // Upcoming charges in next 30 days
  const upcomingBills = useMemo(() => {
    const now = new Date();

    return activeSubs
      .map(s => {
        let billDate = s.next_billing_date ? new Date(s.next_billing_date) : null;
        if (!billDate || billDate < now) {
          // Approximate next cycle date
          billDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
        }
        const daysLeft = Math.ceil((billDate - now) / (1000 * 60 * 60 * 24));
        return { sub: s, date: billDate, daysLeft };
      })
      .filter(b => b.daysLeft >= 0 && b.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [activeSubs]);

  const filteredSubs = useMemo(() => {
    if (statusFilter === 'active') return subs.filter(s => !s.is_paused && !s.cancelled_at);
    if (statusFilter === 'paused') return subs.filter(s => s.is_paused);
    if (statusFilter === 'cancelled') return subs.filter(s => s.cancelled_at);
    return subs;
  }, [subs, statusFilter]);

  const presetAlreadyAdded = (pName) => subs.some(s => s.name.toLowerCase() === pName.toLowerCase());

  return (
    <div className="masonry-layout-page subscriptions-page-wrap">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>Subscriptions & Recurring Hub</h2>
          <span className="mh-badge">{activeSubs.length} Active Services</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="btn-primary"
          onClick={() => { resetForm(); setShowAdd(true); }}
        >
          <Plus size={16} /> Add Subscription
        </motion.button>
      </div>

      {/* Cost Summary Banner */}
      <div className="carousel-wrapper" style={{ minHeight: 90 }}>
        <div className="carousel-track">
          {[
            { label: t('monthly_cost'), value: fmt(monthlyTotal), color: 'var(--danger)', icon: <Calendar size={18} /> },
            { label: t('annual_cost'), value: fmt(yearlyTotal), color: 'var(--warning)', icon: <TrendingDown size={18} /> },
            { label: '% of Income', value: `${incomePct}%`, color: '#0ea5e9', icon: <Zap size={18} /> },
            { label: t('active_subs'), value: activeSubs.length, color: 'var(--brand-primary)', icon: <CreditCard size={18} /> },
          ].map((s, i) => (
            <motion.div
              key={i}
              className="carousel-item glass"
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: i * 0.08, type: 'spring' }}
              style={{ border: `1px solid ${s.color}33`, boxShadow: `0 8px 24px ${s.color}15` }}
            >
              <div className="ci-icon-box" style={{ background: `${s.color}15`, color: s.color }}>
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

      {/* Upcoming Bill Calendar Timeline Strip */}
      {upcomingBills.length > 0 && (
        <motion.div className="sub-timeline-box glass" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="stb-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={16} className="text-brand" />
              <h4>Upcoming Charges (Next 30 Days)</h4>
            </div>
            <span className="stb-total">Total due: {fmt(upcomingBills.reduce((a, c) => a + Number(c.sub.amount), 0))}</span>
          </div>

          <div className="stb-track">
            {upcomingBills.map(({ sub, date, daysLeft }, idx) => (
              <div key={idx} className={`stb-item glass ${daysLeft <= 3 ? 'due-soon' : ''}`}>
                <span className="stb-icon">
                  {sub.icon && IconMap[sub.icon] ? React.createElement(IconMap[sub.icon], { size: 20 }) : '💳'}
                </span>
                <div className="stb-info">
                  <strong>{sub.name}</strong>
                  <span>{daysLeft === 0 ? 'Due Today' : `in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`} ({date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>
                </div>
                <span className="stb-amt text-danger">-{fmt(sub.amount)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Quick Add Presets */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <h4 style={{ marginBottom: 14, fontWeight: 800, fontFamily: 'var(--font-head)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem' }}>
          Quick Add Popular Services
        </h4>
        <div className="carousel-wrapper" style={{ paddingBottom: 12 }}>
          <div className="carousel-track">
            {PRESETS.map((p, i) => {
              const added = presetAlreadyAdded(p.name);
              return (
                <motion.button
                  key={i}
                  className="preset-btn"
                  disabled={added}
                  whileHover={added ? {} : { scale: 1.05, y: -4 }}
                  whileTap={added ? {} : { scale: 0.97 }}
                  onClick={() => !added && handlePresetClick(p)}
                  style={{
                    scrollSnapAlign: 'start', flex: '0 0 150px', padding: '16px 12px', borderRadius: 16,
                    background: added ? 'var(--surface-1)' : 'var(--glass-1)',
                    border: added ? `1px solid ${p.color}22` : `1px solid ${p.color}44`,
                    boxShadow: added ? 'none' : `0 8px 24px ${p.color}15`,
                    opacity: added ? 0.6 : 1, cursor: added ? 'default' : 'pointer', position: 'relative',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.3s'
                  }}
                >
                  {added && (
                    <span style={{ position: 'absolute', top: 6, right: 6, fontSize: '0.65rem', background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '2px 6px', borderRadius: 100, fontWeight: 800 }}>
                      Added
                    </span>
                  )}
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `${p.color}15`, color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    {p.icon && IconMap[p.icon] ? React.createElement(IconMap[p.icon], { size: 24 }) : '💳'}
                  </div>
                  <strong style={{ display: 'block', fontSize: '0.95rem', marginBottom: 4 }}>{p.name}</strong>
                  <span style={{ color: p.color, fontWeight: 700, fontSize: '0.78rem', background: `${p.color}15`, padding: '2px 8px', borderRadius: 100 }}>
                    {fmt(p.amount)}/mo
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Filter Tabs */}
      <div className="sub-filter-strip">
        {[
          { id: 'all', label: `All (${subs.length})` },
          { id: 'active', label: `Active (${activeSubs.length})` },
          { id: 'paused', label: `Paused (${subs.filter(s => s.is_paused).length})` }
        ].map(tab => (
          <button
            key={tab.id}
            className={`sfs-btn ${statusFilter === tab.id ? 'active' : ''}`}
            onClick={() => setStatusFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Subscriptions Grid */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        {filteredSubs.length === 0 ? (
          <motion.div className="glass empty-state" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '40px 20px', textAlign: 'center' }}>
            <RefreshCw size={42} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: '1rem' }}>No Subscriptions Found</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Add custom subscriptions or use the quick presets above.</p>
          </motion.div>
        ) : (
          <div className="masonry-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            <AnimatePresence>
              {filteredSubs.map((s, i) => {
                const subId = s.id || s._id;
                const monthly = getMonthlyEquivalent(s);
                const isPaused = Boolean(s.is_paused);

                return (
                  <motion.div
                    key={subId}
                    className={`masonry-card glass ${isPaused ? 'sub-paused' : ''}`}
                    initial={{ opacity: 0, scale: 0.93, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.88, y: 10 }}
                    layout
                    transition={{ delay: i * 0.04, type: 'spring', damping: 20 }}
                    style={{ '--mc-color': s.color, padding: 18 }}
                  >
                    <div className="mc-header" style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="mc-icon">
                          {s.icon && IconMap[s.icon] ? React.createElement(IconMap[s.icon], { size: 24 }) : '💳'}
                        </div>
                        {isPaused && <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--warning)' }}>Paused</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="del-btn" onClick={() => togglePauseStatus(s)} title={isPaused ? 'Resume subscription' : 'Pause subscription'}>
                          {isPaused ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                        <button className="del-btn" onClick={() => openEdit(s)} title="Edit subscription"><Edit3 size={14} /></button>
                        <button className="del-btn" onClick={() => setSubToDelete(subId)} title="Delete subscription"><Trash2 size={14} /></button>
                      </div>
                    </div>

                    <h3 className="mc-title">{s.name}</h3>

                    <div className="mc-amounts" style={{ marginBottom: 12, alignItems: 'center' }}>
                      <span className="mc-saved" style={{ fontSize: '1.6rem', letterSpacing: '-0.5px' }}>{fmt(s.amount)}</span>
                      <span className="mc-target" style={{ textTransform: 'capitalize', background: 'var(--surface-1)', padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem' }}>
                        /{s.cycle}
                      </span>
                    </div>

                    {s.notes && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 10px 0', fontStyle: 'italic' }}>
                        {s.notes}
                      </p>
                    )}

                    <div className="mc-footer" style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: 12 }}>
                      <div className="mc-ai-pred" style={{ justifyContent: 'space-between', background: 'var(--surface-1)', border: 'none' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem' }}>
                          <Calendar size={12} /> Monthly Equivalent
                        </span>
                        <span style={{ color: isPaused ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                          {isPaused ? 'Paused' : `~${fmt(monthly)}`}
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

      {/* Add / Edit Subscription Modal */}
      <Modal
        isOpen={showAdd || editingSub !== null}
        onClose={() => { setShowAdd(false); resetForm(); }}
        title={editingSub ? `✏️ Edit ${editingSub.name}` : `💳 Add Custom Subscription`}
        confirmText={editingSub ? 'Update Subscription' : 'Save Subscription'}
        onConfirm={handleSaveSub}
        isLoading={isSubmitting}
      >
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Service Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Netflix, Gym, AWS" autoFocus />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Amount</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 14.99"
          />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Billing Cycle</label>
          <select value={cycle} onChange={e => setCycle(e.target.value)} className="filter-select" style={{ width: '100%' }}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Next Renewal Date</label>
          <input type="date" value={nextBillingDate} onChange={e => setNextBillingDate(e.target.value)} />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Payment Method</label>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="filter-select" style={{ width: '100%' }}>
            <option value="card">Credit / Debit Card</option>
            <option value="bank_transfer">Bank Transfer / Direct Debit</option>
            <option value="upi">UPI</option>
            <option value="wallet">Digital Wallet / PayPal</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Notes <span className="form-label-hint">(optional)</span></label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Shared with family, renews automatically" />
        </div>
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal
        isOpen={subToDelete !== null}
        onClose={() => setSubToDelete(null)}
        title={t("delete_subscription")}
        confirmText={t("delete")}
        onConfirm={confirmDelete}
        isLoading={isSubmitting}
        danger={true}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
          Are you sure you want to delete <strong>{subs.find(s => (s.id === subToDelete || s._id === subToDelete))?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
