import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown, HelpCircle, MessageSquare, ShieldCheck, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

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

  const handleFilterChange = (cat) => {
    setCategoryFilter(cat);
    setOpenQuestion(null);
  };

  const filteredItems = useMemo(() => {
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
    <section id="faq" className="landing-faq" aria-labelledby="faq-heading">
      <div className="landing-container">
        <div className="section-header">
          <span className="section-pill">Got Questions?</span>
          <h2 id="faq-heading">Frequently Asked Questions</h2>
          <p>
            Everything you need to know about setting up your finances with MyCoinwise.
          </p>

          {/* Category Tabs */}
          <div className="faq-category-pills" role="radiogroup" aria-label="Filter FAQ topics">
            {['All', 'Security', 'Tax & Budgets'].map((cat) => (
              <button
                key={cat}
                type="button"
                role="radio"
                aria-checked={categoryFilter === cat}
                onClick={() => handleFilterChange(cat)}
                className={`filter-btn ${categoryFilter === cat ? 'active' : ''}`}
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
                  <span className="question-text">{item.question}</span>
                  <span className="chevron-pill">
                    <ChevronDown
                      className={`faq-chevron ${isOpen ? 'rotate' : ''}`}
                      aria-hidden="true"
                      size={18}
                    />
                  </span>
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
                      transition={{ duration: prefersReduced ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
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

        {/* Quick Help Card */}
        <div className="faq-support-strip">
          <div className="strip-left">
            <MessageSquare size={18} className="text-emerald" aria-hidden="true" />
            <div>
              <strong>Have a tailored wealth scenario or migration query?</strong>
              <p>Explore our transparent privacy manifesto and user guides.</p>
            </div>
          </div>
          <Link to="/about" className="btn-landing-glass" style={{ padding: '0.45rem 1rem', fontSize: '0.84rem' }}>
            <span>Learn More About Us</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
