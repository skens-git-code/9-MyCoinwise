/* —————————————————————————————————————
 * Date Utilities
 * Centralized date helpers built on date-fns with safe parsing and
 * fallback protection. Used across pages, charts, and forms.
 *
 * Exports:
 *   - getAppDate            : Current application date.
 *   - parseSafeDate         : Parse any date-like input → Date | null.
 *   - formatDate            : Format a date with a pattern + fallback.
 *   - formatRelative        : Human-friendly "3 days ago" style string.
 *   - getMonthBoundaries    : { start, end } of a month.
 *   - isDateValid           : Boolean validity check.
 *   - Plus a curated set of date-fns primitives re-exported for
 *     consumers that need them without adding date-fns as a direct
 *     dependency.
 * ————————————————————————————————————— */

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

/* —————————————————————————————————————
 * getAppDate
 * Returns the current application date.
 *
 * Centralized so a future change (e.g. fixed-clock for testing) can
 * be made in one place.
 * ————————————————————————————————————— */
export function getAppDate() {
  return new Date();
}

/* —————————————————————————————————————
 * parseSafeDate
 * Parses any date-like input safely into a valid Date object.
 * Returns null if the value cannot be parsed or is invalid.
 *
 * Accepts:
 *   - Date instances
 *   - ISO strings (fast path via parseISO)
 *   - Any other string the native Date constructor understands
 *   - Unix timestamps
 * ————————————————————————————————————— */
export function parseSafeDate(dateInput) {
  // ── Reject empty / falsy inputs ──
  if (!dateInput) return null;

  // ── Fast path for Date instances ──
  if (dateInput instanceof Date) {
    return isValid(dateInput) ? dateInput : null;
  }

  // ── String inputs: try ISO first, then native Date ──
  if (typeof dateInput === 'string') {
    const parsed = parseISO(dateInput);
    if (isValid(parsed)) return parsed;
    const native = new Date(dateInput);
    return isValid(native) ? native : null;
  }

  // ── Numeric timestamps ──
  if (typeof dateInput === 'number') {
    const native = new Date(dateInput);
    return isValid(native) ? native : null;
  }

  // ── Unsupported types ──
  return null;
}

/* —————————————————————————————————————
 * formatDate
 * Formats a date using a date-fns pattern, with a safe fallback.
 *
 * Pattern defaults to `'MMM d, yyyy'` (e.g. "Jan 5, 2026").
 * Returns the fallback (default `'—'`) on parse or format failure.
 * ————————————————————————————————————— */
export function formatDate(dateInput, pattern = 'MMM d, yyyy', fallback = '—') {
  const parsed = parseSafeDate(dateInput);
  if (!parsed) return fallback;
  try {
    return format(parsed, pattern);
  } catch {
    return fallback;
  }
}

/* —————————————————————————————————————
 * formatRelative
 * Returns human-readable relative time (e.g., "3 days ago").
 *
 * Options are forwarded to `formatDistanceToNow`; the default adds
 * the "ago" suffix.
 * ————————————————————————————————————— */
export function formatRelative(dateInput, options = { addSuffix: true }) {
  const parsed = parseSafeDate(dateInput);
  if (!parsed) return '—';
  try {
    return formatDistanceToNow(parsed, options);
  } catch {
    return '—';
  }
}

/* —————————————————————————————————————
 * getMonthBoundaries
 * Returns the start and end boundaries for the month containing
 * `dateInput`. Falls back to "now" when the input cannot be parsed.
 * ————————————————————————————————————— */
export function getMonthBoundaries(dateInput = new Date()) {
  const parsed = parseSafeDate(dateInput) || new Date();
  return {
    start: startOfMonth(parsed),
    end: endOfMonth(parsed),
  };
}

/* —————————————————————————————————————
 * isDateValid
 * True when `dateInput` can be parsed into a valid Date.
 * ————————————————————————————————————— */
export function isDateValid(dateInput) {
  return parseSafeDate(dateInput) !== null;
}

/* —————————————————————————————————————
 * Re-exports
 * Curated set of date-fns primitives re-exported so consumers can
 * work with dates without adding date-fns as a direct dependency.
 * ————————————————————————————————————— */
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