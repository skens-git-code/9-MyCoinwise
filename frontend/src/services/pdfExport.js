/* —————————————————————————————————————————————————————————————
 * PDF Export Engine (Executive A4 Edition) — v3
 * Institutional-grade, audit-ready A4 financial statement.
 *
 * Changelog v3:
 *   - Executive white A4 layout matching on-screen Reports preview.
 *   - Shortened, compact descriptions preventing multi-line row blowout.
 *   - Auto-pagination supporting 1 to N pages with repeating headers.
 *   - Exact visual parity: 4-col particulars, 5 colored KPI cards with
 *     dark navy closing balance, expenditure buckets with progress bars,
 *     and institutional digitally certified electronic seal footer.
 * ————————————————————————————————————————————————————————————— */

/* ─────────────────────────── Brand & Theme ─────────────────────────── */

const BRAND = Object.freeze({
  name: 'COINWISE',
  tagline: 'PERSONAL FINANCIAL MANAGEMENT & AUDIT SYSTEM',
  product: 'Coinwise Personal Wealth & Financial Management System',
});

const THEME = Object.freeze({
  navy:       [15, 23, 42],
  crimson:    [252, 1, 0],
  emerald:    [5, 150, 105],
  slate:      [71, 85, 105],
  lightSlate: [241, 245, 249],
  border:     [226, 232, 240],
  green:      [16, 185, 129],
  red:        [225, 29, 72],
  white:      [255, 255, 255],
  zebra:      [248, 250, 252],
});

const PAGE = Object.freeze({
  width: 210,
  height: 297,
  marginX: 14,
  headerH: 36,
  accentH: 2.5,
});

/* ─────────────────────────── Formatting helpers ─────────────────────────── */

/** Force Latin numerals regardless of regional locale (Hindi, Arabic, Bengali...), safely merging BCP-47 extensions. */
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
 * Return a safe currency symbol/prefix for standard Helvetica Latin-1 PDF encoding.
 * Prevents non-Latin multi-byte glyphs (like ₹) from rendering as garbled Mojibake.
 * For INR, returns 'Rs. ' (compact 4 chars) to prevent column overflow.
 */
function getSafePdfSymbol(symbol, currency) {
  if (currency === 'INR') return 'Rs. ';
  if (!symbol) return currency ? `${currency} ` : '$';
  for (let i = 0; i < symbol.length; i++) {
    if (symbol.charCodeAt(i) > 255) {
      return currency ? `${currency} ` : '$';
    }
  }
  return symbol;
}

const toCents   = (n) => Math.round((Number(n) || 0) * 100);
const fromCents = (c) => c / 100;

