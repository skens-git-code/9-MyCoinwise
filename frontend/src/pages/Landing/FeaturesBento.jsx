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
                  className="bento-interactive-pill"
                  onClick={() => setRolloverActive(!rolloverActive)}
                  aria-pressed={rolloverActive}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    background: rolloverActive ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 255, 255, 0.08)',
                    color: rolloverActive ? '#10b981' : '#94a3b8',
                    border: '1px solid',
                    borderColor: rolloverActive ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.12)',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
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
                <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.8rem', display: 'block', lineHeight: 1.45 }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Asset category selector">
                  <button
                    type="button"
                    onClick={() => setSelectedAsset('funds')}
                    aria-pressed={selectedAsset === 'funds'}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: selectedAsset === 'funds' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)',
                      color: selectedAsset === 'funds' ? '#10b981' : '#f8fafc',
                      border: '1px solid',
                      borderColor: selectedAsset === 'funds' ? 'rgba(16, 185, 129, 0.4)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    📈 Mutual Funds (55%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAsset('gold')}
                    aria-pressed={selectedAsset === 'gold'}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: selectedAsset === 'gold' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.06)',
                      color: selectedAsset === 'gold' ? '#f59e0b' : '#f8fafc',
                      border: '1px solid',
                      borderColor: selectedAsset === 'gold' ? 'rgba(245, 158, 11, 0.4)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    🪙 Gold & Bullion (15%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAsset('re')}
                    aria-pressed={selectedAsset === 're'}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: selectedAsset === 're' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.06)',
                      color: selectedAsset === 're' ? '#38bdf8' : '#f8fafc',
                      border: '1px solid',
                      borderColor: selectedAsset === 're' ? 'rgba(56, 189, 248, 0.4)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    🏠 Real Estate (30%)
                  </button>
                </div>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)', lineHeight: 1.45 }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} role="group" aria-label="Tax regime selector">
                    <button
                      type="button"
                      onClick={() => setTaxRegime('new')}
                      aria-pressed={taxRegime === 'new'}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid',
                        borderColor: taxRegime === 'new' ? '#10b981' : 'rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        background: taxRegime === 'new' ? '#10b981' : 'rgba(255,255,255,0.06)',
                        color: taxRegime === 'new' ? '#ffffff' : '#94a3b8',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      New Regime
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaxRegime('old')}
                      aria-pressed={taxRegime === 'old'}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid',
                        borderColor: taxRegime === 'old' ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        background: taxRegime === 'old' ? '#38bdf8' : 'rgba(255,255,255,0.06)',
                        color: taxRegime === 'old' ? '#ffffff' : '#94a3b8',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      Old Regime
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} role="group" aria-label="Simulated income bracket">
                    {['12L', '15L', '20L'].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setTaxBracket(b)}
                        aria-pressed={taxBracket === b}
                        style={{
                          padding: '2px 7px',
                          borderRadius: 4,
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          background: taxBracket === b ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                          color: taxBracket === b ? '#ffffff' : '#94a3b8',
                          border: '1px solid',
                          borderColor: taxBracket === b ? 'rgba(255,255,255,0.25)' : 'transparent',
                          cursor: 'pointer'
                        }}
                      >
                        ₹{b}
                      </button>
                    ))}
                  </div>
                </div>
                <span style={{ color: taxRegime === 'new' ? '#10b981' : '#38bdf8', fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.45 }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ color: subStatus === 'active' ? '#f59e0b' : '#10b981', fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.45 }}>
                  {subStatus === 'active'
                    ? '⚠️ 2 Subscriptions renewing in the next 7 days (₹1,498)'
                    : '✓ Zombie leaks prevented; ₹1,498 saved this month'}
                </span>
                <button
                  type="button"
                  onClick={() => setSubStatus(subStatus === 'active' ? 'saved' : 'active')}
                  aria-pressed={subStatus === 'saved'}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    padding: '3px 8px',
                    borderRadius: 6,
                    color: '#cbd5e1',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
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
