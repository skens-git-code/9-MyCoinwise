import React, { useState, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Target, Trash2, Trophy, PlusCircle, Edit3, Clock, Zap } from 'lucide-react';
import { AppContext } from '../App';
import { predictTimeToGoal } from '../services/aiEngine';
import { api } from '../services/api';

const GOAL_COLORS = ['#059669', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
const GOAL_ICONS = ['🎯', '💻', '✈️', '🎮', '📚', '🏋️', '🎸', '🚗'];

export default function Goals() {
  const { transactions, fmt, goals, refetch, USER_ID } = useContext(AppContext);
  const [showAdd, setShowAdd] = useState(false);
  const [contributeGoal, setContributeGoal] = useState(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🎯');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState(null);

  const totalSaved = transactions.reduce(
    (a, c) => c.type === 'income' ? a + Number(c.amount) : a - Number(c.amount), 0
  );

  const addGoal = async () => {
    if (!name.trim() || !target || parseFloat(target) <= 0) return;
    setIsSubmitting(true);
    try {
      await api.createGoal({
        user_id: USER_ID,
        name: name.trim(),
        target: parseFloat(target),
        saved: parseFloat(saved) || 0,
        color: GOAL_COLORS[goals.length % GOAL_COLORS.length],
        icon: selectedIcon
      });
      await refetch();
      setName(''); setTarget(''); setSaved(''); setShowAdd(false); setSelectedIcon('🎯');
    } catch (err) {
      console.error('Failed to create goal', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!goalToDelete) return;
    setIsSubmitting(true);
    try {
      await api.deleteGoal(goalToDelete);
      await refetch();
      setGoalToDelete(null);
    } catch (err) {
      console.error('Failed to delete goal', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const contribute = async (id) => {
    const amt = parseFloat(contributeAmount);
    if (!amt || isNaN(amt)) return; // Allow negative amounts to remove funds
    setIsSubmitting(true);
    try {
      const goal = goals.find(g => g.id === id);
      const newSaved = Math.max(0, parseFloat((Number(goal.saved) + amt).toFixed(2)));
      await api.updateGoal(id, { saved: newSaved });
      await refetch();
      setContributeGoal(null);
      setContributeAmount('');
    } catch (err) {
      console.error('Failed to update goal', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalGoalTarget = goals.reduce((a, c) => a + Number(c.target), 0);
  const totalGoalSaved = goals.reduce((a, c) => a + Number(c.saved), 0);

  return (
    <div className="masonry-layout-page">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>Savings Goals</h2>
          <span className="mh-badge">{goals.length} active</span>
        </div>
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> New Goal
        </motion.button>
      </div>

      {/* Summary Banner - Horizontal Carousel */}
      <div className="carousel-wrapper" style={{ minHeight: 110 }}>
        <div className="carousel-track">
          {[
            { label: 'Net Available', value: fmt(totalSaved), color: totalSaved >= 0 ? 'var(--success)' : 'var(--danger)', icon: '💰' },
            { label: 'Target Amount', value: fmt(totalGoalTarget), color: 'var(--brand-primary)', icon: '🎯' },
            { label: 'Contributed', value: fmt(totalGoalSaved), color: 'var(--brand-secondary)', icon: '✅' },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.9, x: 20 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ delay: i * 0.1, type: 'spring' }}
              className="carousel-item glass"
              style={{ border: `1px solid ${s.color}44`, boxShadow: `0 8px 32px ${s.color}15` }}
            >
              <div className="ci-icon-box" style={{ background: `${s.color}22`, color: s.color }}>
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

      {/* Goals Grid - Masonry */}
      {goals.length === 0 ? (
        <motion.div className="glass empty-state" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Target size={52} />
          <p className="primary-msg">No goals yet.</p>
          <p className="secondary-msg">Set your first savings target for a trip, a gadget, or an emergency fund.</p>
          <motion.button whileHover={{ scale: 1.04 }} className="btn-primary" style={{ marginTop: 20 }} onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Create Goal
          </motion.button>
        </motion.div>
      ) : (
        <div className="masonry-grid">
          <AnimatePresence>
            {goals.map((g, i) => {
              const pct = Math.max(0, Math.min(100, (Number(g.saved) / Number(g.target)) * 100)) || 0;
              const done = pct >= 100;
              const ageInDays = g.created_at ? (new Date() - new Date(g.created_at)) / (1000 * 60 * 60 * 24) : 0;
              const isStuck = pct < 15 && ageInDays > 14;
              return (
                <motion.div
                  key={g.id} className={`masonry-card glass ${done ? 'masonry-card-done' : ''}`}
                  initial={{ opacity: 0, scale: 0.93, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.88, y: 10 }}
                  transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
                  style={{ '--mc-color': g.color }}
                >
                  {done && (
                    <motion.div className="mc-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}>
                      🎉 Achieved!
                    </motion.div>
                  )}

                  <div className="mc-header">
                    <div className="mc-icon">{g.icon || '🎯'}</div>
                    <button className="del-btn" onClick={() => setGoalToDelete(g.id)}><Trash2 size={16} /></button>
                  </div>

                  <h3 className="mc-title">{g.name}</h3>

                  <div className="mc-amounts">
                    <span className="mc-saved">{fmt(g.saved)}</span>
                    <span className="mc-target">of {fmt(g.target)}</span>
                  </div>

                  <div className="mc-progress-box">
                    <div className="mc-progress-track">
                      <motion.div
                        className={`mc-progress-fill ${isStuck ? 'pulse-encouragement' : ''}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                      />
                    </div>
                    <div className="mc-progress-stats">
                      <span>{pct.toFixed(0)}% completed</span>
                      <span>{fmt(Math.max(0, Number(g.target) - Number(g.saved)))} left</span>
                    </div>
                    {isStuck && !done && (
                      <p className="bg-nudge" style={{ marginTop: 8 }}>
                        Almost there! Add {fmt(Math.max(10, g.target * 0.05))} to reach your goal.
                      </p>
                    )}
                  </div>

                  <div className="mc-footer">
                    {!done && (
                      <motion.button
                        className="mc-contribute-btn"
                        whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }}
                        onClick={() => { setContributeGoal(g.id); setContributeAmount(''); }}
                      >
                        <PlusCircle size={14} /> Add / Remove Funds
                      </motion.button>
                    )}

                    {/* AI Time Prediction */}
                    {!done && (() => {
                      const pred = predictTimeToGoal(g, transactions);
                      if (!pred || pred.achieved) return null;
                      if (!pred.months) return (
                        <div className="mc-ai-pred mc-ai-empty">
                          <Zap size={12} /> Save regularly for AI predictions
                        </div>
                      );
                      return (
                        <motion.div className="mc-ai-pred" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <Clock size={12} /> <span>~{pred.months} mo</span> at {fmt(pred.savingsPerMonth)}/mo
                        </motion.div>
                      );
                    })()}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add Goal Modal */}
      <AnimatePresence mode="wait">
        {showAdd && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAdd(false)}>
            <motion.div className="modal-box glass" initial={{ scale: 0.88, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 24 }} transition={{ type: 'spring', damping: 22, stiffness: 300 }} onClick={e => e.stopPropagation()}>
              <h3>🎯 New Savings Goal</h3>
              <div className="form-field">
                <label>Goal Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. PS5, Laptop, Summer Trip" autoFocus />
              </div>
              <div className="form-field">
                <label>Choose Icon</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {GOAL_ICONS.map(ic => (
                    <button key={ic} type="button" onClick={() => setSelectedIcon(ic)}
                      style={{
                        width: 38, height: 38, borderRadius: 10, fontSize: '1.2rem', cursor: 'pointer',
                        background: selectedIcon === ic ? 'rgba(5, 150, 105,0.2)' : 'var(--glass-1)',
                        border: selectedIcon === ic ? '2px solid var(--brand-primary)' : '1px solid var(--glass-border)',
                        transition: 'all 0.15s'
                      }}
                    >{ic}</button>
                  ))}
                </div>
              </div>
              <div className="form-field"><label>Target Amount</label><input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 500" /></div>
              <div className="form-field"><label>Already Saved</label><input type="number" value={saved} onChange={e => setSaved(e.target.value)} placeholder="0" /></div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn-primary" onClick={addGoal} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Goal'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contribute Modal */}
      <AnimatePresence mode="wait">
        {contributeGoal !== null && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setContributeGoal(null)}>
            <motion.div className="modal-box glass" initial={{ scale: 0.88, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 24 }} transition={{ type: 'spring', damping: 22 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PlusCircle size={18} /> Add / Remove Funds</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Updating: <strong>{goals.find(g => g.id === contributeGoal)?.name}</strong>
              </p>
              <div className="form-field">
                <label>Amount (Use negative to remove)</label>
                <input type="number" step="0.01" value={contributeAmount} onChange={e => setContributeAmount(e.target.value)} placeholder="e.g. 25.00 or -10.00" autoFocus />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setContributeGoal(null)}>Cancel</button>
                <button className="btn-primary" onClick={() => contribute(contributeGoal)} disabled={isSubmitting}>
                  {isSubmitting ? 'Updating...' : 'Add'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Delete Modal */}
      <AnimatePresence mode="wait">
        {goalToDelete !== null && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setGoalToDelete(null)}>
            <motion.div className="modal-box glass" initial={{ scale: 0.88, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 24 }} transition={{ type: 'spring', damping: 22 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)' }}><Trash2 size={18} /> Delete Goal?</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
                Are you sure you want to delete the goal <strong>{goals.find(g => g.id === goalToDelete)?.name}</strong>? This action cannot be undone.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setGoalToDelete(null)}>Cancel</button>
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
