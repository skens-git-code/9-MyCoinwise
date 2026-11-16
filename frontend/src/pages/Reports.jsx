/* —————————————————————————————————————————————————————————————
 * Reports & Statement Downloads Hub — v3 (A4 Executive Edition)
 *
 * Changelog v3 — Copy & Compliance Revision:
 *   - COPY constants synchronised with the PDF engine (identical strings
 *     on screen and in the exported document).
 *   - BRAND.tagline / BRAND.product aligned with the PDF engine.
 *   - Legal citation corrected (§65B, Indian Evidence Act, 1872).
 *   - Removed unused `CoinwiseMark` import.
 *   - Terminology standardised: Opening/Closing, Credits/Debits,
 *     Net Movement, Transaction Ledger, Running Balance, Electronically
 *     Authenticated, Verified for Audit, General Transaction, Uncategorised.
 *   - Toast messages rewritten in enterprise diagnostic tone.
 *   - Empty-state and loading-state copy aligned with the PDF engine.
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
 *   - savingsRate → 'Not applicable' when income = 0.
 *   - Blob URL revocation deferred.
 * ————————————————————————————————————————————————————————————— */

import React, { useState, useMemo, useCallback, useEffect } from 'react';

import { motion } from 'framer-motion';
import {
  Download, Printer, CheckCircle2, ShieldCheck,
  FileSpreadsheet, FileCode, ZoomIn, ZoomOut, Landmark, FileCheck,
} from 'lucide-react';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { useToast } from '../components/ToastProvider';
import {
  exportToPDF,
  cleanDescription,
  sanitizeDescription,
  cleanCategory,
  isValidTransactionDate,
  formatDateLatin,
  sha256Hex,
} from '../services/pdfExport';
import { api } from '../services/api';

/* ============================================================
 * Brand & canonical copy — must match ../services/pdfExport.js
 * ============================================================ */

const BRAND = Object.freeze({
  name: 'COINWISE',
  tagline: 'PERSONAL FINANCE & AUDIT MANAGEMENT PLATFORM',
  product: 'Coinwise Personal Finance & Audit Management Platform',
});

const COPY = Object.freeze({
  // Document titles
  statementTitle: 'OFFICIAL ACCOUNT STATEMENT',

  // Particulars strip
  labelAccountHolder: 'Account Holder',
  labelAccountRef: 'Account Reference',
  labelPeriod: 'Statement Period',
  labelIntegrity: 'Document Integrity',
  valueAuthenticated: 'Electronically Authenticated',
  valueAccountHolder: 'Registered Account Holder',
  defaultAccountScope: 'All Accounts — Consolidated',
  defaultPeriod: 'Complete Statement Period',

  // KPI cards
  kpiOpening: 'Opening Balance',
  kpiCredits: 'Total Credits',
  kpiDebits: 'Total Debits',
  kpiNet: 'Net Movement',
  kpiClosing: 'Closing Balance',

  // Expenditure breakdown
  expenditureHeading: 'Expenditure by Category',
  savingsRateLabel: 'Savings Rate:',
  savingsRateNA: 'Not applicable',

  // Ledger section
  ledgerHeading: 'Transaction Ledger',

  // Table headers
  colDate: 'Date',
  colRef: 'Reference',
  colDescription: 'Description',
  colCategory: 'Category',
  colAmount: 'Amount',
  colBalance: 'Running Balance',

  // Empty / loading states
  emptyState:
    'No transactions were recorded during the selected statement period or account filters.',
  loadingState: 'Retrieving verified statement data…',

  // Fallbacks
  defaultDescription: 'General Transaction',
  defaultCategory: 'Uncategorised',
  defaultMerchant: '—',

  // Continuation / footer
  footerText: 'Confidential Statement · Electronically Certified',

  // Certification seal
  sealHeading: 'ELECTRONICALLY CERTIFIED STATEMENT',
  sealStatement:
    'This statement reflects verified transaction activity stored under {product} security controls.',
  sealLegal:
    'No physical signature is required. This statement is valid under Section 65B of the Indian Evidence Act, 1872, and equivalent electronic-records legislation.',
  sealAuditStatus: 'Verified for Audit',
  sealChecksumPrefix: 'SHA256:',
  sealChecksumUnavailable:
    'Unavailable — checksum could not be computed in this environment',

  // Page-level chrome
  pageTitle: 'Statements & Report Center',
  pageSubtitle: 'Generate and export certified A4 statements and ledger reports.',
  previewMode: 'A4 Statement Preview',
  recordsBadgeSuffix: 'Records',
  exportInProgress: 'Exporting…',
  exportPDFInProgress: 'Generating…',
  downloadPDFLabel: 'Download A4 PDF',
  printLabel: 'Print',
  excelLabel: 'Excel',
  csvLabel: 'CSV',

  // Account line in ledger description
  accountPrefix: 'Account:',

  // Statement-type descriptions
  statementDescConsolidated: 'Complete account ledger and movement summary',
  statementDescIncome: 'Credits, deposits, and other income',
  statementDescExpense: 'Debit movements with category breakdown',
  statementDescTax: 'Deductible expenses and receipts for audit',

  // Period labels
  periodAllTime: 'Complete History',
});

