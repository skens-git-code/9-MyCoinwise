import React, { useState, useContext, useMemo, useCallback, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
// [OPTIMIZATION: Removed external 'react-responsive' dependency in favor of native window.matchMedia hook]
// import { useMediaQuery } from 'react-responsive';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  LayoutDashboard, ArrowLeftRight, BarChart3, Target, Activity, Briefcase,
  CreditCard, Settings, ChevronRight, TrendingUp, TrendingDown,
  Bell, AlertCircle, RefreshCw, LogOut, Sparkles, Calendar as CalendarIcon,
  Menu, X, Zap, Search, Keyboard, User, Users, Sun, Moon, Check, CheckCircle2,
  HelpCircle, Shield, ExternalLink, Languages, Coins, Info, PieChart, Repeat, Landmark, Calculator as CalculatorIcon
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { CURRENCIES } from '../services/api';
import { LANGUAGES } from '../services/i18n';
import CurrencyConverter from './CurrencyConverter';
import AlertsCenter from './AlertsCenter';
import AIChat from './AIChat';
import Breadcrumbs from './Breadcrumbs';
import CommandPalette from './CommandPalette';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';
import HelpModal from './HelpModal';
import OnboardingTour from './OnboardingTour';
import QuickActionFAB from './QuickActionFAB';
import TransactionForm from './TransactionForm';
import DOMPurify from 'dompurify';
import QuantumRuntime from '../services/quantumRuntime';

// ==============================
// 1. CONSTANTS & CONFIGURATION
// ==============================

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, labelKey: 'dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, labelKey: 'transactions' },
  { to: '/calendar', icon: CalendarIcon, labelKey: 'calendar' },
  { to: '/analytics', icon: BarChart3, labelKey: 'analytics' },
  { to: '/calculator', icon: CalculatorIcon, labelKey: 'calculator' },
  { to: '/accounts', icon: Landmark, labelKey: 'accounts' },
  { to: '/budgets', icon: PieChart, labelKey: 'budgets' },
  { to: '/goals', icon: Target, labelKey: 'goals' },
  { to: '/subscriptions', icon: Repeat, labelKey: 'subscriptions' },
  { to: '/cashflow', icon: Activity, labelKey: 'cashflow' },
  { to: '/wealth', icon: Briefcase, labelKey: 'wealth' },
  { to: '/about', icon: Info, labelKey: 'about' },
];

// Mobile dock shows only core 4 + Settings (Apple HIG: max 5)
const MOBILE_NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, labelKey: 'dashboard', mobileLabel: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, labelKey: 'transactions', mobileLabel: 'Transactions' },
  { to: '/analytics', icon: BarChart3, labelKey: 'analytics', mobileLabel: 'Analytics' },
  { to: '/goals', icon: Target, labelKey: 'goals', mobileLabel: 'Savings' },
];

const USER_DISPLAY_RULES = {
  randomIdPattern: /^[0-9a-f]{24}$/i,
  defaultDisplayName: 'friend',
  excludedIds: new Set(['23e23']),
  maxDisplayNameLength: 50
};

const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280
};

const ANIMATION_DURATIONS = {
  fast: 0.1,
  normal: 0.2,
  slow: 0.35
};

const SYNC_STORAGE_KEY = 'mcw-sync-enabled';

// Fallback labels for the page title. Keys must match `labelKey`
// values in NAV_ITEMS plus any aux routes (e.g. 'settings').
const PAGE_TITLE_FALLBACKS = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  calendar: 'Calendar',
  analytics: 'Analytics',
  calculator: 'Calculator',
  accounts: 'Accounts',
  budgets: 'Budgets',
  goals: 'Savings Goals',
  subscriptions: 'Subscriptions',
  cashflow: 'Forecasting',
  wealth: 'Wealth Management',
  about: 'About',
  settings: 'Settings',
};

// ==============================
// 2. UTILITY FUNCTIONS
// ==============================

const validateColorHex = (color) => {
  return /^#[0-9A-F]{6}$/i.test(color) ? color : '#059669';
};

