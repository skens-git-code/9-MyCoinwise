import React, {
  useState, useContext, useMemo, useCallback, useEffect, useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit3, Trash2, AlertCircle, Calendar, Wallet, Copy,
  ToggleLeft, ToggleRight, Eye, EyeOff, Loader2,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

/* 
 * ————————————————————————————————————————————
 * CONFIGURATION & CONSTANTS
 * Defines immutable values used throughout the component.
 * ————————————————————————————————————————————
 */
const PALETTE = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#3b82f6', '#f43f5e', '#14b8a6',
];
const PERIOD_TYPES = ['monthly', 'weekly', 'custom'];
const STATUS_WARNING_THRESHOLD = 80;
const STATUS_CRITICAL_THRESHOLD = 100;
const MAX_FINANCIAL_LIMIT = 999_999_999.99;
const VALID_DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
const MAX_TITLE_LENGTH = 100;
const COPY_SUFFIX = ' (Copy)';
const MAX_BASE_NAME_LENGTH = MAX_TITLE_LENGTH - COPY_SUFFIX.length;

const LANGUAGE_LOCALE_MAP = {
  en: 'en-US', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN',
};

/**
 * Resolves the correct browser locale string based on the app language setting.
 */
const getBrowserLocale = (languageCode) => LANGUAGE_LOCALE_MAP[languageCode] || undefined;

/* 
 * ————————————————————————————————————————————
 * DATE UTILITIES (UTC-SAFE)
 * Helpers to handle date parsing and formatting without timezone shifts.
 * ————————————————————————————————————————————
 */

/**
 * Converts a Date object or ISO string into a local 'YYYY-MM-DD' string.
 */
const formatToLocalDateString = (inputValue) => {
  if (!inputValue) return '';
  
  // Handle ISO strings directly to avoid timezone conversion issues
  if (typeof inputValue === 'string') {
    const match = inputValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  // Fallback for Date objects
  const dateObj = inputValue instanceof Date ? inputValue : new Date(inputValue);
  if (Number.isNaN(dateObj.getTime())) return '';
  
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
};

/**
 * Parses a 'YYYY-MM-DD' string into a local Date object at midnight.
 */
const parseLocalDateObject = (dateString) => {
  if (!dateString) return null;
  
  if (typeof dateString === 'string') {
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const constructedDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return Number.isNaN(constructedDate.getTime()) ? null : constructedDate;
    }
  }
  
  const fallbackDate = dateString instanceof Date ? new Date(dateString) : new Date(dateString);
  return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
};

/**
 * Returns the timestamp (ms) for the start of the day (00:00:00.000) in local time.
 */
const getStartOfDayTimestamp = (dateInput) => {
  const dateObj = parseLocalDateObject(dateInput);
  if (!dateObj) return null;
  dateObj.setHours(0, 0, 0, 0);
  return dateObj.getTime();
};

/**
 * Returns the timestamp (ms) for the end of the day (23:59:59.999) in local time.
 */
const getEndOfDayTimestamp = (dateInput) => {
  const dateObj = parseLocalDateObject(dateInput);
  if (!dateObj) return null;
  dateObj.setHours(23, 59, 59, 999);
  return dateObj.getTime();
};

/**
 * Adds a specified number of days to a 'YYYY-MM-DD' string.
 */
const addDaysToDateString = (originalDateStr, daysToAdd) => {
  const dateObj = parseLocalDateObject(originalDateStr);
  if (!dateObj) return originalDateStr;
  dateObj.setDate(dateObj.getDate() + daysToAdd);
  return formatToLocalDateString(dateObj);
};

/**
 * Calculates the inclusive number of days between two 'YYYY-MM-DD' strings.
 */
const calculateInclusiveDayCount = (startDateStr, endDateStr) => {
  const start = parseLocalDateObject(startDateStr);
  const end = parseLocalDateObject(endDateStr);
  if (!start || !end) return 0;
  
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  return Math.round((end - start) / 86400000) + 1;
};

/**
 * Formats a date string for display using the resolved locale.
 */
const formatDisplayDate = (dateInput, locale) => {
  const dateObj = parseLocalDateObject(dateInput);
  if (!dateObj) return '—';
  return dateObj.toLocaleDateString(locale || undefined);
};

/* 
 * ————————————————————————————————————————————
 * HELPER FUNCTIONS
 * Utility logic for IDs, colors, and data normalization.
 * ————————————————————————————————————————————
 */