const STATEMENT_TYPES = Object.freeze([
  { id: 'consolidated', label: 'Consolidated Statement', desc: COPY.statementDescConsolidated },
  { id: 'income',       label: 'Income Statement',       desc: COPY.statementDescIncome },
  { id: 'expense',      label: 'Expenditure Statement',  desc: COPY.statementDescExpense },
  { id: 'tax',          label: 'Tax Audit Statement',    desc: COPY.statementDescTax },
]);

const PERIOD_PRESETS = Object.freeze([
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'qtd',        label: 'Quarter to Date' },
  { id: 'ytd',        label: 'Year to Date' },
  { id: 'all',        label: COPY.periodAllTime },
  { id: 'custom',     label: 'Custom Range' },
]);

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 0; }
  body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .a4-document-sheet, .a4-document-sheet * { visibility: visible !important; }
  .reports-viewport-scrollable,
  .reports-viewport-scrollable > div {
    zoom: 1 !important;
  }
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

const toCents = (n) => {
  if (typeof n === 'string') {
    n = n.trim().replace(/[^0-9.-]+/g, '').replace(/\.+$|^\.+/g, '');
    const parts = n.split('.');
    if (parts.length > 2) {
      n = parts[0] + '.' + parts.slice(1).join('');
    }
  }
  return Math.round((Number(n) || 0) * 100);
};
const fromCents = (c) => c / 100;

/** Force Latin numerals so DOM matches PDF glyphs. */
function toLatinNumLocale(locale) {
  const base = locale || 'en-US';
  return /-u-nu-/.test(base) ? base : `${base}-u-nu-latn`;
}

/** Sign resolution for running balance (income / expense / transfer). */
function resolveSign(tx) {
  if (tx.type === 'income') return 1;
  if (tx.type === 'expense') return -1;
  if (tx.direction === 'in') return 1;
  if (tx.direction === 'out') return -1;
  return (Number(tx.amount) || 0) < 0 ? -1 : 1;
}

/** Normalise an account identifier (id | _id | name) to a string. */
function normAccId(v) {
  if (v == null) return '';
  return typeof v === 'string' ? v : String(v);
}

