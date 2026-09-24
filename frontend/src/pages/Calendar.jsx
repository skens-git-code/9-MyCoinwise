/* ==========================================================================
 * Calendar Module
 * Provides month, week, and list financial views, cashflow pacing analytics,
 * recurring schedule tracking, and transaction management modals.
 * ========================================================================== */

import React, {
  useState,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Clock,
  CalendarDays,
  AlertTriangle,
  Edit3,
  Trash2,
  Filter,
  Download,
  X,
  TrendingUp,
  TrendingDown,
  Repeat,
  List as ListIcon,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import TransactionForm from '../components/TransactionForm';
import { useToast } from '../components/ToastProvider';
import { getAppDate } from '../utils/dateUtils';

/* --------------------------------------------------------------------------
 * Localization Configuration & Resolution
 * -------------------------------------------------------------------------- */

const LOCALE_MAP = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
  bgc: 'hi-IN',
  kn: 'kn-IN',
};

const resolveLocale = (languageCode) =>
  LOCALE_MAP[languageCode] ||
  (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

/* --------------------------------------------------------------------------
 * Date & String Utilities
 * -------------------------------------------------------------------------- */

const padLeadingZero = (value) => String(value).padStart(2, '0');

const normalizeDateKey = (dateInput) => {
  if (!dateInput) return null;
  if (typeof dateInput === 'string') {
    const matchedParts = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchedParts) {
      return `${matchedParts[1]}-${matchedParts[2]}-${matchedParts[3]}`;
    }
  }
  const dateInstance = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(dateInstance.getTime())) return null;
  return `${dateInstance.getFullYear()}-${padLeadingZero(dateInstance.getMonth() + 1)}-${padLeadingZero(dateInstance.getDate())}`;
};

