export const defaultTaxProfile = (user) => ({
  name: `${user?.currency === 'USD' ? 'My US Profile' : 'My India Profile'} — FY ${user?.currency === 'USD' ? 2024 : '2024-25'}`,
  jurisdiction: user?.currency === 'USD' ? 'US' : 'IN',
  fiscal_year: 2024,
  filing_status: 'single',
  tax_regime: user?.currency === 'USD' ? 'federal' : 'new',
  dependents: 0,
  residency_status: 'resident',
  currency: user?.currency || 'INR',
  notes: '',
});
