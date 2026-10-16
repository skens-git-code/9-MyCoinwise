import React, {
  useState, useMemo, useCallback, useEffect,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit3, Trash2, AlertCircle, Calendar, Wallet, Copy,
  ToggleLeft, ToggleRight, Eye, EyeOff, Loader2, Sparkles,
  ChevronDown, CheckCircle2, TrendingUp, AlertTriangle, Layers,
} from 'lucide-react';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { api, CURRENCIES } from '../services/api';
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

const POPULAR_BUDGET_CATEGORIES = [
  { name: 'Food & Dining', emoji: '🍔' },
  { name: 'Groceries', emoji: '🛒' },
  { name: 'Shopping', emoji: '🛍️' },
  { name: 'Transport', emoji: '🚗' },
  { name: 'Entertainment', emoji: '🎬' },
  { name: 'Bills & Utilities', emoji: '💡' },
  { name: 'Health & Medical', emoji: '❤️' },
  { name: 'Travel', emoji: '✈️' },
  { name: 'Personal Care', emoji: '💅' },
  { name: 'Education', emoji: '📚' },
  { name: 'Investments', emoji: '📈' },
  { name: 'General', emoji: '🏷️' },
];

const QUICK_AMOUNT_PRESETS = [1000, 2500, 5000, 10000, 25000];

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
  
  if (typeof inputValue === 'string') {
    const match = inputValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

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
 * Computes default start and end dates based on budget type.
 */
const getDefaultDatesForType = (type) => {
  const now = new Date();
  if (type === 'monthly') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: formatToLocalDateString(firstDay),
      end: formatToLocalDateString(lastDay),
    };
  }
  if (type === 'weekly') {
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diffToMonday));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: formatToLocalDateString(monday),
      end: formatToLocalDateString(sunday),
    };
  }
  // custom
  const today = new Date();
  const nextMonth = new Date();
  nextMonth.setDate(today.getDate() + 30);
  return {
    start: formatToLocalDateString(today),
    end: formatToLocalDateString(nextMonth),
  };
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
  return dateObj.toLocaleDateString(locale || undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/* 
 * ————————————————————————————————————————————
 * HELPER FUNCTIONS
 * Utility logic for IDs, colors, and data normalization.
 * ————————————————————————————————————————————
 */

const generateIdHash = (id) => {
  const idString = String(id ?? '');
  let hashValue = 0;
  for (let i = 0; i < idString.length; i += 1) {
    hashValue = (hashValue * 31 + idString.charCodeAt(i)) | 0;
  }
  return Math.abs(hashValue);
};

const selectBudgetColor = (id, fallbackIndex = 0) => {
  if (id != null) {
    const colorIndex = generateIdHash(id) % PALETTE.length;
    return PALETTE[colorIndex];
  }
  return PALETTE[fallbackIndex % PALETTE.length];
};

const extractBudgetId = (budget) => budget?._id || budget?.id || null;

/* 
 * ————————————————————————————————————————————
 * SUB-COMPONENT: ACTION ICON BUTTON
 * Accessible button wrapper with micro-interactions.
 * ————————————————————————————————————————————
 */
const ActionIconButton = React.memo(({
  onClick,
  accessibilityLabel,
  children,
  isDisabled = false,
  variant = 'default',
}) => {
  const isDangerVariant = variant === 'danger';
  return (
    <motion.button
      type="button"
      whileHover={{ scale: isDisabled ? 1 : 1.1 }}
      whileTap={{ scale: isDisabled ? 1 : 0.95 }}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={accessibilityLabel}
      title={accessibilityLabel}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        padding: '0.4rem',
        borderRadius: '8px',
        color: isDangerVariant ? 'var(--danger-color, #ef4444)' : 'var(--text-secondary, #94a3b8)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isDisabled ? 0.4 : 1,
        transition: 'color 0.15s ease, background 0.15s ease',
      }}
      className="budget-action-btn"
    >
      {children}
    </motion.button>
  );
});

/* 
 * ————————————————————————————————————————————
 * MAIN COMPONENT: BUDGETS
 * ————————————————————————————————————————————
 */
