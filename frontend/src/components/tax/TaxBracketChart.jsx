import React from 'react';

export default function TaxBracketChart({ brackets = [], currency = 'INR', fmt }) {
  const money = (value) => fmt ? fmt(value) : new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0));
  return (
    <div className="tax-bracket-wrap">
      <div className="tax-bracket-bars" aria-label="Tax brackets visualization">
        {brackets.map((bracket, index) => { const lightness = Math.max(30, 76 - index * 8); return <div key={`${bracket.min}-${index}`} className="tax-bracket-bar" style={{ height: `${Math.max(14, Math.min(100, Number(bracket.rate || 0) * 260))}%`, background: `linear-gradient(180deg, hsl(158 72% ${lightness}%), hsl(158 62% ${Math.max(22, lightness - 16)}%))` }} title={`${Math.round(Number(bracket.rate || 0) * 100)}%`} aria-label={`${Math.round(Number(bracket.rate || 0) * 100)} percent tax bracket`}><span>{Math.round(Number(bracket.rate || 0) * 100)}%</span></div>; })}
      </div>
      <table className="tax-bracket-table"><caption className="sr-only">Tax bracket detail</caption><thead><tr><th>From</th><th>To</th><th>Rate</th></tr></thead><tbody>{brackets.map((bracket, index) => <tr key={`${bracket.min}-row-${index}`}><td>{money(bracket.min)}</td><td>{bracket.max == null ? 'and above' : money(bracket.max)}</td><td>{Math.round(Number(bracket.rate || 0) * 100)}%</td></tr>)}</tbody></table>
    </div>
  );
}
