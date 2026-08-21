import React, { useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import Modal from './Modal';

const CATEGORIES = {
  income: ['Salary', 'Freelance', 'Allowance', 'Job', 'Gift', 'Sale', 'Investment', 'Other'],
  expense: ['Food', 'Groceries', 'Games', 'Clothes', 'Subscriptions', 'Tech', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Education', 'Bills', 'Rent', 'Travel', 'Fitness', 'Utilities', 'Insurance', 'Other']
};

// Helper function to format date for input field
const formatDateForInput = (dateInput) => {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) {
    return formatDateForInput(new Date());
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function TransactionForm({ isOpen = true, onClose, onSubmit, initialData = null }) {
  const { currencyInfo, accounts = [], t } = useContext(AppContext);
  const currSymbol = currencyInfo?.symbol || '₹';

  // State management with proper initialization
  const [type, setType] = useState(() => initialData?.type || 'expense');
  const [amount, setAmount] = useState(() => {
    if (initialData?.amount !== undefined && initialData?.amount !== null) {
      return String(initialData.amount);
    }
    return '';
  });
  const [category, setCategory] = useState(() => {
    if (initialData?.category) return initialData.category;
    return CATEGORIES[initialData?.type || 'expense'][0];
  });
  const [note, setNote] = useState(initialData?.note || '');
  const [date, setDate] = useState(() => {
    if (initialData?.date) {
      return formatDateForInput(initialData.date);
    }
    return formatDateForInput(new Date());
  });

  // Phase 1C Enhanced Fields
  const [merchant, setMerchant] = useState(initialData?.merchant || '');
  const [tags, setTags] = useState(() => Array.isArray(initialData?.tags) ? initialData.tags.join(', ') : (initialData?.tags || ''));
  const [paymentMethod, setPaymentMethod] = useState(initialData?.payment_method || 'other');
  const [accountId, setAccountId] = useState(initialData?.account_id || '');
  const [isRecurring, setIsRecurring] = useState(initialData?.is_recurring || false);
  const [recurrenceInterval, setRecurrenceInterval] = useState(initialData?.recurrence_interval || 'monthly');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const modalRef = useRef(null);

  // The form stays mounted while the edit modal is closed. Keep its fields in
  // sync when the selected transaction changes so opening a second edit never
  // shows the values from the previous transaction.
  useEffect(() => {
    const nextType = initialData?.type || 'expense';
    setType(nextType);
    setAmount(initialData?.amount !== undefined && initialData?.amount !== null ? String(initialData.amount) : '');
    setCategory(initialData?.category || CATEGORIES[nextType][0]);
    setNote(initialData?.note || '');
    setDate(initialData?.date ? formatDateForInput(initialData.date) : formatDateForInput(new Date()));
    setMerchant(initialData?.merchant || '');
    setTags(Array.isArray(initialData?.tags) ? initialData.tags.join(', ') : (initialData?.tags || ''));
    setPaymentMethod(initialData?.payment_method || 'other');
    setAccountId(initialData?.account_id || '');
    setIsRecurring(Boolean(initialData?.is_recurring));
    setRecurrenceInterval(initialData?.recurrence_interval || 'monthly');
    setError('');
    setShowUnsavedModal(false);
  }, [initialData, isOpen]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return undefined;
    const focusable = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable && focusable.length) {
      // Find the autoFocus input if it exists, otherwise focus first element
      const autoFocusEl = Array.from(focusable).find(el => el.hasAttribute('autofocus'));
      if (autoFocusEl) autoFocusEl.focus();
      else focusable[0].focus();

      const handleTab = (e) => {
        if (e.key !== 'Tab') return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };

      document.addEventListener('keydown', handleTab);
      return () => document.removeEventListener('keydown', handleTab);
    }
    return undefined;
  }, [isOpen]);

  // Update categories when type changes
  useEffect(() => {
    if (initialData && initialData.type === type && initialData.category) {
      setCategory(initialData.category);
    } else {
      setCategory(CATEGORIES[type][0]);
    }
  }, [type, initialData]);

  // Validate amount input
  const handleAmountChange = useCallback((e) => {
    let val = e.target.value;

    // Remove any non-numeric characters except decimal point
    val = val.replace(/[^0-9.]/g, '');

    // Prevent multiple decimal points
    const parts = val.split('.');
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('');
    }

    // Limit decimal places to 2
    if (parts.length === 2 && parts[1].length > 2) {
      val = parts[0] + '.' + parts[1].slice(0, 2);
    }

    setAmount(val);
  }, []);

  // Validate form inputs
  const validateForm = useCallback(() => {
    // Check amount
    if (!amount || amount.trim() === '') {
      setError('Please enter an amount.');
      return false;
    }

    const amt = parseFloat(amount);
    if (isNaN(amt)) {
      setError('Please enter a valid number.');
      return false;
    }

    if (amt <= 0) {
      setError('Amount must be greater than 0.');
      return false;
    }

    if (amt > 999999999.99) {
      setError('Amount is too large.');
      return false;
    }

    // Check category
    if (!category) {
      setError('Please select a category.');
      return false;
    }

    if (!CATEGORIES[type].includes(category)) {
      setError('Invalid category selected.');
      return false;
    }

    // Check date
    if (!date) {
      setError('Please select a date.');
      return false;
    }

    const selectedDate = new Date(date);
    if (isNaN(selectedDate.getTime())) {
      setError('Invalid date selected.');
      return false;
    }

    // Optional: Prevent future dates (uncomment if needed)
    // const today = new Date();
    // today.setHours(0, 0, 0, 0);
    // if (selectedDate > today) {
    //   setError('Cannot select a future date.');
    //   return false;
    // }

    return true;
  }, [amount, category, type, date]);

  // Reset form to default values
  const resetForm = useCallback(() => {
    setType('expense');
    setAmount('');
    setCategory(CATEGORIES.expense[0]);
    setNote('');
    setDate(formatDateForInput(new Date()));
    setMerchant('');
    setTags('');
    setPaymentMethod('other');
    setAccountId('');
    setIsRecurring(false);
    setRecurrenceInterval('monthly');
    setError('');
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    // Clear previous error
    setError('');

    // Validate form
    if (!validateForm()) {
      return;
    }

    // Prevent double submission
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const amt = parseFloat(amount);
      const transactionData = {
        id: initialData?.id, // include ID if editing
        type,
        amount: amt,
        category,
        note: note.trim(),
        date, // Date inputs already provide the API-safe YYYY-MM-DD representation
        merchant: merchant.trim(),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        payment_method: paymentMethod,
        account_id: accountId || null,
        is_recurring: isRecurring,
        recurrence_interval: isRecurring ? recurrenceInterval : null
      };

      await onSubmit(transactionData);

      // Reset form only for new transactions, not for edits
      if (!initialData) {
        resetForm();
      }
    } catch (err) {
      setError('Failed to save transaction. Please try again.');
      console.error('Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [validateForm, isSubmitting, amount, initialData, type, category, note, date, merchant, tags, paymentMethod, accountId, isRecurring, recurrenceInterval, onSubmit, resetForm]);

  // Handle cancel with confirmation if form is dirty
  const handleCancel = useCallback(() => {
    // Check if form has unsaved changes
    const isDirty = (initialData === null) && (amount !== '' || note !== '');

    if (isDirty) {
      setShowUnsavedModal(true);
    } else {
      onClose();
    }
  }, [amount, note, initialData, onClose]);

  // Memoized values for performance
  const isExpense = useMemo(() => type === 'expense', [type]);
  const submitButtonText = useMemo(() => {
    if (initialData) return t?.('save_changes') || 'Save Changes';
    return type === 'income' ? (t?.('add_income_btn') || 'Add Income') : (t?.('add_expense_btn') || 'Add Expense');
  }, [initialData, type, t]);

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="tx-modal-overlay"
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancel}
            >
              <motion.div
                ref={modalRef}
                key="tx-modal-box"
          role="dialog"
          aria-modal="true"
          aria-label={initialData ? (t?.('edit_transaction') || 'Edit Transaction') : (t?.('new_transaction') || 'New Transaction')}
          className="modal-box glass transaction-modal"
          initial={{ scale: 0.88, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.88, y: 24 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          style={{
            boxShadow: isExpense ? '0 8px 32px rgba(239, 68, 68, 0.15)' : '0 8px 32px rgba(16, 185, 129, 0.15)',
            borderTop: `4px solid ${isExpense ? 'var(--danger)' : 'var(--success)'}`
          }}
        >
          <div className="transaction-modal-header">
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              {initialData ? `✍️ ${t?.('edit_transaction') || 'Edit Transaction'}` : `✨ ${t?.('new_transaction') || 'New Transaction'}`}
            </h3>
            <motion.button
              className="icon-btn"
              onClick={handleCancel}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              type="button"
            >
              <X size={18} />
            </motion.button>
          </div>

          <form onSubmit={handleSubmit} className="transaction-form">
            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="feedback-msg error"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: '0.85rem',
                    color: '#ef4444'
                  }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Type Toggle */}
            <div className="type-toggle" style={{ display: 'flex', background: 'var(--glass-1)', borderRadius: 12, padding: 4, position: 'relative' }}>
              {['expense', 'income'].map(toggleType => (
                <button
                  key={toggleType}
                  type="button"
                  onClick={() => setType(toggleType)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    zIndex: 1,
                    color: type === toggleType ? 'white' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    textTransform: 'capitalize',
                    transition: 'color 0.2s'
                  }}
                >
                  {toggleType === 'expense' ? (t?.('expense_label') || 'Expense') : (t?.('income_label') || 'Income')}
                </button>
              ))}
              <motion.div
                style={{
                  position: 'absolute',
                  top: 4,
                  bottom: 4,
                  width: 'calc(50% - 4px)',
                  background: isExpense ? 'var(--danger)' : 'var(--success)',
                  borderRadius: 8,
                  zIndex: 0
                }}
                animate={{ left: isExpense ? 4 : 'calc(50%)' }}
                transition={{ type: 'spring', damping: 26, stiffness: 350 }}
              />
            </div>

            <div className="transaction-form-grid transaction-form-grid--amount-date">
              <div className="form-field">
                <label>{t?.('amount') || 'Amount'} ({currSymbol})</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-secondary)',
                    fontWeight: 700
                  }}>
                    {currSymbol}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    autoFocus={!initialData}
                    disabled={isSubmitting}
                    aria-required="true"
                    style={{
                      paddingLeft: 28,
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      opacity: isSubmitting ? 0.7 : 1
                    }}
                  />
                </div>
              </div>

              <div className="form-field">
                <label>{t?.('date') || 'Date'}</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  disabled={isSubmitting}
                  aria-required="true"
                  className="date-input"
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    opacity: isSubmitting ? 0.7 : 1
                  }}
                />
              </div>
            </div>

            <div className="form-field">
              <label>{t?.('category') || 'Category'}</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                disabled={isSubmitting}
                aria-required="true"
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              >
                <option value="">{t?.('category') || 'Select category'}...</option>
                {[...new Set([...CATEGORIES[type], category].filter(Boolean))].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>{t?.('description') || 'Description'} ({t?.('optional') || 'Optional'})</label>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t?.('what_was_this_for') || 'What was this for?'}
                maxLength={60}
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              />
              {note.length > 50 && (
                <small style={{
                  color: note.length === 60 ? '#ef4444' : 'var(--text-muted)',
                  fontSize: '0.7rem',
                  marginTop: 4,
                  display: 'block'
                }}>
                  {note.length}/60 characters
                </small>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="transaction-account">{t?.('account_optional') || 'Account (Optional)'}</label>
              <select
                id="transaction-account"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              >
                <option value="">{t?.('no_account_selected') || 'No account selected'}</option>
                {accounts.filter(account => account.is_active !== false).map(account => (
                  <option key={account.id || account._id} value={account.id || account._id}>
                    {account.name} · {account.currency || 'USD'}
                  </option>
                ))}
              </select>
            </div>

            {/* Enhanced Fields Grid */}
            <div className="transaction-form-grid">
              <div className="form-field">
                <label>{t?.('merchant_optional') || 'Merchant (Optional)'}</label>
                <input
                  value={merchant}
                  onChange={e => setMerchant(e.target.value)}
                  placeholder="e.g. Amazon, Starbucks"
                  maxLength={150}
                  disabled={isSubmitting}
                  style={{ opacity: isSubmitting ? 0.7 : 1 }}
                />
              </div>
              <div className="form-field">
                <label>{t?.('tags_optional') || 'Tags (Optional)'}</label>
                <input
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="e.g. travel, urgent, family"
                  disabled={isSubmitting}
                  style={{ opacity: isSubmitting ? 0.7 : 1 }}
                />
              </div>
            </div>

            <div className="transaction-form-grid transaction-form-grid--payment">
              <div className="form-field">
                <label>{t?.('payment_method') || 'Payment Method'}</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  disabled={isSubmitting}
                  style={{ opacity: isSubmitting ? 0.7 : 1 }}
                >
                  <option value="other">{t?.('pm_other') || 'Other'}</option>
                  <option value="cash">{t?.('pm_cash') || 'Cash'}</option>
                  <option value="card">{t?.('pm_card') || 'Card'}</option>
                  <option value="upi">{t?.('pm_upi') || 'UPI'}</option>
                  <option value="bank_transfer">{t?.('pm_bank_transfer') || 'Bank Transfer'}</option>
                  <option value="wallet">{t?.('pm_wallet') || 'Wallet'}</option>
                </select>
              </div>
              <div className="form-field" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={e => setIsRecurring(e.target.checked)}
                    disabled={isSubmitting}
                    style={{ width: 'auto' }}
                  />
                  {t?.('is_recurring') || 'Is Recurring?'}
                </label>
                {isRecurring && (
                  <select
                    value={recurrenceInterval}
                    onChange={e => setRecurrenceInterval(e.target.value)}
                    disabled={isSubmitting}
                    style={{ opacity: isSubmitting ? 0.7 : 1, marginTop: 4, padding: '4px 8px', fontSize: '0.8rem' }}
                  >
                    <option value="daily">{t?.('daily') || 'Daily'}</option>
                    <option value="weekly">{t?.('weekly') || 'Weekly'}</option>
                    <option value="monthly">{t?.('monthly') || 'Monthly'}</option>
                    <option value="yearly">{t?.('yearly') || 'Yearly'}</option>
                  </select>
                )}
              </div>
            </div>

            <div className="modal-actions transaction-form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCancel}
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              >
                {t?.('cancel') || 'Cancel'}
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{
                  flex: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  opacity: isSubmitting ? 0.7 : 1
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Check size={16} />
                  </motion.div>
                ) : (
                  <Check size={16} />
                )}
                {submitButtonText}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>,
  document.body
)}
      <Modal
        isOpen={showUnsavedModal}
        title="Discard Changes?"
        onClose={() => setShowUnsavedModal(false)}
        onConfirm={onClose}
        confirmText="Discard"
        danger={true}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          You have unsaved changes. Are you sure you want to close without saving?
        </p>
      </Modal>
    </>
  );
}