/**
 * Generates a numeric hash from an ID string for consistent color selection.
 */
const generateIdHash = (id) => {
  const idString = String(id ?? '');
  let hashValue = 0;
  for (let i = 0; i < idString.length; i += 1) {
    hashValue = (hashValue * 31 + idString.charCodeAt(i)) | 0;
  }
  return Math.abs(hashValue);
};

/**
 * Selects a color from the palette based on the budget ID or index.
 */
const selectBudgetColor = (budgetId, index) => PALETTE[generateIdHash(budgetId ?? index) % PALETTE.length];

/**
 * Extracts the unique identifier from a budget object, handling different API formats.
 */
const extractBudgetId = (budgetObject) => budgetObject?.id ?? budgetObject?._id ?? null;

/* 
 * ————————————————————————————————————————————
 * SUB-COMPONENTS
 * Small, reusable UI elements.
 * ————————————————————————————————————————————
 */

/**
 * A transparent button wrapper for icon-only actions.
 */
const ActionIconButton = ({ onClick, accessibilityLabel, children, isDisabled, variant }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={isDisabled}
    aria-label={accessibilityLabel}
    title={accessibilityLabel}
    style={{
      background: 'transparent',
      border: 'none',
      color: variant === 'danger' ? 'var(--danger-color, #ef4444)' : 'var(--text-muted)',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      padding: 4,
      borderRadius: 6,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: isDisabled ? 0.4 : 1,
    }}
  >
    {children}
  </button>
);

/* 
 * ————————————————————————————————————————————
 * MAIN COMPONENT: BudgetManager
 * Handles listing, creating, editing, and deleting budgets.
 * ————————————————————————————————————————————
 */
