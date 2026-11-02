import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, X, Minus, Sparkles, Shield, Zap, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CoinwiseMark, CoinwiseBadge } from '../../components/CoinwiseBrand';

const COMPARISON_ROWS = [
  {
    feature: 'Automated Budget Rollover & Pipeline Links',
    coinwise: true,
    spreadsheets: false,
    banks: false,
    note: 'Unused budget cascades forward or sweeps into wealth funds.'
  },
  {
    feature: 'Dual Tax Regime Comparator (Old vs New FY 2024-25)',
    coinwise: true,
    spreadsheets: 'Partial (Manual Formulas)',
    banks: false,
    note: 'Automated 87A rebate, standard deduction, and surcharge calculation.'
  },
  {
    feature: 'Smart Subscription Autopilot & Renewal Alerts',
    coinwise: true,
    spreadsheets: false,
    banks: 'Limited (Only statement history)',
    note: 'Flags zombie subscriptions and tracks upcoming renewals before they bill.'
  },
  {
    feature: 'Zero Ads, Zero Third-Party Financial Telemetry',
    coinwise: true,
    spreadsheets: true,
    banks: false,
    note: 'We do not sell your transactional data or push predatory personal loans.'
  },
  {
    feature: 'Multi-Currency Conversion & Liquid Net Worth Tracking',
    coinwise: true,
    spreadsheets: 'Manual Lookup',
    banks: false,
    note: 'Real-time aggregated view of emergency funds, wealth accounts, and daily cash.'
  },
  {
    feature: 'Bank-Grade JWT Session Security & Bcrypt Hashing',
    coinwise: true,
    spreadsheets: false,
    banks: true,
    note: 'Full cryptographic protection and isolated user data namespaces.'
  }
];

export default function ComparisonSection() {
  const prefersReduced = useReducedMotion();
  const [filter, setFilter] = useState('all'); // 'all' | 'automation' | 'security'

  const filteredRows = useMemo(() => {
    if (filter === 'automation') {
      return COMPARISON_ROWS.filter((r) =>
        [
          'Automated Budget Rollover & Pipeline Links',
          'Smart Subscription Autopilot & Renewal Alerts',
          'Multi-Currency Conversion & Liquid Net Worth Tracking'
        ].includes(r.feature)
      );
    }
    if (filter === 'security') {
      return COMPARISON_ROWS.filter((r) =>
        [
          'Dual Tax Regime Comparator (Old vs New FY 2024-25)',
          'Zero Ads, Zero Third-Party Financial Telemetry',
          'Bank-Grade JWT Session Security & Bcrypt Hashing'
        ].includes(r.feature)
      );
    }
    return COMPARISON_ROWS;
  }, [filter]);

  const renderStatus = (val) => {
    if (val === true) {
      return (
        <span className="status-badge check" title="Fully Supported">
          <Check className="icon" aria-hidden="true" size={16} />
          <span className="sr-only">Supported</span>
        </span>
      );
    }
    if (val === false) {
      return (
        <span className="status-badge xmark" title="Not Supported">
          <X className="icon" aria-hidden="true" size={16} />
          <span className="sr-only">Not Supported</span>
        </span>
      );
    }
    return (
      <span className="status-badge text" title={val}>
        <Minus className="icon" aria-hidden="true" size={14} />
        <span className="badge-text">{val}</span>
      </span>
    );
  };

  return (
    <section id="comparison" className="landing-comparison" aria-labelledby="comparison-heading">
      <div className="landing-container">
        <div className="section-header">
          <span className="section-pill">Why MyCoinwise</span>
          <h2 id="comparison-heading">The Modern Standard for Financial Clarity</h2>
          <p>
            Traditional banking apps sell you loans. Spreadsheets break under friction. MyCoinwise gives you real-time executive control.
          </p>

          {/* Interactive Filter Pills */}
          <div className="comparison-filter-pills" role="radiogroup" aria-label="Filter comparison capabilities">
            <button
              type="button"
              role="radio"
              aria-checked={filter === 'all'}
              onClick={() => setFilter('all')}
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            >
              All Capabilities
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={filter === 'automation'}
              onClick={() => setFilter('automation')}
              className={`filter-btn ${filter === 'automation' ? 'active' : ''}`}
            >
              Core Automation
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={filter === 'security'}
              onClick={() => setFilter('security')}
              className={`filter-btn ${filter === 'security' ? 'active' : ''}`}
            >
              Security & Privacy
            </button>
          </div>
        </div>

        {/* Comparison Table Card */}
        <motion.div
          className="comparison-table-wrapper"
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="table-responsive">
            <table className="comparison-table" aria-label="Comparison between MyCoinwise, Spreadsheets, and Traditional Banking Apps">
              <thead>
                <tr>
                  <th scope="col" style={{ width: '42%' }}>Capability</th>
                  <th scope="col" className="col-highlight" style={{ width: '22%' }}>
                    <div className="coinwise-badge">
                      <CoinwiseBadge size={22} radius={6} variant="surface" aria-hidden="true">
                        <CoinwiseMark size={13} color="#FC0100" aria-hidden="true" />
                      </CoinwiseBadge>
                      <span>MyCoinwise</span>
                      <span className="recommended-tag">Leader</span>
                    </div>
                  </th>
                  <th scope="col" style={{ width: '18%' }}>Manual Sheets</th>
                  <th scope="col" style={{ width: '18%' }}>Banking Apps</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.feature} className="comparison-row">
                    <td className="row-feature">
                      <strong>{row.feature}</strong>
                      <span className="feature-note">{row.note}</span>
                    </td>
                    <td className="row-highlight">
                      {renderStatus(row.coinwise)}
                    </td>
                    <td className="row-competitor">
                      {renderStatus(row.spreadsheets)}
                    </td>
                    <td className="row-competitor">
                      {renderStatus(row.banks)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Bottom Action Callout */}
          <div className="comparison-table-footer">
            <div className="footer-callout-text">
              <Sparkles size={16} className="text-emerald" aria-hidden="true" />
              <span>Ready to upgrade from fragmented spreadsheets to an intelligent operating system?</span>
            </div>
            <Link to="/register" className="btn-landing-primary" style={{ padding: '0.55rem 1.25rem', fontSize: '0.88rem' }}>
              <span>Start Free Today</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
