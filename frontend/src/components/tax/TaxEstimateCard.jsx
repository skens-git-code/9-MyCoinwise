/* —————————————————————————————————————
 * Tax Estimate Card
 * Displays the four headline numbers from a tax estimate:
 *   - Estimated liability
 *   - Balance due (or refund expected)
 *   - Effective and marginal rate
 *   - Taxable income (with gross)
 *
 * Props:
 *   - estimate    : the tax estimate object, or null/undefined when
 *                   no estimate has been generated yet.
 *   - currency    : ISO currency code used by the default formatter.
 *   - fmt         : optional custom money formatter; overrides currency.
 *   - onAddIncome : optional callback fired by the empty-state button.
 *
 * Renders three states:
 *   1. No estimate yet  → prompt to generate one.
 *   2. No taxable activity → prompt to add an income transaction.
 *   3. Has activity → the four-card grid.
 * ————————————————————————————————————— */

import React from 'react';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function TaxEstimateCard({ estimate, currency = 'INR', fmt, onAddIncome }) {
  // ── Money formatter: use the custom formatter when provided,
  //    otherwise fall back to Intl with the currency prop. ──
  const money = (value) => fmt ? fmt(value) : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));

  // ── State 1: no estimate object yet ──
  if (!estimate) return <div className="tax-empty-panel">Generate an estimate after selecting a profile.</div>;

  // ── State 2: estimate exists but there is no taxable activity ──
  // Shows a call-to-action when an `onAddIncome` callback is provided.
  if (!estimate.hasTaxableActivity) return (
    <div className="tax-empty-panel tax-start-card">
      <h3>No taxable activity yet</h3>
      <p>Add an income transaction for this fiscal year to generate a useful estimate.</p>
      {onAddIncome && <button className="btn-primary" onClick={onAddIncome}>Add income transaction</button>}
    </div>
  );

  // ── State 3: render the four-card estimate grid ──
  return (
    <div className="tax-estimate-grid">
      {/* ── Card: Estimated liability (emphasis) ── */}
      <div className="tax-number-card emphasis">
        <span>Estimated liability</span>
        <strong>{money(estimate.totalLiability)}</strong>
        <small>{estimate.hasTaxableActivity ? 'Based on recorded activity' : 'No taxable activity recorded'}</small>
      </div>

      {/* ── Card: Balance due (or refund expected) ── */}
      <div className="tax-number-card">
        <span>Balance due</span>
        <strong>{money(estimate.balanceDue)}</strong>
        <small>{estimate.refundExpected > 0 ? `Refund expected: ${money(estimate.refundExpected)}` : 'After recorded payments'}</small>
      </div>

      {/* ── Card: Effective rate (with marginal rate note) ── */}
      <div className="tax-number-card">
        <span>Effective rate</span>
        <strong>{estimate.effectiveRate}%</strong>
        <small>Marginal rate: {estimate.marginalRate}%</small>
      </div>

      {/* ── Card: Taxable income (with gross note) ── */}
      <div className="tax-number-card">
        <span>Taxable income</span>
        <strong>{money(estimate.taxableIncome)}</strong>
        <small>Gross: {money(estimate.grossIncome)}</small>
      </div>
    </div>
  );
}