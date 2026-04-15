import React, { useState, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, RefreshCw, Calendar, TrendingDown } from 'lucide-react';
import { AppContext } from '../App';
import { api } from '../services/api';

const PRESETS = [
  { name: 'Netflix', amount: 15.49, icon: '🎬', color: '#ef4444' },
  { name: 'Spotify', amount: 5.99, icon: '🎵', color: '#10b981' },
  { name: 'YouTube Premium', amount: 13.99, icon: '▶️', color: '#f59e0b' },
  { name: 'Apple iCloud', amount: 2.99, icon: '☁️', color: '#6b7280' },
  { name: 'Discord Nitro', amount: 9.99, icon: '🎮', color: '#059669' },
  { name: 'Xbox Game Pass', amount: 14.99, icon: '🕹️', color: '#10b981' },
  { name: 'Amazon Prime', amount: 14.99, icon: '📦', color: '#f59e0b' },
  { name: 'Disney+', amount: 7.99, icon: '🏰', color: '#06b6d4' },
];

function getMonthlyEquivalent(sub) {
  const amt = Number(sub.amount) || 0;
  if (sub.cycle === 'yearly') return amt / 12;
  if (sub.cycle === 'weekly') return amt * 4.333;
  return amt; // monthly
}

export default function Subscriptions() {
  const { fmt, subscriptions: subs, refetch, USER_ID } = useContext(AppContext);
  const [showAdd, setShowAdd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subToDelete, setSubToDelete] = useState(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState('monthly');

  const addSub = async (sub) => {
    const newSub = sub || { name, amount: parseFloat(amount), cycle, icon: '💳', color: '#059669' };
    if (!newSub.name || !newSub.amount) return;
    setIsSubmitting(true);
    try {
      await api.createSubscription({
        user_id: USER_ID,
        name: newSub.name,
        amount: newSub.amount,
        cycle: newSub.cycle,
        color: newSub.color,
        icon: newSub.icon
      });
      await refetch();
      setName(''); setAmount(''); setCycle('monthly'); setShowAdd(false);
    } catch (err) {
      console.error('Failed to create subscription', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!subToDelete) return;
    setIsSubmitting(true);
    try {
      await api.deleteSubscription(subToDelete);
      await refetch();
      setSubToDelete(null);
    } catch (err) {
      console.error('Failed to delete subscription', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const monthlyTotal = subs.reduce((a, s) => a + getMonthlyEquivalent(s), 0);
  const yearlyTotal = monthlyTotal * 12;
  const weeklyTotal = monthlyTotal / 4.333;

  const presetAlreadyAdded = (name) => subs.some(s => s.name === name);

  const SUB_VAR = {
    hidden: { opacity: 0, x: -14 },
    show: { opacity: 1, x: 0 }
  };

  return (
    <div className="masonry-layout-page">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>Subscriptions</h2>
          <span className="mh-badge">{subs.length} active</span>
        </div>
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Custom
        </motion.button>
      </div>

      {/* Cost Summary - Carousel */}
      <div className="carousel-wrapper" style={{ minHeight: 90 }}>
        <div className="carousel-track">
          {[
            { label: 'Monthly Cost', value: fmt(monthlyTotal), color: 'var(--danger)', icon: <Calendar size={18} /> },
            { label: 'Annual Cost', value: fmt(yearlyTotal), color: 'var(--warning)', icon: <TrendingDown size={18} /> },
            { label: 'Weekly Cost', value: fmt(weeklyTotal), color: 'var(--brand-primary)', icon: <RefreshCw size={18} /> },
            { label: 'Active Subs', value: subs.length, color: 'var(--brand-secondary)', icon: '📋' },
          ].map((s, i) => (
            <motion.div key={i} className="carousel-item glass" initial={{ opacity: 0, scale: 0.9, x: 20 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ delay: i * 0.1, type: 'spring' }} style={{ border: `1px solid ${s.color}33`, boxShadow: `0 8px 24px ${s.color}15` }}>
              <div className="ci-icon-box" style={{ background: `${s.color}15`, color: s.color, filter: `drop-shadow(0 0 8px ${s.color}55)` }}>
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

      {/* Quick Add Presets - Carousel */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h4 style={{ marginBottom: 16, fontWeight: 800, fontFamily: 'var(--font-head)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem' }}>⚡ Quick Add Popular Services</h4>
        <div className="carousel-wrapper" style={{ paddingBottom: 16 }}>
          <div className="carousel-track">
            {PRESETS.map((p, i) => {
              const added = presetAlreadyAdded(p.name);
              return (
                <motion.button
                  key={i} className="preset-btn"
                  whileHover={added ? {} : { scale: 1.05, y: -4 }} whileTap={added ? {} : { scale: 0.97 }}
                  onClick={() => !added && addSub({ ...p, cycle: 'monthly' })}
                  style={{
                    scrollSnapAlign: 'start', flex: '0 0 160px', padding: '20px 14px', borderRadius: 20,
                    background: added ? 'var(--surface-1)' : 'var(--glass-1)',
                    border: added ? `1px solid ${p.color}22` : `1px solid ${p.color}44`,
                    boxShadow: added ? 'none' : `0 8px 24px ${p.color}15`,
                    opacity: added ? 0.6 : 1, cursor: added ? 'default' : 'pointer', position: 'relative',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all 0.3s'
                  }}
                >
                  {added && <span style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.65rem', background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '2px 6px', borderRadius: 100, fontWeight: 800 }}>Added</span>}
                  <span style={{ fontSize: '2rem', filter: added ? 'none' : `drop-shadow(0 4px 8px ${p.color}66)` }}>{p.icon}</span>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{p.name}</span>
                  <span style={{ color: p.color, fontWeight: 700, fontSize: '0.8rem', background: `${p.color}15`, padding: '2px 8px', borderRadius: 100 }}>{fmt(p.amount)}/mo</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Subs List - Masonry Grid */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h4 style={{ marginBottom: 16, fontWeight: 800, fontFamily: 'var(--font-head)', fontSize: '1.1rem' }}>Your Subscriptions</h4>
        {subs.length === 0 ? (
           <motion.div className="glass empty-state" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
             <RefreshCw size={52} />
             <p className="primary-msg">No active subscriptions.</p>
             <p className="secondary-msg">Add custom subscriptions or use the quick presets above.</p>
           </motion.div>
        ) : (
          <div className="masonry-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            <AnimatePresence>
              {subs.map((s, i) => {
                const monthly = getMonthlyEquivalent(s);
                return (
                  <motion.div
                    key={s.id} className="masonry-card glass"
                    initial={{ opacity: 0, scale: 0.93, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.88, y: 10 }} layout
                    transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
                    style={{ '--mc-color': s.color, padding: 20 }}
                  >
                    <div className="mc-header" style={{ marginBottom: 12 }}>
                      <div className="mc-icon" style={{ filter: `drop-shadow(0 0 12px ${s.color}66)` }}>{s.icon || '💳'}</div>
                      <button className="del-btn" onClick={() => setSubToDelete(s.id)}><Trash2 size={16} /></button>
                    </div>
                    
                    <h3 className="mc-title">{s.name}</h3>
                    
                    <div className="mc-amounts" style={{ marginBottom: 16, alignItems: 'center' }}>
                      <span className="mc-saved" style={{ fontSize: '1.8rem', letterSpacing: '-0.5px' }}>{fmt(s.amount)}</span>
                      <span className="mc-target" style={{ textTransform: 'capitalize', background: 'var(--surface-1)', padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem' }}>/{s.cycle}</span>
                    </div>

                    <div className="mc-footer" style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: 16 }}>
                      <div className="mc-ai-pred" style={{ justifyContent: 'space-between', background: 'var(--surface-1)', border: 'none' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontWeight: 600 }}><Calendar size={12}/> Equiv. Monthly</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>~{fmt(monthly)}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAdd(false)}>
            <motion.div className="modal-box glass" initial={{ scale: 0.88, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 24 }} transition={{ type: 'spring', damping: 22, stiffness: 300 }} onClick={e => e.stopPropagation()}>
              <h3>💳 New Subscription</h3>
              <div className="form-field"><label>Service Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Netflix, Gym" autoFocus /></div>
              <div className="form-field"><label>Amount</label><input type="text" inputMode="decimal" value={amount} onChange={e => { let v = e.target.value.replace(/[^0-9.]/g, ''); const p = v.split('.'); if (p.length > 2) v = p[0] + '.' + p.slice(1).join(''); setAmount(v); }} placeholder="9.99" /></div>
              <div className="form-field">
                <label>Billing Cycle</label>
                <select value={cycle} onChange={e => setCycle(e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn-primary" onClick={() => addSub(null)} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Delete Modal */}
      <AnimatePresence>
        {subToDelete !== null && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSubToDelete(null)}>
            <motion.div className="modal-box glass" initial={{ scale: 0.88, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 24 }} transition={{ type: 'spring', damping: 22 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)' }}><Trash2 size={18} /> Delete Subscription?</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
                Are you sure you want to delete <strong>{subs.find(s => s.id === subToDelete)?.name}</strong>? This action cannot be undone.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setSubToDelete(null)}>Cancel</button>
                <button className="btn-primary" style={{ background: 'var(--danger)' }} onClick={confirmDelete} disabled={isSubmitting}>
                  {isSubmitting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
