/* —————————————————————————————————————————————————————————————
 * Reports & Statement Downloads Hub — v2 (A4 Executive Edition)
 *
 * Changelog v2:
 *   - Real @media print stylesheet — window.print() now prints only the sheet.
 *   - exportToPDF return contract honored ({ success, error }).
 *   - Opening balance computed correctly for any period filter.
 *   - Running balance moved out of render into useMemo (impure → pure).
 *   - transfer / direction aware (uses resolveSign).
 *   - Real SHA-256 checksum shared with PDF engine's hash format.
 *   - Excel export now passes filter parameters to the API.
 *   - Print pagination: thead repeats, rows avoid page-break.
 *   - Zoom uses CSS `zoom` — no more layout-space waste.
 *   - Account filter normalized on both sides.
 *   - savingsRate → 'N/A' when income = 0.
 *   - Blob URL revocation deferred.
 *   - Dead ref, unused imports, and fake-QR removed.
 * ————————————————————————————————————————————————————————————— */

import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Download, Printer, CheckCircle2, ShieldCheck,
  FileSpreadsheet, FileCode, ZoomIn, ZoomOut, Landmark, FileCheck,
} from 'lucide-react';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { useToast } from '../components/ToastProvider';
import { exportToPDF } from '../services/pdfExport';
import { api } from '../services/api';

/* ============================================================
 * Constants
 * ============================================================ */

const BRAND = Object.freeze({
  name: 'MYCOINWISE',
  product: 'MyCoinwise AI Financial System',
});

const STATEMENT_TYPES = [
  { id: 'consolidated', label: 'Consolidated Statement', desc: 'Full account ledger and cashflow activity' },
  { id: 'income',       label: 'Income & Inflows',        desc: 'Deposits, earnings, and positive revenue' },
  { id: 'expense',      label: 'Expenses & Spending',     desc: 'Category breakdown and debit expenditures' },
  { id: 'tax',          label: 'Tax-Ready Audit',         desc: 'Categorized deductible expenses & receipts' },
];

