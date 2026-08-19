import React, { useState, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit3, Trash2, Wallet, CreditCard, Landmark, Coins } from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api, CURRENCIES } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

const ICONS = {
  Wallet: <Wallet size={24} />,
  CreditCard: <CreditCard size={24} />,
  Landmark: <Landmark size={24} />,
  Coins: <Coins size={24} />
};

const ACCOUNT_TYPES = ['bank', 'wallet', 'credit_card', 'investment', 'cash', 'other'];

export default function Accounts() {
  const { accounts = [], refetch, fmt, currency: userCurrency = 'USD' } = useContext(AppContext);
  const { showToast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currency, setCurrency] = useState('USD');
  const [initialBalance, setInitialBalance] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [icon, setIcon] = useState('Wallet');
  const [formError, setFormError] = useState('');

  const resetForm = () => {
    setName('');
    setType('bank');
    setCurrency(userCurrency);
    setInitialBalance('');
    setColor('#3b82f6');
    setIcon('Wallet');
    setEditingAccount(null);
    setFormError('');
  };

  const openEdit = (account) => {
    setEditingAccount(account);
    setName(account.name || '');
    setType(account.type || 'bank');
    setCurrency(account.currency || userCurrency);
    setInitialBalance(String(account.initial_balance ?? 0));
    setColor(account.color || '#3b82f6');
    setIcon(account.icon || 'Wallet');
    setFormError('');
    setShowAdd(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const balance = Number(initialBalance);
    if (!trimmedName) {
      setFormError('Account name is required.');
      return;
    }
    if (!Number.isFinite(balance) || Math.abs(balance) > 999999999.99) {
      setFormError('Enter a valid balance with at most two decimal places.');
      return;
    }
    setIsSubmitting(true);
    try {
      const createPayload = {
        name: trimmedName,
        type,
        currency,
        initial_balance: balance,
        color,
        icon
      };
      
      if (editingAccount) {
        // The current balance is maintained independently of the opening balance.
        // Do not send it during a profile edit or an edit can reset real activity.
        await api.updateAccount(editingAccount.id || editingAccount._id, {
          name: trimmedName, type, currency, color, icon
        });
        showToast('success', 'Account updated successfully!');
      } else {
        await api.createAccount(createPayload);
        showToast('success', 'Account created successfully!');
      }
      resetForm();
      setShowAdd(false);
      await refetch();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to save account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!accountToDelete) return;
    try {
      await api.deleteAccount(accountToDelete.id || accountToDelete._id);
      showToast('success', 'Account deleted.');
      setAccountToDelete(null);
      await refetch();
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to delete account.');
    }
  };

  const totalBalance = useMemo(() => accounts.reduce((acc, a) => acc + (Number(a.current_balance) || 0), 0), [accounts]);

  return (
    <div className="account-page" style={{ padding: 'var(--spacing-lg)', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-xl)' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-main)' }}>Accounts</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage your bank accounts, wallets, and credit cards.</p>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem' }}>
            <div>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Net Worth</span>
              <span style={{ fontSize: '1.5rem', fontWeight: '700' }}>{fmt(totalBalance)}</span>
            </div>
          </div>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowAdd(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> Add Account
        </button>
      </header>

      {accounts.length === 0 ? (
        <div className="accounts-empty">
          <Landmark size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }} />
          <h3 style={{ marginBottom: '0.5rem' }}>No accounts yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Add your first account to start tracking your balances.</p>
          <button className="btn-primary" onClick={() => { resetForm(); setShowAdd(true); }}>Add Account</button>
        </div>
      ) : (
        <div className="accounts-grid">
          {accounts.map(a => (
            <motion.div 
              key={a.id || a._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="account-card"
              style={{ '--account-accent': a.color || '#3b82f6' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ 
                    width: 48, height: 48, borderRadius: '12px', 
                    background: `${a.color}20`, color: a.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {ICONS[a.icon] || <Wallet size={24} />}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.1rem' }}>{a.name}</h3>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'var(--bg-color)', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                      {a.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => openEdit(a)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Edit3 size={16} /></button>
                  <button onClick={() => setAccountToDelete(a)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>Current Balance</span>
                <span style={{ fontWeight: '700', fontSize: '1.5rem' }}>{fmt(a.current_balance)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAdd && (
          <Modal isOpen={showAdd} title={editingAccount ? 'Edit Account' : 'Add Account'} onClose={() => { setShowAdd(false); resetForm(); }}>
            <form onSubmit={handleSubmit} className="account-form">
              <div className="form-field account-form-name">
                <label htmlFor="account-name">Account Name</label>
                <input id="account-name" type="text" value={name} onChange={e => setName(e.target.value)} required maxLength={100} placeholder="e.g. Chase Checking" autoComplete="off" />
              </div>
              <div className="account-form-grid">
                <div className="form-field">
                  <label htmlFor="account-type">Type</label>
                  <select id="account-type" value={type} onChange={e => setType(e.target.value)}>
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="account-currency">Currency</label>
                  <select id="account-currency" value={currency} onChange={e => setCurrency(e.target.value)}>
                    {Object.entries(CURRENCIES).map(([code, info]) => <option key={code} value={code}>{code} — {info.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="account-balance">Initial Balance</label>
                  <input id="account-balance" type="number" step="0.01" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} required placeholder="0.00" disabled={!!editingAccount} />
                </div>
                <div className="form-field">
                  <label htmlFor="account-icon">Icon</label>
                  <select id="account-icon" value={icon} onChange={e => setIcon(e.target.value)}>
                    {Object.keys(ICONS).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="account-color">Color</label>
                <input id="account-color" type="color" value={color} onChange={e => setColor(e.target.value)} className="account-color-input" />
              </div>
              {editingAccount && <p className="form-help">Current balance stays unchanged while you edit account details.</p>}
              {formError && <p className="form-error" role="alert">{formError}</p>}
              
              <div className="account-form-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Account'}</button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {accountToDelete && (
          <Modal isOpen={Boolean(accountToDelete)} title="Delete Account" onClose={() => setAccountToDelete(null)}>
            <div style={{ padding: '1rem 0' }}>
              <p>Are you sure you want to delete the account <strong>{accountToDelete.name}</strong>?</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>This action cannot be undone.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <button className="btn-secondary" onClick={() => setAccountToDelete(null)}>Cancel</button>
                <button className="btn-primary" style={{ background: 'var(--danger-color)' }} onClick={handleDelete}>Delete</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
