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

const GOAL_CATEGORIES = [
  { key: 'all', labelKey: 'category_all', fallback: 'All' },
  { key: 'emergency_fund', labelKey: 'category_emergency_fund', fallback: 'Emergency Fund' },
  { key: 'vacation', labelKey: 'category_vacation', fallback: 'Vacation' },
  { key: 'gadget', labelKey: 'category_gadget', fallback: 'Gadget' },
  { key: 'investment', labelKey: 'category_investment', fallback: 'Investment' },
  { key: 'vehicle', labelKey: 'category_vehicle', fallback: 'Vehicle' },
  { key: 'home', labelKey: 'category_home', fallback: 'Home' },
  { key: 'education', labelKey: 'category_education', fallback: 'Education' },
  { key: 'other', labelKey: 'category_other', fallback: 'Other' },
];

const getCategoryKey = (cat) => {
  if (!cat) return 'other';
  const clean = String(cat).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['emergency_fund', 'savings'].includes(clean)) return 'emergency_fund';
  if (['vacation', 'trip', 'holiday'].includes(clean)) return 'vacation';
  if (['gadget', 'tech', 'electronics'].includes(clean)) return 'gadget';
  if (['investment', 'stocks', 'crypto'].includes(clean)) return 'investment';
  if (['vehicle', 'car', 'bike'].includes(clean)) return 'vehicle';
  if (['home', 'house', 'property'].includes(clean)) return 'home';
  if (['education', 'course', 'college'].includes(clean)) return 'education';
  if (['debt', 'loan'].includes(clean)) return 'debt';
  if (['purchase'].includes(clean)) return 'purchase';
  return clean;
};

