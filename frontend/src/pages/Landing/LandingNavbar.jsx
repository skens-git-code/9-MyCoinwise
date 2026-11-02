import React, { useState, useEffect, useRef, useContext } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X, LogIn, UserPlus, ShieldCheck, Sun, Moon } from 'lucide-react';
import { CoinwiseMark, CoinwiseBadge } from '../../components/CoinwiseBrand';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { rafThrottle } from '../../utils/performanceOptimizer';
import { AppStateContext, AppActionsContext, AppContext } from '../../contexts/AppContext';

export default function LandingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 20);
  const drawerRef = useRef(null);

  // App theme integration with resilient fallback for isolated renders
  const stateCtx = useContext(AppStateContext);
  const actionsCtx = useContext(AppActionsContext);
  const legacyCtx = useContext(AppContext);

  const [localTheme, setLocalTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('mcw-theme');
      if (stored) return stored;
    }
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    }
    return 'dark';
  });

  // Keep local state synced if document data-theme attribute changes externally
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const syncTheme = () => {
      const dt = document.documentElement.getAttribute('data-theme');
      if (dt) setLocalTheme(dt);
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const currentTheme = stateCtx?.theme || legacyCtx?.theme || localTheme;
  const isDark =
    currentTheme === 'amoled' ||
    currentTheme === 'dark' ||
    (currentTheme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const handleToggleTheme = () => {
    if (typeof actionsCtx?.toggleTheme === 'function') {
      actionsCtx.toggleTheme();
    } else if (typeof legacyCtx?.toggleTheme === 'function') {
      legacyCtx.toggleTheme();
    } else {
      const next = isDark ? 'light' : 'amoled';
      setLocalTheme(next);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mcw-theme', next);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', next);
      }
    }
  };

  const closeMenu = () => setMobileMenuOpen(false);

  // Monitor scroll for glass navbar elevation with RAF throttling and change detection
  useEffect(() => {
    let lastScrolled = window.scrollY > 20;

    const handleScroll = rafThrottle(() => {
      const isPast = window.scrollY > 20;
      if (isPast !== lastScrolled) {
        lastScrolled = isPast;
        setScrolled(isPast);
      }
    });

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      handleScroll.cancel();
    };
  }, []);

  // Accessible modal focus trap, Escape key dismiss, and body scroll lock
  useFocusTrap({
    isOpen: mobileMenuOpen,
    onClose: closeMenu,
    containerRef: drawerRef,
  });

  return (
    <header className={`landing-nav ${scrolled ? 'is-scrolled' : ''}`} role="banner">
      <div className="landing-nav-inner">
        {/* Brand Logo & Lockup */}
        <Link to="/welcome" className="landing-brand" aria-label="MyCoinwise Home">
          <CoinwiseBadge size={38} radius={11} variant="surface" aria-hidden="true">
            <CoinwiseMark size={22} color="#FC0100" aria-hidden="true" />
          </CoinwiseBadge>
          <div className="brand-lockup">
            <span className="brand-name">MyCoinwise</span>
            <span className="brand-badge-pill">v2.4 Live</span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="landing-nav-links" aria-label="Primary Navigation">
          <a href="#features" className="nav-anchor">
            <span>Features</span>
          </a>
          <a href="#simulator" className="nav-anchor">
            <span>Simulator</span>
          </a>
          <a href="#comparison" className="nav-anchor">
            <span>Why Us</span>
          </a>
          <a href="#faq" className="nav-anchor">
            <span>FAQ</span>
          </a>
        </nav>

        {/* Desktop & Mobile Actions */}
        <div className="landing-nav-cta">
          <div className="nav-status-badge d-none-mobile" title="End-to-End Cryptographic Security">
            <ShieldCheck size={14} className="status-shield-icon" aria-hidden="true" />
            <span>256-bit Secure</span>
          </div>

          {/* Theme Switch Toggle (Quick access on desktop and mobile) */}
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={handleToggleTheme}
            aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} theme`}
            title={`Switch to ${isDark ? 'Light' : 'Dark'} theme`}
          >
            {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
          </button>

          <Link to="/login" className="btn-landing-glass d-none-mobile" style={{ padding: '0.55rem 1.15rem', fontSize: '0.88rem' }}>
            <LogIn size={15} aria-hidden="true" />
            <span>Sign In</span>
          </Link>

          <Link to="/register" className="btn-landing-primary d-none-mobile" style={{ padding: '0.55rem 1.25rem', fontSize: '0.88rem' }}>
            <span>Get Started</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>

          {/* Mobile Hamburger Menu Toggle Button */}
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="landing-mobile-drawer"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div
          ref={drawerRef}
          id="landing-mobile-drawer"
          className="landing-mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="mobile-drawer-header">
            <span className="mobile-drawer-title">Navigation</span>
            <span className="brand-badge-pill">v2.4 Live</span>
          </div>

          <nav className="mobile-links" aria-label="Mobile Navigation">
            <a href="#features" onClick={closeMenu}>
              <span>Features</span>
              <span className="nav-sub">Dynamic Rollover & Radar</span>
            </a>
            <a href="#simulator" onClick={closeMenu}>
              <span>Simulator</span>
              <span className="nav-sub">5-Year Wealth Trajectory</span>
            </a>
            <a href="#comparison" onClick={closeMenu}>
              <span>Why Us</span>
              <span className="nav-sub">Coinwise vs Banks & Sheets</span>
            </a>
            <a href="#faq" onClick={closeMenu}>
              <span>FAQ</span>
              <span className="nav-sub">Security, Tax & Budgets</span>
            </a>
          </nav>
          
          <div className="mobile-actions">
            <button
              type="button"
              className="btn-landing-glass btn-block"
              onClick={handleToggleTheme}
              aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} theme`}
            >
              {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
              <span>{isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}</span>
            </button>
            <Link to="/login" className="btn-landing-glass btn-block" onClick={closeMenu}>
              <LogIn size={16} aria-hidden="true" />
              <span>Sign In</span>
            </Link>
            <Link to="/register" className="btn-landing-primary btn-block" onClick={closeMenu}>
              <UserPlus size={16} aria-hidden="true" />
              <span>Get Started Free</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
