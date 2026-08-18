import React, { useState, useContext, useMemo, useCallback, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ArrowLeftRight, BarChart3, Target, Activity, Briefcase,
  CreditCard, Settings, ChevronRight, TrendingUp,
  Bell, AlertCircle, RefreshCw, LogOut, Sparkles, Calendar as CalendarIcon,
  Menu, X, Zap
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { CURRENCIES } from '../services/api';
import { LANGUAGES } from '../services/i18n';
import CurrencyConverter from './CurrencyConverter';
import AlertsCenter from './AlertsCenter';
import AIChat from './AIChat';
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

    const fullDisplayName = isValidDisplayName ? sanitizedRawName : USER_DISPLAY_RULES.defaultDisplayName;
    
    return {
      displayName: fullDisplayName,
      firstName: fullDisplayName.split(' ')[0] || fullDisplayName,
      avatar: avatarStr,
      avatarColor: validateColorHex(user?.profile_color),
      rawName: sanitizedRawName,
      isBase64Avatar
    };
  }, [user]);
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
  currentLang,
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { activeDropdown, toggleDropdown, closeAll } = useDropdownManager();
  const { sidebarOpen, setSidebarOpen, deviceType } = useResponsiveSidebar(true);

  // Context
  const contextData = useContext(AppContext) || {};
  const { user, theme, toggleTheme, currencyInfo, alerts, t, lang, setLanguage, logout } = contextData;

  const location = useLocation();
  const navigate = useNavigate();

  // Keep the mobile drawer in sync with navigation, including redirects
  // triggered by profile actions or programmatic route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

  // Custom hooks
  const userInfo = useUserDisplay(user);
  useClickOutside(activeDropdown, closeAll);

  useEffect(() => {
    // Fixed: Inject styles strictly on the client side
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
      // Optional: clean up styles if desired, but usually okay to leave
    };
  }, []);

  // Memoized values
  const urgentAlertsCount = useMemo(() =>
    alerts?.filter(a => a.type === 'danger' || a.type === 'warning').length || 0,
    [alerts]
  );

  // Fixed: Added '/calendar' to map correctly
  const pageTitleKey = useMemo(() => ({
    '/': 'dashboard',
    '/transactions': 'transactions',
    '/calendar': 'calendar',
    '/analytics': 'analytics',
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

  // Handlers
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, [setSidebarOpen]);

  const handleLanguageChange = useCallback((newLang) => {
    setLanguage(newLang);
    closeAll();
  }, [setLanguage, closeAll]);

  // FIX: memoize all modal/drawer toggle handlers so React.memo on
  // Header, MobileBottomNav, and MobileDrawer actually prevents re-renders
  const handleOpenConverter  = useCallback(() => setShowConverter(true),  []);
  const handleOpenAlerts     = useCallback(() => setShowAlerts(true),     []);
  const handleOpenAI         = useCallback(() => setIsAIOpen(true),       []);
  const handleOpenDrawer     = useCallback(() => setDrawerOpen(true),      []);
  const handleCloseDrawer    = useCallback(() => setDrawerOpen(false),     []);
  const handleOpenProfile    = useCallback(() => {
    closeAll();
    navigate('/settings');
  }, [closeAll, navigate]);

  // Drawer → open modal (closes drawer first)
  const handleDrawerConverter = useCallback(() => {
    setDrawerOpen(false); setShowConverter(true);
  }, []);
  const handleDrawerAlerts    = useCallback(() => {
    setDrawerOpen(false); setShowAlerts(true);
  }, []);
  const handleDrawerAI        = useCallback(() => {
    setDrawerOpen(false); setIsAIOpen(true);
  }, []);

  // (Drawer is closed via NavLink onClick and overlay click — no extra effect needed)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcuts = (event) => {
      // Ctrl/Cmd + B to toggle sidebar
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        handleSidebarToggle();
      }
      // Escape to close modals, dropdowns, and drawer
      if (event.key === 'Escape') {
        if (drawerOpen) { setDrawerOpen(false); return; }
        if (showConverter) setShowConverter(false);
        if (showAlerts) setShowAlerts(false);
        if (isAIOpen) setIsAIOpen(false);
        closeAll();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [handleSidebarToggle, showConverter, showAlerts, isAIOpen, drawerOpen, closeAll]);

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
        {deviceType === 'desktop' && (
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
            onLanguageChange={handleLanguageChange}
            onOpenProfile={handleOpenProfile}
          />

          <div className="island-content-wrapper">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                className="island-page"
                initial={{ opacity: 0, y: 16, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
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
            <AIPanelOverlay
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
  userInfo, user, currencyInfo, lang, t, logout
}) => {
  return (
    <aside
      className={`island-sidebar glass ${sidebarOpen ? 'open' : 'collapsed'}`}
      aria-label="Main navigation sidebar"
      aria-expanded={sidebarOpen}
      id="desktop-navigation"
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
          aria-expanded={sidebarOpen}
          aria-controls="desktop-navigation"
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
  pageTitle, userInfo,
  activeDropdown, onDropdownToggle, onCloseDropdowns,
  onShowConverter, onShowAlerts, onShowAI, urgentAlertsCount,
  formattedBalance, theme, onToggleTheme,
  lang, onLanguageChange, onOpenProfile
}) => {
  return (
    <header className="island-header glass">
      <div className="ih-left">
        <div className="ih-titles">
          <h1>{pageTitle}</h1>
        </div>
      </div>

      <div className="ih-right">
        <div className="ih-btn-group">
          {/* Language Dropdown — aria-controls links button to menu for screen readers */}
          <div className="dropdown-container" style={{ position: 'relative' }}>
            <button
              className="ibtn"
              id="language-btn"
              onClick={() => onDropdownToggle('language')}
              aria-expanded={activeDropdown === 'language'}
              aria-haspopup="listbox"
              aria-controls="language-dropdown"
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
            aria-label={`Switch to ${theme === 'amoled' ? 'Light' : 'AMOLED'} theme`}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
              >
                {theme === 'amoled' ? '☀️' : '⚡'}
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
          <span role="status" aria-live="polite">
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
          </span>
        </button>

        <button
          className="ibtn ai-btn"
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
            onClick={onOpenProfile}
            title="Open profile settings"
            aria-label="Open profile settings"
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
                <item.icon size={20} className="dock-icon" />
                {isActive && (
                  <motion.div
                    className="dock-active-dot"
                    layoutId="dockActive"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.div>
              <span className="dock-label">{t(item.labelKey)}</span>
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
          <Menu size={20} className="dock-icon" />
        </motion.div>
        <span className="dock-label">More</span>
      </button>
    </nav>
  );
});

MobileBottomNav.displayName = 'MobileBottomNav';

/* ── Mobile Drawer ── */
const MobileDrawer = React.memo(({
  userInfo, currencyInfo, formattedBalance, theme, onToggleTheme,
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
          <p className="u-role">{currencyInfo?.code} · {LANGUAGES[lang]?.name}</p>
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
                  <item.icon size={16} />
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
                <Settings size={16} />
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
        <button className="drawer-tool-chip" onClick={onShowConverter}>💱 Converter</button>
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
          {theme === 'amoled' ? '☀️' : '⚡'}
          {theme === 'amoled' ? 'Light' : 'AMOLED'}
        </button>
      </div>

      {/* Language Picker */}
      <p className="drawer-section-title">Language</p>
      <div className="drawer-preferences-row">
        {Object.entries(LANGUAGES).slice(0, 4).map(([code, info]) => (
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
