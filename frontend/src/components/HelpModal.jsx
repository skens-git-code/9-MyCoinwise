import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, Search, X, BookOpen, ShieldCheck, Zap,
  CreditCard, Target, TrendingUp, Key, ChevronRight, MessageSquare
} from 'lucide-react';

const FAQ_ARTICLES = [
  {
    id: 'budget-method',
    category: 'Budgeting & Strategy',
    title: 'How does the 50/30/20 budget framework work?',
    content: 'The 50/30/20 rule divides your after-tax income into three buckets: 50% for Needs (rent, bills, groceries), 30% for Wants (dining, hobbies, subscriptions), and 20% for Savings & Debt Payoff (emergency funds, investments). You can track your category breakdowns directly in the Analytics tab.',
    icon: <BookOpen size={16} />
  },
  {
    id: 'savings-goals',
    category: 'Savings Goals',
    title: 'How do I fund and track savings goals?',
    content: 'Navigate to Goals and click "New Goal" to define a target amount and optional deadline. Use "Add / Remove Funds" on any goal card to record contributions. When you reach 100%, the achievement milestone and confetti celebration unlock!',
    icon: <Target size={16} />
  },
  {
    id: 'subscriptions',
    category: 'Subscriptions',
    title: 'Managing recurring bills and renewal reminders',
    content: 'The Subscriptions hub monitors all your recurring charges. You can Pause or Resume subscriptions at any time without losing historical tracking. Charges due within 3 days trigger immediate in-app warning banners.',
    icon: <CreditCard size={16} />
  },
  {
    id: 'cashflow',
    category: 'Forecasting',
    title: 'How does the 90-Day Cashflow Engine calculate projections?',
    content: 'The forecasting engine evaluates your median daily spending burn rate and adds expected recurring income, subtracting scheduled subscription renewals. The What-If Simulator lets you model hypothetical purchases and recurring expenses.',
    icon: <TrendingUp size={16} />
  },
  {
    id: 'data-privacy',
    category: 'Privacy & Security',
    title: 'How is my financial data stored and protected?',
    content: 'All passwords are salted and hashed using bcrypt. Your sessions use JSON Web Tokens (JWT) with automatic expiration and revocable session tracking. You can export complete machine-readable JSON/CSV archives or wipe your data from Settings at any time.',
    icon: <ShieldCheck size={16} />
  },
  {
    id: 'shortcuts',
    category: 'Shortcuts & Power Tools',
    title: 'Keyboard shortcuts & command palette',
    content: 'Press "Cmd+K" (or Ctrl+K) anywhere to launch the Universal Command Palette. Press "?" or "Shift+/" to open the full keyboard shortcuts cheat-sheet. Use Escape to close any open modal.',
    icon: <Key size={16} />
  }
];

export default function HelpModal({ isOpen, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedArticle, setExpandedArticle] = useState(null);

  const filteredArticles = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return FAQ_ARTICLES;
    return FAQ_ARTICLES.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q)
    );
  }, [searchTerm]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="shortcuts-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="shortcuts-modal glass help-modal-box"
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '640px' }}
        >
          {/* Header */}
          <div className="shortcuts-header">
            <div className="shortcuts-title-row">
              <HelpCircle size={22} className="shortcuts-icon text-brand" />
              <h3>Help Center & FAQ Knowledge Base</h3>
            </div>
            <button className="shortcuts-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          {/* Search Box */}
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-2)' }}>
            <div className="il-search" style={{ width: '100%' }}>
              <Search size={16} />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search knowledge base articles..."
                autoFocus
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.88rem' }}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Articles List */}
          <div className="shortcuts-body" style={{ maxHeight: '420px', padding: '16px 24px' }}>
            {filteredArticles.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p>No help articles found matching "{searchTerm}".</p>
              </div>
            ) : (
              filteredArticles.map(article => {
                const isExpanded = expandedArticle === article.id;
                return (
                  <div
                    key={article.id}
                    className="faq-article-item glass"
                    style={{
                      borderRadius: 12, padding: '12px 16px', marginBottom: 10,
                      border: '1px solid var(--glass-border)', cursor: 'pointer',
                      background: isExpanded ? 'var(--glass-card-hover)' : 'var(--glass-2)',
                      transition: 'all 0.15s ease'
                    }}
                    onClick={() => setExpandedArticle(isExpanded ? null : article.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: 'var(--brand-primary)' }}>{article.icon}</span>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                            {article.category}
                          </span>
                          <h4 style={{ margin: '2px 0 0 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {article.title}
                          </h4>
                        </div>
                      </div>
                      <ChevronRight
                        size={16}
                        style={{
                          color: 'var(--text-muted)',
                          transform: isExpanded ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.2s ease',
                          flexShrink: 0
                        }}
                      />
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <p style={{ margin: '10px 0 0 0', paddingTop: 10, borderTop: '1px solid var(--glass-border)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                            {article.content}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
