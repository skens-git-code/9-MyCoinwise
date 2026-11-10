/* —————————————————————————————————————
 * CSV Parsing Engine (fast-csv + Quote-Aware Delimiter Detection)
 * Supports comma, semicolon, tab, and pipe delimiters, quoted fields,
 * escaped quotes, UTF-8/UTF-16 BOMs, and streaming large-file ingestion.
 * ————————————————————————————————————— */

const { parseString: fastCsvParseString } = require('fast-csv');
const { decodeBufferToText } = require('./helpers');

const SUPPORTED_DELIMITERS = [',', ';', '\t', '|'];

/**
 * Counts delimiter occurrences across sample lines while ignoring delimiters
 * inside double-quoted fields so strings like "Coffee, Tea" don't skew detection.
 *
 * @param {string} text
 * @returns {string}
 */
const detectCsvDelimiter = (text) => {
  const sample = String(text || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 15)
    .join('\n');

  if (!sample) return ',';

  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let quoted = false;

  for (let i = 0; i < sample.length; i += 1) {
    const ch = sample[i];
    if (ch === '"') {
      if (quoted && sample[i + 1] === '"') {
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && Object.prototype.hasOwnProperty.call(counts, ch)) {
      counts[ch] += 1;
    }
  }

  let best = ',';
  let bestCount = -1;
  for (const d of SUPPORTED_DELIMITERS) {
    if (counts[d] > bestCount) {
      bestCount = counts[d];
      best = d;
    }
  }

  return bestCount > 0 ? best : ',';
};

/**
 * Synchronous RFC-4180 tolerant CSV parser.
 * Preserved for synchronous callers and used as a resilient fallback
 * if strict streaming encounters malformed unclosed quotes in bank exports.
 *
 * @param {string|Buffer} content
 * @returns {string[][]}
 */
const parseCsvString = (content) => {
  const text = Buffer.isBuffer(content)
    ? decodeBufferToText(content)
    : String(content || '').replace(/^\uFEFF/, '');

  if (!text.trim()) return [];

  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (quoted && nextChar === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      row.push(field.trim());
      field = '';
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some(Boolean)) {
      rows.push(row);
    }
  }

  return rows;
};

/**
 * Async streaming CSV parser backed by `fast-csv`.
 * Falls back gracefully to the tolerant RFC-4180 parser if a malformed quote
 * triggers a stream parse error, recording a warning for diagnostics.
 *
 * @param {Buffer|string} input
 * @returns {Promise<{ rows: string[][], delimiter: string, engine: string, warnings: string[] }>}
 */
const parseCsvAsync = (input) => {
  const text = Buffer.isBuffer(input)
    ? decodeBufferToText(input)
    : String(input || '').replace(/^\uFEFF/, '');

  if (!text.trim()) {
    return Promise.resolve({
      rows: [],
      delimiter: ',',
      engine: 'fast-csv',
      warnings: [],
    });
  }

  const delimiter = detectCsvDelimiter(text);

  return new Promise((resolve) => {
    const rows = [];
    let settled = false;

    const stream = fastCsvParseString(text, {
      delimiter,
      headers: false,
      trim: true,
      ignoreEmpty: true,
      strictColumnHandling: false,
    });

    stream.on('data', (row) => {
      if (Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')) {
        rows.push(row.map((cell) => String(cell ?? '').trim()));
      }
    });

    stream.on('error', (err) => {
      if (settled) return;
      settled = true;
      stream.destroy();
      const fallbackRows = parseCsvString(text);
      resolve({
        rows: fallbackRows,
        delimiter,
        engine: 'rfc4180-fallback',
        warnings: [`CSV contained irregular quoting (${err.message}); parsed using tolerant recovery mode.`],
      });
    });

    stream.on('end', () => {
      if (settled) return;
      settled = true;
      resolve({
        rows,
        delimiter,
        engine: 'fast-csv',
        warnings: [],
      });
    });
  });
};

module.exports = {
  detectCsvDelimiter,
  parseCsvString,
  parseCsvAsync,
};

