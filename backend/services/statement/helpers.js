/* —————————————————————————————————————
 * Statement Parsing Helpers
 * Shared text, buffer encoding, date, amount, and summary-line utilities.
 * ————————————————————————————————————— */

const IMPORT_LIMIT = 1000;
const MAX_AMOUNT = 999_999_999.99;

const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const normalizeForMatch = (value) =>
  cleanText(value).toLowerCase().replace(/[^a-z0-9@]/g, '');

const MONTHS = Object.freeze({
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
});

/**
 * Decodes a raw Buffer to UTF-8 text while handling UTF-8, UTF-16 LE, and UTF-16 BE BOMs.
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
const decodeBufferToText = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return '';

  // UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  // UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le').replace(/\u0000/g, '');
  }
  // UTF-16 BE BOM (swap byte pairs and decode as utf16le)
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2);
    const swapped = Buffer.allocUnsafe(body.length - (body.length % 2));
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1];
      swapped[i + 1] = body[i];
    }
    return swapped.toString('utf16le').replace(/\u0000/g, '');
  }

  return buffer.toString('utf8').replace(/^\uFEFF/, '');
};

/**
 * Standardizes dates to YYYY-MM-DD.
 * Defaults ambiguous dates (e.g. 05/06/2024) to DD/MM/YYYY for Indian statements,
 * or MM/DD/YYYY when preferredFormat is 'MDY'.
 * Validates actual calendar days without rollover.
 *
 * @param {string|Date|null|undefined} value
 * @param {'DMY'|'MDY'} [preferredFormat='DMY']
 * @returns {string|null}
 */
const toIsoDay = (value, preferredFormat = 'DMY') => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  const s = cleanText(value).replace(/^date:?\s*/i, '');
  if (!s) return null;

  const ok = (y, m, d) => {
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (year < 1970 || year > 2100) return null;
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  };

  // 1. YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (m) return ok(m[1], m[2], m[3]);

  // 2. DD-MM-YYYY or MM-DD-YYYY
  m = s.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/);
  if (m) {
    const [, a, b, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    let day;
    let month;
    if (Number(a) > 12) {
      day = a;
      month = b;
    } else if (Number(b) > 12) {
      day = b;
      month = a;
    } else if (String(preferredFormat).toUpperCase() === 'MDY') {
      day = b;
      month = a;
    } else {
      day = a;
      month = b;
    }
    return ok(year, month, day);
  }

  // 3. Textual month dates: "01-Apr-2024", "01 Apr 2024", "01Apr2024", "1-Apr-24"
  m = s.match(/\b(\d{1,2})[-\s.]?([A-Za-z]{3,9})[-\s.,]*(\d{2,4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return ok(y, MONTHS[m[2].toLowerCase()], m[1]);
  }

  // 4. "Oct 24, 2024", "October 24 2024", "Oct 24 24"
  m = s.match(/\b([A-Za-z]{3,9})[-\s.]?(\d{1,2})[-\s.,]*(\d{2,4})\b/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return ok(y, MONTHS[m[1].toLowerCase()], m[2]);
  }

  return null;
};

/**
 * Strips currency markers, handles Rs/- and European comma-decimals,
 * and returns a positive finite number (or null).
 *
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
const parseStatementAmount = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0 ? Math.abs(value) : null;
  }

  let s = cleanText(value).replace(/^\((.*)\)$/, '-$1');
  s = s.replace(/\/-(?=\s|$|\b)/g, '');
  s = s
    .replace(/\b(inr|usd|eur|gbp|aed|sgd|cad|aud|rupees?)\b/gi, ' ')
    .replace(/\brs\.?(?:\s*\/?-?)?/gi, ' ')
    .replace(/\((?:debit|dr|credit|cr)\)/gi, ' ')
    .replace(/\b(dr|cr|debit|credit)\b\.?/gi, ' ')
    .replace(/(?:dr|cr)$/i, '');

  const europeanCandidate = s.replace(/[^\d.,-]/g, '');
  if (/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(europeanCandidate)) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }

  s = s.replace(/[₹$€£,\s\/]/g, '');
  if (!s || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'na') return null;
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
};

/**
 * Extracts signed numeric amount when sign or Dr/Cr marker indicates direction.
 *
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
const parseSignedAmount = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  let s = cleanText(value).replace(/^\((.*)\)$/, '-$1');
  s = s.replace(/\/-(?=\s|$|\b)/g, '');
  s = s
    .replace(/\b(inr|usd|eur|gbp|aed|sgd|cad|aud|rupees?)\b/gi, ' ')
    .replace(/\brs\.?(?:\s*\/?-?)?/gi, ' ')
    .replace(/\((?:debit|dr)\)/gi, '-')
    .replace(/\((?:credit|cr)\)/gi, '+')
    .replace(/\b(debit|dr)\b\.?/gi, '-')
    .replace(/\b(credit|cr)\b\.?/gi, '+')
    .replace(/(?:dr)$/i, '-')
    .replace(/(?:cr)$/i, '+');

  if (s.endsWith('-')) s = `-${s.slice(0, -1)}`;
  if (s.endsWith('+')) s = s.slice(0, -1);

  const europeanCandidate = s.replace(/[^\d.,-]/g, '');
  if (/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(europeanCandidate)) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }

  s = s.replace(/[₹$€£,\s\/]/g, '');
  if (!s || s === '-' || s === '+' || s.toLowerCase() === 'null') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Guard to identify non-transaction statement balance / total / footer lines.
 *
 * @param {string} line
 * @returns {boolean}
 */
const isBalanceOrSummary = (line) =>
  /\b(opening balance|closing balance|available balance|ledger balance|current balance|running balance|previous balance|total balance|net balance|balance b\/?f|balance c\/?f|\bb\/f\b|\bc\/f\b|total (debit|credit|amount|withdrawal|deposit|balance)|(debit|credit|amount|withdrawal|deposit) total|grand total|sub[- ]?total|net (total|amount)|statement summary|account summary|page \d+(?: of \d+)?)\b/i.test(
    String(line || '')
  );

module.exports = {
  IMPORT_LIMIT,
  MAX_AMOUNT,
  cleanText,
  normalizeForMatch,
  MONTHS,
  decodeBufferToText,
  toIsoDay,
  parseStatementAmount,
  parseSignedAmount,
  isBalanceOrSummary,
};

