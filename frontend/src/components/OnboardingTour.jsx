/* —————————————————————————————————————
 * Onboarding Tour Component
 * Step-by-step modal that introduces the app's key features to
 * first-time users and marks onboarding complete in localStorage.
 *
 * Props:
 *   - isOpen  : controls visibility.
 *   - onClose : callback fired when the tour finishes or is skipped.
 *
 * Behavior:
 *   - Steps are defined in the STEPS array (title, description, icon,
 *     action text).
 *   - The current step is tracked in local state.
 *   - "Next" advances the step; on the last step it marks
 *     'mcw-onboarding-completed' in localStorage and closes.
 *   - "Skip" (button, X icon, or backdrop click) also marks onboarding
 *     complete and closes.
 *   - Step dots below the body indicate progress.
 * ————————————————————————————————————— */

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  Sparkles, Search, PlusCircle, TrendingUp,
  X, ArrowRight
} from 'lucide-react';

/* —————————————————————————————————————
 * Tour Steps
 * Ordered list of the steps shown in the tour. Each step has a title,
 * description, icon, and CTA text.
 * ————————————————————————————————————— */
const STEPS = [
  {
    title: 'Welcome to MyCoinwise 🚀',
    description: 'Your next-generation personal finance command center. Track spending, conquer savings targets, and forecast liquidity with AI precision.',
    icon: <Sparkles size={32} className="text-brand" />,
    actionText: 'Get Started'
  },
  {
    title: 'Universal Search & Command Palette 🔍',
    description: 'Press Cmd+K (or Ctrl+K) anywhere to quickly search across transactions, savings goals, subscriptions, and navigation pages.',
    icon: <Search size={32} style={{ color: '#0ea5e9' }} />,
    actionText: 'Next: Quick Actions'
  },
  {
    title: '1-Tap Quick Action Speed-Dial',
    description: 'Use the floating action button at the bottom-right of your screen anytime to record new expenses, fund savings goals, or add subscriptions in 1 tap.',
    icon: <PlusCircle size={32} className="text-success" />,
    actionText: 'Next: Goals & Cashflow'
  },
  {
    title: 'Goals, Subscriptions & 90-Day Cashflow 🎯',
    description: 'Create multi-category savings targets, monitor upcoming bill renewals, and test hypothetical purchases in the 90-day predictive Cashflow simulator.',
    icon: <TrendingUp size={32} style={{ color: '#8b5cf6' }} />,
    actionText: 'Finish Tour'
  }
];

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function OnboardingTour({ isOpen, onClose }) {
  // ── Panel ref for the shared focus trap (declared before any early return) ──
  const cardRef = useRef(null);

  useFocusTrap({ isOpen, onClose: () => handleSkipRef.current?.(), containerRef: cardRef });
  // ── Currently displayed step index ──
  const [currentStep, setCurrentStep] = useState(0);

  // ── SSR guard ──
  if (typeof document === 'undefined') return null;

  const step = STEPS[currentStep] || STEPS[0];
  const isLast = currentStep === STEPS.length - 1;

  // ── Advance to the next step, or finish the tour on the last step ──
  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('mcw-onboarding-completed', 'true');
      onClose();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  // ── Skip the tour from any step and mark completion ──
  const handleSkip = () => {
    localStorage.setItem('mcw-onboarding-completed', 'true');
    onClose();
  };

  // Escape must go through the same "skip" path so completion is recorded the
  // same way; a ref keeps the focus-trap callback above stable.
  const handleSkipRef = useRef(handleSkip);
  handleSkipRef.current = handleSkip;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        /* ── Backdrop ──
           Clicking the backdrop no longer skips the tour. `handleSkip` writes
           `mcw-onboarding-completed` permanently, so a single stray tap (a
           mis-tap on a phone, or an outside click while reaching for Next)
           silently disabled onboarding forever. There are two explicit controls
           — the X button and the "Skip Tour" button — so the destructive action
           now requires an intentional tap. */
        <motion.div
          className="shortcuts-backdrop onboarding-tour-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden="true"
          style={{
            zIndex: 'var(--z-onboarding, 1100)',
            position: 'fixed',
            inset: 0
          }}
        >
          {/* ── Tour card ── */}
          <motion.div
            ref={cardRef}
            tabIndex={-1}
            className="shortcuts-modal glass onboarding-tour-card"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-tour-title"
            style={{
              maxWidth: 'min(480px, calc(100vw - 32px))',
              maxHeight: 'min(580px, calc(100dvh - 32px))',
              padding: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              zIndex: 'var(--z-onboarding, 1100)'
            }}
          >
            {/* ── Top illustration area ── */}
            <div style={{
              padding: '24px 20px 16px',
              background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.12) 0%, rgba(14, 165, 233, 0.08) 100%)',
              textAlign: 'center',
              borderBottom: '1px solid var(--glass-border)',
              position: 'relative',
              flexShrink: 0
            }}>
              {/* ── Close (X) button ── */}
              <button
                type="button"
                onClick={handleSkip}
                style={{
                  position: 'absolute', top: 12, right: 12, background: 'none', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer', padding: 6, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px'
                }}
                aria-label="Skip tour"
              >
                <X size={18} />
              </button>

              {/* ── Step icon badge ── */}
              <div style={{
                width: 56, height: 56, borderRadius: 18, margin: '0 auto 12px',
                background: 'var(--glass-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--glass-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
              }}>
                {step.icon}
              </div>

              {/* ── Step title ── */}
              <h3 id="onboarding-tour-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {step.title}
              </h3>
            </div>

            {/* ── Body content (scrollable on ultra-short screens) ── */}
            <div style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* ── Step description ── */}
              <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.55, textAlign: 'center' }}>
                {step.description}
              </p>

              {/* ── Step dots (current step is wider and full-opacity) ── */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
                {STEPS.map((_, idx) => (
                  <span
                    key={idx}
                    style={{
                      width: idx === currentStep ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: idx === currentStep ? 'var(--brand-primary)' : 'var(--text-muted)',
                      opacity: idx === currentStep ? 1 : 0.3,
                      transition: 'all 0.25s ease'
                    }}
                  />
                ))}
              </div>

              {/* ── Actions: skip and next ── */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 'auto'
              }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSkip}
                  style={{ fontSize: '0.84rem', padding: '10px 16px', minHeight: '40px' }}
                >
                  Skip Tour
                </button>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleNext}
                  style={{
                    fontSize: '0.86rem',
                    padding: '10px 18px',
                    minHeight: '40px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {step.actionText} <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}