const sanitizeUserInput = (input) => {
  if (!input) return null;
  if (typeof input === 'string') {
    const trimmed = input.trim().slice(0, USER_DISPLAY_RULES.maxDisplayNameLength);
    return DOMPurify.sanitize(trimmed, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  }
  return null;
};

const LOCALE_MAP = {
  en: 'en-US', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN',
};

const formatBalance = (balance, currencySymbol = '$', langOrLocale = 'en-US') => {
  const numBalance = Number(balance);
  if (!Number.isFinite(numBalance)) return `${currencySymbol}0.00`;
  const locale = LOCALE_MAP[langOrLocale] || langOrLocale ||
    (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  return `${currencySymbol}${numBalance.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

/* Original getDeviceType (Problematic - static window.innerWidth check without live matchMedia subscription caused delayed and jerky breakpoint response):
const getDeviceType = () => {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
};
// Migrated to dynamic, hardware-accelerated media queries via `useMediaQuery` from react-responsive.
*/

const getStoredSyncEnabled = () => {
  if (typeof window === 'undefined') return true;
  try {
    const storedValue = window.localStorage.getItem(SYNC_STORAGE_KEY);
    return storedValue === null ? true : storedValue !== 'false';
  } catch {
    return true;
  }
};

// ==============================
// 3. INLINE STYLES (for ErrorBoundary)
// ==============================
// [FIX #13] Moved styles ABOVE the ErrorBoundary class so the
// dependency is declared before use. Behaviorally identical, but
// no longer relies on hoisting order.
const styles = {
  errorFallback: {
    padding: '40px 20px',
    textAlign: 'center',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb'
  },
  errorIcon: {
    marginBottom: '20px',
    color: '#dc2626'
  },
  errorTitle: {
    fontSize: '24px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#111827'
  },
  errorMessage: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '24px',
    maxWidth: '400px'
  },
  errorActions: {
    display: 'flex',
    gap: '12px'
  },
  errorButton: {
    padding: '10px 20px',
    backgroundColor: '#059669',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    transition: 'transform 0.2s ease'
  },
  // [FIX #18] Removed: errorToast, toastClose, loadingContainer,
  // userTrigger, waveEmoji, avatarButton — none are referenced anywhere.
};

// ==============================
// 4. CUSTOM HOOKS
// ==============================

const useDropdownManager = () => {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const toggleDropdown = useCallback((name) => {
    setActiveDropdown(prev => (prev === name ? null : name));
  }, []);
  const closeAll = useCallback(() => setActiveDropdown(null), []);
  return { activeDropdown, toggleDropdown, closeAll };
};

const useUserDisplay = (user, t) => {
  return useMemo(() => {
    if (!user) {
      return {
        displayName: t?.('guest') || 'Guest',
        avatar: '👤',
        avatarColor: '#6B7280',
        rawName: null,
        isBase64Avatar: false,
        role: t?.('role_trader') || 'Trader'
      };
    }

    const firstName = String(user?.username || user?.name || '').trim();
    const surname = String(user?.last_name || user?.surname || '').trim();
    const hasSurnameAlready = surname && firstName.toLocaleLowerCase().endsWith(surname.toLocaleLowerCase());
    const rawName = [firstName, surname && !hasSurnameAlready ? surname : '']
      .filter(Boolean)
      .join(' ');
    const sanitizedRawName = sanitizeUserInput(rawName);
    const isValidDisplayName = sanitizedRawName &&
      !USER_DISPLAY_RULES.randomIdPattern.test(sanitizedRawName) &&
      !USER_DISPLAY_RULES.excludedIds.has(sanitizedRawName);

    const fullDisplayName = isValidDisplayName ? sanitizedRawName : USER_DISPLAY_RULES.defaultDisplayName;
    const avatarStr = String(user?.profile_avatar || fullDisplayName.charAt(0).toUpperCase()).trim();
    const isImageAvatar = /^(?:data:image\/|blob:|https?:\/\/|\/(?!\/))/i.test(avatarStr);

    const rawRole = sanitizeUserInput(user?.profession || user?.role) || 'Trader';
    const lowerRole = rawRole.toLowerCase().trim();
    let localizedRole = rawRole;
    if (lowerRole === 'student') localizedRole = t?.('role_student') || 'Student';
    else if (lowerRole === 'trader') localizedRole = t?.('role_trader') || 'Trader';
    else if (lowerRole === 'freelancer') localizedRole = t?.('role_freelancer') || 'Freelancer';
    else if (lowerRole === 'professional') localizedRole = t?.('role_professional') || 'Professional';
    else if (lowerRole === 'engineer') localizedRole = t?.('role_engineer') || 'Engineer';
    else if (lowerRole === 'consultant') localizedRole = t?.('role_consultant') || 'Consultant';

    return {
      displayName: fullDisplayName,
      firstName: fullDisplayName.split(' ')[0] || fullDisplayName,
      avatar: avatarStr,
      avatarColor: validateColorHex(user?.profile_color),
      rawName: sanitizedRawName,
      isBase64Avatar: isImageAvatar,
      role: localizedRole
    };
  }, [user, t]);
};

/* Original useResponsiveSidebar (Problematic - relied on debounced 150ms resize event loop that caused layout jitter, stutter, and lagging breakpoint transitions):
const useResponsiveSidebar = (initialState = true) => {
  const [sidebarOpen, setSidebarOpen] = useState(initialState);
  const [deviceType, setDeviceType] = useState(getDeviceType());
  const desktopPreferenceRef = React.useRef(initialState);

  useEffect(() => {
    let timeoutId;
    let isMounted = true;

    const handleResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!isMounted) return;
        const newDeviceType = getDeviceType();
        setDeviceType(newDeviceType);
        if (newDeviceType === 'mobile') {
          setSidebarOpen(false);
        } else {
          setSidebarOpen(desktopPreferenceRef.current);
        }
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const setSidebarOpenWithMemory = useCallback((value) => {
    setSidebarOpen((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      if (getDeviceType() !== 'mobile') {
        desktopPreferenceRef.current = next;
      }
      return next;
    });
  }, []);

  return { sidebarOpen, setSidebarOpen: setSidebarOpenWithMemory, deviceType };
};
*/
const useResponsiveSidebar = (initialState = true) => {
  const isMobile = useMediaQuery(`(max-width: ${BREAKPOINTS.mobile - 1}px)`);
  const isTablet = useMediaQuery(`(min-width: ${BREAKPOINTS.mobile}px) and (max-width: ${BREAKPOINTS.tablet}px)`);
  const deviceType = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';

  const [desktopPreference, setDesktopPreference] = useState(initialState);
  const sidebarOpen = deviceType === 'mobile' ? false : desktopPreference;

  const setSidebarOpenWithMemory = useCallback((value) => {
    setDesktopPreference((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      return next;
    });
  }, []);

  return { sidebarOpen, setSidebarOpen: setSidebarOpenWithMemory, deviceType };
};

const useClickOutside = (activeDropdown, onClose) => {
  useEffect(() => {
    if (!activeDropdown) return undefined;

    const handleClickOutside = (event) => {
      if (!event.target.closest('.dropdown-container')) {
        onClose();
      }
    };

    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [activeDropdown, onClose]);
};

// ==============================
// 5. ERROR BOUNDARY COMPONENT
// ==============================

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Layout Error:', error, errorInfo);
    this.setState({ errorInfo });

    if (window.errorTrackingService) {
      window.errorTrackingService.captureException(error, {
        extra: errorInfo,
        component: 'AppLayout'
      });
    }
  }

  handleReset = () => {
    const { retryCount } = this.state;
    if (retryCount < 3) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: retryCount + 1
      });
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback" style={styles.errorFallback}>
          <AlertCircle size={48} style={styles.errorIcon} />
          <h2 style={styles.errorTitle}>Something went wrong</h2>
          <p style={styles.errorMessage}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div style={styles.errorActions}>
            <button
              type="button"
              onClick={this.handleReset}
              style={styles.errorButton}
            >
              <RefreshCw size={16} style={{ marginRight: '8px' }} />
              {this.state.retryCount < 3 ? 'Try Again' : 'Refresh Page'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// [FIX #9] Removed the dead LanguageDropdown component.
// It was defined but never rendered anywhere in this file or imported
// by any other module. Language switching lives in the profile dropdown.

// ==============================
// 6. MAIN COMPONENT
// ==============================

export default function AppLayout({ children }) {
  const [showConverter, setShowConverter] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState(() => new Set());

  const { activeDropdown, toggleDropdown, closeAll } = useDropdownManager();
  const { sidebarOpen, setSidebarOpen, deviceType } = useResponsiveSidebar(true);

  useEffect(() => {
    const isCompleted = localStorage.getItem('mcw-onboarding-completed');
    if (!isCompleted) {
      const timer = setTimeout(() => setShowOnboardingTour(true), 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const contextData = useContext(AppContext) || {};
  const {
    user, theme, toggleTheme, currencyInfo, alerts = [], transactions = [],
    addTransaction, t, lang, setLanguage, logout, fmt, refetch, isBackgroundSyncing
  } = contextData;

  const location = useLocation();
  const navigate = useNavigate();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen((open) => (open ? false : open));
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

  const userInfo = useUserDisplay(user, t);
  useClickOutside(activeDropdown, closeAll);

  useEffect(() => {
    const styleId = 'app-layout-animations';
    if (!document.getElementById(styleId)) {
      const styleSheet = document.createElement('style');
      styleSheet.id = styleId;
      styleSheet.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styleSheet);
    }

    const runtime = QuantumRuntime?.create?.(document);
    return () => {
      runtime?.destroy?.();
    };
  }, []);

  const activeAlerts = useMemo(() => {
    const safeAlerts = Array.isArray(alerts) ? alerts : [];
    return safeAlerts.filter(a => a && !dismissedAlertIds.has(a.id || a.title));
  }, [alerts, dismissedAlertIds]);

  const urgentAlertsCount = useMemo(
    () => activeAlerts.filter(a => a.type === 'danger' || a.type === 'warning').length,
    [activeAlerts]
  );

  const handleDismissAllAlerts = useCallback(() => {
    const safeAlerts = Array.isArray(alerts) ? alerts : [];
    setDismissedAlertIds(new Set(safeAlerts.map(a => a?.id || a?.title).filter(Boolean)));
  }, [alerts]);

  // [FIX #7] pageTitleKey is now derived from NAV_ITEMS so it can
  // never drift out of sync when routes are added or removed.
  const pageTitleKey = useMemo(() => {
    const map = { '/settings': 'settings' };
    NAV_ITEMS.forEach((item) => { map[item.to] = item.labelKey; });
    return map;
  }, []);

  const pageTitle = useMemo(() => {
    const key = pageTitleKey[location.pathname] || 'dashboard';
    const translated = t?.(key);
    return (translated && translated !== key ? translated : PAGE_TITLE_FALLBACKS[key]) || 'Dashboard';
  }, [location.pathname, t, pageTitleKey]);

  const formattedBalance = useMemo(() => {
    if (fmt && user?.balance !== undefined && user?.balance !== null) {
      return fmt(user.balance);
    }
    return formatBalance(user?.balance, currencyInfo?.symbol, lang);
  }, [user, currencyInfo?.symbol, fmt, lang]);

  /* Original financialSummary calculation without soft-delete check:
  const financialSummary = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => {
        const val = Number(t.amount);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0);
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        const val = Number(t.amount);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0);
    const net = income - expense;
    const rate = income > 0 ? ((net / income) * 100).toFixed(0) : '0';
    return { income, expense, net, rate };
  }, [transactions]);
  // Issue: Excluded check for t.is_deleted === true, causing soft-deleted transactions to leak into top-level layout figures.
  */
  const financialSummary = useMemo(() => {
    const safeTxs = Array.isArray(transactions) ? transactions : [];
    const liveTxs = safeTxs.filter(t => t && t.is_deleted !== true);
    const income = liveTxs
      .filter(t => t.type === 'income')
      .reduce((sum, t) => {
        const val = Number(t.amount);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0);
    const expense = liveTxs
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        const val = Number(t.amount);
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0);
    const net = income - expense;
    const rate = income > 0 ? ((net / income) * 100).toFixed(0) : '0';
    return { income, expense, net, rate };
  }, [transactions]);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, [setSidebarOpen]);

  // [FIX #12] Guard optional context methods with optional chaining.
  const handleLanguageChange = useCallback((newLang) => {
    setLanguage?.(newLang);
    closeAll();
  }, [setLanguage, closeAll]);

  const handleLogout = useCallback(() => {
    if (typeof logout === 'function') logout();
  }, [logout]);

  const handleToggleTheme = useCallback(() => {
    if (typeof toggleTheme === 'function') toggleTheme();
  }, [toggleTheme]);

  const handleOpenConverter = useCallback(() => setShowConverter(true), []);
  const handleOpenAlerts = useCallback(() => {
    closeAll();
    setShowAlerts(true);
  }, [closeAll]);
  const handleOpenAI = useCallback(() => setIsAIOpen(true), []);
  const handleOpenDrawer = useCallback(() => setDrawerOpen(true), []);
  const handleCloseDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleOpenCmdPalette = useCallback(() => setShowCmdPalette(true), []);
  const handleOpenShortcuts = useCallback(() => {
    closeAll();
    setShowShortcuts(true);
  }, [closeAll]);
  const handleOpenAddTx = useCallback(() => setShowAddTx(true), []);

  const handleOpenProfile = useCallback(() => {
    toggleDropdown('profile');
  }, [toggleDropdown]);

  const handleDrawerConverter = useCallback(() => {
    setDrawerOpen(false); setShowConverter(true);
  }, []);
  const handleDrawerAlerts = useCallback(() => {
    setDrawerOpen(false); setShowAlerts(true);
  }, []);
  const handleDrawerAI = useCallback(() => {
    setDrawerOpen(false); setIsAIOpen(true);
  }, []);

  // [FIX #2, #3, #4, #10] Rewritten keyboard handler:
  //   - Ctrl+K now respects `isInput` (no more hijack while typing).
  //   - Escape closes the topmost overlay ONLY (priority order).
  //   - Help and Onboarding modals are now closable via Escape.
  //   - Deps array covers every reactive value read by the handler.
  useEffect(() => {
    const handleKeyboardShortcuts = (event) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      // Cmd/Ctrl + K to open Search — only when not typing in a field
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !isInput) {
        event.preventDefault();
        setShowCmdPalette(prev => !prev);
        return;
      }

      // ? (Shift + /) for shortcuts modal when not in input
      if (event.key === '?' && !isInput && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      // Ctrl/Cmd + B to toggle sidebar
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        handleSidebarToggle();
        return;
      }

      // Escape — close ONLY the topmost overlay. Order defines priority.
      if (event.key === 'Escape') {
        const stack = [
          [showCmdPalette,      () => setShowCmdPalette(false)],
          [showShortcuts,       () => setShowShortcuts(false)],
          [showHelpModal,       () => setShowHelpModal(false)],
          [showOnboardingTour,  () => setShowOnboardingTour(false)],
          [showAddTx,           () => setShowAddTx(false)],
          [drawerOpen,          () => setDrawerOpen(false)],
          [isAIOpen,            () => setIsAIOpen(false)],
          [showAlerts,          () => setShowAlerts(false)],
          [showConverter,       () => setShowConverter(false)],
          [Boolean(activeDropdown), () => closeAll()],
        ];
        for (const [isOpen, closeFn] of stack) {
          if (isOpen) {
            event.preventDefault();
            closeFn();
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [
    handleSidebarToggle,
    showConverter, showAlerts, isAIOpen, drawerOpen,
    closeAll, showCmdPalette, showShortcuts, showHelpModal,
    showOnboardingTour, showAddTx, activeDropdown,
  ]);

  // [FIX #8] Wrap in try/catch so a failing mutation doesn't blow up
  // the whole ErrorBoundary. TransactionForm owns its own error UI.
  const handleAddTransactionSubmit = useCallback(async (txData) => {
    if (typeof addTransaction !== 'function') return;
    try {
      await addTransaction(txData);
      setShowAddTx(false);
    } catch (err) {
      console.error('addTransaction failed:', err);
    }
  }, [addTransaction]);

  return (
    <ErrorBoundary>
      {/* App.jsx already wraps the full tree in <MotionConfig reducedMotion="user">,
          so we don't nest a second one here. */}
      <div className="app-island-layout" data-theme={theme}>
          <div className="portfolio-bg-layer" aria-hidden="true" />

          {/* Desktop Sidebar */}
          {deviceType === 'desktop' && (
            <>
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.div
                    className="sidebar-backdrop-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleSidebarToggle}
                    aria-hidden="true"
                  />
                )}
              </AnimatePresence>
              <DesktopSidebar
                sidebarOpen={sidebarOpen}
                onToggle={handleSidebarToggle}
                userInfo={userInfo}
                currencyInfo={currencyInfo}
                lang={lang}
                t={t}
                logout={handleLogout}
              />
            </>
          )}

          {/* Main Content */}
          <main className="island-main">
            <Header
              sidebarOpen={sidebarOpen}
              onToggleSidebar={handleSidebarToggle}
              pageTitle={pageTitle}
              userInfo={userInfo}
              activeDropdown={activeDropdown}
              onDropdownToggle={toggleDropdown}
              onCloseDropdowns={closeAll}
              onShowConverter={handleOpenConverter}
              onShowAlerts={handleOpenAlerts}
              onShowAI={handleOpenAI}
              urgentAlertsCount={urgentAlertsCount}
              formattedBalance={formattedBalance}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              lang={lang}
              t={t}
              onLanguageChange={handleLanguageChange}
              onOpenProfile={handleOpenProfile}
              onOpenCmdPalette={handleOpenCmdPalette}
              onOpenShortcuts={handleOpenShortcuts}
              onOpenHelp={() => setShowHelpModal(true)}
              onOpenTour={() => setShowOnboardingTour(true)}
              activeAlerts={activeAlerts}
              onDismissAllAlerts={handleDismissAllAlerts}
              financialSummary={financialSummary}
              currencySymbol={currencyInfo?.symbol || '$'}
              logout={handleLogout}
              user={user}
              fmt={fmt}
              navigate={navigate}
              refetch={refetch}
              isBackgroundSyncing={isBackgroundSyncing}
            />

            <div className="island-content-wrapper">
              {/* Original route transition (Problematic - animated scale and vertical displacement simultaneously during route change, triggering layout shifts and animation queue bottlenecks):
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  className="island-page"
                  initial={{ opacity: 0, y: 14, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{
                    duration: ANIMATION_DURATIONS.normal,
                    ease: [0.16, 1, 0.3, 1]
                  }}
                >
                  <Breadcrumbs />
                  {children}
                </motion.div>
              </AnimatePresence>
              */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  className="island-page"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{
                    duration: 0.18,
                    ease: [0.16, 1, 0.3, 1]
                  }}
                  style={{
                    willChange: 'opacity, transform',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden'
                  }}
                >
                  <Breadcrumbs />
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>

          <QuickActionFAB onAddTransaction={handleOpenAddTx} />

          <MobileBottomNav
            t={t}
            onOpenDrawer={handleOpenDrawer}
          />

          <AnimatePresence>
            {drawerOpen && (
              <>
                <motion.div
                  className="mobile-drawer-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  onClick={handleCloseDrawer}
                  aria-hidden="true"
                />
                <MobileDrawer
                  userInfo={userInfo}
                  currencyInfo={currencyInfo}
                  formattedBalance={formattedBalance}
                  theme={theme}
                  onToggleTheme={handleToggleTheme}
                  lang={lang}
                  onLanguageChange={handleLanguageChange}
                  onShowConverter={handleDrawerConverter}
                  onShowAlerts={handleDrawerAlerts}
                  onShowAI={handleDrawerAI}
                  urgentAlertsCount={urgentAlertsCount}
                  logout={handleLogout}
                  onClose={handleCloseDrawer}
                  t={t}
                />
              </>
            )}
          </AnimatePresence>

          <CommandPalette
            isOpen={showCmdPalette}
            onClose={() => setShowCmdPalette(false)}
          />

          <KeyboardShortcutsModal
            isOpen={showShortcuts}
            onClose={() => setShowShortcuts(false)}
          />

          <HelpModal
            isOpen={showHelpModal}
            onClose={() => setShowHelpModal(false)}
          />

          <OnboardingTour
            isOpen={showOnboardingTour}
            onClose={() => setShowOnboardingTour(false)}
          />

          <AnimatePresence mode="wait">
            {showAddTx && (
              <TransactionForm
                key="tx-form"
                onClose={() => setShowAddTx(false)}
                onSubmit={handleAddTransactionSubmit}
              />
            )}
            {showConverter && (
              <CurrencyConverter
                key="currency-converter"
                onClose={() => setShowConverter(false)}
              />
            )}
            {showAlerts && (
              <AlertsCenter
                key="alerts-center"
                alerts={alerts}
                onClose={() => setShowAlerts(false)}
              />
            )}
            {isAIOpen && (
              <AIPanelOverlay
                key="ai-panel"
                onClose={() => setIsAIOpen(false)}
                t={t}
              />
            )}
          </AnimatePresence>
        </div>
    </ErrorBoundary>
  );
}

// ==============================
// 7. SUB-COMPONENTS
// ==============================

const DesktopSidebar = React.memo(({
  sidebarOpen, onToggle,
  userInfo, t, logout
}) => {
  const isOpen = sidebarOpen;

  return (
    <aside
      className={`island-sidebar glass ${isOpen ? 'open' : 'collapsed'}`}
      aria-label="Main navigation sidebar"
      aria-expanded={isOpen}
      id="desktop-navigation"
    >
      <div className="island-brand">
        <motion.div
          className="brand-icon"
          onClick={!sidebarOpen ? onToggle : undefined}
          style={{ cursor: !sidebarOpen ? 'pointer' : 'default' }}
          title={!sidebarOpen ? (t?.('expand_sidebar') || 'Expand sidebar') : undefined}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Zap size={22} />
        </motion.div>
        <AnimatePresence>
          {isOpen && (
            <motion.span
              className="brand-name"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ overflow: 'hidden', whiteSpace: 'nowrap', display: 'inline-block' }}
            >
              MyCoinwise
            </motion.span>
          )}
        </AnimatePresence>
        <button
          type="button"
          className="collapse-toggle"
          onClick={onToggle}
          aria-label={sidebarOpen
            ? (t?.('collapse_sidebar') || 'Collapse sidebar')
            : (t?.('expand_sidebar') || 'Expand sidebar')}
          aria-expanded={sidebarOpen}
          aria-controls="desktop-navigation"
          title={sidebarOpen
            ? (t?.('collapse_sidebar') || 'Collapse sidebar')
            : (t?.('expand_sidebar') || 'Expand sidebar')}
        >
          <motion.span animate={{ rotate: isOpen ? 180 : 0 }}>
            <ChevronRight size={16} />
          </motion.span>
        </button>
      </div>

      <div className="island-user dropdown-container">
        <div className="user-trigger">
          <div className="user-avatar-wrapper">
            <div className="ambient-glow" style={{ background: userInfo.avatarColor }} />
            <div className="user-avatar" style={{ background: userInfo.avatarColor }}>
              {userInfo.isBase64Avatar ? (
                <img src={userInfo.avatar} alt="" />
              ) : (
                userInfo.avatar
              )}
            </div>
          </div>
          <AnimatePresence>
            {isOpen && (
              <motion.div
                className="user-info"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <p className="u-name" title={userInfo.displayName}>{userInfo.displayName}</p>
                <p className="u-role">{userInfo.role}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <nav className="island-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `inav-item ${isActive ? 'active' : ''}`}
            title={!isOpen ? t?.(item.labelKey) : undefined}
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} className={`inav-icon nav-icon-${item.labelKey}`} />
                <AnimatePresence>
                  {isOpen && (
                    <motion.span
                      className="inav-label"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {t?.(item.labelKey) || item.labelKey}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isActive && (
                  <motion.div
                    className="inav-active-pill"
                    layoutId="islandActive"
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 25,
                      layout: { duration: ANIMATION_DURATIONS.fast }
                    }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="island-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => `inav-item ${isActive ? 'active' : ''}`}
          title={!isOpen ? (t?.('settings') || 'Settings') : undefined}
        >
          <Settings size={20} className="inav-icon nav-icon-settings" />
          <AnimatePresence>
            {isOpen && (
              <motion.span
                className="inav-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {t?.('settings') || 'Settings'}
              </motion.span>
            )}
          </AnimatePresence>
        </NavLink>
        <button
          type="button"
          onClick={logout}
          className="inav-item text-danger"
          aria-label={t?.('logout') || 'Log Out'}
          title={!isOpen ? (t?.('logout') || 'Log Out') : undefined}
        >
          <LogOut size={20} className="inav-icon nav-icon-logout" />
          <AnimatePresence>
            {isOpen && (
              <motion.span
                className="inav-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {t?.('logout') || 'Log Out'}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </aside>
  );
});
DesktopSidebar.displayName = 'DesktopSidebar';

const BrandLogo = ({ size = 20, className = 'brand-logo-svg' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="brandLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00d4ff" />
        <stop offset="100%" stopColor="#6f00ff" />
      </linearGradient>
    </defs>
    <polygon
      points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5"
      stroke="url(#brandLogoGrad)"
      strokeWidth="2"
      fill="rgba(0, 212, 255, 0.12)"
    />
    <circle cx="12" cy="12" r="3.5" fill="url(#brandLogoGrad)" />
  </svg>
);

const Header = React.memo(({
  sidebarOpen, onToggleSidebar,
  pageTitle, userInfo,
  activeDropdown, onDropdownToggle, onCloseDropdowns,
  onShowConverter, onShowAlerts, onShowAI, urgentAlertsCount,
  formattedBalance, theme, onToggleTheme,
  lang, t, onLanguageChange, onOpenProfile,
  onOpenCmdPalette, onOpenShortcuts,
  onOpenHelp, onOpenTour,
  activeAlerts, onDismissAllAlerts,
  financialSummary, currencySymbol,
  logout, user, fmt, navigate, refetch, isBackgroundSyncing
}) => {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [syncEnabled, setSyncEnabled] = useState(getStoredSyncEnabled);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let lastVisibilityRefetch = 0;
    const handleOnline = () => {
      setIsOnline(true);
      if (syncEnabled) refetch?.();
    };
    const handleOffline = () => setIsOnline(false);
    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && navigator.onLine && syncEnabled) {
        if (now - lastVisibilityRefetch > 15000) {
          lastVisibilityRefetch = now;
          refetch?.();
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetch, syncEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SYNC_STORAGE_KEY, String(syncEnabled));
    } catch {
      // Storage may be unavailable in private browsing.
    }
  }, [syncEnabled]);

  // [FIX #11] Priority order: offline > saving. A failing request must
  // never be reported as "Saving" — the user must know the network is down.
  const syncState = !syncEnabled
    ? 'disabled'
    : !isOnline
      ? 'offline'
      : isBackgroundSyncing
        ? 'saving'
        : 'online';

  const syncCopy = {
    online: t?.('connection_online') || 'Online',
    offline: t?.('connection_offline') || 'Offline',
    saving: t?.('connection_saving') || 'Saving',
    disabled: t?.('connection_disabled') || 'Sync off',
  }[syncState];

  const toggleSync = () => {
    if (isBackgroundSyncing) return;
    setSyncEnabled((enabled) => {
      const next = !enabled;
      if (next && isOnline) refetch?.();
      return next;
    });
  };

  // [FIX #5] Scroll listener now watches the actual scroll container.
  // The app uses `html, body { overflow: hidden }` and scrolls inside
  // `.island-content-wrapper`, so `window.scrollY` is always 0.
  // Falls back to window if the wrapper is not found (e.g. during SSR
  // or if the class is renamed later).
  useEffect(() => {
    const scroller = document.querySelector('.island-content-wrapper');
    const target = scroller || window;
    const readScrollTop = () => scroller
      ? scroller.scrollTop
      : (window.scrollY || window.pageYOffset || 0);

    const handleScroll = () => setIsScrolled(readScrollTop() > 8);

    target.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => target.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`portfolio-header ${isScrolled ? 'is-scrolled' : ''}`}
      aria-label={`Coinwise Navigation - ${pageTitle}`}
    >
      <div className={`nav-container ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="nav-brand-group">
          <NavLink to="/" className="port" aria-label="Coinwise Home">
            <BrandLogo size={22} className="brand-logo-svg" />
          </NavLink>
          <span className="mobile-header-title" aria-current="page">
            {pageTitle || 'MyCoinwise'}
          </span>
        </div>

        <nav className="nav-links" aria-label="Main Navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-link nav-link-core ${isActive ? 'active' : ''}`}>
            {t?.('dashboard') || 'Dashboard'}
          </NavLink>
          <NavLink to="/transactions" className={({ isActive }) => `nav-link nav-link-core ${isActive ? 'active' : ''}`}>
            {t?.('transactions') || 'Transactions'}
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => `nav-link nav-link-core ${isActive ? 'active' : ''}`}>
            {t?.('analytics') || 'Analytics'}
          </NavLink>
          <NavLink to="/budgets" className={({ isActive }) => `nav-link nav-link-secondary ${isActive ? 'active' : ''}`}>
            {t?.('budgets') || 'Budgets'}
          </NavLink>
          <NavLink to="/goals" className={({ isActive }) => `nav-link nav-link-secondary ${isActive ? 'active' : ''}`}>
            {t?.('goals') || 'Goals'}
          </NavLink>
          <NavLink to="/wealth" className={({ isActive }) => `nav-link nav-link-tertiary ${isActive ? 'active' : ''}`}>
            {t?.('wealth') || 'Wealth'}
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => `nav-link nav-link-tertiary ${isActive ? 'active' : ''}`}>
            {t?.('about') || 'About'}
          </NavLink>
        </nav>

        <div className="nav-separator" aria-hidden="true" />

        <div className="nav-actions">
          <button
            type="button"
            className={`connection-toggle nav-btn-sync connection-toggle-${syncState}`}
            onClick={toggleSync}
            disabled={isBackgroundSyncing}
            aria-pressed={syncEnabled}
            aria-label={`Cloud sync: ${syncCopy}`}
            title={`Cloud sync: ${syncCopy}`}
          >
            <span className="connection-toggle-dot" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="theme-toggle nav-btn-search"
            onClick={onOpenCmdPalette}
            title="Search (Cmd+K)"
            aria-label="Search"
          >
            <Search size={16} />
          </button>

          <button
            type="button"
            className="theme-toggle nav-btn-converter"
            onClick={onShowConverter}
            title="Currency Converter"
            aria-label="Currency converter"
          >
            <Coins size={16} />
          </button>

          <button
            type="button"
            className="theme-toggle nav-btn-ai"
            onClick={onShowAI}
            title="AI Financial Assistant"
            aria-label="AI Assistant"
          >
            <Sparkles size={16} />
          </button>

          <button
            type="button"
            className="theme-toggle nav-btn-theme"
            id="themeToggle"
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'dark' || theme === 'amoled' ? 'Light' : 'Dark'} theme`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' || theme === 'amoled' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="dropdown-container nav-dropdown-alerts" style={{ position: 'relative' }}>
            <button
              type="button"
              className="theme-toggle nav-btn-alerts"
              onClick={() => onDropdownToggle('notifications')}
              aria-expanded={activeDropdown === 'notifications'}
              aria-label={`Alerts${urgentAlertsCount > 0 ? `, ${urgentAlertsCount} urgent` : ''}`}
              title="Alerts"
            >
              <Bell size={16} />
              {urgentAlertsCount > 0 && <span className="nav-unread-dot" />}
            </button>

            <AnimatePresence>
              {activeDropdown === 'notifications' && (
                <motion.div
                  className="header-alerts-dropdown"
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="had-header">
                    <span className="had-title">{t?.('smart_alerts') || 'Smart Alerts'}</span>
                    {activeAlerts.length > 0 && (
                      <button
                        type="button"
                        className="had-mark-read"
                        onClick={onDismissAllAlerts}
                      >
                        <Check size={13} /> {t?.('clear') || 'Clear'}
                      </button>
                    )}
                  </div>
                  <div className="had-list">
                    {activeAlerts.length > 0 ? (
                      activeAlerts.slice(0, 3).map((a, idx) => (
                        <div
                          key={a.id || `${a.title}-${idx}`}
                          className={`had-item ${a.type || 'info'}`}
                        >
                          <span>{a.message || a.title}</span>
                        </div>
                      ))
                    ) : (
                      <div className="had-empty">
                        {t?.('no_unread_alerts') || 'No unread alerts'}
                      </div>
                    )}
                  </div>
                  <div className="had-footer">
                    <button type="button" className="had-view-all-btn" onClick={onShowAlerts}>
                      {t?.('open_alerts_center') || 'Open Alerts Center'} <ExternalLink size={13} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Original dropdown-container and nav-avatar-btn (Problematic - lacked inline-flex layout and display:block on image, resulting in vertical baseline offset):
          <div className="dropdown-container" style={{ position: 'relative' }}>
            <button
              type="button"
              className="theme-toggle nav-avatar-btn"
              onClick={onOpenProfile}
              title="User profile"
              aria-expanded={activeDropdown === 'profile'}
              aria-label="User profile"
              style={{
                background: userInfo.avatarColor,
                overflow: 'hidden',
                padding: 0,
                border: '1px solid rgba(0, 212, 255, 0.35)'
              }}
            >
              {userInfo.isBase64Avatar ? (
                <img
                  src={userInfo.avatar}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                userInfo.avatar
              )}
            </button>
          </div>
          */}
          <div className="dropdown-container nav-dropdown-profile" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
              type="button"
              className="theme-toggle nav-avatar-btn nav-btn-profile"
              onClick={onOpenProfile}
              title="User profile"
              aria-expanded={activeDropdown === 'profile'}
              aria-label="User profile"
              style={{
                background: userInfo.avatarColor,
                overflow: 'hidden',
                padding: 0,
                border: '1px solid rgba(0, 212, 255, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                verticalAlign: 'middle',
              }}
            >
              {userInfo.isBase64Avatar ? (
                <img
                  src={userInfo.avatar}
                  alt=""
                  className="nav-avatar-img"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: '50%' }}
                />
              ) : (
                <span className="nav-avatar-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', lineHeight: 1 }}>
                  {userInfo.avatar}
                </span>
              )}
            </button>

            <AnimatePresence>
              {activeDropdown === 'profile' && (
                <motion.div
                  className="header-profile-dropdown"
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="hpd-user-card">
                    <div className="hpd-avatar" style={{ background: userInfo.avatarColor }}>
                      {userInfo.isBase64Avatar ? (
                        <img
                          src={userInfo.avatar}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                        />
                      ) : (
                        userInfo.avatar
                      )}
                    </div>
                    <div className="hpd-info">
                      <p className="hpd-name">{userInfo.displayName}</p>
                      <p className="hpd-email">{user?.email || t?.('logged_in_user') || 'Logged in user'}</p>
                      {formattedBalance && (
                        <div className="hpd-balance-tag">
                          <span>{t?.('balance') || 'Balance'}:</span> <strong>{formattedBalance}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {financialSummary && (
                    <div
                      className="hpd-quick-summary"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        margin: '4px 12px 8px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        borderRadius: '8px',
                        fontSize: '0.78rem'
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>{t?.('net') || 'Net'}: </span>
                        <span style={{ color: financialSummary.net >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                          {fmt
                            ? fmt(financialSummary.net)
                            : formatBalance(financialSummary.net, currencySymbol, lang)}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>{t?.('savings') || 'Savings'}: </span>
                        <span style={{ color: '#00d4ff', fontWeight: 600 }}>{financialSummary.rate}%</span>
                      </div>
                    </div>
                  )}

                  <div className="hpd-actions">
                    <button
                      type="button"
                      className="hpd-action-btn"
                      onClick={() => { onLanguageChange?.(lang === 'en' ? 'hi' : 'en'); }}
                    >
                      <Languages size={16} />
                      <span>
                        {t?.('language') || 'Language'}:{' '}
                        {lang === 'en' ? 'English (Switch to हिन्दी)' : 'हिन्दी (Switch to English)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="hpd-action-btn"
                      onClick={() => { onCloseDropdowns(); navigate('/settings'); }}
                    >
                      <Settings size={16} />
                      <span>{t?.('settings') || 'Settings & Preferences'}</span>
                    </button>
                    <button
                      type="button"
                      className="hpd-action-btn"
                      onClick={() => { onCloseDropdowns(); navigate('/settings?tab=users'); }}
                    >
                      <Users size={16} />
                      <span>{t?.('manage_users') || 'Manage Users'}</span>
                    </button>
                    <button
                      type="button"
                      className="hpd-action-btn"
                      onClick={() => { onCloseDropdowns(); onOpenShortcuts(); }}
                    >
                      <Keyboard size={16} />
                      <span>{t?.('shortcuts') || 'Keyboard Shortcuts'}</span>
                      <kbd className="hpd-kbd">?</kbd>
                    </button>
                    <button
                      type="button"
                      className="hpd-action-btn"
                      onClick={() => { onCloseDropdowns(); onOpenCmdPalette(); }}
                    >
                      <Search size={16} />
                      <span>{t?.('global_search') || 'Global Search'}</span>
                      <kbd className="hpd-kbd">⌘K</kbd>
                    </button>
                    <button
                      type="button"
                      className="hpd-action-btn"
                      onClick={() => { onCloseDropdowns(); onOpenHelp(); }}
                    >
                      <HelpCircle size={16} />
                      <span>{t?.('help_center') || 'Help & Knowledge Base'}</span>
                    </button>
                    <button
                      type="button"
                      className="hpd-action-btn"
                      onClick={() => { onCloseDropdowns(); onOpenTour(); }}
                    >
                      <Sparkles size={16} />
                      <span>{t?.('onboarding_tour') || 'Platform Onboarding Tour'}</span>
                    </button>
                    <button
                      type="button"
                      className="hpd-action-btn"
                      onClick={() => { onCloseDropdowns(); onToggleSidebar?.(); }}
                    >
                      <Menu size={16} />
                      <span>{sidebarOpen
                        ? (t?.('collapse_sidebar') || 'Collapse Sidebar')
                        : (t?.('expand_sidebar') || 'Expand Sidebar')}</span>
                      <kbd className="hpd-kbd">⌘B</kbd>
                    </button>
                    <button
                      type="button"
                      className="hpd-action-btn"
                      onClick={() => { onToggleTheme(); }}
                    >
                      {theme === 'dark' || theme === 'amoled' ? <Sun size={16} /> : <Moon size={16} />}
                      <span>{t?.('theme') || 'Theme'}: {theme === 'dark' || theme === 'amoled' ? 'Dark' : 'Light'}</span>
                    </button>
                  </div>

                  <div className="hpd-footer">
                    <button
                      type="button"
                      className="hpd-logout-btn text-danger"
                      onClick={() => { onCloseDropdowns(); logout(); }}
                    >
                      <LogOut size={16} />
                      <span>{t?.('logout') || 'Log Out'}</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
});
Header.displayName = 'Header';

const MobileBottomNav = React.memo(({ t, onOpenDrawer }) => {
  return (
    <nav className="mobile-bottom-dock glass" aria-label="Mobile navigation">
      {MOBILE_NAV_ITEMS.map((item) => {
        // [FIX #14] aria-label matches the VISIBLE label so screen
        // readers and sighted users hear/see the same name.
        const visibleLabel = item.mobileLabel || t?.(item.labelKey) || item.labelKey;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`}
            aria-label={visibleLabel}
          >
            {({ isActive }) => (
              <>
                <motion.div className="dock-icon-wrapper" whileTap={{ scale: 0.88 }}>
                  <item.icon size={20} className={`dock-icon nav-icon-${item.labelKey}`} />
                  {isActive && (
                    <motion.div
                      className="dock-active-dot"
                      layoutId="dockActive"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </motion.div>
                <span className="dock-label">
                  <span className="dock-label-full">{t?.(item.labelKey) || item.labelKey}</span>
                  <span className="dock-label-short">{item.mobileLabel}</span>
                </span>
              </>
            )}
          </NavLink>
        );
      })}
      <button
        type="button"
        className="dock-item dock-item-menu"
        onClick={onOpenDrawer}
        aria-label={t?.('open_menu') || 'Open navigation menu'}
      >
        <motion.div className="dock-icon-wrapper" whileTap={{ scale: 0.88 }}>
          <Menu size={20} className="dock-icon nav-icon-menu" />
        </motion.div>
        <span className="dock-label">{t?.('more') || 'More'}</span>
      </button>
    </nav>
  );
});
MobileBottomNav.displayName = 'MobileBottomNav';

