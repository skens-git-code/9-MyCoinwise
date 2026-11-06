import React, { useState, useId, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  Shield,
  Zap,
  TrendingUp,
  Activity,
  Bot,
  SlidersHorizontal,
  Lock,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import LivingLedger from './LivingLedger';

export default function HeroSection() {
  const prefersReduced = useReducedMotion();
  const rawId = useId().replace(/:/g, '');
  const heroGradId = `heroGrad-${rawId}`;
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' | 'cockpit' | 'radar' | 'tax'
  const [hasVisited] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const visited = Boolean(localStorage.getItem('mcw_has_visited'));
      if (!visited) {
        localStorage.setItem('mcw_has_visited', 'true');
      }
      return visited;
    } catch {
      return false;
    }
  });
  const cardRef = useRef(null);
  const rafRef = useRef(null);
  const magneticBtnRef = useRef(null);

  // Subtle interactive 3D perspective tilt on desktop pointer move
  // Direct DOM manipulation throttled by requestAnimationFrame to avoid re-rendering entire tree
  const handleMouseMove = (e) => {
    if (prefersReduced || window.innerWidth < 1024) return;
    if (!cardRef.current) return;
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = clientX - rect.left - rect.width / 2;
      const y = clientY - rect.top - rect.height / 2;
      const rotateX = (-y / (rect.height / 2)) * 5;
      const rotateY = (x / (rect.width / 2)) * 5;
      cardRef.current.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
      cardRef.current.style.transition = 'transform 0.1s ease-out';
    });
  };

  const handleMouseLeave = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!cardRef.current) return;
    cardRef.current.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateY(0px)';
    cardRef.current.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
  };

  // Magnetic attraction effect on primary CTA button
  const handleCtaMouseMove = (e) => {
    if (prefersReduced || window.innerWidth < 1024) return;
    const btn = magneticBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const btnCenterX = rect.left + rect.width / 2;
    const btnCenterY = rect.top + rect.height / 2;
    const dist = Math.hypot(e.clientX - btnCenterX, e.clientY - btnCenterY);
    if (dist < 90) {
      const offsetX = (e.clientX - btnCenterX) * 0.18;
      const offsetY = (e.clientY - btnCenterY) * 0.18;
      btn.style.transform = `translate3d(${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px, 0)`;
      btn.style.transition = 'transform 0.1s ease-out';
    } else {
      btn.style.transform = 'translate3d(0, 0, 0)';
      btn.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
    }
  };

  const handleCtaMouseLeave = () => {
    const btn = magneticBtnRef.current;
    if (!btn) return;
    btn.style.transform = 'translate3d(0, 0, 0)';
    btn.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

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
          <span className="pill-pulse-dot" aria-hidden="true" />
          <Sparkles size={14} className="sparkle-icon" aria-hidden="true" />
          <span>
            {hasVisited
              ? 'Welcome back · Your Financial OS is Ready'
              : 'The Modern Financial OS for High Achievers'}
          </span>
        </div>

        <h1 id="hero-heading" className="hero-title">
          <motion.span
            className="hero-phrase hero-phrase-main"
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }
            }
          >
            Master Your Money.{' '}
          </motion.span>
          <motion.span
            className="gradient-accent hero-phrase hero-phrase-accent"
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { duration: 0.5, delay: 0.28, ease: [0.16, 1, 0.3, 1] }
            }
          >
            Eliminate Financial Chaos.
          </motion.span>
        </h1>

        <p className="hero-subhead">
          Built for high achievers: master your budgets, optimize your taxes,
          and forecast your wealth — all in one secure, ad-free workspace.
        </p>

        <div className="hero-actions" onMouseMove={handleCtaMouseMove} onMouseLeave={handleCtaMouseLeave}>
          <Link
            to="/register"
            ref={magneticBtnRef}
            className="btn-landing-primary btn-lg"
            id="landing-hero-cta-register"
          >
            <span>Get Started Free</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link to="/login" className="btn-landing-glass btn-lg" id="landing-hero-cta-login">
            <span>Explore Your Workspace</span>
          </Link>
        </div>

        {/* Social Proof Community */}
        <div className="hero-social-proof">
          <div className="hero-avatar-stack" aria-hidden="true">
            <span className="hero-avatar avatar-1">👨‍💼</span>
            <span className="hero-avatar avatar-2">👩‍💻</span>
            <span className="hero-avatar avatar-3">👨‍🔬</span>
            <span className="hero-avatar avatar-4">👩‍🚀</span>
          </div>
          <div className="hero-social-proof-text">
            <strong>Join 5,000+ users</strong> mastering their wealth with zero financial chaos.
          </div>
        </div>

        {/* Transparent Pricing & Trust Guarantee */}
        <div className="hero-pricing-guarantee">
          <ShieldCheck size={14} className="text-emerald" aria-hidden="true" />
          <span>Free core tier forever · No credit card required · Zero hidden charges</span>
        </div>

        {/* Live Feature Highlights Tags with distinct pill styling */}
        <div className="hero-feature-tags" aria-label="Feature Highlights">
          <div className="hero-tag-item">
            <CheckCircle2 size={14} className="text-emerald" aria-hidden="true" />
            <span>Budget Rollover Engine</span>
          </div>
          <div className="hero-tag-item">
            <CheckCircle2 size={14} className="text-emerald" aria-hidden="true" />
            <span>Dual Tax Regime FY 24-25</span>
          </div>
          <div className="hero-tag-item">
            <CheckCircle2 size={14} className="text-emerald" aria-hidden="true" />
            <span>Zero Ad Telemetry</span>
          </div>
        </div>

        {/* Social Proof / Trust Metrics */}
        <div className="hero-trust-row" aria-label="Key statistics">
          <div className="trust-stat">
            <div className="trust-number-wrap">
              <strong>Sub-100ms</strong>
              <span className="trust-dot-live" aria-hidden="true" />
            </div>
            <span>Local Latency</span>
          </div>
          <div className="trust-stat">
            <div className="trust-number-wrap">
              <strong>100%</strong>
            </div>
            <span>Data Ownership</span>
          </div>
          <div className="trust-stat">
            <div className="trust-number-wrap">
              <strong>Zero</strong>
            </div>
            <span>Ad Tracking</span>
          </div>
        </div>
      </motion.div>

      {/* Right Column: Dynamic Floating Mockup Frame */}
      <motion.div
        ref={cardRef}
        className="hero-mockup-wrapper"
        initial={prefersReduced ? false : { opacity: 0, scale: 0.95 }}
        animate={prefersReduced ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="hero-card-base">
          {/* macOS Browser / App Chrome Frame */}
          <div className="mockup-window-chrome" aria-hidden="true">
            <div className="window-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <div className="window-url-bar">
              <Lock size={12} className="url-lock-icon" />
              <span>mycoinwise.app/ledger/live</span>
            </div>
            <div className="window-live-status">
              <span className="live-radar-dot" />
              <span>LIVE</span>
            </div>
          </div>

          {/* Interactive Mockup Switcher Tabs */}
          <div className="mockup-tab-switcher" role="tablist" aria-label="Mockup preview tabs">
            <button
              id="hero-tab-ledger"
              type="button"
              role="tab"
              aria-label="Living Ledger"
              aria-selected={activeTab === 'ledger'}
              aria-controls="hero-panel-ledger"
              className={`mockup-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
              onClick={() => setActiveTab('ledger')}
            >
              <Sparkles size={13} className="text-emerald" />
              <span>Living Ledger</span>
            </button>
            <button
              id="hero-tab-cockpit"
              type="button"
              role="tab"
              aria-label="Cockpit"
              aria-selected={activeTab === 'cockpit'}
              aria-controls="hero-panel-cockpit"
              className={`mockup-tab-btn ${activeTab === 'cockpit' ? 'active' : ''}`}
              onClick={() => setActiveTab('cockpit')}
            >
              <Activity size={13} />
              <span>Cockpit</span>
            </button>
            <button
              id="hero-tab-radar"
              type="button"
              role="tab"
              aria-label="Cashflow Radar"
              aria-selected={activeTab === 'radar'}
              aria-controls="hero-panel-radar"
              className={`mockup-tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
              onClick={() => setActiveTab('radar')}
            >
              <Bot size={13} />
              <span>Cashflow Radar</span>
            </button>
            <button
              id="hero-tab-tax"
              type="button"
              role="tab"
              aria-label="Tax Shield"
              aria-selected={activeTab === 'tax'}
              aria-controls="hero-panel-tax"
              className={`mockup-tab-btn ${activeTab === 'tax' ? 'active' : ''}`}
              onClick={() => setActiveTab('tax')}
            >
              <SlidersHorizontal size={13} />
              <span>Tax Shield</span>
            </button>
          </div>

          {/* Signature Moment: The Living Ledger */}
          {activeTab === 'ledger' && (
            <div id="hero-panel-ledger" role="tabpanel" aria-labelledby="hero-tab-ledger" className="mockup-tab-content living-ledger-view">
              <div className="ledger-explainer-banner" aria-hidden="true">
                <span className="explainer-dot" />
                <span>Real-Time Inflow Telemetry · Watch salary split automatically into budgets & wealth</span>
              </div>
              <LivingLedger prefersReduced={prefersReduced} />
            </div>
          )}

          {activeTab === 'cockpit' && (
            <div id="hero-panel-cockpit" role="tabpanel" aria-labelledby="hero-tab-cockpit" className="mockup-tab-content mockup-view-cockpit">
              <div className="mockup-header">
                <div className="header-text-group">
                  <span className="mockup-eyebrow">PORTFOLIO OVERVIEW</span>
                  <strong className="mockup-heading">Total Net Worth</strong>
                </div>
                <span className="mockup-chip">+18.4% YTD</span>
              </div>

              <div className="mockup-balance">
                <span className="balance-label">Aggregated Liquidity & Assets</span>
                <strong className="balance-value">₹42,85,920.00</strong>
              </div>

              {/* Asset Allocation Mini Badges */}
              <div className="mockup-asset-strip">
                <span className="asset-pill pill-equity">
                  <span className="dot" /> Equity 42%
                </span>
                <span className="asset-pill pill-funds">
                  <span className="dot" /> Mutual Funds 28%
                </span>
                <span className="asset-pill pill-gold">
                  <span className="dot" /> Bullion 15%
                </span>
                <span className="asset-pill pill-cash">
                  <span className="dot" /> Liquid 15%
                </span>
              </div>

              {/* Simulated Sparkline Curve */}
              <div className="mockup-chart-curve">
                <svg viewBox="0 0 320 95" preserveAspectRatio="none" className="chart-svg">
                  <defs>
                    <linearGradient id={heroGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                      <stop offset="60%" stopColor="#10b981" stopOpacity="0.1" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id={`${heroGradId}-stroke`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="70%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  <line x1="0" y1="25" x2="320" y2="25" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <line x1="0" y1="55" x2="320" y2="55" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <line x1="0" y1="85" x2="320" y2="85" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

                  {/* Shaded Area */}
                  <path
                    d="M 0,75 Q 40,50 80,60 T 160,38 T 230,44 T 320,12 L 320,95 L 0,95 Z"
                    fill={`url(#${heroGradId})`}
                  />
                  {/* Glowing Stroke Path */}
                  <path
                    d="M 0,75 Q 40,50 80,60 T 160,38 T 230,44 T 320,12"
                    fill="none"
                    stroke={`url(#${heroGradId}-stroke)`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />

                  {/* Highlight Data Point */}
                  <circle cx="320" cy="12" r="5" fill="#10b981" />
                  <circle cx="320" cy="12" r="9" fill="#10b981" opacity="0.3" />
                </svg>
              </div>

              {/* Recent Mock Transactions */}
              <div className="mockup-tx-list">
                <div className="mockup-tx-item">
                  <div className="tx-left">
                    <span className="tx-badge-dot" style={{ background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                    <span className="tx-title">Dividend Yield (Index Fund)</span>
                  </div>
                  <span className="amount-plus">+₹14,500</span>
                </div>
                <div className="mockup-tx-item">
                  <div className="tx-left">
                    <span className="tx-badge-dot" style={{ background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
                    <span className="tx-title">Smart Budget: Cloud Server</span>
                  </div>
                  <span className="amount-minus">−₹3,200</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'radar' && (
            <div id="hero-panel-radar" role="tabpanel" aria-labelledby="hero-tab-radar" className="mockup-tab-content mockup-view-radar">
              <div className="mockup-header">
                <div className="header-text-group">
                  <span className="mockup-eyebrow" style={{ color: '#38bdf8' }}>
                    CASHFLOW RADAR ENGINE
                  </span>
                  <strong className="mockup-heading">90-Day Cashflow Runway</strong>
                </div>
                <span className="mockup-chip" style={{ background: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
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
                    <span className="tx-title">Projected Cash Buffer</span>
                  </div>
                  <span className="amount-plus">₹1,85,000</span>
                </div>
                <div className="mockup-tx-item">
                  <div className="tx-left">
                    <span className="tx-badge-dot" style={{ background: '#f59e0b' }} />
                    <span className="tx-title">Auto-Sweep Allocation</span>
                  </div>
                  <span style={{ color: '#f8fafc', fontWeight: 600 }}>To Wealth (55%)</span>
                </div>
                <div className="mockup-tx-item">
                  <div className="tx-left">
                    <span className="tx-badge-dot" style={{ background: '#10b981' }} />
                    <span className="tx-title">Runway Exhaustion Risk</span>
                  </div>
                  <span className="amount-plus">0.0% (Zero Risk)</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tax' && (
            <div id="hero-panel-tax" role="tabpanel" aria-labelledby="hero-tab-tax" className="mockup-tab-content mockup-view-tax">
              <div className="mockup-header">
                <div className="header-text-group">
                  <span className="mockup-eyebrow" style={{ color: '#10b981' }}>
                    REGIME OPTIMIZER
                  </span>
                  <strong className="mockup-heading">Union Budget FY 2024-25</strong>
                </div>
                <span className="mockup-chip" style={{ background: 'rgba(16, 185, 129, 0.18)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
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

              <div className="mockup-tx-item" style={{ marginTop: '0.85rem' }}>
                <div className="tx-left">
                  <span className="tx-badge-dot" style={{ background: '#10b981' }} />
                  <span className="tx-title">Recommendation</span>
                </div>
                <span className="amount-plus">Adopt New Regime</span>
              </div>
            </div>
          )}
        </div>

        {/* Orbiting Glass Badge 1: Top Right */}
        <div className="floating-badge-card top-right">
          <div className="badge-icon badge-icon-zap">
            <Zap size={18} aria-hidden="true" />
          </div>
          <div className="badge-text-col">
            <strong className="badge-title">Forecast Engine</strong>
            <span className="badge-sub text-emerald">90-Day Runway Safe</span>
          </div>
        </div>

        {/* Orbiting Glass Badge 2: Bottom Left */}
        <div className="floating-badge-card bottom-left">
          <div className="badge-icon badge-icon-shield">
            <Shield size={18} aria-hidden="true" />
          </div>
          <div className="badge-text-col">
            <strong className="badge-title">Bank-Grade Security</strong>
            <span className="badge-sub">AES-256 Encrypted</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
