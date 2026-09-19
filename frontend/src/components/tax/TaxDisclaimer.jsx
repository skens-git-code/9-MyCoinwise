import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function TaxDisclaimer({ compact = false, className = '' }) {
  return (
    <div className={`tax-disclaimer ${compact ? 'compact' : ''} ${className}`.trim()} role="note">
      <AlertTriangle size={compact ? 15 : 18} aria-hidden="true" />
      <div>
        <strong>This is an estimate, not tax advice.</strong>
        {!compact && <span>Verify results with a qualified tax professional or the official tax authority before filing.</span>}
      </div>
    </div>
  );
}
