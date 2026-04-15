import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { AppContext } from '../App';

const CATEGORIES = {
  income: ['Allowance', 'Job', 'Gift', 'Sale', 'Other'],
  expense: ['Food', 'Games', 'Clothes', 'Subscriptions', 'Tech', 'Transport', 'Other']
};

// Helper function to format date for input field
const formatDateForInput = (dateInput) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) {
    return formatDateForInput(new Date());
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function TransactionForm({ onClose, onSubmit, initialData = null }) {
  const { currencyInfo } = useContext(AppContext);
  const currSymbol = currencyInfo?.symbol || '₹';
  
  // State management with proper initialization
  const [type, setType] = useState(() => initialData?.type || 'expense');
  const [amount, setAmount] = useState(() => {
    if (initialData?.amount) {
      return initialData.amount.toString();
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
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update categories when type changes
  useEffect(() => {
    // When type changes, we need to handle category selection carefully
    if (CATEGORIES[type]) {
      // Check if current category exists in the new type's categories
      const categoryExists = CATEGORIES[type].includes(category);
      
      if (!categoryExists) {
        // If editing and we have initial data, try to preserve original category
        if (initialData && initialData.type === type && CATEGORIES[type].includes(initialData.category)) {
          setCategory(initialData.category);
        } else {
          // Otherwise set to first category of the new type
          setCategory(CATEGORIES[type][0]);
        }
      }
    }
  }, [type, initialData, category]);

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
        date: new Date(date).toISOString() // Store as ISO string for consistency
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
  }, [validateForm, isSubmitting, amount, initialData, type, category, note, date, onSubmit, resetForm]);

  // Handle cancel with confirmation if form is dirty
  const handleCancel = useCallback(() => {
    // Check if form has unsaved changes
    const isDirty = (initialData === null) && (amount !== '' || note !== '');
    
    if (isDirty) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [amount, note, initialData, onClose]);

  // Memoized values for performance
  const isExpense = useMemo(() => type === 'expense', [type]);
  const submitButtonText = useMemo(() => {
    if (initialData) return 'Save Changes';
    return `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  }, [initialData, type]);

  return (
    <AnimatePresence>
      <motion.div 
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleCancel}
      >
        <motion.div 
          className="modal-box glass"
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              {initialData ? '✍️ Edit Transaction' : '✨ New Transaction'}
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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              {['expense', 'income'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    zIndex: 1,
                    color: type === t ? 'white' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    textTransform: 'capitalize',
                    transition: 'color 0.2s'
                  }}
                >
                  {t}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-field">
                <label>Amount ({currSymbol})</label>
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
                <label>Date</label>
                <input 
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  disabled={isSubmitting}
                  style={{ 
                    fontSize: '0.9rem', 
                    fontWeight: 600,
                    colorScheme: 'dark',
                    opacity: isSubmitting ? 0.7 : 1
                  }}
                />
              </div>
            </div>

            <div className="form-field">
              <label>Category</label>
              <select 
                value={category} 
                onChange={e => setCategory(e.target.value)}
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              >
                <option value="">Select category...</option>
                {CATEGORIES[type].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Description (Optional)</label>
              <input 
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="What was this for?"
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

            <div className="modal-actions" style={{ marginTop: 8, display: 'flex', gap: 12 }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={handleCancel}
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              >
                Cancel
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
    </AnimatePresence>
  );
}