import React, { useState, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit3, Trash2, Wallet, CreditCard, Landmark, Coins,
  Archive, Eye, EyeOff, Info
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api, CURRENCIES } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

// ---------- Constants ----------
const ICONS = {
  Wallet: <Wallet size={24} />,
  CreditCard: <CreditCard size={24} />,
  Landmark: <Landmark size={24} />,
  Coins: <Coins size={24} />
};

const ACCOUNT_TYPES = ['bank', 'wallet', 'credit_card', 'investment', 'cash', 'other'];

// Predefined color palette for quick selection
const COLOR_PRESETS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6b7280'];

// ---------- Helper: Currency conversion (mock) ----------
// Replace this with a real exchange rate API in production.
const EXCHANGE_RATES = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.50, CAD: 1.36, AUD: 1.55 };
const convertToBase = (amount, fromCurrency, baseCurrency = 'USD') => {
  if (fromCurrency === baseCurrency) return amount;
  const fromRate = EXCHANGE_RATES[fromCurrency] || 1;
  const baseRate = EXCHANGE_RATES[baseCurrency] || 1;
  return amount * (baseRate / fromRate);
};

// ---------- Component ----------
export default function Accounts() {
  const { accounts = [], refetch, fmt, currency: userCurrency = 'USD', loading, t } = useContext(AppContext);
  const { showToast } = useToast();

  // UI state
  const [showAdd, setShowAdd] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currency, setCurrency] = useState('USD');
  const [initialBalance, setInitialBalance] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [icon, setIcon] = useState('Wallet');
  const [formError, setFormError] = useState('');

  // ---------- Reset form ----------
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

  // ---------- Open edit ----------
  const openEdit = (account) => {
    setEditingAccount(account);
    setName(account.name || '');
    setType(account.type || 'bank');
    setCurrency(account.currency || userCurrency);
    // In edit mode, we show the current balance (read‑only) – not the initial balance.
    setInitialBalance(account.current_balance?.toFixed(2) ?? '0.00');
    setColor(account.color || '#3b82f6');
    setIcon(account.icon || 'Wallet');
    setFormError('');
    setShowAdd(true);
  };

  // ---------- Handle submit ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const balance = Number(initialBalance);

    // Validation
    if (!trimmedName) {
      setFormError('Account name is required.');
      return;
    }
    // Check for duplicate name among existing accounts (case‑insensitive)
    const duplicate = accounts.some(
      (a) =>
      String(a.name || '').toLowerCase() === trimmedName.toLowerCase() &&
        (a.id || a._id) !== (editingAccount?.id || editingAccount?._id)
    );
    if (duplicate) {
      setFormError('An account with that name already exists.');
      return;
    }
    if (!Number.isFinite(balance) || Math.abs(balance) > 999999999.99) {
      setFormError('Enter a valid balance with at most two decimal places.');
      return;
    }
    // Enforce two decimals (using regex)
    if (!/^-?\d+(\.\d{1,2})?$/.test(initialBalance) && initialBalance !== '') {
      setFormError('Balance must have at most two decimal places.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingAccount) {
        // When editing, we do NOT send initial_balance to avoid overriding.
        await api.updateAccount(editingAccount.id || editingAccount._id, {
          name: trimmedName,
          type,
          currency, // only allowed if balance is zero (check handled in UI)
          color,
          icon
        });
        showToast('success', 'Account updated successfully!');
      } else {
        await api.createAccount({
          name: trimmedName,
          type,
          currency,
          initial_balance: balance,
          color,
          icon
        });
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

  // ---------- Handle delete ----------
  const handleDelete = async () => {
    if (!accountToDelete) return;
    // Check if account has transactions (backend may provide a `transaction_count`)
    const transactionCount = accountToDelete.transaction_count || 0;
    if (transactionCount > 0) {
      showToast(
        'error',
        `This account has ${transactionCount} transaction(s). Please delete or reassign them before deleting the account.`
      );
      setAccountToDelete(null);
      return;
    }
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

  // ---------- Archive / Unarchive ----------
  const toggleArchive = async (account) => {
    try {
      const newStatus = account.is_active === false;
      await api.updateAccount(account.id || account._id, {
        is_active: newStatus
      });
      showToast('success', `Account ${newStatus ? 'restored' : 'archived'}.`);
      await refetch();
    } catch {
      showToast('error', 'Failed to update archive status.');
    }
  };

  // ---------- Compute net worth by currency ----------
  const { totalsByCurrency, totalInBase, allCurrencies } = useMemo(() => {
    const totals = {};
    let totalBase = 0;
    const base = userCurrency || 'USD';

    accounts
      .filter(a => a.is_active !== false) // only active accounts
      .forEach((a) => {
        const curr = a.currency || base;
        const bal = Number(a.current_balance) || 0;
        totals[curr] = (totals[curr] || 0) + bal;
        totalBase += convertToBase(bal, curr, base);
      });

    return {
      totalsByCurrency: totals,
      totalInBase: totalBase,
      allCurrencies: Object.keys(totals)
    };
  }, [accounts, userCurrency]);

  // ---------- Filter accounts ----------
  const displayedAccounts = useMemo(() => {
    return showArchived
      ? accounts
      : accounts.filter(a => a.is_active !== false);
  }, [accounts, showArchived]);

  // ---------- Loading state ----------
  if (loading) {
    return (
      <div className="account-page" style={{ padding: 'var(--spacing-lg)', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ width: 40, height: 40, border: '4px solid var(--bg-color)', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <p>Loading your accounts...</p>
        </div>
      </div>
    );
  }

  // ---------- Render ----------
  return (
    <div className="account-page" style={{ padding: 'var(--spacing-lg)', maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .account-card {
          border-left: 4px solid var(--account-accent, #3b82f6);
        }
        .color-swatch {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }
        .color-swatch.active {
          border-color: var(--text-main);
          transform: scale(1.1);
        }
        .color-swatch:hover { transform: scale(1.05); }
      `}</style>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-xl)' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-main)' }}>{t?.('accounts') || 'Accounts'}</h1>
          <p style={{ color: 'var(--text-muted)' }}>{t?.('bank_accounts') || 'Manage your bank accounts, wallets, and credit cards.'}</p>
          <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                {t?.('net_worth') || 'Net Worth'} (in {userCurrency})
              </span>
              <span style={{ fontSize: '1.5rem', fontWeight: '700' }}>{fmt(totalInBase)}</span>
            </div>
            {allCurrencies.length > 0 && (
              <div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  {t?.('currency') || 'Balances by Currency'}
                </span>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {allCurrencies.map(curr => (
                    <span key={curr} style={{ fontSize: '1rem', fontWeight: '500' }}>
                      {curr}: {fmt(totalsByCurrency[curr])}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className="btn-secondary"
            onClick={() => setShowArchived(!showArchived)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {showArchived ? <EyeOff size={18} /> : <Eye size={18} />}
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          <button
            className="btn-primary"
            onClick={() => { resetForm(); setShowAdd(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={18} /> {t?.('add_account') || 'Add Account'}
          </button>
        </div>
      </header>

      {displayedAccounts.length === 0 ? (
        <div className="accounts-empty">
          <Landmark size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }} />
          <h3 style={{ marginBottom: '0.5rem' }}>
            {showArchived ? 'No archived accounts' : (t?.('no_accounts_yet') || 'No active accounts yet')}
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            {t?.('create_first_account') || 'Add your bank, credit, or cash accounts to track where your money lives.'}
          </p>
          {!showArchived && (
            <button className="btn-primary" onClick={() => { resetForm(); setShowAdd(true); }}>
              <Plus size={18} /> {t?.('add_account') || 'Add Account'}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Group by type (optional) - simple implementation */}
          {['bank', 'credit_card', 'investment', 'wallet', 'cash', 'other'].map(type => {
            const filtered = displayedAccounts.filter(a => a.type === type);
            if (filtered.length === 0) return null;
            return (
              <div key={type} style={{ marginBottom: '2rem' }}>
                <h4 style={{ textTransform: 'capitalize', color: 'var(--text-muted)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  {type.replace('_', ' ')}s
                </h4>
                <div className="accounts-grid">
                  {filtered.map((account) => {
                    const isArchived = account.is_active === false;
                    return (
                      <motion.div
                        key={account.id || account._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="account-card"
                        style={{
                          '--account-accent': account.color || '#3b82f6',
                          opacity: isArchived ? 0.7 : 1,
                          borderLeftColor: isArchived ? 'var(--text-muted)' : (account.color || '#3b82f6')
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{
                              width: 48, height: 48, borderRadius: '12px',
                              background: `${account.color}20`,
                              color: account.color,
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              {ICONS[account.icon] || <Wallet size={24} />}
                            </div>
                            <div>
                              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.1rem' }}>
                                {account.name}
                                {isArchived && <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--text-muted)' }}>(archived)</span>}
                              </h3>
                              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'var(--bg-color)', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                {account.type.replace('_', ' ')}
                              </span>
                              <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                                {account.currency || userCurrency}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={() => openEdit(account)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                              aria-label={`Edit account ${account.name}`}
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => toggleArchive(account)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                              aria-label={isArchived ? `Restore account ${account.name}` : `Archive account ${account.name}`}
                            >
                              <Archive size={16} />
                            </button>
                            <button
                              onClick={() => setAccountToDelete(account)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                              aria-label={`Delete account ${account.name}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>Current Balance</span>
                          <span style={{ fontWeight: '700', fontSize: '1.5rem' }}>{fmt(account.current_balance)}</span>
                        </div>

                        {account.transaction_count > 0 && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <Info size={14} style={{ display: 'inline', marginRight: 4 }} />
                            {account.transaction_count} transaction(s)
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ---------- Add/Edit Modal ---------- */}
      <AnimatePresence>
        {showAdd && (
          <Modal
            isOpen={showAdd}
            title={editingAccount ? 'Edit Account' : 'Add Account'}
            onClose={() => { setShowAdd(false); resetForm(); }}
          >
            <form onSubmit={handleSubmit} className="account-form">
              <div className="form-field account-form-name">
                <label htmlFor="account-name">Account Name</label>
                <input
                  id="account-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="e.g. Chase Checking"
                  autoComplete="off"
                  aria-describedby={formError ? 'account-form-error' : undefined}
                />
              </div>

              <div className="account-form-grid">
                <div className="form-field">
                  <label htmlFor="account-type">Type</label>
                  <select id="account-type" value={type} onChange={e => setType(e.target.value)}>
                    {ACCOUNT_TYPES.map(t => (
                      <option key={t} value={t}>
                        {t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="account-currency">Currency</label>
                  <select
                    id="account-currency"
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                    disabled={editingAccount && Number(initialBalance) !== 0}
                  >
                    {Object.entries(CURRENCIES).map(([code, info]) => (
                      <option key={code} value={code}>{code} — {info.name}</option>
                    ))}
                  </select>
                  {editingAccount && Number(initialBalance) !== 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--warning-color)', marginTop: '0.25rem' }}>
                      Currency cannot be changed because the account has a non‑zero balance.
                    </p>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="account-balance">
                    {editingAccount ? 'Current Balance' : 'Initial Balance'}
                  </label>
                  <input
                    id="account-balance"
                    type="number"
                    step="0.01"
                    value={initialBalance}
                    onChange={e => setInitialBalance(e.target.value)}
                    required
                    placeholder="0.00"
                    disabled={!!editingAccount}
                  />
                  {editingAccount && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Current balance cannot be edited from here. It updates via transactions.
                    </p>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="account-icon">Icon</label>
                  <select id="account-icon" value={icon} onChange={e => setIcon(e.target.value)}>
                    {Object.keys(ICONS).map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label>Color</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`color-swatch ${color === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                      aria-label={`Choose color ${c}`}
                    />
                  ))}
                  <input
                    id="account-color"
                    type="color"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="account-color-input"
                    style={{ width: 40, height: 40, padding: 0, border: 'none', cursor: 'pointer' }}
                    aria-label="Custom color picker"
                  />
                </div>
              </div>

              {formError && (
                <p id="account-form-error" className="form-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="account-form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setShowAdd(false); resetForm(); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : (editingAccount ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* ---------- Delete Confirmation Modal ---------- */}
      <AnimatePresence>
        {accountToDelete && (
          <Modal
            isOpen={Boolean(accountToDelete)}
            title="Delete Account"
            onClose={() => setAccountToDelete(null)}
          >
            <div style={{ padding: '1rem 0' }}>
              <p>
                Are you sure you want to delete the account <strong>{accountToDelete.name}</strong>?
              </p>
              {accountToDelete.transaction_count > 0 && (
                <p style={{ color: 'var(--danger-color)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  ⚠️ This account has {accountToDelete.transaction_count} transaction(s). They must be deleted or reassigned first.
                </p>
              )}
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                This action cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <button className="btn-secondary" onClick={() => setAccountToDelete(null)}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ background: 'var(--danger-color)' }}
                  onClick={handleDelete}
                  disabled={accountToDelete.transaction_count > 0}
                >
                  Delete
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
