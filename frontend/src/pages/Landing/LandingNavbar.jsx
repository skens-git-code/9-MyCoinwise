import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X, LogIn, UserPlus } from 'lucide-react';
import { CoinwiseMark, CoinwiseBadge } from '../../components/CoinwiseBrand';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export default function LandingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef(null);

  const closeMenu = () => setMobileMenuOpen(false);

  // Accessible modal focus trap, Escape key dismiss, and body scroll lock
  useFocusTrap({
    isOpen: mobileMenuOpen,
    onClose: closeMenu,
    containerRef: drawerRef,
  });

  return (
    <header className="landing-nav" role="banner">
      <div className="landing-nav-inner">
        <Link to="/welcome" className="landing-brand" aria-label="MyCoinwise Home">
          <CoinwiseBadge size={38} radius={11} variant="surface" aria-hidden="true">
            <CoinwiseMark size={22} color="#FC0100" aria-hidden="true" />
          </CoinwiseBadge>
          <span className="brand-name">MyCoinwise</span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="landing-nav-links" aria-label="Primary Navigation">
          <a href="#features">Features</a>
          <a href="#simulator">Simulator</a>
          <a href="#comparison">Why Us</a>
          <a href="#faq">FAQ</a>
        </nav>

        {/* Desktop Actions */}
        <div className="landing-nav-cta">
          <Link to="/login" className="btn-landing-glass" style={{ padding: '0.55rem 1.1rem', fontSize: '0.88rem' }}>
            Sign In
          </Link>
          <Link to="/register" className="btn-landing-primary" style={{ padding: '0.55rem 1.1rem', fontSize: '0.88rem' }}>
            Get Started <ArrowRight size={15} />
          </Link>
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
          <nav className="mobile-links" aria-label="Mobile Navigation">
            <a href="#features" onClick={closeMenu}>Features</a>
            <a href="#simulator" onClick={closeMenu}>Simulator</a>
            <a href="#comparison" onClick={closeMenu}>Why Us</a>
            <a href="#faq" onClick={closeMenu}>FAQ</a>
          </nav>
          <div className="mobile-actions">
            <Link to="/login" className="btn-landing-glass btn-block" onClick={closeMenu}>
              <LogIn size={16} /> Sign In
            </Link>
            <Link to="/register" className="btn-landing-primary btn-block" onClick={closeMenu}>
              <UserPlus size={16} /> Get Started Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
