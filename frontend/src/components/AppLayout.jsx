import React, { useState, useContext, useMemo, useCallback, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ArrowLeftRight, BarChart3, Target, Activity, Briefcase,
  CreditCard, Settings, ChevronRight, Zap, TrendingUp,
  Plus, Check, Users, Bell, Smartphone, AlertCircle, RefreshCw, LogOut, Sparkles, Calendar as CalendarIcon
} from 'lucide-react';
import { AppContext } from '../App';
import { CURRENCIES } from '../services/api';
import { LANGUAGES } from '../services/i18n';
import CurrencyConverter from './CurrencyConverter';
import AlertsCenter from './AlertsCenter';
import AIChat from './AIChat';
import DOMPurify from 'dompurify';

// ==============================
// 1. CONSTANTS & CONFIGURATION
// ==============================

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, labelKey: 'dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, labelKey: 'transactions' },
  { to: '/calendar', icon: CalendarIcon, labelKey: 'Calendar' },
  { to: '/analytics', icon: BarChart3, labelKey: 'analytics' },
  { to: '/goals', icon: Target, labelKey: 'goals' },
  { to: '/subscriptions', icon: CreditCard, labelKey: 'subscriptions' },
  { to: '/cashflow', icon: Activity, labelKey: 'cashflow' },
  { to: '/wealth', icon: Briefcase, labelKey: 'wealth' },
];

