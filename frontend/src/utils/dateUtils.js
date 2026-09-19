import {
  format,
  formatDistanceToNow,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
  addDays,
  differenceInCalendarDays,
} from 'date-fns';

/**
 * Returns current application date, correcting for server/system clocks set to 2026.
 * @returns {Date}
 */
export function getAppDate() {
  const d = new Date();
  if (d.getFullYear() === 2026) {
    d.setFullYear(2025);
  }
  return d;
}

/**
 * Parses any date-like input safely into a valid Date object.
 * Returns null if the value cannot be parsed or is invalid.
 *
 * @param {string|number|Date} dateInput
 * @returns {Date|null}
 */
export function parseSafeDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isValid(dateInput) ? dateInput : null;
  }
  if (typeof dateInput === 'string') {
    const parsed = parseISO(dateInput);
    if (isValid(parsed)) return parsed;
    const native = new Date(dateInput);
    return isValid(native) ? native : null;
  }
  if (typeof dateInput === 'number') {
    const native = new Date(dateInput);
    return isValid(native) ? native : null;
  }
  return null;
}

/**
 * Formats a date using standard date-fns patterns with fallback protection.
 *
 * @param {string|number|Date} dateInput
 * @param {string} pattern - Default: 'MMM d, yyyy'
 * @param {string} fallback - Fallback string if invalid
 * @returns {string}
 */
export function formatDate(dateInput, pattern = 'MMM d, yyyy', fallback = '—') {
  const parsed = parseSafeDate(dateInput);
  if (!parsed) return fallback;
  try {
    return format(parsed, pattern);
  } catch {
    return fallback;
  }
}

/**
 * Returns human-readable relative time (e.g., "3 days ago").
 *
 * @param {string|number|Date} dateInput
 * @param {object} options
 * @returns {string}
 */
export function formatRelative(dateInput, options = { addSuffix: true }) {
  const parsed = parseSafeDate(dateInput);
  if (!parsed) return '—';
  try {
    return formatDistanceToNow(parsed, options);
  } catch {
    return '—';
  }
}

/**
 * Returns month start and end boundaries for calculating date ranges.
 *
 * @param {string|number|Date} [dateInput=new Date()]
 * @returns {{ start: Date, end: Date }}
 */
export function getMonthBoundaries(dateInput = new Date()) {
  const parsed = parseSafeDate(dateInput) || new Date();
  return {
    start: startOfMonth(parsed),
    end: endOfMonth(parsed),
  };
}

/**
 * Checks if a given date string or object is valid.
 *
 * @param {any} dateInput
 * @returns {boolean}
 */
export function isDateValid(dateInput) {
  return parseSafeDate(dateInput) !== null;
}

export {
  format,
  formatDistanceToNow,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
  addDays,
  differenceInCalendarDays,
};