export default function BudgetManager() {
  const {
    budgets = [],
    refetch: refreshData,
    fmt: formatCurrency,
    transactions = [],
    loading: isLoadingData,
    t: translate,
    lang: currentLanguage,
  } = useContext(AppContext);
  
  const { showToast } = useToast();

  const userLocale = useMemo(() => getBrowserLocale(currentLanguage), [currentLanguage]);
  const getTranslation = useCallback((key, fallbackText) => translate?.(key) || fallbackText, [translate]);

  /* 
   * ————————————————————————————————————————————
   * STATE MANAGEMENT
   * ————————————————————————————————————————————
   */
  
  // Modal Visibility States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [budgetToEdit, setBudgetToEdit] = useState(null);
  const [budgetToDelete, setBudgetToDelete] = useState(null);
  const [showInactiveBudgets, setShowInactiveBudgets] = useState(false);

  // Loading States
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isDeletingBudget, setIsDeletingBudget] = useState(false);

  // Form Data States
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('monthly');
  const [formCategory, setFormCategory] = useState('');
  const [formLimit, setFormLimit] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [isRolloverEnabled, setIsRolloverEnabled] = useState(false);
  const [isBudgetActive, setIsBudgetActive] = useState(true);
  const [formErrorMessage, setFormErrorMessage] = useState('');

  // Concurrency Control for Toggles
  const activeToggleRequestsRef = useRef(new Set());
  const [, triggerToggleReRender] = useState(0);

  /* 
   * ————————————————————————————————————————————
   * DERIVED DATA
   * Memoized calculations for categories, expenses, and budget stats.
   * ————————————————————————————————————————————
   */

  /**
   * Extracts unique categories from existing transactions and budgets.
   */
  const availableCategories = useMemo(() => {
    const categorySet = new Set();
    transactions.forEach((tx) => { if (tx?.category) categorySet.add(String(tx.category)); });
    budgets.forEach((b) => { if (b?.category) categorySet.add(String(b.category)); });
    return Array.from(categorySet).sort((a, b) => a.localeCompare(b));
  }, [transactions, budgets]);

  /**
   * Filters and normalizes expense transactions for efficient client-side calculation.
   */
  const normalizedExpenses = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    
    const processedExpenses = [];
    for (const tx of transactions) {
      if (!tx || tx.type !== 'expense') continue;
      if (tx.is_deleted === true) continue;
      
      const timestamp = getStartOfDayTimestamp(tx.date);
      if (timestamp == null) continue;
      
      const amount = Number(tx.amount);
      processedExpenses.push({
        timestamp,
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        normalizedCategory: (tx.category || '').trim().toLowerCase(),
      });
    }
    
    // Sort by time for efficient range scanning later
    processedExpenses.sort((a, b) => a.timestamp - b.timestamp);
    return processedExpenses;
  }, [transactions]);

  /**
   * Enriches budget objects with calculated spending, limits, and progress metrics.
   */
  const enrichedBudgets = useMemo(() => {
    return budgets.map((budget, index) => {
      const periodStartMs = getStartOfDayTimestamp(budget.period_start);
      const periodEndMs = getEndOfDayTimestamp(budget.period_end);
      const isPeriodValid = periodStartMs != null && periodEndMs != null && periodStartMs <= periodEndMs;
      
      const targetCategoryKey = (budget.category || '').trim().toLowerCase();
      let clientCalculatedSpent = 0;

      // Calculate spent amount from local transactions if period is valid
      if (isPeriodValid) {
        for (const tx of normalizedExpenses) {
          if (tx.timestamp < periodStartMs) continue;
          if (tx.timestamp > periodEndMs) break;
          if (targetCategoryKey && tx.normalizedCategory !== targetCategoryKey) continue;
          clientCalculatedSpent += tx.amount;
        }
      }

      // Merge with backend reported spent amount (take the higher value to be safe)
      const backendSpentValue = Number(budget.total_spent);
      const isBackendSpentValid = Number.isFinite(backendSpentValue) && backendSpentValue >= 0;
      const finalSpentAmount = Math.max(clientCalculatedSpent, isBackendSpentValid ? backendSpentValue : 0);

      // Calculate effective limit including rollover
      const rolloverValue = Number.isFinite(Number(budget.rollover_amount)) ? Number(budget.rollover_amount) : 0;
      const baseLimitValue = Number.isFinite(Number(budget.total_limit)) ? Number(budget.total_limit) : 0;
      const effectiveLimit = baseLimitValue + rolloverValue;
      
      const remainingBalance = effectiveLimit - finalSpentAmount;
      const usagePercentage = effectiveLimit > 0 ? (finalSpentAmount / effectiveLimit) * 100 : 0;

      return {
        ...budget,
        category: budget.category || '',
        clientSpent: clientCalculatedSpent,
        spent: finalSpentAmount,
        baseLimit: baseLimitValue,
        rolloverAmount: rolloverValue,
        limit: effectiveLimit,
        remaining: remainingBalance,
        progress: usagePercentage,
        isPeriodValid,
        assignedColor: selectBudgetColor(extractBudgetId(budget) ?? budget.name, index),
      };
    });
  }, [budgets, normalizedExpenses]);

  /**
   * Filters budgets based on the "Show Inactive" toggle.
   */
  const displayedBudgets = useMemo(
    () => (showInactiveBudgets ? enrichedBudgets : enrichedBudgets.filter((b) => b.is_active !== false)),
    [enrichedBudgets, showInactiveBudgets]
  );

  /**
   * Calculates summary statistics for the dashboard header.
   */
  const dashboardStats = useMemo(() => {
    const activeList = enrichedBudgets.filter((b) => b.is_active !== false);
    const inactiveList = enrichedBudgets.filter((b) => b.is_active === false);
    const overBudgetCount = activeList.filter((b) => b.remaining < 0).length;
    const nearLimitCount = activeList.filter((b) => b.progress >= STATUS_WARNING_THRESHOLD && b.progress < STATUS_CRITICAL_THRESHOLD).length;
    
    return {
      total: enrichedBudgets.length,
      active: activeList.length,
      inactive: inactiveList.length,
      overBudget: overBudgetCount,
      nearLimit: nearLimitCount,
    };
  }, [enrichedBudgets]);

  /* 
   * ————————————————————————————————————————————
   * FORM HANDLERS
   * Logic for opening, closing, and populating the edit/create modal.
   * ————————————————————————————————————————————
   */

  /**
   * Resets all form fields to their initial empty state.
   */
  const resetFormFields = useCallback(() => {
    setFormName('');
    setFormType('monthly');
    setFormCategory('');
    setFormLimit('');
    setFormStartDate('');
    setFormEndDate('');
    setIsRolloverEnabled(false);
    setIsBudgetActive(true);
    setBudgetToEdit(null);
    setFormErrorMessage('');
  }, []);

  /**
   * Clears any existing validation error messages.
   */
  const clearFormError = useCallback(() => {
    setFormErrorMessage((prevError) => (prevError ? '' : prevError));
  }, []);

  /**
   * Populates the form with data from an existing budget, optionally preparing it for duplication.
   */
  const loadFormWithData = useCallback((sourceBudget, { isDuplicateMode = false } = {}) => {
    const originalName = String(sourceBudget.name || '');
    const newName = isDuplicateMode
      ? `${originalName.slice(0, MAX_BASE_NAME_LENGTH)}${COPY_SUFFIX}`
      : originalName;

    let startDate = formatToLocalDateString(sourceBudget.period_start);
    let endDate = formatToLocalDateString(sourceBudget.period_end);

    // If duplicating, shift the dates forward by the original duration
    if (isDuplicateMode && startDate && endDate) {
      const durationDays = calculateInclusiveDayCount(startDate, endDate) || 1;
      startDate = addDaysToDateString(startDate, durationDays);
      endDate = addDaysToDateString(endDate, durationDays);
    }

    setFormName(newName);
    setFormType(PERIOD_TYPES.includes(sourceBudget.type) ? sourceBudget.type : 'monthly');
    setFormCategory(sourceBudget.category || '');
    setFormLimit(
      sourceBudget.total_limit != null && Number.isFinite(Number(sourceBudget.total_limit))
        ? String(sourceBudget.total_limit)
        : ''
    );
    setFormStartDate(startDate);
    setFormEndDate(endDate);
    setIsRolloverEnabled(Boolean(sourceBudget.rollover_enabled));
    setIsBudgetActive(isDuplicateMode ? true : sourceBudget.is_active !== false);
    setBudgetToEdit(isDuplicateMode ? null : sourceBudget);
    setFormErrorMessage('');
    setIsCreateModalOpen(true);
  }, []);

  const initiateEdit = useCallback((budget) => loadFormWithData(budget, { isDuplicateMode: false }), [loadFormWithData]);
  const initiateDuplicate = useCallback((budget) => loadFormWithData(budget, { isDuplicateMode: true }), [loadFormWithData]);

  /* 
   * ————————————————————————————————————————————
   * VALIDATION LOGIC
   * Ensures form data meets requirements before submission.
   * ————————————————————————————————————————————
   */
  const validateFormData = useCallback(() => {
    const trimmedName = formName.trim();
    
    if (!trimmedName) return { isValid: false, errorMessage: 'Budget name is required.' };
    if (trimmedName.length > MAX_TITLE_LENGTH) {
      return { isValid: false, errorMessage: `Name must be ${MAX_TITLE_LENGTH} characters or fewer.` };
    }

    // Check for duplicate names (excluding the current budget being edited)
    const currentEditingId = extractBudgetId(budgetToEdit);
    const nameExists = budgets.some(
      (existingBudget) =>
        String(existingBudget.name || '').toLowerCase() === trimmedName.toLowerCase() &&
        extractBudgetId(existingBudget) !== currentEditingId
    );
    if (nameExists) return { isValid: false, errorMessage: 'A budget with that name already exists.' };

    // Validate Limit Format
    if (!VALID_DECIMAL_REGEX.test(String(formLimit))) {
      return { isValid: false, errorMessage: 'Limit must be a positive number with at most two decimal places.' };
    }
    const numericLimit = Number(formLimit);
    if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
      return { isValid: false, errorMessage: 'Limit must be greater than zero.' };
    }
    if (numericLimit > MAX_FINANCIAL_LIMIT) {
      return { isValid: false, errorMessage: `Limit cannot exceed ${MAX_FINANCIAL_LIMIT}.` };
    }

    // Validate Dates
    if (!formStartDate || !formEndDate) {
      return { isValid: false, errorMessage: 'Start and end dates are required.' };
    }
    const parsedStart = parseLocalDateObject(formStartDate);
    const parsedEnd = parseLocalDateObject(formEndDate);
    
    if (!parsedStart) return { isValid: false, errorMessage: 'Start date is invalid.' };
    if (!parsedEnd) return { isValid: false, errorMessage: 'End date is invalid.' };
    if (parsedStart > parsedEnd) return { isValid: false, errorMessage: 'Start date cannot be after end date.' };

    return {
      isValid: true,
      payload: {
        name: trimmedName,
        type: formType,
        category: formCategory.trim() || null,
        total_limit: numericLimit,
        period_start: formStartDate,
        period_end: formEndDate,
        rollover_enabled: isRolloverEnabled,
        is_active: isBudgetActive,
      },
    };
  }, [
    formName, budgets, budgetToEdit, formLimit, formStartDate, formEndDate,
    formType, formCategory, isRolloverEnabled, isBudgetActive,
  ]);

  /* 
   * ————————————————————————————————————————————
   * API ACTIONS
   * Handlers for Create, Update, Delete, and Toggle operations.
   * ————————————————————————————————————————————
   */

  /**
   * Submits the form data to create or update a budget.
   */
  const handleFormSubmission = useCallback(async (event) => {
    if (event?.preventDefault) event.preventDefault();
    if (isSubmittingForm) return;

    const validation = validateFormData();
    if (!validation.isValid) {
      setFormErrorMessage(validation.errorMessage);
      return;
    }

    setIsSubmittingForm(true);
    setFormErrorMessage('');
    
    try {
      if (budgetToEdit) {
        await api.updateBudget(extractBudgetId(budgetToEdit), validation.payload);
        showToast('success', 'Budget updated successfully!');
      } else {
        await api.createBudget(validation.payload);
        showToast('success', 'Budget created successfully!');
      }
      await refreshData();
      setIsCreateModalOpen(false);
      resetFormFields();
    } catch (error) {
      showToast('error', error?.response?.data?.error || 'Failed to save budget.');
    } finally {
      setIsSubmittingForm(false);
    }
  }, [isSubmittingForm, validateFormData, budgetToEdit, refreshData, resetFormFields, showToast]);

  /**
   * Deletes the currently selected budget.
   */
  const confirmDeletion = useCallback(async () => {
    if (!budgetToDelete || isDeletingBudget) return;
    
    const targetId = extractBudgetId(budgetToDelete);
    if (!targetId) {
      showToast('error', 'Invalid budget reference.');
      setBudgetToDelete(null);
      return;
    }

    setIsDeletingBudget(true);
    try {
      await api.deleteBudget(targetId);
      showToast('success', 'Budget deleted.');
      setBudgetToDelete(null);
      await refreshData();
    } catch (error) {
      showToast('error', error?.response?.data?.error || 'Failed to delete budget.');
    } finally {
      setIsDeletingBudget(false);
    }
  }, [budgetToDelete, isDeletingBudget, refreshData, showToast]);

  /**
   * Toggles the active status of a budget, preventing duplicate requests.
   */
  const toggleBudgetStatus = useCallback(async (targetBudget) => {
    const targetId = extractBudgetId(targetBudget);
    if (!targetId) return;
    
    // Prevent concurrent toggles for the same ID
    if (activeToggleRequestsRef.current.has(targetId)) return;

    activeToggleRequestsRef.current.add(targetId);
    triggerToggleReRender((counter) => counter + 1);

    const currentlyActive = targetBudget.is_active !== false;
    
    try {
      await api.updateBudget(targetId, { is_active: !currentlyActive });
      await refreshData();
    } catch (error) {
      showToast('error', error?.response?.data?.error || 'Failed to update status.');
    } finally {
      activeToggleRequestsRef.current.delete(targetId);
      triggerToggleReRender((counter) => counter + 1);
    }
  }, [refreshData, showToast]);

  /* 
   * ————————————————————————————————————————————
   * EFFECTS
   * Side effects for keyboard navigation and cleanup.
   * ————————————————————————————————————————————
   */
  useEffect(() => {
    if (!isCreateModalOpen && !budgetToDelete) return undefined;
    
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (isSubmittingForm || isDeletingBudget) return;
      
      if (budgetToDelete) {
        setBudgetToDelete(null);
      } else if (isCreateModalOpen) {
        setIsCreateModalOpen(false);
        resetFormFields();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCreateModalOpen, budgetToDelete, isSubmittingForm, isDeletingBudget, resetFormFields]);

  /* 
   * ————————————————————————————————————————————
   * RENDER: LOADING STATE
   * ————————————————————————————————————————————
   */
  if (isLoadingData && budgets.length === 0) {
    return (
      <div className="budget-page" style={{ padding: 'var(--spacing-lg)', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Loader2 size={40} className="spin" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
          <p style={{ color: 'var(--text-muted)' }}>{getTranslation('loading', 'Loading budgets…')}</p>
        </div>
      </div>
    );
  }

  /* 
   * ————————————————————————————————————————————
   * RENDER: MAIN INTERFACE
   * ————————————————————————————————————————————
   */
  return (
    <div className="budget-page" style={{ padding: 'var(--spacing-lg)', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      {/* 
       * ————————————————————————————————————————————
       * HEADER SECTION
       * ————————————————————————————————————————————
       */}
      <header
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 'var(--spacing-lg)', gap: '1rem', flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 300px' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            {getTranslation('budgets', 'Budgets')}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {getTranslation('monthly_budgets', 'Control your spending and track category limits.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {dashboardStats.inactive > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowInactiveBudgets((prevState) => !prevState)}
              aria-pressed={showInactiveBudgets}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {showInactiveBudgets ? <EyeOff size={18} /> : <Eye size={18} />}
              {showInactiveBudgets ? 'Hide Inactive' : 'Show Inactive'}
              {!showInactiveBudgets && (
                <span style={{ background: 'var(--bg-color)', padding: '1px 6px', borderRadius: 10, fontSize: '0.7rem' }}>
                  {dashboardStats.inactive}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => { resetFormFields(); setIsCreateModalOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={18} /> {getTranslation('create_budget', 'New Budget')}
          </button>
        </div>
      </header>

      {/* 
       * ————————————————————————————————————————————
       * DASHBOARD SUMMARY
       * ————————————————————————————————————————————
       */}
      {enrichedBudgets.length > 0 && (
        <div
          className="glass"
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: 12,
            marginBottom: 'var(--spacing-lg)',
          }}
        >
          {[
            { label: 'Active', value: dashboardStats.active },
            { label: 'Near Limit', value: dashboardStats.nearLimit, color: dashboardStats.nearLimit > 0 ? 'var(--warning-color, #f59e0b)' : undefined },
            { label: 'Over Budget', value: dashboardStats.overBudget, color: dashboardStats.overBudget > 0 ? 'var(--danger-color, #ef4444)' : undefined },
            { label: 'Total', value: dashboardStats.total },
          ].map((statItem) => (
            <div key={statItem.label}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {statItem.label}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.15rem', color: statItem.color }}>
                {statItem.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 
       * ————————————————————————————————————————————
       * BUDGET LIST GRID
       * ————————————————————————————————————————————
       */}
      {displayedBudgets.length === 0 ? (
        <div className="budgets-empty glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Wallet size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }} aria-hidden />
          <h3 style={{ marginBottom: '0.5rem' }}>
            {showInactiveBudgets ? getTranslation('no_budgets', 'No budgets yet') : getTranslation('no_budgets_yet', 'No active budgets')}
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            {getTranslation('set_first_budget', 'Create a budget to start tracking your spending.')}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { resetFormFields(); setIsCreateModalOpen(true); }}
          >
            <Plus size={18} /> {getTranslation('create_budget', 'Create First Budget')}
          </button>
        </div>
      ) : (
        <div
          className="budgets-grid"
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem',
          }}
        >
          {displayedBudgets.map((budgetItem) => {
            const uniqueId = extractBudgetId(budgetItem);
            const isInactive = budgetItem.is_active === false;
            const isToggleInProgress = uniqueId ? activeToggleRequestsRef.current.has(uniqueId) : false;
            const isOverSpent = budgetItem.remaining < 0;
            const progressPercent = budgetItem.progress;
            
            // Clamp progress for visual bar (0-100%)
            const clampedProgress = Math.max(0, Math.min(100, progressPercent));
            const ariaProgressValue = Math.round(clampedProgress);
            
            // Determine progress bar color based on status
            const progressBarColor = isOverSpent
              ? 'var(--danger-color, #ef4444)'
              : progressPercent >= STATUS_WARNING_THRESHOLD
                ? 'var(--warning-color, #f59e0b)'
                : budgetItem.assignedColor;

            return (
              <motion.div
                key={uniqueId || `name:${budgetItem.name}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="budget-card glass"
                style={{
                  borderLeft: `4px solid ${isInactive ? 'var(--text-muted)' : budgetItem.assignedColor}`,
                  opacity: isInactive ? 0.7 : 1,
                  padding: '1rem 1.1rem', borderRadius: 12,
                }}
              >
                {/* Card Header: Title & Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.75rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3
                      style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={budgetItem.name}
                    >
                      {budgetItem.name}
                      {isInactive && (
                        <span style={{ fontSize: '0.72rem', marginLeft: '0.5rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          (inactive)
                        </span>
                      )}
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <Calendar size={13} aria-hidden />
                      <span>
                        {formatDisplayDate(budgetItem.period_start, userLocale)} – {formatDisplayDate(budgetItem.period_end, userLocale)}
                      </span>
                      {budgetItem.category && (
                        <span style={{ fontSize: '0.7rem', background: 'var(--bg-color)', padding: '1px 8px', borderRadius: 10 }}>
                          {budgetItem.category}
                        </span>
                      )}
                    </div>
                    {budgetItem.rolloverAmount > 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                        Base {formatCurrency(budgetItem.baseLimit)} + Rollover {formatCurrency(budgetItem.rolloverAmount)} = {formatCurrency(budgetItem.limit)}
                      </div>
                    )}
                    {!budgetItem.isPeriodValid && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--danger-color, #ef4444)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <AlertCircle size={13} aria-hidden /> Invalid period dates.
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '0.15rem', alignItems: 'center' }}>
                    <ActionIconButton
                      onClick={() => toggleBudgetStatus(budgetItem)}
                      accessibilityLabel={isInactive ? `Activate ${budgetItem.name}` : `Deactivate ${budgetItem.name}`}
                      isDisabled={Boolean(isToggleInProgress)}
                    >
                      {isToggleInProgress ? (
                        <Loader2 size={16} className="spin" />
                      ) : isInactive ? (
                        <ToggleLeft size={18} color="var(--text-muted)" />
                      ) : (
                        <ToggleRight size={18} color="var(--success-color, #10b981)" />
                      )}
                    </ActionIconButton>
                    <ActionIconButton onClick={() => initiateEdit(budgetItem)} accessibilityLabel={`Edit ${budgetItem.name}`}>
                      <Edit3 size={15} />
                    </ActionIconButton>
                    <ActionIconButton onClick={() => initiateDuplicate(budgetItem)} accessibilityLabel={`Duplicate ${budgetItem.name}`}>
                      <Copy size={15} />
                    </ActionIconButton>
                    <ActionIconButton onClick={() => setBudgetToDelete(budgetItem)} accessibilityLabel={`Delete ${budgetItem.name}`} variant="danger">
                      <Trash2 size={15} />
                    </ActionIconButton>
                  </div>
                </div>

                {/* Financial Details */}
                <div style={{ marginBottom: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{getTranslation('spent', 'Spent')}</span>
                    <span style={{ fontWeight: 600, color: isOverSpent ? 'var(--danger-color, #ef4444)' : 'var(--text-main)' }}>
                      {formatCurrency(budgetItem.spent)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {isOverSpent ? 'Over' : getTranslation('remaining_budget', 'Remaining')}
                    </span>
                    <span style={{
                      fontWeight: 600,
                      color: isOverSpent ? 'var(--danger-color, #ef4444)' : 'var(--success-color, #10b981)',
                    }}>
                      {isOverSpent ? `-${formatCurrency(Math.abs(budgetItem.remaining))}` : formatCurrency(budgetItem.remaining)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{getTranslation('budget_limit', 'Total Limit')}</span>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(budgetItem.limit)}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    role="progressbar"
                    aria-valuenow={ariaProgressValue}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${budgetItem.name} usage`}
                    style={{
                      flex: 1, height: 8, background: 'var(--bg-color)',
                      borderRadius: 4, overflow: 'hidden',
                    }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${clampedProgress}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      style={{ height: '100%', background: progressBarColor, borderRadius: 4 }}
                    />
                  </div>
                  {progressPercent >= STATUS_WARNING_THRESHOLD && (
                    <span
                      title={isOverSpent ? 'Over budget' : 'Near limit'}
                      aria-label={isOverSpent ? 'Over budget' : 'Near limit'}
                    >
                      <AlertCircle
                        size={16}
                        color={isOverSpent ? 'var(--danger-color, #ef4444)' : 'var(--warning-color, #f59e0b)'}
                      />
                    </span>
                  )}
                </div>

                <div
                  style={{
                    textAlign: 'right', marginTop: '0.4rem', fontSize: '0.75rem',
                    color: isOverSpent ? 'var(--danger-color, #ef4444)' : 'var(--text-muted)',
                  }}
                >
                  {progressPercent.toFixed(0)}% used
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 
       * ————————————————————————————————————————————
       * MODAL: CREATE / EDIT BUDGET
       * ————————————————————————————————————————————
       */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <Modal
            isOpen={isCreateModalOpen}
            title={budgetToEdit ? 'Edit Budget' : 'Create Budget'}
            onClose={() => {
              if (isSubmittingForm) return;
              setIsCreateModalOpen(false);
              resetFormFields();
            }}
          >
            <form onSubmit={handleFormSubmission} className="budget-form" noValidate>
              <div className="form-field">
                <label htmlFor="budget-name">Budget Name *</label>
                <input
                  id="budget-name"
                  type="text"
                  value={formName}
                  onChange={(e) => { setFormName(e.target.value); clearFormError(); }}
                  required
                  maxLength={MAX_TITLE_LENGTH}
                  placeholder="e.g. Monthly Essentials"
                  autoComplete="off"
                  autoFocus
                  aria-describedby={formErrorMessage ? 'budget-form-error' : undefined}
                  aria-invalid={Boolean(formErrorMessage)}
                />
              </div>

              <div className="budget-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-field">
                  <label htmlFor="budget-type">Budget Type</label>
                  <select
                    id="budget-type"
                    value={formType}
                    onChange={(e) => { setFormType(e.target.value); clearFormError(); }}
                  >
                    {PERIOD_TYPES.map((typeOption) => (
                      <option key={typeOption} value={typeOption}>
                        {typeOption.charAt(0).toUpperCase() + typeOption.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="budget-category">Category (optional)</label>
                  <input
                    id="budget-category"
                    type="text"
                    list="budget-category-options"
                    value={formCategory}
                    onChange={(e) => { setFormCategory(e.target.value); clearFormError(); }}
                    placeholder="e.g. Groceries"
                    maxLength={60}
                  />
                  <datalist id="budget-category-options">
                    {availableCategories.map((cat) => <option key={cat} value={cat} />)}
                  </datalist>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="budget-limit">Total Limit *</label>
                <input
                  id="budget-limit"
                  type="number"
                  min="0.01"
                  max={MAX_FINANCIAL_LIMIT}
                  step="0.01"
                  value={formLimit}
                  onChange={(e) => { setFormLimit(e.target.value); clearFormError(); }}
                  required
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </div>

              <div className="budget-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-field">
                  <label htmlFor="budget-start">Start Date *</label>
                  <input
                    id="budget-start"
                    type="date"
                    value={formStartDate}
                    max={formEndDate || undefined}
                    onChange={(e) => { setFormStartDate(e.target.value); clearFormError(); }}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="budget-end">End Date *</label>
                  <input
                    id="budget-end"
                    type="date"
                    value={formEndDate}
                    min={formStartDate || undefined}
                    onChange={(e) => { setFormEndDate(e.target.value); clearFormError(); }}
                    required
                  />
                </div>
              </div>

              <div className="budget-rollover-field" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
                <input
                  type="checkbox"
                  id="rollover"
                  checked={isRolloverEnabled}
                  onChange={(e) => setIsRolloverEnabled(e.target.checked)}
                />
                <label htmlFor="rollover" style={{ margin: 0 }}>
                  Enable rollover (carry remaining budget forward)
                </label>
              </div>

              <div className="budget-rollover-field" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="active-toggle"
                  checked={isBudgetActive}
                  onChange={(e) => setIsBudgetActive(e.target.checked)}
                />
                <label htmlFor="active-toggle" style={{ margin: 0 }}>
                  Active (visible and tracked)
                </label>
              </div>

              {formErrorMessage && (
                <p
                  id="budget-form-error"
                  className="form-error"
                  role="alert"
                  style={{
                    display: 'flex', gap: '0.4rem', alignItems: 'center',
                    color: 'var(--danger-color, #ef4444)', marginTop: '0.75rem',
                  }}
                >
                  <AlertCircle size={14} aria-hidden /> {formErrorMessage}
                </p>
              )}

              <div className="budget-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setIsCreateModalOpen(false); resetFormFields(); }}
                  disabled={isSubmittingForm}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmittingForm}>
                  {isSubmittingForm ? 'Saving…' : budgetToEdit ? 'Update Budget' : 'Create Budget'}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* 
       * ————————————————————————————————————————————
       * MODAL: CONFIRM DELETE
       * ————————————————————————————————————————————
       */}
      <AnimatePresence>
        {budgetToDelete && (
          <Modal
            isOpen={Boolean(budgetToDelete)}
            title="Delete Budget"
            onClose={() => { if (!isDeletingBudget) setBudgetToDelete(null); }}
          >
            <div style={{ padding: '1rem 0' }}>
              <p>
                Are you sure you want to delete the budget{' '}
                <strong>{budgetToDelete.name}</strong>?
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                This action cannot be undone. Your transactions will <strong>not</strong> be
                deleted. Consider deactivating instead.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isDeletingBudget}
                  onClick={() => setBudgetToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'var(--danger-color, #ef4444)' }}
                  disabled={isDeletingBudget}
                  onClick={confirmDeletion}
                >
                  {isDeletingBudget ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}