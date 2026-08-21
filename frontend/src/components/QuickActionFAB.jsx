import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ArrowLeftRight, Target, CreditCard, X, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function QuickActionFAB({ onAddTransaction }) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const actions = [
    {
      id: 'add-tx',
      label: 'Add Transaction',
      icon: ArrowLeftRight,
      color: '#059669',
      onClick: () => {
        setIsOpen(false);
        if (onAddTransaction) onAddTransaction();
      }
    },
    {
      id: 'add-goal',
      label: 'New Savings Goal',
      icon: Target,
      color: '#0ea5e9',
      onClick: () => {
        setIsOpen(false);
        navigate('/goals');
      }
    },
    {
      id: 'add-sub',
      label: 'New Subscription',
      icon: CreditCard,
      color: '#8b5cf6',
      onClick: () => {
        setIsOpen(false);
        navigate('/subscriptions');
      }
    }
  ];

  return (
    <div className={`fab-container ${location.pathname === '/calculator' ? 'fab-container-calculator' : ''}`}>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fab-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />
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
                    <span className="fab-option-label">{act.label}</span>
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
        aria-label="Quick Actions Menu"
        aria-expanded={isOpen}
      >
        <motion.div animate={{ rotate: isOpen ? 135 : 0 }} transition={{ duration: 0.2 }}>
          {isOpen ? <X size={24} /> : <Plus size={24} />}
        </motion.div>
      </motion.button>
    </div>
  );
}
