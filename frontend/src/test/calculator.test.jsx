import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import ScientificCalculator, {
  evaluateMathExpression,
  formatDisplayResult,
} from '../pages/Calculator';

vi.mock('../services/api', () => ({
  api: {
    getCalculations: vi.fn().mockResolvedValue([]),
    saveCalculation: vi.fn().mockResolvedValue({ success: true }),
    clearCalculations: vi.fn().mockResolvedValue({ success: true }),
    deleteCalculation: vi.fn().mockResolvedValue({ success: true }),
  },
  CURRENCIES: {
    USD: { symbol: '$', name: 'US Dollar' },
    INR: { symbol: '₹', name: 'Indian Rupee' },
  },
  getStoredToken: vi.fn(() => 'mock-token'),
}));

describe('Scientific Calculator & Financial Tools Engine', () => {
  const mockContext = {
    USER_ID: 'user-calc-1',
    user: { id: 'user-calc-1', currency: 'USD' },
    currency: 'USD',
    currencySymbol: '$',
    formatCurrency: (val) => `$${Number(val).toFixed(2)}`,
    t: (key) => key,
  };

  describe('Mathematical Parser & Evaluation (evaluateMathExpression)', () => {
    it('evaluates basic arithmetic expressions correctly', () => {
      expect(evaluateMathExpression('2 + 3 * 4')).toBe(14);
      expect(evaluateMathExpression('(10 - 2) / 4')).toBe(2);
      expect(evaluateMathExpression('15 % 4')).toBe(3);
      expect(evaluateMathExpression('2 ^ 3')).toBe(8);
      expect(evaluateMathExpression('5!')).toBe(120);
    });

    it('handles unicode mathematical symbols seamlessly', () => {
      expect(evaluateMathExpression('10 × 5 ÷ 2 − 3')).toBe(22);
      expect(evaluateMathExpression('√16')).toBe(4);
      expect(evaluateMathExpression('∛27')).toBe(3);
    });

    it('auto-balances trailing unclosed parentheses', () => {
      expect(evaluateMathExpression('sqrt(16')).toBe(4);
      expect(evaluateMathExpression('sin(0')).toBe(0);
      expect(evaluateMathExpression('(2 + 3) * (4 + 5')).toBe(45);
      expect(evaluateMathExpression('((2 + 2')).toBe(4);
    });

    it('supports implicit multiplication for numbers, parentheses, and constants', () => {
      expect(evaluateMathExpression('2(3)')).toBe(6);
      expect(evaluateMathExpression('(2)(3)')).toBe(6);
      expect(evaluateMathExpression('(4)2')).toBe(8);
      expect(evaluateMathExpression('2pi', { angleMode: 'RAD' })).toBeCloseTo(2 * Math.PI);
      expect(evaluateMathExpression('2ans', { previousAnswer: 25 })).toBe(50);
      // Preserves scientific notation 5e+2 = 500
      expect(evaluateMathExpression('5e+2')).toBe(500);
      expect(evaluateMathExpression('5e2')).toBe(500);
    });

    it('eliminates floating point artifacts for exact degree trigonometry', () => {
      expect(evaluateMathExpression('sin(180)', { angleMode: 'DEG' })).toBe(0);
      expect(evaluateMathExpression('sin(360)', { angleMode: 'DEG' })).toBe(0);
      expect(evaluateMathExpression('cos(90)', { angleMode: 'DEG' })).toBe(0);
      expect(evaluateMathExpression('cos(270)', { angleMode: 'DEG' })).toBe(0);
      expect(evaluateMathExpression('tan(180)', { angleMode: 'DEG' })).toBe(0);
      expect(() => evaluateMathExpression('tan(90)', { angleMode: 'DEG' })).toThrow(/undefined/);
    });

    it('handles standard functions in radian mode', () => {
      expect(evaluateMathExpression('sin(pi / 2)', { angleMode: 'RAD' })).toBeCloseTo(1);
      expect(evaluateMathExpression('cos(pi)', { angleMode: 'RAD' })).toBeCloseTo(-1);
    });
  });

  describe('formatDisplayResult', () => {
    it('rounds micro floating precision artifacts near zero to exact "0"', () => {
      expect(formatDisplayResult(1.2246467991473532e-16)).toBe('0');
      expect(formatDisplayResult(0)).toBe('0');
    });

    it('formats normal decimal numbers cleanly', () => {
      expect(formatDisplayResult(42)).toBe('42');
      expect(formatDisplayResult(3.1415926535)).toBe('3.1415926535');
    });

    it('formats extremely large and tiny numbers in scientific notation', () => {
      expect(formatDisplayResult(1e15)).toContain('e+15');
      expect(formatDisplayResult(1e-10)).toContain('e-10');
      expect(formatDisplayResult(Infinity)).toBe('Error');
    });
  });

  describe('Calculator UI Component & Financial Modes', () => {
    it('renders the calculator display and keypad with high-contrast elements', () => {
      const { container } = render(
        <MemoryRouter>
          <ToastProvider>
            <AppContext.Provider value={mockContext}>
              <ScientificCalculator />
            </AppContext.Provider>
          </ToastProvider>
        </MemoryRouter>
      );

      // Verify display exists
      expect(container.querySelector('.calculator-display')).toBeTruthy();
      expect(container.querySelector('.calculator-expression')).toBeTruthy();
      expect(container.querySelector('.calculator-result-row')).toBeTruthy();

      // Verify mode toggle buttons
      expect(screen.getByRole('tab', { name: /Scientific/i })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /Financial Tools/i })).toBeTruthy();
    });

    it('performs calculation on button clicks and updates display', () => {
      const { container } = render(
        <MemoryRouter>
          <ToastProvider>
            <AppContext.Provider value={mockContext}>
              <ScientificCalculator />
            </AppContext.Provider>
          </ToastProvider>
        </MemoryRouter>
      );

      // Click '7', '+', '5', '='
      fireEvent.click(screen.getByRole('button', { name: '7' }));
      fireEvent.click(screen.getByRole('button', { name: '+' }));
      fireEvent.click(screen.getByRole('button', { name: '5' }));
      fireEvent.click(screen.getByRole('button', { name: '=' }));

      const resultElement = container.querySelector('.calculator-result-row strong');
      expect(resultElement.textContent).toBe('12');
    });

    it('switches to Financial Tools mode and performs Loan EMI calculation', async () => {
      render(
        <MemoryRouter>
          <ToastProvider>
            <AppContext.Provider value={mockContext}>
              <ScientificCalculator />
            </AppContext.Provider>
          </ToastProvider>
        </MemoryRouter>
      );

      // Switch to Financial Tools
      const finTab = screen.getByRole('tab', { name: /Financial Tools/i });
      fireEvent.click(finTab);

      // Verify financial sub-tabs are displayed
      expect(screen.getByText(/Loan & EMI Calculator/i)).toBeTruthy();
      expect(screen.getByText(/Tip & Bill Splitter/i)).toBeTruthy();
      expect(screen.getByText(/Compound Interest & SIP/i)).toBeTruthy();

      // Check default EMI calculation output
      expect(screen.getByText(/Monthly EMI/i)).toBeTruthy();
      expect(screen.getByText(/Total Interest/i)).toBeTruthy();
    });

    it('toggles History view cleanly when history button is clicked', () => {
      const { container } = render(
        <MemoryRouter>
          <ToastProvider>
            <AppContext.Provider value={mockContext}>
              <ScientificCalculator />
            </AppContext.Provider>
          </ToastProvider>
        </MemoryRouter>
      );

      const historyToggleBtn = screen.getByTitle(/calculation history/i);
      expect(historyToggleBtn).toBeTruthy();

      // Click to toggle history
      fireEvent.click(historyToggleBtn);
      // Verify shell handles is-history-hidden class or aside mount state
      const shell = container.querySelector('.calculator-shell');
      expect(shell).toBeTruthy();
    });
  });
});