/** Safe CSV field escaping neutralising formula injection (=, +, -, @, \t, \r). */
function escapeCsvField(raw) {
  const str = raw == null ? '' : String(raw);
  const needsPrefix = /^[=+\-@\t\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  const prefixed = needsPrefix ? `'${escaped}` : escaped;
  const needsQuotes = needsPrefix || /[",\n\r\t]/.test(prefixed);
  return needsQuotes ? `"${prefixed}"` : prefixed;
}

/* ============================================================
 * Component
 * ============================================================ */

export default function Reports() {
  const { user, transactions = [], accounts = [], currency, currencyInfo, lang, loading: contextLoading } = useAppState();
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
    let label = COPY.defaultPeriod;

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
      if (customStartDate && customEndDate) {
        const [sy, sm, sd] = customStartDate.split('-').map(Number);
        const [ey, em, ed] = customEndDate.split('-').map(Number);
        let sDate = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
        let eDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);
        if (sDate > eDate) {
          sDate = new Date(ey, em - 1, ed, 0, 0, 0, 0);
          eDate = new Date(sy, sm - 1, sd, 23, 59, 59, 999);
        }
        start = sDate;
        end   = eDate;
        label = `${customStartDate} to ${customEndDate}`;
      } else if (customStartDate) {
        const [sy, sm, sd] = customStartDate.split('-').map(Number);
        start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
        label = `From ${customStartDate}`;
      } else if (customEndDate) {
        const [ey, em, ed] = customEndDate.split('-').map(Number);
        end   = new Date(ey, em - 1, ed, 23, 59, 59, 999);
        label = `Up to ${customEndDate}`;
      }
    }
    return { start, end, label };
  }, [periodPreset, customStartDate, customEndDate]);

  /* ── Transactions scoped to the selected account (or all) ── */
  const scopedTransactions = useMemo(() => {
    if (selectedAccountId === 'all') return transactions;
    return transactions.filter((tx) => {
      const accId   = normAccId(tx.account_id ?? tx.account ?? '');
      const accName = normAccId(tx.account_name ?? '');
      return accId === selectedAccountId || accName === selectedAccountId;
    });
  }, [transactions, selectedAccountId]);

  /* ── In-range transactions (before type filter) ── */
  const inRangeTxs = useMemo(() => {
    return scopedTransactions.filter((tx) => {
      if (!isValidTransactionDate(tx.date)) return false;
      const d = new Date(tx.date);
      return d >= dateRangeBounds.start && d <= dateRangeBounds.end;
    });
  }, [scopedTransactions, dateRangeBounds]);

  /* ── Post-period net (for opening balance math) ── */
  const postPeriodNetCents = useMemo(() => {
    return scopedTransactions
      .filter((tx) => {
        const d = tx.date ? new Date(tx.date) : null;
        return d && !isNaN(d.getTime()) && d > dateRangeBounds.end;
      })
      .reduce((sum, tx) => sum + resolveSign(tx) * Math.abs(toCents(tx.amount)), 0);
  }, [scopedTransactions, dateRangeBounds]);

  /* ── In-period net (before type filter) ── */
  const inPeriodNetCents = useMemo(
    () => inRangeTxs.reduce((sum, tx) => sum + resolveSign(tx) * Math.abs(toCents(tx.amount)), 0),
    [inRangeTxs]
  );

  /* ── Filtered dataset (respects type filter) ── */
  const filteredTransactions = useMemo(() => {
    return inRangeTxs
      .filter((tx) => {
        if (statementType === 'income'  && tx.type !== 'income')  return false;
        if (statementType === 'expense' && tx.type !== 'expense') return false;
        return true;
      })
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  }, [inRangeTxs, statementType]);

  /* ── Current database balance for the active scope ── */
  const scopeCurrentCents = useMemo(() => {
    if (selectedAccountId !== 'all') {
      const acc = accounts.find((a) => normAccId(a.id ?? a._id) === selectedAccountId);
      if (acc) {
        return toCents(acc.current_balance ?? acc.balance ?? acc.initial_balance ?? 0);
      }
    }
    // Consolidated scope: sum of account balances if present, or user's wallet balance
    if (Array.isArray(accounts) && accounts.length > 0) {
      const hasAccountBalances = accounts.some(
        (a) => a.current_balance !== undefined || a.balance !== undefined
      );
      if (hasAccountBalances) {
        return accounts.reduce(
          (sum, a) => sum + toCents(a.current_balance ?? a.balance ?? a.initial_balance ?? 0),
          0
        );
      }
    }
    return toCents(user?.balance);
  }, [accounts, user, selectedAccountId]);

  // Opening at period start = current − net(post-period) − net(in-period)
  const openingCents = useMemo(
    () => scopeCurrentCents - postPeriodNetCents - inPeriodNetCents,
    [scopeCurrentCents, postPeriodNetCents, inPeriodNetCents]
  );

  /* ── Summary metrics ── */
  const summaryMetrics = useMemo(() => {
    let incomeCents  = 0;
    let expenseCents = 0;
    const catCents = {};

    for (const tx of filteredTransactions) {
      const c = Math.abs(toCents(tx.amount));
      const sign = resolveSign(tx);
      if (sign > 0) {
        incomeCents += c;
      } else {
        expenseCents += c;
        const cat = cleanCategory(tx.category);
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
      .slice(0, 4);

    return {
      incomeCents,
      expenseCents,
      netCents,
      savingsRate,
      topCategories,
      count: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  // Closing at period end = opening + in-period net movement (matches ledger and PDF engine).
  const closingCents = openingCents + summaryMetrics.netCents;

  /* ── Ledger rows + running balance (pure, memoized) ── */
  const ledgerRows = useMemo(() => {
    let runCents = openingCents;
    const rows = [];
    for (let idx = 0; idx < filteredTransactions.length; idx++) {
      const tx = filteredTransactions[idx];
      const amtCents = Math.abs(toCents(tx.amount));
      const sign     = resolveSign(tx);
      runCents      += sign * amtCents;

      const ref = tx.transaction_number || (tx._id
        ? `TXN-${String(tx._id).slice(-6).toUpperCase()}`
        : `TX-${String(idx + 1).padStart(4, '0')}`);
      const rawDesc = includeNotes
        ? (tx.note || tx.description || tx.category || COPY.defaultDescription)
        : (tx.category || COPY.defaultDescription);
      const desc = sanitizeDescription(rawDesc, 52);

      rows.push({
        key: tx.id || tx._id || idx,
        dateStr: formatDateLatin(tx.date),
        ref,
        desc,
        fullDesc: String(rawDesc),
        category: cleanCategory(tx.category),
        account:  tx.account_name,
        sign,
        amtCents,
        amtStr: (sign >= 0 ? '+' : '-') + symbol + '\u00A0'
              + fromCents(amtCents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        balStr: (runCents < 0 ? '-' : '') + symbol + '\u00A0'
              + Math.abs(fromCents(runCents)).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        isInc: sign > 0,
        _tx: tx,
      });
    }
    return rows;
  }, [filteredTransactions, openingCents, includeNotes, symbol, locale]);

  /* ── Selected account display name ── */
  const selectedAccountName = useMemo(() => {
    if (selectedAccountId === 'all') return COPY.defaultAccountScope;
    const found = accounts.find((a) => normAccId(a.id ?? a._id) === selectedAccountId);
    return found ? (found.name || 'Linked Account') : 'Linked Account';
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
  const [checksum, setChecksum] = useState(`${COPY.sealChecksumPrefix} computing…`);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canonical = JSON.stringify({
        ref:      statementMeta.referenceId,
        currency: activeCurrency,
        opening:  fromCents(openingCents),
        income:   fromCents(summaryMetrics.incomeCents),
        expense:  fromCents(summaryMetrics.expenseCents),
        closing:  fromCents(closingCents),
        count:    summaryMetrics.count,
        options:  { includeNotes, includeCategories, includeSeal },
        rows: filteredTransactions.map((t) => [
          t._id ? String(t._id) : null,
          t.date || null,
          t.type || null,
          toCents(t.amount),
          t.category || null,
        ]),
      });
      const hex = await sha256Hex(canonical);
      if (!cancelled) {
        setChecksum(
          hex
            ? `${COPY.sealChecksumPrefix} ${hex.slice(0, 32)}`
            : `${COPY.sealChecksumPrefix} ${COPY.sealChecksumUnavailable}`
        );
      }
    })();
    return () => { cancelled = true; };
  }, [
    statementMeta.referenceId, activeCurrency,
    openingCents, closingCents, summaryMetrics,
    includeNotes, includeCategories, includeSeal,
    filteredTransactions,
  ]);

  /* ── Handlers ── */
  const handlePrint = useCallback(() => {
    if (typeof window === 'undefined') return;
    const prev = zoomLevel;
    setZoomLevel(1);
    requestAnimationFrame(() => {
      window.print();
      setZoomLevel(prev);
    });
  }, [zoomLevel]);

  const handleFitWidth = useCallback(() => {
    if (typeof window === 'undefined') return;
    const viewportWidth = window.innerWidth - (window.innerWidth <= 600 ? 32 : 80);
    const a4PxWidth = 794; // 210mm in standard 96 dpi pixels
    const targetZoom = Math.min(1, Math.max(0.4, +(viewportWidth / a4PxWidth).toFixed(2)));
    setZoomLevel(targetZoom);
  }, []);

  const handleDownloadPDF = useCallback(async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    try {
      const result = await exportToPDF(user, filteredTransactions, currencyInfo, locale, {
        title: STATEMENT_TYPES.find((s) => s.id === statementType)?.label || 'ACCOUNT STATEMENT',
        subtitle: dateRangeBounds.label,
        accountName: selectedAccountName,
        dateRangeLabel: dateRangeBounds.label,
        isFiltered: true,
        openingBalance: fromCents(openingCents),
        displayCurrency: activeCurrency,
        referenceId: statementMeta.referenceId,
        accountNumber: statementMeta.accountNumber,
        includeCategories,
        includeNotes,
        includeSeal,
      });
      if (result?.success) {
        showToast(
          'success',
          tr('pdf_download_success', 'Official A4 PDF statement downloaded successfully.')
        );
      } else {
        showToast(
          'error',
          result?.error || tr('pdf_export_failed_short', 'PDF export failed. Please try again.')
        );
      }
    } catch (err) {
      console.error('[handleDownloadPDF]', err);
      showToast(
        'error',
        tr('pdf_export_failed', 'PDF export failed. Please try again.')
      );
    } finally {
      setIsExportingPDF(false);
    }
  }, [
    isExportingPDF, user, filteredTransactions, currencyInfo, locale,
    statementType, dateRangeBounds, selectedAccountName,
    openingCents, activeCurrency, statementMeta.referenceId, statementMeta.accountNumber,
    includeCategories, includeNotes, includeSeal, showToast, tr,
  ]);

  const handleDownloadExcel = useCallback(async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    try {
      const userId = user?.id || user?._id;
      if (!userId) throw new Error('Missing user identifier.');

      // Pass filter scope so the server can honour it.
      await api.exportToExcel(userId, {
        statementType,
        accountId: selectedAccountId === 'all' ? undefined : selectedAccountId,
        start: dateRangeBounds.start.toISOString(),
        end:   dateRangeBounds.end.toISOString(),
      });
      showToast(
        'success',
        tr('excel_download_success', 'Excel report downloaded successfully.')
      );
    } catch (err) {
      console.error('[handleDownloadExcel]', err);
      showToast(
        'error',
        tr('excel_export_failed', 'Excel export failed. Please try again.')
      );
    } finally {
      setIsExportingExcel(false);
    }
  }, [
    isExportingExcel, user, statementType, selectedAccountId,
    dateRangeBounds, showToast, tr,
  ]);

  const handleDownloadCSV = useCallback(() => {
    try {
      const headers = ['Date', 'Reference', 'Type', 'Category', 'Description', 'Account', 'Amount', 'Currency'];
      const rows = ledgerRows.map((r) => [
        escapeCsvField(r.dateStr),
        escapeCsvField(r.ref),
        escapeCsvField(r._tx?.type || ''),
        escapeCsvField(cleanCategory(r.category)),
        escapeCsvField(r._tx?.note || r._tx?.description || r.fullDesc || ''),
        escapeCsvField(r.account || ''),
        escapeCsvField((r.sign * fromCents(r.amtCents)).toFixed(2)),
        escapeCsvField(activeCurrency),
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Coinwise_Statement_${statementMeta.referenceId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(
        'success',
        tr('csv_download_success', 'CSV ledger downloaded successfully.')
      );
    } catch (err) {
      console.error('[handleDownloadCSV]', err);
      showToast(
        'error',
        tr('csv_export_failed', 'CSV export failed. Please try again.')
      );
    }
  }, [ledgerRows, activeCurrency, statementMeta, showToast, tr]);

  /* ── Formatting helpers bound to this render ── */
  const fmtMoney = useCallback(
    (cents) => {
      const sign = cents < 0 ? '-' : '';
      return sign + symbol + '\u00A0' + Math.abs(fromCents(cents)).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
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
                {tr('reports_statements_title', COPY.pageTitle)}
              </h1>
              <p>{tr('reports_statements_sub', COPY.pageSubtitle)}</p>
            </div>
          </div>

          <div className="inbox-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={handlePrint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <Printer size={15} /> <span>{tr('print', COPY.printLabel)}</span>
            </button>

            <button type="button" className="btn-secondary" onClick={handleDownloadExcel} disabled={isExportingExcel}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <FileSpreadsheet size={15} />
              <span>{isExportingExcel ? COPY.exportInProgress : tr('excel', COPY.excelLabel)}</span>
            </button>

            <button type="button" className="btn-secondary" onClick={handleDownloadCSV}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <FileCode size={15} /> <span>{tr('csv', COPY.csvLabel)}</span>
            </button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-primary"
              onClick={handleDownloadPDF}
              disabled={isExportingPDF || (contextLoading && transactions.length === 0)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '9px 18px' }}
            >
              <Download size={16} />
              <span>
                {isExportingPDF
                  ? tr('generating_pdf', COPY.exportPDFInProgress)
                  : tr('download_pdf_a4', COPY.downloadPDFLabel)}
              </span>
            </motion.button>
          </div>
        </header>

        {/* ============ Config strip (hidden on print) ============ */}
        <div
          className="reports-config-card glass no-print"
          style={{
            marginBottom: '1.25rem',
            padding: '20px 24px',
            background: 'var(--surface-1)',
            borderRadius: '16px',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--glass-shadow)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px',
          }}
        >
          {/* Left Column: Report Type & Account */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>{tr('statement_type', 'Report Type')}</label>
              <div
                className="tx-presets-strip"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '6px',
                  marginTop: '6px',
                }}
              >
                {STATEMENT_TYPES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    role="button"
                    className={`tx-preset-pill ${statementType === st.id ? 'active' : ''}`}
                    onClick={() => setStatementType(st.id)}
                    title={st.desc}
                    style={{
                      fontSize: '0.8rem',
                      padding: '7px 12px',
                      textAlign: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      background: statementType === st.id ? undefined : 'var(--surface-2)',
                      color: statementType === st.id ? '#ffffff' : 'var(--text-secondary)',
                      border: `1px solid ${statementType === st.id ? 'transparent' : 'var(--glass-border)'}`,
                      fontWeight: statementType === st.id ? 700 : 500,
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>{tr('account_filter', 'Account Scope')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <Landmark size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden />
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  aria-label={tr('account_filter', 'Account filter')}
                  style={{ ...selectStyle, width: '100%' }}
                >
                  <option value="all">{tr('all_accounts', COPY.defaultAccountScope)}</option>
                  {accounts.map((acc) => {
                    const id = normAccId(acc.id ?? acc._id);
                    return (
                      <option key={id} value={id}>
                        {acc.name} ({acc.type})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Right Column: Statement Period & Elements */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>{tr('period', 'Statement Period')}</label>
              <div
                className="tx-presets-strip"
                style={{
                  display: 'flex',
                  gap: '6px',
                  flexWrap: 'wrap',
                  marginTop: '6px',
                }}
              >
                {PERIOD_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`tx-preset-pill ${periodPreset === p.id ? 'active' : ''}`}
                    onClick={() => setPeriodPreset(p.id)}
                    style={{
                      fontSize: '0.8rem',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      background: periodPreset === p.id ? undefined : 'var(--surface-2)',
                      color: periodPreset === p.id ? '#ffffff' : 'var(--text-secondary)',
                      border: `1px solid ${periodPreset === p.id ? 'transparent' : 'var(--glass-border)'}`,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {periodPreset === 'custom' && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>From:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      aria-label={tr('custom_start_date', 'Custom start date')}
                      style={dateInputStyle}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>To:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      aria-label={tr('custom_end_date', 'Custom end date')}
                      style={dateInputStyle}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>{tr('options', 'Statement Elements')}</label>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
                <Toggle
                  label={tr('show_categories', 'Category Distribution')}
                  checked={includeCategories}
                  onChange={setIncludeCategories}
                />
                <Toggle
                  label={tr('show_notes', 'Transaction Notes')}
                  checked={includeNotes}
                  onChange={setIncludeNotes}
                />
                <Toggle
                  label={tr('show_seal', 'Verification Seal & Checksum')}
                  checked={includeSeal}
                  onChange={setIncludeSeal}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ============ Viewport toolbar (hidden on print) ============ */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '0 4px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {tr('preview_mode', COPY.previewMode)}
            </span>
            <span className="ih-badge" style={{ fontSize: '0.72rem' }}>
              {filteredTransactions.length}{' '}
              {filteredTransactions.length === 1
                ? tr('transaction_single', 'Transaction')
                : tr('transactions_plural', 'Transactions')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setZoomLevel((z) => Math.max(0.65, +(z - 0.1).toFixed(2)))}
              title={tr('zoom_out', 'Zoom out')}
              aria-label={tr('zoom_out', 'Zoom out')}
              style={{ padding: '4px 8px' }}
            >
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', minWidth: '45px', textAlign: 'center', fontWeight: 600 }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setZoomLevel((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))}
              title={tr('zoom_in', 'Zoom in')}
              aria-label={tr('zoom_in', 'Zoom in')}
              style={{ padding: '4px 8px' }}
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleFitWidth}
              title={tr('fit_to_screen', 'Fit to screen width')}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
            >
              Fit
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setZoomLevel(1)}
              title={tr('reset_zoom', 'Reset zoom to default')}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
            >
              Reset
            </button>
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
            <div className="a4-document-sheet" style={sheetStyle}>
              {/* Top crimson accent */}
              <div style={{ height: '4px', background: 'linear-gradient(90deg, #FC0100 0%, #DC2626 100%)', margin: '-16mm -14mm 16mm -14mm' }} />

              {/* === Header block === */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '18px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', paddingLeft: '2px' }}>
                    <img
                      src="/coinwise-logo.png"
                      alt={BRAND.name}
                      style={{ height: '30px', width: 'auto', objectFit: 'contain', display: 'block', overflow: 'visible' }}
                    />
                    <span className="sr-only">{BRAND.name}</span>
                    <span style={badgeStyle}>CERTIFIED</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '9.5px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                    {BRAND.tagline}
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
                  <span style={labelMiniStyle}>{COPY.labelAccountHolder}</span>
                  <strong style={{ color: '#0f172a', fontSize: '11px' }}>
                    {String(user?.username || COPY.valueAccountHolder).replace(/_/g, ' ')}
                  </strong>
                </div>
                <div>
                  <span style={labelMiniStyle}>{COPY.labelAccountRef}</span>
                  <span style={{ color: '#0f172a', fontFamily: 'monospace' }}>{statementMeta.accountNumber}</span>
                </div>
                <div>
                  <span style={labelMiniStyle}>{COPY.labelPeriod}</span>
                  <strong style={{ color: '#0f172a' }}>{dateRangeBounds.label}</strong>
                </div>
                <div>
                  <span style={labelMiniStyle}>{COPY.labelIntegrity}</span>
                  <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9.5px', whiteSpace: 'nowrap' }}>
                    <CheckCircle2 size={11} aria-hidden /> {COPY.valueAuthenticated}
                  </span>
                </div>
              </div>

              {/* === Summary matrix === */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '20px' }}>
                <SummaryCard label={COPY.kpiOpening} value={fmtMoney(openingCents)} accent="#64748b" />
                <SummaryCard label={COPY.kpiCredits} value={`+${fmtMoney(summaryMetrics.incomeCents)}`}  accent="#10b981" bg="#ecfdf5" border="#a7f3d0" labelColor="#065f46" valueColor="#059669" />
                <SummaryCard label={COPY.kpiDebits} value={`-${fmtMoney(summaryMetrics.expenseCents)}`} accent="#e11d48" bg="#fff1f2" border="#fecdd3" labelColor="#9f1239" valueColor="#e11d48" />
                <SummaryCard
                  label={COPY.kpiNet}
                  value={`${summaryMetrics.netCents >= 0 ? '+' : ''}${fmtMoney(summaryMetrics.netCents)}`}
                  accent={summaryMetrics.netCents >= 0 ? '#10b981' : '#e11d48'}
                  valueColor={summaryMetrics.netCents >= 0 ? '#059669' : '#e11d48'}
                />
                <SummaryCard label={COPY.kpiClosing} value={fmtMoney(closingCents)} accent="#059669" dark />
              </div>

              {/* === Category distribution === */}
              {includeCategories && summaryMetrics.topCategories.length > 0 && (
                <div style={{ marginBottom: '18px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em' }}>
                      {COPY.expenditureHeading}
                    </span>
                    <span style={{ fontSize: '9px', color: '#64748b' }}>
                      {COPY.savingsRateLabel}{' '}
                      <strong>
                        {summaryMetrics.savingsRate !== null ? `${summaryMetrics.savingsRate}%` : COPY.savingsRateNA}
                      </strong>
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
                    {COPY.ledgerHeading}
                  </span>
                  <span style={{ fontSize: '9px', color: '#64748b' }}>
                    {filteredTransactions.length}{' '}
                    {filteredTransactions.length === 1 ? 'transaction' : 'transactions'} listed
                    {isTypeFiltered ? ' · Balances reflect filtered entries only' : ''}
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                  <thead>
                    <tr style={{ background: '#0f172a', color: '#fff', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '15%' }}>{COPY.colDate}</th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '12%' }}>{COPY.colRef}</th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '28%' }}>{COPY.colDescription}</th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '15%' }}>{COPY.colCategory}</th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '15%', textAlign: 'right' }}>
                        {COPY.colAmount} ({activeCurrency})
                      </th>
                      <th style={{ padding: '6px 8px', fontWeight: 700, width: '15%', textAlign: 'right' }}>
                        {COPY.colBalance}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contextLoading && transactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                          {COPY.loadingState}
                        </td>
                      </tr>
                    ) : ledgerRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                          {COPY.emptyState}
                        </td>
                      </tr>
                    ) : ledgerRows.map((r, idx) => (
                      <tr key={r.key} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', color: '#475569' }}>{r.dateStr}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{r.ref}</td>
                        <td style={{ padding: '6px 8px', color: '#0f172a', fontWeight: 500 }} title={r.fullDesc}>
                          {r.desc}
                          {r.account && (
                            <span style={{ display: 'block', fontSize: '7.5px', color: '#64748b' }}>
                              {COPY.accountPrefix} {r.account}
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
                      <ShieldCheck size={13} style={{ color: '#059669' }} aria-hidden />
                      {COPY.sealHeading}
                    </div>
                    <p style={{ margin: '0 0 4px', lineHeight: 1.4 }}>
                      {COPY.sealStatement.replace('{product}', BRAND.product)}{' '}
                      {COPY.sealLegal}
                    </p>
                    <div className="allow-copy" data-allow-copy="true" style={{ fontFamily: 'monospace', color: '#475569', fontSize: '7.5px' }}>
                      {checksum}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontWeight: 800, color: '#0f172a', fontSize: '9px' }}>
                      {COPY.sealAuditStatus}
                    </span>
                    <span className="allow-copy" data-allow-copy="true" style={{ fontSize: '7.5px', color: '#64748b' }}>
                      {statementMeta.referenceId}
                    </span>
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
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--brand-primary)', cursor: 'pointer', width: '15px', height: '15px' }}
      />
      <span>{label}</span>
    </label>
  );
}

function SummaryCard({
  label, value, accent,
  bg = '#f8fafc', border = '#e2e8f0',
  labelColor = '#64748b', valueColor = '#0f172a',
  dark = false,
}) {
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
        fontSize: '7.5px',
        textTransform: 'uppercase',
        color: dark ? '#94a3b8' : labelColor,
        fontWeight: 700,
        display: 'block',
        lineHeight: '1.25',
        minHeight: '18px',
        letterSpacing: '0.03em',
      }}>
        {label}
      </span>
      <strong style={{
        fontSize: '11.5px',
        color: dark ? '#ffffff' : valueColor,
        fontVariantNumeric: 'tabular-nums',
        display: 'block',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        marginTop: '2px',
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
  fontSize: '0.82rem',
  padding: '8px 12px',
  borderRadius: '8px',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--glass-border)',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  outline: 'none',
  colorScheme: 'dark light',
};
const dateInputStyle = {
  padding: '6px 10px',
  fontSize: '0.8rem',
  borderRadius: '8px',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--glass-border)',
  colorScheme: 'dark light',
  outline: 'none',
};
const badgeStyle = {
  fontSize: '9px', fontWeight: 700, background: 'rgba(252, 1, 0, 0.08)', color: '#FC0100',
  padding: '2px 7px', borderRadius: '4px', border: '1px solid rgba(252, 1, 0, 0.25)',
  letterSpacing: '0.04em',
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
  display: 'grid', gridTemplateColumns: '1.05fr 1fr 1fr 1.15fr', gap: '10px', fontSize: '10px',
};
const labelMiniStyle = {
  color: '#64748b', display: 'block', textTransform: 'uppercase',
  fontSize: '8px', fontWeight: 700,
};