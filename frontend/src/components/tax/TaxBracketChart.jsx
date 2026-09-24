/* —————————————————————————————————————
 * TaxBracketChart Component
 * Renders a progressive tax-bracket visualization as a bar chart
 * plus a detail table.
 *
 * Props:
 *   - brackets : array of { min, max, rate } bracket objects.
 *                `max == null` marks the top bracket.
 *   - currency : ISO currency code used by the default formatter.
 *   - fmt      : optional custom formatter; overrides `currency`.
 *
 * Key behaviors:
 *   - Bar heights are relative to the highest bracket rate (or 0.3).
 *   - Colors come from BRACKET_COLORS; the last color is reused when
 *     there are more brackets than colors.
 *   - Bar `height` has a 16% floor so zero-rate brackets remain visible.
 * ————————————————————————————————————— */

import React from 'react';

/* —————————————————————————————————————
 * Helpers
 * ————————————————————————————————————— */

// ── Format a slab's range as "<min> – <max>" or "<min>+" for the
//    top bracket (max == null). Uses the supplied money formatter. ──
const formatSlabLabel = (min, max, money) => {
  if (max == null) return `${money(min)}+`;
  return `${money(min)} – ${money(max)}`;
};

// ── Gradient palette for bracket bars, ordered from lowest to
//    highest rate. Indexed by bracket position. ──
const BRACKET_COLORS = [
  'linear-gradient(180deg, #10b981 0%, #059669 100%)',   // 0% - emerald
  'linear-gradient(180deg, #14b8a6 0%, #0d9488 100%)',   // 5% - teal
  'linear-gradient(180deg, #06b6d4 0%, #0891b2 100%)',   // 10% - cyan
  'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',   // 15% - amber
  'linear-gradient(180deg, #f97316 0%, #ea580c 100%)',   // 20% - orange
  'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)',   // 30%+ - red/rose
];

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function TaxBracketChart({ brackets = [], currency = 'INR', fmt }) {
  // ── Money formatter: use the custom formatter when provided,
  //    otherwise fall back to Intl with the currency prop. ──
  const money = (value) => {
    if (fmt) return fmt(value);
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  };

  // ── Highest rate across brackets (or 0.3) — used to scale bar heights ──
  const maxRate = Math.max(...brackets.map((b) => Number(b.rate || 0)), 0.3);

  return (
    <div className="tax-bracket-wrap">
      {/* ── Header: chart title and legend note ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Rate Progression by Slab
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Equal-width progressive slabs
        </span>
      </div>

      {/* ── Bar chart: one bar per bracket, height scaled by rate ── */}
      <div
        className="tax-bracket-bars"
        aria-label="Tax brackets rate progression visualization"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          height: 140,
          padding: '8px 4px',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        {brackets.map((bracket, index) => {
          // ── Rate as a whole-number percentage ──
          const ratePct = Math.round(Number(bracket.rate || 0) * 100);

          // ── Bar height relative to maxRate, with a 16% floor ──
          const heightPct = Math.max(16, Math.round((Number(bracket.rate || 0) / maxRate) * 100));

          // ── Reuse the last color when there are more brackets than colors ──
          const bg = BRACKET_COLORS[Math.min(index, BRACKET_COLORS.length - 1)];

          return (
            <div
              key={`${bracket.min}-${index}`}
              className="tax-bracket-bar-col"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                minWidth: 0,
              }}
            >
              {/* ── Rate label above the bar ── */}
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 4,
                }}
              >
                {ratePct}%
              </span>

              {/* ── The colored bar itself ── */}
              <div
                className="tax-bracket-bar"
                style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  background: bg,
                  borderRadius: '6px 6px 0 0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                  transition: 'height 0.3s ease',
                }}
                title={`Slab ${formatSlabLabel(bracket.min, bracket.max, money)}: ${ratePct}% tax`}
                aria-label={`Slab from ${bracket.min} to ${bracket.max ?? 'above'}: ${ratePct} percent`}
              />
            </div>
          );
        })}
      </div>

      {/* ── Detail table: numeric breakdown of each bracket ── */}
      <table className="tax-bracket-table">
        <caption className="sr-only">Tax bracket detail</caption>
        <thead>
          <tr>
            <th style={{ textAlign: 'right' }}>From</th>
            <th style={{ textAlign: 'right' }}>To</th>
            <th style={{ textAlign: 'right' }}>Rate</th>
          </tr>
        </thead>
        <tbody>
          {brackets.map((bracket, index) => (
            <tr key={`${bracket.min}-row-${index}`}>
              {/* ── Lower bound ── */}
              <td style={{ textAlign: 'right' }}>{money(bracket.min)}</td>

              {/* ── Upper bound, or "and above" for the top bracket ── */}
              <td style={{ textAlign: 'right' }}>{bracket.max == null ? 'and above' : money(bracket.max)}</td>

              {/* ── Rate as a whole-number percentage ── */}
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{Math.round(Number(bracket.rate || 0) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}