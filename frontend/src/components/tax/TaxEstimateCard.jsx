import React from 'react';

export default function TaxEstimateCard({ estimate, currency = 'INR', fmt, onAddIncome }) {
  const money = (value) => fmt ? fmt(value) : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
  if (!estimate) return <div className="tax-empty-panel">Generate an estimate after selecting a profile.</div>;
  if (!estimate.hasTaxableActivity) return <div className="tax-empty-panel tax-start-card"><h3>No taxable activity yet</h3><p>Add an income transaction for this fiscal year to generate a useful estimate.</p>{onAddIncome && <button className="btn-primary" onClick={onAddIncome}>Add income transaction</button>}</div>;
  return (
    <div className="tax-estimate-grid">
      <div className="tax-number-card emphasis"><span>Estimated liability</span><strong>{money(estimate.totalLiability)}</strong><small>{estimate.hasTaxableActivity ? 'Based on recorded activity' : 'No taxable activity recorded'}</small></div>
      <div className="tax-number-card"><span>Balance due</span><strong>{money(estimate.balanceDue)}</strong><small>{estimate.refundExpected > 0 ? `Refund expected: ${money(estimate.refundExpected)}` : 'After recorded payments'}</small></div>
      <div className="tax-number-card"><span>Effective rate</span><strong>{estimate.effectiveRate}%</strong><small>Marginal rate: {estimate.marginalRate}%</small></div>
      <div className="tax-number-card"><span>Taxable income</span><strong>{money(estimate.taxableIncome)}</strong><small>Gross: {money(estimate.grossIncome)}</small></div>
    </div>
  );
}
