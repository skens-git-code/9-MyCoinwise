/* —————————————————————————————————————
 * Transaction Form (Redesigned & Optimized)
 * Modern modal form for creating or editing a transaction.
 * Features:
 *   - Sleek header with dynamic type badge
 *   - Segmented Expense/Income pill slider
 *   - Hero Amount card with currency prefix and quick-preset chips (+100, +500, +1k)
 *   - Quick-select category pills with emojis + searchable full dropdown
 *   - Date with quick "Today" / "Yesterday" ghost toggles
 *   - Description with character count meter
 *   - Collapsible "Additional Details" drawer (Account, Merchant, Payment, Tags, Ref#, Recurring)
 *   - Sticky frosted glass actions footer
 * ————————————————————————————————————— */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  ArrowDownRight,
  ArrowUpRight,
  Calendar as CalendarIcon,
  Tag,
  Store,
  CreditCard,
  SlidersHorizontal,
  ChevronDown,
  FileText,
  Landmark,
  Clock,
  Sparkles,
  User,
  Target,
} from 'lucide-react';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import Modal from './Modal';
import { rafThrottle } from '../utils/performanceOptimizer';

/* —————————————————————————————————————
 * Category Options & Emojis
 * ————————————————————————————————————— */
const CATEGORIES = {
  income: ['Salary', 'Freelance', 'Allowance', 'Job', 'Gift', 'Sale', 'Investment', 'Other'],
  expense: [
    'Food',
    'Groceries',
    'Games',
    'Clothes',
    'Subscriptions',
    'Tech',
    'Transport',
    'Shopping',
    'Entertainment',
    'Health',
    'Education',
    'Bills',
    'Rent',
    'Travel',
    'Fitness',
    'Utilities',
    'Insurance',
    'Other',
  ],
};

const CATEGORY_EMOJIS = {
  Food: '🍔',
  Groceries: '🛒',
  Transport: '🚗',
  Shopping: '🛍️',
  Bills: '📄',
  Entertainment: '🍿',
  Rent: '🏠',
  Health: '💊',
  Travel: '✈️',
  Education: '📚',
  Fitness: '🏋️',
  Utilities: '⚡',
  Subscriptions: '🔁',
  Tech: '💻',
  Games: '🎮',
  Clothes: '👕',
  Insurance: '🛡️',
  Salary: '💰',
  Freelance: '💼',
  Investment: '📈',
  Gift: '🎁',
  Allowance: '🪙',
  Job: '👔',
  Sale: '🏷️',
  Other: '📦',
};

