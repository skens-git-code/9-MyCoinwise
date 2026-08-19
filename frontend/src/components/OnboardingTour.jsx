import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Search, PlusCircle, Target, TrendingUp,
  X, ChevronRight, Check, ArrowRight
} from 'lucide-react';

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

export default function OnboardingTour({ isOpen, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('mcw-onboarding-completed', 'true');
      onClose();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('mcw-onboarding-completed', 'true');
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="shortcuts-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleSkip}
      >
        <motion.div
          className="shortcuts-modal glass onboarding-tour-card"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '480px', padding: 0, overflow: 'hidden' }}
        >
          {/* Top Illustration Area */}
          <div style={{
            padding: '32px 24px 20px',
            background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.12) 0%, rgba(14, 165, 233, 0.08) 100%)',
            textAlign: 'center',
            borderBottom: '1px solid var(--glass-border)',
            position: 'relative'
          }}>
            <button
              onClick={handleSkip}
              style={{
                position: 'absolute', top: 14, right: 14, background: 'none', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer', padding: 4
              }}
            >
              <X size={16} />
            </button>

            <div style={{
              width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px',
              background: 'var(--glass-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--glass-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
            }}>
              {step.icon}
            </div>

            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {step.title}
            </h3>
          </div>

          {/* Body Content */}
          <div style={{ padding: '24px' }}>
            <p style={{ margin: '0 0 24px', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, textAlign: 'center' }}>
              {step.description}
            </p>

            {/* Step Dots */}
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

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <button
                className="btn-secondary"
                onClick={handleSkip}
                style={{ fontSize: '0.82rem', padding: '8px 14px' }}
              >
                Skip Tour
              </button>

              <button
                className="btn-primary"
                onClick={handleNext}
                style={{ fontSize: '0.85rem', padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {step.actionText} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
