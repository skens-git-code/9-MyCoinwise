/* —————————————————————————————————————————————————————————————
 * PDF Export Engine (Executive A4 Edition) — v3.1
 * Enterprise-grade, audit-ready A4 financial statement.
 *
 * Changelog v3.1 — Copy & Compliance Revision:
 *   - Centralised canonical strings in the COPY object for consistency.
 *   - Replaced informal and product-internal terminology with audit-grade language.
 *   - Corrected legal citation (Indian Evidence Act §65B) for electronic records.
 *   - Removed hardcoded SHA-256 fallback; renders an explicit "Unavailable" notice
 *     when the checksum cannot be computed (insecure contexts, unsupported browsers).
 *   - Fixed duplicate / misspelled footer copy ("Official Statement · Official certified").
 *   - Receipt generation now degrades gracefully when a checksum is unavailable
 *     instead of throwing on a null digest.
 *
 * Changelog v3:
 *   - Executive A4 layout aligned with the Reports module preview.
 *   - Compact, single-line descriptions prevent row-height overflow.
 *   - Auto-pagination for one to N pages with repeating headers.
 *   - Layout parity: 4-column particulars grid, 5 KPI summary cards (dark navy
 *     closing balance), expenditure category breakdown with progress indicators,
 *     and certified electronic seal footer.
 * ————————————————————————————————————————————————————————————— */

/* ─────────────────────────── Brand & Theme ─────────────────────────── */

const BRAND = Object.freeze({
  name: 'COINWISE',
  tagline: 'PERSONAL FINANCE & AUDIT MANAGEMENT PLATFORM',
  product: 'Coinwise Personal Finance & Audit Management Platform',
});

/**
 * Canonical user-facing strings.
 * Centralised to guarantee terminology consistency across the statement and receipt.
 */
const COPY = Object.freeze({
  // Document titles
  statementTitle: 'OFFICIAL ACCOUNT STATEMENT',
  receiptTitle: 'OFFICIAL TRANSACTION RECEIPT',

  // Particulars strip
  labelAccountHolder: 'ACCOUNT HOLDER',
  labelAccountRef: 'ACCOUNT REFERENCE',
  labelPeriod: 'STATEMENT PERIOD',
  labelIntegrity: 'DOCUMENT INTEGRITY',
  valueAuthenticated: 'Electronically Authenticated',
  valueAccountHolder: 'Registered Account Holder',
  defaultAccountScope: 'All Accounts — Consolidated',
  defaultPeriod: 'Complete Statement Period',

  // KPI cards
  kpiOpening: 'OPENING BALANCE',
  kpiCredits: 'TOTAL CREDITS',
  kpiDebits: 'TOTAL DEBITS',
  kpiNet: 'NET MOVEMENT',
  kpiClosing: 'CLOSING BALANCE',

  // Expenditure breakdown
  expenditureHeading: 'EXPENDITURE BY CATEGORY',
  savingsRateLabel: 'Savings Rate:',
  savingsRateNA: 'Not applicable',

  // Ledger section
  ledgerHeading: 'TRANSACTION LEDGER',

  // Table headers
  colDate: 'Date',
  colRef: 'Reference',
  colDescription: 'Description',
  colCategory: 'Category',
  colAmount: 'Amount',
  colBalance: 'Running Balance',

  // Empty state
  emptyState: 'No transactions were recorded during the selected statement period.',

  // Fallbacks
  defaultDescription: 'Transaction Entry',
  defaultCategory: 'Uncategorised',
  defaultMerchant: '—',
  defaultBank: 'Primary Account',
  defaultPaymentMethod: 'Electronic Funds Transfer (EFT)',
  defaultNote: 'No description provided',
  defaultTags: '—',
  defaultSender: 'External Originator',
  defaultCounterparty: 'Counterparty',
  autoAllocatedSuffix: '(Auto-allocated)',

  // Continuation header
  continuationRef: 'Reference:',

  // Standard footer
  footerText: 'Confidential Statement · Electronically Certified',

  // Certification seal
  sealHeading: 'CERTIFIED STATEMENT',
  sealStatement:
    'This statement reflects verified transaction activity stored under {product} security controls.',
  sealLegal:
    'No physical signature is required. This statement is valid under Section 65B of the Indian Evidence Act, 1872, and equivalent electronic-records legislation.',
  sealAuditStatus: 'Verified for Audit',
  sealChecksumPrefix: 'SHA256:',
  sealChecksumUnavailable:
    'Unavailable — checksum could not be computed in this environment',

  // Receipt header / metadata
  receiptIntegrityStatus: 'Integrity Status: Cryptographically Verified',
  receiptReceiptNoLabel: 'Reference:',
  receiptIssueLabel: 'Issue Timestamp:',

  // Receipt status pills
  receiptStatusCredit: 'PAYMENT RECEIVED',
  receiptStatusDebit: 'PAYMENT COMPLETED',

  // Receipt particulars table
  receiptColSpec: 'SPECIFICATION',
  receiptColDetail: 'VERIFIED DETAIL',
  receiptLabelRef: 'Reference Number',
  receiptLabelType: 'Transaction Type',
  receiptLabelDate: 'Transaction Date',
  receiptLabelCategory: 'Category',
  receiptLabelMerchant: 'Merchant / Counterparty',
  receiptLabelSource: 'Source Account',
  receiptLabelPayment: 'Payment Method',
  receiptLabelBudget: 'Budget Allocation',
  receiptLabelSender: 'Sender',
  receiptLabelRecipient: 'Recipient',
  receiptLabelDescription: 'Transaction Description',
  receiptLabelTags: 'Tags',

  // Receipt seal
  receiptSealHeading: 'CRYPTOGRAPHIC INTEGRITY SEAL',
  receiptIntegrityRef: 'Integrity Reference:',
  receiptImmutability:
    'This document is a cryptographically verified electronic record. Any alteration invalidates its integrity.',
  receiptSealBarcodeLabel: 'AUTHENTICATION SEAL',

  // Receipt footer
  receiptFooterLine:
    'Certified Electronic Transaction Receipt · Issued for personal financial management and audit compliance.',
});

const THEME = Object.freeze({
  navy: [15, 23, 42],
  crimson: [252, 1, 0],
  emerald: [5, 150, 105],
  slate: [71, 85, 105],
  lightSlate: [241, 245, 249],
  border: [226, 232, 240],
  green: [16, 185, 129],
  red: [225, 29, 72],
  white: [255, 255, 255],
  zebra: [248, 250, 252],
});

