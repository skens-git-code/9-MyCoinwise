/* —————————————————————————————————————
 * Quick Action FAB
 * Floating action button that expands into a speed-dial of three
 * shortcuts: add transaction, new savings goal, and new subscription.
 *
 * Props:
 *   - onAddTransaction : optional callback fired when the user picks
 *                        "Add Transaction"; if omitted, the FAB
 *                        silently closes.
 *
 * Behavior:
 *   - Toggling the FAB opens/closes the options list with staggered
 *     animations; the trigger icon rotates 135° to become an X.
 *   - Clicking the backdrop closes the options.
 *   - Each option navigates or invokes its callback and closes the
 *     FAB.
 *   - The FAB container gets an extra class on /calculator to offset
 *     for page-specific layout.
 * ————————————————————————————————————— */

import React, { useState, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ArrowLeftRight, Target, CreditCard, X, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppContext } from '../contexts/AppContext';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function QuickActionFAB({ onAddTransaction }) {
  // ── Local open/close state ──
  const [isOpen, setIsOpen] = useState(false);

  // ── Router hooks + i18n ──
  const location = useLocation();
  const navigate = useNavigate();
  const context = useContext(AppContext);
  const t = context?.t;

  /* —————————————————————————————————————
   * Speed-Dial Actions
   * Each action closes the FAB and either fires the caller's callback
   * or navigates to a page.
   * ————————————————————————————————————— */
  const actions = [
    {
      id: 'add-tx',
      label: t?.('add_transaction') || 'Add Transaction',
      icon: ArrowLeftRight,
      color: '#059669',
      onClick: () => {
        setIsOpen(false);
        if (onAddTransaction) onAddTransaction();
      }
    },
    {
      id: 'add-goal',
      label: t?.('new_goal') || t?.('create_goal') || 'New Savings Goal',
      icon: Target,
      color: '#0ea5e9',
      onClick: () => {
        setIsOpen(false);
        navigate('/goals');
      }
    },
    {
      id: 'add-sub',
      label: t?.('add_subscription') || t?.('add_subscription_btn') || 'New Subscription',
      icon: CreditCard,
      color: '#8b5cf6',
      onClick: () => {
        setIsOpen(false);
        navigate('/subscriptions');
      }
    }
  ];

  return (
    // ── Container: adds a calculator-specific class when on /calculator ──
    <div className={`fab-container ${location.pathname === '/calculator' ? 'fab-container-calculator' : ''}`}>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* ── Backdrop: click to close ── */}
            <motion.div
              className="fab-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            {/* ── Speed-dial options, staggered by index ── */}
            <div className="fab-options">
              {actions.map((act, idx) => {
                const Icon = act.icon;
                return (
                  <motion.div
                    key={act.id}
                    className="fab-option-row"
                    initial={{ opacity: 0, y: 15, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.8 }}
                    transition={{ delay: idx * 0.04 }}
                  >
                    {/* [AUDIT] Made label clickable to prevent unresponsive click behavior when clicking text */}
                    {/* ── Clickable label ── */}
                    <span
                      className="fab-option-label"
                      onClick={act.onClick}
                      style={{ cursor: 'pointer' }}
                    >
                      {act.label}
                    </span>

                    {/* ── Action button ── */}
                    <button
                      className="fab-option-btn"
                      style={{ background: act.color }}
                      onClick={act.onClick}
                      aria-label={act.label}
                    >
                      <Icon size={18} />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </AnimatePresence>

      
      <motion.button
        className={`fab-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label={t?.('quick_actions') || 'Quick Actions Menu'}
        aria-expanded={isOpen}
        style={{
          padding: 0,
          margin: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 0,
          boxSizing: 'border-box'
        }}
      >
        {/* ── Inner icon wrapper: rotation + centering ── */}
        <motion.div
          className="fab-trigger-icon"
          animate={{ rotate: isOpen ? 135 : 0 }}
          transition={{ duration: 0.2 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            lineHeight: 0,
            transformOrigin: 'center center'
          }}
        >
          {isOpen ? <X size={24} style={{ display: 'block', margin: 'auto' }} /> : <Plus size={24} style={{ display: 'block', margin: 'auto' }} />}
        </motion.div>
      </motion.button>
    </div>
  );
}