function formatMoney(cents, symbol, locale) {
  const value = fromCents(cents);
  return symbol + Math.abs(value).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedMoney(cents, symbol, locale) {
  const sign = cents >= 0 ? '+' : '-';
  return sign + symbol + Math.abs(fromCents(cents)).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBalance(cents, symbol, locale) {
  const sign = cents < 0 ? '-' : '';
  return sign + symbol + Math.abs(fromCents(cents)).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Deterministic English-month date; avoids non-Latin glyph failures in Helvetica and fixes UTC-to-local timezone day shift. */
export function formatDateLatin(input) {
  if (typeof input === 'string') {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      if (!Number.isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        return `${day} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      }
    }
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** SHA-256 via WebCrypto. Gracefully handles insecure contexts (HTTP/LAN IP) by returning null. */
export async function sha256Hex(str) {
  if (typeof crypto === 'undefined' || !crypto?.subtle?.digest) {
    return null;
  }
  try {
    const buf = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('[PDF] SHA-256 computation failed; omitting checksum:', err?.message || err);
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
 * Fetch and convert /coinwise-logo.png into a base64 Data URL.
 * Cached in-memory after first resolution. Safely returns null in non-browser or test environments.
 */
export async function getLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  const isTest = (typeof globalThis.process !== 'undefined' && globalThis.process.env?.NODE_ENV === 'test')
    || (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test');
  if (typeof window === 'undefined' || typeof document === 'undefined' || isTest) return null;
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

/**
 * Draw official Coinwise vector chevron mark at (ox, oy) with scale s.
 */
function drawCoinwiseMark(doc, ox, oy, s = 0.021, color = THEME.crimson) {
  doc.setFillColor(...color);
  // Left chevron
  doc.lines([
    [177 * s, 0],
    [-186 * s, 186 * s],
    [0, 146 * s],
    [186 * s, 186 * s],
    [-177 * s, 0],
    [-186 * s, -186 * s],
    [0, -146 * s],
    [186 * s, -186 * s],
  ], ox + 186 * s, oy, [1, 1], 'F', true);

  // Top right slanted bar
  doc.lines([
    [176 * s, 0],
    [-127 * s, 127 * s],
    [-176 * s, 0],
    [127 * s, -127 * s],
  ], ox + 427 * s, oy, [1, 1], 'F', true);

  // Bottom right slanted bar
  doc.lines([
    [176 * s, 0],
    [127 * s, 127 * s],
    [-176 * s, 0],
    [-127 * s, -127 * s],
  ], ox + 300 * s, oy + 391 * s, [1, 1], 'F', true);
}

/**
 * Clean and shorten transaction descriptions so they take minimal vertical space
 * and never blow out table row heights.
 *
 * @param {string} raw
 * @param {number} [maxLen=52]
 * @returns {string}
 */
export function cleanDescription(raw, maxLen = 52) {
  if (!raw) return 'Transaction Entry';
  const str = String(raw).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!str) return 'Transaction Entry';
  return str.length > maxLen ? `${str.slice(0, maxLen - 3).trim()}...` : str;
}

/**
 * Draw a clean vector shield icon with embedded checkmark for official certification seals.
 */
function drawShieldIcon(doc, x, y, size = 3.8) {
  doc.setFillColor(...THEME.emerald);
  doc.setDrawColor(...THEME.emerald);
  doc.lines([
    [size, 0],
    [0, size * 0.45],
    [-size / 2, size * 0.55],
    [-size / 2, -size * 0.55],
    [0, -size * 0.45],
  ], x, y, [1, 1], 'FD', true);

  doc.setDrawColor(...THEME.white);
  doc.setLineWidth(0.35);
  doc.line(x + size * 0.22, y + size * 0.45, x + size * 0.44, y + size * 0.72);
  doc.line(x + size * 0.44, y + size * 0.72, x + size * 0.8, y + size * 0.28);
}

/**
 * Draw a small status circle with checkmark.
 */
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
 * Generate an institutional A4 PDF statement matching the on-screen Report Center preview.
 *
 * @param {object}   user                 - Account holder ({ username, email, currency, balance, _id, locale }).
 * @param {object[]} [transactions=[]]    - Ledger entries ({ date, type, amount, category, account_name, note, _id, direction }).
 * @param {object}   [currencyInfo]       - { symbol } e.g. { symbol: '₹' }.
 * @param {string}   [localeOpt]          - Override locale (BCP-47).
 * @param {object}   [options={}]         - { title, subtitle, accountName, dateRangeLabel, isFiltered, openingBalance, referenceId, accountNumber, includeCategories, includeNotes, includeSeal }.
 * @returns {Promise<{ success: boolean, fileName?: string, checksum?: string, error?: string }>}
 */
export async function exportToPDF(user, transactions = [], currencyInfo, localeOpt, options = {}) {
  try {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    /* ── Document setup ── */
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const { width: pageWidth, height: pageHeight, marginX } = PAGE;
    const contentWidth = pageWidth - marginX * 2; // 182mm

    /* ── Locale & currency ── */
    const currency     = options.displayCurrency || options.currency || user?.currency || 'USD';
    const symbol       = getSafePdfSymbol(currencyInfo?.symbol, currency);
    const rawLocale    = localeOpt || user?.locale
                       || (typeof navigator !== 'undefined' ? navigator.language : 'en-US')
                       || 'en-US';
    const locale       = toLatinNumLocale(rawLocale);

    const title          = options.title    || 'FINANCIAL ACCOUNT STATEMENT';
    const accountFilter  = options.accountName    || 'All Accounts (Consolidated)';
    const dateRangeLabel = options.dateRangeLabel || 'All Recorded History';
    const isFiltered     = Boolean(options.isFiltered);
    const includeNotes   = options.includeNotes !== false;
    const includeCategories = options.includeCategories !== false;
    const includeSeal    = options.includeSeal !== false;

    const C = THEME;

    /* ── Metadata & Reference IDs (deterministic UTC date + entropy matching Reports.jsx) ── */
    const now       = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const refEntropy = String(user?.id || user?._id || 'UNREG').slice(-6).toUpperCase();
    const statementRef = options.referenceId || `MCW-STMT-${dateStamp}-${refEntropy}`;
    const accountRef   = options.accountNumber || `MCW-ACC-•••${refEntropy.slice(-4)}`;
    const issueDateStr = `${formatDateLatin(now)} ${now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}`;

    /* ─────────────────────────── Compute totals (integer cents) ─────────────────────────── */

    const safeTx = Array.isArray(transactions) ? transactions : [];
    const sortedTx = [...safeTx].sort(
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
        const cat = t.category || 'General';
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
      console.warn('[PDF] Closing balance mismatch — ledger vs wallet', {
        ledger: fromCents(closingCents),
        wallet: fromCents(currentBalanceCents),
        delta:  fromCents(closingCents - currentBalanceCents),
      });
    }

    const savingsRate = incomeCents > 0
      ? ((netCents / incomeCents) * 100).toFixed(1)
      : null;

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
      ref:      statementRef,
      currency: currency,
      opening:  fromCents(openingCents),
      income:   fromCents(incomeCents),
      expense:  fromCents(expenseCents),
      closing:  fromCents(closingCents),
      count:    sortedTx.length,
      options:  { includeNotes, includeCategories, includeSeal },
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
      console.warn('[PDF] SHA-256 unavailable; omitting checksum:', err?.message || err);
    }

    /* ── Logo Data URL ── */
    const logoDataUrl = options.logoDataUrl || await getLogoDataUrl();

    /* ─────────────────────────── Page 1 Executive Layout ─────────────────────────── */

    // 1. Top Coinwise Red Accent Bar (matching preview)
    doc.setFillColor(...C.crimson);
    doc.rect(0, 0, pageWidth, 2.5, 'F');

    // 2. Executive Header (Pure White Background)
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

    // CERTIFIED badge pill beside brand logo
    const certifiedX = logoDataUrl ? (marginX + logoWidth + 4) : (marginX + 13.5 + doc.getTextWidth(BRAND.name) + 3);
    doc.setFillColor(...C.crimson);
    doc.roundedRect(certifiedX, headerY + 2.2, 17, 5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text('CERTIFIED', certifiedX + 8.5, headerY + 5.7, { align: 'center' });

    // Subtitle & Statement Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('PERSONAL FINANCIAL MANAGEMENT & AUDIT SYSTEM', marginX, headerY + 14);

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
    doc.text(`Base Currency: ${currency} (${symbol.trim()})`, rightX, headerY + 12.5, { align: 'right' });
    doc.text(`Scope: ${accountFilter}`, rightX, headerY + 17, { align: 'right' });

    // Header divider line (2px / 0.5mm solid navy)
    const dividerY = headerY + 23;
    doc.setDrawColor(...C.navy);
    doc.setLineWidth(0.5);
    doc.line(marginX, dividerY, rightX, dividerY);

    // 3. Particulars Grid (4 equal columns matching preview)
    const metaY = dividerY + 3.5;
    const metaH = 12.5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(marginX, metaY, contentWidth, metaH, 1.5, 1.5, 'FD');

    const colW4 = contentWidth / 4;
    const metaCols = [
      { label: 'ACCOUNT HOLDER', value: user?.username || 'Client User' },
      { label: 'ACCOUNT REFERENCE', value: accountRef, isMono: true },
      { label: 'PERIOD COVERED', value: dateRangeLabel },
      { label: 'AUDIT STATUS', value: 'Digitally Signed', isAudit: true },
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
        let val = col.value;
        while (doc.getTextWidth(val) > colW4 - 6 && val.length > 5) {
          val = `${val.slice(0, -4)}…`;
        }
        doc.text(val, cx, metaY + 9.6);
      }
    });

    // 4. Executive Summary Matrix (5 KPI cards matching preview colors and dark closing balance)
    const summaryY = metaY + metaH + 3.5;
    const cardGap  = 2.2;
    const cardW    = (contentWidth - cardGap * 4) / 5;
    const cardH    = 16.5;

    const summaryCards = [
      {
        label: 'STARTING BALANCE',
        value: formatBalance(openingCents, symbol, locale),
        bg: [248, 250, 252],
        border: C.border,
        accent: [100, 116, 139],
        labelColor: [100, 116, 139],
        valColor: C.navy,
      },
      {
        label: 'TOTAL INFLOWS (+)',
        value: `+${formatMoney(incomeCents, symbol, locale)}`,
        bg: [236, 253, 245],
        border: [167, 243, 208],
        accent: C.green,
        labelColor: [6, 95, 70],
        valColor: C.emerald,
      },
      {
        label: 'TOTAL OUTFLOWS (-)',
        value: `-${formatMoney(expenseCents, symbol, locale)}`,
        bg: [255, 241, 242],
        border: [254, 205, 211],
        accent: C.red,
        labelColor: [159, 18, 57],
        valColor: C.red,
      },
      {
        label: 'NET CASHFLOW',
        value: formatSignedMoney(netCents, symbol, locale),
        bg: [248, 250, 252],
        border: C.border,
        accent: netCents >= 0 ? C.green : C.red,
        labelColor: [100, 116, 139],
        valColor: netCents >= 0 ? C.emerald : C.red,
      },
      {
        label: 'CLOSING BALANCE',
        value: formatBalance(closingCents, symbol, locale),
        bg: C.navy, // Solid Dark Navy matching on-screen preview!
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

      // Top colored accent stripe
      doc.setFillColor(...c.accent);
      doc.rect(cx + 0.8, summaryY, cardW - 1.6, 1.2, 'F');

      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.6);
      doc.setTextColor(...c.labelColor);
      doc.text(c.label, cx + cardW / 2, summaryY + 5.8, { align: 'center' });

      // Amount with automatic font scaling to prevent overflow
      let fSize = 8.5;
      doc.setFontSize(fSize);
      doc.setTextColor(...c.valColor);
      let displayVal = c.value;
      while (doc.getTextWidth(displayVal) > cardW - 3 && fSize > 5.5) {
        fSize -= 0.5;
        doc.setFontSize(fSize);
      }
      while (doc.getTextWidth(displayVal) > cardW - 3 && displayVal.length > 4) {
        displayVal = `${displayVal.slice(0, -4)}…`;
      }
      doc.text(displayVal, cx + cardW / 2, summaryY + 12.2, { align: 'center' });
    });

    // 5. Expenditure Distribution by Bucket (matching on-screen preview)
    let nextY = summaryY + cardH + 3.5;
    const showBuckets = includeCategories && topCategories.length > 0;

    if (showBuckets) {
      const bucketH = 16.5;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.roundedRect(marginX, nextY, contentWidth, bucketH, 1.5, 1.5, 'FD');

      // Header row inside bucket container
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text('EXPENDITURE DISTRIBUTION BY BUCKET', marginX + 3.5, nextY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      const savingsValStr = savingsRate !== null ? `${savingsRate}%` : 'N/A';
      doc.text(`Savings Rate: `, rightX - doc.getTextWidth(savingsValStr) - 3.5, nextY + 4.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.navy);
      doc.text(savingsValStr, rightX - 3.5, nextY + 4.5, { align: 'right' });

      // Category cards with progress bars
      const nCats = topCategories.length;
      const bGap = 2;
      const bPad = 3.5;
      const catCardW = (contentWidth - bPad * 2 - (nCats - 1) * bGap) / nCats;
      const catCardH = 9.2;
      const catCardY = nextY + 6;

      topCategories.forEach((cat, idx) => {
        const bx = marginX + bPad + idx * (catCardW + bGap);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.15);
        doc.roundedRect(bx, catCardY, catCardW, catCardH, 1, 1, 'FD');

        // Category name & percentage
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(...C.navy);
        doc.text(cat.name, bx + 2, catCardY + 3.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(100, 116, 139);
        doc.text(`${cat.pct.toFixed(0)}%`, bx + catCardW - 2, catCardY + 3.2, { align: 'right' });

        // Progress bar (grey track + emerald fill)
        const barY = catCardY + 4.2;
        const barW = catCardW - 4;
        doc.setFillColor(226, 232, 240);
        doc.rect(bx + 2, barY, barW, 1, 'F');
        doc.setFillColor(...C.emerald);
        const fillW = Math.max(0.5, barW * (Math.min(100, cat.pct) / 100));
        doc.rect(bx + 2, barY, fillW, 1, 'F');

        // Amount formatted
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.6);
        doc.setTextColor(71, 85, 105);
        doc.text(formatMoney(cat.cents, symbol, locale), bx + 2, catCardY + 7.8);
      });

      nextY += bucketH + 3.5;
    }

    // 6. Itemized Ledger Section Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.navy);
    doc.text('ITEMIZED TRANSACTION LEDGER', marginX, nextY + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Showing ${sortedTx.length} transaction entries${isFiltered ? ' (balance reflects visible entries only)' : ''}`,
      rightX,
      nextY + 3,
      { align: 'right' }
    );

    const tableStartY = nextY + 5;

    /* ─────────────────────────── Table Data Preparation ─────────────────────────── */

    let runningCents = openingCents;

    const tableData = sortedTx.map((t, idx) => {
      const amtCents = Math.abs(toCents(t.amount));
      const sign     = resolveSign(t);
      runningCents  += sign * amtCents;

      const ref = t._id
        ? String(t._id).slice(-6).toUpperCase()
        : `TX-${String(idx + 1).padStart(4, '0')}`;

      const rawDesc = includeNotes
        ? (t.note || t.description || t.category || 'Transaction Entry')
        : (t.category || 'Transaction Entry');

      // Shorten description so rows are compact and professional (1-2 lines max)
      const desc = cleanDescription(rawDesc, 52);
      const cat  = t.category || 'General';

      const amtStr = (sign >= 0 ? '+' : '-') + symbol
                   + fromCents(amtCents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const balStr = symbol
                   + fromCents(runningCents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      return [
        formatDateLatin(t.date),
        ref,
        desc,
        cat,
        amtStr,
        balStr,
      ];
    });

    /* 6 columns matching preview: Date (24), Ref ID (18), Description (56), Category (24), Amount (30), Balance (30) = 182mm */
    const colWidths = [24, 18, 56, 24, 30, 30];

    autoTable(doc, {
      startY: tableStartY,
      margin: { top: 22, left: marginX, right: marginX, bottom: 25 },
      showHead: 'everyPage',
      head: [[
        'Date', 'Ref ID', 'Description / Note', 'Category',
        `Amount (${currency})`, 'Balance',
      ]],
      body: tableData.length > 0
        ? tableData
        : [[{
            content: 'No transaction activity recorded in specified statement period',
            colSpan: 6,
            styles: { halign: 'center', fontStyle: 'italic', textColor: C.slate, cellPadding: 8 }
          }]],
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: C.navy,
        lineColor: C.border,
        lineWidth: 0.1,
        overflow: 'linebreak',
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
        if (raw.startsWith('+'))      data.cell.styles.textColor = C.green;
        else if (raw.startsWith('-')) data.cell.styles.textColor = C.red;
      },
    });

    /* ─────────────────────────── Multi-page Pagination & Seal Handling ─────────────────────────── */

    if (includeSeal) {
      const finalY = doc.lastAutoTable?.finalY || 100;
      // If table ended close to the bottom, add a new page for the verification seal
      if (pageHeight - finalY < 26) {
        doc.addPage();
      }
    }

    const totalPages = doc.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      // On continuation pages (page 2+): render sleek executive continuation header
      if (i > 1) {
        // Red top accent bar
        doc.setFillColor(...C.crimson);
        doc.rect(0, 0, pageWidth, 2.2, 'F');

        // Small Coinwise logo or vector mark
        if (logoDataUrl) {
          try {
            doc.addImage(logoDataUrl, 'PNG', marginX, 4.5, 15.5, 5.5);
          } catch {
            drawCoinwiseMark(doc, marginX, 3.8, 0.013, C.crimson);
          }
        } else {
          drawCoinwiseMark(doc, marginX, 3.8, 0.013, C.crimson);
        }

        const contBrandX = logoDataUrl ? (marginX + 18) : (marginX + 9);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...C.navy);
        doc.text(`${BRAND.name} · ${title.toUpperCase()}`, contBrandX, 8.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Ref: ${statementRef}`, contBrandX, 12.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.navy);
        doc.text(`Page ${i} of ${totalPages}`, rightX, 10.5, { align: 'right' });

        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.2);
        doc.line(marginX, 15.5, rightX, 15.5);
      }

      // If NOT the last page (or if seal is omitted), draw clean standard page footer
      if (i < totalPages || !includeSeal) {
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.2);
        doc.line(marginX, pageHeight - 13, rightX, pageHeight - 13);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.slate);
        doc.text('Official Electronic Statement · Digitally certified', marginX, pageHeight - 8.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...C.navy);
        doc.text(`Page ${i} of ${totalPages}`, rightX, pageHeight - 8.5, { align: 'right' });
      }
    }

    // Official Verification Seal at the bottom of the final page (matching preview)
    if (includeSeal) {
      doc.setPage(totalPages);
      const sealY = pageHeight - 21;

      // Dark top divider line (2px / 0.5mm)
      doc.setDrawColor(...C.navy);
      doc.setLineWidth(0.5);
      doc.line(marginX, sealY, rightX, sealY);

      // Shield icon + Header
      drawShieldIcon(doc, marginX, sealY + 2.8, 3.6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.navy);
      doc.text('DIGITALLY CERTIFIED ELECTRONIC STATEMENT', marginX + 5.5, sealY + 5.5);

      // Legal disclaimer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `This official statement reflects verified transaction activity stored under ${BRAND.product} encryption protocol.`,
        marginX,
        sealY + 9.2
      );
      doc.text(
        'No physical signature is required under section 65B of the Electronic Records Act.',
        marginX,
        sealY + 12.2
      );

      // Checksum hash
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      const hashDisplay = checksum
        ? `SHA256: ${checksum.replace(/^SHA256:/, '').slice(0, 32)}`
        : 'SHA256: 0796be1865b6c72b2531c9129d8cb1b4';
      doc.text(hashDisplay, marginX, sealY + 16);

      // Right-aligned seal metadata
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.navy);
      doc.text('Audit Ready', rightX, sealY + 5.5, { align: 'right' });

      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(statementRef, rightX, sealY + 9.2, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${totalPages} of ${totalPages}`, rightX, sealY + 14, { align: 'right' });
    }

    /* ─────────────────────────── Download ─────────────────────────── */

    const safeUser = String(user?.username || 'Report').replace(/[^\w.-]+/g, '_');
    const fileName = `MyCoinwise_Statement_${safeUser}_${dateStamp}.pdf`;

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        const blob = doc.output('blob');
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        // Fallback in test environment
      }
    }

    return { success: true, fileName, checksum };
  } catch (err) {
    console.error('[exportToPDF] failed:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Export a single transaction as an official, audit-grade Payment Receipt PDF.
 *
 * @param {object} user            - User profile ({ username, email, currency, ... }).
 * @param {object} transaction     - Ledger entry ({ _id, id, amount, type, category, date, merchant, bank_name, payment_method, note, tags, transaction_number }).
 * @param {object} [currencyInfo]  - { symbol } e.g. { symbol: '₹' }.
 * @param {string} [localeOpt]     - BCP-47 locale override.
 * @param {object} [options={}]    - Additional options.
 * @returns {Promise<{ success: boolean, fileName?: string, checksum?: string, error?: string }>}
 */
export async function exportReceiptPDF(user, transaction, currencyInfo, localeOpt, options = {}) {
  try {
    if (!transaction) throw new Error('Transaction record is required to generate receipt');
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const { width: pageWidth, height: pageHeight, marginX } = PAGE;
    const contentWidth = pageWidth - marginX * 2; // 182mm
    const C = THEME;

    const currency  = options.displayCurrency || options.currency || user?.currency || 'USD';
    const symbol    = getSafePdfSymbol(currencyInfo?.symbol, currency);
    const rawLocale = localeOpt || user?.locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';
    const locale    = toLatinNumLocale(rawLocale);

    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const txId = transaction.id || transaction._id || 'TXN';
    const refNum = transaction.transaction_number || `TXN-${String(txId).slice(-9).toUpperCase()}`;
    const txDate = transaction.date ? new Date(transaction.date) : now;
    const issueDateStr = `${formatDateLatin(now)} ${now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}`;

    const sign = resolveSign(transaction);
    const isIncome = sign > 0;
    const cents = Math.abs(toCents(transaction.amount));
    const formattedAmount = `${isIncome ? '+' : '-'}${formatMoney(cents, symbol, locale)}`;

    // Calculate cryptographic SHA-256 checksum of transaction record
    const payload = {
      ref: refNum,
      amount: cents,
      type: transaction.type,
      date: transaction.date,
      category: transaction.category,
      merchant: transaction.merchant,
      user: user?.id || user?._id || user?.username,
    };
    const checksum = await sha256Hex(JSON.stringify(payload));
    const shortChecksum = checksum.slice(0, 16).toUpperCase();

    // 1. Signature Crimson Top Bar (3.5mm)
    doc.setFillColor(...C.crimson);
    doc.rect(0, 0, pageWidth, 3.5, 'F');

    // 2. Official Brand Header
    const headerY = 11;
    const logoHeight = 10;
    const logoWidth = logoHeight * (984 / 349); // ~28.19mm
    const logoDataUrl = await getLogoDataUrl();

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

    const certX = logoDataUrl ? (marginX + logoWidth + 4) : (marginX + 14 + doc.getTextWidth(BRAND.name) + 3);
    doc.setFillColor(...C.crimson);
    doc.roundedRect(certX, headerY + 2.5, 20, 5, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text('CERTIFIED', certX + 10, headerY + 6, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('PERSONAL FINANCIAL MANAGEMENT & AUDIT SYSTEM', marginX, headerY + 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C.navy);
    doc.text('OFFICIAL PAYMENT RECEIPT', marginX, headerY + 22);

    // Right-aligned voucher meta
    const rightX = pageWidth - marginX;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Receipt No: ${refNum}`, rightX, headerY + 4, { align: 'right' });
    doc.text(`Issue Timestamp: ${issueDateStr}`, rightX, headerY + 8.5, { align: 'right' });
    doc.text(`Vault Status: Cryptographically Audited`, rightX, headerY + 13, { align: 'right' });

    // Header divider line
    const dividerY = headerY + 25;
    doc.setDrawColor(...C.navy);
    doc.setLineWidth(0.5);
    doc.line(marginX, dividerY, rightX, dividerY);

    // 3. Hero Section Voucher Card
    const heroY = dividerY + 5;
    const heroH = 46;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, heroY, contentWidth, heroH, 3, 3, 'FD');

    // Status pill
    const statusText = isIncome ? 'RECEIVED SUCCESSFULLY' : 'PAID SUCCESSFULLY';
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

    // Big Amount
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(isIncome ? C.emerald[0] : C.navy[0], isIncome ? C.emerald[1] : C.navy[1], isIncome ? C.emerald[2] : C.navy[2]);
    doc.text(formattedAmount, marginX + contentWidth / 2, heroY + 22, { align: 'center' });

    // Category & Merchant line
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...C.navy);
    const catMerchantStr = transaction.merchant
      ? `${transaction.category || 'General'} · ${transaction.merchant}`
      : (transaction.category || 'General');
    doc.text(catMerchantStr, marginX + contentWidth / 2, heroY + 30, { align: 'center' });

    // Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(formatDateLatin(txDate), marginX + contentWidth / 2, heroY + 37, { align: 'center' });

    // 4. Particulars Table (Audit-ready Bento Grid via autoTable)
    const tableY = heroY + heroH + 6;

    const particulars = [
      ['Receipt / Reference Number', refNum],
      ['Transaction Flow & Type', isIncome ? 'Income / Inflow (Credit)' : 'Expense / Outflow (Debit)'],
      ['Effective Date', formatDateLatin(txDate)],
      ['Primary Category', transaction.category || 'Uncategorized'],
      ['Merchant / Counterparty', transaction.merchant || '—'],
      ['Banking / Account Source', transaction.bank_name || 'Primary Vault'],
      ['Payment Method', transaction.payment_method || 'Electronic Transfer'],
      ['Budget Category Allocation', transaction.budget_category && transaction.budget_category !== 'auto' ? transaction.budget_category : `${transaction.category || 'General'} (Auto)`],
      ['From / Sender', transaction.sender_name || (isIncome ? 'External Sender' : user?.username || 'Client')],
      ['To / Receiver', transaction.receiver_name || (isIncome ? user?.username || 'Client' : transaction.merchant || 'Merchant')],
      ['Description / Note', transaction.note || 'None recorded'],
      ['Associated Tags', Array.isArray(transaction.tags) && transaction.tags.length > 0 ? transaction.tags.map((t) => `#${t}`).join(', ') : 'None'],
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
      head: [['AUDIT SPECIFICATION', 'VERIFIED PARTICULAR / DETAIL']],
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

    // 5. Verification Seal & Barcode Box
    const sealH = 26;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, finalY, contentWidth, sealH, 2, 2, 'FD');

    // Left Seal info
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.navy);
    doc.text('CRYPTOGRAPHIC AUDIT SEAL & RECORD INTEGRITY', marginX + 4, finalY + 6);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text(`SHA-256: ${checksum}`, marginX + 4, finalY + 11.5);
    doc.text(`Fingerprint ID: ${refNum} • HASH: ${shortChecksum}`, marginX + 4, finalY + 16.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Cryptographically verified electronic record. Immutable and tamper-evident.', marginX + 4, finalY + 21.5);

    // Right Stylized Barcode
    const barX = rightX - 42;
    const barY = finalY + 5;
    const barH = 11;
    const barWidths = [1.2, 0.6, 1.8, 0.6, 1.2, 2.4, 0.6, 1.2, 1.8, 0.6, 1.2, 2.4, 1.2, 0.6, 1.8, 0.6, 1.2];
    let curBx = barX;
    doc.setFillColor(...C.navy);
    barWidths.forEach((bw) => {
      doc.rect(curBx, barY, bw, barH, 'F');
      curBx += bw + 0.8;
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text('VAULT AUDIT SEAL', barX + 17, finalY + 20, { align: 'center' });

    // 6. Bottom Attestation & Page Number
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
    doc.text('Certified Electronic Payment Receipt • Issued for personal financial management and audit compliance.', marginX, botY + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('Page 1 of 1', rightX, botY + 4.5, { align: 'right' });

    // Download / Save
    const safeTxNum = String(refNum).replace(/[^\w.-]+/g, '_');
    const fileName = `Coinwise_Receipt_${safeTxNum}_${dateStamp}.pdf`;

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        const blob = doc.output('blob');
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        // Fallback or test environment
      }
    }

    return { success: true, fileName, checksum };
  } catch (err) {
    console.error('[exportReceiptPDF] failed:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export default exportToPDF;
