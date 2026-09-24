/* —————————————————————————————————————
 * Tax Profile Form
 * Controlled form for creating or editing a tax profile. Persists an
 * unsaved draft to localStorage (only in create mode) and restores
 * it on mount.
 *
 * Props:
 *   - user     : the current user; drives the default profile shape.
 *   - initial  : existing profile for edit mode. When provided, the
 *                draft system is disabled.
 *   - onSubmit : async callback receiving the normalized payload.
 *   - onCancel : callback fired when the user cancels.
 *   - isSaving : when true, disables submit and shows "Saving…".
 *
 * Draft behavior:
 *   - Draft is saved on every form change while in create mode.
 *   - Draft is cleared after a successful create.
 *   - Draft is never saved or read in edit mode.
 * ————————————————————————————————————— */

import React, { useEffect, useMemo, useState } from 'react';
import { defaultTaxProfile } from './taxProfileDefaults';

// ── localStorage key for the in-progress draft ──
const DRAFT_KEY = 'mcw-tax-profile-draft';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function TaxProfileForm({ user, initial = null, onSubmit, onCancel, isSaving = false }) {
  /* —————————————————————————————————————
   * Form State (with draft restore)
   * Initialization order:
   *   1. Edit mode → use `initial` directly.
   *   2. Create mode → merge any saved draft over the default profile.
   *   3. Fallback → default profile if the draft cannot be parsed.
   * ————————————————————————————————————— */
  const [form, setForm] = useState(() => {
    if (initial) return { ...initial };
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      return draft && typeof draft === 'object'
        ? { ...defaultTaxProfile(user), ...draft }
        : defaultTaxProfile(user);
    } catch { return defaultTaxProfile(user); }
  });

  // ── Persist the draft on every change (create mode only) ──
  useEffect(() => {
    if (!initial) localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form, initial]);

  // ── Merge a single field change into state ──
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  // ── Derived: is this an India profile? ──
  const isIndia = form.jurisdiction === 'IN';

  // ── Derived: submit gate — name must be non-empty and currency must
  //    be a 3-character string ──
  const canSubmit = useMemo(
    () => String(form.name || '').trim() && String(form.currency || '').length === 3,
    [form]
  );

  /* —————————————————————————————————————
   * Submit Handler
   * Normalizes fiscal_year, dependents, and currency before
   * dispatching onSubmit. Clears the draft only after a successful
   * create (never in edit mode).
   * ————————————————————————————————————— */
  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    await onSubmit({
      ...form,
      fiscal_year: Number(form.fiscal_year),
      dependents: Number(form.dependents),
      currency: String(form.currency).toUpperCase(),
    });

    if (!initial) localStorage.removeItem(DRAFT_KEY);
  };

  return (
    <form className="tax-form" onSubmit={submit}>
      {/* ── Grid: main profile fields ── */}
      <div className="tax-form-grid">

        {/* ── Profile name ── */}
        <label>
          Profile name
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={100}
            required
          />
        </label>

        {/* ── Jurisdiction: switching also resets tax_regime and currency
            to their jurisdiction-appropriate defaults. ── */}
        <label>
          Jurisdiction
          <select
            value={form.jurisdiction}
            onChange={(e) => {
              const jurisdiction = e.target.value;
              set('jurisdiction', jurisdiction);
              set('tax_regime', jurisdiction === 'US' ? 'federal' : 'new');
              set('currency', jurisdiction === 'US' ? 'USD' : 'INR');
            }}
          >
            <option value="IN">India</option>
            <option value="US">United States</option>
          </select>
        </label>

        {/* ── Fiscal year with a jurisdiction-aware helper note ── */}
        <label>
          Fiscal year
          <input
            type="number"
            min="2000"
            max="2100"
            value={form.fiscal_year}
            onChange={(e) => set('fiscal_year', e.target.value)}
            required
          />
          <small className="tax-field-help">
            {isIndia
              ? `India FY ${form.fiscal_year}-${String(Number(form.fiscal_year) + 1).slice(-2)}`
              : `US tax year ${form.fiscal_year}`}
          </small>
        </label>

        {/* ── Filing status ── */}
        <label>
          Filing status
          <select
            value={form.filing_status}
            onChange={(e) => set('filing_status', e.target.value)}
          >
            <option value="single">Single</option>
            <option value="married_joint">Married filing jointly</option>
            <option value="married_separate">Married filing separately</option>
            <option value="head_of_household">Head of household</option>
          </select>
        </label>

        {/* ── Tax regime: options depend on jurisdiction ── */}
        <label>
          Tax regime
          <select value={form.tax_regime} onChange={(e) => set('tax_regime', e.target.value)}>
            {isIndia ? (
              <>
                <option value="new">India — New regime</option>
                <option value="old">India — Old regime</option>
              </>
            ) : (
              <option value="federal">US — Federal</option>
            )}
          </select>
        </label>

        {/* ── Dependents ── */}
        <label>
          Dependents
          <input
            type="number"
            min="0"
            max="20"
            value={form.dependents}
            onChange={(e) => set('dependents', e.target.value)}
          />
        </label>

        {/* ── Currency: normalized to uppercase, capped at 3 chars ── */}
        <label>
          Currency
          <input
            value={form.currency}
            onChange={(e) => set('currency', e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3}
            required
          />
        </label>

        {/* ── Residency ── */}
        <label>
          Residency
          <select
            value={form.residency_status}
            onChange={(e) => set('residency_status', e.target.value)}
          >
            <option value="resident">Resident</option>
            <option value="non_resident">Non-resident</option>
            <option value="part_year">Part-year</option>
          </select>
        </label>

        {/* ── Tax ID (last 4 only): label varies by jurisdiction; input
            strips to uppercase A–Z / 0–9 and caps at 4 chars. ── */}
        <label>
          {isIndia ? 'PAN' : 'Tax ID'} (last 4 only)
          <input
            value={form.tax_id_last4 || ''}
            onChange={(e) => set('tax_id_last4', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
            maxLength={4}
            pattern="[A-Z0-9]{4}"
            inputMode="text"
            placeholder={isIndia ? 'ABCD' : '1234'}
          />
          <small className="tax-field-help">Never enter the full identifier.</small>
        </label>
      </div>

      {/* ── Notes ── */}
      <label>
        Notes
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Optional context for your own records"
        />
      </label>

      {/* ── Actions: cancel and submit (submit label varies by mode) ── */}
      <div className="tax-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!canSubmit || isSaving}>
          {isSaving ? 'Saving…' : initial ? 'Update profile' : 'Create profile'}
        </button>
      </div>

      {/* ── Footer note about the local draft ── */}
      <small className="tax-muted">Your draft is saved locally while you complete this form.</small>
    </form>
  );
}