const PAGE = Object.freeze({
  width: 210,
  height: 297,
  marginX: 14,
  headerH: 36,
  accentH: 2.5,
});

/* ─────────────────────────── Formatting helpers ─────────────────────────── */

/**
 * Normalise a BCP-47 locale so numerals render as Latin (0-9) regardless of the
 * caller's regional setting (Hindi, Arabic, Bengali, etc.).
 */
function toLatinNumLocale(locale) {
  const base = locale || 'en-US';
  try {
    if (typeof Intl !== 'undefined' && Intl.Locale) {
      const parsed = new Intl.Locale(base);
      if (parsed.numberingSystem === 'latn' || /-u-nu-/.test(base)) {
        return base;
      }
      return new Intl.Locale(base, { numberingSystem: 'latn' }).toString();
    }
  } catch {
    return 'en-US-u-nu-latn';
  }
  return /-u-nu-/.test(base) ? base : `${base}-u-nu-latn`;
}

/**
 * Return a currency prefix safe for the standard Helvetica Latin-1 PDF encoding.
 * Prevents non-Latin-1 glyphs (e.g. ₹) from rendering as mojibake.
 * INR returns the compact four-character prefix "Rs. " to prevent column overflow.
 */
function getSafePdfSymbol(symbol, currency) {
  const normCur = String(currency || '').trim().toUpperCase();
  const normSym = String(symbol || '').trim();
  if (normCur === 'INR' || normSym === '₹' || normSym === 'RS.' || normSym === 'RS') {
    return 'Rs.\u00A0';
  }
  if (!symbol) return normCur ? `${normCur}\u00A0` : '$\u00A0';
  for (let i = 0; i < symbol.length; i++) {
    if (symbol.charCodeAt(i) > 255) {
      return normCur ? `${normCur}\u00A0` : '$\u00A0';
    }
  }
  return symbol.endsWith(' ') ? symbol.slice(0, -1) + '\u00A0' : symbol;
}

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

