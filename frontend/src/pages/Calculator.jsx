import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { motion } from 'framer-motion';
import {
  Calculator as CalculatorIcon, Check, Clock3, Copy, Delete,
  ChevronDown, History, Keyboard, Sparkles, Trash2, X,
  Landmark, Percent, TrendingUp, Users, ArrowRight,
} from 'lucide-react';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { api, CURRENCIES } from '../services/api';

/* 
 * ————————————————————————————————————————————
 * CONFIGURATION & CONSTANTS
 * Defines storage keys, limits, and mathematical constants.
 * ————————————————————————————————————————————
 */
const STORAGE_PREFIX = 'mycoinwise-calculator';
const MAX_HISTORY_ITEMS = 30;

const getStorageKey = (suffix, userId) => `${STORAGE_PREFIX}-${suffix}:${userId || 'guest'}`;

const SUPPORTED_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'sqrt', 'cbrt', 'abs', 'exp', 'floor', 'ceil', 'round',
  'pow', 'min', 'max',
]);

/**
 * Generates a unique client ID for tracking unsynced calculations.
 */
const generateUniqueId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Safely parses JSON from localStorage, returning a fallback on failure.
 */
const loadFromStorage = (key, fallbackValue) => {
  try {
    const rawData = localStorage.getItem(key);
    if (!rawData) return fallbackValue;
    return JSON.parse(rawData);
  } catch {
    return fallbackValue;
  }
};

/**
 * Safely writes JSON to localStorage, ignoring quota errors.
 */
const saveToStorage = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore quota errors */ }
};

/**
 * Normalizes a history item from local or remote storage into a consistent format.
 */
const normalizeHistoryEntry = (item) => {
  if (!item || typeof item !== 'object') return null;
  
  const uniqueId = item.clientId || item.client_id || item.id || item._id || generateUniqueId();
  const rawNumeric = item.numericResult ?? item.numeric_result;
  const parsedNumeric = Number(rawNumeric);

  return {
    id: item.id || item._id || uniqueId,
    clientId: uniqueId,
    expression: String(item.expression ?? ''),
    result: String(item.result ?? ''),
    numericResult: Number.isFinite(parsedNumeric) ? parsedNumeric : 0,
    angleMode: item.angleMode || item.angle_mode || 'DEG',
    timestamp: item.timestamp || item.created_at || Date.now(),
    isSynced: item.synced ?? true,
  };
};

/* 
 * ————————————————————————————————————————————
 * EXPRESSION PARSER & EVALUATOR
 * Custom tokenizer and recursive descent parser for safe math evaluation.
 * ————————————————————————————————————————————
 */

/**
 * Tokenizes a mathematical expression string into numbers, identifiers, and operators.
 */
