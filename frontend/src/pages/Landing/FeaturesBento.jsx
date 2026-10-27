import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Target, TrendingUp, Sparkles, ReceiptText, Repeat, ShieldCheck, Layers, Check, ArrowRight, RefreshCw } from 'lucide-react';

export default function FeaturesBento() {
  const prefersReduced = useReducedMotion();
  const [rolloverActive, setRolloverActive] = useState(true);
  const [taxRegime, setTaxRegime] = useState('new');
  const [selectedAsset, setSelectedAsset] = useState('funds');
  const [subStatus, setSubStatus] = useState('active');

  const features = [
    {
      icon: Target,
      title: 'Precision Budgets with Dynamic Rollover',
      desc: 'Set category ceilings, allocate expenses to custom wealth buckets, and roll unspent surplus into future cycles automatically.',
      highlight: true,
      preview: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem', display: 'block' }}>Transport & Lifestyle</span>
              <strong style={{ fontSize: '1rem', color: '#ffffff' }}>₹8,450 / ₹15,000</strong>
            </div>
            <button
              type="button"
              className="bento-interactive-pill"
              onClick={() => setRolloverActive(!rolloverActive)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: rolloverActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                color: rolloverActive ? '#10b981' : '#94a3b8',
                border: '1px solid',
                borderColor: rolloverActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.12)',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <RefreshCw size={11} className={rolloverActive ? 'spin-slow' : ''} />
              {rolloverActive ? '56% Allocated · Rollover ON' : 'Rollover OFF (Fixed)'}
            </button>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '56%', background: 'linear-gradient(90deg, #10b981, #38bdf8)', borderRadius: 999 }} />
          </div>
          {rolloverActive && (
            <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
              +₹6,550 unspent will cascade to next month's surplus reserve
            </span>
          )}
        </div>
      ),
    },
    {
      icon: Sparkles,
      title: 'AI Cashflow & Hazard Radar',
      desc: 'Gemini-powered projections simulate your 90-day trajectory, warning you weeks before cashflow dips below safety thresholds.',
      highlight: false,
      preview: (
        <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.8rem', display: 'block' }}>
          ✨ "High surplus window projected on day 24 — consider moving ₹18,000 to Wealth."
        </span>
      ),
    },
    {
      icon: TrendingUp,
      title: 'Wealth & Asset Telemetry',
      desc: 'Track equity portfolios, real estate, precious metals, and liabilities in one real-time consolidated net worth cockpit.',
      highlight: false,
      preview: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setSelectedAsset('funds')}
              style={{
                padding: '3px 9px',
                borderRadius: 4,
                background: selectedAsset === 'funds' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)',
                color: selectedAsset === 'funds' ? '#10b981' : '#f8fafc',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 600
              }}
            >
              📈 Mutual Funds (55%)
            </button>
            <button
              type="button"
              onClick={() => setSelectedAsset('gold')}
              style={{
                padding: '3px 9px',
                borderRadius: 4,
                background: selectedAsset === 'gold' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.06)',
                color: selectedAsset === 'gold' ? '#f59e0b' : '#f8fafc',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 600
              }}
            >
              🪙 Gold & Bullion (15%)
            </button>
            <button
              type="button"
              onClick={() => setSelectedAsset('re')}
              style={{
                padding: '3px 9px',
                borderRadius: 4,
                background: selectedAsset === 're' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.06)',
                color: selectedAsset === 're' ? '#38bdf8' : '#f8fafc',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 600
              }}
            >
              🏠 Real Estate (30%)
            </button>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
            Real-time multi-asset aggregation with daily mark-to-market.
          </span>
        </div>
      ),
    },
    {
      icon: ReceiptText,
      title: 'Tax Center & Regime Comparator',
      desc: 'Instant India (New vs. Old) and US Federal bracket simulations, tagged deductible expenses, capital gains holding tracker, and printable PDF audit sheets.',
      highlight: false,
      preview: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setTaxRegime('new')}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 700,
                background: taxRegime === 'new' ? '#10b981' : 'rgba(255,255,255,0.08)',
                color: taxRegime === 'new' ? '#ffffff' : '#94a3b8'
              }}
            >
              New Regime
            </button>
            <button
              type="button"
              onClick={() => setTaxRegime('old')}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 700,
                background: taxRegime === 'old' ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                color: taxRegime === 'old' ? '#ffffff' : '#94a3b8'
              }}
            >
              Old Regime
            </button>
          </div>
          <span style={{ color: taxRegime === 'new' ? '#10b981' : '#38bdf8', fontWeight: 600, fontSize: '0.8rem' }}>
            {taxRegime === 'new'
              ? '🇮🇳 New Regime saves ₹14,200 vs Old Regime this fiscal year'
              : '🇮🇳 Old Regime requires ₹1.5L 80C + ₹50k NPS to match New Regime'}
          </span>
        </div>
      ),
    },
    {
      icon: Repeat,
      title: 'Subscription Autopilot',
      desc: 'Identify silent recurring leaks, renewal deadlines, and trial expirations before your card is billed unexpectedly.',
      highlight: false,
      preview: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: subStatus === 'active' ? '#f59e0b' : '#10b981', fontWeight: 600, fontSize: '0.8rem' }}>
            {subStatus === 'active'
              ? '⚠️ 2 Subscriptions renewing in the next 7 days (₹1,498)'
              : '✓ Zombie leaks prevented; ₹1,498 saved this month'}
          </span>
          <button
            type="button"
            onClick={() => setSubStatus(subStatus === 'active' ? 'saved' : 'active')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '0.7rem',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {subStatus === 'active' ? 'Mark Audited' : 'Reset'}
          </button>
        </div>
      ),
    },
    {
      icon: ShieldCheck,
      title: 'Bank-Grade Client Security',
      desc: 'AES-256 field encryption for document references, zero third-party telemetry selling, full data export, and session revocation.',
      highlight: false,
      preview: (
        <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.78rem', display: 'block' }}>
          🔒 End-to-end tokenized auth · Self-hosted & Cloud ready
        </span>
      ),
    },
  ];

  return (
    <section id="features" className="landing-section" aria-labelledby="features-heading">
      <div className="section-header">
        <span className="section-eyebrow">
          <Layers size={14} /> Comprehensive Architecture
        </span>
        <h2 id="features-heading">Everything You Need to Scale Your Finances</h2>
        <p>
          Engineered from the ground up for high-precision money management. No bloat, no ads,
          just raw financial power and intelligent automation.
        </p>
      </div>

      <div className="landing-bento-grid">
        {features.map((feat, idx) => {
          const Icon = feat.icon;
          return (
            <motion.div
              key={feat.title}
              className={`landing-bento-card ${feat.highlight ? 'col-span-2' : ''}`}
              initial={prefersReduced ? false : { opacity: 0, y: 16 }}
              whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: prefersReduced ? 0 : idx * 0.08 }}
            >
              <div>
                <div className="bento-icon" aria-hidden="true">
                  <Icon size={24} />
                </div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
              </div>
              {feat.preview && <div className="bento-preview-box">{feat.preview}</div>}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