export default function Budgets() {
  const {
    budgets = [],
    transactions = [],
    lang: currentLanguage,
    currency = 'USD',
  } = useAppState();
  const {
    refetch: refreshData,
    fmt: formatCurrency,
    t: translate,
  } = useAppActions();
  
  const { showToast } = useToast();
  const currSymbol = CURRENCIES?.[currency]?.symbol || currency || '$';

  const userLocale = useMemo(() => getBrowserLocale(currentLanguage), [currentLanguage]);
  const getTranslation = useCallback((key, fallbackText) => translate?.(key) || fallbackText, [translate]);

  // Modal Visibility States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [budgetToEdit, setBudgetToEdit] = useState(null);
  const [budgetToDelete, setBudgetToDelete] = useState(null);
  const [showInactiveBudgets, setShowInactiveBudgets] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');

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
  const [togglingIds, setTogglingIds] = useState(new Set());

  // Mobile Keypad & Viewport height stability
  useEffect(() => {
    if (!isCreateModalOpen || typeof window === 'undefined') return undefined;

    const updateViewportBounds = () => {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      const offsetTop = vv ? vv.offsetTop : 0;
      document.documentElement.style.setProperty('--tx-modal-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--tx-modal-viewport-offset-top', `${offsetTop}px`);
    };

    updateViewportBounds();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateViewportBounds);
      vv.addEventListener('scroll', updateViewportBounds);
    }
    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateViewportBounds);
        vv.removeEventListener('scroll', updateViewportBounds);
      }
      document.documentElement.style.removeProperty('--tx-modal-viewport-height');
      document.documentElement.style.removeProperty('--tx-modal-viewport-offset-top');
    };
  }, [isCreateModalOpen]);

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
   * Filters and normalizes expense transactions for client-side calculation.
   */
  const normalizedExpenses = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    
    const processedExpenses = [];
    for (const tx of transactions) {
      if (!tx || String(tx.type || '').trim().toLowerCase() !== 'expense') continue;
      if (tx.is_deleted === true) continue;
      
      const timestamp = getStartOfDayTimestamp(tx.date);
      if (timestamp == null) continue;
      
      const amount = Number(tx.displayAmount ?? tx.amount);
      processedExpenses.push({
        timestamp,
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        normalizedCategory: (tx.category || '').trim().toLowerCase(),
      });
    }
    
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
      const subcatSet = Array.isArray(budget.categories) && budget.categories.length > 0
        ? new Set(budget.categories.map((c) => (typeof c === 'string' ? c : c?.name || '').trim().toLowerCase()).filter(Boolean))
        : null;
      let clientCalculatedSpent = 0;

      if (isPeriodValid) {
        for (const tx of normalizedExpenses) {
          if (tx.timestamp < periodStartMs) continue;
          if (tx.timestamp > periodEndMs) break;
          if (targetCategoryKey) {
            if (tx.normalizedCategory !== targetCategoryKey) continue;
          } else if (subcatSet && subcatSet.size > 0) {
            if (!subcatSet.has(tx.normalizedCategory)) continue;
          }
          clientCalculatedSpent += tx.amount;
        }
      }

      const serverSpent = Number(budget.spent);
      const finalSpentAmount = isPeriodValid
        ? clientCalculatedSpent
        : (Number.isFinite(serverSpent) ? serverSpent : 0);

      const baseLimitValue = Number(budget.total_limit) || 0;
      const rolloverValue = budget.rollover_enabled ? (Number(budget.rollover_amount) || 0) : 0;
      const effectiveLimit = baseLimitValue + rolloverValue;
      const remainingBalance = effectiveLimit - finalSpentAmount;
      
      const usagePercentage = effectiveLimit > 0
        ? Math.max(0, (finalSpentAmount / effectiveLimit) * 100)
        : 0;

      return {
        ...budget,
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
   * Calculates overall totals for the summary strip.
   */
  const overallTotals = useMemo(() => {
    const activeList = enrichedBudgets.filter((b) => b.is_active !== false);
    const totalLimit = activeList.reduce((acc, b) => acc + (b.limit || 0), 0);
    const totalSpent = activeList.reduce((acc, b) => acc + (b.spent || 0), 0);
    const totalRemaining = totalLimit - totalSpent;
    const spentPercent = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
    return { totalLimit, totalSpent, totalRemaining, spentPercent };
  }, [enrichedBudgets]);

  /**
   * Summary counts for filters and alerts.
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

  /**
   * Filters budgets based on preset tabs.
   */
  const displayedBudgets = useMemo(() => {
    switch (selectedFilter) {
      case 'active':
        return enrichedBudgets.filter((b) => b.is_active !== false);
      case 'nearLimit':
        return enrichedBudgets.filter((b) => b.is_active !== false && b.progress >= STATUS_WARNING_THRESHOLD && b.progress < STATUS_CRITICAL_THRESHOLD);
      case 'overBudget':
        return enrichedBudgets.filter((b) => b.is_active !== false && b.remaining < 0);
      case 'inactive':
        return enrichedBudgets.filter((b) => b.is_active === false);
      case 'all':
      default:
        return showInactiveBudgets ? enrichedBudgets : enrichedBudgets.filter((b) => b.is_active !== false);
    }
  }, [enrichedBudgets, selectedFilter, showInactiveBudgets]);

  /* 
   * ————————————————————————————————————————————
   * FORM HANDLERS
   * ————————————————————————————————————————————
   */

  const resetFormFields = useCallback(() => {
    const defaultDates = getDefaultDatesForType('monthly');
    setFormName('');
    setFormType('monthly');
    setFormCategory('');
    setFormLimit('');
    setFormStartDate(defaultDates.start);
    setFormEndDate(defaultDates.end);
    setIsRolloverEnabled(false);
    setIsBudgetActive(true);
    setBudgetToEdit(null);
    setFormErrorMessage('');
  }, []);

  const clearFormError = useCallback(() => {
    setFormErrorMessage((prevError) => (prevError ? '' : prevError));
  }, []);

  const handleTypeChange = useCallback((newType) => {
    setFormType(newType);
    clearFormError();
    const newDates = getDefaultDatesForType(newType);
    setFormStartDate(newDates.start);
    setFormEndDate(newDates.end);
  }, [clearFormError]);

  const handleAddPreset = useCallback((presetVal) => {
    const current = parseFloat(formLimit) || 0;
    setFormLimit(String(current + presetVal));
    clearFormError();
  }, [formLimit, clearFormError]);

  const handleAmountChange = useCallback((e) => {
    const clean = e.target.value.replace(/,/g, '.');
    if (clean === '' || /^\d*\.?\d{0,2}$/.test(clean)) {
      setFormLimit(clean);
      clearFormError();
    }
  }, [clearFormError]);

  const loadFormWithData = useCallback((sourceBudget, { isDuplicateMode = false } = {}) => {
    const originalName = String(sourceBudget.name || '');
    const newName = isDuplicateMode
      ? `${originalName.slice(0, MAX_BASE_NAME_LENGTH)}${COPY_SUFFIX}`
      : originalName;

    let startDate = formatToLocalDateString(sourceBudget.period_start);
    let endDate = formatToLocalDateString(sourceBudget.period_end);

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
    setFormStartDate(startDate || getDefaultDatesForType(sourceBudget.type || 'monthly').start);
    setFormEndDate(endDate || getDefaultDatesForType(sourceBudget.type || 'monthly').end);
    setIsRolloverEnabled(Boolean(sourceBudget.rollover_enabled));
    setIsBudgetActive(isDuplicateMode ? true : sourceBudget.is_active !== false);
    setBudgetToEdit(isDuplicateMode ? null : sourceBudget);
    setFormErrorMessage('');
    setIsCreateModalOpen(true);
  }, []);

  const initiateEdit = useCallback((budget) => loadFormWithData(budget, { isDuplicateMode: false }), [loadFormWithData]);
  const initiateDuplicate = useCallback((budget) => loadFormWithData(budget, { isDuplicateMode: true }), [loadFormWithData]);

  const validateFormData = useCallback(() => {
    const trimmedName = formName.trim();
    
    if (!trimmedName) return { isValid: false, errorMessage: 'Budget name is required.' };
    if (trimmedName.length > MAX_TITLE_LENGTH) {
      return { isValid: false, errorMessage: `Name must be ${MAX_TITLE_LENGTH} characters or fewer.` };
    }

    const currentEditingId = extractBudgetId(budgetToEdit);
    const nameExists = budgets.some(
      (existingBudget) =>
        String(existingBudget.name || '').toLowerCase() === trimmedName.toLowerCase() &&
        extractBudgetId(existingBudget) !== currentEditingId
    );
    if (nameExists) return { isValid: false, errorMessage: 'A budget with that name already exists.' };

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
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.errors?.[0]?.msg ||
        error?.message ||
        'Failed to save budget.';
      setFormErrorMessage(msg);
      showToast('error', msg);
    } finally {
      setIsSubmittingForm(false);
    }
  }, [isSubmittingForm, validateFormData, budgetToEdit, refreshData, resetFormFields, showToast]);

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

  const toggleBudgetStatus = useCallback(async (targetBudget) => {
    const targetId = extractBudgetId(targetBudget);
    if (!targetId) return;
    
    if (togglingIds.has(targetId)) return;

    setTogglingIds((prev) => new Set(prev).add(targetId));
    const currentlyActive = targetBudget.is_active !== false;
    
    try {
      await api.updateBudget(targetId, { is_active: !currentlyActive });
      await refreshData();
    } catch (error) {
      showToast('error', error?.response?.data?.error || 'Failed to update status.');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  }, [refreshData, showToast, togglingIds]);

  /* 
   * ————————————————————————————————————————————
   * RENDER INTERFACE
   * ————————————————————————————————————————————
   */
  return (
    <div className="budget-page" style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(1rem, 2.5vw, 2rem)' }}>
      {/* ===================== Header ===================== */}
      <header className="island-header glass-sm" style={{ marginBottom: '1.25rem' }}>
        <div className="ih-left">
          <div className="ih-titles">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wallet className="text-brand" size={24} aria-hidden />
              {getTranslation('budgets', 'Budgets')}
            </h1>
            <p>{getTranslation('monthly_budgets', 'Control your spending and track category limits.')}</p>
          </div>
        </div>

        <div className="inbox-header-actions">
          {dashboardStats.inactive > 0 && (
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-secondary"
              onClick={() => {
                setShowInactiveBudgets((prev) => !prev);
                if (!showInactiveBudgets) setSelectedFilter('all');
              }}
              aria-pressed={showInactiveBudgets}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', padding: '8px 14px' }}
            >
              {showInactiveBudgets ? <EyeOff size={15} /> : <Eye size={15} />}
              <span>{showInactiveBudgets ? 'Hide Inactive' : 'Show Inactive'}</span>
              {!showInactiveBudgets && (
                <span className="ih-badge" style={{ marginLeft: 4 }}>
                  {dashboardStats.inactive}
                </span>
              )}
            </motion.button>
          )}

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-primary"
            onClick={() => { resetFormFields(); setIsCreateModalOpen(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', padding: '9px 16px' }}
          >
            <Plus size={16} /> <span>{getTranslation('create_budget', 'New Budget')}</span>
          </motion.button>
        </div>
      </header>

      {/* ===================== Modern Bento Summary Grid ===================== */}
      {enrichedBudgets.length > 0 && (
        <div className="budget-summary-grid">
          {/* Card 1: Total Limit */}
          <div className="budget-summary-card">
            <div className="bsc-top">
              <span className="bsc-label">{getTranslation('total_limit', 'Total Budget')}</span>
              <div className="bsc-icon"><Wallet size={16} aria-hidden /></div>
            </div>
            <div className="bsc-val">{formatCurrency(overallTotals.totalLimit)}</div>
            <div className="bsc-sub">
              <span>{dashboardStats.active} active {dashboardStats.active === 1 ? 'budget' : 'budgets'}</span>
            </div>
          </div>

          {/* Card 2: Total Spent */}
          <div className="budget-summary-card">
            <div className="bsc-top">
              <span className="bsc-label">{getTranslation('spent', 'Total Spent')}</span>
              <div className="bsc-icon"><TrendingUp size={16} aria-hidden /></div>
            </div>
            <div className="bsc-val expense">{formatCurrency(overallTotals.totalSpent)}</div>
            <div className="bsc-sub">
              <span>
                {overallTotals.totalLimit > 0
                  ? `${((overallTotals.totalSpent / overallTotals.totalLimit) * 100).toFixed(0)}% of allocation`
                  : '0% used'}
              </span>
            </div>
          </div>

          {/* Card 3: Remaining / Over */}
          <div className="budget-summary-card">
            <div className="bsc-top">
              <span className="bsc-label">
                {overallTotals.totalRemaining < 0 ? 'Over Budget' : getTranslation('remaining_budget', 'Remaining')}
              </span>
              <div className="bsc-icon"><Layers size={16} aria-hidden /></div>
            </div>
            <div className={`bsc-val ${overallTotals.totalRemaining < 0 ? 'expense' : 'income'}`}>
              {overallTotals.totalRemaining < 0
                ? `-${formatCurrency(Math.abs(overallTotals.totalRemaining))}`
                : formatCurrency(overallTotals.totalRemaining)}
            </div>
            <div className="bsc-sub">
              <span className={overallTotals.totalRemaining < 0 ? 'text-danger' : 'text-success'}>
                {overallTotals.totalRemaining < 0 ? 'Exceeded overall limit' : 'Safe spending margin'}
              </span>
            </div>
          </div>

          {/* Card 4: Health */}
          <div className="budget-summary-card">
            <div className="bsc-top">
              <span className="bsc-label">Status & Health</span>
              <div className="bsc-icon">
                {dashboardStats.overBudget > 0 ? (
                  <AlertTriangle size={16} color="var(--danger-color, #ef4444)" aria-hidden />
                ) : (
                  <CheckCircle2 size={16} color="var(--success-color, #10b981)" aria-hidden />
                )}
              </div>
            </div>
            <div
              className={`bsc-val ${
                dashboardStats.overBudget > 0 ? 'expense' : dashboardStats.nearLimit > 0 ? 'text-warning' : 'income'
              }`}
              style={{ fontSize: '1.25rem' }}
            >
              {dashboardStats.overBudget > 0
                ? `⚠️ ${dashboardStats.overBudget} Over Limit`
                : dashboardStats.nearLimit > 0
                  ? `⚡ ${dashboardStats.nearLimit} Near Limit`
                  : '✓ All Within Limit'}
            </div>
            <div className="bsc-sub">
              <span>
                {dashboardStats.total} {dashboardStats.total === 1 ? 'category tracked' : 'categories tracked'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ===================== Quick Preset Filters ===================== */}
      {enrichedBudgets.length > 0 && (
        <div className="tx-presets-strip" role="group" aria-label="Budget filters" style={{ marginBottom: '1.25rem' }}>
          {[
            { id: 'all', label: 'All Budgets', count: showInactiveBudgets ? dashboardStats.total : dashboardStats.active },
            { id: 'active', label: 'Active', count: dashboardStats.active },
            { id: 'nearLimit', label: 'Near Limit', count: dashboardStats.nearLimit },
            { id: 'overBudget', label: 'Over Budget', count: dashboardStats.overBudget },
            ...(dashboardStats.inactive > 0 ? [{ id: 'inactive', label: 'Inactive', count: dashboardStats.inactive }] : []),
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              className={`tx-preset-pill ${selectedFilter === pill.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedFilter(pill.id);
                if (pill.id === 'inactive') setShowInactiveBudgets(true);
              }}
            >
              <span>{pill.label}</span>
              <span className="tx-preset-count">{pill.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ===================== Budget List Grid ===================== */}
      {displayedBudgets.length === 0 ? (
        <div className="budgets-empty glass" style={{ padding: '3.5rem 1.5rem', textAlign: 'center', borderRadius: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(14, 165, 233, 0.1)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              color: 'var(--brand-primary)',
            }}
          >
            <Wallet size={32} aria-hidden />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            {selectedFilter !== 'all'
              ? 'No budgets match this filter'
              : showInactiveBudgets
                ? getTranslation('no_budgets', 'No budgets created yet.')
                : getTranslation('no_budgets_yet', 'No active budgets right now.')}
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto 1.5rem', fontSize: '0.9rem' }}>
            {selectedFilter !== 'all'
              ? 'Try selecting "All Budgets" to see your full financial tracking.'
              : getTranslation('set_first_budget', 'Create your first budget to keep spending under control.')}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { resetFormFields(); setIsCreateModalOpen(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={18} /> {getTranslation('create_budget', 'Create Budget')}
          </button>
        </div>
      ) : (
        <div className="budgets-grid">
          {displayedBudgets.map((budgetItem) => {
            const uniqueId = extractBudgetId(budgetItem);
            const isInactive = budgetItem.is_active === false;
            const isToggleInProgress = uniqueId ? togglingIds.has(uniqueId) : false;
            const isOverSpent = budgetItem.remaining < 0;
            const progressPercent = budgetItem.progress;
            const clampedProgress = Math.max(0, Math.min(100, progressPercent));
            const ariaProgressValue = Math.round(clampedProgress);
            
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
                  opacity: isInactive ? 0.72 : 1,
                  padding: '1.15rem 1.25rem',
                  borderRadius: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                }}
              >
                {/* Card Header: Title & Actions */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem', gap: '0.75rem' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--text-primary)',
                        }}
                        title={budgetItem.name}
                      >
                        {budgetItem.name}
                        {isInactive && (
                          <span style={{ fontSize: '0.72rem', marginLeft: '0.5rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                            (inactive)
                          </span>
                        )}
                      </h3>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                        <Calendar size={13} aria-hidden />
                        <span>
                          {formatDisplayDate(budgetItem.period_start, userLocale)} – {formatDisplayDate(budgetItem.period_end, userLocale)}
                        </span>
                        {budgetItem.category && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              background: 'var(--surface-2)',
                              border: '1px solid var(--glass-border)',
                              padding: '2px 8px',
                              borderRadius: 8,
                              fontWeight: 600,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {budgetItem.category}
                          </span>
                        )}
                      </div>
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

                  {budgetItem.rolloverAmount > 0 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--brand-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                      ⚡ Rollover: +{formatCurrency(budgetItem.rolloverAmount)} added
                    </div>
                  )}

                  {!budgetItem.isPeriodValid && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--danger-color, #ef4444)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <AlertCircle size={13} aria-hidden /> Invalid period dates.
                    </div>
                  )}
                </div>

                {/* Financial Details */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{getTranslation('spent', 'Spent')}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isOverSpent ? 'var(--danger-color, #ef4444)' : 'var(--text-primary)' }}>
                      {formatCurrency(budgetItem.spent)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {isOverSpent ? 'Over Limit' : getTranslation('remaining_budget', 'Remaining')}
                    </span>
                    <span style={{
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: isOverSpent ? 'var(--danger-color, #ef4444)' : 'var(--success-color, #10b981)',
                    }}>
                      {isOverSpent ? `-${formatCurrency(Math.abs(budgetItem.remaining))}` : formatCurrency(budgetItem.remaining)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{getTranslation('budget_limit', 'Total Limit')}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                      {formatCurrency(budgetItem.limit)}
                    </span>
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
                        flex: 1,
                        height: 8,
                        background: 'var(--surface-2)',
                        borderRadius: 4,
                        overflow: 'hidden',
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
                          size={15}
                          color={isOverSpent ? 'var(--danger-color, #ef4444)' : 'var(--warning-color, #f59e0b)'}
                        />
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '0.35rem',
                      fontSize: '0.72rem',
                      color: isOverSpent ? 'var(--danger-color, #ef4444)' : 'var(--text-muted)',
                    }}
                  >
                    <span>{progressPercent.toFixed(0)}% used</span>
                    <span>{isOverSpent ? 'Exceeded' : `${(100 - clampedProgress).toFixed(0)}% left`}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 
       * ————————————————————————————————————————————
       * MODAL: CREATE / EDIT BUDGET (BEST-IN-CLASS FORM)
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
            <form
              onSubmit={handleFormSubmission}
              className="budget-form"
              noValidate
              onFocusCapture={() => {
                if (typeof window !== 'undefined' && window.scrollY !== 0) window.scrollTo(0, 0);
              }}
            >
              <div className="modal-form-scrollable">
                {/* ── Error Banner ── */}
                <AnimatePresence>
                  {formErrorMessage && (
                    <motion.p
                      id="budget-form-error"
                      className="form-error"
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{
                        display: 'flex',
                        gap: '0.4rem',
                        alignItems: 'center',
                        color: 'var(--danger-color, #ef4444)',
                        marginBottom: '1rem',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      <AlertCircle size={15} aria-hidden /> {formErrorMessage}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* ── Hero Limit Card ── */}
                <div className="tx-hero-amount expense" style={{ marginBottom: '1.25rem' }}>
                  <div className="tx-amount-label-row">
                    <span className="tx-field-label">Total Budget Limit *</span>
                    <span className="tx-currency-badge">
                      {currSymbol} {currency}
                    </span>
                  </div>
                  <div className="tx-amount-display">
                    <span className="tx-amount-symbol" aria-hidden="true">
                      {currSymbol}
                    </span>
                    <input
                      id="budget-limit"
                      type="text"
                      value={formLimit}
                      onChange={handleAmountChange}
                      placeholder="0.00"
                      required
                      inputMode="decimal"
                      aria-label={`Total Budget Limit in ${currSymbol}`}
                      className="tx-amount-input"
                    />
                  </div>

                  {/* Quick Preset Chips */}
                  <div className="tx-amount-presets" role="group" aria-label="Quick limit presets">
                    {QUICK_AMOUNT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="tx-preset-chip"
                        onClick={() => handleAddPreset(preset)}
                      >
                        +{currSymbol}{preset.toLocaleString()}
                      </button>
                    ))}
                    {formLimit ? (
                      <button
                        type="button"
                        className="tx-preset-chip tx-preset-clear"
                        onClick={() => setFormLimit('')}
                        title="Clear amount"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* ── Budget Name ── */}
                <div className="form-field" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="budget-name" style={{ fontSize: '0.8rem', fontWeight: 650, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Budget Name *
                  </label>
                  <input
                    id="budget-name"
                    type="text"
                    value={formName}
                    onChange={(e) => { setFormName(e.target.value); clearFormError(); }}
                    required
                    maxLength={MAX_TITLE_LENGTH}
                    placeholder="e.g. Monthly Essentials, Dining Out"
                    autoComplete="off"
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--glass-border)',
                      background: 'var(--surface-1)',
                      color: 'var(--text-primary)',
                      fontSize: '0.92rem',
                    }}
                    aria-describedby={formErrorMessage ? 'budget-form-error' : undefined}
                    aria-invalid={Boolean(formErrorMessage)}
                  />
                </div>

                {/* ── Segmented Budget Type Slider ── */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 650, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.45rem' }}>
                    Budget Period
                  </label>
                  <div
                    className="tx-segmented-control"
                    role="tablist"
                    style={{ background: 'var(--surface-1)', padding: 4, borderRadius: 12 }}
                  >
                    {PERIOD_TYPES.map((typeOption) => {
                      const isSelected = formType === typeOption;
                      return (
                        <button
                          key={typeOption}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          className={`tx-segmented-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => handleTypeChange(typeOption)}
                          style={{
                            background: isSelected ? 'var(--brand-primary)' : 'transparent',
                            color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                            borderRadius: 10,
                            padding: '8px 12px',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {typeOption.charAt(0).toUpperCase() + typeOption.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Dates Row (Interactive or custom) ── */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-field">
                      <label htmlFor="budget-start" style={{ fontSize: '0.76rem', fontWeight: 650, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                        Start Date *
                      </label>
                      <input
                        id="budget-start"
                        type="date"
                        value={formStartDate}
                        max={formEndDate || undefined}
                        onChange={(e) => { setFormStartDate(e.target.value); clearFormError(); }}
                        required
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid var(--glass-border)',
                          background: 'var(--surface-1)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="budget-end" style={{ fontSize: '0.76rem', fontWeight: 650, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                        End Date *
                      </label>
                      <input
                        id="budget-end"
                        type="date"
                        value={formEndDate}
                        min={formStartDate || undefined}
                        onChange={(e) => { setFormEndDate(e.target.value); clearFormError(); }}
                        required
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid var(--glass-border)',
                          background: 'var(--surface-1)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Category Quick Emoji Chips + Input ── */}
                <div className="tx-category-section" style={{ marginBottom: '1.25rem' }}>
                  <div className="tx-category-header">
                    <label htmlFor="budget-category">Category (optional)</label>
                    {formCategory && (
                      <span className="tx-current-cat-badge">
                        {formCategory}
                      </span>
                    )}
                  </div>
                  <div className="tx-cat-chips-scroll" role="group" aria-label="Popular categories">
                    {POPULAR_BUDGET_CATEGORIES.map((cat) => {
                      const isSelected = formCategory.toLowerCase() === cat.name.toLowerCase();
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          className={`tx-cat-chip ${isSelected ? 'active' : ''}`}
                          onClick={() => {
                            setFormCategory(isSelected ? '' : cat.name);
                            clearFormError();
                          }}
                        >
                          <span>{cat.emoji}</span>
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    id="budget-category"
                    type="text"
                    list="budget-category-options"
                    value={formCategory}
                    onChange={(e) => { setFormCategory(e.target.value); clearFormError(); }}
                    placeholder="Or type a custom category…"
                    maxLength={60}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--glass-border)',
                      background: 'var(--surface-1)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      marginTop: '0.4rem',
                    }}
                  />
                  <datalist id="budget-category-options">
                    {availableCategories.map((cat) => <option key={cat} value={cat} />)}
                  </datalist>
                </div>

                {/* ── Best-in-Class Switch Cards ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
                  {/* Rollover Toggle Card */}
                  <div
                    className={`form-toggle-card ${isRolloverEnabled ? 'is-active' : ''}`}
                    onClick={() => setIsRolloverEnabled((prev) => !prev)}
                    role="checkbox"
                    aria-checked={isRolloverEnabled}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setIsRolloverEnabled((prev) => !prev);
                      }
                    }}
                  >
                    <div className="form-toggle-info">
                      <div className="form-toggle-title">Enable Rollover</div>
                      <div className="form-toggle-desc">Automatically carry unspent budget balance forward into the next period.</div>
                    </div>
                    <div className="form-toggle-switch">
                      <input
                        type="checkbox"
                        checked={isRolloverEnabled}
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <span className="form-toggle-slider" />
                    </div>
                  </div>

                  {/* Active Toggle Card */}
                  <div
                    className={`form-toggle-card ${isBudgetActive ? 'is-active' : ''}`}
                    onClick={() => setIsBudgetActive((prev) => !prev)}
                    role="checkbox"
                    aria-checked={isBudgetActive}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setIsBudgetActive((prev) => !prev);
                      }
                    }}
                  >
                    <div className="form-toggle-info">
                      <div className="form-toggle-title">Active Budget</div>
                      <div className="form-toggle-desc">Budget is visible and active in calculations and alert notifications.</div>
                    </div>
                    <div className="form-toggle-switch">
                      <input
                        type="checkbox"
                        checked={isBudgetActive}
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <span className="form-toggle-slider" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Form Actions ── */}
              <div
                className="budget-form-actions"
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--glass-border)',
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setIsCreateModalOpen(false); resetFormFields(); }}
                  disabled={isSubmittingForm}
                  style={{ padding: '9px 18px', borderRadius: 10 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmittingForm}
                  style={{
                    padding: '9px 22px',
                    borderRadius: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                  }}
                >
                  {isSubmittingForm && <Loader2 size={16} className="spin" />}
                  <span>{isSubmittingForm ? 'Saving…' : budgetToEdit ? 'Update Budget' : 'Create Budget'}</span>
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
            <div style={{ padding: '0.75rem 0' }}>
              <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Are you sure you want to delete the budget{' '}
                <strong>{budgetToDelete.name}</strong>?
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem', lineHeight: 1.45 }}>
                This action cannot be undone. Your recorded transactions will <strong>not</strong> be
                deleted. You can also deactivate this budget instead of deleting it.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.75rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isDeletingBudget}
                  onClick={() => setBudgetToDelete(null)}
                  style={{ padding: '8px 16px', borderRadius: 10 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: 'var(--danger-color, #ef4444)', padding: '8px 18px', borderRadius: 10 }}
                  disabled={isDeletingBudget}
                  onClick={confirmDeletion}
                >
                  {isDeletingBudget ? 'Deleting…' : 'Delete Budget'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}