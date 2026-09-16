import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { formatDate, parseSafeDate, isDateValid } from '../utils/dateUtils';
import { escapeCsvCell, buildCsv } from '../utils/csvUtils';
import { formatCurrency, getCurrencySymbol } from '../utils/currencyUtils';
import { useMediaQuery } from '../hooks/useMediaQuery';

describe('dateUtils', () => {
  it('parses valid ISO dates safely', () => {
    const d = parseSafeDate('2026-09-16T12:00:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(isDateValid('2026-09-16')).toBe(true);
  });

  it('handles invalid dates gracefully with fallback', () => {
    expect(formatDate('invalid-date', 'yyyy-MM-dd', 'N/A')).toBe('N/A');
    expect(isDateValid('not-a-date')).toBe(false);
  });

  it('formats dates accurately with pattern', () => {
    const formatted = formatDate(new Date(2026, 0, 15), 'yyyy-MM-dd');
    expect(formatted).toBe('2026-01-15');
  });
});

describe('csvUtils', () => {
  it('escapes commas and quotes properly', () => {
    expect(escapeCsvCell('Hello, World')).toBe('"Hello, World"');
    expect(escapeCsvCell('Hello "World"')).toBe('"Hello ""World"""');
  });

  it('sanitizes formula injection prefixes', () => {
    expect(escapeCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(escapeCsvCell('+cmd|')).toBe("'+cmd|");
    expect(escapeCsvCell('-cmd|')).toBe("'-cmd|");
    expect(escapeCsvCell('@cmd|')).toBe("'@cmd|");
  });

  it('builds CSV string from headers and records', () => {
    const headers = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
    ];
    const rows = [{ id: 1, name: 'Alice, Smith' }];
    const csv = buildCsv(headers, rows);
    expect(csv).toContain('ID,Name');
    expect(csv).toContain('1,"Alice, Smith"');
  });
});

describe('currencyUtils', () => {
  it('resolves correct currency symbols', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('INR')).toBe('₹');
    expect(getCurrencySymbol('EUR')).toBe('€');
  });

  it('formats currencies with decimals', () => {
    const formatted = formatCurrency(1250.5, 'USD', 'en-US');
    expect(formatted).toBe('$1,250.50');
  });
});

describe('useMediaQuery hook', () => {
  it('renders without error in test environment', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(typeof result.current).toBe('boolean');
  });
});
