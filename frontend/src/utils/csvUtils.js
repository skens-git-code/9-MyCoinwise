/**
 * csv.js — RFC 4180 CSV serialisation with spreadsheet-injection hardening.
 *
 * Design goals
 *  • Zero dependencies, tree-shakeable, works in browser + Node.
 *  • Single fast path: cells that need no work are returned untouched.
 *  • Correct first, then fast: proper quoting, CRLF, BOM, formula guards.
 *  • Safe by default: no prototype-chain reads, no filename traversal.
 */

/* ────────────────────────────── primitives ─────────────────────────────── */

const QUOTE_CHAR = '"';
const QUOTE_ALL = /"/g;

/** Anything that forces RFC 4180 quoting (delimiter is checked separately). */
const MUST_QUOTE = /["\r\n]/;

/** Characters that make Excel / LibreOffice / Sheets treat a cell as a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** …but `-5`, `+3.2e-4` etc. are just numbers, not attacks. Don't mangle them. */
const NUMERIC_LIKE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** `Object.hasOwn` with a fallback for older runtimes. */
const hasOwn = Object.hasOwn ?? ((obj, key) => Object.prototype.hasOwnProperty.call(obj, key));

/* ─────────────────────────────── escaping ──────────────────────────────── */

/**
 * Builds a cell escaper bound to a specific delimiter.
 * Compiling once per export keeps the hot loop allocation-free.
 *
 * @param {string} delimiter
 * @returns {(value: unknown) => string}
 */
function createCellEscaper(delimiter) {
  return function escapeCell(value) {
    // 1. Nullish → empty cell.
    if (value === null || value === undefined) return '';

    // 2. Scalars that can never be dangerous or need quoting.
    const type = typeof value;
    if (type === 'number' || type === 'bigint' || type === 'boolean') return String(value);

    let str = type === 'string' ? value : String(value);
    if (str === '') return '';

    // 3. Neutralise formula injection without breaking real negative numbers.
    if (FORMULA_PREFIX.test(str) && !NUMERIC_LIKE.test(str)) {
      str = `'${str}`;
    }

    // 4. Quote only when we must — the common case stays untouched.
    return str.includes(delimiter) || MUST_QUOTE.test(str)
      ? QUOTE_CHAR + str.replace(QUOTE_ALL, '""') + QUOTE_CHAR
      : str;
  };
}

/**
 * Escapes a single value for RFC 4180 CSV, comma-delimited.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const escapeCsvCell = /*#__PURE__*/ createCellEscaper(',');

/* ─────────────────────────────── building ──────────────────────────────── */

/**
 * @typedef {object} CsvColumn
 * @property {string}  [key]    Property to read from object rows.
 * @property {string}  [label]  Header text. Defaults to `key`.
 * @property {(row: any) => unknown} [get] Custom accessor; wins over `key`.
 */

/**
 * @typedef {object} BuildCsvOptions
 * @property {string}  [delimiter=',']     Field separator.
 * @property {string}  [eol='\r\n']        Line terminator (RFC 4180 = CRLF).
 * @property {boolean} [includeHeader=true] Emit the header row.
 */

/** Normalises strings / partial objects into a uniform column descriptor. */
function normalizeColumns(headers) {
  return (headers ?? []).map((header) => {
    if (typeof header === 'string') {
      return { key: header, label: header, get: null };
    }
    if (header && typeof header === 'object') {
      const key = header.key ?? null;
      return {
        key,
        label: header.label ?? (key === null ? '' : String(key)),
        get: typeof header.get === 'function' ? header.get : null,
      };
    }
    return { key: null, label: String(header), get: null };
  });
}

/** Reads one cell from an object row without touching the prototype chain. */
function readCell(row, column) {
  if (column.get) return column.get(row);
  if (column.key === null) return '';
  return hasOwn(row, column.key) ? row[column.key] : '';
}

/**
 * Serialises headers + rows into an RFC 4180 CSV string.
 *
 * Rows may be arrays (positional) or objects (mapped through `headers`).
 *
 * @param {Array<string | CsvColumn>} headers
 * @param {Array<Record<string, unknown> | unknown[]>} [rows]
 * @param {BuildCsvOptions} [options]
 * @returns {string}
 */
export function buildCsv(headers, rows = [], options = {}) {
  const { delimiter = ',', eol = '\r\n', includeHeader = true } = options;

  const escapeCell = createCellEscaper(delimiter);
  const columns = normalizeColumns(headers);
  const lines = [];

  if (includeHeader) {
    lines.push(columns.map((column) => escapeCell(column.label)).join(delimiter));
  }

  for (const row of rows) {
    if (Array.isArray(row)) {
      // `map(escapeCell)` is safe: extra (index, array) args are ignored.
      lines.push(row.map(escapeCell).join(delimiter));
    } else if (row !== null && typeof row === 'object') {
      lines.push(columns.map((column) => escapeCell(readCell(row, column))).join(delimiter));
    }
    // Anything else (null, primitives) is skipped rather than corrupting output.
  }

  return lines.join(eol);
}

/* ────────────────────────────── downloading ────────────────────────────── */

/** Strips characters that are illegal in filenames on Windows/macOS/Linux. */
const sanitizeFilename = (name) => String(name)
  .replace(/[\\/:*?"<>|]/g, '_')
  .split('')
  .map((char) => char.charCodeAt(0) <= 0x1F ? '_' : char)
  .join('');

/**
 * @typedef {object} DownloadCsvOptions
 * @property {boolean} [bom=true]   Prefix UTF-8 BOM so Excel detects encoding.
 * @property {string}  [mimeType='text/csv;charset=utf-8;']
 */

/**
 * Triggers a client-side download of a CSV string.
 *
 * @param {string} filename
 * @param {string} csvContent
 * @param {DownloadCsvOptions} [options]
 * @returns {void}
 */
export function downloadCsv(filename, csvContent, options = {}) {
  const { bom = true, mimeType = 'text/csv;charset=utf-8;' } = options;

  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return;

  const safeName = sanitizeFilename(filename);
  const name = /\.csv$/i.test(safeName) ? safeName : `${safeName}.csv`;

  const blob = new Blob([bom ? '\uFEFF' + csvContent : csvContent], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Defer revocation: some browsers abort the download if the URL dies too early.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ────────────────────────────── convenience ────────────────────────────── */

/**
 * Build *and* download in one call — the 90 % use case.
 *
 * @param {string} filename
 * @param {Array<string | CsvColumn>} headers
 * @param {Array<Record<string, unknown> | unknown[]>} rows
 * @param {BuildCsvOptions & DownloadCsvOptions} [options]
 * @returns {string} The CSV that was generated (handy for tests / previews).
 */
export function exportCsv(filename, headers, rows, options = {}) {
  const csv = buildCsv(headers, rows, options);
  downloadCsv(filename, csv, options);
  return csv;
}

/* ──────────────────────────────── example ────────────────────────────────
 *
 * exportCsv('transactions', [
 *   { key: 'id',        label: 'ID' },
 *   { key: 'createdAt', label: 'Date', get: (r) => r.createdAt.toISOString() },
 *   { key: 'amount',    label: 'Amount' },
 * ], rows, { bom: true });
 *
 * ────────────────────────────────────────────────────────────────────────── */