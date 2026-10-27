import React, { useState, useId } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, ArrowRight, Shield, Zap, TrendingUp, Wallet, CheckCircle2, Bot, SlidersHorizontal, Activity } from 'lucide-react';

export default function HeroSection() {
  const prefersReduced = useReducedMotion();
  const rawId = useId().replace(/:/g, '');
  const heroGradId = `heroGrad-${rawId}`;
  const [activeTab, setActiveTab] = useState('cockpit'); // 'cockpit' | 'radar' | 'tax'

  return (
    <section className="landing-hero" aria-labelledby="hero-heading">
      {/* Left Column: Heading & Value Proposition */}
      <motion.div
        className="hero-content"
        initial={prefersReduced ? false : { opacity: 0, y: 24 }}
        animate={prefersReduced ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="hero-pill-badge">
          <Sparkles size={14} className="sparkle-icon" />
          <span>The Modern Financial OS for High Achievers</span>
        </div>

        <h1 id="hero-heading" className="hero-title">
          Master Your Money.{' '}
          <span className="gradient-accent">Eliminate Financial Chaos.</span>
        </h1>

        <p className="hero-subhead">
          Personal wealth telemetry, intelligent cashflow forecasting, automated budget tracking,
          and dual tax regime planning — engineered for people who value absolute financial clarity.
        </p>

        <div className="hero-actions">
          <Link to="/register" className="btn-landing-primary" id="landing-hero-cta-register">
            <span>Get Started Free</span>
            <ArrowRight size={17} />
          </Link>
          <Link to="/login" className="btn-landing-glass" id="landing-hero-cta-login">
            <span>Explore Your Workspace</span>
          </Link>
        </div>

        {/* Social Proof / Trust Metrics */}
        <div className="hero-trust-row" aria-label="Key statistics">
          <div className="trust-stat">
            <strong>Sub-100ms</strong>
            <span>Local Latency</span>
          </div>
          <div className="trust-stat">
            <strong>100%</strong>
            <span>Data Ownership</span>
          </div>
          <div className="trust-stat">
            <strong>Zero</strong>
            <span>Ad Tracking</span>
          </div>
        </div>
      </motion.div>

      {/* Right Column: Dynamic Floating Mockup */}
      <motion.div
        className="hero-mockup-wrapper"
        initial={prefersReduced ? false : { opacity: 0, scale: 0.95 }}
        animate={prefersReduced ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden="true"
      >
        <div className="hero-card-base">
          {/* Interactive Mockup Switcher Tabs */}
          <div className="mockup-tab-switcher">
            <button
              type="button"
              className={`mockup-tab-btn ${activeTab === 'cockpit' ? 'active' : ''}`}
              onClick={() => setActiveTab('cockpit')}
              tabIndex={-1}
            >
              <Activity size={13} />
              <span>Cockpit</span>
            </button>
            <button
              type="button"
              className={`mockup-tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
              onClick={() => setActiveTab('radar')}
              tabIndex={-1}
            >
              <Bot size={13} />
              <span>Cashflow Radar</span>
            </button>
            <button
              type="button"
              className={`mockup-tab-btn ${activeTab === 'tax' ? 'active' : ''}`}
              onClick={() => setActiveTab('tax')}
              tabIndex={-1}
            >
              <SlidersHorizontal size={13} />
              <span>Tax Shield</span>
            </button>
          </div>

          {activeTab === 'cockpit' && (
            <>
              <div className="mockup-header">
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
                    PORTFOLIO OVERVIEW
                  </span>
                  <strong style={{ display: 'block', fontSize: '1rem', color: '#ffffff' }}>Total Net Worth</strong>
                </div>
                <span className="mockup-chip">+18.4% YTD</span>
              </div>

              <div className="mockup-balance">
                <span>Aggregated Liquidity & Assets</span>
                <strong>₹42,85,920.00</strong>
              </div>

              {/* Simulated Sparkline Curve */}
              <div className="mockup-chart-curve">
                <svg viewBox="0 0 300 90" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={heroGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 0,75 Q 40,55 80,62 T 160,40 T 220,48 T 300,15 L 300,90 L 0,90 Z"
                    fill={`url(#${heroGradId})`}
                  />
                  <path
                    d="M 0,75 Q 40,55 80,62 T 160,40 T 220,48 T 300,15"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {/* Recent Mock Transactions */}
              <div className="mockup-tx-list">
                <div className="mockup-tx-item">
                  <div className="tx-left">
                    <span className="tx-badge-dot" style={{ background: '#10b981' }} />
                    <span>Dividend Yield (Index Fund)</span>
                  </div>
                  <span className="amount-plus">+₹14,500</span>
                </div>
                <div className="mockup-tx-item">
                  <div className="tx-left">
                    <span className="tx-badge-dot" style={{ background: '#38bdf8' }} />
                    <span>Smart Budget: Cloud Server</span>
                  </div>
                  <span className="amount-minus">−₹3,200</span>
                </div>
              </div>
            </>
          )}

          {activeTab === 'radar' && (
            <div className="mockup-view-radar">
              <div className="mockup-header">
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>
                    CASHFLOW RADAR ENGINE
                  </span>
                  <strong style={{ display: 'block', fontSize: '1rem', color: '#ffffff' }}>90-Day Cashflow Runway</strong>
                </div>
                <span className="mockup-chip" style={{ background: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8' }}>
                  Optimal Safe
                </span>
              </div>

              <div className="radar-insight-box">
                <p>
                  <strong>✨ Proactive Surplus Detection:</strong> On Day 22, an estimated surplus of ₹24,500 will unlock without breaching your emergency reserve.
                </p>
              </div>

              <div className="mockup-tx-list">
                <div className="mockup-tx-item">
                  <div className="tx-left">
                    <span className="tx-badge-dot" style={{ background: '#38bdf8' }} />
                    <span>Projected Cash Buffer</span>
                  </div>
                  <span className="amount-plus">₹1,85,000</span>
                </div>
                <div className="mockup-tx-item">
                  <div className="tx-left">
                    <span className="tx-badge-dot" style={{ background: '#f59e0b' }} />
                    <span>Auto-Sweep Allocation</span>
                  </div>
                  <span style={{ color: '#f8fafc', fontWeight: 600 }}>To Wealth (55%)</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tax' && (
            <div className="mockup-view-tax">
              <div className="mockup-header">
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                    REGIME OPTIMIZER
                  </span>
                  <strong style={{ display: 'block', fontSize: '1rem', color: '#ffffff' }}>Union Budget FY 2024-25</strong>
                </div>
                <span className="mockup-chip" style={{ background: 'rgba(16, 185, 129, 0.18)', color: '#10b981' }}>
                  Save ₹28,400
                </span>
              </div>

              <div className="tax-comparison-bars">
                <div className="tax-bar-row">
                  <div className="bar-label">
                    <span>New Tax Regime</span>
                    <strong>₹1,12,000 Tax</strong>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill new-regime" style={{ width: '60%' }} />
                  </div>
                </div>
                <div className="tax-bar-row">
                  <div className="bar-label">
                    <span>Old Regime (80C/80D)</span>
                    <strong>₹1,40,400 Tax</strong>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill old-regime" style={{ width: '75%' }} />
                  </div>
                </div>
              </div>

              <div className="mockup-tx-item" style={{ marginTop: '0.75rem' }}>
                <div className="tx-left">
                  <span className="tx-badge-dot" style={{ background: '#10b981' }} />
                  <span>Recommendation</span>
                </div>
                <span className="amount-plus">Adopt New Regime</span>
              </div>
            </div>
          )}
        </div>

        {/* Orbiting Badge 1: Top Right */}
        <div className="floating-badge-card top-right">
          <div className="badge-icon" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
            <Zap size={18} />
          </div>
          <div>
            <strong style={{ display: 'block', color: '#ffffff' }}>Forecast Engine</strong>
            <span style={{ color: '#10b981', fontWeight: 600 }}>90-Day Runway Safe</span>
          </div>
        </div>

        {/* Orbiting Badge 2: Bottom Left */}
        <div className="floating-badge-card bottom-left">
          <div className="badge-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <Shield size={18} />
          </div>
          <div>
            <strong style={{ display: 'block', color: '#ffffff' }}>Bank-Grade Security</strong>
            <span style={{ color: 'var(--text-muted, #94a3b8)' }}>AES-256 Encrypted</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