function tokenizeExpression(expression) {
  const tokens = [];
  let currentIndex = 0;

  while (currentIndex < expression.length) {
    const char = expression[currentIndex];

    // Skip whitespace
    if (/\s/.test(char)) {
      currentIndex += 1;
      continue;
    }

    // Parse Numbers (including decimals and scientific notation)
    if (/[0-9.]/.test(char)) {
      const match = expression.slice(currentIndex).match(/^(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?/i);
      if (!match) throw new Error('Invalid number format');
      
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new Error('Number is too large');
      
      tokens.push({ type: 'number', value });
      currentIndex += match[0].length;
      continue;
    }

    // Parse Identifiers (functions, constants, variables)
    if (/[a-zA-Zπ]/.test(char)) {
      const match = expression.slice(currentIndex).match(/^(?:[a-zA-Z]+|π)/);
      const normalizedValue = match[0].toLowerCase() === 'π' ? 'pi' : match[0].toLowerCase();
      tokens.push({ type: 'identifier', value: normalizedValue });
      currentIndex += match[0].length;
      continue;
    }

    // Parse Operators and Parentheses
    if ('+-*/^%!(),'.includes(char)) {
      tokens.push({
        type: char === '(' || char === ')' || char === ',' ? char : 'operator',
        value: char,
      });
      currentIndex += 1;
      continue;
    }

    throw new Error(`Unsupported character: ${char}`);
  }
  return tokens;
}

/**
 * Evaluates a tokenized mathematical expression with support for angles and previous answers.
 */
function evaluateMathExpression(expression, { angleMode = 'DEG', previousAnswer = 0 } = {}) {
  // Normalize common symbols
  const cleanedExpression = String(expression)
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('−', '-')
    .replaceAll('√', 'sqrt')
    .replace(/(\d)\(/g, '$1*(') // Implicit multiplication: 2(3) -> 2*(3)
    .replace(/\)\(/g, ')*(');   // Implicit multiplication: )( -> )*(

  const tokens = tokenizeExpression(cleanedExpression);
  let position = 0;

  const peekToken = () => tokens[position];
  const consumeToken = () => tokens[position++];
  
  const isPrimaryStart = (token) =>
    token && (token.type === 'number' || token.type === 'identifier' || token.type === '(');

  // Angle conversion helpers
  const toRadians = (value) => (angleMode === 'DEG' ? (value * Math.PI) / 180 : value);
  const fromRadians = (value) => (angleMode === 'DEG' ? (value * 180) / Math.PI : value);

  // Constants available in expressions
  const constants = { pi: Math.PI, e: Math.E, ans: previousAnswer };

  // Mathematical functions available in expressions
  const mathFunctions = {
    sin: (v) => Math.sin(toRadians(v)),
    cos: (v) => Math.cos(toRadians(v)),
    tan: (v) => Math.tan(toRadians(v)),
    asin: (v) => fromRadians(Math.asin(v)),
    acos: (v) => fromRadians(Math.acos(v)),
    atan: (v) => fromRadians(Math.atan(v)),
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    log: Math.log10, ln: Math.log,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    pow: Math.pow, min: Math.min, max: Math.max,
  };

  const assertValidNumber = (value) => {
    if (!Number.isFinite(value)) throw new Error('Result is not a real number');
    return value;
  };

  // --- Recursive Descent Parser ---

  const parseExpression = () => parseAdditionSubtraction();

  const parseAdditionSubtraction = () => {
    let value = parseMultiplicationDivision();
    while (peekToken()?.value === '+' || peekToken()?.value === '-') {
      const operator = consumeToken().value;
      const rightOperand = parseMultiplicationDivision();
      value = assertValidNumber(operator === '+' ? value + rightOperand : value - rightOperand);
    }
    return value;
  };

  const parseMultiplicationDivision = () => {
    let value = parseUnary();
    while (true) {
      const token = peekToken();
      if (token?.value === '*' || token?.value === '/' || token?.value === '%') {
        const operator = consumeToken().value;
        const rightOperand = parseUnary();
        
        if (operator === '/' && rightOperand === 0) throw new Error('Cannot divide by zero');
        
        if (operator === '*') value = assertValidNumber(value * rightOperand);
        else if (operator === '/') value = assertValidNumber(value / rightOperand);
        else value = assertValidNumber(value % rightOperand);
      } else if (isPrimaryStart(token)) {
        // Implicit multiplication
        value = assertValidNumber(value * parseUnary());
      } else {
        return value;
      }
    }
  };

  const parseUnary = () => {
    if (peekToken()?.value === '+' || peekToken()?.value === '-') {
      const operator = consumeToken().value;
      const value = parseUnary();
      return operator === '-' ? -value : value;
    }

    let value = parseExponentiation();

    // Factorial
    while (peekToken()?.value === '!') {
      consumeToken();
      if (!Number.isInteger(value) || value < 0 || value > 170) {
        throw new Error('Factorial requires an integer from 0 to 170');
      }
      let factorialResult = 1;
      for (let i = 2; i <= value; i += 1) factorialResult *= i;
      value = factorialResult;
    }

    // Percentage postfix (only if not followed by another number, which would imply modulo)
    if (peekToken()?.value === '%') {
      const nextTokenValue = tokens[position + 1]?.value;
      const isPercentageContext =
        nextTokenValue === undefined ||
        nextTokenValue === '%' || nextTokenValue === ')' || nextTokenValue === ',' ||
        nextTokenValue === '+' || nextTokenValue === '-' || nextTokenValue === '*' || nextTokenValue === '/' || nextTokenValue === '^';
      
      if (isPercentageContext) {
        consumeToken();
        value /= 100;
      }
    }

    return assertValidNumber(value);
  };

  const parseExponentiation = () => {
    let value = parsePrimary();
    if (peekToken()?.value === '^') {
      consumeToken();
      value = assertValidNumber(Math.pow(value, parseUnary()));
    }
    return value;
  };

  const parsePrimary = () => {
    const token = consumeToken();
    if (!token) throw new Error('Incomplete expression');
    
    if (token.type === 'number') return token.value;
    
    if (token.type === '(') {
      const value = parseExpression();
      if (consumeToken()?.type !== ')') throw new Error('Missing closing parenthesis');
      return value;
    }
    
    if (token.type === 'identifier') {
      if (Object.hasOwn(constants, token.value)) return constants[token.value];
      
      if (!SUPPORTED_FUNCTIONS.has(token.value) || peekToken()?.type !== '(') {
        throw new Error(`Unknown function: ${token.value}`);
      }
      
      consumeToken(); // Consume '('
      const args = [];
      
      if (peekToken()?.type !== ')') {
        args.push(parseExpression());
        while (peekToken()?.type === ',') {
          consumeToken();
          args.push(parseExpression());
        }
      }
      
      if (consumeToken()?.type !== ')') throw new Error('Missing closing parenthesis');

      const isVariadic = token.value === 'min' || token.value === 'max';
      const expectedArgs = token.value === 'pow' ? 2 : 1;
      
      if (isVariadic ? args.length < 1 : args.length !== expectedArgs) {
        throw new Error(`${token.value} has the wrong number of arguments`);
      }
      
      return assertValidNumber(mathFunctions[token.value](...args));
    }
    
    throw new Error('Unexpected token');
  };

  if (!tokens.length) throw new Error('Enter an expression');
  
  const finalResult = assertValidNumber(parseExpression());
  if (position !== tokens.length) throw new Error('Check the expression');
  
  return finalResult;
}

/**
 * Formats a numeric result for display, handling large/small numbers.
 */
const formatDisplayResult = (value) => {
  if (!Number.isFinite(value)) return 'Error';
  if (Math.abs(value) >= 1e12 || (Math.abs(value) > 0 && Math.abs(value) < 1e-9)) {
    return value.toExponential(8);
  }
  return Number(value.toPrecision(12)).toString();
};

/* 
 * ————————————————————————————————————————————
 * BUTTON LAYOUT DEFINITIONS
 * Configures the grid layout for basic and scientific keys.
 * ————————————————————————————————————————————
 */
const KEY_LAYOUTS = {
  scientific: [
    ['sin(', 'sin'], ['cos(', 'cos'], ['tan(', 'tan'], ['log(', 'log'],
    ['asin(', 'asin'], ['acos(', 'acos'], ['atan(', 'atan'], ['ln(', 'ln'],
    ['sqrt(', '√'], ['cbrt(', '∛'], ['abs(', 'abs'], ['exp(', 'exp'],
    ['floor(', 'floor'], ['ceil(', 'ceil'], ['round(', 'round'], ['pow(', 'pow'],
    ['min(', 'min'], ['max(', 'max'], ['sinh(', 'sinh'], ['cosh(', 'cosh'],
    ['!', '!'], [',', ','], ['π', 'π'], ['e', 'e'],
  ],
  basic: [
    ['CE', 'CE', 'clearEntry'], ['C', 'C', 'clear'], ['%', '%'], ['Delete', 'Delete', 'backspace'],
    ['(', '('], [')', ')'], ['^', 'xʸ'], ['/', '÷'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['*', '×'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['-', '−'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+'],
    ['0', '0'], ['.', '.'], ['ans', 'Ans'], ['=', '=', 'calculate'],
  ],
};

/* 
 * ————————————————————————————————————————————
 * MAIN COMPONENT: ScientificCalculator
 * Handles state, evaluation, history, and synchronization.
 * ————————————————————————————————————————————
 */
export default function ScientificCalculator() {
  const { USER_ID, currency = 'USD' } = useAppState();
  const { t: translate } = useAppActions();
  const currSymbol = CURRENCIES?.[currency]?.symbol || currency || '$';

  // Mode and view state
  const [calculatorMode, setCalculatorMode] = useState('standard'); // 'standard' | 'finance'
  const [financeTool, setFinanceTool] = useState('emi'); // 'emi' | 'tip' | 'compound'
  const [showMobileHistory, setShowMobileHistory] = useState(false);

  // Financial Tools: Loan EMI state
  const [loanPrincipal, setLoanPrincipal] = useState('500000');
  const [loanRate, setLoanRate] = useState('8.5');
  const [loanMonths, setLoanMonths] = useState('36');

  // Financial Tools: Tip & Bill Split state
  const [billAmount, setBillAmount] = useState('120');
  const [tipPercent, setTipPercent] = useState('15');
  const [splitCount, setSplitCount] = useState('2');

  // Financial Tools: Compound Interest state
  const [initialDeposit, setInitialDeposit] = useState('10000');
  const [monthlyAddition, setMonthlyAddition] = useState('500');
  const [annualReturnRate, setAnnualReturnRate] = useState('10');
  const [investmentYears, setInvestmentYears] = useState('5');

  // Core Calculator State
  const [currentExpression, setCurrentExpression] = useState('');
  const [displayResult, setDisplayResult] = useState('0');
  const [lastAnswer, setLastAnswer] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Settings & Persistence State
  const [angleMode, setAngleMode] = useState(
    () => localStorage.getItem(getStorageKey('angle', USER_ID)) || 'DEG'
  );
  const [memoryValue, setMemoryValue] = useState(() => {
    const raw = Number(localStorage.getItem(getStorageKey('memory', USER_ID)));
    return Number.isFinite(raw) ? raw : 0;
  });
  const [historyList, setHistoryList] = useState(() => {
    const stored = loadFromStorage(getStorageKey('history', USER_ID), []);
    return Array.isArray(stored) ? stored.map(normalizeHistoryEntry).filter(Boolean) : [];
  });

  // UI State
  const [isCopied, setIsCopied] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [showScientificPanel, setShowScientificPanel] = useState(() => (
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 641px)').matches
  ));

  const copyTimeoutRef = useRef(null);

  // Financial Calculators Reactive Memos
  const emiCalculations = useMemo(() => {
    const P = parseFloat(loanPrincipal) || 0;
    const r = (parseFloat(loanRate) || 0) / (12 * 100);
    const n = parseInt(loanMonths, 10) || 1;
    if (P <= 0 || n <= 0) return { emi: 0, totalInterest: 0, totalPayable: 0 };
    if (r === 0) {
      const emi = P / n;
      return { emi, totalInterest: 0, totalPayable: P };
    }
    const emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const totalPayable = emi * n;
    const totalInterest = totalPayable - P;
    return {
      emi: Number.isFinite(emi) ? emi : 0,
      totalInterest: Number.isFinite(totalInterest) ? totalInterest : 0,
      totalPayable: Number.isFinite(totalPayable) ? totalPayable : 0,
    };
  }, [loanPrincipal, loanRate, loanMonths]);

  const tipCalculations = useMemo(() => {
    const bill = parseFloat(billAmount) || 0;
    const tipPct = parseFloat(tipPercent) || 0;
    const people = parseInt(splitCount, 10) || 1;
    const tipAmount = bill * (tipPct / 100);
    const totalWithTip = bill + tipAmount;
    const perPerson = people > 0 ? totalWithTip / people : totalWithTip;
    return {
      tipAmount,
      totalWithTip,
      perPerson,
    };
  }, [billAmount, tipPercent, splitCount]);

  const compoundCalculations = useMemo(() => {
    const P = parseFloat(initialDeposit) || 0;
    const PMT = parseFloat(monthlyAddition) || 0;
    const r = (parseFloat(annualReturnRate) || 0) / 100 / 12;
    const n = (parseInt(investmentYears, 10) || 1) * 12;
    let balance = P;
    let totalDeposited = P;
    for (let i = 0; i < n; i += 1) {
      balance = balance * (1 + r) + PMT;
      totalDeposited += PMT;
    }
    const interestGained = balance - totalDeposited;
    return {
      totalDeposited,
      interestGained: Math.max(0, interestGained),
      futureValue: balance,
    };
  }, [initialDeposit, monthlyAddition, annualReturnRate, investmentYears]);

  const handleTransferToCalculator = useCallback((val) => {
    const formatted = typeof val === 'number' ? val.toFixed(2) : String(val);
    setCurrentExpression(formatted);
    setDisplayResult(formatted);
    setLastAnswer(parseFloat(formatted) || 0);
    setCalculatorMode('standard');
    setErrorMessage('');
  }, []);

  /* 
   * ————————————————————————————————————————————
   * EFFECTS: RESPONSIVENESS & SYNC
   * ————————————————————————————————————————————
   */

  /**
   * Adjusts scientific panel visibility based on screen width.
   */
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 641px)');
    const handleResize = () => setShowScientificPanel(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', handleResize);
    return () => mediaQuery.removeEventListener?.('change', handleResize);
  }, []);

  /**
   * Reloads user-specific data when the User ID changes.
   */
  const reloadUserData = useCallback(() => {
    const storedHistory = loadFromStorage(getStorageKey('history', USER_ID), []);
    setHistoryList(Array.isArray(storedHistory) ? storedHistory.map(normalizeHistoryEntry).filter(Boolean) : []);

    const rawMem = Number(localStorage.getItem(getStorageKey('memory', USER_ID)));
    setMemoryValue(Number.isFinite(rawMem) ? rawMem : 0);

    const storedAngle = localStorage.getItem(getStorageKey('angle', USER_ID));
    if (storedAngle === 'DEG' || storedAngle === 'RAD') setAngleMode(storedAngle);
  }, [USER_ID]);

  useEffect(() => {
    const frame = requestAnimationFrame(reloadUserData);
    return () => cancelAnimationFrame(frame);
  }, [reloadUserData]);

  /**
   * Persists angle mode preference.
   */
  useEffect(() => {
    localStorage.setItem(getStorageKey('angle', USER_ID), angleMode);
  }, [USER_ID, angleMode]);

  /**
   * Synchronizes pending local calculations with the remote database.
   */
  useEffect(() => {
    if (!USER_ID) return undefined;
    let isActive = true;

    const syncPendingCalculations = async () => {
      const pendingKey = getStorageKey('pending', USER_ID);
      const pendingItems = loadFromStorage(pendingKey, []);
      const failedItems = [];

      // Attempt to upload pending items
      for (const item of pendingItems) {
        try {
          await api.saveCalculation({
            userId: USER_ID,
            client_id: item.clientId,
            expression: item.expression,
            result: item.result,
            numeric_result: item.numericResult,
            angle_mode: item.angleMode,
          });
        } catch {
          failedItems.push(item);
        }
      }

      if (!isActive) return;

      // Update pending storage
      if (failedItems.length) {
        saveToStorage(pendingKey, failedItems);
      } else {
        localStorage.removeItem(pendingKey);
      }

      // Mark successfully uploaded items as synced in local history
      if (failedItems.length !== pendingItems.length) {
        const uploadedIds = new Set(
          pendingItems.filter((p) => !failedItems.some((r) => r.clientId === p.clientId))
            .map((p) => p.clientId)
        );
        setHistoryList((currentHistory) => {
          const updatedHistory = currentHistory.map((h) =>
            uploadedIds.has(h.clientId) ? { ...h, isSynced: true } : h
          );
          saveToStorage(getStorageKey('history', USER_ID), updatedHistory);
          return updatedHistory;
        });
      }

      // Fetch remote history and merge
      try {
        const remoteHistory = (await api.getCalculations(USER_ID))
          .map(normalizeHistoryEntry)
          .filter(Boolean);
        
        if (!isActive) return;

        const remoteIds = new Set(remoteHistory.map((r) => r.clientId));
        const stillPending = failedItems
          .filter((r) => !remoteIds.has(r.clientId))
          .map((r) => ({ ...r, isSynced: false }));

        const mergedHistory = [...remoteHistory, ...stillPending]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, MAX_HISTORY_ITEMS);

        setHistoryList(mergedHistory);
        saveToStorage(getStorageKey('history', USER_ID), mergedHistory);
      } catch {
        // If fetch fails, keep local history but add any remaining pending items
        if (!isActive) return;
        setHistoryList((currentHistory) => {
          const existingIds = new Set(currentHistory.map((h) => h.clientId));
          const extraPending = failedItems
            .filter((r) => !existingIds.has(r.clientId))
            .map((r) => ({ ...r, isSynced: false }));
          
          const nextHistory = [...currentHistory, ...extraPending]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, MAX_HISTORY_ITEMS);
          
          saveToStorage(getStorageKey('history', USER_ID), nextHistory);
          return nextHistory;
        });
        
        if (failedItems.length) {
          setErrorMessage('Some calculations are waiting to sync with the database.');
        }
      }
    };

    syncPendingCalculations();
    return () => { isActive = false; };
  }, [USER_ID]);

  /* 
   * ————————————————————————————————————————————
   * COMPUTED VALUES
   * ————————————————————————————————————————————
   */

  /**
   * Live preview of the result as the user types.
   */
  const livePreview = useMemo(() => {
    if (!currentExpression.trim()) return '';
    try { return formatDisplayResult(evaluateMathExpression(currentExpression, { angleMode, previousAnswer: lastAnswer })); }
    catch { return ''; }
  }, [angleMode, lastAnswer, currentExpression]);

  /* 
   * ————————————————————————————————————————————
   * ACTION HANDLERS
   * ————————————————————————————————————————————
   */

  /**
   * Appends a character or function to the current expression.
   */
  const appendToExpression = useCallback((value) => {
    setCurrentExpression((prev) => {
      if (value === ')') {
        const openCount = (prev.match(/\(/g) || []).length;
        const closeCount = (prev.match(/\)/g) || []).length;
        if (closeCount >= openCount) return prev;
      }
      return prev === '0' ? value : prev + value;
    });
    setErrorMessage('');
  }, []);

  /**
   * Evaluates the current expression and saves it to history.
   */
  const performCalculation = useCallback(() => {
    if (!currentExpression.trim()) return;
    
    try {
      const numericResult = evaluateMathExpression(currentExpression, { angleMode, previousAnswer: lastAnswer });
      const formattedResult = formatDisplayResult(numericResult);
      
      setDisplayResult(formattedResult);
      setLastAnswer(numericResult);
      setErrorMessage('');

      const newEntry = normalizeHistoryEntry({
        clientId: generateUniqueId(),
        expression: currentExpression,
        result: formattedResult,
        numericResult,
        angleMode,
        timestamp: new Date().toISOString(),
        isSynced: false,
      });

      // Update local history immediately
      setHistoryList((prevHistory) => {
        const nextHistory = [newEntry, ...prevHistory].slice(0, MAX_HISTORY_ITEMS);
        saveToStorage(getStorageKey('history', USER_ID), nextHistory);
        return nextHistory;
      });

      // Sync to backend if user is logged in
      if (USER_ID) {
        api.saveCalculation({
          userId: USER_ID,
          client_id: newEntry.clientId,
          expression: newEntry.expression,
          result: newEntry.result,
          numeric_result: newEntry.numericResult,
          angle_mode: newEntry.angleMode,
        })
          .then(() => {
            setHistoryList((prevHistory) => {
              const updatedHistory = prevHistory.map((h) =>
                h.clientId === newEntry.clientId ? { ...h, isSynced: true } : h
              );
              saveToStorage(getStorageKey('history', USER_ID), updatedHistory);
              return updatedHistory;
            });
          })
          .catch(() => {
            const pendingKey = getStorageKey('pending', USER_ID);
            const pendingItems = loadFromStorage(pendingKey, []);
            if (!pendingItems.some((p) => p.clientId === newEntry.clientId)) {
              const nextPending = [...pendingItems, newEntry].slice(-MAX_HISTORY_ITEMS);
              saveToStorage(pendingKey, nextPending);
            }
            setErrorMessage('Calculation saved locally and queued for database sync.');
          });
      }
    } catch (err) {
      setErrorMessage(err.message || 'Unable to calculate');
      setDisplayResult('Error');
    }
  }, [USER_ID, angleMode, lastAnswer, currentExpression]);

  /**
   * Handles keyboard input for calculator operations.
   */
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isInputField =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      
      if (isInputField) return;

      if (/^[0-9.+*/^%(),-]$/.test(event.key)) appendToExpression(event.key);
      else if (event.key === 'Enter' || event.key === '=') performCalculation();
      else if (event.key === 'Backspace') setCurrentExpression((prev) => prev.slice(0, -1));
      else if (event.key === 'Escape') {
        setCurrentExpression('');
        setDisplayResult('0');
        setErrorMessage('');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appendToExpression, performCalculation]);

  /**
   * Clears the current expression and result.
   */
  const clearAll = () => {
    setCurrentExpression('');
    setDisplayResult('0');
    setErrorMessage('');
  };

  /**
   * Clears only the current expression entry.
   */
  const clearEntry = () => {
    setCurrentExpression('');
    setErrorMessage('');
  };

  /**
   * Clears the entire calculation history from local and remote storage.
   */
  const clearAllHistory = useCallback(async () => {
    if (isClearingHistory) return;
    setIsClearingHistory(true);
    
    if (USER_ID) {
      try {
        await api.clearCalculations(USER_ID);
      } catch {
        setErrorMessage('Could not clear database history. Please try again.');
        setIsClearingHistory(false);
        return;
      }
      localStorage.removeItem(getStorageKey('pending', USER_ID));
    }
    
    setHistoryList([]);
    localStorage.removeItem(getStorageKey('history', USER_ID));
    setErrorMessage('');
    setIsClearingHistory(false);
  }, [USER_ID, isClearingHistory]);

  /**
   * Performs memory operations (Store, Recall, Add, Subtract, Clear).
   */
  const handleMemoryOperation = useCallback((action) => {
    const currentNumeric = Number(displayResult);
    
    if (!Number.isFinite(currentNumeric) && action !== 'clear') {
      setErrorMessage('Cannot perform memory operation on non‑finite result.');
      return;
    }
    
    let nextMemoryValue;
    switch (action) {
      case 'clear': nextMemoryValue = 0; break;
      case 'store': nextMemoryValue = currentNumeric; break;
      case 'add': nextMemoryValue = memoryValue + currentNumeric; break;
      case 'subtract': nextMemoryValue = memoryValue - currentNumeric; break;
      default: nextMemoryValue = memoryValue;
    }
    
    setMemoryValue(nextMemoryValue);
    localStorage.setItem(getStorageKey('memory', USER_ID), String(nextMemoryValue));
    setErrorMessage('');
  }, [USER_ID, memoryValue, displayResult]);

  /**
   * Copies the current result to the clipboard.
   */
  const copyResultToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayResult);
      setIsCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 1400);
    } catch {
      setErrorMessage('Clipboard access is unavailable');
    }
  }, [displayResult]);

  useEffect(() => () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  }, []);

  /**
   * Deletes a specific item from history.
   */
  const removeHistoryItem = useCallback(async (item) => {
    setHistoryList((currentHistory) => {
      const filteredHistory = currentHistory.filter((h) => h.clientId !== item.clientId);
      saveToStorage(getStorageKey('history', USER_ID), filteredHistory);
      return filteredHistory;
    });

    if (item.isSynced && USER_ID) {
      try {
        await api.deleteCalculation(USER_ID, item.clientId);
      } catch {
        setErrorMessage('Failed to delete from server, but removed locally.');
      }
    } else {
      const pendingKey = getStorageKey('pending', USER_ID);
      const pendingItems = loadFromStorage(pendingKey, []);
      const filteredPending = pendingItems.filter((p) => p.clientId !== item.clientId);
      saveToStorage(pendingKey, filteredPending);
    }
  }, [USER_ID]);

  /* 
   * ————————————————————————————————————————————
   * RENDER: MAIN INTERFACE
   * ————————————————————————————————————————————
   */
  return (
    <div className="calculator-page">
      {/* ===================== Island Header ===================== */}
      <header className="island-header glass-sm calculator-page-header" style={{ marginBottom: '1.25rem' }}>
        <div className="ih-left">
          <div className="ih-titles">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CalculatorIcon className="text-brand" size={24} aria-hidden />
              {translate?.('calculator_title') || 'Calculator'}
            </h1>
            <p>{translate?.('calculator_subtitle') || 'Fast, precise calculations & financial decision tools.'}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Segmented Mode Selector */}
          <div className="calc-mode-segmented" role="tablist" aria-label="Calculator Mode">
            <button
              type="button"
              className={`calc-mode-btn ${calculatorMode === 'standard' ? 'active' : ''}`}
              onClick={() => setCalculatorMode('standard')}
              role="tab"
              aria-selected={calculatorMode === 'standard'}
            >
              <Sparkles size={14} /> <span>Scientific</span>
            </button>
            <button
              type="button"
              className={`calc-mode-btn ${calculatorMode === 'finance' ? 'active' : ''}`}
              onClick={() => setCalculatorMode('finance')}
              role="tab"
              aria-selected={calculatorMode === 'finance'}
            >
              <Landmark size={14} /> <span>Financial Tools</span>
            </button>
          </div>

          {/* Toggle History Button for Quick Access */}
          <button
            type="button"
            className={`btn-secondary ${showMobileHistory ? 'active' : ''}`}
            onClick={() => setShowMobileHistory((v) => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 12px' }}
            title="Toggle calculation history"
          >
            <History size={14} />
            <span>History</span>
            {historyList.length > 0 && (
              <span className="ih-badge" style={{ marginLeft: 2 }}>{historyList.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* ===================== Main Calculator Body ===================== */}
      <div className="calculator-shell">
        <section className="calculator-main glass" aria-label="Calculator Workspace">
          {calculatorMode === 'standard' ? (
            <>
              {/* High-Contrast Theme-Aware Display */}
              <div className="calculator-display">
                <div className="calculator-display-top">
                  <span className="calculator-angle-badge">
                    {angleMode} mode
                  </span>
                  <span><Keyboard size={13} /> {translate?.('keyboard_ready') || 'Keyboard ready'}</span>
                </div>
                <div className="calculator-expression allow-copy" data-allow-copy="true" aria-label="Current expression">
                  {currentExpression || '0'}
                </div>
                <div className="calculator-result-row allow-copy" data-allow-copy="true">
                  <strong className="allow-copy" data-allow-copy="true" aria-live="polite" aria-atomic="true">{displayResult}</strong>
                  <button
                    type="button"
                    className="calculator-copy"
                    onClick={copyResultToClipboard}
                    aria-label="Copy result"
                    title="Copy result"
                  >
                    {isCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                {livePreview && livePreview !== displayResult && (
                  <div className="calculator-preview">= {livePreview}</div>
                )}
                {errorMessage && <p className="calculator-error" role="alert">{errorMessage}</p>}
              </div>

              {/* Memory & Angle Toolbar */}
              <div className="calculator-toolbar">
                <button type="button" className="calculator-tool" onClick={() => handleMemoryOperation('clear')} aria-label="Memory clear">MC</button>
                <button type="button" className="calculator-tool" onClick={() => appendToExpression(String(memoryValue))} aria-label="Memory recall">MR</button>
                <button type="button" className="calculator-tool" onClick={() => handleMemoryOperation('add')} aria-label="Memory add">M+</button>
                <button type="button" className="calculator-tool" onClick={() => handleMemoryOperation('subtract')} aria-label="Memory subtract">M−</button>
                <button type="button" className="calculator-tool" onClick={() => handleMemoryOperation('store')} aria-label="Memory store">MS</button>
                <span className="calculator-memory-status">M {formatDisplayResult(memoryValue)}</span>
                <button
                  type="button"
                  className="calculator-angle"
                  onClick={() => setAngleMode((m) => (m === 'DEG' ? 'RAD' : 'DEG'))}
                >
                  {angleMode}
                </button>
              </div>

              {/* Tactile Keypad */}
              <div className="calculator-keypad">
                <button
                  type="button"
                  className="calculator-functions-toggle"
                  aria-expanded={showScientificPanel}
                  aria-controls="scientific-panel"
                  onClick={() => setShowScientificPanel((v) => !v)}
                >
                  <span><Sparkles size={14} /> Scientific functions</span>
                  <ChevronDown size={16} />
                </button>
                <div
                  id="scientific-panel"
                  className={`calculator-scientific-panel ${showScientificPanel ? 'is-open' : ''}`}
                >
                  <div className="calculator-scientific-grid">
                    {KEY_LAYOUTS.scientific.map(([value, label]) => (
                      <button
                        type="button"
                        key={label}
                        className="calculator-key scientific"
                        onClick={() => appendToExpression(value)}
                        aria-label={label}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="calculator-basic-panel">
                  <div className="calculator-basic-grid">
                    {KEY_LAYOUTS.basic.map(([value, label, action]) => {
                      let clickHandler = () => appendToExpression(value);
                      if (action === 'clearEntry') clickHandler = clearEntry;
                      else if (action === 'clear') clickHandler = clearAll;
                      else if (action === 'backspace') clickHandler = () => setCurrentExpression((c) => c.slice(0, -1));
                      else if (action === 'calculate') clickHandler = performCalculation;

                      let className = 'calculator-key';
                      if (['/', '*', '-', '+', '^'].includes(value)) className += ' operator';
                      else if (['CE', 'C', 'Delete'].includes(value)) className += ' utility';
                      else if (value === '=') className += ' equals';

                      return (
                        <button
                          type="button"
                          key={`${value}-${label}`}
                          className={className}
                          onClick={clickHandler}
                          aria-label={label}
                        >
                          {value === 'Delete' ? <Delete size={18} /> : label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <p className="calculator-hint">
                <Clock3 size={14} /> {translate?.('calculator_hint') || 'Use parentheses for clarity, and press Enter to calculate.'}
              </p>
            </>
          ) : (
            /* ===================== Financial Calculators ===================== */
            <div className="calc-fin-container">
              {/* Financial Sub-tabs */}
              <div className="calc-fin-subtabs">
                <button
                  type="button"
                  className={`calc-fin-tab-btn ${financeTool === 'emi' ? 'active' : ''}`}
                  onClick={() => setFinanceTool('emi')}
                >
                  <Landmark size={15} /> <span>Loan & EMI Calculator</span>
                </button>
                <button
                  type="button"
                  className={`calc-fin-tab-btn ${financeTool === 'tip' ? 'active' : ''}`}
                  onClick={() => setFinanceTool('tip')}
                >
                  <Percent size={15} /> <span>Tip & Bill Splitter</span>
                </button>
                <button
                  type="button"
                  className={`calc-fin-tab-btn ${financeTool === 'compound' ? 'active' : ''}`}
                  onClick={() => setFinanceTool('compound')}
                >
                  <TrendingUp size={15} /> <span>Compound Interest & SIP</span>
                </button>
              </div>

              {/* Sub-tool 1: Loan EMI */}
              {financeTool === 'emi' && (
                <div className="calc-fin-card glass">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Loan EMI & Payment Breakdown
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-calculated</span>
                  </div>

                  <div className="calc-fin-grid">
                    <div className="calc-fin-field">
                      <label htmlFor="loan-principal">Loan Amount ({currSymbol})</label>
                      <input
                        id="loan-principal"
                        type="number"
                        min="0"
                        step="1000"
                        value={loanPrincipal}
                        onChange={(e) => setLoanPrincipal(e.target.value)}
                        placeholder="500000"
                      />
                    </div>
                    <div className="calc-fin-field">
                      <label htmlFor="loan-rate">Annual Interest Rate (%)</label>
                      <input
                        id="loan-rate"
                        type="number"
                        min="0"
                        step="0.1"
                        value={loanRate}
                        onChange={(e) => setLoanRate(e.target.value)}
                        placeholder="8.5"
                      />
                    </div>
                    <div className="calc-fin-field">
                      <label htmlFor="loan-tenure">Duration (Months)</label>
                      <input
                        id="loan-tenure"
                        type="number"
                        min="1"
                        step="1"
                        value={loanMonths}
                        onChange={(e) => setLoanMonths(e.target.value)}
                        placeholder="36"
                      />
                    </div>
                  </div>

                  <div className="calc-fin-results">
                    <div className="calc-fin-res-col">
                      <span>Monthly EMI</span>
                      <strong style={{ color: 'var(--brand-primary)' }}>{currSymbol}{emiCalculations.emi.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="calc-fin-res-col">
                      <span>Total Interest</span>
                      <strong style={{ color: 'var(--warning-color, #f59e0b)' }}>{currSymbol}{emiCalculations.totalInterest.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="calc-fin-res-col">
                      <span>Total Amount</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{currSymbol}{emiCalculations.totalPayable.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleTransferToCalculator(emiCalculations.emi)}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
                  >
                    <ArrowRight size={15} /> <span>Use EMI in Calculator ({currSymbol}{emiCalculations.emi.toFixed(2)})</span>
                  </button>
                </div>
              )}

              {/* Sub-tool 2: Tip & Bill Splitter */}
              {financeTool === 'tip' && (
                <div className="calc-fin-card glass">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Dining Tip & Group Bill Split
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Per-person split</span>
                  </div>

                  <div className="calc-fin-grid">
                    <div className="calc-fin-field">
                      <label htmlFor="bill-amount">Bill Total ({currSymbol})</label>
                      <input
                        id="bill-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={billAmount}
                        onChange={(e) => setBillAmount(e.target.value)}
                        placeholder="120.00"
                      />
                    </div>
                    <div className="calc-fin-field">
                      <label htmlFor="tip-percent">Tip Percentage (%)</label>
                      <input
                        id="tip-percent"
                        type="number"
                        min="0"
                        step="1"
                        value={tipPercent}
                        onChange={(e) => setTipPercent(e.target.value)}
                        placeholder="15"
                      />
                    </div>
                    <div className="calc-fin-field">
                      <label htmlFor="split-count">Number of People</label>
                      <input
                        id="split-count"
                        type="number"
                        min="1"
                        step="1"
                        value={splitCount}
                        onChange={(e) => setSplitCount(e.target.value)}
                        placeholder="2"
                      />
                    </div>
                  </div>

                  <div className="calc-fin-results">
                    <div className="calc-fin-res-col">
                      <span>Tip Amount</span>
                      <strong style={{ color: 'var(--warning-color, #f59e0b)' }}>{currSymbol}{tipCalculations.tipAmount.toFixed(2)}</strong>
                    </div>
                    <div className="calc-fin-res-col">
                      <span>Total with Tip</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{currSymbol}{tipCalculations.totalWithTip.toFixed(2)}</strong>
                    </div>
                    <div className="calc-fin-res-col">
                      <span>Each Person Pays</span>
                      <strong style={{ color: 'var(--success-color, #10b981)' }}>{currSymbol}{tipCalculations.perPerson.toFixed(2)}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleTransferToCalculator(tipCalculations.perPerson)}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
                  >
                    <ArrowRight size={15} /> <span>Use Per-Person Share ({currSymbol}{tipCalculations.perPerson.toFixed(2)})</span>
                  </button>
                </div>
              )}

              {/* Sub-tool 3: Compound Interest */}
              {financeTool === 'compound' && (
                <div className="calc-fin-card glass">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Compound Interest & Wealth Growth
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compounded monthly</span>
                  </div>

                  <div className="calc-fin-grid">
                    <div className="calc-fin-field">
                      <label htmlFor="compound-init">Initial Deposit ({currSymbol})</label>
                      <input
                        id="compound-init"
                        type="number"
                        min="0"
                        step="500"
                        value={initialDeposit}
                        onChange={(e) => setInitialDeposit(e.target.value)}
                        placeholder="10000"
                      />
                    </div>
                    <div className="calc-fin-field">
                      <label htmlFor="compound-monthly">Monthly Addition ({currSymbol})</label>
                      <input
                        id="compound-monthly"
                        type="number"
                        min="0"
                        step="50"
                        value={monthlyAddition}
                        onChange={(e) => setMonthlyAddition(e.target.value)}
                        placeholder="500"
                      />
                    </div>
                    <div className="calc-fin-field">
                      <label htmlFor="compound-return">Annual Return (%)</label>
                      <input
                        id="compound-return"
                        type="number"
                        min="0"
                        step="0.5"
                        value={annualReturnRate}
                        onChange={(e) => setAnnualReturnRate(e.target.value)}
                        placeholder="10"
                      />
                    </div>
                    <div className="calc-fin-field">
                      <label htmlFor="compound-years">Time Horizon (Years)</label>
                      <input
                        id="compound-years"
                        type="number"
                        min="1"
                        max="50"
                        value={investmentYears}
                        onChange={(e) => setInvestmentYears(e.target.value)}
                        placeholder="5"
                      />
                    </div>
                  </div>

                  <div className="calc-fin-results">
                    <div className="calc-fin-res-col">
                      <span>Total Invested</span>
                      <strong style={{ color: 'var(--text-secondary)' }}>{currSymbol}{compoundCalculations.totalDeposited.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                    </div>
                    <div className="calc-fin-res-col">
                      <span>Wealth Gained</span>
                      <strong style={{ color: 'var(--success-color, #10b981)' }}>+{currSymbol}{compoundCalculations.interestGained.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                    </div>
                    <div className="calc-fin-res-col">
                      <span>Maturity Value</span>
                      <strong style={{ color: 'var(--brand-primary)' }}>{currSymbol}{compoundCalculations.futureValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleTransferToCalculator(compoundCalculations.futureValue)}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
                  >
                    <ArrowRight size={15} /> <span>Use Maturity Value ({currSymbol}{compoundCalculations.futureValue.toFixed(2)})</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ===================== Calculation History Sidebar / Drawer ===================== */}
        <aside
          className={`calculator-history glass ${showMobileHistory ? 'is-mobile-visible' : ''}`}
          aria-label="Calculation history"
          style={{
            display: showMobileHistory ? 'block' : undefined,
          }}
        >
          <div className="calculator-history-heading">
            <div>
              <span className="calculator-eyebrow">
                <History size={14} /> {translate?.('recent_work') || 'Recent work'}
              </span>
              <h2>{translate?.('history') || 'History'}</h2>
            </div>
            <button
              type="button"
              className="calculator-icon-button"
              onClick={clearAllHistory}
              disabled={isClearingHistory || historyList.length === 0}
              aria-label="Clear calculation history"
              title="Clear history"
            >
              {isClearingHistory ? <Clock3 size={16} /> : <Trash2 size={16} />}
            </button>
          </div>

          {historyList.length === 0 ? (
            <div className="calculator-empty-history">
              <CalculatorIcon size={28} />
              <p>{translate?.('calculator_empty') || 'Your calculations will appear here.'}</p>
              <span>{translate?.('calculator_stored') || 'Results are securely stored for your account.'}</span>
            </div>
          ) : (
            <div className="calculator-history-list">
              {historyList.map((item, index) => (
                <div key={`${item.clientId}-${index}`} className="calculator-history-item-wrapper">
                  <button
                    type="button"
                    className="calculator-history-item"
                    onClick={() => {
                      setCurrentExpression(item.expression);
                      setDisplayResult(item.result);
                      setAngleMode(item.angleMode || 'DEG');
                      setLastAnswer(Number.isFinite(item.numericResult) ? item.numericResult : 0);
                      setErrorMessage('');
                      setCalculatorMode('standard');
                    }}
                    aria-label={`Restore calculation: ${item.expression} = ${item.result}`}
                  >
                    <span>
                      {item.expression}{' '}
                      {!item.isSynced && (
                        <Clock3 size={12} style={{ marginLeft: 4 }} title="Not synced" />
                      )}
                    </span>
                    <strong>= {item.result}</strong>
                    <small>
                      {item.angleMode} ·{' '}
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="calculator-history-delete"
                    onClick={(e) => { e.stopPropagation(); removeHistoryItem(item); }}
                    aria-label="Delete this history entry"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}