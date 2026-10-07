import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, ShieldCheck, X, Check, Ban } from 'lucide-react';
import Modal from './Modal';
import {
  getCookieConsent,
  setCookieConsent,
  isDoNotTrack,
} from '../services/clarity';

/**
 * Cookie Preferences Modal
 * Built with the standard MyCoinwise Modal component for consistent
 * focus management, portal rendering, accessibility, and animations.
 */
export function CookiePreferencesModal({ isOpen, onClose }) {
  const [currentConsent, setCurrentConsent] = useState(() => getCookieConsent());
  const [dntActive, setDntActive] = useState(() => isDoNotTrack());

  useEffect(() => {
    if (isOpen) {
      setCurrentConsent(getCookieConsent());
      setDntActive(isDoNotTrack());
    }
  }, [isOpen]);

  const handleSelect = (choice) => {
    setCookieConsent(choice);
    setCurrentConsent(choice);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cookie & Privacy Preferences"
    >
      <div className="cookie-preferences-content" style={{ color: 'var(--text-primary, #f1f5f9)' }}>
        {/* DNT Notice */}
        {dntActive && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              marginBottom: '16px',
              fontSize: '0.85rem',
              color: 'var(--brand-secondary, #38bdf8)',
              lineHeight: 1.5,
            }}
          >
            <strong>Do Not Track is enabled</strong> in your browser. Microsoft Clarity analytics will never be loaded, regardless of your consent selection below.
          </div>
        )}

        {/* Preferences List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          {/* Necessary Cookies */}
          <div
            style={{
              padding: '16px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} color="var(--success, #10b981)" />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Strictly Necessary</span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--success, #10b981)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Always Active
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5 }}>
              Required for security, user authentication sessions, localized language settings, and interface theme persistence.
            </p>
          </div>

          {/* Microsoft Clarity Analytics */}
          <div
            style={{
              padding: '16px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cookie size={18} color="var(--brand-secondary, #38bdf8)" />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Analytics & Usability (Microsoft Clarity)</span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: currentConsent === 'accepted' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: currentConsent === 'accepted' ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)',
                }}
              >
                {currentConsent === 'accepted' ? 'Active' : 'Blocked'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5 }}>
              Collects anonymous session metrics, aggregated clicks, and interface heatmaps to detect bugs and optimize user flows. All personal financial records, passwords, and user details are strictly masked. Zero personal data is sold.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            type="button"
            onClick={() => handleSelect('rejected')}
            className="btn-secondary cookie-modal-reject-btn"
            aria-label="Reject analytics cookies"
            style={{
              minHeight: '44px',
              padding: '0 18px',
              fontSize: '0.9rem',
              fontWeight: 600,
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Ban size={16} />
            Reject Non-Essential
          </button>
          <button
            type="button"
            onClick={() => handleSelect('accepted')}
            className="btn-primary cookie-modal-accept-btn"
            aria-label="Accept all cookies and analytics"
            style={{
              minHeight: '44px',
              padding: '0 20px',
              fontSize: '0.9rem',
              fontWeight: 600,
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Check size={16} />
            Accept All
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Cookie Banner Component
 * Fixed dismissible banner shown on first visit until user decides.
 */
export default function CookieBanner() {
  const [consent, setConsent] = useState(() => getCookieConsent());
  const [isDismissed, setIsDismissed] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [hasMobileDock, setHasMobileDock] = useState(false);

  // Synchronize with external changes or global open modal requests
  useEffect(() => {
    const handleConsentChange = (e) => {
      setConsent(e.detail?.status || getCookieConsent());
    };

    const handleOpenModal = () => {
      setShowPreferencesModal(true);
    };

    window.addEventListener('cookie-consent-changed', handleConsentChange);
    window.addEventListener('open-cookie-preferences', handleOpenModal);

    return () => {
      window.removeEventListener('cookie-consent-changed', handleConsentChange);
      window.removeEventListener('open-cookie-preferences', handleOpenModal);
    };
  }, []);

  // Check whether the mobile dock is rendered in the DOM to avoid overlapping it
  useEffect(() => {
    const checkDock = () => {
      if (typeof document === 'undefined') return;
      const dock = document.querySelector('.mobile-bottom-dock');
      const isVisible = dock && window.getComputedStyle(dock).display !== 'none';
      setHasMobileDock(Boolean(isVisible));
    };

    checkDock();
    const timer = setInterval(checkDock, 1000);
    window.addEventListener('resize', checkDock);

    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', checkDock);
    };
  }, []);

  const handleAccept = useCallback(() => {
    setCookieConsent('accepted');
    setConsent('accepted');
  }, []);

  const handleReject = useCallback(() => {
    setCookieConsent('rejected');
    setConsent('rejected');
  }, []);

  const handleDismiss = useCallback(() => {
    // Dismisses banner for the current browser session without granting consent
    setIsDismissed(true);
  }, []);

  // Only display the banner on first visit when consent is undecided and not dismissed
  const showBanner = consent === null && !isDismissed;

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            role="region"
            aria-label="Cookie consent banner"
            className="cookie-consent-banner"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            style={{
              position: 'fixed',
              zIndex: 9999,
              right: '16px',
              left: '16px',
              maxWidth: '460px',
              marginLeft: 'auto',
              bottom: hasMobileDock
                ? 'calc(88px + env(safe-area-inset-bottom, 0px))'
                : 'calc(16px + env(safe-area-inset-bottom, 0px))',
              background: 'var(--card-bg, rgba(16, 22, 38, 0.94))',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.12))',
              borderRadius: '16px',
              padding: '16px 18px',
              color: 'var(--text-primary, #f1f5f9)',
              boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            }}
          >
            {/* Top row: Icon + Title + Dismiss Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cookie size={18} color="var(--brand-secondary, #38bdf8)" aria-hidden="true" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                  Privacy & Cookie Preferences
                </span>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss cookie notice for now"
                className="cookie-banner-dismiss"
                style={{
                  width: '44px',
                  height: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary, #94a3b8)',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  marginRight: '-8px',
                  marginTop: '-8px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Description */}
            <p
              style={{
                fontSize: '0.84rem',
                color: 'var(--text-secondary, #94a3b8)',
                lineHeight: 1.5,
                margin: '0 0 14px',
              }}
            >
              We use privacy-friendly Microsoft Clarity analytics to understand app performance and eliminate glitches. Your financial data and passwords are strictly masked.
            </p>

            {/* Actions Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <button
                type="button"
                onClick={() => setShowPreferencesModal(true)}
                className="cookie-banner-prefs-link"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 0',
                  color: 'var(--brand-secondary, #38bdf8)',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                Preferences
              </button>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleReject}
                  aria-label="Reject analytics cookies"
                  className="btn-secondary cookie-btn-reject"
                  style={{
                    minWidth: '88px',
                    minHeight: '44px',
                    padding: '0 14px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  aria-label="Accept cookies and analytics"
                  className="btn-primary cookie-btn-accept"
                  style={{
                    minWidth: '92px',
                    minHeight: '44px',
                    padding: '0 16px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  Accept
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preferences Modal (invoked from link in banner, footer, or settings) */}
      <CookiePreferencesModal
        isOpen={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
      />
    </>
  );
}
