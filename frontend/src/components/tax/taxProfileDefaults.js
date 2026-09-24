/* —————————————————————————————————————
 * Default Tax Profile Factory
 * Builds a starter tax profile tailored to the user's preferred
 * currency, so the UI can pre-fill the create-profile form with
 * sensible defaults.
 *
 * Behaviour:
 *   - Currency 'USD' → US jurisdiction, federal regime, FY 2024.
 *   - Any other currency → India jurisdiction, new regime, FY 2024-25.
 *   - Other fields (filing_status, dependents, residency_status) use
 *     neutral defaults and can be edited by the user.
 * ————————————————————————————————————— */

// ── Build a default tax profile from a user object ──
export const defaultTaxProfile = (user) => ({
  // ── Display name varies by jurisdiction (US shows a single year,
  //    India shows the fiscal-year range "2024-25") ──
  name: `${user?.currency === 'USD' ? 'My US Profile' : 'My India Profile'} — FY ${user?.currency === 'USD' ? 2024 : '2024-25'}`,

  // ── Jurisdiction: US when the user's currency is USD, else India ──
  jurisdiction: user?.currency === 'USD' ? 'US' : 'IN',

  // ── Fiscal year (numeric) ──
  fiscal_year: 2024,

  // ── Filing status ──
  filing_status: 'single',

  // ── Tax regime: federal for US, new regime for India ──
  tax_regime: user?.currency === 'USD' ? 'federal' : 'new',

  // ── Number of dependents ──
  dependents: 0,

  // ── Residency classification ──
  residency_status: 'resident',

  // ── Currency: fall back to INR when the user has none ──
  currency: user?.currency || 'INR',

  // ── Free-form notes (empty by default) ──
  notes: '',
});