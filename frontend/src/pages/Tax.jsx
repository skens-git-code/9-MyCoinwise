/* —————————————————————————————————————
 * Tax Center Page
 * End-to-end tax workspace that lets users:
 *   - Create / select a tax profile (India or US).
 *   - See a tax estimate, brackets, and breakdown.
 *   - Tag deductions, record payments, index documents.
 *   - Preview / export a yearly report (CSV, print/PDF).
 *
 * Sections (tabs):
 *   overview | deductions | capital | payments | documents | reports
 *
 * Key behaviors:
 *   - Only non-deleted expense transactions in the fiscal year are used.
 *   - Deadlines shown in the advance-tax calendar are informational only.
 *   - Documents are encrypted at rest; this form indexes the reference.
 *   - Duplicate deduction claims are rejected by the server.
 * ————————————————————————————————————— */

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, CheckCircle2, Circle, Download, FileText, Plus, RefreshCw, Trash2, Wallet, X } from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api } from '../services/api';
import { useToast } from '../components/ToastProvider';
import TaxDisclaimer from '../components/tax/TaxDisclaimer';
import TaxProfileForm from '../components/tax/TaxProfileForm';
import TaxEstimateCard from '../components/tax/TaxEstimateCard';
import TaxBracketChart from '../components/tax/TaxBracketChart';
import TaxPaymentForm from '../components/tax/TaxPaymentForm';

/* ============================================================
 * Constants and Local Helpers
 * ============================================================ */

// ── Tab ids and labels ──
const TABS = [['overview', 'Overview'], ['deductions', 'Deductions'], ['capital', 'Capital Gains'], ['payments', 'Payments'], ['documents', 'Documents'], ['reports', 'Reports']];

// ── Allowed deduction treatments ──
const TREATMENTS = ['deductible', 'business_expense', 'charity', 'medical', 'retirement', 'education', 'non_deductible'];

// ── App language → tax-appropriate locale ──
const LOCALE_MAP = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN' };

// ── Extract an id from a doc / plain object ──
const getId = (value) => String(value?._id || value?.id || '');

// ── Resolve the display locale for a profile's jurisdiction ──
const resolveTaxLocale = (lang, jurisdiction) => jurisdiction === 'IN' ? (LOCALE_MAP[lang] || 'en-IN') : (LOCALE_MAP[lang] || 'en-US');

// ── Fiscal-year label per jurisdiction (India shows a range) ──
const fiscalYearLabel = (profile) => profile?.jurisdiction === 'IN' ? `FY ${profile.fiscal_year}-${String(Number(profile.fiscal_year) + 1).slice(-2)}` : `FY ${profile?.fiscal_year || ''}`;

// ── Locale-aware short date ──
const formatTaxDate = (value, locale = 'en-IN') => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }); };

// ── Locale-aware date + time ──
const formatTaxDateTime = (value, locale = 'en-IN') => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not saved yet' : date.toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };

// ── Shift a date by N years (UTC-safe) ──
const shiftDateByYear = (date, years) => { const shifted = new Date(date); shifted.setUTCFullYear(shifted.getUTCFullYear() + years); return shifted; };

/* ============================================================
 * Main Component
 * ============================================================ */