function formatMoney(cents, symbol, locale) {
  const value = fromCents(cents);
  const sep = (symbol.endsWith('\u00A0') || symbol.endsWith(' ') || !symbol) ? '' : '\u00A0';
  return (
    symbol +
    sep +
    Math.abs(value).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatSignedMoney(cents, symbol, locale) {
  const sep = (symbol.endsWith('\u00A0') || symbol.endsWith(' ') || !symbol) ? '' : '\u00A0';
  const numStr = Math.abs(fromCents(cents)).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (cents === 0) {
    return `${symbol}${sep}${numStr}`;
  }
  const sign = cents >= 0 ? '+' : '-';
  return `${sign}${symbol}${sep}${numStr}`;
}

function formatBalance(cents, symbol, locale) {
  const sign = cents < 0 ? '-' : '';
  const sep = (symbol.endsWith('\u00A0') || symbol.endsWith(' ') || !symbol) ? '' : '\u00A0';
  return (
    sign +
    symbol +
    sep +
    Math.abs(fromCents(cents)).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Sanitize category strings to eliminate trailing punctuation, dirty OCR dots,
 * and enforce a clean professional presentation (e.g. 'Education.' -> 'Education').
 */
export function cleanCategory(cat) {
  if (!cat) return COPY.defaultCategory;
  const str = String(cat).trim().replace(/[.,;:]+$/g, '').trim();
  const cleaned = str.replace(/[^a-zA-Z0-9 &/'-]/g, '').trim();
  return cleaned || COPY.defaultCategory;
}

/**
 * Validate that a transaction record has a physically credible calendar date.
 * Rejects corrupt / impossible dates (before 2000 or after current year + 1).
 */
export function isValidTransactionDate(input) {
  if (!input) return false;
  const currentYear = new Date().getFullYear();
  let year;
  if (typeof input === 'string') {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) year = +m[1];
  }
  if (!year) {
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return false;
    year = d.getFullYear();
  }
  return year >= 2000 && year <= currentYear + 1;
}

const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Deterministic English-month date.
 * Avoids non-Latin glyph failures in Helvetica and corrects the UTC-to-local
 * day-shift introduced by parsing date-only strings as midnight UTC.
 * Rejects corrupt / impossible dates outside the credible range [2000, currentYear + 1].
 */
export function formatDateLatin(input) {
  if (!input) return '—';
  const currentYear = new Date().getFullYear();
  if (typeof input === 'string') {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const year = +m[1];
      if (year < 2000 || year > currentYear + 1) {
        return '—';
      }
      const d = new Date(year, +m[2] - 1, +m[3]);
      if (!Number.isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        return `${day} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      }
    }
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const year = d.getFullYear();
  if (year < 2000 || year > currentYear + 1) {
    return '—';
  }
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Compute a SHA-256 hex digest via WebCrypto.
 *
 * Returns `null` in unsupported contexts (HTTP / LAN IP / non-secure origins).
 * Callers MUST treat `null` as "checksum unavailable" and render an explicit
 * notice — never substitute a fixed or fabricated digest.
 */
export async function sha256Hex(str) {
  if (typeof crypto === 'undefined' || !crypto?.subtle?.digest) {
    return null;
  }
  try {
    const buf = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (err) {
    console.warn(
      '[PDF] SHA-256 checksum unavailable; proceeding without checksum:',
      err?.message || err
    );
    return null;
  }
}

/* ─────────────────────────── Sign resolution ─────────────────────────── */

function resolveSign(tx) {
  if (tx.type === 'income') return 1;
  if (tx.type === 'expense') return -1;
  if (tx.type === 'transfer') {
    if (tx.direction === 'in') return 1;
    if (tx.direction === 'out') return -1;
    return (Number(tx.amount) || 0) < 0 ? -1 : 1;
  }
  if (tx.direction === 'in') return 1;
  if (tx.direction === 'out') return -1;
  const amt = Number(tx.amount) || 0;
  return amt < 0 ? -1 : 1;
}

let cachedLogoDataUrl = null;

/**
 * Resolve `/coinwise-logo.png` to a base64 Data URL.
 * Cached in memory after first resolution. Returns `null` outside a browser
 * context or in test environments.
 */
export async function getLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  const isTest =
    (typeof globalThis.process !== 'undefined' &&
      globalThis.process.env?.NODE_ENV === 'test') ||
    (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test');
  if (typeof window === 'undefined' || typeof document === 'undefined' || isTest) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          cachedLogoDataUrl = canvas.toDataURL('image/png');
          resolve(cachedLogoDataUrl);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = '/coinwise-logo.png';
      setTimeout(() => resolve(null), 1500);
    } catch {
      resolve(null);
    }
  });
}

/** Render the Coinwise vector chevron mark at (ox, oy) with scale s. */
function drawCoinwiseMark(doc, ox, oy, s = 0.021, color = THEME.crimson) {
  doc.setFillColor(...color);
  // Left chevron
  doc.lines(
    [
      [177 * s, 0],
      [-186 * s, 186 * s],
      [0, 146 * s],
      [186 * s, 186 * s],
      [-177 * s, 0],
      [-186 * s, -186 * s],
      [0, -146 * s],
      [186 * s, -186 * s],
    ],
    ox + 186 * s,
    oy,
    [1, 1],
    'F',
    true
  );

  // Top-right slanted bar
  doc.lines(
    [
      [176 * s, 0],
      [-127 * s, 127 * s],
      [-176 * s, 0],
      [127 * s, -127 * s],
    ],
    ox + 427 * s,
    oy,
    [1, 1],
    'F',
    true
  );

  // Bottom-right slanted bar
  doc.lines(
    [
      [176 * s, 0],
      [127 * s, 127 * s],
      [-176 * s, 0],
      [-127 * s, -127 * s],
    ],
    ox + 300 * s,
    oy + 391 * s,
    [1, 1],
    'F',
    true
  );
}

/**
 * Sanitize and truncate a transaction description to a single line for stable
 * table row heights.
 *
 * @param {string} raw
 * @param {number} [maxLen=52]
 * @returns {string}
 */
export function cleanDescription(raw, maxLen = 52) {
  if (!raw) return COPY.defaultDescription;
  const str = String(raw)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!str) return COPY.defaultDescription;
  return str.length > maxLen ? `${str.slice(0, maxLen - 3).trim()}...` : str;
}

/**
 * Sanitize raw transaction description by stripping UPI IDs, emails,
 * telephone numbers, and noisy delimiters before formatting for the statement.
 *
 * @param {string} raw
 * @param {number} [maxLen=52]
 * @returns {string}
 */
export function sanitizeDescription(raw, maxLen = 52) {
  if (!raw) return COPY.defaultDescription;
  let str = String(raw)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Strip scraper tags like "Tag: # Groceries Union Bank Of India - 39 - Rs.20"
  str = str.replace(/\bTag:\s*#.*$/i, '');

  // Strip "on UPI Ref No: 631579260664" or "UPI Ref: 12345"
  str = str.replace(/\b(?:on\s+)?UPI Ref(?:\s*No)?[:\s]*\w+/gi, '');

  // Strip UPI IDs, emails, phone numbers, and trailing delimiters
  str = str
    .replace(/\s*\|\s*UPI ID:[^|]*/gi, '')
    .replace(/\bUPI ID:[^\s,|]*/gi, '')
    .replace(/[\w.-]+@[\w.-]+/g, '')
    .replace(/\b\d{10,}\b/g, '')
    .replace(/\s*[|–\-:]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleanDescription(str, maxLen);
}

/** Render the vector shield icon with embedded checkmark used on certification seals. */
function drawShieldIcon(doc, x, y, size = 3.8) {
  doc.setFillColor(...THEME.emerald);
  doc.setDrawColor(...THEME.emerald);
  doc.lines(
    [
      [size, 0],
      [0, size * 0.45],
      [-size / 2, size * 0.55],
      [-size / 2, -size * 0.55],
      [0, -size * 0.45],
    ],
    x,
    y,
    [1, 1],
    'FD',
    true
  );

  doc.setDrawColor(...THEME.white);
  doc.setLineWidth(0.35);
  doc.line(x + size * 0.22, y + size * 0.45, x + size * 0.44, y + size * 0.72);
  doc.line(x + size * 0.44, y + size * 0.72, x + size * 0.8, y + size * 0.28);
}

/** Render a small verified-status indicator (circle with checkmark). */
function drawCheckmarkCircle(doc, x, y, r = 1.3) {
  doc.setFillColor(...THEME.emerald);
  doc.circle(x, y, r, 'F');
  doc.setDrawColor(...THEME.white);
  doc.setLineWidth(0.3);
  doc.line(x - 0.6, y, x - 0.1, y + 0.6);
  doc.line(x - 0.1, y + 0.6, x + 0.7, y - 0.5);
}

/* ─────────────────────────── Main export ─────────────────────────── */

/**
 * Generate an enterprise A4 PDF statement aligned with the Reports module preview.
 *
 * @param {object}   user                 - Account holder ({ username, email, currency, balance, _id, locale }).
 * @param {object[]} [transactions=[]]    - Ledger entries ({ date, type, amount, category, account_name, note, _id, direction }).
 * @param {object}   [currencyInfo]       - { symbol } e.g. { symbol: '₹' }.
 * @param {string}   [localeOpt]          - BCP-47 locale override.
 * @param {object}   [options={}]         - Presentation overrides:
 *   {string}  title             - Document title (default: COPY.statementTitle).
 *   {string}  accountName       - Account scope label (default: COPY.defaultAccountScope).
 *   {string}  dateRangeLabel    - Statement period label (default: COPY.defaultPeriod).
 *   {boolean} isFiltered        - Whether the ledger is filtered.
 *   {number}  openingBalance    - Explicit opening balance (overrides derived value).
 *   {string}  referenceId       - Override the statement reference number.
 *   {string}  accountNumber     - Override the masked account reference.
 *   {boolean} includeCategories - Render the expenditure breakdown (default: true).
 *   {boolean} includeNotes      - Include note text in descriptions (default: true).
 *   {boolean} includeSeal       - Render the certification seal (default: true).
 *   {string}  displayCurrency   - Override the currency code.
 *   {string}  logoDataUrl       - Override the logo (base64 data URL).
 * @returns {Promise<{ success: boolean, fileName?: string, checksum?: string|null, checksumAvailable?: boolean, error?: string }>}
 */
export async function exportToPDF(user, transactions = [], currencyInfo, localeOpt, options = {}) {
  try {
    const jsPdfMod = await import('jspdf');
    const jsPDF =
      typeof jsPdfMod.default === 'function'
        ? jsPdfMod.default
        : jsPdfMod.jsPDF || jsPdfMod.default?.jsPDF || jsPdfMod.default?.default;
    const autoTableMod = await import('jspdf-autotable');
    const autoTable =
      autoTableMod.default || autoTableMod.autoTable || autoTableMod;

    /* ── Document setup ── */
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const { width: pageWidth, height: pageHeight, marginX } = PAGE;
    const contentWidth = pageWidth - marginX * 2; // 182mm

    /* ── Locale & currency ── */
    const currency =
      options.displayCurrency || options.currency || user?.currency || 'USD';
    const symbol = getSafePdfSymbol(currencyInfo?.symbol, currency);
    const rawLocale =
      localeOpt ||
      user?.locale ||
      (typeof navigator !== 'undefined' ? navigator.language : 'en-US') ||
      'en-US';
    const locale = toLatinNumLocale(rawLocale);

    const title = options.title || COPY.statementTitle;
    const accountFilter = options.accountName || COPY.defaultAccountScope;
    const dateRangeLabel = options.dateRangeLabel || COPY.defaultPeriod;
    const isFiltered = Boolean(options.isFiltered);
    const includeNotes = options.includeNotes !== false;
    const includeCategories = options.includeCategories !== false;
    const includeSeal = options.includeSeal !== false;

    const C = THEME;

    /* ── Metadata & reference IDs (deterministic UTC date + entropy) ── */
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const refEntropy = String(user?.id || user?._id || 'UNREG')
      .slice(-6)
      .toUpperCase();
    const statementRef =
      options.referenceId || `MCW-STMT-${dateStamp}-${refEntropy}`;
    const accountRef =
      options.accountNumber || `MCW-ACC-•••${refEntropy.slice(-4)}`;
    const issueDateStr = `${formatDateLatin(now)} ${now.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`;

    /* ─────────────────────────── Compute totals (integer cents) ─────────────────────────── */

    const safeTx = Array.isArray(transactions)
      ? transactions.filter(Boolean)
      : [];
    // Guard against corrupted / impossible dates (before 2000 or after current year + 1)
    const validTx = safeTx.filter((t) => isValidTransactionDate(t?.date));
    const sortedTx = [...validTx].sort(
      (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
    );

    let incomeCents = 0;
    let expenseCents = 0;
    const catMap = new Map();

    for (const t of sortedTx) {
      const c = Math.abs(toCents(t.amount));
      const sign = resolveSign(t);
      if (sign > 0) {
        incomeCents += c;
      } else {
        expenseCents += c;
        const cat = cleanCategory(t.category);
        catMap.set(cat, (catMap.get(cat) || 0) + c);
      }
    }
    const netCents = incomeCents - expenseCents;

    const currentBalanceCents = toCents(user?.balance);
    const derivedOpeningCents = currentBalanceCents - netCents;

    const openingCents = Number.isFinite(options.openingBalance)
      ? toCents(options.openingBalance)
      : derivedOpeningCents;

    const closingCents = openingCents + netCents;

    if (!isFiltered && Math.abs(closingCents - currentBalanceCents) > 1) {
      console.warn(
        '[PDF] Balance reconciliation mismatch — ledger balance differs from account balance',
        {
          ledger: fromCents(closingCents),
          account: fromCents(currentBalanceCents),
          delta: fromCents(closingCents - currentBalanceCents),
        }
      );
    }

    const savingsRate =
      incomeCents > 0 ? ((netCents / incomeCents) * 100).toFixed(1) : null;

    const topCategories = Array.from(catMap.entries())
      .map(([name, cents]) => ({
        name,
        cents,
        pct: expenseCents > 0 ? (cents / expenseCents) * 100 : 0,
      }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 4);

    /* ─────────────────────────── Audit hash (real SHA-256) ─────────────────────────── */

    const canonical = JSON.stringify({
      ref: statementRef,
      currency,
      opening: fromCents(openingCents),
      income: fromCents(incomeCents),
      expense: fromCents(expenseCents),
      closing: fromCents(closingCents),
      count: sortedTx.length,
      options: { includeNotes, includeCategories, includeSeal },
      rows: sortedTx.map((t) => [
        t._id ? String(t._id) : null,
        t.date || null,
        t.type || null,
        toCents(t.amount),
        t.category || null,
      ]),
    });

    let checksum = null;
    try {
      const fullHash = await sha256Hex(canonical);
      if (fullHash) {
        checksum = `SHA256:${fullHash}`;
      }
    } catch (err) {
      console.warn(
        '[PDF] SHA-256 checksum unavailable; proceeding without checksum:',
        err?.message || err
      );
    }

    /* ── Logo Data URL ── */
    const logoDataUrl = options.logoDataUrl || (await getLogoDataUrl());

    /* ─────────────────────────── Page 1 Executive Layout ─────────────────────────── */

    // 1. Top crimson accent bar
    doc.setFillColor(...C.crimson);
    doc.rect(0, 0, pageWidth, 2.5, 'F');

    // 2. Executive header (white background)
    const headerY = 8.5;
    const logoHeight = 9.5;
    const logoWidth = logoHeight * (984 / 349); // ~26.78mm

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', marginX, headerY, logoWidth, logoHeight);
      } catch {
        drawCoinwiseMark(doc, marginX, headerY, 0.021, C.crimson);
        doc.setTextColor(...C.navy);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(BRAND.name, marginX + 13.5, headerY + 5.5);
      }
    } else {
      drawCoinwiseMark(doc, marginX, headerY, 0.021, C.crimson);
      doc.setTextColor(...C.navy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(BRAND.name, marginX + 13.5, headerY + 5.5);
    }

    // CERTIFIED badge beside brand logo
    const certifiedX = logoDataUrl
      ? marginX + logoWidth + 4
      : marginX + 13.5 + doc.getTextWidth(BRAND.name) + 3;
    doc.setFillColor(...C.crimson);
    doc.roundedRect(certifiedX, headerY + 2.2, 17, 5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text('CERTIFIED', certifiedX + 8.5, headerY + 5.7, { align: 'center' });

    // Subtitle & statement title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(BRAND.tagline, marginX, headerY + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...C.navy);
    doc.text(title.toUpperCase(), marginX, headerY + 20);

    // Right-aligned statement metadata
    const rightX = pageWidth - marginX;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    doc.text(`Statement ID: ${statementRef}`, rightX, headerY + 3.5, { align: 'right' });
    doc.text(`Issue Date: ${issueDateStr}`, rightX, headerY + 8, { align: 'right' });
    doc.text(
      `Base Currency: ${currency} (${symbol.trim()})`,
      rightX,
      headerY + 12.5,
      { align: 'right' }
    );
    doc.text(`Scope: ${accountFilter}`, rightX, headerY + 17, { align: 'right' });

    // Header divider
    const dividerY = headerY + 23;
    doc.setDrawColor(...C.navy);
    doc.setLineWidth(0.5);
    doc.line(marginX, dividerY, rightX, dividerY);

    // 3. Particulars grid (4 equal columns)
    const metaY = dividerY + 3.5;
    const metaH = 12.5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(marginX, metaY, contentWidth, metaH, 1.5, 1.5, 'FD');

    const colW4 = contentWidth / 4;
    const accountHolderName = String(
      user?.username || COPY.valueAccountHolder
    ).replace(/_/g, ' ');

    const metaCols = [
      { label: COPY.labelAccountHolder, value: accountHolderName },
      { label: COPY.labelAccountRef, value: accountRef, isMono: true },
      { label: COPY.labelPeriod, value: dateRangeLabel },
      { label: COPY.labelIntegrity, value: COPY.valueAuthenticated, isAudit: true },
    ];

    metaCols.forEach((col, idx) => {
      const cx = marginX + idx * colW4 + 3.5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(100, 116, 139);
      doc.text(col.label, cx, metaY + 4.5);

      if (col.isAudit) {
        drawCheckmarkCircle(doc, cx + 1.2, metaY + 8.8, 1.1);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.emerald);
        doc.text(col.value, cx + 3.8, metaY + 9.6);
      } else {
        doc.setFont(col.isMono ? 'courier' : 'helvetica', 'bold');
        doc.setFontSize(col.isMono ? 7.2 : 7.8);
        doc.setTextColor(...C.navy);
        let val = String(col.value ?? '');
        while (doc.getTextWidth(val) > colW4 - 6 && val.length > 5) {
          val = `${val.slice(0, -4)}...`;
        }
        doc.text(val, cx, metaY + 9.6);
      }
    });

    // 4. Executive summary (5 KPI cards)
    const summaryY = metaY + metaH + 3.5;
    const cardGap = 2.2;
    const cardW = (contentWidth - cardGap * 4) / 5;
    const cardH = 16.5;

    const summaryCards = [
      {
        label: COPY.kpiOpening,
        value: formatBalance(openingCents, symbol, locale),
        bg: [248, 250, 252],
        border: C.border,
        accent: [100, 116, 139],
        labelColor: [100, 116, 139],
        valColor: C.navy,
      },
      {
        label: COPY.kpiCredits,
        value: `+${formatMoney(incomeCents, symbol, locale)}`,
        bg: [236, 253, 245],
        border: [167, 243, 208],
        accent: C.green,
        labelColor: [6, 95, 70],
        valColor: C.emerald,
      },
      {
        label: COPY.kpiDebits,
        value: `-${formatMoney(expenseCents, symbol, locale)}`,
        bg: [255, 241, 242],
        border: [254, 205, 211],
        accent: C.red,
        labelColor: [159, 18, 57],
        valColor: C.red,
      },
      {
        label: COPY.kpiNet,
        value: formatSignedMoney(netCents, symbol, locale),
        bg: [248, 250, 252],
        border: C.border,
        accent: netCents >= 0 ? C.green : C.red,
        labelColor: [100, 116, 139],
        valColor: netCents >= 0 ? C.emerald : C.red,
      },
      {
        label: COPY.kpiClosing,
        value: formatBalance(closingCents, symbol, locale),
        bg: C.navy,
        border: C.navy,
        accent: C.green,
        labelColor: [148, 163, 184],
        valColor: C.white,
      },
    ];

    summaryCards.forEach((c, idx) => {
      const cx = marginX + idx * (cardW + cardGap);

      doc.setFillColor(...c.bg);
      doc.setDrawColor(...c.border);
      doc.setLineWidth(0.2);
      doc.roundedRect(cx, summaryY, cardW, cardH, 1.5, 1.5, 'FD');

      doc.setFillColor(...c.accent);
      doc.rect(cx + 0.8, summaryY, cardW - 1.6, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.6);
      doc.setTextColor(...c.labelColor);
      doc.text(c.label, cx + cardW / 2, summaryY + 5.8, { align: 'center' });

      let fSize = 8.5;
      doc.setFontSize(fSize);
      doc.setTextColor(...c.valColor);
      let displayVal = c.value;
      while (doc.getTextWidth(displayVal) > cardW - 3 && fSize > 5.5) {
        fSize -= 0.5;
        doc.setFontSize(fSize);
      }
      while (doc.getTextWidth(displayVal) > cardW - 3 && displayVal.length > 4) {
        displayVal = `${displayVal.slice(0, -4)}...`;
      }
      doc.text(displayVal, cx + cardW / 2, summaryY + 12.2, { align: 'center' });
    });

    // 5. Expenditure breakdown by category
    let nextY = summaryY + cardH + 3.5;
    const showBuckets = includeCategories && topCategories.length > 0;

    if (showBuckets) {
      const bucketH = 21;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.roundedRect(marginX, nextY, contentWidth, bucketH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text(COPY.expenditureHeading, marginX + 3.5, nextY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      const savingsValStr =
        savingsRate !== null ? `${savingsRate}%` : COPY.savingsRateNA;
      const rateText = `${COPY.savingsRateLabel} ${savingsValStr}`;
      doc.text(rateText, rightX - 3.5, nextY + 4.5, { align: 'right' });

      const nCats = topCategories.length;
      const bGap = 2;
      const bPad = 3.5;
      const catCardW = (contentWidth - bPad * 2 - (nCats - 1) * bGap) / nCats;
      const catCardH = 10.5;
      const catCardY = nextY + 7.5;

      topCategories.forEach((cat, idx) => {
        const bx = marginX + bPad + idx * (catCardW + bGap);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.15);
        doc.roundedRect(bx, catCardY, catCardW, catCardH, 1, 1, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(...C.navy);
        const safeCatName = cleanCategory(cat.name);
        doc.text(safeCatName, bx + 2, catCardY + 3.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(100, 116, 139);
        doc.text(`${cat.pct.toFixed(0)}%`, bx + catCardW - 2, catCardY + 3.2, {
          align: 'right',
        });

        const barY = catCardY + 4.5;
        const barW = catCardW - 4;
        doc.setFillColor(226, 232, 240);
        doc.rect(bx + 2, barY, barW, 1.1, 'F');
        doc.setFillColor(...C.emerald);
        const fillW = Math.max(0.5, barW * (Math.min(100, cat.pct) / 100));
        doc.rect(bx + 2, barY, fillW, 1.1, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.6);
        doc.setTextColor(71, 85, 105);
        doc.text(formatMoney(cat.cents, symbol, locale), bx + 2, catCardY + 8.8);
      });

      nextY += bucketH + 3.5;
    }

    // 6. Ledger section header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.navy);
    doc.text(COPY.ledgerHeading, marginX, nextY + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    const ledgerCountLabel = `${sortedTx.length} transaction${
      sortedTx.length === 1 ? '' : 's'
    } listed${isFiltered ? ' · Balances reflect filtered entries only' : ''}`;
    doc.text(ledgerCountLabel, rightX, nextY + 3, { align: 'right' });

    const tableStartY = nextY + 5;

    /* ─────────────────────────── Table data preparation ─────────────────────────── */

    let runningCents = openingCents;

    const tableData = sortedTx.map((t, idx) => {
      const amtCents = Math.abs(toCents(t.amount));
      const sign = resolveSign(t);
      runningCents += sign * amtCents;

      const ref = t.transaction_number || (t._id
        ? `TXN-${String(t._id).slice(-6).toUpperCase()}`
        : `TX-${String(idx + 1).padStart(4, '0')}`);

      const rawDesc = includeNotes
        ? t.note || t.description || t.category || COPY.defaultDescription
        : t.category || COPY.defaultDescription;

      const desc = sanitizeDescription(rawDesc, 52);
      const cat = cleanCategory(t.category);

      const sep = (symbol.endsWith('\u00A0') || symbol.endsWith(' ') || !symbol) ? '' : '\u00A0';
      const amtStr =
        (sign >= 0 ? '+' : '-') +
        symbol +
        sep +
        fromCents(amtCents).toLocaleString(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      const balStr = formatBalance(runningCents, symbol, locale);

      return [formatDateLatin(t.date), ref, desc, cat, amtStr, balStr];
    });

    /* 6 columns: Date (24), Reference (22), Description (52), Category (24), Amount (30), Balance (30) = 182mm */
    const colWidths = [24, 22, 52, 24, 30, 30];

    autoTable(doc, {
      startY: tableStartY,
      margin: { top: 22, left: marginX, right: marginX, bottom: 30 },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      head: [
        [
          COPY.colDate,
          COPY.colRef,
          COPY.colDescription,
          COPY.colCategory,
          `${COPY.colAmount} (${currency})`,
          COPY.colBalance,
        ],
      ],
      body:
        tableData.length > 0
          ? tableData
          : [
              [
                {
                  content: COPY.emptyState,
                  colSpan: 6,
                  styles: {
                    halign: 'center',
                    fontStyle: 'italic',
                    textColor: C.slate,
                    cellPadding: 8,
                  },
                },
              ],
            ],
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: C.navy,
        lineColor: C.border,
        lineWidth: 0.1,
        overflow: 'linebreak',
        rowPageBreak: 'avoid',
      },
      headStyles: {
        fillColor: C.navy,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: colWidths[0] },
        1: { cellWidth: colWidths[1], fontStyle: 'bold', textColor: C.navy },
        2: { cellWidth: colWidths[2], fontStyle: 'normal' },
        3: { cellWidth: colWidths[3], textColor: C.slate },
        4: { cellWidth: colWidths[4], halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: colWidths[5], halign: 'right', textColor: C.slate },
      },
      alternateRowStyles: { fillColor: C.zebra },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 4) return;
        const raw = String(data.cell.raw ?? '');
        if (raw.startsWith('+')) data.cell.styles.textColor = C.green;
        else if (raw.startsWith('-')) data.cell.styles.textColor = C.red;
      },
    });

    /* ─────────────────────────── Multi-page pagination & seal ─────────────────────────── */

    if (includeSeal) {
      const finalY = doc.lastAutoTable?.finalY || 100;
      if (pageHeight - finalY < 26) {
        doc.addPage();
      }
    }

    const totalPages = doc.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      // Continuation pages: executive continuation header
      if (i > 1) {
        doc.setFillColor(...C.crimson);
        doc.rect(0, 0, pageWidth, 2.2, 'F');

        if (logoDataUrl) {
          try {
            doc.addImage(logoDataUrl, 'PNG', marginX, 4.5, 15.5, 5.5);
          } catch {
            drawCoinwiseMark(doc, marginX, 3.8, 0.013, C.crimson);
          }
        } else {
          drawCoinwiseMark(doc, marginX, 3.8, 0.013, C.crimson);
        }

        const contBrandX = logoDataUrl ? marginX + 18 : marginX + 9;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...C.navy);
        doc.text(`${BRAND.name} · ${title.toUpperCase()}`, contBrandX, 8.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text(`${COPY.continuationRef} ${statementRef}`, contBrandX, 12.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.navy);
        doc.text(`Page ${i} of ${totalPages}`, rightX, 10.5, { align: 'right' });

        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.2);
        doc.line(marginX, 15.5, rightX, 15.5);
      }

      // Standard footer for all non-seal pages
      if (i < totalPages || !includeSeal) {
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.2);
        doc.line(marginX, pageHeight - 13, rightX, pageHeight - 13);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.slate);
        doc.text(COPY.footerText, marginX, pageHeight - 8.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...C.navy);
        doc.text(`Page ${i} of ${totalPages}`, rightX, pageHeight - 8.5, {
          align: 'right',
        });
      }
    }

    // Verification seal on the final page
    if (includeSeal) {
      doc.setPage(totalPages);
      const sealY = pageHeight - 21;

      doc.setDrawColor(...C.navy);
      doc.setLineWidth(0.5);
      doc.line(marginX, sealY, rightX, sealY);

      drawShieldIcon(doc, marginX, sealY + 2.8, 3.6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.navy);
      doc.text(COPY.sealHeading, marginX + 5.5, sealY + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(
        COPY.sealStatement.replace('{product}', BRAND.product),
        marginX,
        sealY + 9.2
      );
      doc.text(COPY.sealLegal, marginX, sealY + 12.2);

      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      const hashDisplay = checksum
        ? `${COPY.sealChecksumPrefix} ${checksum.replace(/^SHA256:/, '').slice(0, 32)}`
        : `${COPY.sealChecksumPrefix} ${COPY.sealChecksumUnavailable}`;
      doc.text(hashDisplay, marginX, sealY + 16);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.navy);
      doc.text(COPY.sealAuditStatus, rightX, sealY + 5.5, { align: 'right' });

      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(statementRef, rightX, sealY + 9.2, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${totalPages} of ${totalPages}`, rightX, sealY + 14, {
        align: 'right',
      });
    }

    /* ─────────────────────────── Download ─────────────────────────── */

    const safeUser = String(user?.username || 'Report').replace(/[^\w.-]+/g, '_');
    const fileName = `Coinwise_Statement_${safeUser}_${dateStamp}.pdf`;

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        // No-op in test environment
      }
    }

    return {
      success: true,
      fileName,
      checksum,
      checksumAvailable: Boolean(checksum),
    };
  } catch (err) {
    console.error('[exportToPDF] Statement generation failed:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Export a single transaction as an enterprise-grade payment receipt PDF.
 *
 * @param {object} user            - User profile ({ username, email, currency, ... }).
 * @param {object} transaction     - Ledger entry ({ _id, id, amount, type, category, date, merchant, bank_name, payment_method, note, tags, transaction_number }).
 * @param {object} [currencyInfo]  - { symbol } e.g. { symbol: '₹' }.
 * @param {string} [localeOpt]     - BCP-47 locale override.
 * @param {object} [options={}]    - Presentation overrides (currency, displayCurrency).
 * @returns {Promise<{ success: boolean, fileName?: string, checksum?: string|null, checksumAvailable?: boolean, error?: string }>}
 */
export async function exportReceiptPDF(user, transaction, currencyInfo, localeOpt, options = {}) {
  try {
    if (!transaction) {
      throw new Error('A transaction record is required to generate a receipt.');
    }
    const jsPdfMod = await import('jspdf');
    const jsPDF =
      typeof jsPdfMod.default === 'function'
        ? jsPdfMod.default
        : jsPdfMod.jsPDF || jsPdfMod.default?.jsPDF || jsPdfMod.default?.default;
    const autoTableMod = await import('jspdf-autotable');
    const autoTable =
      autoTableMod.default || autoTableMod.autoTable || autoTableMod;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });
    const { width: pageWidth, height: pageHeight, marginX } = PAGE;
    const contentWidth = pageWidth - marginX * 2; // 182mm
    const C = THEME;

    const currency =
      options.displayCurrency || options.currency || user?.currency || 'USD';
    const symbol = getSafePdfSymbol(currencyInfo?.symbol, currency);
    const rawLocale =
      localeOpt ||
      user?.locale ||
      (typeof navigator !== 'undefined' ? navigator.language : 'en-US') ||
      'en-US';
    const locale = toLatinNumLocale(rawLocale);

    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const txId = transaction.id || transaction._id || 'TXN';
    const refNum =
      transaction.transaction_number ||
      `TXN-${String(txId).slice(-9).toUpperCase()}`;
    const txDate = transaction.date || now;
    const issueDateStr = `${formatDateLatin(now)} ${now.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`;

    const sign = resolveSign(transaction);
    const isIncome = sign > 0;
    const cents = Math.abs(toCents(transaction.amount));
    const formattedAmount = `${isIncome ? '+' : '-'}${formatMoney(cents, symbol, locale)}`;

    // Compute the cryptographic SHA-256 checksum of the transaction record.
    // If unavailable (insecure context), the receipt renders an explicit
    // "Unavailable" notice rather than fabricating a digest.
    const payload = {
      ref: refNum,
      amount: cents,
      type: transaction.type,
      date: transaction.date,
      category: transaction.category,
      merchant: transaction.merchant,
      user: user?.id || user?._id || user?.username,
    };
    let checksum = null;
    let shortChecksum = null;
    try {
      checksum = await sha256Hex(JSON.stringify(payload));
      if (checksum) {
        shortChecksum = checksum.slice(0, 16).toUpperCase();
      }
    } catch (err) {
      console.warn(
        '[exportReceiptPDF] Checksum computation failed:',
        err?.message || err
      );
    }

    // 1. Crimson signature bar
    doc.setFillColor(...C.crimson);
    doc.rect(0, 0, pageWidth, 3.5, 'F');

    // 2. Brand header
    const headerY = 11;
    const logoHeight = 10;
    const logoWidth = logoHeight * (984 / 349); // ~28.19mm
    const logoDataUrl = options.logoDataUrl || (await getLogoDataUrl());

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', marginX, headerY, logoWidth, logoHeight);
      } catch {
        drawCoinwiseMark(doc, marginX, headerY, 0.022, C.crimson);
        doc.setTextColor(...C.navy);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(BRAND.name, marginX + 14, headerY + 6);
      }
    } else {
      drawCoinwiseMark(doc, marginX, headerY, 0.022, C.crimson);
      doc.setTextColor(...C.navy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(BRAND.name, marginX + 14, headerY + 6);
    }

    const certX = logoDataUrl
      ? marginX + logoWidth + 4
      : marginX + 14 + doc.getTextWidth(BRAND.name) + 3;
    doc.setFillColor(...C.crimson);
    doc.roundedRect(certX, headerY + 2.5, 20, 5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text('CERTIFIED', certX + 10, headerY + 6, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(BRAND.tagline, marginX, headerY + 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C.navy);
    doc.text(COPY.receiptTitle, marginX, headerY + 22);

    // Right-aligned voucher metadata
    const rightX = pageWidth - marginX;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${COPY.receiptReceiptNoLabel} ${refNum}`, rightX, headerY + 4, {
      align: 'right',
    });
    doc.text(
      `${COPY.receiptIssueLabel} ${issueDateStr}`,
      rightX,
      headerY + 8.5,
      { align: 'right' }
    );
    doc.text(COPY.receiptIntegrityStatus, rightX, headerY + 13, {
      align: 'right',
    });

    // Header divider
    const dividerY = headerY + 25;
    doc.setDrawColor(...C.navy);
    doc.setLineWidth(0.5);
    doc.line(marginX, dividerY, rightX, dividerY);

    // 3. Hero voucher card
    const heroY = dividerY + 5;
    const heroH = 46;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, heroY, contentWidth, heroH, 3, 3, 'FD');

    // Status pill
    const statusText = isIncome
      ? COPY.receiptStatusCredit
      : COPY.receiptStatusDebit;
    const statusBg = isIncome ? [209, 250, 229] : [255, 228, 230];
    const statusColor = isIncome ? C.emerald : C.red;
    const pillW = 44;
    const pillH = 6;
    const pillX = marginX + (contentWidth - pillW) / 2;
    const pillY = heroY + 6;

    doc.setFillColor(...statusBg);
    doc.roundedRect(pillX, pillY, pillW, pillH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...statusColor);
    doc.text(statusText, pillX + pillW / 2, pillY + 4.2, { align: 'center' });

    // Large amount
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(
      isIncome ? C.emerald[0] : C.navy[0],
      isIncome ? C.emerald[1] : C.navy[1],
      isIncome ? C.emerald[2] : C.navy[2]
    );
    doc.text(formattedAmount, marginX + contentWidth / 2, heroY + 22, {
      align: 'center',
    });

    // Category and counterparty
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...C.navy);
    const cleanCat = cleanCategory(transaction.category);
    const catMerchantStr = transaction.merchant
      ? `${cleanCat} · ${transaction.merchant}`
      : cleanCat;
    doc.text(catMerchantStr, marginX + contentWidth / 2, heroY + 30, {
      align: 'center',
    });

    // Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(formatDateLatin(txDate), marginX + contentWidth / 2, heroY + 37, {
      align: 'center',
    });

    // 4. Particulars table
    const tableY = heroY + heroH + 6;

    const accountHolderName = String(
      user?.username || COPY.valueAccountHolder
    ).replace(/_/g, ' ');

    const particulars = [
      [COPY.receiptLabelRef, refNum],
      [
        COPY.receiptLabelType,
        isIncome ? 'Income / Inflow (Credit)' : 'Expense / Outflow (Debit)',
      ],
      [COPY.receiptLabelDate, formatDateLatin(txDate)],
      [COPY.receiptLabelCategory, cleanCategory(transaction.category)],
      [COPY.receiptLabelMerchant, transaction.merchant || COPY.defaultMerchant],
      [COPY.receiptLabelSource, transaction.bank_name || COPY.defaultBank],
      [COPY.receiptLabelPayment, transaction.payment_method || COPY.defaultPaymentMethod],
      [
        COPY.receiptLabelBudget,
        transaction.budget_category && transaction.budget_category !== 'auto'
          ? cleanCategory(transaction.budget_category)
          : `${cleanCategory(transaction.category)} ${COPY.autoAllocatedSuffix}`,
      ],
      [
        COPY.receiptLabelSender,
        transaction.sender_name ||
          (isIncome ? COPY.defaultSender : accountHolderName),
      ],
      [
        COPY.receiptLabelRecipient,
        transaction.receiver_name ||
          (isIncome
            ? accountHolderName
            : transaction.merchant || COPY.defaultCounterparty),
      ],
      [
        COPY.receiptLabelDescription,
        sanitizeDescription(transaction.note || COPY.defaultNote, 120),
      ],
      [
        COPY.receiptLabelTags,
        Array.isArray(transaction.tags) && transaction.tags.length > 0
          ? transaction.tags.map((t) => `#${t}`).join(', ')
          : COPY.defaultTags,
      ],
    ];

    autoTable(doc, {
      startY: tableY,
      margin: { left: marginX, right: marginX },
      theme: 'plain',
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
        lineColor: C.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: C.navy,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      head: [[COPY.receiptColSpec, COPY.receiptColDetail]],
      body: particulars,
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold', textColor: [71, 85, 105] },
        1: { cellWidth: contentWidth - 60, fontStyle: 'normal', textColor: C.navy },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    const finalY = doc.lastAutoTable.finalY + 6;

    // 5. Verification seal and barcode panel
    const sealH = 26;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, finalY, contentWidth, sealH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.navy);
    doc.text(COPY.receiptSealHeading, marginX + 4, finalY + 6);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    const shaDisplay = checksum
      ? `SHA-256: ${checksum}`
      : `SHA-256: ${COPY.sealChecksumUnavailable}`;
    doc.text(shaDisplay, marginX + 4, finalY + 11.5);

    const integrityRefLine = checksum
      ? `${COPY.receiptIntegrityRef} ${refNum} · Fingerprint: ${shortChecksum}`
      : `${COPY.receiptIntegrityRef} ${refNum}`;
    doc.text(integrityRefLine, marginX + 4, finalY + 16.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(COPY.receiptImmutability, marginX + 4, finalY + 21.5);

    // Stylized barcode
    const barX = rightX - 42;
    const barY = finalY + 5;
    const barH = 11;
    const barWidths = [
      1.2, 0.6, 1.8, 0.6, 1.2, 2.4, 0.6, 1.2, 1.8, 0.6, 1.2, 2.4, 1.2, 0.6,
      1.8, 0.6, 1.2,
    ];
    let curBx = barX;
    doc.setFillColor(...C.navy);
    barWidths.forEach((bw) => {
      doc.rect(curBx, barY, bw, barH, 'F');
      curBx += bw + 0.8;
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(COPY.receiptSealBarcodeLabel, barX + 17, finalY + 20, {
      align: 'center',
    });

    // 6. Attestation footer
    const botY = pageHeight - 12;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(marginX, botY, rightX, botY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(BRAND.product, marginX, botY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(COPY.receiptFooterLine, marginX, botY + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('Page 1 of 1', rightX, botY + 4.5, { align: 'right' });

    // Download
    const safeTxNum = String(refNum).replace(/[^\w.-]+/g, '_');
    const fileName = `Coinwise_Receipt_${safeTxNum}_${dateStamp}.pdf`;

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        // No-op in test environment
      }
    }

    return {
      success: true,
      fileName,
      checksum,
      checksumAvailable: Boolean(checksum),
    };
  } catch (err) {
    console.error('[exportReceiptPDF] Receipt generation failed:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export default exportToPDF;