const MobileDrawer = React.memo(({
  userInfo, formattedBalance, theme, onToggleTheme,
  lang, onLanguageChange, onShowConverter, onShowAlerts, onShowAI,
  urgentAlertsCount, logout, onClose, t
}) => {
  return (
    <motion.aside
      className="mobile-drawer"
      role="dialog"
      aria-label="Navigation menu"
      aria-modal="true"
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <div className="mobile-drawer-header">
        <div className="drawer-brand">
          <div className="brand-icon" aria-hidden="true">
            <Zap size={18} />
          </div>
          <span className="brand-name">MyCoinwise</span>
        </div>
        <button
          type="button"
          className="drawer-close-btn ibtn"
          onClick={onClose}
          aria-label={t?.('close_menu') || 'Close menu'}
        >
          <X size={18} />
        </button>
      </div>

      <div className="drawer-user-card">
        <div className="user-avatar" style={{ background: userInfo.avatarColor }}>
          {userInfo.isBase64Avatar ? (
            <img
              src={userInfo.avatar}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            userInfo.avatar
          )}
        </div>
        <div className="user-info">
          <p className="u-name">{userInfo.displayName}</p>
          <p className="u-role">{userInfo.role || (t?.('role_trader') || 'Trader')}</p>
        </div>
        <span className="drawer-balance-pill">{formattedBalance}</span>
      </div>

      <p className="drawer-section-title">{t?.('navigation') || 'Navigation'}</p>
      <div className="drawer-nav-list">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            {({ isActive }) => (
              <>
                <div className="drawer-nav-icon-box">
                  <item.icon size={16} className={`drawer-nav-icon nav-icon-${item.labelKey}`} />
                </div>
                <span className="drawer-nav-label">{t?.(item.labelKey) || item.labelKey}</span>
                {isActive && <div className="drawer-nav-active-indicator" />}
              </>
            )}
          </NavLink>
        ))}
        <NavLink
          to="/settings"
          className={({ isActive }) => `drawer-nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          {({ isActive }) => (
            <>
              <div className="drawer-nav-icon-box">
                <Settings size={16} className="drawer-nav-icon nav-icon-settings" />
              </div>
              <span className="drawer-nav-label">{t?.('settings') || 'Settings'}</span>
              {isActive && <div className="drawer-nav-active-indicator" />}
            </>
          )}
        </NavLink>
      </div>

      <p className="drawer-section-title">{t?.('tools') || 'Tools'}</p>
      <div className="drawer-tools-grid">
        <button type="button" className="drawer-tool-chip" onClick={onShowConverter}>
          <Coins size={14} /> {t?.('converter') || 'Converter'}
        </button>
        <button type="button" className="drawer-tool-chip" onClick={onShowAI}>
          <Sparkles size={14} /> {t?.('ai_chat') || 'AI Chat'}
        </button>
        <button type="button" className="drawer-tool-chip" onClick={onShowAlerts} style={{ position: 'relative' }}>
          <Bell size={14} />
          {t?.('alerts') || 'Alerts'}
          {urgentAlertsCount > 0 && (
            <span
              aria-label={`${urgentAlertsCount} ${t?.('urgent') || 'urgent'}`}
              style={{
                position: 'absolute', top: 6, right: 8,
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--danger)', color: '#fff',
                fontSize: '0.62rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              {urgentAlertsCount}
            </span>
          )}
        </button>
        <button type="button" className="drawer-tool-chip" onClick={onToggleTheme}>
          {theme === 'amoled' ? <Sun size={14} /> : <Moon size={14} />}
          {theme === 'amoled' ? (t?.('light') || 'Light') : (t?.('amoled') || 'AMOLED')}
        </button>
      </div>

      <p className="drawer-section-title">{t?.('language') || 'Language'}</p>
      <div className="drawer-preferences-row">
        {Object.entries(LANGUAGES || {}).map(([code, info]) => (
          <button
            key={code}
            type="button"
            className="drawer-pref-btn"
            onClick={() => { onLanguageChange(code); }}
            aria-pressed={lang === code}
            style={lang === code
              ? { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)', background: 'var(--nav-active-bg)' }
              : undefined}
          >
            {info.flag} {info.name.split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="drawer-footer">
        <button
          type="button"
          className="drawer-logout-btn"
          onClick={() => { logout(); onClose(); }}
        >
          <LogOut size={15} />
          {t?.('logout') || 'Log Out'}
        </button>
      </div>
    </motion.aside>
  );
});
MobileDrawer.displayName = 'MobileDrawer';

const AIPanelOverlay = React.memo(({ onClose, t }) => {
  const panelRef = useRef(null);

  // [FIX #16] Focus trap now re-queries focusable elements on every
  // Tab press, so dynamically-loaded children (e.g. AIChat buttons)
  // are included in the cycle.
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return undefined;

    const getFocusable = () =>
      Array.from(
        node.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    const initial = getFocusable();
    if (initial.length > 0) initial[0].focus();

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const list = getFocusable();
      if (list.length === 0) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !node.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !node.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);

  return (
    <>
      <motion.div
        className="ac-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
        style={{ zIndex: 'var(--z-modal)' }}
      />
      <motion.aside
        ref={panelRef}
        className="ai-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-panel-title"
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        style={{ zIndex: 'calc(var(--z-modal) + 1)' }}
      >
        <div className="ai-panel-header">
          <h2 id="ai-panel-title">{t?.('ai_assistant') || 'AI Financial Assistant'}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="ai-status-badge">{t?.('online') || 'Online'}</span>
            <button
              type="button"
              onClick={onClose}
              className="ibtn"
              style={{ width: '32px', height: '32px', borderRadius: '10px' }}
              aria-label={t?.('close_ai_assistant') || 'Close AI Assistant'}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          {t?.('ai_panel_prompt') || 'Ask questions about your spending, forecasting, or investments.'}
        </p>
        <AIChat />
      </motion.aside>
    </>
  );
});
AIPanelOverlay.displayName = 'AIPanelOverlay';