export default function Tax() {
  // ── App context: user, transactions, currency, i18n ──
  const { user, transactions = [], currency = 'INR', t, lang } = useContext(AppContext);
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ── Translation helper with inline fallback ──
  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  /* ---------------- State ---------------- */

  // ── Data state: profiles and everything derived from the selected one ──
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [ruleSet, setRuleSet] = useState(null);
  const [tagged, setTagged] = useState([]);
  const [payments, setPayments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [capitalGains, setCapitalGains] = useState(null);
  const [regimeCompare, setRegimeCompare] = useState(null);

  // ── UI state: active tab, loading, error, modals ──
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  // ── Form state: deduction tag, document index ──
  const [tagForm, setTagForm] = useState({ transaction_id: '', treatment: 'deductible', portion: 100, note: '' });
  const [documentForm, setDocumentForm] = useState({ label: '', document_type: 'receipt', file_url: '', file_size: 0, mime_type: 'application/pdf', notes: '' });

  // ── Report preview data ──
  const [report, setReport] = useState(null);

  /* ============================================================
   * Derived Data
   * ============================================================ */

  // ── Currently selected profile (falls back to the first) ──
  const profile = useMemo(() => profiles.find((item) => getId(item) === selectedId) || profiles[0] || null, [profiles, selectedId]);

  // ── Locale derived from the profile's jurisdiction ──
  const taxLocale = useMemo(() => resolveTaxLocale(lang, profile?.jurisdiction), [lang, profile?.jurisdiction]);

  // ── Expense transactions eligible for tagging (not deleted, not future) ──
  const taxTransactions = useMemo(() => transactions.filter((tx) => tx?.is_deleted !== true && tx.type === 'expense' && new Date(tx.date) <= new Date()), [transactions]);

  // ── Currency formatter using the profile's currency when set ──
  const money = useCallback((value) => {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const taxCurrency = profile?.currency || currency;
    try { return new Intl.NumberFormat(taxLocale, { style: 'currency', currency: taxCurrency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount); } catch { return `${taxCurrency} ${amount.toFixed(2)}`; }
  }, [currency, profile?.currency, taxLocale]);

  const profileName = profile?.name || '';

  /* ============================================================
   * Data Loading
   * ============================================================ */

  // ── Load all tax profiles for the user ──
  const loadProfiles = useCallback(async () => { setLoading(true); setError(''); try { const result = await api.getTaxProfiles(); const next = Array.isArray(result?.profiles) ? result.profiles : []; setProfiles(next); setSelectedId((current) => current && next.some((item) => getId(item) === current) ? current : getId(next[0])); } catch (err) { setError(err?.response?.data?.error || 'Tax Center is unavailable. Enable FEATURE_TAX_MODULE on the server.'); } finally { setLoading(false); } }, []);

  // ── Load estimate, tags, payments, documents, and capital gains for a profile ──
  const loadProfileData = useCallback(async (selectedProfile) => {
    if (!selectedProfile) { setEstimate(null); setRuleSet(null); setTagged([]); setPayments([]); setDocuments([]); setCapitalGains(null); return; }
    setBusy(true); setError('');
    try {
      const [estimateResult, taggedResult, paymentsResult, documentsResult, gainsResult] = await Promise.all([api.estimateTax(getId(selectedProfile)), api.getTaxTaggedTransactions({ profile_id: getId(selectedProfile) }), api.getTaxPayments({ profile_id: getId(selectedProfile) }), api.getTaxDocuments({ profile_id: getId(selectedProfile) }), api.estimateCapitalGainsTax(getId(selectedProfile))]);
      setEstimate(estimateResult?.estimate || null); setRuleSet(estimateResult?.ruleSet || null); setTagged(taggedResult?.transactions || []); setPayments(paymentsResult?.payments || []); setDocuments(documentsResult?.documents || []); setCapitalGains(gainsResult?.capital_gains || null); setRegimeCompare(null);
    } catch (err) { setEstimate(null); setRuleSet(null); setCapitalGains(null); setError(err?.response?.data?.error || 'Tax rules or tax data are not available for this profile yet.'); } finally { setBusy(false); }
  }, []);

  // ── Load profiles on mount ──
  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // ── Reload profile data whenever the selected profile changes ──
  useEffect(() => { loadProfileData(profile); }, [profile, loadProfileData]);

  /* ============================================================
   * Handlers
   * ============================================================ */

  // ── Create or update the current tax profile ──
  const createOrUpdateProfile = async (form) => { setBusy(true); try { const result = editingProfile ? await api.updateTaxProfile(getId(editingProfile), { ...form, _version: editingProfile._version }) : await api.createTaxProfile(form); const nextProfile = result.profile; setProfiles((current) => editingProfile ? current.map((item) => getId(item) === getId(nextProfile) ? nextProfile : item) : [nextProfile, ...current]); setSelectedId(getId(nextProfile)); setEditingProfile(null); setShowProfileForm(false); if (result.warning) showToast('info', result.warning); else showToast('success', 'Tax profile saved.'); } catch (err) { showToast('error', err?.response?.data?.error || 'Unable to save tax profile.'); } finally { setBusy(false); } };

  // ── Delete the current profile (with associated tags / payments / documents) ──
  const deleteProfile = async () => { if (!profile || !window.confirm('Delete this tax profile and its tags, payments, and documents?')) return; try { await api.deleteTaxProfile(getId(profile)); setProfiles((current) => current.filter((item) => getId(item) !== getId(profile))); setSelectedId(''); showToast('success', 'Tax profile deleted.'); } catch (err) { showToast('error', err?.response?.data?.error || 'Unable to delete profile.'); } };

  // ── Tag a transaction for tax ──
  const tagTransaction = async (event) => { event.preventDefault(); if (!profile || !tagForm.transaction_id) return; try { await api.tagTransactionForTax({ ...tagForm, profile_id: getId(profile), portion: Number(tagForm.portion) }); setTagForm({ transaction_id: '', treatment: 'deductible', portion: 100, note: '' }); await loadProfileData(profile); showToast('success', 'Transaction tagged for tax.'); } catch (err) { showToast('error', err?.response?.data?.error || 'Unable to tag transaction.'); } };

  // ── Record a new tax payment ──
  const addPayment = async (data) => { try { await api.createTaxPayment({ ...data, profile_id: getId(profile) }); setShowPaymentForm(false); await loadProfileData(profile); showToast('success', 'Payment recorded.'); } catch (err) { showToast('error', err?.response?.data?.error || 'Unable to record payment.'); } };

  // ── Index a new tax document reference ──
  const addDocument = async (event) => { event.preventDefault(); try { await api.createTaxDocument({ ...documentForm, profile_id: getId(profile), file_size: Number(documentForm.file_size) }); setDocumentForm({ label: '', document_type: 'receipt', file_url: '', file_size: 0, mime_type: 'application/pdf', notes: '' }); await loadProfileData(profile); showToast('success', 'Document reference saved.'); } catch (err) { showToast('error', err?.response?.data?.error || 'Unable to save document reference.'); } };

  // ── Download the yearly report as CSV ──
  const downloadCsv = async () => { try { const data = await api.getTaxReport(getId(profile), 'csv'); const blob = new Blob([data], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `mycoinwise-tax-${profile.fiscal_year}.csv`; link.click(); URL.revokeObjectURL(url); showToast('success', 'Tax CSV downloaded.'); } catch (err) { showToast('error', err?.response?.data?.error || 'Unable to generate report.'); } };

  // ── Load the report as JSON for preview ──
  const loadReport = async () => { try { const result = await api.getTaxReport(getId(profile), 'json'); setReport(result?.report || result); } catch (err) { showToast('error', err?.response?.data?.error || 'Unable to load report.'); } };

  // ── Compare India new vs. old regimes ──
  const compareIndiaRegimes = async () => { try { const result = await api.compareIndiaTaxRegimes(getId(profile)); setRegimeCompare(result?.comparison || null); } catch (err) { showToast('error', err?.response?.data?.error || 'Regime comparison is unavailable.'); } };

  /* ============================================================
   * Derived Computations
   * ============================================================ */

  // ── Advance-tax schedule (India only), shifted to the next cycle if all past ──
  const advanceTaxSchedule = useMemo(() => {
    if (!profile || profile.jurisdiction !== 'IN') return [];
    const cumulative = [15, 45, 75, 100];
    const source = Array.isArray(ruleSet?.advance_tax_schedule) && ruleSet.advance_tax_schedule.length ? ruleSet.advance_tax_schedule : (ruleSet?.advance_tax_dates || []).map((date, index) => ({ date, cumulative_percent: cumulative[index] || 100, installment_percent: index === 0 ? 15 : cumulative[index] - cumulative[index - 1] }));
    let schedule = source.map((item, index) => ({ ...item, date: new Date(item.date), cumulative_percent: Number(item.cumulative_percent ?? cumulative[index] ?? 100), installment_percent: Number(item.installment_percent ?? (index === 0 ? 15 : cumulative[index] - cumulative[index - 1])) })).filter((item) => !Number.isNaN(item.date.getTime()));
    const now = new Date(); let cycles = 0;
    while (schedule.length && schedule.every((item) => item.date < now) && cycles < 5) { schedule = schedule.map((item) => ({ ...item, date: shiftDateByYear(item.date, 1), nextFiscalYear: true })); cycles += 1; }
    const nextIndex = schedule.findIndex((item) => item.date >= now);
    return schedule.map((item, index) => ({ ...item, isNext: index === (nextIndex === -1 ? schedule.length - 1 : nextIndex) }));
  }, [profile, ruleSet]);

  // ── Total TDS recorded across all payments ──
  const tdsTotal = useMemo(() => payments.filter((payment) => payment.payment_type === 'tds').reduce((sum, payment) => sum + Number(payment.amount || 0), 0), [payments]);

  // ── Readiness checklist: income, deductions, documents, tax id ──
  const readiness = useMemo(() => { const checks = [Boolean(estimate?.hasTaxableActivity), tagged.length > 0, documents.length > 0, Boolean(profile?.tax_id_last4)]; return { percent: checks.filter(Boolean).length * 25, checks }; }, [estimate?.hasTaxableActivity, tagged.length, documents.length, profile?.tax_id_last4]);

  // ── Whether the profile has any taxable activity ──
  const hasActivity = Boolean(estimate?.hasTaxableActivity);

  // ── Route user to the transactions page to add income ──
  const addIncomeTransaction = () => navigate('/transactions');

  /* ============================================================
   * Render
   * ============================================================ */

  // ── Loading skeleton ──
  if (loading) return <main className="page-shell tax-page"><div className="tax-skeleton" /><div className="tax-skeleton wide" /></main>;
  return (
    <main className="page-shell tax-page">
      {/* ===================== Header ===================== */}
      <div className="tax-header"><div><span className="eyebrow"><FileText size={14} /> Your tax workspace</span><h1>{tr('tax_center', 'Tax Center')}</h1><p>Estimate, organize, and export your tax records without filing on your behalf.</p></div><div className="tax-header-actions">{profile && <><select aria-label="Tax profile" value={getId(profile)} onChange={(event) => setSelectedId(event.target.value)}>{profiles.map((item) => <option key={getId(item)} value={getId(item)}>{item.name} · {fiscalYearLabel(item)}</option>)}</select><button className="btn-secondary" onClick={() => { setEditingProfile(profile); setShowProfileForm(true); }}>Edit profile</button><button className="btn-primary" onClick={() => { setEditingProfile(null); setShowProfileForm(true); }}><Plus size={16} /> New profile</button></>}</div></div>

      {/* ── Disclaimer banner ── */}
      <TaxDisclaimer />

      {/* ── Error banner with retry ── */}
      {error && <div className="tax-error"><AlertTriangle size={17} /> <span>{error}</span><button type="button" onClick={() => loadProfileData(profile)} aria-label="Retry"><RefreshCw size={15} /></button></div>}

      {/* ── Empty state when no profile exists yet ── */}
      {!profile ? <section className="tax-empty-state glass"><div className="tax-empty-icon"><Wallet size={28} /></div><h2>No tax profile yet</h2><p>Create a profile to calculate an estimate. Your transactions remain unchanged until you explicitly tag them.</p><button className="btn-primary" onClick={() => setShowProfileForm(true)}><Plus size={16} /> Create first profile</button></section> : <>
        {/* ===================== Profile strip ===================== */}
        <section className="tax-profile-strip glass"><div><span className="tax-kicker">{profile.jurisdiction === 'IN' ? 'India' : 'United States'} · {fiscalYearLabel(profile)}</span><h2>{profileName}</h2><p>{profile.filing_status.replaceAll('_', ' ')} · {profile.dependents || 0} dependents · {profile.tax_regime === 'old' ? 'Old regime' : profile.tax_regime === 'new' ? 'New regime' : 'Federal'}</p></div><div className="tax-strip-stats"><div><span>Recorded income</span><strong>{money(estimate?.grossIncome)}</strong></div><div><span>Payments</span><strong>{money(estimate?.paymentsMade)}</strong></div><div><span>Last updated</span><strong>{busy ? 'Refreshing…' : formatTaxDateTime(profile.updated_at, taxLocale)}</strong></div></div><button className="icon-button" onClick={deleteProfile} title="Delete tax profile" aria-label="Delete tax profile"><Trash2 size={17} /></button></section>

        {/* ===================== Tabs ===================== */}
        <nav className="tax-tabs" aria-label="Tax Center sections">{TABS.map(([id, label]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>)}</nav>

        {/* ===================== Overview tab ===================== */}
        {activeTab === 'overview' && <section className="tax-content-grid"><div className="tax-main-column">
          {/* ── Estimate card ── */}
          <TaxEstimateCard estimate={estimate} currency={profile.currency} fmt={money} onAddIncome={addIncomeTransaction} />

          {/* ── India-only regime comparison ── */}
          {profile.jurisdiction === 'IN' && <div className="tax-panel glass"><div className="tax-panel-header"><div><h3>Old vs new regime</h3><p>You are currently using the <strong>{profile.tax_regime === 'old' ? 'old' : 'new'}</strong> regime.</p></div><button className="btn-secondary tax-compare-cta" onClick={compareIndiaRegimes}>Compare regimes</button></div>{regimeCompare && <div className="tax-regime-compare"><div className={profile.tax_regime === 'new' ? 'selected' : ''}><span>New regime</span><strong>{money(regimeCompare.new?.totalLiability)}</strong><small>Effective {regimeCompare.new?.effectiveRate}%</small></div><div className={profile.tax_regime === 'old' ? 'selected' : ''}><span>Old regime</span><strong>{money(regimeCompare.old?.totalLiability)}</strong><small>Effective {regimeCompare.old?.effectiveRate}%</small></div></div>}</div>}

          {/* ── Tax breakdown list ── */}
          {hasActivity && <div className="tax-panel glass"><div className="tax-panel-header"><div><h3>Tax breakdown</h3><p>Only transactions inside the profile’s fiscal year are used.</p></div>{busy && <RefreshCw className="spin" size={16} />}</div><div className="tax-breakdown-list"><div><span>Gross income</span><strong>{money(estimate?.grossIncome)}</strong></div><div><span>Pre-tax contributions</span><strong>− {money(estimate?.preTaxContributions)}</strong></div><div><span>Standard deduction</span><strong>− {money(estimate?.standardDeductionApplied)}</strong></div><div><span>Itemized and tagged deductions</span><strong>− {money(estimate?.itemizedDeductionsApplied)}</strong></div><div><span>Tax before credits</span><strong>{money(estimate?.taxBeforeCredits)}</strong></div><div><span>Credits / rebate</span><strong>− {money(estimate?.creditsApplied)}</strong></div><div className="total"><span>Total liability</span><strong>{money(estimate?.totalLiability)}</strong></div></div></div>}

          {/* ── Bracket chart + accessible table ── */}
          <div className="tax-panel glass"><div className="tax-panel-header"><div><h3>Tax brackets</h3><p>Text table included for accessibility.</p></div><BarChart3 size={18} /></div><TaxBracketChart brackets={ruleSet?.brackets} currency={profile.currency} fmt={money} /></div>

          {/* ── TDS reconciliation panel ── */}
          <div className="tax-panel glass"><div className="tax-panel-header"><div><h3>TDS and withholding</h3><p>Reconcile employer or other withholding against this estimate.</p></div><div style={{ display: 'flex', gap: 8 }}><button className="btn-primary" style={{ fontSize: '0.78rem', padding: '6px 12px' }} onClick={() => setShowPaymentForm(true)}><Plus size={14} /> Record TDS / Payment</button><button className="btn-secondary" style={{ fontSize: '0.78rem', padding: '6px 12px' }} onClick={() => setActiveTab('payments')}>Manage payments</button></div></div><div className="tax-tds-summary"><div><span>TDS recorded</span><strong>{money(tdsTotal)}</strong></div><div><span>Estimated liability</span><strong>{money(estimate?.totalLiability)}</strong></div><div><span>Net position</span><strong className={tdsTotal === 0 && Number(estimate?.totalLiability || 0) === 0 ? '' : tdsTotal >= Number(estimate?.totalLiability || 0) ? 'text-success' : 'text-danger'}>{tdsTotal === 0 && Number(estimate?.totalLiability || 0) === 0 ? 'No balance due' : tdsTotal >= Number(estimate?.totalLiability || 0) ? 'Potential refund' : 'Potential balance due'}</strong></div></div></div>
        </div><aside className="tax-side-column">
          {/* ── Advance-tax calendar (India only) ── */}
          <div className="tax-panel glass"><h3>Advance-tax calendar</h3>{!hasActivity ? <div className="tax-deadline neutral"><span>No advance tax required</span><strong>{money(0)} estimated liability</strong><small>Add income before relying on this estimate.</small></div> : advanceTaxSchedule.length ? <div className="tax-schedule-list">{advanceTaxSchedule.map((item) => { const payment = payments.find((entry) => ['advance_tax', 'quarterly', 'self_assessment'].includes(entry.payment_type) && Math.abs(new Date(entry.payment_date) - item.date) <= 45 * 86400000); return <div key={item.date.toISOString()} className={`tax-schedule-row ${item.isNext ? 'next' : ''} ${payment ? 'paid' : ''}`}><div><span>{item.isNext ? 'Next instalment' : item.nextFiscalYear ? 'Next fiscal cycle' : 'Advance tax'}</span><strong>{formatTaxDate(item.date, taxLocale)}</strong></div><div><b>{item.installment_percent}%</b><small>{item.cumulative_percent}% cumulative{payment ? ' · Paid' : ''}</small></div></div>; })}</div> : <p className="tax-muted">No advance-tax dates are available for this rule set.</p>}<p className="tax-muted">Deadlines are informational only and do not create filings or payments.</p></div>

          {/* ── Tax readiness checklist ── */}
          <div className="tax-panel glass"><div className="tax-panel-header"><h3>Tax readiness</h3><span className="tax-badge" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{readiness.checks.filter(Boolean).length} of {readiness.checks.length} completed</span></div><div className="tax-readiness"><div className="tax-readiness-ring">{readiness.percent}%</div><div className="tax-readiness-checklist" style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}><strong style={{ marginBottom: 2 }}>{readiness.percent === 0 ? 'Ready to begin' : readiness.percent === 100 ? 'All steps complete' : 'In progress'}</strong>{[
            { label: readiness.checks[0] ? 'Income activity recorded' : 'Add income activity', done: readiness.checks[0] },
            { label: readiness.checks[1] ? 'Deductions reviewed' : 'Review deductible expenses', done: readiness.checks[1] },
            { label: readiness.checks[2] ? 'Supporting documents added' : 'Add supporting documents', done: readiness.checks[2] },
            { label: readiness.checks[3] ? (profile?.jurisdiction === 'IN' ? 'PAN recorded' : 'Tax ID verified') : (profile?.jurisdiction === 'IN' ? 'Add PAN' : 'Add Tax ID (last 4)'), done: readiness.checks[3] },
          ].map((item, idx, arr) => {
            const isNext = !item.done && arr.slice(0, idx).every((x) => x.done);
            return (
              <div key={item.label} className={`tax-checklist-item ${item.done ? 'done' : ''} ${isNext ? 'next-action' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', padding: '4px 6px', borderRadius: 6, background: isNext ? 'rgba(var(--brand-primary-rgb), 0.08)' : 'transparent', fontWeight: isNext ? 600 : 400, color: item.done ? 'var(--text-primary)' : isNext ? 'var(--brand-primary)' : 'var(--text-muted)' }}>
                {item.done ? <CheckCircle2 size={15} style={{ color: '#10b981', flexShrink: 0 }} /> : <Circle size={15} style={{ color: isNext ? 'var(--brand-primary)' : 'var(--text-muted)', flexShrink: 0 }} />}
                <span>{item.label}</span>
                {isNext && <span className="tax-next-badge" style={{ marginLeft: 'auto' }}>NEXT</span>}
              </div>
            );
          })}</div></div></div>
        </aside></section>}

        {/* ===================== Deductions tab ===================== */}
        {activeTab === 'deductions' && <section className="tax-tab-panel glass"><div className="tax-panel-header"><div><h3>Deduction tracker</h3><p>Tag a transaction once; duplicate deduction claims are rejected.</p></div><span className="tax-total-badge">{money(estimate?.deductions?.total)}</span></div><form className="tax-inline-form" onSubmit={tagTransaction}><select aria-label="Transaction to tag" value={tagForm.transaction_id} onChange={(e) => setTagForm({ ...tagForm, transaction_id: e.target.value })}><option value="">Choose an expense…</option>{taxTransactions.map((tx) => <option key={getId(tx)} value={getId(tx)}>{tx.category} · {money(tx.amount)} · {formatTaxDate(tx.date, taxLocale)}</option>)}</select><select aria-label="Tax treatment" value={tagForm.treatment} onChange={(e) => setTagForm({ ...tagForm, treatment: e.target.value })}>{TREATMENTS.map((treatment) => <option key={treatment} value={treatment}>{treatment.replaceAll('_', ' ')}</option>)}</select><input aria-label="Deductible portion" type="number" min="0" max="100" value={tagForm.portion} onChange={(e) => setTagForm({ ...tagForm, portion: e.target.value })} /><button className="btn-primary" type="submit">Tag transaction</button></form><div className="tax-table-wrap"><table className="tax-data-table"><thead><tr><th>Date</th><th>Transaction</th><th>Treatment</th><th>Portion</th><th>Amount</th></tr></thead><tbody>{tagged.length ? tagged.map((row) => <tr key={getId(row.tag)}><td>{formatTaxDate(row.transaction.date, taxLocale)}</td><td>{row.transaction.merchant || row.transaction.category}</td><td>{row.tag.treatment.replaceAll('_', ' ')}</td><td>{row.tag.portion}%</td><td>{money(Number(row.transaction.amount) * Number(row.tag.portion || 100) / 100)}</td></tr>) : <tr><td colSpan="5" className="tax-muted">No tax tags for this fiscal year.</td></tr>}</tbody></table></div></section>}

        {/* ===================== Capital gains tab ===================== */}
        {activeTab === 'capital' && <section className="tax-tab-panel glass"><div className="tax-panel-header"><div><h3>Capital gains</h3><p>Sold Wealth items are classified by holding period. Losses are tracked separately.</p></div><a className="btn-secondary" href="/wealth">Manage assets</a></div>{capitalGains?.holdings?.length ? <><TaxEstimateCard estimate={{ totalLiability: capitalGains.total, balanceDue: capitalGains.total, effectiveRate: 0, marginalRate: 0, taxableIncome: capitalGains.shortTermGain + capitalGains.longTermGain, grossIncome: capitalGains.shortTermGain + capitalGains.longTermGain, hasTaxableActivity: true }} currency={profile.currency} fmt={money} /><div className="tax-table-wrap"><table className="tax-data-table"><thead><tr><th>Asset</th><th>Holding period</th><th>Classification</th><th>Gain / loss</th><th>Tax</th></tr></thead><tbody>{capitalGains.holdings.map((holding) => <tr key={holding.id}><td>{holding.name}</td><td>{holding.holdingDays} days</td><td>{holding.classification.replace('_', ' ')}</td><td className={holding.gain >= 0 ? 'text-success' : 'text-danger'}>{money(holding.gain)}</td><td>{money(holding.tax)}</td></tr>)}</tbody></table></div></> : <div className="tax-empty-panel">No sold assets have been recorded.</div>}</section>}

        {/* ===================== Payments tab ===================== */}
        {activeTab === 'payments' && <section className="tax-tab-panel glass"><div className="tax-panel-header"><div><h3>Payments and TDS</h3><p>Record-keeping only; no payment is initiated by MyCoinwise.</p></div><button className="btn-primary" onClick={() => setShowPaymentForm(true)}><Plus size={16} /> Add payment</button></div><div className="tax-payment-summary"><strong>{money(estimate?.paymentsMade)}</strong><span>recorded against {money(estimate?.totalLiability)} estimated liability · TDS: {money(tdsTotal)}</span></div><div className="tax-table-wrap"><table className="tax-data-table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Amount</th><th /></tr></thead><tbody>{payments.length ? payments.map((payment) => <tr key={getId(payment)}><td>{formatTaxDate(payment.payment_date, taxLocale)}</td><td>{payment.payment_type}</td><td>{payment.reference || '—'}</td><td>{money(payment.amount)}</td><td><button className="icon-button" onClick={async () => { await api.deleteTaxPayment(getId(payment)); await loadProfileData(profile); }} aria-label="Delete payment"><Trash2 size={15} /></button></td></tr>) : <tr><td colSpan="5" className="tax-muted">No payments recorded.</td></tr>}</tbody></table></div></section>}

        {/* ===================== Documents tab ===================== */}
        {activeTab === 'documents' && <section className="tax-tab-panel glass"><div className="tax-panel-header"><div><h3>Tax documents</h3><p>Indexed references are encrypted at rest. Files are not uploaded by this form.</p></div><span className="tax-muted">7-year retention reminder</span></div><form className="tax-inline-form tax-document-form" onSubmit={addDocument}><input aria-label="Document label" placeholder="Document label" value={documentForm.label} onChange={(e) => setDocumentForm({ ...documentForm, label: e.target.value })} required /><select aria-label="Document type" value={documentForm.document_type} onChange={(e) => setDocumentForm({ ...documentForm, document_type: e.target.value })}><option value="form16">Form 16</option><option value="w2">W-2</option><option value="1099">1099</option><option value="receipt">Receipt</option><option value="invoice">Invoice</option><option value="other">Other</option></select><input aria-label="Document URL" type="url" placeholder="Secure file URL" value={documentForm.file_url} onChange={(e) => setDocumentForm({ ...documentForm, file_url: e.target.value })} required /><input aria-label="File size in bytes" type="number" min="0" max={10 * 1024 * 1024} placeholder="File size (bytes)" value={documentForm.file_size} onChange={(e) => setDocumentForm({ ...documentForm, file_size: e.target.value })} required /><button className="btn-primary" type="submit">Index document</button></form><div className="tax-document-list">{documents.length ? documents.map((doc) => <article className="tax-document-row" key={getId(doc)}><FileText size={18} /><div><strong>{doc.label}</strong><span>{doc.document_type} · {formatTaxDate(doc.issue_date || doc.created_at, taxLocale)}</span></div><a href={doc.file_url || '#'} target="_blank" rel="noreferrer">Open</a><button className="icon-button" onClick={async () => { await api.deleteTaxDocument(getId(doc)); await loadProfileData(profile); }} aria-label="Delete document"><Trash2 size={15} /></button></article>) : <div className="tax-empty-panel">No documents indexed.</div>}</div></section>}

        {/* ===================== Reports tab ===================== */}
        {activeTab === 'reports' && <section className="tax-tab-panel glass tax-report"><div className="tax-panel-header"><div><h3>Yearly report</h3><p>Export a data summary for your professional review. MyCoinwise does not file returns.</p></div><div className="tax-header-actions"><button className="btn-secondary" onClick={loadReport}>Preview</button><button className="btn-secondary" onClick={downloadCsv}><Download size={15} /> CSV</button><button className="btn-primary" onClick={() => window.print()}><FileText size={15} /> Print / PDF</button></div></div><TaxDisclaimer />{report ? <pre className="tax-report-preview">{JSON.stringify(report, null, 2)}</pre> : <div className="tax-empty-panel">Preview the report before exporting.</div>}</section>}
      </>}

      {/* ===================== Profile form modal ===================== */}
      {showProfileForm && <div className="tax-modal-backdrop" role="presentation"><div className="tax-modal glass" role="dialog" aria-modal="true" aria-label="Tax profile form"><div className="tax-modal-header"><h2>{editingProfile ? 'Edit tax profile' : 'New tax profile'}</h2><button className="icon-button" onClick={() => { setShowProfileForm(false); setEditingProfile(null); }} aria-label="Close"><X size={18} /></button></div><TaxProfileForm user={user} initial={editingProfile} onSubmit={createOrUpdateProfile} onCancel={() => { setShowProfileForm(false); setEditingProfile(null); }} isSaving={busy} /></div></div>}

      {/* ===================== Payment form modal ===================== */}
      {showPaymentForm && <div className="tax-modal-backdrop" role="presentation"><div className="tax-modal glass" role="dialog" aria-modal="true" aria-label="Tax payment form"><div className="tax-modal-header"><h2>Record payment</h2><button className="icon-button" onClick={() => setShowPaymentForm(false)} aria-label="Close"><X size={18} /></button></div><TaxPaymentForm currency={profile.currency} onSubmit={addPayment} onCancel={() => setShowPaymentForm(false)} isSaving={busy} /></div></div>}
    </main>
  );
}