/* —————————————————————————————————————
 * Tax Disclaimer Component
 * Renders a small inline notice reminding users that tax figures
 * shown elsewhere in the app are estimates and not tax advice.
 *
 * Props:
 *   - compact   : boolean, when true renders a tighter single-line
 *                 variant without the secondary sentence.
 *   - className : optional extra classes appended to the wrapper.
 *
 * Accessibility:
 *   - Wrapper uses role="note" so screen readers announce it as
 *     informational rather than an alert.
 *   - The warning icon is marked aria-hidden so it is not read out.
 * ————————————————————————————————————— */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function TaxDisclaimer({ compact = false, className = '' }) {
  return (
    // ── Wrapper: applies base classes plus the compact and custom modifiers ──
    <div className={`tax-disclaimer ${compact ? 'compact' : ''} ${className}`.trim()} role="note">
      {/* ── Warning icon (decorative, hidden from assistive tech) ── */}
      <AlertTriangle size={compact ? 15 : 18} aria-hidden="true" />

      {/* ── Text block: heading plus optional secondary sentence ── */}
      <div>
        {/* ── Primary message (always shown) ── */}
        <strong>This is an estimate, not tax advice.</strong>

        {/* ── Secondary message (shown only when not compact) ── */}
        {!compact && <span>Verify results with a qualified tax professional or the official tax authority before filing.</span>}
      </div>
    </div>
  );
}