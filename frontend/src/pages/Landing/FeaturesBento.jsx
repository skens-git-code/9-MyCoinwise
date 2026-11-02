import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Target,
  TrendingUp,
  Sparkles,
  ReceiptText,
  Repeat,
  ShieldCheck,
  Layers,
  RefreshCw,
  Zap
} from 'lucide-react';

export default function FeaturesBento() {
  const prefersReduced = useReducedMotion();
  const [rolloverActive, setRolloverActive] = useState(true);
  const [spentAmount] = useState(8450);
  const [taxRegime, setTaxRegime] = useState('new');
  const [taxBracket, setTaxBracket] = useState('15L');
  const [selectedAsset, setSelectedAsset] = useState('funds');
  const [subStatus, setSubStatus] = useState('active');

  const budgetTotal = 15000;
  const unspent = Math.max(0, budgetTotal - spentAmount);
  const spentPct = Math.round((spentAmount / budgetTotal) * 100);

  const taxSavingsMap = {
    '12L': { newSaves: '₹45,500', oldNotes: 'Requires ₹1.5L 80C + ₹50k NPS to match' },
    '15L': { newSaves: '₹70,200', oldNotes: 'New Regime slab expansion saves ₹70k+ automatically' },
    '20L': { newSaves: '₹96,200', oldNotes: 'Old Regime high-bracket surcharges exceed New Regime' },
  };

  return (
    <section id="features" className="landing-section" aria-labelledby="features-heading">
      <div className="landing-container">
        <div className="section-header">
          <span className="section-eyebrow">
            <Layers size={14} aria-hidden="true" />
            <span>Comprehensive Architecture</span>
          </span>
          <h2 id="features-heading">Everything You Need to Scale Your Finances</h2>
          <p>
            Engineered from the ground up for high-precision money management. No bloat, no ads,
            just raw financial telemetry and intelligent automation.
          </p>
        </div>

        <div className="landing-bento-layout">
          {/* Bento Card 1: Precision Budgets with Dynamic Rollover (Span 2) */}
          <motion.div
            className="landing-bento-card col-span-2 bento-card-rollover"
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4 }}
          >
            <div className="bento-card-top">
              <div className="bento-icon-wrapper">
                <div className="bento-icon" aria-hidden="true">
                  <Target size={24} />
                </div>
                <span className="bento-pill-live">Interactive Telemetry</span>
              </div>
              <h3 className="bento-title">Precision Budgets with Dynamic Rollover</h3>
              <p className="bento-desc">
                Set category ceilings, allocate expenses to custom wealth buckets, and roll unspent surplus into future cycles automatically.
              </p>
            </div>

            <div className="bento-preview-box rollover-preview-box">
              <div className="preview-header">
                <div className="preview-label-group">
                  <span className="preview-label">Transport & Lifestyle</span>
                  <strong className="preview-amount">
                    ₹{spentAmount.toLocaleString('en-IN')} / ₹{budgetTotal.toLocaleString('en-IN')}
                  </strong>
                </div>
                <button
                  type="button"
                  className={`bento-interactive-pill ${rolloverActive ? 'is-active' : ''}`}
                  onClick={() => setRolloverActive(!rolloverActive)}
                  aria-pressed={rolloverActive}
                >
                  <RefreshCw size={12} className={rolloverActive ? 'spin-slow' : ''} aria-hidden="true" />
                  <span>{rolloverActive ? `${spentPct}% Allocated · Rollover ON` : 'Rollover OFF (Fixed)'}</span>
                </button>
              </div>

              {/* Progress Track */}
              <div className="preview-track-wrap">
                <div
                  className="preview-progress-bar"
                  style={{
                    width: `${spentPct}%`,
                    background: spentPct > 90 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #10b981, #38bdf8)'
                  }}
                />
              </div>

              {/* Dynamic Surplus Feedback */}
              <div className="preview-status-row">
                {rolloverActive ? (
                  <span className="status-highlight text-emerald">
                    +₹{unspent.toLocaleString('en-IN')} unspent will cascade to next month's surplus reserve
                  </span>
                ) : (
                  <span className="status-highlight text-muted">
                    Fixed ceiling: unused surplus will expire without rollover
                  </span>
                )}
                <span className="preview-meta">30-Day Cycle</span>
              </div>
            </div>
          </motion.div>

          {/* Bento Card 2: Cashflow & Hazard Radar */}
          <motion.div
            className="landing-bento-card bento-card-radar"
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <div className="bento-card-top">
              <div className="bento-icon-wrapper">
                <div className="bento-icon icon-cyan" aria-hidden="true">
                  <Sparkles size={24} />
                </div>
                <span className="bento-badge-chip">Runway Radar</span>
              </div>
              <h3 className="bento-title">Cashflow & Hazard Radar</h3>
              <p className="bento-desc">
                Proactive projections simulate your 90-day trajectory, warning you weeks before cashflow dips below safety thresholds.
              </p>
            </div>

            <div className="bento-preview-box">
              <div className="radar-live-notification">
                <Zap size={14} className="radar-spark-icon" aria-hidden="true" />
                <span className="radar-notif-text">
                  ✨ "High surplus window projected on day 24 — consider moving ₹18,000 to Wealth."
                </span>
              </div>
              <div className="radar-runway-meta">
                <span className="runway-meta-label">90-Day Runway Status:</span>
                <strong className="text-emerald runway-meta-val">Optimal (Zero Deficit)</strong>
              </div>
            </div>
          </motion.div>

          {/* Bento Card 3: Wealth & Asset Telemetry */}
          <motion.div
            className="landing-bento-card bento-card-wealth"
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: 0.16 }}
          >
            <div className="bento-card-top">
              <div className="bento-icon-wrapper">
                <div className="bento-icon icon-emerald" aria-hidden="true">
                  <TrendingUp size={24} />
                </div>
                <span className="bento-badge-chip">Mark-to-Market</span>
              </div>
              <h3 className="bento-title">Wealth & Asset Telemetry</h3>
              <p className="bento-desc">
                Track equity portfolios, real estate, precious metals, and liabilities in one real-time consolidated net worth cockpit.
              </p>
            </div>

            <div className="bento-preview-box">
              <div className="bento-asset-selector-wrap">
                <div className="bento-asset-btn-group" role="group" aria-label="Asset category selector">
                  <button
                    type="button"
                    onClick={() => setSelectedAsset('funds')}
                    aria-pressed={selectedAsset === 'funds'}
                    className={`bento-asset-btn ${selectedAsset === 'funds' ? 'active-funds' : ''}`}
                  >
                    📈 Mutual Funds (55%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAsset('gold')}
                    aria-pressed={selectedAsset === 'gold'}
                    className={`bento-asset-btn ${selectedAsset === 'gold' ? 'active-gold' : ''}`}
                  >
                    🪙 Gold & Bullion (15%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAsset('re')}
                    aria-pressed={selectedAsset === 're'}
                    className={`bento-asset-btn ${selectedAsset === 're' ? 'active-re' : ''}`}
                  >
                    🏠 Real Estate (30%)
                  </button>
                </div>
                <span className="bento-asset-subtext">
                  Real-time multi-asset aggregation with daily mark-to-market.
                </span>
              </div>
            </div>
          </motion.div>

          {/* Bento Card 4: Tax Center & Regime Comparator */}
          <motion.div
            className="landing-bento-card bento-card-tax"
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: 0.24 }}
          >
            <div className="bento-card-top">
              <div className="bento-icon-wrapper">
                <div className="bento-icon icon-amber" aria-hidden="true">
                  <ReceiptText size={24} />
                </div>
                <span className="bento-badge-chip">Union Budget 2024-25</span>
              </div>
              <h3 className="bento-title">Tax Center & Regime Comparator</h3>
              <p className="bento-desc">
                Instant India (New vs. Old) and US Federal bracket simulations, tagged deductible expenses, capital gains holding tracker, and printable PDF audit sheets.
              </p>
            </div>

            <div className="bento-preview-box">
              <div className="tax-preview-inner">
                <div className="tax-controls-row">
                  <div className="tax-regime-group" role="group" aria-label="Tax regime selector">
                    <button
                      type="button"
                      onClick={() => setTaxRegime('new')}
                      aria-pressed={taxRegime === 'new'}
                      className={`bento-toggle-btn ${taxRegime === 'new' ? 'active-emerald' : ''}`}
                    >
                      New Regime
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaxRegime('old')}
                      aria-pressed={taxRegime === 'old'}
                      className={`bento-toggle-btn ${taxRegime === 'old' ? 'active-cyan' : ''}`}
                    >
                      Old Regime
                    </button>
                  </div>
                  <div className="tax-bracket-group" role="group" aria-label="Simulated income bracket">
                    {['12L', '15L', '20L'].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setTaxBracket(b)}
                        aria-pressed={taxBracket === b}
                        className={`bento-chip-btn ${taxBracket === b ? 'active' : ''}`}
                      >
                        ₹{b}
                      </button>
                    ))}
                  </div>
                </div>
                <span className={`tax-savings-summary ${taxRegime === 'new' ? 'tax-regime-new' : 'tax-regime-old'}`}>
                  {taxRegime === 'new'
                    ? `🇮🇳 At ₹${taxBracket}: New Regime saves ${taxSavingsMap[taxBracket].newSaves} vs Old Regime this fiscal year`
                    : `🇮🇳 At ₹${taxBracket}: Old Regime ${taxSavingsMap[taxBracket].oldNotes}`}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Bento Card 5: Subscription Autopilot */}
          <motion.div
            className="landing-bento-card bento-card-sub"
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: 0.32 }}
          >
            <div className="bento-card-top">
              <div className="bento-icon-wrapper">
                <div className="bento-icon icon-rose" aria-hidden="true">
                  <Repeat size={24} />
                </div>
                <span className="bento-badge-chip">Zombie Detector</span>
              </div>
              <h3 className="bento-title">Subscription Autopilot</h3>
              <p className="bento-desc">
                Identify silent recurring leaks, renewal deadlines, and trial expirations before your card is billed unexpectedly.
              </p>
            </div>

            <div className="bento-preview-box">
              <div className="sub-preview-row">
                <span className={`sub-status-label ${subStatus === 'active' ? 'status-active' : 'status-saved'}`}>
                  {subStatus === 'active'
                    ? '⚠️ 2 Subscriptions renewing in the next 7 days (₹1,498)'
                    : '✓ Zombie leaks prevented; ₹1,498 saved this month'}
                </span>
                <button
                  type="button"
                  onClick={() => setSubStatus(subStatus === 'active' ? 'saved' : 'active')}
                  aria-pressed={subStatus === 'saved'}
                  className="bento-chip-btn sub-audit-btn"
                >
                  {subStatus === 'active' ? 'Mark Audited' : 'Reset'}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Bento Card 6: Bank-Grade Client Security */}
          <motion.div
            className="landing-bento-card bento-card-security"
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <div className="bento-card-top">
              <div className="bento-icon-wrapper">
                <div className="bento-icon icon-emerald" aria-hidden="true">
                  <ShieldCheck size={24} />
                </div>
                <span className="bento-badge-chip">Zero Ad Telemetry</span>
              </div>
              <h3 className="bento-title">Bank-Grade Client Security</h3>
              <p className="bento-desc">
                AES-256 field encryption for document references, zero third-party telemetry selling, full data export, and session revocation.
              </p>
            </div>

            <div className="bento-preview-box">
              <div className="security-badges-row">
                <span className="sec-tag">🔒 End-to-end tokenized auth</span>
                <span className="sec-tag">⚡ Self-hosted & Cloud ready</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
