import React, { useState, useContext, useMemo, useCallback, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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

// ==============================
// 2. UTILITY FUNCTIONS
// ==============================

const validateColorHex = (color) => {
  return /^#[0-9A-F]{6}$/i.test(color) ? color : '#059669';
};

const sanitizeUserInput = (input) => {
  if (!input) return null;
  if (typeof input === 'string') {
    // Trim and limit length
    const trimmed = input.trim().slice(0, USER_DISPLAY_RULES.maxDisplayNameLength);
    // Use DOMPurify for XSS prevention
    return DOMPurify.sanitize(trimmed, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  }
  return null;
};

const formatBalance = (balance, currencySymbol = '₹') => {
  const numBalance = parseFloat(balance || 0);
  if (isNaN(numBalance)) return `${currencySymbol}0.00`;
  // Use user's locale preference, fallback to en-IN for Indian Rupee formatting
  const locale = navigator.language || 'en-IN';
  return `${currencySymbol}${numBalance.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const getDeviceType = () => {
  // Safe check for SSR environments
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
};

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
// 3. CUSTOM HOOKS
// ==============================

// Hook for dropdown management
const useDropdownManager = () => {
  const [activeDropdown, setActiveDropdown] = useState(null);

  const toggleDropdown = useCallback((name) => {
    setActiveDropdown(prev => prev === name ? null : name);
  }, []);

  const closeAll = useCallback(() => setActiveDropdown(null), []);

  return { activeDropdown, toggleDropdown, closeAll };
};

// Hook for user display info
const useUserDisplay = (user, t) => {
  return useMemo(() => {
    if (!user) {
      return { displayName: t?.('guest') || 'Guest', avatar: '👤', avatarColor: '#6B7280', rawName: null, isBase64Avatar: false, role: t?.('role_trader') || 'Trader' };
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

// Hook for responsive sidebar
// Stores separate desktopOpen preference so it's not lost when resizing to mobile
const useResponsiveSidebar = (initialState = true) => {
  const [sidebarOpen, setSidebarOpen] = useState(initialState);
  const [deviceType, setDeviceType] = useState(getDeviceType());
  // Track last user-set desktop preference separately
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
          // Collapse on mobile but remember desktop preference
          setSidebarOpen(false);
        } else {
          // Restore desktop preference when returning to tablet/desktop
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

  // Wrap setSidebarOpen to also update desktop preference when on desktop/tablet
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

// Hook for click outside
const useClickOutside = (activeDropdown, onClose) => {
  useEffect(() => {
    if (!activeDropdown) return;

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

    // Small delay to prevent immediate closing
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
// 4. ERROR BOUNDARY COMPONENT
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

    // Log to error monitoring service if available
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
              onClick={this.handleReset}
              style={styles.errorButton}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
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

// ==============================
// 5. SUB-COMPONENTS
// ==============================

const LanguageDropdown = React.memo(({
  currentLang, t,
  onLanguageChange,
  onClose
}) => {
  return (
    <motion.div
      id="language-dropdown"
      role="listbox"
      aria-label="Language selection"
      className="island-dropdown glass language-dropdown"
      style={{ minWidth: 160 }}
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      onClick={e => e.stopPropagation()}
    >
      <p className="drp-label">{t?.('language') || 'Language'}</p>
      {Object.entries(LANGUAGES).map(([code, info]) => (
        <button
          key={code}
          className={`drp-btn ${currentLang === code ? 'active' : ''}`}
          onClick={() => {
            onLanguageChange(code);
            onClose();
          }}
          aria-label={`Switch to ${info.name}`}
        >
          <Languages size={15} aria-hidden="true" /> {info.name}
        </button>
      ))}
    </motion.div>
  );
});

LanguageDropdown.displayName = 'LanguageDropdown';

// ==============================
// 6. MAIN COMPONENT
// ==============================

export default function AppLayout({ children }) {
  // State management
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

  // Auto-trigger onboarding tour for first-time visitors
  useEffect(() => {
    const isCompleted = localStorage.getItem('mcw-onboarding-completed');
    if (!isCompleted) {
      const timer = setTimeout(() => setShowOnboardingTour(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Context
  const contextData = useContext(AppContext) || {};
  const { user, theme, toggleTheme, currencyInfo, alerts = [], transactions = [], addTransaction, t, lang, setLanguage, logout, fmt, refetch, isBackgroundSyncing } = contextData;

  const location = useLocation();
  const navigate = useNavigate();

  // Keep the mobile drawer in sync with navigation without effect cascading renders.
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

  // Custom hooks
  const userInfo = useUserDisplay(user, t);
  useClickOutside(activeDropdown, closeAll);

  useEffect(() => {
    const styleId = 'app-layout-animations';
    if (!document.getElementById(styleId)) {
      const styleSheet = document.createElement("style");
      styleSheet.id = styleId;
      styleSheet.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(styleSheet);
    }

    const runtime = QuantumRuntime.create(document);
    return () => {
      runtime.destroy();
    };
  }, []);

  // Filter out dismissed alerts for the header counter
  const activeAlerts = useMemo(() => {
    return alerts.filter(a => !dismissedAlertIds.has(a.id || a.title));
  }, [alerts, dismissedAlertIds]);

  const urgentAlertsCount = useMemo(() =>
    activeAlerts.filter(a => a.type === 'danger' || a.type === 'warning').length,
    [activeAlerts]
  );

  const handleDismissAllAlerts = useCallback(() => {
    setDismissedAlertIds(new Set(alerts.map(a => a.id || a.title)));
  }, [alerts]);

  const pageTitleKey = useMemo(() => ({
    '/': 'dashboard',
    '/transactions': 'transactions',
    '/calendar': 'calendar',
    '/analytics': 'analytics',
    '/accounts': 'accounts',
    '/budgets': 'budgets',
    '/goals': 'goals',
    '/subscriptions': 'subscriptions',
    '/cashflow': 'cashflow',
    '/wealth': 'wealth',
    '/settings': 'settings',
  }), []);

  const pageTitle = useMemo(() => {
    const key = pageTitleKey[location.pathname] || 'dashboard';
    const translated = t(key);
    const fallbackLabels = {
      dashboard: 'Dashboard',
      transactions: 'Transactions',
      calendar: 'Calendar',
      analytics: 'Analytics',
      accounts: 'Accounts',
      budgets: 'Budgets',
      goals: 'Savings Goals',
      subscriptions: 'Subscriptions',
      cashflow: 'Forecasting',
      wealth: 'Wealth Management',
      settings: 'Settings'
    };

    return translated && translated !== key ? translated : fallbackLabels[key];
  }, [location.pathname, t, pageTitleKey]);

  const formattedBalance = useMemo(() =>
    formatBalance(user?.balance, currencyInfo?.symbol),
    [user?.balance, currencyInfo?.symbol]
  );

  // Financial summary metrics for quick-stats dropdown
  const financialSummary = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const net = income - expense;
    const rate = income > 0 ? ((net / income) * 100).toFixed(0) : '0';
    return { income, expense, net, rate };
  }, [transactions]);

  // Handlers
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, [setSidebarOpen]);

  const handleLanguageChange = useCallback((newLang) => {
    setLanguage(newLang);
    closeAll();
  }, [setLanguage, closeAll]);

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

  // Drawer modal handlers
  const handleDrawerConverter = useCallback(() => {
    setDrawerOpen(false); setShowConverter(true);
  }, []);
  const handleDrawerAlerts = useCallback(() => {
    setDrawerOpen(false); setShowAlerts(true);
  }, []);
  const handleDrawerAI = useCallback(() => {
    setDrawerOpen(false); setIsAIOpen(true);
  }, []);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcuts = (event) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      // Cmd/Ctrl + K to open Search
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowCmdPalette(prev => !prev);
      }
      // ? (Shift + /) for shortcuts modal when not in input
      if (event.key === '?' && !isInput && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      // Ctrl/Cmd + B to toggle sidebar
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        handleSidebarToggle();
      }
      // Escape to close modals, dropdowns, and drawer
      if (event.key === 'Escape') {
        if (showCmdPalette) { setShowCmdPalette(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showAddTx) { setShowAddTx(false); return; }
        if (drawerOpen) { setDrawerOpen(false); return; }
        if (showConverter) setShowConverter(false);
        if (showAlerts) setShowAlerts(false);
        if (isAIOpen) setIsAIOpen(false);
        closeAll();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [handleSidebarToggle, showConverter, showAlerts, isAIOpen, drawerOpen, closeAll, showCmdPalette, showShortcuts, showAddTx]);

  const handleAddTransactionSubmit = useCallback(async (txData) => {
    if (addTransaction) {
      await addTransaction(txData);
      setShowAddTx(false);
    }
  }, [addTransaction]);

  return (
    <ErrorBoundary>
      <div className="app-island-layout" data-theme={theme}>
        {/* Clean Flat/Subtle Gradient Background (Reference: portfolioskens.vercel.app - No 3D) */}
        <div className="portfolio-bg-layer" aria-hidden="true" />

        {/* Desktop Sidebar (Floating Cyber Control Drawer) */}
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
              logout={logout}
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
            onToggleTheme={toggleTheme}
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
            logout={logout}
            user={user}
            fmt={fmt}
            navigate={navigate}
            refetch={refetch}
            isBackgroundSyncing={isBackgroundSyncing}
          />

          <div className="island-content-wrapper">
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
          </div>
        </main>

        {/* Floating Quick Action Button */}
        <QuickActionFAB onAddTransaction={handleOpenAddTx} />

        {/* Mobile Bottom Dock */}
        {deviceType !== 'desktop' && (
          <MobileBottomNav
            t={t}
            onOpenDrawer={handleOpenDrawer}
          />
        )}

        {/* Mobile Drawer */}
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
                onToggleTheme={toggleTheme}
                lang={lang}
                onLanguageChange={handleLanguageChange}
                onShowConverter={handleDrawerConverter}
                onShowAlerts={handleDrawerAlerts}
                onShowAI={handleDrawerAI}
                urgentAlertsCount={urgentAlertsCount}
                logout={logout}
                onClose={handleCloseDrawer}
                t={t}
              />
            </>
          )}
        </AnimatePresence>

        {/* Modals & Command Palette */}
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
            />
          )}
        </AnimatePresence>

      </div>
    </ErrorBoundary>
  );
}


// ==============================
// 7. SUB-COMPONENTS (Separated for maintainability)
// ==============================

const DesktopSidebar = React.memo(({
  sidebarOpen, onToggle,
  userInfo, t, logout
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // 180ms hysteresis ensures seamless transition across internal gaps without flickering
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
      hoverTimeoutRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const isOpen = sidebarOpen || isHovered;

  return (
    <aside
      className={`island-sidebar glass ${isOpen ? 'open' : 'collapsed'} ${isHovered ? 'hover-expanded' : ''}`}
      aria-label="Main navigation sidebar"
      aria-expanded={isOpen}
      id="desktop-navigation"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="island-brand">
        <motion.div className="brand-icon">
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
          className="collapse-toggle"
          onClick={onToggle}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={sidebarOpen}
          aria-controls="desktop-navigation"
        >
          <motion.span animate={{ rotate: isOpen ? 180 : 0 }}>
            <ChevronRight size={16} />
          </motion.span>
        </button>
      </div>

      {/* User Info (Read-only) */}
      <div className="island-user dropdown-container">
        <div className="user-trigger">
          <div className="user-avatar-wrapper">
            <div className="ambient-glow" style={{ background: userInfo.avatarColor }} />
            <div className="user-avatar" style={{ background: userInfo.avatarColor }}>
              {userInfo.isBase64Avatar ? (
                <img src={userInfo.avatar} alt="Avatar" />
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

      {/* Navigation */}
      <nav className="island-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `inav-item ${isActive ? 'active' : ''}`}
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
                      {t(item.labelKey)}
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
        <NavLink to="/settings" className={({ isActive }) => `inav-item ${isActive ? 'active' : ''}`}>
          <Settings size={20} className="inav-icon nav-icon-settings" />
          <AnimatePresence>
            {isOpen && (
              <motion.span
                className="inav-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {t('settings')}
              </motion.span>
            )}
          </AnimatePresence>
        </NavLink>
        <button onClick={logout} className="inav-item text-danger" aria-label={t?.('logout') || 'Log Out'}>
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
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncEnabled, setSyncEnabled] = useState(getStoredSyncEnabled);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (syncEnabled) refetch?.();
    };
    const handleOffline = () => setIsOnline(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && syncEnabled) {
        refetch?.();
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
      // Storage can be unavailable in private browsing; the in-memory state
      // still keeps the control functional for the current session.
    }
  }, [syncEnabled]);

  const syncState = isBackgroundSyncing ? 'saving' : !syncEnabled ? 'disabled' : isOnline ? 'online' : 'offline';
  const syncCopy = {
    online: t?.('connection_online') || 'Online',
    offline: t?.('connection_offline') || 'Offline',
    saving: 'Saving',
    disabled: 'Sync off'
  }[syncState];
  const toggleSync = () => {
    if (isBackgroundSyncing) return;
    setSyncEnabled((enabled) => {
      const next = !enabled;
      if (next && isOnline) refetch?.();
      return next;
    });
  };

  return (
    <header className="portfolio-header" aria-label={`Coinwise Navigation - ${pageTitle}`}>
      <div className="nav-container">
        {/* Brand Logo & Dynamic Mobile Page Title Anchor */}
        <div className="nav-brand-group">
          <NavLink to="/" className="port" aria-label="Coinwise Home">
            <BrandLogo size={28} className="brand-logo-svg" />
          </NavLink>
          <span className="mobile-header-title" aria-current="page">
            {pageTitle || 'MyCoinwise'}
          </span>
        </div>

        {/* Navigation Links with Gliding Active Pill */}
        <nav className="nav-links" aria-label="Main Navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/transactions" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Transactions
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Analytics
          </NavLink>
          <NavLink to="/budgets" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Budgets
          </NavLink>
          <NavLink to="/goals" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Goals
          </NavLink>
          <NavLink to="/wealth" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Wealth
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            About
          </NavLink>
        </nav>

        {/* Header Action Buttons & Toggles (Matching Reference) */}
        <div className="nav-actions">
          {/* Cloud Sync Indicator */}
          <button
            type="button"
            className={`connection-toggle connection-toggle-${syncState}`}
            onClick={toggleSync}
            disabled={isBackgroundSyncing}
            aria-pressed={syncEnabled}
            aria-label={`Cloud sync: ${syncCopy}`}
            title={`Cloud sync: ${syncCopy}`}
          >
            <span className="connection-toggle-dot" aria-hidden="true" />
          </button>

          {/* Quick Search */}
          <button
            className="theme-toggle"
            onClick={onOpenCmdPalette}
            title="Search (Cmd+K)"
            aria-label="Search"
          >
            <Search size={16} />
          </button>

          {/* Currency Converter */}
          <button
            className="theme-toggle"
            onClick={onShowConverter}
            title="Currency Converter"
            aria-label="Currency converter"
          >
            <Coins size={16} />
          </button>

          {/* AI Assistant */}
          <button
            className="theme-toggle"
            onClick={onShowAI}
            title="AI Financial Assistant"
            aria-label="AI Assistant"
          >
            <Sparkles size={16} />
          </button>

          {/* Theme Toggle (Exact Circular Pill from Reference) */}
          <button
            className="theme-toggle"
            id="themeToggle"
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'dark' || theme === 'amoled' ? 'Light' : 'Dark'} theme`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' || theme === 'amoled' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Notification Bell with Dropdown */}
          <div className="dropdown-container" style={{ position: 'relative' }}>
            <button
              className="theme-toggle"
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
                    <span className="had-title">Smart Alerts</span>
                    {activeAlerts.length > 0 && (
                      <button className="had-mark-read" onClick={onDismissAllAlerts}>
                        <Check size={13} /> Clear
                      </button>
                    )}
                  </div>
                  <div className="had-list">
                    {activeAlerts.length > 0 ? (
                      activeAlerts.slice(0, 3).map((a, idx) => (
                        <div key={idx} className={`had-item ${a.type || 'info'}`}>
                          <span>{a.message || a.title}</span>
                        </div>
                      ))
                    ) : (
                      <div className="had-empty">No unread alerts</div>
                    )}
                  </div>
                  <div className="had-footer">
                    <button className="had-view-all-btn" onClick={onShowAlerts}>
                      Open Alerts Center <ExternalLink size={13} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Profile Avatar Dropdown */}
          <div className="dropdown-container" style={{ position: 'relative' }}>
            <button
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
                <img src={userInfo.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                userInfo.avatar
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
                        <img src={userInfo.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      ) : (
                        userInfo.avatar
                      )}
                    </div>
                    <div className="hpd-info">
                      <p className="hpd-name">{userInfo.displayName}</p>
                      <p className="hpd-email">{user?.email || 'Logged in user'}</p>
                      {formattedBalance && (
                        <div className="hpd-balance-tag">
                          <span>Balance:</span> <strong>{formattedBalance}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {financialSummary && (
                    <div className="hpd-quick-summary" style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      margin: '4px 12px 8px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderRadius: '8px',
                      fontSize: '0.78rem'
                    }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Net: </span>
                        <span style={{ color: financialSummary.net >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                          {fmt ? fmt(financialSummary.net) : `${currencySymbol}${financialSummary.net.toFixed(2)}`}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Savings: </span>
                        <span style={{ color: '#00d4ff', fontWeight: 600 }}>{financialSummary.rate}%</span>
                      </div>
                    </div>
                  )}

                  <div className="hpd-actions">
                    <button className="hpd-action-btn" onClick={() => { onLanguageChange?.(lang === 'en' ? 'hi' : 'en'); }}>
                      <Languages size={16} />
                      <span>Language: {lang === 'en' ? 'English (Switch to हिन्दी)' : 'हिन्दी (Switch to English)'}</span>
                    </button>
                    <button className="hpd-action-btn" onClick={() => { onCloseDropdowns(); navigate('/settings'); }}>
                      <Settings size={16} />
                      <span>{t?.('settings') || 'Settings & Preferences'}</span>
                    </button>
                    <button className="hpd-action-btn" onClick={() => { onCloseDropdowns(); navigate('/settings?tab=users'); }}>
                      <Users size={16} />
                      <span>{t?.('manage_users') || 'Manage Users'}</span>
                    </button>
                    <button className="hpd-action-btn" onClick={() => { onCloseDropdowns(); onOpenShortcuts(); }}>
                      <Keyboard size={16} />
                      <span>{t?.('shortcuts') || 'Keyboard Shortcuts'}</span>
                      <kbd className="hpd-kbd">?</kbd>
                    </button>
                    <button className="hpd-action-btn" onClick={() => { onCloseDropdowns(); onOpenCmdPalette(); }}>
                      <Search size={16} />
                      <span>{t?.('global_search') || 'Global Search'}</span>
                      <kbd className="hpd-kbd">⌘K</kbd>
                    </button>
                    <button className="hpd-action-btn" onClick={() => { onCloseDropdowns(); onOpenHelp(); }}>
                      <HelpCircle size={16} />
                      <span>{t?.('help_center') || 'Help & Knowledge Base'}</span>
                    </button>
                    <button className="hpd-action-btn" onClick={() => { onCloseDropdowns(); onOpenTour(); }}>
                      <Sparkles size={16} />
                      <span>{t?.('onboarding_tour') || 'Platform Onboarding Tour'}</span>
                    </button>
                    <button className="hpd-action-btn" onClick={() => { onCloseDropdowns(); onToggleSidebar?.(); }}>
                      <Menu size={16} />
                      <span>{sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}</span>
                      <kbd className="hpd-kbd">⌘B</kbd>
                    </button>
                    <button className="hpd-action-btn" onClick={() => { onToggleTheme(); }}>
                      {theme === 'dark' || theme === 'amoled' ? <Sun size={16} /> : <Moon size={16} />}
                      <span>{t?.('theme') || 'Theme'}: {theme === 'dark' || theme === 'amoled' ? 'Dark' : 'Light'}</span>
                    </button>
                  </div>

                  <div className="hpd-footer">
                    <button className="hpd-logout-btn text-danger" onClick={() => { onCloseDropdowns(); logout(); }}>
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
      {/* Core 4 nav items */}
      {MOBILE_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`}
          aria-label={t(item.labelKey)}
        >
          {({ isActive }) => (
            <>
              <motion.div
                className="dock-icon-wrapper"
                whileTap={{ scale: 0.88 }}
              >
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
                <span className="dock-label-full">{t(item.labelKey)}</span>
                <span className="dock-label-short">{item.mobileLabel}</span>
              </span>
            </>
          )}
        </NavLink>
      ))}
      {/* Menu button — opens full drawer */}
      <button
        className="dock-item dock-item-menu"
        onClick={onOpenDrawer}
        aria-label="Open navigation menu"
      >
        <motion.div className="dock-icon-wrapper" whileTap={{ scale: 0.88 }}>
          <Menu size={20} className="dock-icon nav-icon-menu" />
        </motion.div>
        <span className="dock-label">More</span>
      </button>
    </nav>
  );
});

MobileBottomNav.displayName = 'MobileBottomNav';

/* ── Mobile Drawer ── */
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
      {/* Header */}
      <div className="mobile-drawer-header">
        <div className="drawer-brand">
          <div className="brand-icon">
            <Zap size={18} />
          </div>
          <span className="brand-name">MyCoinwise</span>
        </div>
        <button
          className="drawer-close-btn ibtn"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* User Card */}
      <div className="drawer-user-card">
        <div
          className="user-avatar"
          style={{ background: userInfo.avatarColor }}
        >
          {userInfo.isBase64Avatar ? (
            <img src={userInfo.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            userInfo.avatar
          )}
        </div>
        <div className="user-info">
          <p className="u-name">{userInfo.displayName}</p>
          <p className="u-role">{userInfo.role || 'Trader'}</p>
        </div>
        <span className="drawer-balance-pill">{formattedBalance}</span>
      </div>

      {/* Main Navigation */}
      <p className="drawer-section-title">Navigation</p>
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
                <span className="drawer-nav-label">{t(item.labelKey)}</span>
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
              <span className="drawer-nav-label">{t('settings')}</span>
              {isActive && <div className="drawer-nav-active-indicator" />}
            </>
          )}
        </NavLink>
      </div>

      {/* Quick Tools */}
      <p className="drawer-section-title">Tools</p>
      <div className="drawer-tools-grid">
        <button className="drawer-tool-chip" onClick={onShowConverter}><Coins size={14} /> Converter</button>
        <button className="drawer-tool-chip" onClick={onShowAI}>
          <Sparkles size={14} /> AI Chat
        </button>
        <button className="drawer-tool-chip" onClick={onShowAlerts} style={{ position: 'relative' }}>
          <Bell size={14} />
          Alerts
          {urgentAlertsCount > 0 && (
            <span style={{
              position: 'absolute', top: 6, right: 8,
              width: 16, height: 16, borderRadius: '50%',
              background: 'var(--danger)', color: '#fff',
              fontSize: '0.62rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>{urgentAlertsCount}</span>
          )}
        </button>
        <button className="drawer-tool-chip" onClick={() => { onToggleTheme(); }}>
          {theme === 'amoled' ? <Sun size={14} /> : <Moon size={14} />}
          {theme === 'amoled' ? 'Light' : 'AMOLED'}
        </button>
      </div>

      {/* Language Picker */}
      <p className="drawer-section-title">Language</p>
      <div className="drawer-preferences-row">
        {Object.entries(LANGUAGES).map(([code, info]) => (
          <button
            key={code}
            className="drawer-pref-btn"
            onClick={() => { onLanguageChange(code); }}
            style={lang === code ? { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)', background: 'var(--nav-active-bg)' } : {}}
          >
            {info.flag} {info.name.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="drawer-footer">
        <button className="drawer-logout-btn" onClick={() => { logout(); onClose(); }}>
          <LogOut size={15} />
          Log Out
        </button>
      </div>
    </motion.aside>
  );
});

MobileDrawer.displayName = 'MobileDrawer';

/* ── AI Panel Overlay ── */
const AIPanelOverlay = React.memo(({ onClose }) => {
  const panelRef = useRef(null);

  // Focus trap
  useEffect(() => {
    const focusable = panelRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable && focusable.length) {
      focusable[0].focus();

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
        aria-label="AI Financial Assistant"
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        style={{ zIndex: 'calc(var(--z-modal) + 1)' }}
      >
        <div className="ai-panel-header">
          <h2>AI Financial Assistant</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="ai-status-badge">Online</span>
            <button
              onClick={onClose}
              className="ibtn"
              style={{ width: '32px', height: '32px', borderRadius: '10px' }}
              aria-label="Close AI Assistant"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Ask questions about your spending, forecasting, or investments.
        </p>
        <AIChat />
      </motion.aside>
    </>
  );
});

AIPanelOverlay.displayName = 'AIPanelOverlay';

// ==============================
// 8. STYLES (Inline for critical components)
// ==============================

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
  errorToast: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    backgroundColor: '#dc2626',
    color: 'white',
    padding: '12px 16px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    animation: 'slideIn 0.3s ease-out'
  },
  toastClose: {
    background: 'none',
    border: 'none',
    color: 'white',
    marginLeft: '12px',
    cursor: 'pointer',
    fontSize: '20px',
    fontWeight: 'bold',
    padding: '0 4px'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: '16px'
  },
  userTrigger: {
    width: '100%',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    textAlign: 'left'
  },
  waveEmoji: {
    display: 'inline-block',
    transformOrigin: '70% 70%',
    marginLeft: '8px'
  },
  avatarButton: {
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: '50%',
    fontSize: '1.2rem',
    transition: 'transform 0.2s ease'
  }
};
