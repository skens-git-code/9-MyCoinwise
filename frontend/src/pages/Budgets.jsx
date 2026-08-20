import React, { useState, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit3, Trash2, AlertCircle, Calendar, Wallet, Copy, ToggleLeft, ToggleRight } from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

// Predefined colors for budget cards
const BUDGET_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#f43f5e', '#14b8a6'];

export default function Budgets() {
  const { budgets = [], refetch, fmt, transactions = [], loading } = useContext(AppContext);
  const { showToast } = useToast();

  // UI state
  const [showAdd, setShowAdd] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetToDelete, setBudgetToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState('monthly');
  const [totalLimit, setTotalLimit] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [isActive, setIsActive] = useState(true); // NEW: active toggle
  const [formError, setFormError] = useState('');

  // Reset form to default (or editing state)
  const resetForm = () => {
    setName('');
    setType('monthly');
    setTotalLimit('');
    setPeriodStart('');
    setPeriodEnd('');
    setRolloverEnabled(false);
    setIsActive(true);
    setEditingBudget(null);
    setFormError('');
  };

  // Open edit mode with existing budget data
  const openEdit = (budget) => {
    setEditingBudget(budget);
    setName(budget.name || '');
    setType(budget.type || 'monthly');
    setTotalLimit(String(budget.total_limit ?? ''));
    // Safely format dates
    const start = budget.period_start ? new Date(budget.period_start) : null;
    const end = budget.period_end ? new Date(budget.period_end) : null;
    setPeriodStart(start ? start.toISOString().slice(0, 10) : '');
    setPeriodEnd(end ? end.toISOString().slice(0, 10) : '');
    setRolloverEnabled(budget.rollover_enabled || false);
    setIsActive(budget.is_active !== undefined ? budget.is_active : true);
    setFormError('');
    setShowAdd(true);
  };

  // Pre-fill form for duplicating a budget (copy)
  const openDuplicate = (budget) => {
    setEditingBudget(null); // ensure it's treated as new
    setName(budget.name ? `${budget.name} (copy)` : '');
    setType(budget.type || 'monthly');
    setTotalLimit(String(budget.total_limit ?? ''));
    const start = budget.period_start ? new Date(budget.period_start) : null;
    const end = budget.period_end ? new Date(budget.period_end) : null;
    setPeriodStart(start ? start.toISOString().slice(0, 10) : '');
    setPeriodEnd(end ? end.toISOString().slice(0, 10) : '');
    setRolloverEnabled(budget.rollover_enabled || false);
    setIsActive(true);
    setFormError('');
    setShowAdd(true);
  };

  // Handle form submission (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const limit = Number(totalLimit);

    // Validation
    if (!trimmedName || !Number.isFinite(limit) || limit <= 0) {
      setFormError('Enter a budget name and a positive limit.');
      return;
    }
    // Date validation using Date objects
    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);
    if (!periodStart || !periodEnd || isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) {
      setFormError('Choose a valid date range. The end date cannot be before the start date.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        type,
        total_limit: limit,
        period_start: periodStart,
        period_end: periodEnd,
        rollover_enabled: rolloverEnabled,
        is_active: isActive, // NEW: include active status
      };

      if (editingBudget) {
        await api.updateBudget(editingBudget.id || editingBudget._id, payload);
        showToast('success', 'Budget updated successfully!');
      } else {
        await api.createBudget(payload);
        showToast('success', 'Budget created successfully!');
      }
      resetForm();
      setShowAdd(false);
      await refetch();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to save budget.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!budgetToDelete) return;
    try {
      await api.deleteBudget(budgetToDelete.id || budgetToDelete._id);
      showToast('success', 'Budget deleted.');
      setBudgetToDelete(null);
      await refetch();
    } catch {
      showToast('error', 'Failed to delete budget.');
    }
  };

  // Compute live spending against budgets
  const activeBudgets = useMemo(() => {
    // Assign a deterministic color based on index or id
    return budgets
      .filter(b => b.is_active !== false) // show only active by default (we can still show inactive if we want, but we filter)
      .map((b, index) => {
        const start = new Date(b.period_start).getTime();
        const end = new Date(b.period_end).getTime();
        const spent = transactions
          .filter(t => t.type === 'expense' && t.is_deleted !== true)
          .filter(t => {
            const tTime = new Date(t.date).getTime();
            return tTime >= start && tTime <= end;
          })
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const backendSpent = Number(b.total_spent);
        const reliableSpent = Number.isFinite(backendSpent) ? backendSpent : spent;

        const rolloverAmount = Number(b.rollover_amount) || 0;
        const baseLimit = Number(b.total_limit) || 0;
        const limit = baseLimit + rolloverAmount;
        const remaining = Math.max(0, limit - reliableSpent);
        const progress = limit > 0 ? Math.min(100, (reliableSpent / limit) * 100) : 0;

        // Assign a color from the palette (based on index or hash)
        const colorIndex = (b.id || b._id || index).toString().length % BUDGET_COLORS.length;
        const color = BUDGET_COLORS[colorIndex];

        return {
          ...b,
          spent: reliableSpent,
          remaining,
          progress,
          limit,
          rolloverAmount,
          color,
        };
      });
  }, [budgets, transactions]);

  // If budgets are still loading, show a simple loading indicator
  if (loading && budgets.length === 0) {
    return (
      <div className="budget-page" style={{ padding: 'var(--spacing-lg)', maxWidth: '1200px', margin: '0 auto' }}>
        <p>Loading budgets...</p>
      </div>
    );
  }

  return (
    <div className="budget-page" style={{ padding: 'var(--spacing-lg)', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-main)' }}>Budgets</h1>
          <p style={{ color: 'var(--text-muted)' }}>Control your spending and track category limits.</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowAdd(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> New Budget
        </button>
      </header>

      {activeBudgets.length === 0 ? (
        <div className="budgets-empty">
          <Wallet size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }} />
          <h3 style={{ marginBottom: '0.5rem' }}>No active budgets</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Create a budget to start tracking your spending.</p>
          <button className="btn-primary" onClick={() => { resetForm(); setShowAdd(true); }}>Create First Budget</button>
        </div>
      ) : (
        <div className="budgets-grid">
          {activeBudgets.map((b) => (
            <motion.div
              key={b.id || b._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="budget-card"
              style={{ borderLeft: `4px solid ${b.color}` }} // accent color
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem' }}>{b.name}</h3>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={14} />
                    <span>{new Date(b.period_start).toLocaleDateString()} - {new Date(b.period_end).toLocaleDateString()}</span>
                  </div>
                  {/* Show rollover amount if any */}
                  {b.rolloverAmount > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Rollover: {fmt(b.rolloverAmount)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {/* Active/Inactive indicator */}
                  {b.is_active ? (
                    <ToggleRight size={18} color="var(--success-color)" title="Active" />
                  ) : (
                    <ToggleLeft size={18} color="var(--text-muted)" title="Inactive" />
                  )}
                  <button onClick={() => openEdit(b)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Edit3 size={16} /></button>
                  <button onClick={() => openDuplicate(b)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Copy size={16} /></button>
                  <button onClick={() => setBudgetToDelete(b)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Spent</span>
                  <span style={{ fontWeight: '600', color: b.progress >= 100 ? 'var(--danger-color)' : 'var(--text-main)' }}>{fmt(b.spent)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Remaining</span>
                  <span style={{ fontWeight: '600', color: 'var(--success-color)' }}>{fmt(b.remaining)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Limit</span>
                  <span style={{ fontWeight: '600' }}>{fmt(b.limit)}</span>
                </div>
              </div>

              {/* Progress bar with warning icon if >=80% */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, height: '8px', background: 'var(--bg-color)', borderRadius: '4px', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, b.progress)}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    style={{
                      height: '100%',
                      background: b.progress >= 100 ? 'var(--danger-color)' : b.progress >= 80 ? 'var(--warning-color)' : b.color,
                      borderRadius: '4px'
                    }}
                  />
                </div>
                {b.progress >= 80 && (
                  <AlertCircle size={16} color={b.progress >= 100 ? 'var(--danger-color)' : 'var(--warning-color)'} title="Budget nearly exhausted" />
                )}
              </div>
              <div style={{ textAlign: 'right', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {b.progress.toFixed(0)}% used
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAdd && (
          <Modal isOpen={showAdd} title={editingBudget ? 'Edit Budget' : 'Create Budget'} onClose={() => { setShowAdd(false); resetForm(); }}>
            <form onSubmit={handleSubmit} className="budget-form">
              <div className="form-field">
                <label htmlFor="budget-name">Budget Name</label>
                <input id="budget-name" type="text" value={name} onChange={e => setName(e.target.value)} required maxLength={100} placeholder="e.g. Monthly Essentials" autoComplete="off" />
              </div>
              <div className="budget-form-grid">
                <div className="form-field">
                  <label htmlFor="budget-type">Budget Type</label>
                  <select id="budget-type" value={type} onChange={e => setType(e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="budget-limit">Total Limit</label>
                  <input id="budget-limit" type="number" min="0.01" step="0.01" value={totalLimit} onChange={e => setTotalLimit(e.target.value)} required placeholder="0.00" />
                </div>
              </div>
              <div className="budget-form-grid">
                <div className="form-field">
                  <label htmlFor="budget-start">Start Date</label>
                  <input id="budget-start" type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label htmlFor="budget-end">End Date</label>
                  <input id="budget-end" type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} required />
                </div>
              </div>
              <div className="budget-rollover-field">
                <input type="checkbox" id="rollover" checked={rolloverEnabled} onChange={e => setRolloverEnabled(e.target.checked)} />
                <label htmlFor="rollover">Enable rollover (carry remaining budget forward)</label>
              </div>
              {/* NEW: Active toggle */}
              <div className="budget-rollover-field">
                <input type="checkbox" id="active-toggle" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                <label htmlFor="active-toggle">Active (visible and tracked)</label>
              </div>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="budget-form-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Budget'}</button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {budgetToDelete && (
          <Modal isOpen={Boolean(budgetToDelete)} title="Delete Budget" onClose={() => setBudgetToDelete(null)}>
            <div style={{ padding: '1rem 0' }}>
              <p>Are you sure you want to delete the budget <strong>{budgetToDelete.name}</strong>?</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>This action cannot be undone, but your transactions will not be deleted.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <button className="btn-secondary" onClick={() => setBudgetToDelete(null)}>Cancel</button>
                <button className="btn-primary" style={{ background: 'var(--danger-color)' }} onClick={handleDelete}>Delete</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