// ── Normalize any date input into a YYYY-MM-DD string for <input type="date"> ──
const formatDateForInput = (dateInput) => {
  if (!dateInput) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const match = String(dateInput).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isTruthyBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

export default function TransactionForm({ isOpen = true, onClose, onSubmit, initialData = null }) {
  // ── Context: currency, accounts, i18n ──
  const { currency, currencyInfo, accounts = [], budgets = [] } = useAppState();
  const { t } = useAppActions();
  const currSymbol = currencyInfo?.symbol || '₹';

  /* —————————————————————————————————————
   * Quick Date Helpers (Today & Yesterday)
   * ————————————————————————————————————— */
  const todayStr = useMemo(() => formatDateForInput(new Date()), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatDateForInput(d);
  }, []);

  /* —————————————————————————————————————
   * Form State
   * ————————————————————————————————————— */
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

  // ── Budget Linkage State (Wealth, Subscription, None, or Custom) ──
  const [budgetCategory, setBudgetCategory] = useState(() => initialData?.budget_category || 'auto');
  const [budgetId, setBudgetId] = useState(() => initialData?.budget_id || '');

  const linkedBudgetName = useMemo(() => {
    if (!budgetId) return null;
    const match = (budgets || []).find((b) => String(b._id || b.id) === String(budgetId));
    return match ? (match.name || match.category) : null;
  }, [budgetId, budgets]);

  const [note, setNote] = useState(initialData?.note || '');

  const [date, setDate] = useState(() => {
    if (initialData?.date) {
      return formatDateForInput(initialData.date);
    }
    return todayStr;
  });

  // ── Enhanced Fields ──
  const [merchant, setMerchant] = useState(initialData?.merchant || '');
  const [bankName, setBankName] = useState(initialData?.bank_name || '');
  const [senderName, setSenderName] = useState(initialData?.sender_name || '');
  const [receiverName, setReceiverName] = useState(initialData?.receiver_name || '');
  const [tags, setTags] = useState(() =>
    Array.isArray(initialData?.tags) ? initialData.tags.join(', ') : initialData?.tags || ''
  );
  const [paymentMethod, setPaymentMethod] = useState(initialData?.payment_method || 'other');
  const [accountId, setAccountId] = useState(initialData?.account_id || '');
  const [transactionNumber, setTransactionNumber] = useState(initialData?.transaction_number || '');
  const [isRecurring, setIsRecurring] = useState(() => isTruthyBool(initialData?.is_recurring));
  const [recurrenceInterval, setRecurrenceInterval] = useState(initialData?.recurrence_interval || 'monthly');

  // ── Drawer & UI states ──
  const [isMoreOpen, setIsMoreOpen] = useState(() => {
    return Boolean(
      initialData?.merchant ||
        initialData?.bank_name ||
        initialData?.sender_name ||
        initialData?.receiver_name ||
        initialData?.account_id ||
        (Array.isArray(initialData?.tags) && initialData.tags.length > 0) ||
        (typeof initialData?.tags === 'string' && initialData.tags.trim()) ||
        initialData?.transaction_number ||
        isTruthyBool(initialData?.is_recurring) ||
        (initialData?.payment_method && initialData.payment_method !== 'other')
    );
  });

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const modalRef = useRef(null);
  const overlayPointerDownRef = useRef(false);

  /* —————————————————————————————————————
   * Sync Form With initialData Without Cascading Rerenders
   * ————————————————————————————————————— */
  const prevInitialRef = useRef(initialData);
  const prevOpenRef = useRef(isOpen);

  useEffect(() => {
    const isNewOpen = isOpen && !prevOpenRef.current;
    const initialChanged = prevInitialRef.current !== initialData;
    prevOpenRef.current = isOpen;
    prevInitialRef.current = initialData;

    if (isOpen && (isNewOpen || initialChanged)) {
      const nextType = initialData?.type || 'expense';
      setType(nextType);
      setAmount(initialData?.amount !== undefined && initialData?.amount !== null ? String(initialData.amount) : '');
      setCategory(initialData?.category || CATEGORIES[nextType][0]);
      setNote(initialData?.note || '');
      setDate(initialData?.date ? formatDateForInput(initialData.date) : todayStr);
      setMerchant(initialData?.merchant || '');
      setBankName(initialData?.bank_name || '');
      setSenderName(initialData?.sender_name || '');
      setReceiverName(initialData?.receiver_name || '');
      setTags(Array.isArray(initialData?.tags) ? initialData.tags.join(', ') : initialData?.tags || '');
      setPaymentMethod(initialData?.payment_method || 'other');
      setAccountId(initialData?.account_id || '');
      setTransactionNumber(initialData?.transaction_number || '');
      setIsRecurring(isTruthyBool(initialData?.is_recurring));
      setRecurrenceInterval(initialData?.recurrence_interval || 'monthly');
      setBudgetCategory(initialData?.budget_category || 'auto');
      setBudgetId(initialData?.budget_id || '');
      setError('');
      setShowUnsavedModal(false);
      const shouldOpenMore = Boolean(
        initialData?.merchant ||
        initialData?.bank_name ||
        initialData?.sender_name ||
        initialData?.receiver_name ||
        initialData?.account_id ||
        (Array.isArray(initialData?.tags) && initialData.tags.length > 0) ||
        (typeof initialData?.tags === 'string' && initialData.tags.trim()) ||
        initialData?.transaction_number ||
        isTruthyBool(initialData?.is_recurring) ||
        (initialData?.payment_method && initialData.payment_method !== 'other')
      );
      setIsMoreOpen(shouldOpenMore);
    }
  }, [initialData, isOpen, todayStr]);

  // ── Handle Type Toggle ──
  const handleTypeToggle = useCallback(
    (nextType) => {
      if (nextType === type) return;
      setType(nextType);
      if (initialData && initialData.type === nextType && initialData.category) {
        setCategory(initialData.category);
      } else {
        setCategory(CATEGORIES[nextType][0]);
      }
    },
    [type, initialData]
  );

  const isEditMode = useMemo(() => {
    return Boolean(initialData && (initialData._id || initialData.id));
  }, [initialData]);

  const handleCancel = useCallback(() => {
    const isDirty =
      !isEditMode &&
      (amount !== '' ||
        note.trim() !== '' ||
        merchant.trim() !== '' ||
        tags.trim() !== '' ||
        bankName.trim() !== '' ||
        senderName.trim() !== '' ||
        receiverName.trim() !== '' ||
        transactionNumber.trim() !== '' ||
        accountId !== '' ||
        isRecurring);
    if (isDirty) {
      setShowUnsavedModal(true);
    } else {
      onClose();
    }
  }, [
    isEditMode,
    amount,
    note,
    merchant,
    tags,
    bankName,
    senderName,
    receiverName,
    transactionNumber,
    accountId,
    isRecurring,
    onClose,
  ]);

  const isTouchDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);

  // ── Dynamic Mobile Viewport & Virtual Keypad Height Tracking ──
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;

    const updateViewportBounds = rafThrottle(() => {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      const offsetTop = vv ? vv.offsetTop : 0;
      document.documentElement.style.setProperty('--tx-modal-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--tx-modal-viewport-offset-top', `${offsetTop}px`);
    });

    updateViewportBounds();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateViewportBounds);
      vv.addEventListener('scroll', updateViewportBounds);
    }
    window.addEventListener('resize', updateViewportBounds);

    return () => {
      updateViewportBounds.cancel();
      if (vv) {
        vv.removeEventListener('resize', updateViewportBounds);
        vv.removeEventListener('scroll', updateViewportBounds);
      }
      window.removeEventListener('resize', updateViewportBounds);
      document.documentElement.style.removeProperty('--tx-modal-viewport-height');
      document.documentElement.style.removeProperty('--tx-modal-viewport-offset-top');
    };
  }, [isOpen]);

  const handleFormFocusCapture = useCallback(() => {
    if (typeof window !== 'undefined' && isTouchDevice && window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
  }, [isTouchDevice]);

  const handleOverlayPointerDown = useCallback((e) => {
    overlayPointerDownRef.current = e.target === e.currentTarget;
  }, []);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget && overlayPointerDownRef.current) {
      handleCancel();
    }
    overlayPointerDownRef.current = false;
  }, [handleCancel]);

  /* —————————————————————————————————————
   * Focus Management & Trap
   * ————————————————————————————————————— */
  useFocusTrap({
    isOpen,
    onClose: handleCancel,
    containerRef: modalRef,
    closeOnEscape: !isSubmitting && !showUnsavedModal,
  });

  /* —————————————————————————————————————
   * Amount Normalization & Preset Increments
   * ————————————————————————————————————— */
  const handleAmountChange = useCallback((e) => {
    let val = e.target.value;
    // Normalize comma to decimal point (e.g. mobile keyboards or European/Indian format)
    val = val.replace(/,/g, '.');
    // Keep only numbers and decimal points
    val = val.replace(/[^0-9.]/g, '');
    // Ensure at most one decimal point
    const parts = val.split('.');
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('');
    }
    // Limit to 2 decimal places
    if (parts.length >= 2 && parts[1].length > 2) {
      val = parts[0] + '.' + parts[1].slice(0, 2);
    }
    // Prevent multiple leading zeroes (e.g. "0500" -> "500", but keep "0" or "0.")
    if (val.length > 1 && val.startsWith('0') && val[1] !== '.') {
      val = val.replace(/^0+/, '') || '0';
    }
    setAmount(val);
  }, []);

  const quickPresets = useMemo(() => {
    const isInr = currency === 'INR' || currencyInfo?.code === 'INR' || currSymbol === '₹';
    if (isInr) {
      return type === 'income' ? [1000, 5000, 10000, 25000] : [100, 500, 1000, 2000];
    }
    return type === 'income' ? [100, 250, 500, 1000] : [10, 25, 50, 100];
  }, [currency, currencyInfo?.code, currSymbol, type]);

  const handleAddPreset = useCallback((presetVal) => {
    setAmount((prev) => {
      const current = parseFloat(prev);
      if (isNaN(current) || current <= 0) {
        return String(presetVal);
      }
      return String(Math.round((current + presetVal) * 100) / 100);
    });
  }, []);

  /* —————————————————————————————————————
   * Quick Date Helpers (Today & Yesterday)
   * ————————————————————————————————————— */
  const isToday = date === todayStr;
  const isYesterday = date === yesterdayStr;

  const handleSetToday = useCallback(() => {
    setDate(todayStr);
  }, [todayStr]);

  const handleSetYesterday = useCallback(() => {
    setDate(yesterdayStr);
  }, [yesterdayStr]);

  /* —————————————————————————————————————
   * Popular Category Chips
   * ————————————————————————————————————— */
  const popularCategories = useMemo(() => {
    if (type === 'income') {
      return ['Salary', 'Freelance', 'Investment', 'Gift', 'Allowance'];
    }
    return ['Food', 'Groceries', 'Transport', 'Shopping', 'Bills', 'Entertainment'];
  }, [type]);

  const filledDetailsCount = useMemo(() => {
    let count = 0;
    if (accountId) count += 1;
    if (merchant && merchant.trim()) count += 1;
    if (tags && tags.trim()) count += 1;
    if (transactionNumber && transactionNumber.trim()) count += 1;
    if (paymentMethod && paymentMethod !== 'other') count += 1;
    if (isRecurring) count += 1;
    return count;
  }, [accountId, merchant, tags, transactionNumber, paymentMethod, isRecurring]);

  /* —————————————————————————————————————
   * Validation & Submission
   * ————————————————————————————————————— */
  const validateForm = useCallback(() => {
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
    const catStr = String(category || '').trim();
    if (!catStr) {
      setError('Please select a category.');
      return false;
    }
    if (catStr.length > 60) {
      setError('Category must be 60 characters or less.');
      return false;
    }
    if (!date) {
      setError('Please select a date.');
      return false;
    }
    const selectedDate = new Date(date);
    if (isNaN(selectedDate.getTime())) {
      setError('Invalid date selected.');
      return false;
    }
    return true;
  }, [amount, category, date]);

  const resetForm = useCallback(() => {
    setType('expense');
    setAmount('');
    setCategory(CATEGORIES.expense[0]);
    setNote('');
    setDate(todayStr);
    setMerchant('');
    setBankName('');
    setSenderName('');
    setReceiverName('');
    setTags('');
    setPaymentMethod('other');
    setAccountId('');
    setTransactionNumber('');
    setIsRecurring(false);
    setRecurrenceInterval('monthly');
    setBudgetCategory('auto');
    setBudgetId('');
    setError('');
    setIsMoreOpen(false);
  }, [todayStr]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError('');
      if (!validateForm()) return;
      if (isSubmitting) return;

      setIsSubmitting(true);
      try {
        const amt = parseFloat(amount);
        const transactionData = {
          id: initialData?.id || initialData?._id,
          _id: initialData?._id || initialData?.id,
          type,
          amount: amt,
          category,
          budget_category: budgetCategory && budgetCategory !== 'auto' ? budgetCategory : null,
          budget_id: budgetId || null,
          note: note.trim(),
          date,
          merchant: merchant.trim(),
          bank_name: bankName.trim() || null,
          sender_name: senderName.trim() || null,
          receiver_name: receiverName.trim() || null,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          payment_method: paymentMethod,
          transaction_number: transactionNumber.trim() ||
            (initialData?.transaction_number || `CW-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`),
          account_id: accountId || null,
          created_at: initialData?.created_at || new Date().toISOString(),
          currency:
            accounts.find((account) => String(account.id || account._id) === String(accountId))?.currency ||
            currency ||
            'INR',
          is_recurring: isRecurring,
          recurrence_interval: isRecurring ? recurrenceInterval : null,
        };

        await onSubmit(transactionData);

        const isExistingEdit = Boolean(initialData && (initialData._id || initialData.id));
        if (!isExistingEdit) {
          resetForm();
        }
      } catch (err) {
        const errorMsg =
          err?.response?.data?.error ||
          err?.response?.data?.errors?.[0]?.msg ||
          err?.message ||
          'Failed to save transaction. Please try again.';
        setError(errorMsg);
        console.error('Submit error:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      validateForm,
      isSubmitting,
      amount,
      initialData,
      type,
      category,
      budgetCategory,
      budgetId,
      note,
      date,
      merchant,
      tags,
      paymentMethod,
      transactionNumber,
      bankName,
      senderName,
      receiverName,
      accountId,
      isRecurring,
      recurrenceInterval,
      onSubmit,
      resetForm,
      accounts,
      currency,
    ]
  );

  const isExpense = type === 'expense';
  const submitButtonText = useMemo(() => {
    if (isEditMode) return t?.('save_changes') || 'Save Changes';
    return type === 'income' ? t?.('add_income_btn') || 'Add Income' : t?.('add_expense_btn') || 'Add Expense';
  }, [isEditMode, type, t]);

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="tx-modal-overlay"
              className="modal-overlay modal-overlay-centered transaction-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={handleOverlayPointerDown}
              onTouchStart={handleOverlayPointerDown}
              onClick={handleOverlayClick}
            >
              <motion.div
                ref={modalRef}
                key="tx-modal-box"
                role="dialog"
                aria-modal="true"
                aria-label={
                  isEditMode
                    ? t?.('edit_transaction') || 'Edit Transaction'
                    : t?.('new_transaction') || 'New Transaction'
                }
                className={`modal-box glass transaction-modal type-${type}`}
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* ── Modern Header ── */}
                <div className="transaction-modal-header">
                  <div className="tx-modal-title-group">
                    <div className={`tx-title-icon-badge ${type}`}>
                      {isExpense ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
                    </div>
                    <div className="tx-title-text">
                      <h3>
                        {isEditMode
                          ? t?.('edit_transaction') || 'Edit Transaction'
                          : t?.('new_transaction') || 'New Transaction'}
                      </h3>
                      <span className="tx-subtitle">
                        {isExpense ? 'Record money spent' : 'Record money received'}
                      </span>
                    </div>
                  </div>
                  <button
                    className="tx-close-btn"
                    onClick={handleCancel}
                    type="button"
                    aria-label="Close dialog"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* ── Form Body ── */}
                <form onSubmit={handleSubmit} className="transaction-form" onFocusCapture={handleFormFocusCapture}>
                  <div className="transaction-form-scrollable">
                    {/* ── Error Banner ── */}
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          role="alert"
                          aria-live="assertive"
                          aria-atomic="true"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="feedback-msg error"
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 12,
                            padding: '10px 14px',
                            fontSize: '0.84rem',
                            color: '#ef4444',
                            fontWeight: 600,
                          }}
                        >
                          {error}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* ── Segmented Type Toggle ── */}
                    <div className="tx-segmented-control" role="radiogroup" aria-label="Transaction type">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={type === 'expense'}
                        className={`tx-segmented-btn ${type === 'expense' ? 'active' : ''}`}
                        onClick={() => handleTypeToggle('expense')}
                      >
                        <ArrowDownRight size={16} aria-hidden="true" />
                        <span>{t?.('expense_label') || 'Expense'}</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={type === 'income'}
                        className={`tx-segmented-btn ${type === 'income' ? 'active' : ''}`}
                        onClick={() => handleTypeToggle('income')}
                      >
                        <ArrowUpRight size={16} aria-hidden="true" />
                        <span>{t?.('income_label') || 'Income'}</span>
                      </button>

                      <motion.div
                        className={`tx-segmented-slider ${type}`}
                        style={{
                          width: 'calc(50% - 4px)',
                        }}
                        animate={{ left: isExpense ? 4 : 'calc(50%)' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                      />
                    </div>

                    {/* ── Hero Amount Card ── */}
                    <div className={`tx-hero-amount ${type}`}>
                      <div className="tx-amount-label-row">
                        <span className="tx-field-label">{t?.('amount') || 'Amount'}</span>
                        <span className="tx-currency-badge">
                          {currSymbol} {currency}
                        </span>
                      </div>
                      <div className="tx-amount-display">
                        <span className="tx-amount-symbol" aria-hidden="true">
                          {currSymbol}
                        </span>
                        <input
                          type="text"
                          value={amount}
                          onChange={handleAmountChange}
                          placeholder="0.00"
                          autoFocus={!initialData && !isTouchDevice}
                          disabled={isSubmitting}
                          aria-label={`${t?.('amount') || 'Amount'} in ${currSymbol}`}
                          aria-required="true"
                          className="tx-amount-input"
                          inputMode="decimal"
                        />
                      </div>

                      {/* Quick preset chips */}
                      <div className="tx-amount-presets" role="group" aria-label="Quick amount presets">
                        {quickPresets.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className="tx-preset-chip"
                            onClick={() => handleAddPreset(preset)}
                            disabled={isSubmitting}
                          >
                            +{currSymbol}
                            {preset.toLocaleString()}
                          </button>
                        ))}
                        {amount ? (
                          <button
                            type="button"
                            className="tx-preset-chip tx-preset-clear"
                            onClick={() => setAmount('')}
                            disabled={isSubmitting}
                            title="Clear amount"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* ── Category Quick Chips + Dropdown ── */}
                    <div className="form-field tx-category-section">
                      <div className="tx-category-header">
                        <label htmlFor="tx-category-select">{t?.('category') || 'Category'}</label>
                        <span className="tx-current-cat-badge">
                          {CATEGORY_EMOJIS[category] || '🏷️'} {category}
                        </span>
                      </div>

                      {/* Quick category pills */}
                      <div
                        className="tx-cat-chips-scroll"
                        role="radiogroup"
                        aria-label="Quick category selection"
                      >
                        {popularCategories.map((catName) => {
                          const isSelected = category === catName;
                          return (
                            <button
                              key={catName}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              className={`tx-cat-chip ${isSelected ? 'active' : ''} ${type}`}
                              onClick={() => setCategory(catName)}
                              disabled={isSubmitting}
                            >
                              <span className="tx-cat-emoji" aria-hidden="true">
                                {CATEGORY_EMOJIS[catName] || '🏷️'}
                              </span>
                              <span className="tx-cat-text">{catName}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Full category dropdown */}
                      <div className="tx-select-wrapper">
                        <select
                          id="tx-category-select"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          disabled={isSubmitting}
                          aria-required="true"
                          className="tx-select-input"
                        >
                          <option value="">{t?.('category') || 'Select category'}...</option>
                          {[...new Set([...CATEGORIES[type], category].filter(Boolean))].map((c) => (
                            <option key={c} value={c}>
                              {(CATEGORY_EMOJIS[c] ? `${CATEGORY_EMOJIS[c]}  ` : '') + c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* ── Budget Linkage Section (Expense only) ── */}
                    {isExpense && (
                      <div className="form-field tx-budget-link-section">
                        <div className="tx-field-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label htmlFor="tx-budget-link-select" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                            <Target size={15} style={{ color: 'var(--brand-primary)' }} />
                            <span>{t?.('link_to_budget') || 'Link to Budget'}</span>
                            <span className="tx-label-hint" style={{ fontWeight: 400, opacity: 0.75, fontSize: '0.75rem' }}>
                              (Assign to Wealth, Subscription, or custom)
                            </span>
                          </label>
                          {budgetCategory && budgetCategory !== 'auto' && (
                            <span
                              className="tx-current-cat-badge"
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: budgetCategory === 'none' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(var(--brand-primary-rgb), 0.12)',
                                color: budgetCategory === 'none' ? 'var(--danger-color, #ef4444)' : 'var(--brand-primary)',
                                fontWeight: 600,
                              }}
                            >
                              {budgetCategory === 'none' ? '🚫 Unlinked' : `🎯 Linked: ${linkedBudgetName || budgetCategory}`}
                            </span>
                          )}
                        </div>

                        {/* Quick preset chips */}
                        <div className="tx-cat-chips-scroll" role="radiogroup" aria-label="Budget Link presets" style={{ marginBottom: 8 }}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={!budgetCategory || budgetCategory === 'auto'}
                            className={`tx-cat-chip ${(!budgetCategory || budgetCategory === 'auto') ? 'active' : ''} expense`}
                            onClick={() => { setBudgetCategory('auto'); setBudgetId(''); }}
                            disabled={isSubmitting}
                            title="Automatically assign to this transaction's category"
                          >
                            <span className="tx-cat-text">Auto ({category})</span>
                          </button>

                          <button
                            type="button"
                            role="radio"
                            aria-checked={budgetCategory === 'Wealth'}
                            className={`tx-cat-chip ${budgetCategory === 'Wealth' ? 'active' : ''} expense`}
                            onClick={() => { setBudgetCategory('Wealth'); setBudgetId(''); }}
                            disabled={isSubmitting}
                            title="Link this expense to Wealth & Assets budget"
                          >
                            <span className="tx-cat-emoji" aria-hidden="true">💎</span>
                            <span className="tx-cat-text">Wealth</span>
                          </button>

                          <button
                            type="button"
                            role="radio"
                            aria-checked={budgetCategory === 'Subscription' || budgetCategory === 'Subscriptions'}
                            className={`tx-cat-chip ${budgetCategory === 'Subscription' || budgetCategory === 'Subscriptions' ? 'active' : ''} expense`}
                            onClick={() => { setBudgetCategory('Subscriptions'); setBudgetId(''); }}
                            disabled={isSubmitting}
                            title="Link this expense to Subscriptions budget"
                          >
                            <span className="tx-cat-emoji" aria-hidden="true">🔁</span>
                            <span className="tx-cat-text">Subscription</span>
                          </button>

                          <button
                            type="button"
                            role="radio"
                            aria-checked={budgetCategory === 'none'}
                            className={`tx-cat-chip ${budgetCategory === 'none' ? 'active' : ''} expense`}
                            onClick={() => { setBudgetCategory('none'); setBudgetId(''); }}
                            disabled={isSubmitting}
                            title="Do not count this transaction against any budget"
                          >
                            <span className="tx-cat-emoji" aria-hidden="true">🚫</span>
                            <span className="tx-cat-text">Don't Link</span>
                          </button>
                        </div>

                        {/* Full Budget / Custom Category Selector Dropdown */}
                        <div className="tx-select-wrapper">
                          <select
                            id="tx-budget-link-select"
                            value={budgetId ? `id:${budgetId}` : (budgetCategory || 'auto')}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.startsWith('id:')) {
                                const id = val.slice(3);
                                const match = (budgets || []).find((b) => String(b._id || b.id) === id);
                                setBudgetId(id);
                                setBudgetCategory(match?.category || match?.name || 'custom');
                              } else {
                                setBudgetId('');
                                setBudgetCategory(val);
                              }
                            }}
                            disabled={isSubmitting}
                            className="tx-select-input"
                          >
                            <option value="auto">Auto: Link to "{category}" Budget</option>
                            <option value="Wealth">💎 Wealth (Assets / Liabilities / Investments)</option>
                            <option value="Subscriptions">🔁 Subscription (Recurring Services)</option>
                            <option value="none">🚫 Don't link to any budget</option>
                            {Array.isArray(budgets) && budgets.length > 0 && (
                              <optgroup label="Active User Budgets">
                                {budgets.map((b) => {
                                  const bId = String(b._id || b.id);
                                  return (
                                    <option key={bId} value={`id:${bId}`}>
                                      📊 {b.name} ({b.category || 'General'})
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                            <optgroup label="Other Categories">
                              {CATEGORIES.expense
                                .filter((c) => c !== category && c !== 'Subscriptions')
                                .map((c) => (
                                  <option key={c} value={c}>
                                    {(CATEGORY_EMOJIS[c] ? `${CATEGORY_EMOJIS[c]}  ` : '') + c}
                                  </option>
                                ))}
                            </optgroup>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* ── Date & Description 2-Column Row ── */}
                    <div className="transaction-form-grid">
                      {/* Date */}
                      <div className="form-field">
                        <div className="tx-field-header-row">
                          <label htmlFor="tx-date-input">{t?.('date') || 'Date'}</label>
                          <div className="tx-quick-date-buttons">
                            <button
                              type="button"
                              className={`tx-date-ghost-btn ${isToday ? 'active' : ''}`}
                              onClick={handleSetToday}
                              disabled={isSubmitting}
                            >
                              Today
                            </button>
                            <button
                              type="button"
                              className={`tx-date-ghost-btn ${isYesterday ? 'active' : ''}`}
                              onClick={handleSetYesterday}
                              disabled={isSubmitting}
                            >
                              Yesterday
                            </button>
                          </div>
                        </div>
                        <div className="tx-input-with-icon">
                          <CalendarIcon size={16} className="tx-input-lead-icon" aria-hidden="true" />
                          <input
                            id="tx-date-input"
                            type="date"
                            value={date}
                            max={todayStr}
                            onChange={(e) => setDate(e.target.value)}
                            disabled={isSubmitting}
                            aria-required="true"
                            className="date-input tx-input-pl"
                          />
                        </div>
                      </div>

                      {/* Description / Note */}
                      <div className="form-field">
                        <div className="tx-field-header-row">
                          <label htmlFor="tx-note-input">
                            {t?.('description') || 'Description'}{' '}
                            <span className="tx-label-hint">({t?.('optional') || 'Optional'})</span>
                          </label>
                          {note.length > 0 && (
                            <span className={`tx-char-counter ${note.length > 50 ? 'warning' : ''}`}>
                              {note.length}/60
                            </span>
                          )}
                        </div>
                        <div className="tx-input-with-icon">
                          <FileText size={16} className="tx-input-lead-icon" aria-hidden="true" />
                          <input
                            id="tx-note-input"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={t?.('what_was_this_for') || 'What was this for?'}
                            maxLength={60}
                            disabled={isSubmitting}
                            className="tx-input-pl"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── Collapsible "Additional Details" Section ── */}
                    <div className="tx-more-section">
                      <button
                        type="button"
                        className={`tx-more-toggle-btn ${isMoreOpen ? 'open' : ''}`}
                        onClick={() => setIsMoreOpen((prev) => !prev)}
                        aria-expanded={isMoreOpen}
                      >
                        <div className="tx-more-toggle-left">
                          <SlidersHorizontal size={14} />
                          <span>Additional Details</span>
                          {filledDetailsCount > 0 && (
                            <span className="tx-filled-badge">{filledDetailsCount} added</span>
                          )}
                        </div>
                        <div className="tx-more-toggle-right">
                          <span className="tx-more-hint">
                            {isMoreOpen ? 'Hide' : 'Account, Merchant, Tags...'}
                          </span>
                          <ChevronDown size={15} className={`tx-chevron ${isMoreOpen ? 'rotated' : ''}`} />
                        </div>
                      </button>

                      <AnimatePresence>
                        {isMoreOpen && (
                          <motion.div
                            className="tx-more-content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <div className="tx-more-grid">
                              {/* Account */}
                              <div className="form-field">
                                <label htmlFor="transaction-account">
                                  <Landmark size={13} /> {t?.('account_optional') || 'Account'}
                                </label>
                                <select
                                  id="transaction-account"
                                  value={accountId}
                                  onChange={(e) => setAccountId(e.target.value)}
                                  disabled={isSubmitting}
                                >
                                  <option value="">{t?.('no_account_selected') || 'No account selected'}</option>
                                  {accounts
                                    .filter((account) => account.is_active !== false)
                                    .map((account) => (
                                      <option key={account.id || account._id} value={account.id || account._id}>
                                        {account.name} · {account.currency || currSymbol}
                                      </option>
                                    ))}
                                </select>
                              </div>

                              {/* Payment Method */}
                              <div className="form-field">
                                <label htmlFor="tx-payment-method">
                                  <CreditCard size={13} /> {t?.('payment_method') || 'Payment Method'}
                                </label>
                                <select
                                  id="tx-payment-method"
                                  value={paymentMethod}
                                  onChange={(e) => setPaymentMethod(e.target.value)}
                                  disabled={isSubmitting}
                                >
                                  <option value="other">{t?.('pm_other') || 'Other'}</option>
                                  <option value="cash">💵 {t?.('pm_cash') || 'Cash'}</option>
                                  <option value="card">💳 {t?.('pm_card') || 'Card'}</option>
                                  <option value="upi">📱 {t?.('pm_upi') || 'UPI'}</option>
                                  <option value="bank_transfer">🏦 {t?.('pm_bank_transfer') || 'Bank Transfer'}</option>
                                  <option value="wallet">👛 {t?.('pm_wallet') || 'Wallet'}</option>
                                </select>
                              </div>

                              {/* Merchant */}
                              <div className="form-field">
                                <label htmlFor="tx-merchant">
                                  <Store size={13} /> {t?.('merchant_optional') || 'Merchant'}
                                </label>
                                <input
                                  id="tx-merchant"
                                  value={merchant}
                                  onChange={(e) => setMerchant(e.target.value)}
                                  placeholder="e.g. Amazon, Starbucks"
                                  maxLength={150}
                                  disabled={isSubmitting}
                                />
                              </div>

                              {/* Tags */}
                              <div className="form-field">
                                <label htmlFor="tx-tags">
                                  <Tag size={13} /> {t?.('tags_optional') || 'Tags'}
                                </label>
                                <input
                                  id="tx-tags"
                                  value={tags}
                                  onChange={(e) => setTags(e.target.value)}
                                  placeholder="e.g. travel, urgent, family"
                                  disabled={isSubmitting}
                                />
                              </div>

                              {/* Transaction Number */}
                              <div className="form-field">
                                <label htmlFor="tx-trans-num">
                                  # {t?.('transaction_number') || 'Reference / Txn #'}
                                </label>
                                <input
                                  id="tx-trans-num"
                                  value={transactionNumber}
                                  onChange={(e) => setTransactionNumber(e.target.value)}
                                  placeholder="Enter transaction number"
                                  disabled={isSubmitting}
                                />
                              </div>

                              {/* Bank / App Platform */}
                              <div className="form-field">
                                <label htmlFor="tx-bank-name">
                                  <Landmark size={14} /> {t?.('bank_or_app') || 'Bank / Payment App'}
                                </label>
                                <input
                                  id="tx-bank-name"
                                  value={bankName}
                                  onChange={(e) => setBankName(e.target.value)}
                                  placeholder="e.g. HDFC, Google Pay, PhonePe, Paytm, SBI"
                                  disabled={isSubmitting}
                                  maxLength={100}
                                />
                              </div>

                              {/* Sender & Receiver (From / To) */}
                              <div className="tx-form-row">
                                <div className="form-field">
                                  <label htmlFor="tx-sender-name">
                                    <User size={14} /> {t?.('sender_name') || 'Sender (From)'}
                                  </label>
                                  <input
                                    id="tx-sender-name"
                                    value={senderName}
                                    onChange={(e) => setSenderName(e.target.value)}
                                    placeholder="e.g. Employer, Client, Alice"
                                    disabled={isSubmitting}
                                    maxLength={150}
                                  />
                                </div>
                                <div className="form-field">
                                  <label htmlFor="tx-receiver-name">
                                    <User size={14} /> {t?.('receiver_name') || 'Receiver (To)'}
                                  </label>
                                  <input
                                    id="tx-receiver-name"
                                    value={receiverName}
                                    onChange={(e) => setReceiverName(e.target.value)}
                                    placeholder="e.g. Merchant, Bob, Landlord"
                                    disabled={isSubmitting}
                                    maxLength={150}
                                  />
                                </div>
                              </div>

                              {/* Recurring Toggle */}
                              <div className="form-field tx-recurring-field">
                                <label className="tx-recurring-toggle-label">
                                  <div className="toggle-switch">
                                    <input
                                      type="checkbox"
                                      checked={isRecurring}
                                      onChange={(e) => setIsRecurring(e.target.checked)}
                                      disabled={isSubmitting}
                                    />
                                    <span className="slider"></span>
                                  </div>
                                  <span className="tx-recurring-title">
                                    <Clock size={14} /> {t?.('is_recurring') || 'Recurring Transaction'}
                                  </span>
                                </label>
                                {isRecurring && (
                                  <select
                                    value={recurrenceInterval}
                                    onChange={(e) => setRecurrenceInterval(e.target.value)}
                                    disabled={isSubmitting}
                                    className="tx-recurrence-select"
                                  >
                                    <option value="daily">{t?.('daily') || 'Daily'}</option>
                                    <option value="weekly">{t?.('weekly') || 'Weekly'}</option>
                                    <option value="monthly">{t?.('monthly') || 'Monthly'}</option>
                                    <option value="yearly">{t?.('yearly') || 'Yearly'}</option>
                                  </select>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* ── Actions Footer ── */}
                  <div className="modal-actions transaction-form-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleCancel}
                      disabled={isSubmitting}
                    >
                      {t?.('cancel') || 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      className={`btn-submit-tx ${type}`}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <div className="spinner-dots" />
                      ) : (
                        <Check size={16} />
                      )}
                      <span>{submitButtonText}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Discard-changes confirmation modal ── */}
      <Modal
        isOpen={showUnsavedModal}
        title={t?.('discard_changes') || 'Discard Changes?'}
        onClose={() => setShowUnsavedModal(false)}
        onConfirm={onClose}
        confirmText={t?.('discard') || 'Discard'}
        danger={true}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {t?.('unsaved_changes_warning') ||
            'You have unsaved changes. Are you sure you want to close without saving?'}
        </p>
      </Modal>
    </>
  );
}