const parseKeyToLocalDate = (dateKey) => {
  if (!dateKey) return null;
  const matchedParts = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matchedParts) return null;
  const parsedDate = new Date(
    Number(matchedParts[1]),
    Number(matchedParts[2]) - 1,
    Number(matchedParts[3])
  );
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const formatMonthYear = (year, monthIndex, locale) =>
  new Date(year, monthIndex, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

const formatMonthLong = (year, monthIndex, locale) =>
  new Date(year, monthIndex, 1).toLocaleDateString(locale, { month: 'long' });

const formatFullDate = (dateKey, locale) => {
  const parsedDate = parseKeyToLocalDate(dateKey);
  if (!parsedDate) return '';
  return parsedDate.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatShortDay = (dateInstance, locale) =>
  dateInstance.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

const formatDayWithYear = (dateInstance, locale) =>
  dateInstance.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const getLocalizedWeekDays = (locale) => {
  const referenceSunday = new Date(2021, 0, 3);
  return Array.from({ length: 7 }, (_, dayOffset) => {
    const calendarDate = new Date(referenceSunday);
    calendarDate.setDate(referenceSunday.getDate() + dayOffset);
    return calendarDate.toLocaleDateString(locale, { weekday: 'short' });
  });
};

const escapeCsvField = (rawValue) => {
  const text = rawValue == null ? '' : String(rawValue);
  const containsFormulaTrigger = /^[=+\-@\t\r]/.test(text);
  const escapedQuotes = text.replace(/"/g, '""');
  const sanitizedValue = containsFormulaTrigger ? `'${escapedQuotes}` : escapedQuotes;
  const requiresQuotes = containsFormulaTrigger || /[",\n\r\t]/.test(sanitizedValue);
  return requiresQuotes ? `"${sanitizedValue}"` : `"${sanitizedValue}"`;
};

const parseSafeNumber = (numericValue) => {
  const parsed = Number(numericValue);
  return Number.isFinite(parsed) ? parsed : 0;
};

const canonicalizeCategoryName = (categoryValue) => {
  const trimmed = String(categoryValue || '').trim();
  if (!trimmed) return 'Other';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const isLiveTransaction = (transaction) =>
  Boolean(transaction && typeof transaction === 'object' && transaction.is_deleted !== true);

/* --------------------------------------------------------------------------
 * Accessibility: Focus Trap Hook
 * -------------------------------------------------------------------------- */

function useFocusTrap(containerRef, isActive) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return undefined;

    const containerElement = containerRef.current;
    const previouslyActiveElement = document.activeElement;

    const getFocusableElements = () => {
      const focusableSelector =
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(containerElement.querySelectorAll(focusableSelector)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement
      );
    };

    const focusableNodes = getFocusableElements();
    if (focusableNodes.length > 0) focusableNodes[0].focus();

    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return;

      const currentFocusables = getFocusableElements();
      if (currentFocusables.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = currentFocusables[0];
      const lastElement = currentFocusables[currentFocusables.length - 1];
      const currentElement = document.activeElement;

      if (event.shiftKey) {
        if (currentElement === firstElement || !containerElement.contains(currentElement)) {
          event.preventDefault();
          lastElement.focus();
        }
      } else if (currentElement === lastElement || !containerElement.contains(currentElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyActiveElement && previouslyActiveElement.focus) {
        try {
          previouslyActiveElement.focus();
        } catch {
          /* Element unmounted or unfocusable */
        }
      }
    };
  }, [containerRef, isActive]);
}

/* --------------------------------------------------------------------------
 * Trend Visualization Component
 * -------------------------------------------------------------------------- */

function CalHeroTrend({
  daysInMonth,
  year,
  month,
  txByDate,
  _maxDailyVolume,
  onSelectDay,
  fmt,
  locale,
}) {
  const monthName = useMemo(
    () => new Date(year, month, 1).toLocaleDateString(locale, { month: 'short' }),
    [year, month, locale]
  );

  const activeDays = useMemo(() => {
    const recordedDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${padLeadingZero(month + 1)}-${padLeadingZero(day)}`;
      const daySummary = txByDate[dateKey];
      if (daySummary && (daySummary.income > 0 || daySummary.expense > 0)) {
        recordedDays.push({
          day,
          key: dateKey,
          net: daySummary.net,
          income: daySummary.income,
          expense: daySummary.expense,
          isPos: daySummary.net > 0,
          isNeg: daySummary.net < 0,
        });
      }
    }
    return recordedDays;
  }, [daysInMonth, year, month, txByDate]);

  if (activeDays.length < 3) {
    return null;
  }

  const svgWidth = 360;
  const svgHeight = 56;
  const paddingX = 8;
  const paddingY = 8;

  const pointSeries = [];
  let minimumNet = 0;
  let maximumNet = 0;
  let runningCumulativeNet = 0;
  const horizontalStep = (svgWidth - paddingX * 2) / Math.max(daysInMonth - 1, 1);

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${padLeadingZero(month + 1)}-${padLeadingZero(day)}`;
    const daySummary = txByDate[dateKey];
    if (daySummary) {
      runningCumulativeNet += daySummary.net;
    }
    if (runningCumulativeNet < minimumNet) minimumNet = runningCumulativeNet;
    if (runningCumulativeNet > maximumNet) maximumNet = runningCumulativeNet;
    pointSeries.push({ day, runningCumulativeNet });
  }

  const verticalRange = maximumNet - minimumNet || 1;
  const coordinates = pointSeries.map((point, index) => {
    const coordX = Math.round(paddingX + index * horizontalStep);
    const coordY = Math.round(
      svgHeight -
        paddingY -
        ((point.runningCumulativeNet - minimumNet) / verticalRange) * (svgHeight - paddingY * 2)
    );
    return { x: coordX, y: coordY, day: point.day, net: point.runningCumulativeNet };
  });

  let linePathD = `M ${coordinates[0].x} ${coordinates[0].y}`;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const currentPoint = coordinates[i];
    const nextPoint = coordinates[i + 1];
    const midX = (currentPoint.x + nextPoint.x) / 2;
    linePathD += ` C ${midX} ${currentPoint.y}, ${midX} ${nextPoint.y}, ${nextPoint.x} ${nextPoint.y}`;
  }

  const areaPathD = `${linePathD} L ${coordinates[coordinates.length - 1].x} ${svgHeight} L ${coordinates[0].x} ${svgHeight} Z`;
  const isCumulativePositive = coordinates[coordinates.length - 1].net >= 0;

  return (
    <div className="cal-sparkline-wrap">
      <div className="cal-sparkline-area" aria-label="Monthly net cashflow trajectory">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          className="cal-sparkline-svg"
        >
          <defs>
            <linearGradient id="cal-hero-spark-grad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={isCumulativePositive ? '#10b981' : '#ef4444'}
                stopOpacity="0.32"
              />
              <stop
                offset="100%"
                stopColor={isCumulativePositive ? '#10b981' : '#ef4444'}
                stopOpacity="0.0"
              />
            </linearGradient>
          </defs>
          <path className="cal-spark-area" d={areaPathD} fill="url(#cal-hero-spark-grad)" />
          <path
            className="cal-spark-path"
            d={linePathD}
            fill="none"
            stroke={isCumulativePositive ? '#10b981' : '#ef4444'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {activeDays.map((activeDay) => {
            const pointCoord = coordinates[activeDay.day - 1];
            if (!pointCoord) return null;
            return (
              <circle
                key={activeDay.key}
                cx={pointCoord.x}
                cy={pointCoord.y}
                r="3.5"
                fill={activeDay.isPos ? '#10b981' : '#ef4444'}
                stroke="var(--surface-1, #0f172a)"
                strokeWidth="2"
                className="cal-spark-dot"
                onClick={() => onSelectDay(activeDay.key)}
              >
                <title>{`${monthName} ${activeDay.day}: ${activeDay.net >= 0 ? '+' : ''}${fmt(activeDay.net)}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Main Calendar Interface Component
 * -------------------------------------------------------------------------- */

export default function Calendar() {
  const {
    transactions = [],
    subscriptions = [],
    addTransaction,
    updateTransaction,
    deleteTransaction,
    fmt: contextFmt,
    t: translate,
    lang = 'en',
    loading,
  } = useContext(AppContext);
  const { showToast } = useToast();

  const locale = useMemo(() => resolveLocale(lang), [lang]);
  const formatText = useCallback(
    (key, fallback) => translate?.(key) || fallback,
    [translate]
  );

  const formatCurrency = useCallback(
    (amountValue) => {
      if (contextFmt) {
        try {
          const formatted = contextFmt(amountValue);
          if (formatted != null) return formatted;
        } catch {
          /* Fall back to Intl formatting on error */
        }
      }
      const numeric = Number(amountValue);
      const safeAmount = Number.isFinite(numeric) ? numeric : 0;
      return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(
        safeAmount
      );
    },
    [contextFmt, locale]
  );

  const [currentDate, setCurrentDate] = useState(() => getAppDate());
  const [viewMode, setViewMode] = useState('monthly');
  const [selectedDate, setSelectedDate] = useState(null);
  const [focusedDay, setFocusedDay] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentDate.getFullYear());
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [newTransactionDate, setNewTransactionDate] = useState('');
  const [dayFilterType, setDayFilterType] = useState('all');
  const [pendingDeleteTransaction, setPendingDeleteTransaction] = useState(null);

  const dayModalRef = useRef(null);
  const deleteModalRef = useRef(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  useEffect(() => {
    setPickerYear(currentYear);
  }, [currentYear]);

  const isViewingDifferentMonthFromToday = useMemo(() => {
    const today = getAppDate();
    return today.getFullYear() !== currentYear || today.getMonth() !== currentMonth;
  }, [currentYear, currentMonth]);

  const activeLiveTransactions = useMemo(() => {
    const transactionList = Array.isArray(transactions) ? transactions : [];
    const todayDateKey = normalizeDateKey(getAppDate());
    return transactionList
      .filter(isLiveTransaction)
      .filter((tx) => {
        const transactionDateKey = normalizeDateKey(tx.date);
        return transactionDateKey && (!todayDateKey || transactionDateKey <= todayDateKey);
      })
      .map((tx) => ({ ...tx, category: canonicalizeCategoryName(tx.category) }));
  }, [transactions]);

  const currentMonthTransactions = useMemo(() => {
    return activeLiveTransactions.filter((tx) => {
      const dateKey = normalizeDateKey(tx.date);
      if (!dateKey) return false;
      const [parsedYear, parsedMonth, parsedDay] = dateKey.split('-').map(Number);
      return (
        parsedYear === currentYear &&
        parsedMonth === currentMonth + 1 &&
        parsedDay >= 1 &&
        parsedDay <= daysInMonth
      );
    });
  }, [activeLiveTransactions, currentYear, currentMonth, daysInMonth]);

  const totalMonthlyIncome = useMemo(
    () =>
      currentMonthTransactions
        .filter((tx) => String(tx.type || '').toLowerCase() === 'income')
        .reduce((sum, item) => sum + Math.abs(parseSafeNumber(item.amount)), 0),
    [currentMonthTransactions]
  );

  const totalMonthlyExpense = useMemo(
    () =>
      currentMonthTransactions
        .filter((tx) => String(tx.type || '').toLowerCase() === 'expense')
        .reduce((sum, item) => sum + Math.abs(parseSafeNumber(item.amount)), 0),
    [currentMonthTransactions]
  );

  const totalMonthlyNet = totalMonthlyIncome - totalMonthlyExpense;

  const transactionsGroupedByDate = useMemo(() => {
    const dateMap = Object.create(null);
    for (const tx of activeLiveTransactions) {
      const dateKey = normalizeDateKey(tx.date);
      if (!dateKey) continue;
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { items: [], income: 0, expense: 0, net: 0 };
      }
      dateMap[dateKey].items.push(tx);
      const amount = Math.abs(parseSafeNumber(tx.amount));
      const normalizedType = String(tx.type || '').toLowerCase();
      if (normalizedType === 'income') dateMap[dateKey].income += amount;
      else if (normalizedType === 'expense') dateMap[dateKey].expense += amount;
      dateMap[dateKey].net = dateMap[dateKey].income - dateMap[dateKey].expense;
    }
    return dateMap;
  }, [activeLiveTransactions]);

  const scheduledRecurringBills = useMemo(() => {
    if (!Array.isArray(subscriptions)) return {};
    const scheduleMap = {};
    for (const sub of subscriptions) {
      if (sub.is_paused || sub.cancelled_at) continue;
      const startDate = sub.start_date ? new Date(sub.start_date) : null;
      if (!startDate) continue;
      const billingDay = startDate.getDate();
      if (billingDay >= 1 && billingDay <= daysInMonth) {
        const dateKey = `${currentYear}-${padLeadingZero(currentMonth + 1)}-${padLeadingZero(billingDay)}`;
        if (!scheduleMap[dateKey]) scheduleMap[dateKey] = [];
        scheduleMap[dateKey].push(sub);
      }
    }
    return scheduleMap;
  }, [subscriptions, currentYear, currentMonth, daysInMonth]);

  const peakDailyVolume = useMemo(() => {
    let maximumVolume = 1;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentYear}-${padLeadingZero(currentMonth + 1)}-${padLeadingZero(day)}`;
      const daySummary = transactionsGroupedByDate[dateKey];
      if (daySummary) {
        const totalDailyFlow = daySummary.income + daySummary.expense;
        if (totalDailyFlow > maximumVolume) maximumVolume = totalDailyFlow;
      }
    }
    return maximumVolume;
  }, [daysInMonth, currentYear, currentMonth, transactionsGroupedByDate]);

  const totalIncomeRecords = useMemo(
    () =>
      currentMonthTransactions.filter(
        (tx) => String(tx.type || '').toLowerCase() === 'income'
      ).length,
    [currentMonthTransactions]
  );

  const totalExpenseRecords = useMemo(
    () =>
      currentMonthTransactions.filter(
        (tx) => String(tx.type || '').toLowerCase() === 'expense'
      ).length,
    [currentMonthTransactions]
  );

  const averageIncomeAmount = useMemo(
    () =>
      totalIncomeRecords > 0
        ? Math.round(totalMonthlyIncome / totalIncomeRecords)
        : 0,
    [totalMonthlyIncome, totalIncomeRecords]
  );

  const averageExpenseAmount = useMemo(
    () =>
      totalExpenseRecords > 0
        ? Math.round(totalMonthlyExpense / totalExpenseRecords)
        : 0,
    [totalMonthlyExpense, totalExpenseRecords]
  );

  const recurringBillsCount = useMemo(() => {
    const recurringTransactionCount = currentMonthTransactions.filter(
      (tx) => tx.is_recurring || tx.recurring || tx.isRecurring
    ).length;
    const scheduledSubscriptionCount = Object.keys(scheduledRecurringBills).length;
    return recurringTransactionCount + scheduledSubscriptionCount;
  }, [currentMonthTransactions, scheduledRecurringBills]);

  const hasRecurringBillsInMonth = recurringBillsCount > 0;

  const previousPeriodYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const previousPeriodMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;

  const previousMonthTransactions = useMemo(() => {
    return activeLiveTransactions.filter((tx) => {
      const dateKey = normalizeDateKey(tx.date);
      if (!dateKey) return false;
      const [parsedYear, parsedMonth] = dateKey.split('-').map(Number);
      return (
        parsedYear === previousPeriodYear &&
        parsedMonth === previousPeriodMonthIndex + 1
      );
    });
  }, [activeLiveTransactions, previousPeriodYear, previousPeriodMonthIndex]);

  const previousMonthNetTotal = useMemo(() => {
    return previousMonthTransactions.reduce((accumulatedNet, tx) => {
      const amount = Math.abs(parseSafeNumber(tx.amount));
      const normalizedType = String(tx.type || '').toLowerCase();
      return normalizedType === 'income'
        ? accumulatedNet + amount
        : accumulatedNet - amount;
    }, 0);
  }, [previousMonthTransactions]);

  const monthOverMonthDelta = useMemo(() => {
    if (previousMonthTransactions.length === 0 || previousMonthNetTotal === 0) {
      if (totalMonthlyNet === 0) return null;
      return {
        isNew: true,
        diff: totalMonthlyNet,
        pct: 100,
        isPositive: totalMonthlyNet > 0,
        formatted: formatText('first_month_data', 'First month with data'),
      };
    }
    const absoluteDifference = totalMonthlyNet - previousMonthNetTotal;
    const percentageChange = Math.round(
      (absoluteDifference / Math.abs(previousMonthNetTotal)) * 100
    );
    return {
      isNew: false,
      diff: absoluteDifference,
      pct: Math.abs(percentageChange),
      isPositive: absoluteDifference >= 0,
      formatted: `${absoluteDifference >= 0 ? '+' : ''}${percentageChange}%`,
    };
  }, [
    totalMonthlyNet,
    previousMonthNetTotal,
    previousMonthTransactions.length,
    formatText,
  ]);

  const cashflowProjectionNarrative = useMemo(() => {
    if (currentMonthTransactions.length === 0) return null;
    const today = getAppDate();
    const isCurrentActiveMonth =
      today.getFullYear() === currentYear && today.getMonth() === currentMonth;
    if (!isCurrentActiveMonth) return null;

    const daysElapsed = Math.max(today.getDate(), 1);
    const projectedNet = Math.round((totalMonthlyNet / daysElapsed) * daysInMonth);
    return `${formatText('on_track_for', 'On track for')} ${formatCurrency(projectedNet)} ${formatText('projected_by_end', 'projected by month-end')}`;
  }, [
    currentMonthTransactions.length,
    currentYear,
    currentMonth,
    daysInMonth,
    totalMonthlyNet,
    formatCurrency,
    formatText,
  ]);

  const weeklySummaries = useMemo(() => {
    const monthShortName = new Date(currentYear, currentMonth, 1).toLocaleDateString(
      locale,
      { month: 'short' }
    );
    const weeklyBuckets = [];
    let bucketStartDay = 1;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayOfWeek = (firstDayOfMonth + day - 1) % 7;
      if (dayOfWeek === 6 || day === daysInMonth) {
        weeklyBuckets.push({
          weekNum: weeklyBuckets.length + 1,
          startDay: bucketStartDay,
          endDay: day,
          dateRange: `${monthShortName} ${bucketStartDay}–${day}`,
          income: 0,
          expense: 0,
          net: 0,
          count: 0,
        });
        bucketStartDay = day + 1;
      }
    }

    for (const tx of currentMonthTransactions) {
      const dateKey = normalizeDateKey(tx.date);
      if (!dateKey) continue;
      const dayNumber = Number(dateKey.split('-')[2]);
      const matchedBucket = weeklyBuckets.find(
        (bucket) => dayNumber >= bucket.startDay && dayNumber <= bucket.endDay
      );
      if (matchedBucket) {
        const amount = Math.abs(parseSafeNumber(tx.amount));
        const normalizedType = String(tx.type || '').toLowerCase();
        if (normalizedType === 'income') {
          matchedBucket.income += amount;
        } else if (normalizedType === 'expense') {
          matchedBucket.expense += amount;
        }
        matchedBucket.net = matchedBucket.income - matchedBucket.expense;
        matchedBucket.count += 1;
      }
    }

    return weeklyBuckets;
  }, [
    daysInMonth,
    currentYear,
    currentMonth,
    firstDayOfMonth,
    currentMonthTransactions,
    locale,
  ]);

  const selectedDayMetrics = useMemo(() => {
    if (!selectedDate) return null;
    return (
      transactionsGroupedByDate[selectedDate] || {
        items: [],
        income: 0,
        expense: 0,
        net: 0,
      }
    );
  }, [selectedDate, transactionsGroupedByDate]);

  const selectedDayCategoryBreakdown = useMemo(() => {
    if (!selectedDayMetrics) return [];
    const categoryTotalsMap = new Map();
    for (const tx of selectedDayMetrics.items) {
      const categoryName = tx.category || 'Other';
      if (!categoryTotalsMap.has(categoryName)) {
        categoryTotalsMap.set(categoryName, {
          category: categoryName,
          income: 0,
          expense: 0,
        });
      }
      const categoryBucket = categoryTotalsMap.get(categoryName);
      const amount = Math.abs(parseSafeNumber(tx.amount));
      const normalizedType = String(tx.type || '').toLowerCase();
      if (normalizedType === 'income') categoryBucket.income += amount;
      else if (normalizedType === 'expense') categoryBucket.expense += amount;
    }
    return Array.from(categoryTotalsMap.values()).sort(
      (a, b) => b.income + b.expense - (a.income + a.expense)
    );
  }, [selectedDayMetrics]);

  const filteredSelectedDayTransactions = useMemo(() => {
    if (!selectedDayMetrics) return [];
    if (dayFilterType === 'all') return selectedDayMetrics.items;
    return selectedDayMetrics.items.filter((tx) => tx.type === dayFilterType);
  }, [selectedDayMetrics, dayFilterType]);

  /* --------------------------------------------------------------------------
   * Calendar Navigation Operations
   * -------------------------------------------------------------------------- */

  const navigateToPreviousPeriod = useCallback(() => {
    if (viewMode === 'weekly') {
      setCurrentDate((previousDate) => {
        const adjustedDate = new Date(previousDate);
        adjustedDate.setDate(adjustedDate.getDate() - 7);
        return adjustedDate;
      });
    } else {
      setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
    }
  }, [viewMode, currentYear, currentMonth]);

  const navigateToNextPeriod = useCallback(() => {
    if (viewMode === 'weekly') {
      setCurrentDate((previousDate) => {
        const adjustedDate = new Date(previousDate);
        adjustedDate.setDate(adjustedDate.getDate() + 7);
        return adjustedDate;
      });
    } else {
      setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
    }
  }, [viewMode, currentYear, currentMonth]);

  const navigateToCurrentDay = useCallback(() => {
    const today = getAppDate();
    setCurrentDate(today);
    setFocusedDay(today.getDate());
    setIsMonthPickerOpen(false);
  }, []);

  const selectMonthAndClosePicker = useCallback(
    (targetMonthIndex) => {
      setCurrentDate(new Date(pickerYear, targetMonthIndex, 1));
      setIsMonthPickerOpen(false);
    },
    [pickerYear]
  );

  /* --------------------------------------------------------------------------
   * View Modal and Panel State Controllers
   * -------------------------------------------------------------------------- */

  const openDayDetailsPanel = useCallback((dateKey) => {
    setSelectedDate(dateKey);
    setDayFilterType('all');
    setIsMonthPickerOpen(false);
    const parsedDate = parseKeyToLocalDate(dateKey);
    if (parsedDate) setFocusedDay(parsedDate.getDate());
  }, []);

  const closeDayDetailsPanel = useCallback(() => {
    setSelectedDate(null);
    setDayFilterType('all');
  }, []);

  const openAddTransactionFormForDate = useCallback((dateKey, clickEvent) => {
    if (clickEvent && typeof clickEvent.stopPropagation === 'function') {
      clickEvent.stopPropagation();
    }
    setNewTransactionDate(dateKey);
    setIsAdding(true);
    setSelectedDate(null);
  }, []);

  const openEditTransactionForm = useCallback((transaction, clickEvent) => {
    if (clickEvent && typeof clickEvent.stopPropagation === 'function') {
      clickEvent.stopPropagation();
    }
    setEditingTransaction(transaction);
    setIsEditing(true);
  }, []);

  const closeAddTransactionModal = useCallback(() => {
    setIsAdding(false);
    setNewTransactionDate('');
  }, []);

  const closeEditTransactionModal = useCallback(() => {
    setIsEditing(false);
    setEditingTransaction(null);
  }, []);

  const initialAddTransactionFormData = useMemo(
    () => ({ date: newTransactionDate }),
    [newTransactionDate]
  );

  /* --------------------------------------------------------------------------
   * Transaction Persistence Actions
   * -------------------------------------------------------------------------- */

  const handleCreateTransaction = useCallback(
    async (transactionPayload) => {
      try {
        await addTransaction(transactionPayload);
        showToast(
          'success',
          formatText('tx_added', 'Transaction added successfully.')
        );
        closeAddTransactionModal();
      } catch (error) {
        showToast(
          'error',
          error?.message ||
            formatText('tx_add_failed', 'Failed to add transaction.')
        );
      }
    },
    [addTransaction, showToast, closeAddTransactionModal, formatText]
  );

  const handleUpdateTransaction = useCallback(
    async (transactionPayload) => {
      if (!editingTransaction) return;
      const transactionId = editingTransaction.id || editingTransaction._id;
      if (!transactionId) {
        showToast('error', formatText('tx_invalid', 'Invalid transaction.'));
        closeEditTransactionModal();
        return;
      }
      try {
        await updateTransaction(transactionId, transactionPayload);
        showToast('success', formatText('tx_updated', 'Transaction updated.'));
        closeEditTransactionModal();
      } catch (error) {
        showToast(
          'error',
          error?.message ||
            formatText('tx_update_failed', 'Failed to update transaction.')
        );
      }
    },
    [updateTransaction, editingTransaction, showToast, closeEditTransactionModal, formatText]
  );

  const promptDeleteConfirmation = useCallback((transaction) => {
    setPendingDeleteTransaction(transaction);
  }, []);

  const cancelDeleteOperation = useCallback(() => {
    setPendingDeleteTransaction(null);
  }, []);

  const confirmDeleteOperation = useCallback(async () => {
    if (!pendingDeleteTransaction) return;
    const transactionId =
      pendingDeleteTransaction.id || pendingDeleteTransaction._id;
    if (!transactionId) {
      showToast('error', formatText('tx_invalid', 'Invalid transaction.'));
      setPendingDeleteTransaction(null);
      return;
    }
    try {
      await deleteTransaction(transactionId);
      showToast('success', formatText('tx_deleted', 'Transaction deleted.'));
      setPendingDeleteTransaction(null);
    } catch (error) {
      showToast(
        'error',
        error?.message ||
          formatText('tx_delete_failed', 'Failed to delete transaction.')
      );
    }
  }, [pendingDeleteTransaction, deleteTransaction, showToast, formatText]);

  /* --------------------------------------------------------------------------
   * Data Export Actions
   * -------------------------------------------------------------------------- */

  const exportCurrentMonthToCsv = useCallback(() => {
    const csvHeaders = ['Date', 'Type', 'Category', 'Amount', 'Note'];
    const csvDataRows = currentMonthTransactions.map((tx) => [
      normalizeDateKey(tx.date),
      tx.type,
      tx.category || 'Other',
      parseSafeNumber(tx.amount).toFixed(2),
      tx.note || '',
    ]);
    const serializedCsvContent = [
      csvHeaders.map(escapeCsvField).join(','),
      ...csvDataRows.map((row) => row.map(escapeCsvField).join(',')),
    ].join('\n');

    const csvBlob = new Blob([`\uFEFF${serializedCsvContent}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const downloadUrl = URL.createObjectURL(csvBlob);
    const temporaryLink = document.createElement('a');
    temporaryLink.href = downloadUrl;
    temporaryLink.download = `transactions_${currentYear}-${padLeadingZero(currentMonth + 1)}.csv`;
    document.body.appendChild(temporaryLink);
    temporaryLink.click();
    document.body.removeChild(temporaryLink);
    URL.revokeObjectURL(downloadUrl);
    showToast('success', formatText('csv_exported', 'CSV exported successfully.'));
  }, [currentMonthTransactions, currentYear, currentMonth, showToast, formatText]);

  /* --------------------------------------------------------------------------
   * Global Keyboard Shortcuts
   * -------------------------------------------------------------------------- */

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (isMonthPickerOpen) setIsMonthPickerOpen(false);
        else if (pendingDeleteTransaction) cancelDeleteOperation();
        else if (selectedDate) closeDayDetailsPanel();
        return;
      }

      if (pendingDeleteTransaction || isAdding || isEditing) return;

      const activeElementTag = document.activeElement?.tagName?.toLowerCase();
      if (
        activeElementTag === 'input' ||
        activeElementTag === 'textarea' ||
        activeElementTag === 'select' ||
        document.activeElement?.isContentEditable
      ) {
        return;
      }

      if ((event.key === 'ArrowLeft' && event.shiftKey) || event.key === 'PageUp') {
        event.preventDefault();
        navigateToPreviousPeriod();
      } else if ((event.key === 'ArrowRight' && event.shiftKey) || event.key === 'PageDown') {
        event.preventDefault();
        navigateToNextPeriod();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setFocusedDay((previousDay) =>
          previousDay == null ? 1 : Math.max(1, previousDay - 1)
        );
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setFocusedDay((previousDay) =>
          previousDay == null ? 1 : Math.min(daysInMonth, previousDay + 1)
        );
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedDay((previousDay) =>
          previousDay == null ? 1 : Math.max(1, previousDay - 7)
        );
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedDay((previousDay) =>
          previousDay == null ? 1 : Math.min(daysInMonth, previousDay + 7)
        );
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (focusedDay != null) {
          const focusedDateKey = `${currentYear}-${padLeadingZero(currentMonth + 1)}-${padLeadingZero(focusedDay)}`;
          openDayDetailsPanel(focusedDateKey);
        }
      } else if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        navigateToCurrentDay();
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        openAddTransactionFormForDate(normalizeDateKey(getAppDate()));
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    daysInMonth,
    currentYear,
    currentMonth,
    focusedDay,
    isMonthPickerOpen,
    pendingDeleteTransaction,
    isAdding,
    isEditing,
    selectedDate,
    openDayDetailsPanel,
    navigateToCurrentDay,
    openAddTransactionFormForDate,
    closeDayDetailsPanel,
    cancelDeleteOperation,
    navigateToPreviousPeriod,
    navigateToNextPeriod,
  ]);

  useFocusTrap(dayModalRef, Boolean(selectedDate));
  useFocusTrap(deleteModalRef, Boolean(pendingDeleteTransaction));

  /* --------------------------------------------------------------------------
   * Grid Renderers: Monthly View
   * -------------------------------------------------------------------------- */

  const renderMonthlyCalendarGrid = () => {
    const localizedWeekDays = getLocalizedWeekDays(locale);
    const todayDateKey = normalizeDateKey(getAppDate());
    const calendarCells = [];

    for (let emptyIndex = 0; emptyIndex < firstDayOfMonth; emptyIndex++) {
      calendarCells.push(
        <div key={`empty-${emptyIndex}`} className="cal-day empty" />
      );
    }

    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
      const dayDateKey = `${currentYear}-${padLeadingZero(currentMonth + 1)}-${padLeadingZero(dayNumber)}`;
      const dayData = transactionsGroupedByDate[dayDateKey];
      const isCurrentDay = dayDateKey === todayDateKey;
      const isDaySelected = dayDateKey === selectedDate;
      const isDayFocused = focusedDay === dayNumber;
      const hasTransactionActivity = Boolean(
        dayData && (dayData.income > 0 || dayData.expense > 0)
      );
      const dayOfWeekIndex = (firstDayOfMonth + dayNumber - 1) % 7;
      const isWeekendDay = dayOfWeekIndex === 0 || dayOfWeekIndex === 6;

      let netCashflowClass = 'empty-day';
      let netCashflowIntensity = 0;
      let hasRecurringTransaction = false;

      if (hasTransactionActivity) {
        if (dayData.net > 0) {
          netCashflowClass = 'net-pos';
        } else if (dayData.net < 0) {
          netCashflowClass = 'net-neg';
        } else {
          netCashflowClass = 'net-neutral';
        }

        netCashflowIntensity = Math.min(
          Math.max(Math.abs(dayData.net) / (peakDailyVolume || 1), 0.35),
          1
        );
        hasRecurringTransaction = dayData.items.some(
          (tx) => tx.is_recurring || tx.recurring || tx.isRecurring
        );
      }

      const scheduledSubscriptionsList =
        scheduledRecurringBills[dayDateKey] || [];
      if (!hasRecurringTransaction && scheduledSubscriptionsList.length > 0) {
        hasRecurringTransaction = true;
      }

      let isDayFilteredOut = false;
      if (filterType === 'income' && (!dayData || dayData.income === 0)) {
        isDayFilteredOut = true;
      } else if (filterType === 'expense' && (!dayData || dayData.expense === 0)) {
        isDayFilteredOut = true;
      } else if (filterType === 'recurring' && !hasRecurringTransaction) {
        isDayFilteredOut = true;
      }

      const outflowBarPercentage =
        hasTransactionActivity && dayData.expense > 0
          ? Math.max(
              8,
              Math.min(50, (dayData.expense / (peakDailyVolume || 1)) * 50)
            )
          : 0;

      const inflowBarPercentage =
        hasTransactionActivity && dayData.income > 0
          ? Math.max(
              8,
              Math.min(50, (dayData.income / (peakDailyVolume || 1)) * 50)
            )
          : 0;

      calendarCells.push(
        <div
          key={`day-${dayNumber}`}
          className={`cal-day ${isCurrentDay ? 'today' : ''} ${isDaySelected ? 'selected-day' : ''} ${isDayFocused ? 'cal-focused' : ''} ${netCashflowClass} ${isWeekendDay ? 'weekend' : ''} ${isDayFilteredOut ? 'filtered-out' : ''}`}
          style={{ '--net-int': netCashflowIntensity.toFixed(2) }}
          onClick={() => openDayDetailsPanel(dayDateKey)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openDayDetailsPanel(dayDateKey);
            }
          }}
          title={
            hasTransactionActivity
              ? `${dayNumber} ${formatMonthLong(currentYear, currentMonth, locale)}: ${dayData.net >= 0 ? '+' : ''}${formatCurrency(dayData.net)} (In: +${formatCurrency(dayData.income)}, Out: -${formatCurrency(dayData.expense)})`
              : `${dayNumber} ${formatMonthLong(currentYear, currentMonth, locale)}`
          }
          aria-label={`${dayNumber} ${formatMonthLong(currentYear, currentMonth, locale)}${hasTransactionActivity ? `, net ${formatCurrency(dayData.net)}` : ', no transactions'}`}
        >
          <div className="cal-day-top-row">
            <div className="cal-day-num-wrap">
              <span className="cal-date-num">{dayNumber}</span>
              {hasRecurringTransaction && (
                <span
                  className="cal-recurring-badge"
                  title={formatText('legend_recurring', 'Recurring bill')}
                >
                  <Repeat size={10} aria-hidden />
                </span>
              )}
            </div>
            <button
              type="button"
              className="cal-day-quick-add"
              onClick={(clickEvent) =>
                openAddTransactionFormForDate(dayDateKey, clickEvent)
              }
              title={formatText('add_transaction', 'Add transaction for this day')}
              aria-label={formatText('add_transaction', 'Add transaction')}
            >
              <Plus size={12} />
            </button>
          </div>

          {scheduledSubscriptionsList.length > 0 && !hasTransactionActivity && (
            <div
              className="cal-scheduled-badge"
              title={`Upcoming: ${scheduledSubscriptionsList[0].name} (${formatCurrency(scheduledSubscriptionsList[0].amount)})`}
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                openDayDetailsPanel(dayDateKey);
              }}
            >
              <Repeat size={9} />
              <span>{scheduledSubscriptionsList[0].name}</span>
            </div>
          )}

          {hasTransactionActivity && (
            <div className="cal-day-bottom-data cal-day-bottom">
              <div className="cal-dual-bar-wrap" aria-hidden="true">
                <div className="cal-dual-bar">
                  <div
                    className="cal-bar-left"
                    style={{ width: `${outflowBarPercentage}%` }}
                    title={`Outflow: -${formatCurrency(dayData.expense)}`}
                  />
                  <div className="cal-bar-divider" />
                  <div
                    className="cal-bar-right"
                    style={{ width: `${inflowBarPercentage}%` }}
                    title={`Inflow: +${formatCurrency(dayData.income)}`}
                  />
                </div>
              </div>
              <div
                className={`cal-cell-net-val ${dayData.net > 0 ? 'pos' : dayData.net < 0 ? 'neg' : 'zero'}`}
              >
                {dayData.net > 0 ? '+' : ''}
                {formatCurrency(dayData.net)}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <>
        {localizedWeekDays.map((weekdayName, weekdayIndex) => (
          <div
            key={weekdayName}
            className={`cal-weekday ${weekdayIndex === 0 || weekdayIndex === 6 ? 'weekend' : ''}`}
          >
            {weekdayName}
          </div>
        ))}
        {calendarCells}
      </>
    );
  };

  /* --------------------------------------------------------------------------
   * Grid Renderers: Mobile / Compact List View
   * -------------------------------------------------------------------------- */

  const renderMobileTransactionListView = () => {
    const activeDateKeys = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentYear}-${padLeadingZero(currentMonth + 1)}-${padLeadingZero(day)}`;
      const dayData = transactionsGroupedByDate[dateKey];
      const hasScheduledBills = scheduledRecurringBills[dateKey]?.length > 0;
      if ((dayData && dayData.items.length > 0) || hasScheduledBills) {
        if (filterType === 'income' && (!dayData || dayData.income === 0)) continue;
        if (filterType === 'expense' && (!dayData || dayData.expense === 0)) continue;
        if (
          filterType === 'recurring' &&
          !hasScheduledBills &&
          (!dayData || !dayData.items.some((item) => item.is_recurring))
        ) {
          continue;
        }
        activeDateKeys.push(dateKey);
      }
    }

    if (activeDateKeys.length === 0) {
      return (
        <div
          className="glass empty-state"
          style={{ padding: '3rem 1.5rem', textAlign: 'center' }}
        >
          <Wallet size={42} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.05rem', margin: '0 0 6px' }}>
            {formatText('no_transactions', 'No Transactions')}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
            {formatText(
              'no_transactions_month',
              'No transactions recorded for this month yet.'
            )}
          </p>
          <button
            type="button"
            className="btn-primary btn-sm"
            style={{ marginTop: 14 }}
            onClick={() =>
              openAddTransactionFormForDate(normalizeDateKey(getAppDate()))
            }
          >
            <Plus size={14} /> {formatText('add_transaction', 'Add Transaction')}
          </button>
        </div>
      );
    }

    return (
      <div className="cal-mobile-list">
        {activeDateKeys.map((dateKey) => {
          const dayData = transactionsGroupedByDate[dateKey] || {
            items: [],
            income: 0,
            expense: 0,
            net: 0,
          };
          const scheduledBillsList = scheduledRecurringBills[dateKey] || [];
          return (
            <div
              key={dateKey}
              className="cml-day-card cal-mobile-day-card glass"
              onClick={() => openDayDetailsPanel(dateKey)}
            >
              <div className="cml-day-header">
                <span className="cml-date-title">
                  <CalendarDays size={14} style={{ opacity: 0.7 }} />
                  {formatFullDate(dateKey, locale)}
                </span>
                <span
                  className={`cml-day-net ${dayData.net >= 0 ? 'text-success' : 'text-danger'}`}
                >
                  {dayData.net >= 0 ? '+' : ''}
                  {formatCurrency(dayData.net)}
                </span>
              </div>
              <div className="cml-tx-list">
                {dayData.items.map((tx, itemIndex) => (
                  <div
                    key={tx.id || tx._id || itemIndex}
                    className="cml-tx-item"
                  >
                    <div className="cml-tx-info">
                      {tx.type === 'income' ? (
                        <ArrowUpRight size={14} className="text-success" />
                      ) : (
                        <ArrowDownRight size={14} className="text-danger" />
                      )}
                      <div>
                        <span className="cat">
                          {tx.category || formatText('uncategorized', 'Uncategorized')}
                        </span>
                        {tx.note && <span className="note"> · {tx.note}</span>}
                      </div>
                    </div>
                    <span
                      className={`cml-tx-amt ${tx.type === 'income' ? 'text-success' : 'text-danger'}`}
                    >
                      {tx.type === 'income' ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
                {scheduledBillsList.map((sub, subscriptionIndex) => (
                  <div
                    key={`sched-${subscriptionIndex}`}
                    className="cml-tx-item"
                    style={{ opacity: 0.85 }}
                  >
                    <div className="cml-tx-info">
                      <Repeat size={13} color="#a78bfa" />
                      <span className="cat" style={{ color: '#a78bfa' }}>
                        {sub.name} ({formatText('scheduled_bill', 'Scheduled')})
                      </span>
                    </div>
                    <span className="cml-tx-amt text-danger">
                      -{formatCurrency(sub.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* --------------------------------------------------------------------------
   * Grid Renderers: Weekly View
   * -------------------------------------------------------------------------- */

  const renderWeeklyCalendarGrid = () => {
    const referenceDate = new Date(currentDate);
    referenceDate.setHours(0, 0, 0, 0);
    const dayOfWeek = referenceDate.getDay();
    const startOfWeek = new Date(referenceDate);
    startOfWeek.setDate(referenceDate.getDate() - dayOfWeek);

    const localizedWeekDays = getLocalizedWeekDays(locale);
    const todayDateKey = normalizeDateKey(getAppDate());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const spansMultipleYears =
      startOfWeek.getFullYear() !== endOfWeek.getFullYear();
    const rangeDisplayLabel = spansMultipleYears
      ? `${formatDayWithYear(startOfWeek, locale)} – ${formatDayWithYear(endOfWeek, locale)}`
      : `${formatShortDay(startOfWeek, locale)} – ${formatShortDay(endOfWeek, locale)}, ${endOfWeek.getFullYear()}`;

    return (
      <>
        <div
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          {rangeDisplayLabel}
        </div>
        <div className="cal-weekly-grid">
          {Array.from({ length: 7 }, (_, dayIndex) => {
            const dayCalendarDate = new Date(startOfWeek);
            dayCalendarDate.setDate(startOfWeek.getDate() + dayIndex);
            const dateKey = normalizeDateKey(dayCalendarDate);
            const dayData = transactionsGroupedByDate[dateKey] || {
              items: [],
              income: 0,
              expense: 0,
              net: 0,
            };
            const isCurrentDay = dateKey === todayDateKey;
            return (
              <div
                key={dateKey}
                className={`cal-week-card glass ${isCurrentDay ? 'today' : ''}`}
              >
                <div className="cwc-header">
                  <span className="cwc-day-name">{localizedWeekDays[dayIndex]}</span>
                  <span className="cwc-day-num">{dayCalendarDate.getDate()}</span>
                  <button
                    type="button"
                    className="cwc-add-btn"
                    onClick={(clickEvent) =>
                      openAddTransactionFormForDate(dateKey, clickEvent)
                    }
                    title={formatText('add_transaction', 'Add for this day')}
                    aria-label={formatText('add_transaction', 'Add transaction')}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="cwc-totals">
                  <div className="cwc-total-row text-success">
                    <span>{formatText('inflow', 'Inflow')}</span>
                    <strong>+{formatCurrency(dayData.income)}</strong>
                  </div>
                  <div className="cwc-total-row text-danger">
                    <span>{formatText('outflow', 'Outflow')}</span>
                    <strong>-{formatCurrency(dayData.expense)}</strong>
                  </div>
                  <div
                    className={`cwc-total-row net ${dayData.net >= 0 ? 'text-success' : 'text-danger'}`}
                  >
                    <span>{formatText('net', 'Net')}</span>
                    <strong>{formatCurrency(dayData.net)}</strong>
                  </div>
                </div>
                <div className="cwc-items-list">
                  {dayData.items.length > 0 ? (
                    dayData.items.map((tx, itemIndex) => (
                      <div
                        key={tx.id || tx._id || itemIndex}
                        className="cwc-item"
                        onClick={() => openDayDetailsPanel(dateKey)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openDayDetailsPanel(dateKey);
                          }
                        }}
                      >
                        <span className="cwc-item-cat">
                          {tx.category || formatText('uncategorized', 'Uncategorized')}
                        </span>
                        <span className={`cwc-item-amt ${tx.type}`}>
                          {tx.type === 'income' ? '+' : '-'}
                          {formatCurrency(tx.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="cwc-empty">
                      {formatText('no_entries', 'No entries')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  /* --------------------------------------------------------------------------
   * Page Loading View
   * -------------------------------------------------------------------------- */

  if (loading && activeLiveTransactions.length === 0) {
    return (
      <div className="calendar-page-content">
        <div className="masonry-header">
          <div className="mh-titles">
            <h2>{formatText('calendar_hub', 'Calendar Hub')}</h2>
          </div>
        </div>
        <div
          className="glass"
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            borderRadius: 14,
          }}
        >
          <Clock size={40} style={{ opacity: 0.5, marginBottom: '1rem' }} />
          <p style={{ color: 'var(--text-muted)' }}>
            {formatText('loading_calendar', 'Loading calendar…')}
          </p>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * Main Layout Render
   * -------------------------------------------------------------------------- */

  return (
    <div className="calendar-page-content">
      <div className="masonry-header">
        <div className="mh-titles">
          <h2>{formatText('calendar_hub', 'Calendar Hub')}</h2>
          <span className="mh-badge">
            {currentMonthTransactions.length}{' '}
            {formatText('transactions_this_month', 'transactions this month')}
          </span>
        </div>
        <div className="cal-header-controls">
          <div className="cal-header-row">
            <div className="cal-header-left">
              <button
                type="button"
                className="btn-secondary cal-today-btn"
                onClick={navigateToCurrentDay}
                title={formatText('jump_today', 'Jump to today')}
                aria-label={formatText('today', 'Today')}
              >
                <Clock size={15} /> {formatText('today', 'Today')}
              </button>

              <div className="cal-nav-group">
                <button
                  type="button"
                  className="cal-nav-btn cal-nav-arrow"
                  onClick={navigateToPreviousPeriod}
                  aria-label={
                    viewMode === 'weekly'
                      ? formatText('previous_week', 'Previous week')
                      : formatText('previous_month', 'Previous month')
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="cal-month-title-wrap">
                  <button
                    type="button"
                    className="cal-month-title-grouped"
                    onClick={() => setIsMonthPickerOpen((isOpen) => !isOpen)}
                    title={formatText('select_month_year', 'Select Month & Year')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {viewMode === 'weekly'
                      ? formatText('weekly_view', 'Weekly View')
                      : formatMonthYear(currentYear, currentMonth, locale)}
                  </button>
                  {isMonthPickerOpen && (
                    <div className="cal-month-picker-popover glass">
                      <div className="cmp-year-row">
                        <button
                          type="button"
                          onClick={() => setPickerYear((yearVal) => yearVal - 1)}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span>{pickerYear}</span>
                        <button
                          type="button"
                          onClick={() => setPickerYear((yearVal) => yearVal + 1)}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                      <div className="cmp-months-grid">
                        {Array.from({ length: 12 }, (_, monthIndex) => (
                          <button
                            key={monthIndex}
                            type="button"
                            className={`cmp-month-btn ${pickerYear === currentYear && monthIndex === currentMonth ? 'active' : ''}`}
                            onClick={() => selectMonthAndClosePicker(monthIndex)}
                          >
                            {new Date(pickerYear, monthIndex, 1).toLocaleDateString(
                              locale,
                              { month: 'short' }
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="cal-nav-btn cal-nav-arrow"
                  onClick={navigateToNextPeriod}
                  aria-label={
                    viewMode === 'weekly'
                      ? formatText('next_week', 'Next week')
                      : formatText('next_month', 'Next month')
                  }
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="cal-header-actions-group">
              <div className="view-toggles glass">
                {[
                  { id: 'monthly', label: formatText('month', 'Month'), Icon: CalendarIcon },
                  { id: 'list', label: formatText('list_view', 'List'), Icon: ListIcon },
                  { id: 'weekly', label: formatText('week', 'Week'), Icon: CalendarDays },
                ].map((tabConfig) => (
                  <button
                    key={tabConfig.id}
                    type="button"
                    className={`vt-btn ${viewMode === tabConfig.id ? 'active' : ''}`}
                    onClick={() => setViewMode(tabConfig.id)}
                    aria-pressed={viewMode === tabConfig.id}
                    aria-label={`${tabConfig.label} view`}
                  >
                    <tabConfig.Icon size={14} /> {tabConfig.label}
                  </button>
                ))}
              </div>

              <div className="cal-header-right">
                <button
                  type="button"
                  className="btn-secondary cal-csv-btn"
                  onClick={exportCurrentMonthToCsv}
                  title={formatText('export_csv', 'Export CSV')}
                  aria-label={formatText('export_csv', 'Export month data as CSV')}
                >
                  <Download size={14} /> <span className="cal-csv-text">CSV</span>
                </button>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="btn-primary cal-new-btn"
                  onClick={() =>
                    openAddTransactionFormForDate(normalizeDateKey(getAppDate()))
                  }
                >
                  <Plus size={16} />{' '}
                  <span>{formatText('add_transaction', 'Add Transaction')}</span>
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="calendar-stats-row">
        <div className="glass stat-card cal-hero-card">
          <div className="cal-hero-top">
            <div>
              <p className="stat-lbl">{formatText('net_position', 'Net Position')}</p>
              <h3
                className={`stat-val cal-hero-value ${totalMonthlyNet >= 0 ? 'text-success' : 'text-danger'}`}
              >
                {totalMonthlyNet >= 0 ? '+' : ''}
                {formatCurrency(totalMonthlyNet)}
              </h3>
            </div>
            {monthOverMonthDelta && (
              <div
                className={`cal-delta-badge ${monthOverMonthDelta.isPositive ? 'positive' : 'negative'}`}
              >
                {monthOverMonthDelta.isPositive ? (
                  <TrendingUp size={13} aria-hidden />
                ) : (
                  <TrendingDown size={13} aria-hidden />
                )}
                <span>
                  {monthOverMonthDelta.isNew
                    ? monthOverMonthDelta.formatted
                    : `${monthOverMonthDelta.formatted} ${formatText('vs_last_month', 'vs last month')}`}
                </span>
              </div>
            )}
          </div>
          {cashflowProjectionNarrative && (
            <p className="cal-projection-note cal-hero-subtext">
              {cashflowProjectionNarrative}
            </p>
          )}
          <CalHeroTrend
            daysInMonth={daysInMonth}
            year={currentYear}
            month={currentMonth}
            txByDate={transactionsGroupedByDate}
            _maxDailyVolume={peakDailyVolume}
            onSelectDay={openDayDetailsPanel}
            fmt={formatCurrency}
            locale={locale}
          />
        </div>

        <div className="glass stat-card cal-support-card">
          <div className="cal-support-card-header">
            <span className="stat-lbl">{formatText('monthly_inflow', 'Monthly Inflow')}</span>
            <div className="cal-support-icon inflow">
              <ArrowUpRight size={14} aria-hidden />
            </div>
          </div>
          <div className="cal-support-card-body">
            <h3 className="stat-val cal-support-value text-success">
              +{formatCurrency(totalMonthlyIncome)}
            </h3>
            <div className="cal-support-sub-row">
              <span className="cal-support-count-pill">
                {totalIncomeRecords}{' '}
                {totalIncomeRecords === 1
                  ? formatText('deposit', 'deposit')
                  : formatText('deposits', 'deposits')}
              </span>
              {totalIncomeRecords > 1 && (
                <span className="cal-support-avg-pill">
                  avg {formatCurrency(averageIncomeAmount)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="glass stat-card cal-support-card">
          <div className="cal-support-card-header">
            <span className="stat-lbl">
              {formatText('monthly_outflow', 'Monthly Outflow')}
            </span>
            <div className="cal-support-icon outflow">
              <ArrowDownRight size={14} aria-hidden />
            </div>
          </div>
          <div className="cal-support-card-body">
            <h3 className="stat-val cal-support-value text-danger">
              -{formatCurrency(totalMonthlyExpense)}
            </h3>
            <div className="cal-support-sub-row">
              <span className="cal-support-count-pill">
                {totalExpenseRecords}{' '}
                {totalExpenseRecords === 1
                  ? formatText('payment', 'payment')
                  : formatText('payments', 'payments')}
              </span>
              {totalExpenseRecords > 1 && (
                <span className="cal-support-avg-pill">
                  avg {formatCurrency(averageExpenseAmount)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="cal-filter-strip">
        {[
          {
            id: 'all',
            label: formatText('filter_all', 'All'),
            count: currentMonthTransactions.length,
          },
          {
            id: 'income',
            label: formatText('filter_income', 'Income'),
            count: totalIncomeRecords,
          },
          {
            id: 'expense',
            label: formatText('filter_expense', 'Expense'),
            count: totalExpenseRecords,
          },
          {
            id: 'recurring',
            label: formatText('filter_recurring', 'Recurring'),
            count: recurringBillsCount,
          },
        ].map((filterConfig) => (
          <button
            key={filterConfig.id}
            type="button"
            className={`cal-filter-chip ${filterType === filterConfig.id ? 'active' : ''}`}
            onClick={() => setFilterType(filterConfig.id)}
          >
            <span>{filterConfig.label}</span>
            <span className="cal-chip-count">({filterConfig.count})</span>
          </button>
        ))}

        {isViewingDifferentMonthFromToday && (
          <button
            type="button"
            className="cal-back-today-chip"
            onClick={navigateToCurrentDay}
            title={formatText('back_to_today', 'Back to today')}
          >
            <Clock size={12} /> {formatText('back_to_today', 'Back to today')}
          </button>
        )}
      </div>

      <div className="calendar-container glass">
        {currentMonthTransactions.length === 0 && (
          <div className="cal-empty-month-banner">
            <Clock size={15} />
            <span>
              {formatText(
                'no_transactions_month',
                'No transactions recorded for this month yet. Click + to add an entry.'
              )}
            </span>
          </div>
        )}

        {viewMode === 'weekly' ? (
          renderWeeklyCalendarGrid()
        ) : viewMode === 'list' ? (
          renderMobileTransactionListView()
        ) : (
          <>
            <div className="cal-grid-desktop">
              <div className="cal-grid">{renderMonthlyCalendarGrid()}</div>

              {weeklySummaries.length > 0 && (
                <div
                  className="cal-weekly-summary-strip"
                  aria-label="Weekly net summary"
                >
                  <span className="cal-wss-title">
                    {formatText('weekly_summary', 'Weekly Summary · Breakdown')}:
                  </span>
                  <div className="cal-wss-items">
                    {weeklySummaries.map((week) => (
                      <div
                        key={week.weekNum}
                        className={`cal-wss-pill cal-week-pill ${week.count === 0 ? 'empty-week' : ''}`}
                      >
                        <span className="cal-wss-num">W{week.weekNum}</span>
                        <span className="cal-wss-dates">({week.dateRange})</span>
                        {week.count > 0 ? (
                          <span
                            className={`cal-wss-net ${week.net >= 0 ? 'text-success' : 'text-danger'}`}
                          >
                            {week.net >= 0 ? '+' : ''}
                            {formatCurrency(week.net)}
                          </span>
                        ) : (
                          <span className="cal-wss-net text-muted">—</span>
                        )}
                      </div>
                    ))}
                    <div className="cal-wss-pill cal-wss-total-pill cal-month-net-pill">
                      <span className="cal-wss-num">{formatText('total', 'Month Net')}</span>
                      <span
                        className={`cal-wss-net ${totalMonthlyNet >= 0 ? 'text-success' : 'text-danger'}`}
                      >
                        {totalMonthlyNet >= 0 ? '+' : ''}
                        {formatCurrency(totalMonthlyNet)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="cal-list-mobile-fallback">
              {renderMobileTransactionListView()}
            </div>
          </>
        )}

        <div className="cal-legend-bar" aria-label="Calendar color legend">
          <div className="cal-legend-item">
            <span className="cal-legend-dot pos" aria-hidden="true" />
            <span>{formatText('legend_net_pos', 'Net positive')}</span>
          </div>
          <div className="cal-legend-item">
            <span className="cal-legend-dot neg" aria-hidden="true" />
            <span>{formatText('legend_net_neg', 'Net negative')}</span>
          </div>
          <div className="cal-legend-item">
            <span className="cal-legend-dot neutral" aria-hidden="true" />
            <span>{formatText('legend_no_activity', 'No activity')}</span>
          </div>
          <div className="cal-legend-item">
            <span className="cal-legend-today-ring" aria-hidden="true" />
            <span>{formatText('legend_today', 'Today')}</span>
          </div>
          <div className="cal-legend-item">
            <span className="cal-legend-bar-sample" aria-hidden="true" />
            <span>{formatText('legend_dual_flow', 'Dual-flow bar')}</span>
          </div>
          {hasRecurringBillsInMonth && (
            <div className="cal-legend-item">
              <Repeat size={11} className="cal-legend-icon" aria-hidden="true" />
              <span>{formatText('legend_recurring', 'Recurring bill')}</span>
            </div>
          )}
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {selectedDate && selectedDayMetrics && (
            <motion.div
              key="cal-drawer-overlay"
              className="cal-drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeDayDetailsPanel}
            >
              <motion.div
                ref={dayModalRef}
                key="cal-day-drawer"
                className="cal-day-drawer glass"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={formatText('day_drawer', 'Day Details')}
              >
                <div className="cdd-header">
                  <div>
                    <h3>{formatFullDate(selectedDate, locale)}</h3>
                    <div className="cdd-sub">
                      {selectedDayMetrics.items.length}{' '}
                      {formatText('records', 'record(s)')}
                      {scheduledRecurringBills[selectedDate]?.length > 0 &&
                        ` · ${scheduledRecurringBills[selectedDate].length} upcoming bill(s)`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ibtn"
                    onClick={closeDayDetailsPanel}
                    aria-label={formatText('close', 'Close')}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="cdd-summary-strip">
                  <div className="cdd-stat">
                    <span className="lbl">{formatText('inflow', 'Inflow')}</span>
                    <span className="val text-success">
                      +{formatCurrency(selectedDayMetrics.income)}
                    </span>
                  </div>
                  <div className="cdd-stat">
                    <span className="lbl">{formatText('outflow', 'Outflow')}</span>
                    <span className="val text-danger">
                      -{formatCurrency(selectedDayMetrics.expense)}
                    </span>
                  </div>
                  <div className="cdd-stat">
                    <span className="lbl">{formatText('net', 'Net')}</span>
                    <span
                      className={`val ${selectedDayMetrics.net >= 0 ? 'text-success' : 'text-danger'}`}
                    >
                      {selectedDayMetrics.net >= 0 ? '+' : ''}
                      {formatCurrency(selectedDayMetrics.net)}
                    </span>
                  </div>
                </div>

                {selectedDayCategoryBreakdown.length > 0 && (
                  <div
                    style={{
                      padding: '0.75rem 1.5rem 0',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.45rem',
                    }}
                  >
                    {selectedDayCategoryBreakdown.map(
                      ({ category, income, expense }) => (
                        <span
                          key={category}
                          className="badge"
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--glass-border)',
                            padding: '3px 9px',
                            borderRadius: 12,
                            fontSize: '0.74rem',
                          }}
                        >
                          {category}
                          {income > 0 && (
                            <>
                              {' '}
                              ·{' '}
                              <span className="text-success">
                                +{formatCurrency(income)}
                              </span>
                            </>
                          )}
                          {expense > 0 && (
                            <>
                              {' '}
                              ·{' '}
                              <span className="text-danger">
                                -{formatCurrency(expense)}
                              </span>
                            </>
                          )}
                        </span>
                      )
                    )}
                  </div>
                )}

                {scheduledRecurringBills[selectedDate]?.length > 0 && (
                  <div style={{ padding: '0.75rem 1.5rem 0' }}>
                    <div
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        color: '#a78bfa',
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Repeat size={12} />{' '}
                      {formatText('scheduled_bill', 'Upcoming Recurring Bill')}:
                    </div>
                    {scheduledRecurringBills[selectedDate].map(
                      (subscription, index) => (
                        <div
                          key={`sched-item-${index}`}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'rgba(139, 92, 246, 0.10)',
                            border: '1px dashed rgba(139, 92, 246, 0.35)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 6,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '0.82rem',
                              color: '#a78bfa',
                            }}
                          >
                            {subscription.name}
                          </span>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '0.84rem',
                              color: 'var(--danger)',
                            }}
                          >
                            -{formatCurrency(subscription.amount)}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {selectedDayMetrics.items.length > 0 && (
                  <div
                    style={{
                      padding: '0.75rem 1.5rem 0',
                      display: 'flex',
                      gap: '0.4rem',
                      alignItems: 'center',
                    }}
                  >
                    <Filter size={13} style={{ opacity: 0.6 }} />
                    {[
                      { id: 'all', label: formatText('all', 'All') },
                      { id: 'income', label: formatText('income', 'Income') },
                      { id: 'expense', label: formatText('expense', 'Expense') },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className={`btn-sm ${dayFilterType === id ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.72rem', padding: '3px 9px' }}
                        onClick={() => setDayFilterType(id)}
                        aria-pressed={dayFilterType === id}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="cdd-content">
                  {filteredSelectedDayTransactions.length === 0 ? (
                    <div
                      className="glass empty-state"
                      style={{ padding: '40px 20px', textAlign: 'center' }}
                    >
                      <Wallet
                        size={38}
                        style={{
                          color: 'var(--text-muted)',
                          margin: '0 auto 10px',
                          opacity: 0.4,
                        }}
                      />
                      <h3
                        style={{
                          color: 'var(--text-secondary)',
                          marginBottom: 4,
                          fontSize: '0.96rem',
                        }}
                      >
                        {formatText('no_transactions', 'No Transactions')}
                      </h3>
                      <p
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.82rem',
                        }}
                      >
                        {formatText(
                          'no_transactions_filter',
                          'No transactions match the current filter.'
                        )}
                      </p>
                    </div>
                  ) : (
                    filteredSelectedDayTransactions.map((tx, index) => (
                      <div
                        key={tx.id || tx._id || `dtx-${index}`}
                        className="day-tx-row"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.65rem 0',
                          borderBottom: '1px solid var(--glass-border)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <div className={`day-tx-badge ${tx.type}`}>
                            {tx.type === 'income' ? (
                              <ArrowUpRight size={15} />
                            ) : (
                              <ArrowDownRight size={15} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontWeight: 600,
                                margin: 0,
                                fontSize: '0.88rem',
                              }}
                            >
                              {tx.merchant ||
                                tx.category ||
                                formatText('uncategorized', 'Uncategorized')}
                            </p>
                            <p
                              style={{
                                fontSize: '0.76rem',
                                color: 'var(--text-muted)',
                                margin: 0,
                              }}
                            >
                              {tx.merchant && tx.category
                                ? `${tx.category}${tx.note ? ` · ${tx.note}` : ''}`
                                : tx.note || formatText('no_note', 'No note')}
                            </p>
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.65rem',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '0.90rem',
                              fontVariantNumeric: 'tabular-nums',
                              color:
                                tx.type === 'income'
                                  ? 'var(--success)'
                                  : 'var(--danger)',
                            }}
                          >
                            {tx.type === 'income' ? '+' : '-'}
                            {formatCurrency(tx.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={(clickEvent) =>
                              openEditTransactionForm(tx, clickEvent)
                            }
                            className="ibtn"
                            aria-label={formatText(
                              'edit_transaction',
                              'Edit transaction'
                            )}
                            style={{ padding: 3 }}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => promptDeleteConfirmation(tx)}
                            className="ibtn"
                            aria-label={formatText(
                              'delete_transaction',
                              'Delete transaction'
                            )}
                            style={{ padding: 3, color: 'var(--danger)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="cdd-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeDayDetailsPanel}
                  >
                    {formatText('close', 'Close')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => openAddTransactionFormForDate(selectedDate)}
                  >
                    <Plus size={15} />{' '}
                    {formatText('add_for_date', 'Add For This Date')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {isAdding && (
            <TransactionForm
              key="add-modal"
              isOpen
              initialData={initialAddTransactionFormData}
              onClose={closeAddTransactionModal}
              onSubmit={handleCreateTransaction}
            />
          )}

          {isEditing && editingTransaction && (
            <TransactionForm
              key={`edit-modal-${editingTransaction.id || editingTransaction._id || 'tx'}`}
              isOpen
              initialData={editingTransaction}
              onClose={closeEditTransactionModal}
              onSubmit={handleUpdateTransaction}
            />
          )}

          {pendingDeleteTransaction && (
            <motion.div
              key="delete-modal"
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={cancelDeleteOperation}
            >
              <motion.div
                ref={deleteModalRef}
                className="modal-box glass"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={formatText(
                  'delete_transaction_title',
                  'Delete transaction'
                )}
                style={{ maxWidth: 460 }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '0.6rem',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}
                >
                  <AlertTriangle
                    size={20}
                    color="var(--danger-color, #ef4444)"
                  />
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                    {formatText(
                      'delete_transaction_title',
                      'Delete transaction'
                    )}
                  </h3>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                  }}
                >
                  {formatText(
                    'delete_transaction_confirm',
                    'Are you sure you want to delete this'
                  )}{' '}
                  <strong>{pendingDeleteTransaction.type}</strong>{' '}
                  {formatText('of', 'of')}{' '}
                  <strong>
                    {formatCurrency(pendingDeleteTransaction.amount)}
                  </strong>
                  ?
                </p>
                <p
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.82rem',
                    marginTop: '0.4rem',
                  }}
                >
                  {formatText(
                    'cannot_be_undone',
                    'This action cannot be undone.'
                  )}
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.75rem',
                    marginTop: '1.5rem',
                  }}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={cancelDeleteOperation}
                  >
                    {formatText('cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ background: 'var(--danger-color, #ef4444)' }}
                    onClick={confirmDeleteOperation}
                  >
                    {formatText('delete', 'Delete')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