const getCategoryLabel = (cat, t) => {
  const key = getCategoryKey(cat);
  return t?.(`category_${key}`) || t?.(key) || cat || 'Goal';
};

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
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('all');

  // Form Fields
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('emergency_fund');
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
    setCategory('emergency_fund');
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
    setCategory(getCategoryKey(g.category));
    setNotes(g.notes || '');
    setSelectedIcon(g.icon || '🎯');
  };

  // Add / Edit Goal Handler
  const handleSaveGoal = async () => {
    const trimmedName = name.trim();
    const targetNum = parseFloat(target);
    const savedNum = parseFloat(saved) || 0;

    if (!trimmedName) {
      showToast('error', t?.('enter_goal_name') || 'Please enter a goal name.');
      return;
    }
    if (!target || isNaN(targetNum) || targetNum <= 0) {
      showToast('error', t?.('target_positive_error') || 'Target amount must be a positive number.');
      return;
    }
    if (savedNum < 0) {
      showToast('error', t?.('saved_negative_error') || 'Already saved amount cannot be negative.');
      return;
    }
    if (savedNum > targetNum) {
      showToast('error', t?.('saved_exceed_error') || 'Already saved amount cannot exceed the target.');
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
        category: getCategoryKey(category),
        deadline: deadline ? deadline : null,
        notes: notes.trim() || undefined,
      };

      if (editingGoal) {
        const goalId = editingGoal.id || editingGoal._id;
        await api.updateGoal(goalId, payload);
        showToast('success', t?.('goal_updated') || 'Goal updated successfully!');
      } else {
        await api.createGoal(payload);
        showToast('success', t?.('goal_created') || 'Goal created successfully!');
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
      showToast('success', t?.('goal_deleted') || 'Goal deleted');
    } catch {
      showToast('error', t?.('goal_delete_failed') || 'Failed to delete goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const contribute = async (id) => {
    const amt = parseFloat(contributeAmount);
    if (!amt || isNaN(amt)) {
      showToast('error', t?.('enter_valid_amount') || 'Please enter a valid amount.');
      return;
    }
    setIsSubmitting(true);
    try {
      const goal = goals.find(g => (g.id === id || g._id === id));
      const newSaved = Math.min(Number(goal.target), Math.max(0, parseFloat((Number(goal.saved) + amt).toFixed(2))));
      const willHit100 = newSaved >= Number(goal.target) && Number(goal.saved) < Number(goal.target);

      await api.updateGoal(id, { saved: newSaved });
      await refetch();
      setContributeGoal(null);
      setContributeAmount('');
      
      if (willHit100 && confettiCanvasRef.current) {
        fireConfetti(confettiCanvasRef.current);
        showToast('success', t?.('goal_achieved') || '🎉 Congratulations! You reached your goal target!');
      } else {
        showToast('success', amt > 0 ? (t?.('funds_added') || 'Funds added to goal!') : (t?.('funds_removed') || 'Funds removed from goal!'));
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
    if (activeCategoryFilter === 'all' || activeCategoryFilter === 'All') return goals;
    return goals.filter(g => getCategoryKey(g.category) === activeCategoryFilter);
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
          <h2>{t?.('goals') || 'Savings Goals'}</h2>
          <span className="mh-badge">{goals.length} {t?.('active') || 'active'}</span>
        </div>
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn-primary" onClick={() => { resetForm(); setShowAdd(true); }}>
          <Plus size={16} /> {t?.('new_goal') || 'New Goal'}
        </motion.button>
      </div>

      {/* Summary Banner */}
      <div className="carousel-wrapper" style={{ minHeight: 110 }}>
        <div className="carousel-track">
          {[
            { label: t?.('net_available') || 'Net Available', value: fmt(totalSaved), color: totalSaved >= 0 ? 'var(--success)' : 'var(--danger)', icon: '💰' },
            { label: t?.('target_amount') || 'Target Amount', value: fmt(totalGoalTarget), color: 'var(--brand-primary)', icon: '🎯' },
            { label: t?.('contributed') || 'Contributed', value: fmt(totalGoalSaved), color: 'var(--brand-secondary)', icon: '✅' },
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
        {GOAL_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            className={`gcf-pill ${activeCategoryFilter === cat.key ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter(cat.key)}
          >
            {t?.(cat.labelKey) || cat.fallback}
          </button>
        ))}
      </div>

      {/* Goals Grid */}
      {filteredGoals.length === 0 ? (
        <motion.div className="glass empty-state" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Target size={52} />
          <p className="primary-msg">{t?.('no_goals_yet') || 'No goals yet.'}</p>
          <p className="secondary-msg">{t?.('set_first_savings_target') || 'Set your first savings target for a trip, a gadget, or an emergency fund.'}</p>
          <motion.button whileHover={{ scale: 1.04 }} className="btn-primary" style={{ marginTop: 20 }} onClick={() => { resetForm(); setShowAdd(true); }}>
            <Plus size={16} /> {t?.('create_goal') || 'Create Goal'}
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
                      🎉 {t?.('achieved') || 'Achieved!'}
                    </motion.div>
                  )}

                  <div className="mc-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="mc-icon">{g.icon || '🎯'}</div>
                      <span className="goal-category-tag badge">{getCategoryLabel(g.category, t)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="del-btn" onClick={() => openEdit(g)} title={t?.('edit') || 'Edit goal'}><Edit3 size={15} /></button>
                      <button className="del-btn" onClick={() => setGoalToDelete(goalId)} title={t?.('delete') || 'Delete goal'}><Trash2 size={15} /></button>
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
                      <span className="gds-item"><Calendar size={13} /> {daysRemaining} {t?.('days_left') || 'days left'}</span>
                      {monthlyNeeded > 0 && (
                        <span className="gds-item text-brand">{t?.('target') || 'Target'}: {fmt(monthlyNeeded)}/{t?.('monthly')?.slice(0, 2) || 'mo'}</span>
                      )}
                    </div>
                  )}

                  <div className="mc-amounts">
                    <span className="mc-saved">{fmt(g.saved)}</span>
                    <span className="mc-target">{t?.('of') || 'of'} {fmt(g.target)}</span>
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
                      <span>{pct.toFixed(0)}% {t?.('completed') || 'completed'}</span>
                      <span>{fmt(Math.max(0, Number(g.target) - Number(g.saved)))} {t?.('left') || 'left'}</span>
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
                        <PlusCircle size={14} /> {t?.('contribute') || 'Add / Remove Funds'}
                      </motion.button>
                    )}

                    {!done && (() => {
                      const pred = predictTimeToGoal(g, transactions);
                      if (!pred || pred.achieved) return null;
                      if (!pred.months) return (
                        <div className="mc-ai-pred mc-ai-empty">
                          <Zap size={12} /> {t?.('save_regularly_ai') || 'Save regularly for AI predictions'}
                        </div>
                      );
                      return (
                        <motion.div className="mc-ai-pred" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <Clock size={12} /> <span>~{pred.months} {t?.('months') || 'mo'}</span> @ {fmt(pred.savingsPerMonth)}/mo
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
        title={editingGoal ? `✏️ ${t?.('edit') || 'Edit'} ${t?.('goals') || 'Goal'}` : `🎯 ${t?.('new_goal') || 'New Savings Goal'}`}
        confirmText={editingGoal ? (t?.('save') || 'Update Goal') : (t?.('save_goal') || 'Save Goal')}
        onConfirm={handleSaveGoal}
        isLoading={isSubmitting}
      >
        <div className="form-group">
          <label>{t?.('goal_name') || 'Goal Name'}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dream Vacation" autoFocus />
        </div>

        <div className="form-group">
          <label>{t?.('category') || 'Category'}</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="filter-select" style={{ width: '100%' }}>
            {GOAL_CATEGORIES.filter(c => c.key !== 'all').map(c => (
              <option key={c.key} value={c.key}>{t?.(c.labelKey) || c.fallback}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>{t?.('choose_icon') || 'Choose Icon'}</label>
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
          <label>{t?.('target_amount') || 'Target Amount'}</label>
          <input type="number" min="0.01" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 500" />
        </div>

        <div className="form-group">
          <label>{t?.('already_saved') || 'Already Saved'}</label>
          <input type="number" min="0" step="0.01" value={saved} onChange={e => setSaved(e.target.value)} placeholder="0" />
        </div>

        <div className="form-group">
          <label>{t?.('target_deadline') || 'Target Deadline'} <span className="form-label-hint">({t?.('optional') || 'optional'})</span></label>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>

        <div className="form-group">
          <label>
            {t?.('description') || 'Description'}
            <span className="form-label-hint"> ({t?.('optional') || 'optional'})</span>
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
        title={t?.('contribute') || 'Add / Remove Funds'}
        confirmText={parseFloat(contributeAmount) < 0 ? (t?.('remove_funds') || 'Remove Funds') : (t?.('add_funds') || 'Add Funds')}
        onConfirm={() => contribute(contributeGoal)}
        isLoading={isSubmitting}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          {t?.('updating') || 'Updating'}: <strong>{goals.find(g => (g.id === contributeGoal || g._id === contributeGoal))?.name}</strong>
        </p>
        <div className="form-group">
          <label>{t?.('amount') || 'Amount'} ({t?.('negative_to_remove') || 'Use negative to remove'})</label>
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
        title={t?.('delete_goal') || 'Delete Goal?'}
        confirmText={t?.('delete') || 'Delete'}
        onConfirm={confirmDelete}
        isLoading={isSubmitting}
        danger={true}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
          {t?.('are_you_sure_delete_goal') || 'Are you sure you want to delete'} <strong>{goals.find(g => (g.id === goalToDelete || g._id === goalToDelete))?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
