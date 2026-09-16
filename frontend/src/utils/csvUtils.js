/**
 * Escapes a single cell value for RFC 4180 CSV compliance and CSV formula injection prevention.
 *
 * @param {any} value
 * @returns {string}
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Prevent CSV Injection / Formula Execution in Excel & Calc
  // Cells starting with =, +, -, @, \t, or \r can execute commands
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If contains commas, double quotes, or newlines, wrap in quotes and escape internal quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Builds a valid RFC 4180 CSV string from headers and 2D row array or array of objects.
 *
 * @param {Array<{ key: string, label: string } | string>} headers
 * @param {Array<object | Array<any>>} rows
 * @returns {string}
 */
export function buildCsv(headers, rows) {
  const headerLabels = headers.map((h) => (typeof h === 'object' && h.label ? h.label : String(h)));
  const headerKeys = headers.map((h) => (typeof h === 'object' && h.key ? h.key : null));

  const csvRows = [];

  // Header row
  csvRows.push(headerLabels.map(escapeCsvCell).join(','));

  // Data rows
  for (const row of rows) {
    if (Array.isArray(row)) {
      csvRows.push(row.map(escapeCsvCell).join(','));
    } else if (typeof row === 'object' && row !== null) {
      const cells = headerKeys.map((key) => {
        if (key && key in row) {
          return escapeCsvCell(row[key]);
        }
        return '';
      });
      csvRows.push(cells.join(','));
    }
  }

  return csvRows.join('\r\n');
}

/**
 * Triggers a client-side download for a given CSV string.
 *
 * @param {string} filename - e.g. 'transactions-report.csv'
 * @param {string} csvContent - The raw CSV string content
 */
export function downloadCsv(filename, csvContent) {
  if (typeof window === 'undefined') return;

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
