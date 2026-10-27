import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, X, Minus } from 'lucide-react';

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
  const [filter, setFilter] = React.useState('all'); // 'all' | 'automation' | 'security'

  const filteredRows = React.useMemo(() => {
    if (filter === 'automation') {
      return COMPARISON_ROWS.filter((r) =>
        ['Automated Budget Rollover & Pipeline Links', 'Smart Subscription Autopilot & Renewal Alerts', 'Multi-Currency Conversion & Liquid Net Worth Tracking'].includes(r.feature)
      );
    }
    if (filter === 'security') {
      return COMPARISON_ROWS.filter((r) =>
        ['Dual Tax Regime Comparator (Old vs New FY 2024-25)', 'Zero Ads, Zero Third-Party Financial Telemetry', 'Bank-Grade JWT Session Security & Bcrypt Hashing'].includes(r.feature)
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
    <section id="comparison" className="landing-comparison">
      <div className="landing-container">
        <div className="section-header">
          <span className="section-pill">Why MyCoinwise</span>
          <h2>The Modern Standard for Financial Clarity</h2>
          <p>
            Traditional banking apps sell you loans. Spreadsheets break under friction. MyCoinwise gives you real-time executive control.
          </p>

          {/* Interactive Filter Pills */}
          <div className="comparison-filter-pills" style={{ display: 'inline-flex', gap: 8, marginTop: '1.25rem', background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => setFilter('all')}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: filter === 'all' ? '#10b981' : 'transparent',
                color: filter === 'all' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.2s ease'
              }}
            >
              All Capabilities
            </button>
            <button
              type="button"
              onClick={() => setFilter('automation')}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: filter === 'automation' ? '#10b981' : 'transparent',
                color: filter === 'automation' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.2s ease'
              }}
            >
              Core Automation
            </button>
            <button
              type="button"
              onClick={() => setFilter('security')}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: filter === 'security' ? '#10b981' : 'transparent',
                color: filter === 'security' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.2s ease'
              }}
            >
              Tax & Security
            </button>
          </div>
        </div>

        <motion.div 
          className="comparison-table-wrapper"
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          whileInView={prefersReduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="table-responsive">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th scope="col" className="col-feature">Capability</th>
                  <th scope="col" className="col-highlight">
                    <div className="coinwise-badge">
                      <span className="brand-dot" aria-hidden="true" />
                      <span>MyCoinwise</span>
                    </div>
                  </th>
                  <th scope="col" className="col-competitor">Manual Spreadsheets</th>
                  <th scope="col" className="col-competitor">Traditional Banking Apps</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.feature}>
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
        </motion.div>
      </div>
    </section>
  );
}
