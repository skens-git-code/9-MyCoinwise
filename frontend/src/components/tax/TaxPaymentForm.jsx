/* —————————————————————————————————————
 * Tax Payment Form
 * Controlled form for recording a tax payment against a profile.
 *
 * Props:
 *   - currency : ISO currency code sent with the payload.
 *   - onSubmit : callback receiving the normalized payment payload.
 *   - onCancel : callback fired when the user cancels.
 *   - isSaving : when true, disables the submit button and shows a
 *                "Saving…" label.
 *
 * Fields:
 *   - amount        : positive number, required.
 *   - payment_date  : ISO date, defaults to today.
 *   - payment_type  : one of advance_tax, tds, quarterly,
 *                     self_assessment, or other.
 *   - reference     : free-form reference (max 100 chars).
 *   - notes         : free-form notes (max 500 chars).
 * ————————————————————————————————————— */

import React, { useState } from 'react';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function TaxPaymentForm({ currency, onSubmit, onCancel, isSaving }) {
  // ── Form state — payment_date defaults to today's local date ──
  const [form, setForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_type: 'advance_tax',
    reference: '',
    notes: '',
  });

  // ── Update a single field without losing the rest of the state ──
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  // ── Submit handler: prevent default, normalize amount, include currency ──
  const submit = (event) => {
    event.preventDefault();
    onSubmit({ ...form, amount: Number(form.amount), currency });
  };

  return (
    <form className="tax-form" onSubmit={submit}>
      {/* ── Grid: main payment fields ── */}
      <div className="tax-form-grid">
        {/* ── Amount ── */}
        <label>
          Amount
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            required
          />
        </label>

        {/* ── Payment date ── */}
        <label>
          Payment date
          <input
            type="date"
            value={form.payment_date}
            onChange={(e) => set('payment_date', e.target.value)}
            required
          />
        </label>

        {/* ── Payment type ── */}
        <label>
          Payment type
          <select
            value={form.payment_type}
            onChange={(e) => set('payment_type', e.target.value)}
          >
            <option value="advance_tax">Advance tax</option>
            <option value="tds">TDS</option>
            <option value="quarterly">Quarterly</option>
            <option value="self_assessment">Self-assessment</option>
            <option value="other">Other</option>
          </select>
        </label>

        {/* ── Reference ── */}
        <label>
          Reference
          <input
            value={form.reference}
            onChange={(e) => set('reference', e.target.value)}
            maxLength={100}
          />
        </label>
      </div>

      {/* ── Notes ── */}
      <label>
        Notes
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          maxLength={500}
          rows={2}
        />
      </label>

      {/* ── Actions: cancel and submit ── */}
      <div className="tax-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Record payment'}
        </button>
      </div>
    </form>
  );
}