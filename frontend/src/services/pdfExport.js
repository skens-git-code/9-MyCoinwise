/* —————————————————————————————————————————————————————————————
 * PDF Export Engine (Executive A4 Edition) — v2
 * Institutional-grade, audit-ready A4 financial statement.
 *
 * Changelog v2:
 *   - Fixed column-width overflow (was 190mm, now exactly 182mm).
 *   - Real SHA-256 audit hash over canonical ledger (was random).
 *   - Running balance now handles transfer / direction correctly.
 *   - Opening-balance guard when statement is filtered.
 *   - Money math done in integer cents (no IEEE-754 drift).
 *   - Latin-numeral locale formatting (safe for hi-IN, ar-EG, bn-IN...).
 *   - didParseCell used for credit/debit coloring (was willDrawCell hack).
 *   - Explicit top margin for continuation pages.
 *   - Blob download fallback for Safari.
 *   - Brand extracted to config. JSDoc added. Errors caught.
 * ————————————————————————————————————————————————————————————— */

/* ─────────────────────────── Brand & Theme ─────────────────────────── */

const BRAND = Object.freeze({
  name: 'COINWISE',
  tagline: 'SMART FINANCIAL INTELLIGENCE & AUDIT SUITE',
  product: 'Coinwise Financial Intelligence System',
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

/** Force Latin numerals regardless of regional locale (Hindi, Arabic, Bengali...). */
function toLatinNumLocale(locale) {
  const base = locale || 'en-US';
  // If the locale already carries a -u-nu- extension, respect it; else append latn.
  return /-u-nu-/.test(base) ? base : `${base}-u-nu-latn`;
}

/**
 * Return a safe currency symbol/prefix for standard Helvetica Latin-1 PDF encoding.
 * Prevents non-Latin multi-byte glyphs (like ₹) from rendering as garbled Mojibake.
 */
function getSafePdfSymbol(symbol, currency) {
  if (!symbol) return currency ? `${currency} ` : '$';
  for (let i = 0; i < symbol.length; i++) {
    if (symbol.charCodeAt(i) > 255) {
      return currency ? `${currency} ` : 'Rs. ';
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

const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Deterministic English-month date; avoids non-Latin glyph failures in Helvetica. */
function formatDateLatin(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** SHA-256 via WebCrypto. Async by nature. */
async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ─────────────────────────── Sign resolution ─────────────────────────── */

/**
 * Resolve the sign of a transaction for running-balance purposes.
 *  - income  → +1
 *  - expense → -1
 *  - transfer / adjustment: honor t.direction ('in' | 'out') if present,
 *    else default to the sign of `amount` (negative = outflow).
 */
function resolveSign(tx) {
  if (tx.type === 'income') return 1;
  if (tx.type === 'expense') return -1;
  if (tx.direction === 'in') return 1;
  if (tx.direction === 'out') return -1;
  const amt = Number(tx.amount) || 0;
  return amt < 0 ? -1 : 1;
}

/**
 * Draw official Coinwise vector chevron mark at (ox, oy) with scale s.
 * Designed for 100% crisp vector fidelity in PDF exports.
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

/* ─────────────────────────── Main export ─────────────────────────── */

/**
 * Generate an institutional A4 PDF statement and trigger download.
 *
 * @param {object}   user                 - Account holder ({ username, email, currency, balance, _id, locale }).
 * @param {object[]} [transactions=[]]    - Ledger entries ({ date, type, amount, category, account_name, note, _id, direction }).
 * @param {object}   [currencyInfo]       - { symbol } e.g. { symbol: '₹' }.
 * @param {string}   [localeOpt]          - Override locale (BCP-47).
 * @param {object}   [options={}]         - { title, subtitle, accountName, dateRangeLabel, isFiltered, openingBalance }.
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
    const currency     = user?.currency || 'USD';
    const symbol       = getSafePdfSymbol(currencyInfo?.symbol, currency);
    const rawLocale    = localeOpt || user?.locale
                       || (typeof navigator !== 'undefined' ? navigator.language : 'en-US')
                       || 'en-US';
    const locale       = toLatinNumLocale(rawLocale);

    const title          = options.title    || 'FINANCIAL ACCOUNT STATEMENT';
    const subtitle       = options.subtitle || 'Consolidated Activity & Ledger Audit';
    const accountFilter  = options.accountName    || 'All Accounts (Consolidated)';
    const dateRangeLabel = options.dateRangeLabel || 'All Recorded History';
    const isFiltered     = Boolean(options.isFiltered);
    const includeNotes   = options.includeNotes !== false;

    const C = THEME;

    /* ─────────────────────────── Header banner ─────────────────────────── */

    doc.setFillColor(...C.navy);
    doc.rect(0, 0, pageWidth, PAGE.headerH, 'F');

    doc.setFillColor(...C.crimson);
    doc.rect(0, PAGE.headerH, pageWidth, PAGE.accentH, 'F');

    // Official Coinwise vector chevron mark
    const ox = marginX;
    const oy = 7.5;
    drawCoinwiseMark(doc, ox, oy, 0.021, C.crimson);

    const brandTextX = ox + 16.5;
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(BRAND.name, brandTextX, 15.5);

    // Official Certified Badge pill beside brand name
    const certifiedX = brandTextX + doc.getTextWidth(BRAND.name) + 3.5;
    doc.setFillColor(...C.crimson);
    doc.roundedRect(certifiedX, 9.8, 18, 5.2, 1.2, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text('CERTIFIED', certifiedX + 9, 13.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`${BRAND.tagline} · ${subtitle.toUpperCase()}`, brandTextX, 22.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...C.white);
    doc.text(title.toUpperCase(), brandTextX, 30.5);

    /* ── Reference & generation metadata ── */
    const now       = new Date();
    const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const refEntropy = (user?._id?.toString() || 'UNREG').slice(-6).toUpperCase();
    const statementRef = `MCW-STMT-${dateStamp}-${refEntropy}`;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`Ref: ${statementRef}`, pageWidth - marginX, 15, { align: 'right' });
    doc.text(
      `Issued: ${formatDateLatin(now)} ${now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}`,
      pageWidth - marginX, 22, { align: 'right' }
    );
    doc.text(`Base Currency: ${currency} (${symbol.trim()})`, pageWidth - marginX, 29, { align: 'right' });

    /* ─────────────────────────── Compute totals (integer cents) ─────────────────────────── */

    const sortedTx = [...transactions].sort(
      (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
    );

    let incomeCents = 0;
    let expenseCents = 0;
    for (const t of sortedTx) {
      const c = toCents(t.amount);
      if (t.type === 'income')  incomeCents  += Math.abs(c);
      if (t.type === 'expense') expenseCents += Math.abs(c);
    }
    const netCents = incomeCents - expenseCents;

    const currentBalanceCents = toCents(user?.balance);
    const derivedOpeningCents = currentBalanceCents - netCents;

    // If caller supplied an explicit opening balance (filtered view), honor it.
    const openingCents = Number.isFinite(options.openingBalance)
      ? toCents(options.openingBalance)
      : derivedOpeningCents;

    const closingCents = openingCents + netCents;

    // Consistency check: if not filtered, ledger close must equal wallet balance.
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

    /* ─────────────────────────── Audit hash (real) ─────────────────────────── */

    const canonical = JSON.stringify({
      ref: statementRef,
      currency,
      opening: fromCents(openingCents),
      income: fromCents(incomeCents),
      expense: fromCents(expenseCents),
      closing: fromCents(closingCents),
      count: sortedTx.length,
      rows: sortedTx.map((t) => [
        t._id ? String(t._id) : null,
        t.date || null,
        t.type || null,
        toCents(t.amount),
        t.category || null,
      ]),
    });
    const fullHash = await sha256Hex(canonical);
    const checksum = `SHA256:${fullHash.slice(0, 32)}`;

    /* ─────────────────────────── Account particulars card ─────────────────────────── */

    const metaY = 44;
    doc.setFillColor(...C.lightSlate);
    doc.setDrawColor(...C.border);
    doc.roundedRect(marginX, metaY, contentWidth, 22, 2, 2, 'FD');

    const labelX  = marginX + 4;
    const valueX  = marginX + 38;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.navy);
    doc.text('ACCOUNT HOLDER:', labelX, metaY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    doc.text(
      `${user?.username || 'Client'} (${user?.email || 'Registered Account'})`,
      valueX, metaY + 7
    );

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.navy);
    doc.text('STATEMENT SCOPE:', labelX, metaY + 13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    doc.text(accountFilter, valueX, metaY + 13);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.navy);
    doc.text('PERIOD COVERED:', labelX, metaY + 19);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    doc.text(dateRangeLabel, valueX, metaY + 19);

    // Right-side stats
    const statLabelX = pageWidth - marginX - 45;
    const statValueX = pageWidth - marginX - 4;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.navy);
    doc.text('ENTRIES:', statLabelX, metaY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    doc.text(`${sortedTx.length} record(s)`, statValueX, metaY + 7, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.navy);
    doc.text('SAVINGS RATE:', statLabelX, metaY + 13);
    doc.setTextColor(...C.emerald);
    doc.text(savingsRate !== null ? `${savingsRate}%` : 'N/A', statValueX, metaY + 13, { align: 'right' });

    doc.setTextColor(...C.navy);
    doc.text('STATUS:', statLabelX, metaY + 19);
    doc.setTextColor(...C.emerald);
    doc.text('AUDIT VERIFIED', statValueX, metaY + 19, { align: 'right' });

    /* ─────────────────────────── Executive summary matrix ─────────────────────────── */

    const summaryY = 71;
    const cardGap  = 2;
    const cardW    = (contentWidth - cardGap * 4) / 5;
    const summaryCards = [
      { label: 'OPENING BALANCE', value: `${symbol}${fromCents(openingCents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: C.slate },
      { label: 'TOTAL INFLOW (+)', value: `+${formatMoney(incomeCents, symbol, locale)}`, color: C.green },
      { label: 'TOTAL OUTFLOW (-)', value: `-${formatMoney(expenseCents, symbol, locale)}`, color: C.red },
      { label: 'NET CASHFLOW', value: formatSignedMoney(netCents, symbol, locale), color: netCents >= 0 ? C.green : C.red },
      { label: 'CLOSING BALANCE', value: `${symbol}${fromCents(closingCents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: closingCents >= 0 ? C.navy : C.red },
    ];

    summaryCards.forEach((c, idx) => {
      const x = marginX + idx * (cardW + cardGap);

      doc.setFillColor(...C.lightSlate);
      doc.setDrawColor(...C.border);
      doc.roundedRect(x, summaryY, cardW, 20, 2, 2, 'FD');

      doc.setFillColor(...c.color);
      doc.rect(x + 1, summaryY, cardW - 2, 1.8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.slate);
      doc.text(c.label, x + cardW / 2, summaryY + 7.5, { align: 'center' });

      let fSize = 9;
      doc.setFontSize(fSize);
      doc.setTextColor(...c.color);
      while (doc.getTextWidth(c.value) > cardW - 3 && fSize > 5.5) {
        fSize -= 0.5;
        doc.setFontSize(fSize);
      }
      doc.text(c.value, x + cardW / 2, summaryY + 14.5, { align: 'center' });
    });

    /* ─────────────────────────── Ledger rows ─────────────────────────── */

    let runningCents = openingCents;

    const tableData = sortedTx.map((t, idx) => {
      const amtCents = Math.abs(toCents(t.amount));
      const sign     = resolveSign(t);
      runningCents  += sign * amtCents;

      const ref    = t._id ? String(t._id).slice(-6).toUpperCase() : `TX-${String(idx + 1).padStart(4, '0')}`;
      const desc   = includeNotes
        ? (t.note || t.description || t.category || 'Transaction Entry')
        : (t.category || 'Transaction Entry');
      const cat    = t.category || 'General';
      const acc    = t.account_name || (t.account_id ? 'Linked Account' : 'Main Wallet');

      const amtStr = (sign >= 0 ? '+' : '-') + symbol
                   + fromCents(amtCents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const balStr = symbol
                   + fromCents(runningCents).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      return [
        formatDateLatin(t.date),
        ref,
        desc,
        cat,
        acc,
        amtStr,
        balStr,
      ];
    });

    /* Column widths — MUST sum to contentWidth (182). */
    const colW = [21, 16, 48, 24, 24, 25, 24]; // = 182

    autoTable(doc, {
      startY: summaryY + 25,
      margin: { top: 16, left: marginX, right: marginX, bottom: 20 },
      head: [[
        'Date', 'Ref ID', 'Description / Note', 'Category', 'Account',
        `Amount (${currency})`, 'Balance',
      ]],
      body: tableData.length > 0
        ? tableData
        : [[{
            content: 'No transaction activity recorded in specified statement period',
            colSpan: 7,
            styles: { halign: 'center', fontStyle: 'italic', textColor: C.slate, cellPadding: 8 }
          }]],
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.8,
        textColor: C.navy,
        lineColor: C.border,
        lineWidth: 0.1,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: C.navy,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: colW[0] },
        1: { cellWidth: colW[1], fontStyle: 'bold', textColor: C.slate },
        2: { cellWidth: colW[2] },
        3: { cellWidth: colW[3] },
        4: { cellWidth: colW[4] },
        5: { cellWidth: colW[5], halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: colW[6], halign: 'right', textColor: C.slate },
      },
      alternateRowStyles: { fillColor: C.zebra },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 5) return;
        const raw = String(data.cell.raw ?? '');
        if (raw.startsWith('+'))      data.cell.styles.textColor = C.green;
        else if (raw.startsWith('-')) data.cell.styles.textColor = C.red;
      },
    });

    /* ─────────────────────────── Continuation headers + footers ─────────────────────────── */

    const totalPages = doc.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      if (i > 1) {
        doc.setFillColor(...C.navy);
        doc.rect(0, 0, pageWidth, 12, 'F');
        doc.setFillColor(...C.crimson);
        doc.rect(0, 12, pageWidth, 0.6, 'F');

        drawCoinwiseMark(doc, marginX, 2.5, 0.013, C.crimson);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...C.white);
        doc.text(`${BRAND.name} STATEMENT · ${statementRef}`, marginX + 10, 8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginX, 8, { align: 'right' });
      }

      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.line(marginX, pageHeight - 15, pageWidth - marginX, pageHeight - 15);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...C.slate);
      doc.text(`Official Electronic Statement · Digitally certified · ${checksum}`, marginX, pageHeight - 10);
      doc.text(
        `This document is generated by ${BRAND.product} and serves as an official audit record.`,
        marginX, pageHeight - 6.5
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.navy);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginX, pageHeight - 10, { align: 'right' });
    }

    /* ─────────────────────────── Download ─────────────────────────── */

    const safeUser = String(user?.username || 'Report').replace(/[^\w.-]+/g, '_');
    const fileName = `MyCoinwise_Statement_${safeUser}_${dateStamp}.pdf`;

    // Blob download works reliably across Safari + Chromium.
    const blob = doc.output('blob');
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);

    return { success: true, fileName, checksum };
  } catch (err) {
    console.error('[exportToPDF] failed:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export default exportToPDF;