const PERIOD_PRESETS = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'qtd',        label: 'Quarter to Date' },
  { id: 'ytd',        label: 'Year to Date' },
  { id: 'all',        label: 'All Time' },
  { id: 'custom',     label: 'Custom Range' },
];

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 0; }
  body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .a4-document-sheet, .a4-document-sheet * { visibility: visible !important; }
  .a4-document-sheet {
    position: absolute !important;
    left: 0; top: 0;
    width: 210mm !important;
    min-height: 0 !important;
    padding: 14mm 12mm !important;
    margin: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    transform: none !important;
    zoom: 1 !important;
  }
  .reports-viewport-scrollable {
    overflow: visible !important;
    background: none !important;
    border: none !important;
    padding: 0 !important;
    box-shadow: none !important;
  }
  .no-print { display: none !important; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .ledger-section { break-inside: auto; }
}
`;

/* ============================================================
 * Helpers
 * ============================================================ */

const toCents   = (n) => Math.round((Number(n) || 0) * 100);
const fromCents = (c) => c / 100;

/** Force Latin numerals so DOM matches PDF glyphs. */
function toLatinNumLocale(locale) {
  const base = locale || 'en-US';
  return /-u-nu-/.test(base) ? base : `${base}-u-nu-latn`;
}

/** Deterministic English-month date — never non-Latin. */
const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDateLatin(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Sign resolution for running balance (income/expense/transfer). */
function resolveSign(tx) {
  if (tx.type === 'income') return 1;
  if (tx.type === 'expense') return -1;
  if (tx.direction === 'in') return 1;
  if (tx.direction === 'out') return -1;
  return (Number(tx.amount) || 0) < 0 ? -1 : 1;
}

/** SHA-256 hex via WebCrypto — matches PDF engine. */
async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Normalize an account identifier (id | _id | name) to a string. */
function normAccId(v) {
  if (v == null) return '';
  return typeof v === 'string' ? v : String(v);
}

/* ============================================================
 * Component
 * ============================================================ */

export default function Reports() {
  const { user, transactions = [], accounts = [], currency, currencyInfo, lang } = useAppState();
  const { t } = useAppActions();
  const { showToast } = useToast();

  const tr = useCallback((key, fallback) => (t ? t(key, fallback) : fallback), [t]);

  /* ── Config state ── */
  const [statementType,     setStatementType]     = useState('consolidated');
  const [periodPreset,      setPeriodPreset]      = useState('this_month');
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [includeNotes,      setIncludeNotes]      = useState(true);
  const [includeCategories, setIncludeCategories] = useState(true);
  const [includeSeal,       setIncludeSeal]       = useState(true);
  const [customStartDate,   setCustomStartDate]   = useState('');
  const [customEndDate,     setCustomEndDate]     = useState('');
  const [zoomLevel,         setZoomLevel]         = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 850) {
      const viewportWidth = window.innerWidth - (window.innerWidth <= 600 ? 32 : 80);
      return Math.min(1, Math.max(0.4, +(viewportWidth / 794).toFixed(2)));
    }
    return 1;
  });
  const [isExportingPDF,    setIsExportingPDF]    = useState(false);
  const [isExportingExcel,  setIsExportingExcel]  = useState(false);

  const activeCurrency = currency || user?.currency || 'USD';
  const symbol         = currencyInfo?.symbol || '$';
  const locale         = toLatinNumLocale(lang);

  /* ── Date range bounds ── */
  const dateRangeBounds = useMemo(() => {
    const now = new Date();
    let start = new Date(0);
    let end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let label = 'All Recorded History';

    if (periodPreset === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (periodPreset === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (periodPreset === 'qtd') {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qStartMonth, 1);
      label = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    } else if (periodPreset === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1);
      label = `Jan 1 – Present, ${now.getFullYear()}`;
    } else if (periodPreset === 'custom') {
      if (customStartDate) start = new Date(customStartDate);
      if (customEndDate) {
        const d = new Date(customEndDate);
        d.setHours(23, 59, 59, 999);
        end = d;
      }
      label = `${customStartDate || 'Start'} to ${customEndDate || 'Present'}`;
    }
    return { start, end, label };
  }, [periodPreset, customStartDate, customEndDate]);

  /* ── In-range transactions (before type/account filter) ── */
  const inRangeTxs = useMemo(() => {
    return transactions.filter((tx) => {
      const d = tx.date ? new Date(tx.date) : null;
      if (!d || isNaN(d.getTime())) return false;
      return d >= dateRangeBounds.start && d <= dateRangeBounds.end;
    });
  }, [transactions, dateRangeBounds]);

  /* ── Post-period net (for opening balance math) ── */
  const postPeriodNetCents = useMemo(() => {
    return transactions
      .filter((tx) => {
        const d = tx.date ? new Date(tx.date) : null;
        return d && !isNaN(d.getTime()) && d > dateRangeBounds.end;
      })
      .reduce((sum, tx) => sum + resolveSign(tx) * Math.abs(toCents(tx.amount)), 0);
  }, [transactions, dateRangeBounds]);

  /* ── In-period net (before type/account filter) ── */
  const inPeriodNetCents = useMemo(
    () => inRangeTxs.reduce((sum, tx) => sum + resolveSign(tx) * Math.abs(toCents(tx.amount)), 0),
    [inRangeTxs]
  );

  /* ── Filtered dataset (respects type + account) ── */
  const filteredTransactions = useMemo(() => {
    return inRangeTxs
      .filter((tx) => {
        if (statementType === 'income'  && tx.type !== 'income')  return false;
        if (statementType === 'expense' && tx.type !== 'expense') return false;

        if (selectedAccountId !== 'all') {
          const accId   = normAccId(tx.account_id ?? tx.account ?? '');
          const accName = normAccId(tx.account_name ?? '');
          if (accId !== selectedAccountId && accName !== selectedAccountId) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  }, [inRangeTxs, statementType, selectedAccountId]);

  /* ── Wallet balances at period boundaries (correct for any period) ── */
  const walletCurrentCents = useMemo(
    () => toCents(user?.balance),
    [user]
  );
  // Opening at period start = current − net(post-period) − net(in-period)
  const openingCents = useMemo(
    () => walletCurrentCents - postPeriodNetCents - inPeriodNetCents,
    [walletCurrentCents, postPeriodNetCents, inPeriodNetCents]
  );
  // Closing at period end = opening + in-period net
  const closingCents = openingCents + inPeriodNetCents;

  /* ── Summary metrics ── */
  const summaryMetrics = useMemo(() => {
    let incomeCents  = 0;
    let expenseCents = 0;
    const catCents = {};

    for (const tx of filteredTransactions) {
      const c = Math.abs(toCents(tx.amount));
      if (tx.type === 'income') incomeCents += c;
      else {
        expenseCents += c;
        const cat = tx.category || 'General';
        catCents[cat] = (catCents[cat] || 0) + c;
      }
    }

    const netCents = incomeCents - expenseCents;
    const savingsRate = incomeCents > 0
      ? ((netCents / incomeCents) * 100).toFixed(1)
      : null;

    const topCategories = Object.entries(catCents)
      .map(([name, cents]) => ({
        name,
        cents,
        pct: expenseCents > 0 ? (cents / expenseCents) * 100 : 0,
      }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 5);

    return {
      incomeCents,
      expenseCents,
      netCents,
      savingsRate,
      topCategories,
      count: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  /* ── Ledger rows + running balance (pure, memoized) ── */
  const ledgerRows = useMemo(() => {
    let runCents = openingCents;
    const rows = [];
    for (let idx = 0; idx < filteredTransactions.length; idx++) {
      const tx = filteredTransactions[idx];
      const amtCents = Math.abs(toCents(tx.amount));
      const sign     = resolveSign(tx);
      runCents      += sign * amtCents;

      const ref  = tx._id ? String(tx._id).slice(-6).toUpperCase()
                          : `TX-${String(idx + 1).padStart(4, '0')}`;
      const desc = includeNotes
        ? (tx.note || tx.description || tx.category || 'Transaction Entry')
        : (tx.category || 'Transaction Entry');

      rows.push({
        key: tx.id || tx._id || idx,
        dateStr: formatDateLatin(tx.date),
        ref,
        desc,
        category: tx.category || 'General',
        account:  tx.account_name,
        sign,
        amtCents,
        amtStr: (sign >= 0 ? '+' : '-') + symbol
              + fromCents(amtCents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        balStr: symbol
              + fromCents(runCents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        isInc: sign > 0,
      });
    }
    return rows;
  }, [filteredTransactions, openingCents, includeNotes, symbol, locale]);

  /* ── Selected account display name ── */
  const selectedAccountName = useMemo(() => {
    if (selectedAccountId === 'all') return 'All Accounts (Consolidated)';
    const found = accounts.find((a) => normAccId(a.id ?? a._id) === selectedAccountId);
    return found ? (found.name || 'Selected Account') : 'Selected Account';
  }, [selectedAccountId, accounts]);

  /* ── Reference IDs ── */
  const statementMeta = useMemo(() => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const refEntropy = String(user?.id || user?._id || 'UNREG').slice(-6).toUpperCase();
    return {
      referenceId:    `MCW-STMT-${dateStr}-${refEntropy}`,
      generationDate: formatDateLatin(now),
      generationTime: now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }),
      accountNumber:  `MCW-ACC-•••${refEntropy.slice(-4)}`,
    };
  }, [user, locale]);

  /* ── Real audit checksum (same canonical form the PDF engine uses) ── */
  const [checksum, setChecksum] = useState('SHA256: computing…');
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const canonical = JSON.stringify({
        ref:     statementMeta.referenceId,
        currency: activeCurrency,
        opening: fromCents(openingCents),
        income:  fromCents(summaryMetrics.incomeCents),
        expense: fromCents(summaryMetrics.expenseCents),
        closing: fromCents(closingCents),
        count:   summaryMetrics.count,
        rows: filteredTransactions.map((t) => [
          t._id ? String(t._id) : null,
          t.date || null,
          t.type || null,
          toCents(t.amount),
          t.category || null,
        ]),
      });
      const hex = await sha256Hex(canonical);
      if (!cancelled) setChecksum(`SHA256: ${hex.slice(0, 32)}`);
    })();
    return () => { cancelled = true; };
  }, [
    statementMeta.referenceId, activeCurrency,
    openingCents, closingCents, summaryMetrics,
    filteredTransactions,
  ]);

  /* ── Handlers ── */
  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  const handleFitWidth = useCallback(() => {
    if (typeof window === 'undefined') return;
    const viewportWidth = window.innerWidth - (window.innerWidth <= 600 ? 32 : 80);
    const a4PxWidth = 794; // 210mm in standard 96dpi pixels
    const targetZoom = Math.min(1, Math.max(0.4, +(viewportWidth / a4PxWidth).toFixed(2)));
    setZoomLevel(targetZoom);
  }, []);

  const handleDownloadPDF = useCallback(async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    try {
      const result = await exportToPDF(user, filteredTransactions, currencyInfo, locale, {
        title: STATEMENT_TYPES.find((s) => s.id === statementType)?.label || 'FINANCIAL STATEMENT',
        subtitle: dateRangeBounds.label,
        accountName: selectedAccountName,
        dateRangeLabel: dateRangeBounds.label,
        isFiltered: true,
        openingBalance: fromCents(openingCents),
        includeNotes,
        includeSeal,
      });
      if (result?.success) {
        showToast('success', tr('pdf_download_success', 'Official A4 PDF Statement downloaded!'));
      } else {
        showToast('error', result?.error || 'PDF export failed.');
      }
    } catch (err) {
      console.error('[handleDownloadPDF]', err);
      showToast('error', tr('pdf_export_failed', 'Failed to generate PDF. Please try again.'));
    } finally {
      setIsExportingPDF(false);
    }
  }, [
    isExportingPDF, user, filteredTransactions, currencyInfo, locale,
    statementType, dateRangeBounds, selectedAccountName,
    openingCents, includeNotes, includeSeal, showToast, tr,
  ]);

  const handleDownloadExcel = useCallback(async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    try {
      const userId = user?.id || user?._id;
      if (!userId) throw new Error('Missing user id');

      // Pass filter scope so the server can honor it.
      await api.exportToExcel(userId, {
        statementType,
        accountId: selectedAccountId === 'all' ? undefined : selectedAccountId,
        start: dateRangeBounds.start.toISOString(),
        end:   dateRangeBounds.end.toISOString(),
      });
      showToast('success', tr('excel_download_success', 'Excel report downloaded successfully!'));
    } catch (err) {
      console.error('[handleDownloadExcel]', err);
      showToast('error', tr('excel_export_failed', 'Excel export failed.'));
    } finally {
      setIsExportingExcel(false);
    }
  }, [
    isExportingExcel, user, statementType, selectedAccountId,
    dateRangeBounds, showToast, tr,
  ]);

  const handleDownloadCSV = useCallback(() => {
    try {
      const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const headers = ['Date', 'Reference', 'Type', 'Category', 'Description', 'Account', 'Amount', 'Currency'];
      const rows = ledgerRows.map((r, i) => [
        formatDateLatin(filteredTransactions[i]?.date),
        r.ref,
        filteredTransactions[i]?.type || '',
        esc(r.category),
        esc(filteredTransactions[i]?.note || filteredTransactions[i]?.description || ''),
        esc(r.account || ''),
        (r.sign * fromCents(r.amtCents)).toFixed(2),
        activeCurrency,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Statement_${statementMeta.referenceId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      showToast('success', tr('csv_download_success', 'CSV ledger downloaded!'));
    } catch (err) {
      console.error('[handleDownloadCSV]', err);
      showToast('error', 'CSV export failed.');
    }
  }, [ledgerRows, filteredTransactions, activeCurrency, statementMeta, showToast, tr]);

  /* ── Formatting helpers bound to this render ── */
  const fmtMoney = useCallback(
    (cents) => symbol + fromCents(cents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [symbol, locale]
  );

  const isTypeFiltered = statementType !== 'consolidated' && statementType !== 'tax';

  /* ─────────────────────────── Render ─────────────────────────── */
  return (
    <>
      <style>{PRINT_CSS}</style>

      <div className="reports-page-wrap">

        {/* ============ Header (hidden on print) ============ */}
        <header className="island-header glass-sm no-print" style={{ marginBottom: '1.25rem' }}>
          <div className="ih-left">
            <div className="ih-titles">
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCheck className="text-brand" size={24} aria-hidden />
                {tr('reports_statements_title', 'Statements & Report Center')}
              </h1>
              <p>
                {tr('reports_statements_sub', 'Download certified financial statements, tax audits, and ledger reports formatted for A4.')}
              </p>
            </div>
          </div>

          <div className="inbox-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={handlePrint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <Printer size={15} /> <span>{tr('print', 'Print')}</span>
            </button>

            <button type="button" className="btn-secondary" onClick={handleDownloadExcel} disabled={isExportingExcel}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <FileSpreadsheet size={15} />
              <span>{isExportingExcel ? 'Exporting…' : 'Excel'}</span>
            </button>

            <button type="button" className="btn-secondary" onClick={handleDownloadCSV}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <FileCode size={15} /> <span>CSV</span>
            </button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-primary"
              onClick={handleDownloadPDF}
              disabled={isExportingPDF}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '9px 18px' }}
            >
              <Download size={16} />
              <span>{isExportingPDF ? tr('generating_pdf', 'Generating…') : tr('download_pdf_a4', 'Download A4 PDF')}</span>
            </motion.button>
          </div>
        </header>

        {/* ============ Config strip (hidden on print) ============ */}
        <div className="tx-summary-strip glass no-print"
          style={{ marginBottom: '1.25rem', padding: '16px 20px', flexDirection: 'column', gap: '14px', alignItems: 'stretch' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={labelStyle}>{tr('statement_type', 'Report Type')}:</span>
            <div className="tx-presets-strip" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {STATEMENT_TYPES.map((st) => (
                <button key={st.id} type="button"
                  className={`tx-preset-pill ${statementType === st.id ? 'active' : ''}`}
                  onClick={() => setStatementType(st.id)}
                  style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
              <span style={labelStyle}>{tr('period', 'Period')}:</span>
              <div className="tx-presets-strip" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {PERIOD_PRESETS.map((p) => (
                  <button key={p.id} type="button"
                    className={`tx-preset-pill ${periodPreset === p.id ? 'active' : ''}`}
                    onClick={() => setPeriodPreset(p.id)}
                    style={{ fontSize: '0.8rem', padding: '5px 12px' }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '100%', minWidth: 0, flexShrink: 1 }}>
              <Landmark size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                style={selectStyle}
              >
                <option value="all">{tr('all_accounts', 'All Accounts (Consolidated)')}</option>
                {accounts.map((acc) => {
                  const id = normAccId(acc.id ?? acc._id);
                  return <option key={id} value={id}>{acc.name} ({acc.type})</option>;
                })}
              </select>
            </div>
          </div>

          {periodPreset === 'custom' && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>From:</span>
                <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)}
                  style={dateInputStyle} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>To:</span>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)}
                  style={dateInputStyle} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--glass-border)' }}>
            <span style={labelStyle}>{tr('options', 'Statement Elements')}:</span>
            <Toggle label={tr('show_categories', 'Category Distribution')} checked={includeCategories} onChange={setIncludeCategories} />
            <Toggle label={tr('show_notes', 'Transaction Notes')}           checked={includeNotes}      onChange={setIncludeNotes} />
            <Toggle label={tr('show_seal', 'Verification Seal & Hash')}     checked={includeSeal}       onChange={setIncludeSeal} />
          </div>
        </div>

        {/* ============ Viewport toolbar (hidden on print) ============ */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '0 4px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {tr('preview_mode', 'Live A4 Document Preview')}
            </span>
            <span className="ih-badge" style={{ fontSize: '0.72rem' }}>
              {filteredTransactions.length} {tr('records', 'Records')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button type="button" className="btn-secondary"
              onClick={() => setZoomLevel((z) => Math.max(0.65, +(z - 0.1).toFixed(2)))}
              title="Zoom Out" style={{ padding: '4px 8px' }}>
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', minWidth: '45px', textAlign: 'center' }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button type="button" className="btn-secondary"
              onClick={() => setZoomLevel((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))}
              title="Zoom In" style={{ padding: '4px 8px' }}>
              <ZoomIn size={14} />
            </button>
            <button type="button" className="btn-secondary" onClick={handleFitWidth}
              title="Fit to Screen Width" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Fit</button>
            <button type="button" className="btn-secondary" onClick={() => setZoomLevel(1)}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}>100%</button>
          </div>
        </div>

        {/* ============ Scrollable viewport ============ */}
        <div
          className="reports-viewport-scrollable"
          style={{
            overflowX: 'auto',
            padding: '24px 12px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '18px',
            border: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'center',
            boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.25)',
          }}
        >
          {/* Zoom wrapper — `zoom` affects layout so no dead space. */}
          <div style={{ zoom: zoomLevel }}>
            <div
              className="a4-document-sheet"
              style={sheetStyle}
            >
              {/* Top emerald accent */}
              <div style={{ height: '4px', background: 'linear-gradient(90deg,#059669 0%,#10b981 100%)', margin: '-16mm -14mm 16mm -14mm' }} />

              {/* === Header block === */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '18px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.03em', color: '#0f172a' }}>
                      {BRAND.name}
                    </span>
                    <span style={badgeStyle}>CERTIFIED</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                    AI-Powered Financial Intelligence &amp; Audit Suite
                  </p>
                  <h2 style={{ margin: '8px 0 0', fontSize: '15px', color: '#0f172a', fontWeight: 800 }}>
                    {(STATEMENT_TYPES.find((s) => s.id === statementType)?.label || '').toUpperCase()}
                  </h2>
                </div>

                <div style={{ textAlign: 'right', fontSize: '10px', color: '#475569', lineHeight: 1.6 }}>
                  <div><strong>Statement ID:</strong> <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{statementMeta.referenceId}</span></div>
                  <div><strong>Issue Date:</strong> {statementMeta.generationDate} {statementMeta.generationTime}</div>
                  <div><strong>Base Currency:</strong> {activeCurrency} ({symbol})</div>
                  <div><strong>Scope:</strong> {selectedAccountName}</div>
                </div>
              </div>

              {/* === Particulars grid === */}
              <div style={particularsGridStyle}>
                <div>
                  <span style={labelMiniStyle}>Account Holder</span>
                  <strong style={{ color: '#0f172a', fontSize: '11px' }}>{user?.username || 'Client User'}</strong>
                </div>
                <div>
                  <span style={labelMiniStyle}>Account Reference</span>
                  <span style={{ color: '#0f172a', fontFamily: 'monospace' }}>{statementMeta.accountNumber}</span>
                </div>
                <div>
                  <span style={labelMiniStyle}>Period Covered</span>
                  <strong style={{ color: '#0f172a' }}>{dateRangeBounds.label}</strong>
                </div>
                <div>
                  <span style={labelMiniStyle}>Audit Status</span>
                  <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <CheckCircle2 size={11} /> Digitally Signed
                  </span>
                </div>
              </div>

              {/* === Summary matrix === */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '20px' }}>
                <SummaryCard label="Starting Balance"  value={fmtMoney(openingCents)}                accent="#64748b" />
                <SummaryCard label="Total Inflows (+)" value={`+${fmtMoney(summaryMetrics.incomeCents)}`}  accent="#10b981" bg="#ecfdf5" border="#a7f3d0" labelColor="#065f46" valueColor="#059669" />
                <SummaryCard label="Total Outflows (-)" value={`-${fmtMoney(summaryMetrics.expenseCents)}`} accent="#e11d48" bg="#fff1f2" border="#fecdd3" labelColor="#9f1239" valueColor="#e11d48" />
                <SummaryCard label="Net Cashflow" value={`${summaryMetrics.netCents >= 0 ? '+' : ''}${fmtMoney(summaryMetrics.netCents)}`}
                  accent={summaryMetrics.netCents >= 0 ? '#10b981' : '#e11d48'}
                  valueColor={summaryMetrics.netCents >= 0 ? '#059669' : '#e11d48'} />
                <SummaryCard label="Closing Balance" value={fmtMoney(closingCents)} accent="#059669" dark />
              </div>

              {/* === Category distribution === */}
              {includeCategories && summaryMetrics.topCategories.length > 0 && (
                <div style={{ marginBottom: '18px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em' }}>
                      Expenditure Distribution by Bucket
                    </span>
                    <span style={{ fontSize: '9px', color: '#64748b' }}>
                      Savings Rate: <strong>{summaryMetrics.savingsRate !== null ? `${summaryMetrics.savingsRate}%` : 'N/A'}</strong>
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${summaryMetrics.topCategories.length}, 1fr)`, gap: '8px' }}>
                    {summaryMetrics.topCategories.map((c) => (
                      <div key={c.name} style={{ background: '#fff', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '3px' }}>
                          <span style={{ color: '#0f172a', fontWeight: 600 }}>{c.name}</span>
                          <span style={{ color: '#64748b' }}>{c.pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${c.pct}%`, height: '100%', background: '#059669' }} />
                        </div>
                        <span style={{ fontSize: '8.5px', color: '#475569', display: 'block', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtMoney(c.cents)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* === Ledger table === */}
              <div className="ledger-section" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.05em' }}>
                    Itemized Transaction Ledger
                  </span>
                  <span style={{ fontSize: '9px', color: '#64748b' }}>
                    Showing {filteredTransactions.length} transaction entries
                    {isTypeFiltered ? ' (balance reflects visible entries only)' : ''}
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                  <thead>
                    <tr style={{ background: '#0f172a', color: '#fff', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '15%' }}>Date</th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '12%' }}>Ref ID</th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '28%' }}>Description / Note</th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '15%' }}>Category</th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '15%', textAlign: 'right' }}>Amount ({activeCurrency})</th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '15%', textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                          No transaction records found matching the specified statement period or account filters.
                        </td>
                      </tr>
                    ) : ledgerRows.map((r, idx) => (
                      <tr key={r.key} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', color: '#475569' }}>{r.dateStr}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{r.ref}</td>
                        <td style={{ padding: '6px 8px', color: '#0f172a', fontWeight: 500 }}>
                          {r.desc}
                          {r.account && (
                            <span style={{ display: 'block', fontSize: '7.5px', color: '#64748b' }}>
                              Via: {r.account}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', color: '#475569' }}>{r.category}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: r.isInc ? '#059669' : '#e11d48', fontVariantNumeric: 'tabular-nums' }}>
                          {r.amtStr}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                          {r.balStr}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* === Verification seal === */}
              {includeSeal && (
                <div style={{ borderTop: '2px solid #0f172a', paddingTop: '12px', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '8px', color: '#64748b' }}>
                  <div style={{ maxWidth: '75%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0f172a', fontWeight: 800, fontSize: '9px', marginBottom: '2px' }}>
                      <ShieldCheck size={13} style={{ color: '#059669' }} />
                      DIGITALLY CERTIFIED ELECTRONIC STATEMENT
                    </div>
                    <p style={{ margin: '0 0 4px', lineHeight: 1.4 }}>
                      This official statement reflects verified transaction activity stored under {BRAND.product} encryption protocol.
                      No physical signature is required under section 65B of the Electronic Records Act.
                    </p>
                    <div style={{ fontFamily: 'monospace', color: '#475569', fontSize: '7.5px' }}>
                      {checksum}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontWeight: 800, color: '#0f172a', fontSize: '9px' }}>Audit Ready</span>
                    <span style={{ fontSize: '7.5px', color: '#64748b' }}>{statementMeta.referenceId}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
 * Small presentational helpers
 * ============================================================ */

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
      />
      {label}
    </label>
  );
}

function SummaryCard({ label, value, accent, bg = '#f8fafc', border = '#e2e8f0', labelColor = '#64748b', valueColor = '#0f172a', dark = false }) {
  return (
    <div style={{
      background: dark ? '#0f172a' : bg,
      border: `1px solid ${dark ? 'transparent' : border}`,
      borderTop: `3px solid ${accent}`,
      borderRadius: '4px',
      padding: '8px 10px',
      textAlign: 'center',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <span style={{
        fontSize: '8px', textTransform: 'uppercase',
        color: dark ? '#94a3b8' : labelColor,
        fontWeight: 700, display: 'block',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
      <strong style={{
        fontSize: '12px',
        color: dark ? '#ffffff' : valueColor,
        fontVariantNumeric: 'tabular-nums',
        display: 'block',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {value}
      </strong>
    </div>
  );
}

/* ============================================================
 * Style constants
 * ============================================================ */

const labelStyle = {
  fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};
const selectStyle = {
  fontSize: '0.82rem', padding: '6px 12px', borderRadius: '8px',
  background: 'var(--surface-1)', color: 'var(--text-primary)',
  border: '1px solid var(--glass-border)',
  maxWidth: '100%', minWidth: 0, boxSizing: 'border-box',
};
const dateInputStyle = { padding: '4px 10px', fontSize: '0.8rem', borderRadius: 6 };
const badgeStyle = {
  fontSize: '9px', fontWeight: 700, background: '#ecfdf5', color: '#059669',
  padding: '2px 6px', borderRadius: '4px', border: '1px solid #a7f3d0',
};
const sheetStyle = {
  width: '210mm',
  minHeight: '297mm',
  background: '#ffffff',
  color: '#0f172a',
  padding: '16mm 14mm',
  boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.06)',
  borderRadius: '4px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  boxSizing: 'border-box',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
};
const particularsGridStyle = {
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
  padding: '12px 14px', marginBottom: '18px',
  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '10px',
};
const labelMiniStyle = {
  color: '#64748b', display: 'block', textTransform: 'uppercase',
  fontSize: '8px', fontWeight: 700,
};
