import React, { useState, useContext, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Target, Trash2, Edit3, PlusCircle, Clock, Zap,
  FileText, Calendar, Award, Sparkles, CheckCircle2, ChevronRight
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { predictTimeToGoal } from '../services/aiEngine';
import { api } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

const GOAL_COLORS = ['#059669', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#ef4444'];
const GOAL_ICONS = ['🎯', '💻', '✈️', '🎮', '📚', '🏋️', '🎸', '🚗', '🏠', '💍', '🛡️', '📈'];
const GOAL_CATEGORIES = ['Emergency Fund', 'Vacation', 'Gadget', 'Investment', 'Vehicle', 'Home', 'Education', 'Other'];

// Lightweight Canvas Confetti Burst
function fireConfetti(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = canvas.offsetHeight;

  const particles = Array.from({ length: 60 }).map(() => ({
    x: width / 2,
    y: height / 2,
    vx: (Math.random() - 0.5) * 8,
    vy: (Math.random() - 0.7) * 9,
    size: Math.random() * 6 + 3,
    color: ['#10B981', '#059669', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6'][Math.floor(Math.random() * 6)],
    alpha: 1,
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 10
  }));

  let frameId;
  const render = () => {
    ctx.clearRect(0, 0, width, height);
    let alive = false;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // gravity
      p.alpha -= 0.015;
      p.rotation += p.rotSpeed;

      if (p.alpha > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (alive) {
      frameId = requestAnimationFrame(render);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  };

  frameId = requestAnimationFrame(render);
  return () => cancelAnimationFrame(frameId);
}

export default function Goals() {
  const { transactions = [], fmt, goals = [], refetch, USER_ID, t } = useContext(AppContext);
  const { showToast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalToDelete, setGoalToDelete] = useState(null);
  const [contributeGoal, setContributeGoal] = useState(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('All');

  // Form Fields
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('Emergency Fund');
  const [notes, setNotes] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🎯');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confettiCanvasRef = useRef(null);

  const totalSaved = transactions.reduce(
    (a, c) => c.type === 'income' ? a + Number(c.amount) : a - Number(c.amount), 0
  );

  const resetForm = () => {
    setName('');
    setTarget('');
    setSaved('');
    setDeadline('');
    setCategory('Emergency Fund');
    setNotes('');
    setSelectedIcon('🎯');
    setEditingGoal(null);
  };

  const openEdit = (g) => {
    setEditingGoal(g);
    setName(g.name || '');
    setTarget(String(g.target || ''));
    setSaved(String(g.saved || ''));
    setDeadline(g.deadline ? new Date(g.deadline).toISOString().split('T')[0] : '');
    setCategory(g.category || 'Other');
    setNotes(g.notes || '');
    setSelectedIcon(g.icon || '🎯');
  };

  // Add / Edit Goal Handler
  const handleSaveGoal = async () => {
    const trimmedName = name.trim();
    const targetNum = parseFloat(target);
    const savedNum = parseFloat(saved) || 0;

    if (!trimmedName) {
      showToast('error', 'Please enter a goal name.');
      return;
    }
    if (!target || isNaN(targetNum) || targetNum <= 0) {
      showToast('error', 'Target amount must be a positive number.');
      return;
    }
    if (savedNum < 0) {
      showToast('error', 'Already saved amount cannot be negative.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        user_id: USER_ID,
        name: trimmedName,
        target: Math.round(targetNum * 100) / 100,
        saved: Math.round(savedNum * 100) / 100,
        color: editingGoal?.color || GOAL_COLORS[goals.length % GOAL_COLORS.length],
        icon: selectedIcon,
        category,
        deadline: deadline ? new Date(deadline) : undefined,
        notes: notes.trim() || undefined,
      };

      if (editingGoal) {
        await api.updateGoal(editingGoal.id || editingGoal._id, payload);
        showToast('success', 'Goal updated successfully!');
      } else {
        await api.createGoal(payload);
        showToast('success', 'Goal created successfully!');
      }

      await refetch();
      resetForm();
      setShowAdd(false);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to save goal';
      showToast('error', msg);
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
      showToast('success', 'Goal deleted');
    } catch {
      showToast('error', 'Failed to delete goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const contribute = async (id) => {
    const amt = parseFloat(contributeAmount);
    if (!amt || isNaN(amt)) {
      showToast('error', 'Please enter a valid amount.');
      return;
    }
    setIsSubmitting(true);
    try {
      const goal = goals.find(g => (g.id === id || g._id === id));
      const newSaved = Math.max(0, parseFloat((Number(goal.saved) + amt).toFixed(2)));
      const willHit100 = newSaved >= Number(goal.target) && Number(goal.saved) < Number(goal.target);

      await api.updateGoal(id, { saved: newSaved });
      await refetch();
      setContributeGoal(null);
      setContributeAmount('');
      
      if (willHit100 && confettiCanvasRef.current) {
        fireConfetti(confettiCanvasRef.current);
        showToast('success', '🎉 Congratulations! You reached your goal target!');
      } else {
        showToast('success', amt > 0 ? 'Funds added to goal!' : 'Funds removed from goal!');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to update goal';
      showToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter goals by category
  const filteredGoals = useMemo(() => {
    if (activeCategoryFilter === 'All') return goals;
    return goals.filter(g => (g.category || 'Other') === activeCategoryFilter);
  }, [goals, activeCategoryFilter]);

  const totalGoalTarget = goals.reduce((a, c) => a + Number(c.target), 0);
  const totalGoalSaved = goals.reduce((a, c) => a + Number(c.saved), 0);

  return (
    <div className="masonry-layout-page goals-page-wrap">
      <canvas
        ref={confettiCanvasRef}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, width: '100vw', height: '100vh' }}
      />

      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{t('goals')}</h2>
          <span className="mh-badge">{goals.length} {t("active")}</span>
        </div>
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn-primary" onClick={() => { resetForm(); setShowAdd(true); }}>
          <Plus size={16} /> {t("new_goal")}
        </motion.button>
      </div>

      {/* Summary Banner */}
      <div className="carousel-wrapper" style={{ minHeight: 110 }}>
        <div className="carousel-track">
          {[
            { label: t('net_available'), value: fmt(totalSaved), color: totalSaved >= 0 ? 'var(--success)' : 'var(--danger)', icon: '💰' },
            { label: t('target_amount'), value: fmt(totalGoalTarget), color: 'var(--brand-primary)', icon: '🎯' },
            { label: t('contributed'), value: fmt(totalGoalSaved), color: 'var(--brand-secondary)', icon: '✅' },
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

      {/* Goal Categories Filter Strip */}
      <div className="goals-category-filter-strip">
        {['All', ...GOAL_CATEGORIES].map(cat => (
          <button
            key={cat}
            className={`gcf-pill ${activeCategoryFilter === cat ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Goals Grid */}
      {filteredGoals.length === 0 ? (
        <motion.div className="glass empty-state" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Target size={52} />
          <p className="primary-msg">{t("no_goals_yet")}</p>
          <p className="secondary-msg">{t("set_first_savings_target")}</p>
          <motion.button whileHover={{ scale: 1.04 }} className="btn-primary" style={{ marginTop: 20 }} onClick={() => { resetForm(); setShowAdd(true); }}>
            <Plus size={16} /> {t("create_goal")}
          </motion.button>
        </motion.div>
      ) : (
        <div className="masonry-grid">
          <AnimatePresence>
            {filteredGoals.map((g, i) => {
              const goalId = g.id || g._id;
              const pct = Math.max(0, Math.min(100, (Number(g.saved) / Number(g.target)) * 100)) || 0;
              const done = pct >= 100;
              const ageInDays = g.created_at ? (new Date() - new Date(g.created_at)) / (1000 * 60 * 60 * 24) : 0;
              const isStuck = pct < 15 && ageInDays > 14;

              // Calculate remaining days & required monthly rate
              let daysRemaining = null;
              let monthlyNeeded = null;
              if (g.deadline) {
                const diffMs = new Date(g.deadline) - new Date();
                daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                const monthsRemaining = Math.max(0.5, daysRemaining / 30);
                const remainingAmt = Math.max(0, Number(g.target) - Number(g.saved));
                monthlyNeeded = remainingAmt / monthsRemaining;
              }

              return (
                <motion.div
                  key={goalId}
                  className={`masonry-card glass ${done ? 'masonry-card-done' : ''}`}
                  initial={{ opacity: 0, scale: 0.93, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.88, y: 10 }}
                  transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
                  style={{ '--mc-color': g.color }}
                >
                  {done && (
                    <motion.div className="mc-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}>
                      🎉 {t("achieved")}
                    </motion.div>
                  )}

                  <div className="mc-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="mc-icon">{g.icon || '🎯'}</div>
                      <span className="goal-category-tag badge">{g.category || 'Goal'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="del-btn" onClick={() => openEdit(g)} title="Edit goal"><Edit3 size={15} /></button>
                      <button className="del-btn" onClick={() => setGoalToDelete(goalId)} title="Delete goal"><Trash2 size={15} /></button>
                    </div>
                  </div>

                  <h3 className="mc-title">{g.name}</h3>

                  {g.notes && (
                    <p className="mc-notes">
                      <FileText size={12} style={{ marginRight: 5, opacity: 0.55, flexShrink: 0, verticalAlign: 'middle' }} />
                      {g.notes}
                    </p>
                  )}

                  {/* Deadline & Target Contribution Metrics */}
                  {g.deadline && !done && (
                    <div className="goal-deadline-strip">
                      <span className="gds-item"><Calendar size={13} /> {daysRemaining} days left</span>
                      {monthlyNeeded > 0 && (
                        <span className="gds-item text-brand">Target: {fmt(monthlyNeeded)}/mo</span>
                      )}
                    </div>
                  )}

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

                    {/* Milestones 25%, 50%, 75%, 100% */}
                    <div className="goal-milestones-row">
                      {[25, 50, 75, 100].map(m => (
                        <span key={m} className={`g-milestone ${pct >= m ? 'reached' : ''}`}>
                          {m}%
                        </span>
                      ))}
                    </div>

                    <div className="mc-progress-stats">
                      <span>{pct.toFixed(0)}% completed</span>
                      <span>{fmt(Math.max(0, Number(g.target) - Number(g.saved)))} left</span>
                    </div>
                  </div>

                  <div className="mc-footer">
                    {!done && (
                      <motion.button
                        className="mc-contribute-btn"
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => { setContributeGoal(goalId); setContributeAmount(''); }}
                      >
                        <PlusCircle size={14} /> Add / Remove Funds
                      </motion.button>
                    )}

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

      {/* Add / Edit Goal Modal */}
      <Modal
        isOpen={showAdd || editingGoal !== null}
        onClose={() => { setShowAdd(false); resetForm(); }}
        title={editingGoal ? `✏️ Edit Savings Goal` : `🎯 ${t('new_goal') || 'New Savings Goal'}`}
        confirmText={editingGoal ? 'Update Goal' : (t('save_goal') || 'Save Goal')}
        onConfirm={handleSaveGoal}
        isLoading={isSubmitting}
      >
        <div className="form-group">
          <label>{t('goal_name') || 'Goal Name'}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dream Vacation" autoFocus />
        </div>

        <div className="form-group">
          <label>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="filter-select" style={{ width: '100%' }}>
            {GOAL_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>{t('choose_icon') || 'Choose Icon'}</label>
          <div className="goal-icon-picker">
            {GOAL_ICONS.map(ic => (
              <button
                key={ic}
                type="button"
                onClick={() => setSelectedIcon(ic)}
                className={`goal-icon-btn${selectedIcon === ic ? ' selected' : ''}`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>{t('target_amount') || 'Target Amount'}</label>
          <input type="number" min="0.01" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 500" />
        </div>

        <div className="form-group">
          <label>{t('already_saved') || 'Already Saved'}</label>
          <input type="number" min="0" step="0.01" value={saved} onChange={e => setSaved(e.target.value)} placeholder="0" />
        </div>

        <div className="form-group">
          <label>Target Deadline <span className="form-label-hint">({t('optional') || 'optional'})</span></label>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>

        <div className="form-group">
          <label>
            {t('description') || 'Description'}
            <span className="form-label-hint">({t('optional') || 'optional'})</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Saving for a trip to Japan in 2026..."
            maxLength={1000}
            rows={3}
          />
        </div>
      </Modal>

      {/* Contribute Modal */}
      <Modal
        isOpen={contributeGoal !== null}
        onClose={() => setContributeGoal(null)}
        title={t('contribute') || 'Add / Remove Funds'}
        confirmText={parseFloat(contributeAmount) < 0 ? (t('remove_funds') || 'Remove Funds') : (t('add_funds') || 'Add Funds')}
        onConfirm={() => contribute(contributeGoal)}
        isLoading={isSubmitting}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          Updating: <strong>{goals.find(g => (g.id === contributeGoal || g._id === contributeGoal))?.name}</strong>
        </p>
        <div className="form-group">
          <label>Amount (Use negative to remove)</label>
          <input
            type="number"
            step="0.01"
            value={contributeAmount}
            onChange={e => setContributeAmount(e.target.value)}
            placeholder="e.g. 25.00 or -10.00"
            autoFocus
          />
        </div>
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal
        isOpen={goalToDelete !== null}
        onClose={() => setGoalToDelete(null)}
        title={t("delete_goal")}
        confirmText={t("delete")}
        onConfirm={confirmDelete}
        isLoading={isSubmitting}
        danger={true}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
          Are you sure you want to delete the goal <strong>{goals.find(g => (g.id === goalToDelete || g._id === goalToDelete))?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
