import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const FAQ_ITEMS = [
  {
    category: 'General',
    question: 'Is MyCoinwise free to use?',
    answer: 'Yes! MyCoinwise offers a comprehensive, zero-cost core tier that includes up to 1,000 transaction log entries, budget tracking with rollover, subscription tracking, and our dual tax regime comparator. No surprise paywalls.'
  },
  {
    category: 'Security',
    question: 'How is my financial data protected?',
    answer: 'Your passwords and sensitive tokens are encrypted using Bcrypt (cost 12) and protected by salted hashes. All client-server traffic is forced over HTTPS/TLS, and JWT tokens are securely scoped with automatic expiration. We never sell or broker your telemetry to third-party ad networks.'
  },
  {
    category: 'Tax',
    question: 'Does the Tax Center support the latest Union Budget updates (FY 2024-25)?',
    answer: 'Absolutely. The Tax Center computes both the revised New Regime slab structure (with the increased standard deduction and updated 87A rebate thresholds) as well as the Old Tax Regime with itemized Chapter VI-A deductions (80C, 80D, NPS, Home Loan Interest) so you can make data-driven tax declarations.'
  },
  {
    category: 'Export',
    question: 'Can I export my transactions for tax filings or accountants?',
    answer: 'Yes. You can export complete, filtered audit trails of your transactions, income categorizations, and expense histories to standard CSV and JSON formats at any time from your settings or analytics panels.'
  },
  {
    category: 'Budgets',
    question: 'Can I link transactions directly to budgets and wealth categories?',
    answer: 'Yes! When adding or editing a transaction, you can explicitly designate whether it draws from a monthly spending budget (like Transport, Dining, Utilities) or routes directly into Wealth, Investments, or Subscriptions without corrupting your discretionary budgets.'
  }
];

export default function FaqSection() {
  const prefersReduced = useReducedMotion();
  const [openQuestion, setOpenQuestion] = useState(FAQ_ITEMS[0].question);
  const [categoryFilter, setCategoryFilter] = useState('All');

  const filteredItems = React.useMemo(() => {
    if (categoryFilter === 'Security') {
      return FAQ_ITEMS.filter((item) => item.category === 'Security');
    }
    if (categoryFilter === 'Tax & Budgets') {
      return FAQ_ITEMS.filter((item) => ['Tax', 'Budgets', 'Export'].includes(item.category));
    }
    return FAQ_ITEMS;
  }, [categoryFilter]);

  const toggle = (question) => {
    setOpenQuestion((prev) => (prev === question ? null : question));
  };

  return (
    <section id="faq" className="landing-faq">
      <div className="landing-container">
        <div className="section-header">
          <span className="section-pill">Got Questions?</span>
          <h2>Frequently Asked Questions</h2>
          <p>
            Everything you need to know about setting up your finances with MyCoinwise.
          </p>

          {/* Category Tabs */}
          <div className="faq-category-pills" style={{ display: 'inline-flex', gap: 8, marginTop: '1.25rem', background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)' }}>
            {['All', 'Security', 'Tax & Budgets'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  background: categoryFilter === cat ? '#10b981' : 'transparent',
                  color: categoryFilter === cat ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.2s ease'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="faq-list">
          {filteredItems.map((item, idx) => {
            const isOpen = openQuestion === item.question;
            const contentId = `faq-content-${idx}`;
            const headerId = `faq-header-${idx}`;

            return (
              <div 
                key={item.question} 
                className={`faq-item ${isOpen ? 'active' : ''}`}
              >
                <button
                  type="button"
                  id={headerId}
                  className="faq-question"
                  onClick={() => toggle(item.question)}
                  aria-expanded={isOpen}
                  aria-controls={contentId}
                >
                  <span>{item.question}</span>
                  <ChevronDown 
                    className={`faq-chevron ${isOpen ? 'rotate' : ''}`} 
                    aria-hidden="true" 
                    size={18}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={contentId}
                      role="region"
                      aria-labelledby={headerId}
                      className="faq-answer-wrapper"
                      initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={{ duration: prefersReduced ? 0 : 0.3, ease: 'easeInOut' }}
                    >
                      <div className="faq-answer">
                        <p>{item.answer}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