// Mobile dock shows only core 4 + Settings (Apple HIG: max 5)
const MOBILE_NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, labelKey: 'dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, labelKey: 'transactions' },
  { to: '/analytics', icon: BarChart3, labelKey: 'analytics' },
  { to: '/goals', icon: Target, labelKey: 'goals' },
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
  fast: 0.2,
  normal: 0.35,
  slow: 0.5
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

  return `${currencySymbol}${numBalance.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const getDeviceType = () => {
  const width = window.innerWidth;
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
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
const useUserDisplay = (user) => {
  return useMemo(() => {
    if (!user) {
      return { displayName: 'Guest', avatar: '👤', avatarColor: '#6B7280', rawName: null, isBase64Avatar: false };
    }

    const rawName = user?.name || user?.username;
    const sanitizedRawName = sanitizeUserInput(rawName);
    const isValidDisplayName = sanitizedRawName &&
      !USER_DISPLAY_RULES.randomIdPattern.test(sanitizedRawName) &&
      !USER_DISPLAY_RULES.excludedIds.has(sanitizedRawName);

    const avatarStr = user?.profile_avatar || '😊';
    const isBase64Avatar = typeof avatarStr === 'string' && avatarStr.length > 20 && avatarStr.startsWith('data:image');

    return {
      displayName: isValidDisplayName ? sanitizedRawName : USER_DISPLAY_RULES.defaultDisplayName,
      avatar: avatarStr,
      avatarColor: validateColorHex(user?.profile_color),
      rawName: sanitizedRawName,
      isBase64Avatar
    };
  }, [user]);
};

// Hook for responsive sidebar
const useResponsiveSidebar = (initialState = true) => {
  const [sidebarOpen, setSidebarOpen] = useState(initialState);
  const [deviceType, setDeviceType] = useState(getDeviceType());

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
        } else if (newDeviceType === 'desktop' && sidebarOpen === false) {
          // Optionally auto-open on desktop
          // setSidebarOpen(true);
        }
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, [sidebarOpen]);

  return { sidebarOpen, setSidebarOpen, deviceType };
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
  currentLang,
  onLanguageChange,
  onClose
}) => {
  return (
    <motion.div
      className="island-dropdown glass"
      style={{ right: 0, left: 'auto', minWidth: 160 }}
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      onClick={e => e.stopPropagation()}
    >
      <p className="drp-label">Language</p>
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
          {info.flag} {info.name}
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
  const [error, setError] = useState(null);

  const { activeDropdown, toggleDropdown, closeAll } = useDropdownManager();
  const { sidebarOpen, setSidebarOpen, deviceType } = useResponsiveSidebar(true);

  // Context
  const {
    user, theme, toggleTheme,
    currencyInfo, alerts, t, lang, setLanguage, transactions, logout
  } = useContext(AppContext);

  const location = useLocation();

  // Custom hooks
  const userInfo = useUserDisplay(user);
  useClickOutside(activeDropdown, closeAll);

  // Memoized values
  const urgentAlertsCount = useMemo(() =>
    alerts?.filter(a => a.type === 'danger' || a.type === 'warning').length || 0,
    [alerts]
  );

  const hasIncome = useMemo(() =>
    transactions?.some(tx => tx.type === 'income') ?? false,
    [transactions]
  );

  const pageTitleKey = useMemo(() => ({
    '/': 'dashboard',
    '/transactions': 'transactions',
    '/analytics': 'analytics',
    '/goals': 'goals',
    '/subscriptions': 'subscriptions',
    '/cashflow': 'cashflow',
    '/wealth': 'wealth',
    '/settings': 'settings',
  }), []);

  const pageTitle = useMemo(() =>
    t(pageTitleKey[location.pathname] || 'dashboard'),
    [location.pathname, t, pageTitleKey]
  );

  const formattedBalance = useMemo(() =>
    formatBalance(user?.balance, currencyInfo?.symbol),
    [user?.balance, currencyInfo?.symbol]
  );

  const isDashboard = location.pathname === '/';

  // Handlers
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, [setSidebarOpen]);

  const handleLanguageChange = useCallback((newLang) => {
    setLanguage(newLang);
    closeAll();
  }, [setLanguage, closeAll]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcuts = (event) => {
      // Ctrl/Cmd + B to toggle sidebar
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        handleSidebarToggle();
      }
      // Escape to close modals and dropdowns
      if (event.key === 'Escape') {
        if (showConverter) setShowConverter(false);
        if (showAlerts) setShowAlerts(false);
        if (isAIOpen) setIsAIOpen(false);
        closeAll();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [handleSidebarToggle, showConverter, showAlerts, isAIOpen, closeAll]);



  return (
    <ErrorBoundary>
      <div className="app-island-layout" data-theme={theme}>
        {/* Ambient AMOLED Background */}
        <div className="animated-bg" aria-hidden="true">
          <div className="gradient-bg"></div>
          <div className="gradients-container">
            <div className="gradient gradient-1"></div>
            <div className="gradient gradient-2"></div>
            <div className="gradient gradient-3"></div>
          </div>
          <div className="particles">
            <div className="particle" style={{ left: '10%', animationDuration: '25s', animationDelay: '0s' }}></div>
            <div className="particle" style={{ left: '30%', animationDuration: '20s', animationDelay: '2s' }}></div>
            <div className="particle" style={{ left: '55%', animationDuration: '28s', animationDelay: '5s' }}></div>
            <div className="particle" style={{ left: '75%', animationDuration: '22s', animationDelay: '1s' }}></div>
            <div className="particle" style={{ left: '90%', animationDuration: '30s', animationDelay: '3s' }}></div>
          </div>
        </div>

        {/* Desktop Sidebar */}
        {deviceType !== 'mobile' && (
          <DesktopSidebar
            sidebarOpen={sidebarOpen}
            onToggle={handleSidebarToggle}
            userInfo={userInfo}
            user={user}
            currencyInfo={currencyInfo}
            lang={lang}
            t={t}
            logout={logout}
          />
        )}

        {/* Main Content */}
        <main className="island-main">
          <Header
            isDashboard={isDashboard}
            pageTitle={pageTitle}
            userInfo={userInfo}
            hasIncome={hasIncome}
            activeDropdown={activeDropdown}
            onDropdownToggle={toggleDropdown}
            onCloseDropdowns={closeAll}
            onShowConverter={() => setShowConverter(true)}
            onShowAlerts={() => setShowAlerts(true)}
            onShowAI={() => setIsAIOpen(true)}
            urgentAlertsCount={urgentAlertsCount}
            formattedBalance={formattedBalance}
            theme={theme}
            onToggleTheme={toggleTheme}
            lang={lang}
            onLanguageChange={handleLanguageChange}
            t={t}
            logout={logout}
          />

          <div className="island-content-wrapper">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                className="island-page"
                initial={{ opacity: 0, y: 20, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{
                  duration: ANIMATION_DURATIONS.normal,
                  ease: [0.16, 1, 0.3, 1]
                }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        {deviceType === 'mobile' && (
          <MobileBottomNav t={t} logout={logout} />
        )}

        {/* Modals */}
        <AnimatePresence>
          {showConverter && (
            <CurrencyConverter
              onClose={() => setShowConverter(false)}
            />
          )}
          {showAlerts && (
            <AlertsCenter
              alerts={alerts}
              onClose={() => setShowAlerts(false)}
            />
          )}
          {isAIOpen && (
            <motion.aside
              className="ai-panel"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <div className="ai-panel-header">
                <h2>AI Financial Assistant</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="ai-status-badge">Online</span>
                  <button
                    onClick={() => setIsAIOpen(false)}
                    className="ibtn"
                    style={{ width: '32px', height: '32px', borderRadius: '10px' }}
                    aria-label="Close AI Assistant"
                  >
                    ×
                  </button>
                </div>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Ask questions about your spending, forecasting, or investments.
              </p>
              <AIChat />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Error Toast */}
        {error && (
          <div style={styles.errorToast}>
            <AlertCircle size={20} />
            <span style={{ marginLeft: '8px' }}>{error}</span>
            <button
              onClick={() => setError(null)}
              style={styles.toastClose}
              aria-label="Close error message"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

// ==============================
// 7. SUB-COMPONENTS (Separated for maintainability)
// ==============================

const DesktopSidebar = React.memo(({
  sidebarOpen, onToggle,
  userInfo, user, currencyInfo, lang, t, logout
}) => {
  return (
    <aside
      className={`island-sidebar glass ${sidebarOpen ? 'open' : 'collapsed'}`}
      aria-label="Main navigation sidebar"
      aria-hidden={!sidebarOpen}
    >
      <div className="island-brand">
        <motion.div className="brand-icon" whileHover={{ rotate: 15, scale: 1.1 }}>
          <Zap size={22} />
        </motion.div>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.span
              className="brand-name"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
            >
              MyCoinwise
            </motion.span>
          )}
        </AnimatePresence>
        <button
          className="collapse-toggle"
          onClick={onToggle}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <motion.span animate={{ rotate: sidebarOpen ? 180 : 0 }}>
            <ChevronRight size={16} />
          </motion.span>
        </button>
      </div>

      {/* User Info (Read-only now) */}
      <div className="island-user dropdown-container">
        <div
          className="user-trigger"
          style={{ ...styles.userTrigger, cursor: 'default' }}
        >
          <div className="user-avatar" style={{ background: userInfo.avatarColor, overflow: 'hidden' }}>
            {userInfo.isBase64Avatar ? (
              <img src={userInfo.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              userInfo.avatar
            )}
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div className="user-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="u-name">{sanitizeUserInput(user?.username) || 'User'}</p>
                <p className="u-role">{currencyInfo?.code} · {LANGUAGES[lang]?.name}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <nav className="island-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `inav-item ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} className="inav-icon" />
                <AnimatePresence>
                  {sidebarOpen && (
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
          <Settings size={20} className="inav-icon" />
          <AnimatePresence>
            {sidebarOpen && (
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
        <button onClick={logout} className="inav-item text-danger" style={{ marginTop: '5px' }}>
          <LogOut size={20} className="inav-icon" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span
                className="inav-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                Log Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </aside>
  );
});

DesktopSidebar.displayName = 'DesktopSidebar';

const Header = React.memo(({
  isDashboard, pageTitle, userInfo, hasIncome,
  activeDropdown, onDropdownToggle, onCloseDropdowns,
  onShowConverter, onShowAlerts, onShowAI, urgentAlertsCount,
  formattedBalance, theme, onToggleTheme,
  lang, onLanguageChange, t, logout
}) => {
  return (
    <header className="island-header glass">
      <div className="ih-left">
        {isDashboard ? (
          <motion.div
            className="dashboard-greeting-block"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: ANIMATION_DURATIONS.slow, ease: "easeOut" }}
          >
            <h1 className="greeting-title">
              {t('welcome_back')} <span className="greeting-name">{userInfo.displayName}</span>
              <motion.span
                className="wave-emoji"
                animate={{ rotate: [0, 15, -10, 15, -5, 10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
                style={styles.waveEmoji}
              >
                👋
              </motion.span>
            </h1>
            <p className="greeting-subtitle">
              {hasIncome
                ? t('latest_financial_summary')
                : t('add_first_income')}
            </p>
          </motion.div>
        ) : (
          <div className="ih-titles">
            <h1>{pageTitle}</h1>
            <p>{t('track_plan_grow')}</p>
          </div>
        )}
      </div>

      <div className="ih-right">
        <div className="ih-btn-group">
          {/* Language Dropdown */}
          <div className="dropdown-container" style={{ position: 'relative' }}>
            <button
              className="ibtn"
              onClick={() => onDropdownToggle('language')}
              aria-expanded={activeDropdown === 'language'}
              aria-label="Change language"
            >
              {LANGUAGES[lang]?.flag}
            </button>
            <AnimatePresence>
              {activeDropdown === 'language' && (
                <LanguageDropdown
                  currentLang={lang}
                  onLanguageChange={onLanguageChange}
                  onClose={onCloseDropdowns}
                />
              )}
            </AnimatePresence>
          </div>

          <button
            className="ibtn"
            onClick={onShowConverter}
            aria-label="Currency converter"
          >
            💱
          </button>

          <button
            className="ibtn"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>

        <div className="ih-separator" />

        <button
          className="ibtn alert-btn"
          onClick={onShowAlerts}
          aria-label={`Alerts${urgentAlertsCount > 0 ? `, ${urgentAlertsCount} urgent` : ''}`}
        >
          <Bell size={20} />
          {urgentAlertsCount > 0 && (
            <motion.span
              className="alert-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              {urgentAlertsCount}
            </motion.span>
          )}
        </button>

        <button
          className="ibtn"
          onClick={onShowAI}
          aria-label="AI Assistant"
        >
          <Sparkles size={20} />
        </button>

        <div className="ih-balance">
          <TrendingUp size={16} />
          <span>{formattedBalance}</span>
        </div>

        {/* User Status Block */}
        <div className="dropdown-container" style={{ position: 'relative' }}>
          <button
            className="ih-avatar-btn"
            onClick={logout}
            title="Log Out"
            style={{
              ...styles.avatarButton,
              background: userInfo.avatarColor,
              boxShadow: `0 4px 12px ${userInfo.avatarColor}44`,
              cursor: 'pointer',
              overflow: 'hidden',
              padding: userInfo.isBase64Avatar ? 0 : undefined
            }}
          >
            {userInfo.isBase64Avatar ? (
              <img src={userInfo.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              userInfo.avatar
            )}
          </button>
        </div>
      </div>
    </header>
  );
});

Header.displayName = 'Header';

const MobileBottomNav = React.memo(({ t }) => {
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
            <motion.div
              className="dock-icon-wrapper"
              whileTap={{ scale: 0.85 }}
              whileHover={{ scale: 1.05 }}
            >
              <item.icon size={22} className="dock-icon" />
              {isActive && (
                <motion.div
                  className="dock-active-dot"
                  layoutId="dockActive"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </motion.div>
          )}
        </NavLink>
      ))}
      {/* Settings — always last */}
      <NavLink
        to="/settings"
        className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`}
        aria-label={t('settings')}
      >
        {({ isActive }) => (
          <motion.div
            className="dock-icon-wrapper"
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.05 }}
          >
            <Settings size={22} className="dock-icon" />
            {isActive && (
              <motion.div
                className="dock-active-dot"
                layoutId="dockActive"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </motion.div>
        )}
      </NavLink>
    </nav>
  );
});

MobileBottomNav.displayName = 'MobileBottomNav';

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

// Add global animation keyframes
const styleSheet = document.createElement("style");
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