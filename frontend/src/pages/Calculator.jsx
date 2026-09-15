import React, {
  useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { motion } from 'framer-motion';
import {
  Calculator as CalculatorIcon, Check, Clock3, Copy, Delete,
  ChevronDown, History, Keyboard, Sparkles, Trash2, X,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api } from '../services/api';

/* ============================================================
 * Constants & storage keys
 * ============================================================ */
const HISTORY_KEY = 'mycoinwise-calculator-history';
const PENDING_KEY = 'mycoinwise-calculator-pending';
const MEMORY_KEY = 'mycoinwise-calculator-memory';
const ANGLE_KEY = 'mycoinwise-calculator-angle';
const MAX_HISTORY = 30;

const getMemoryKey = (userId) => `${MEMORY_KEY}:${userId || 'guest'}`;
const getHistoryKey = (userId) => `${HISTORY_KEY}:${userId || 'guest'}`;
const getPendingKey = (userId) => `${PENDING_KEY}:${userId || 'guest'}`;
const getAngleKey = (userId) => `${ANGLE_KEY}:${userId || 'guest'}`;

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'sqrt', 'cbrt', 'abs', 'exp', 'floor', 'ceil', 'round',
  'pow', 'min', 'max',
]);

const isFiniteNumber = (value) => Number.isFinite(value);

const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const safeReadJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const safeWriteJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
};

const normalizeHistoryItem = (item) => {
  if (!item || typeof item !== 'object') return null;
  const clientId =
    item.clientId || item.client_id || item.id || item._id || newClientId();
  const numericRaw = item.numericResult ?? item.numeric_result;
  const numericResult = Number(numericRaw);
  return {
    id: item.id || item._id || clientId,
    clientId,
    expression: String(item.expression ?? ''),
    result: String(item.result ?? ''),
    numericResult: Number.isFinite(numericResult) ? numericResult : 0,
    angleMode: item.angleMode || item.angle_mode || 'DEG',
    timestamp: item.timestamp || item.created_at || Date.now(),
    synced: item.synced ?? true,
  };
};

/* ============================================================
 * Tokenizer & Parser
 * ============================================================ */
function tokenize(expression) {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) { index += 1; continue; }

    if (/[0-9.]/.test(char)) {
      const match = expression.slice(index).match(/^(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?/i);
      if (!match) throw new Error('Invalid number');
      const value = Number(match[0]);
      if (!isFiniteNumber(value)) throw new Error('Number is too large');
      tokens.push({ type: 'number', value });
      index += match[0].length;
      continue;
    }

    if (/[a-zA-Zπ]/.test(char)) {
      const match = expression.slice(index).match(/^(?:[a-zA-Z]+|π)/);
      const value = match[0].toLowerCase() === 'π' ? 'pi' : match[0].toLowerCase();
      tokens.push({ type: 'identifier', value });
      index += match[0].length;
      continue;
    }

    if ('+-*/^%!(),'.includes(char)) {
      tokens.push({
        type: char === '(' || char === ')' || char === ',' ? char : 'operator',
        value: char,
      });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported character: ${char}`);
  }
  return tokens;
}

function evaluateExpression(expression, { angleMode = 'DEG', answer = 0 } = {}) {
  const cleaned = String(expression)
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('−', '-')
    .replaceAll('√', 'sqrt')
    .replace(/(\d)\(/g, '$1*(')
    .replace(/\)\(/g, ')*(');

  const tokens = tokenize(cleaned);
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const isPrimaryStart = (token) =>
    token && (token.type === 'number' || token.type === 'identifier' || token.type === '(');

  const toRadians = (v) => (angleMode === 'DEG' ? (v * Math.PI) / 180 : v);
  const fromRadians = (v) => (angleMode === 'DEG' ? (v * 180) / Math.PI : v);

  const constants = { pi: Math.PI, e: Math.E, ans: answer };

  const functions = {
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

  const assertFinite = (value) => {
    if (!isFiniteNumber(value)) throw new Error('Result is not a real number');
    return value;
  };

  const parseExpression = () => parseAddSub();

  const parseAddSub = () => {
    let value = parseMulDiv();
    while (peek()?.value === '+' || peek()?.value === '-') {
      const operator = take().value;
      const right = parseMulDiv();
      value = assertFinite(operator === '+' ? value + right : value - right);
    }
    return value;
  };

  const parseMulDiv = () => {
    let value = parseUnary();
    while (true) {
      const token = peek();
      if (token?.value === '*' || token?.value === '/' || token?.value === '%') {
        const operator = take().value;
        const right = parseUnary();
        if (operator === '/' && right === 0) throw new Error('Cannot divide by zero');
        if (operator === '*') value = assertFinite(value * right);
        else if (operator === '/') value = assertFinite(value / right);
        else value = assertFinite(value % right);
      } else if (isPrimaryStart(token)) {
        value = assertFinite(value * parseUnary());
      } else {
        return value;
      }
    }
  };

  const parseUnary = () => {
    if (peek()?.value === '+' || peek()?.value === '-') {
      const operator = take().value;
      const value = parseUnary();
      return operator === '-' ? -value : value;
    }

    let value = parsePower();

    while (peek()?.value === '!') {
      take();
      if (!Number.isInteger(value) || value < 0 || value > 170) {
        throw new Error('Factorial needs an integer from 0 to 170');
      }
      let factorial = 1;
      for (let i = 2; i <= value; i += 1) factorial *= i;
      value = factorial;
    }

    // Percentage postfix — applies only when the following token isn't a number
    // (in which case '%' is treated as modulo in parseMulDiv).
    if (peek()?.value === '%') {
      const next = tokens[position + 1]?.value;
      const nextIsPctContext =
        next === undefined ||
        next === '%' || next === ')' || next === ',' ||
        next === '+' || next === '-' || next === '*' || next === '/' || next === '^';
      if (nextIsPctContext) {
        take();
        value /= 100;
      }
    }

    return assertFinite(value);
  };

  const parsePower = () => {
    let value = parsePrimary();
    if (peek()?.value === '^') {
      take();
      value = assertFinite(Math.pow(value, parseUnary()));
    }
    return value;
  };

  const parsePrimary = () => {
    const token = take();
    if (!token) throw new Error('Incomplete expression');
    if (token.type === 'number') return token.value;
    if (token.type === '(') {
      const value = parseExpression();
      if (take()?.type !== ')') throw new Error('Missing closing parenthesis');
      return value;
    }
    if (token.type === 'identifier') {
      if (Object.hasOwn(constants, token.value)) return constants[token.value];
      if (!FUNCTIONS.has(token.value) || peek()?.type !== '(') {
        throw new Error(`Unknown function: ${token.value}`);
      }
      take();
      const args = [];
      if (peek()?.type !== ')') {
        args.push(parseExpression());
        while (peek()?.type === ',') {
          take();
          args.push(parseExpression());
        }
      }
      if (take()?.type !== ')') throw new Error('Missing closing parenthesis');

      const isVarArg = token.value === 'min' || token.value === 'max';
      const expected = token.value === 'pow' ? 2 : 1;
      if (isVarArg ? args.length < 1 : args.length !== expected) {
        throw new Error(`${token.value} has the wrong number of arguments`);
      }
      return assertFinite(functions[token.value](...args));
    }
    throw new Error('Unexpected token');
  };

  if (!tokens.length) throw new Error('Enter an expression');
  const result = assertFinite(parseExpression());
  if (position !== tokens.length) throw new Error('Check the expression');
  return result;
}

const formatResult = (value) => {
  if (!isFiniteNumber(value)) return 'Error';
  if (Math.abs(value) >= 1e12 || (Math.abs(value) > 0 && Math.abs(value) < 1e-9)) {
    return value.toExponential(8);
  }
  return Number(value.toPrecision(12)).toString();
};

/* ============================================================
 * Button layout
 * ============================================================ */
const buttonGroups = {
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

/* ============================================================
 * Component
 * ============================================================ */
export default function Calculator() {
  const { USER_ID, t } = useContext(AppContext);

  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('0');
  const [angleMode, setAngleMode] = useState(
    () => localStorage.getItem(getAngleKey(USER_ID)) || 'DEG'
  );
  const [memory, setMemory] = useState(() => {
    const raw = Number(localStorage.getItem(getMemoryKey(USER_ID)));
    return Number.isFinite(raw) ? raw : 0;
  });
  const [answer, setAnswer] = useState(0);
  const [history, setHistory] = useState(() => {
    const stored = safeReadJson(getHistoryKey(USER_ID), []);
    return Array.isArray(stored) ? stored.map(normalizeHistoryItem).filter(Boolean) : [];
  });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [showScientific, setShowScientific] = useState(() => (
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 641px)').matches
  ));

  const copyTimeoutRef = useRef(null);

  /* ---------------- Responsive scientific panel ---------------- */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 641px)');
    const sync = () => setShowScientific(mq.matches);
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  /* ---------------- Reload history / memory / angle on USER_ID change ---------------- */
  const syncUserScopedStorage = useCallback(() => {
    const stored = safeReadJson(getHistoryKey(USER_ID), []);
    setHistory(Array.isArray(stored) ? stored.map(normalizeHistoryItem).filter(Boolean) : []);

    const rawMem = Number(localStorage.getItem(getMemoryKey(USER_ID)));
    setMemory(Number.isFinite(rawMem) ? rawMem : 0);

    const storedAngle = localStorage.getItem(getAngleKey(USER_ID));
    if (storedAngle === 'DEG' || storedAngle === 'RAD') setAngleMode(storedAngle);
  }, [USER_ID]);

  useEffect(() => {
    const frame = requestAnimationFrame(syncUserScopedStorage);
    return () => cancelAnimationFrame(frame);
  }, [syncUserScopedStorage]);

  /* ---------------- Persist angle mode ---------------- */
  useEffect(() => {
    localStorage.setItem(getAngleKey(USER_ID), angleMode);
  }, [USER_ID, angleMode]);

  /* ---------------- Sync pending + fetch remote ---------------- */
  useEffect(() => {
    if (!USER_ID) return undefined;
    let active = true;

    const run = async () => {
      const pendingKey = getPendingKey(USER_ID);
      const pending = safeReadJson(pendingKey, []);
      const remaining = [];

      for (const item of pending) {
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
          remaining.push(item);
        }
      }

      if (!active) return;

      if (remaining.length) safeWriteJson(pendingKey, remaining);
      else localStorage.removeItem(pendingKey);

      // Mark any uploaded items as synced in history
      if (remaining.length !== pending.length) {
        const uploadedIds = new Set(
          pending.filter((p) => !remaining.some((r) => r.clientId === p.clientId))
            .map((p) => p.clientId)
        );
        setHistory((current) => {
          const next = current.map((h) =>
            uploadedIds.has(h.clientId) ? { ...h, synced: true } : h
          );
          safeWriteJson(getHistoryKey(USER_ID), next);
          return next;
        });
      }

      try {
        const remote = (await api.getCalculations(USER_ID))
          .map(normalizeHistoryItem)
          .filter(Boolean);
        if (!active) return;

        const remoteIds = new Set(remote.map((r) => r.clientId));
        const stillPending = remaining
          .filter((r) => !remoteIds.has(r.clientId))
          .map((r) => ({ ...r, synced: false }));

        const merged = [...remote, ...stillPending]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, MAX_HISTORY);

        setHistory(merged);
        safeWriteJson(getHistoryKey(USER_ID), merged);
      } catch {
        // Merge, don't replace — keep previously synced items visible.
        if (!active) return;
        setHistory((current) => {
          const ids = new Set(current.map((h) => h.clientId));
          const extra = remaining
            .filter((r) => !ids.has(r.clientId))
            .map((r) => ({ ...r, synced: false }));
          const next = [...current, ...extra]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, MAX_HISTORY);
          safeWriteJson(getHistoryKey(USER_ID), next);
          return next;
        });
        if (remaining.length) {
          setError('Some calculations are waiting to sync with the database.');
        }
      }
    };

    run();
    return () => { active = false; };
  }, [USER_ID]);

  /* ---------------- Preview ---------------- */
  const preview = useMemo(() => {
    if (!expression.trim()) return '';
    try { return formatResult(evaluateExpression(expression, { angleMode, answer })); }
    catch { return ''; }
  }, [angleMode, answer, expression]);

  /* ---------------- Append ---------------- */
  const append = useCallback((value) => {
    setExpression((current) => {
      if (value === ')') {
        const open = (current.match(/\(/g) || []).length;
        const close = (current.match(/\)/g) || []).length;
        if (close >= open) return current;
      }
      return current === '0' ? value : current + value;
    });
    setError('');
  }, []);

  /* ---------------- Calculate ---------------- */
  const calculate = useCallback(() => {
    if (!expression.trim()) return;
    try {
      const numericResult = evaluateExpression(expression, { angleMode, answer });
      const formatted = formatResult(numericResult);
      setResult(formatted);
      setAnswer(numericResult);
      setError('');

      const entry = normalizeHistoryItem({
        clientId: newClientId(),
        expression,
        result: formatted,
        numericResult,
        angleMode,
        timestamp: new Date().toISOString(),
        synced: false,
      });

      setHistory((current) => {
        const next = [entry, ...current].slice(0, MAX_HISTORY);
        safeWriteJson(getHistoryKey(USER_ID), next);
        return next;
      });

      if (USER_ID) {
        api.saveCalculation({
          userId: USER_ID,
          client_id: entry.clientId,
          expression: entry.expression,
          result: entry.result,
          numeric_result: entry.numericResult,
          angle_mode: entry.angleMode,
        })
          .then(() => {
            setHistory((current) => {
              const next = current.map((h) =>
                h.clientId === entry.clientId ? { ...h, synced: true } : h
              );
              safeWriteJson(getHistoryKey(USER_ID), next);
              return next;
            });
          })
          .catch(() => {
            const pendingKey = getPendingKey(USER_ID);
            const pending = safeReadJson(pendingKey, []);
            if (!pending.some((p) => p.clientId === entry.clientId)) {
              const next = [...pending, entry].slice(-MAX_HISTORY);
              safeWriteJson(pendingKey, next);
            }
            setError('Calculation saved locally and queued for database sync.');
          });
      }
    } catch (err) {
      setError(err.message || 'Unable to calculate');
      setResult('Error');
    }
  }, [USER_ID, angleMode, answer, expression]);

  /* ---------------- Keyboard ---------------- */
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const isInput =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isInput) return;

      if (/^[0-9.+*/^%(),-]$/.test(event.key)) append(event.key);
      else if (event.key === 'Enter' || event.key === '=') calculate();
      else if (event.key === 'Backspace') setExpression((c) => c.slice(0, -1));
      else if (event.key === 'Escape') { setExpression(''); setResult('0'); setError(''); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [append, calculate]);

  /* ---------------- Clear ---------------- */
  const clear = () => { setExpression(''); setResult('0'); setError(''); };
  const clearEntry = () => { setExpression(''); setError(''); };

  const clearHistory = useCallback(async () => {
    if (isClearing) return;
    setIsClearing(true);
    if (USER_ID) {
      try {
        await api.clearCalculations(USER_ID);
      } catch {
        setError('Could not clear database history. Please try again.');
        setIsClearing(false);
        return;
      }
      localStorage.removeItem(getPendingKey(USER_ID));
    }
    setHistory([]);
    localStorage.removeItem(getHistoryKey(USER_ID));
    setError('');
    setIsClearing(false);
  }, [USER_ID, isClearing]);

  /* ---------------- Memory ---------------- */
  const handleMemory = useCallback((action) => {
    const numericValue = Number(result);
    if (!isFiniteNumber(numericValue) && action !== 'clear') {
      setError('Cannot perform memory operation on non‑finite result.');
      return;
    }
    let next;
    switch (action) {
      case 'clear': next = 0; break;
      case 'store': next = numericValue; break;
      case 'add': next = memory + numericValue; break;
      case 'subtract': next = memory - numericValue; break;
      default: next = memory;
    }
    setMemory(next);
    localStorage.setItem(getMemoryKey(USER_ID), String(next));
    setError('');
  }, [USER_ID, memory, result]);

  /* ---------------- Copy ---------------- */
  const copyResult = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      setError('Clipboard access is unavailable');
    }
  }, [result]);

  useEffect(() => () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  }, []);

  /* ---------------- Delete history entry ---------------- */
  const deleteHistoryItem = useCallback(async (item) => {
    setHistory((current) => {
      const filtered = current.filter((h) => h.clientId !== item.clientId);
      safeWriteJson(getHistoryKey(USER_ID), filtered);
      return filtered;
    });

    if (item.synced && USER_ID) {
      try {
        await api.deleteCalculation(USER_ID, item.clientId);
      } catch {
        setError('Failed to delete from server, but removed locally.');
      }
    } else {
      const pendingKey = getPendingKey(USER_ID);
      const pending = safeReadJson(pendingKey, []);
      const filtered = pending.filter((p) => p.clientId !== item.clientId);
      safeWriteJson(pendingKey, filtered);
    }
  }, [USER_ID]);

  /* ============================================================
   * Render
   * ============================================================ */
  return (
    <div className="island-page calculator-page">
      <header className="island-header glass-sm calculator-page-header">
        <div className="ih-left">
          <div className="ih-titles">
            <h1>{t?.('calculator_title') || 'Scientific Calculator'}</h1>
            <p>{t?.('calculator_subtitle') || 'Fast, precise calculations for everyday decisions.'}</p>
          </div>
        </div>
        <div className="calculator-header-badge">
          <Sparkles size={15} /> {t?.('precision_tools') || 'Precision tools'}
        </div>
      </header>

      <div className="calculator-shell">
        <section className="calculator-main glass" aria-label="Scientific calculator">
          <div className="calculator-display">
            <div className="calculator-display-top">
              <span>{angleMode} {t?.('mode') || 'mode'}</span>
              <span><Keyboard size={13} /> {t?.('keyboard_ready') || 'Keyboard ready'}</span>
            </div>
            <div className="calculator-expression" aria-label="Current expression">
              {expression || '0'}
            </div>
            <div className="calculator-result-row">
              <strong aria-live="polite" aria-atomic="true">{result}</strong>
              <button
                type="button"
                className="calculator-copy"
                onClick={copyResult}
                aria-label="Copy result"
                title="Copy result"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            {preview && preview !== result && (
              <div className="calculator-preview">= {preview}</div>
            )}
            {error && <p className="calculator-error" role="alert">{error}</p>}
          </div>

          <div className="calculator-toolbar">
            <button type="button" className="calculator-tool" onClick={() => handleMemory('clear')} aria-label="Memory clear">MC</button>
            <button type="button" className="calculator-tool" onClick={() => append(String(memory))} aria-label="Memory recall">MR</button>
            <button type="button" className="calculator-tool" onClick={() => handleMemory('add')} aria-label="Memory add">M+</button>
            <button type="button" className="calculator-tool" onClick={() => handleMemory('subtract')} aria-label="Memory subtract">M−</button>
            <button type="button" className="calculator-tool" onClick={() => handleMemory('store')} aria-label="Memory store">MS</button>
            <span className="calculator-memory-status">M {formatResult(memory)}</span>
            <button
              type="button"
              className="calculator-angle"
              onClick={() => setAngleMode((m) => (m === 'DEG' ? 'RAD' : 'DEG'))}
            >
              {angleMode}
            </button>
          </div>

          <div className="calculator-keypad">
            <button
              type="button"
              className="calculator-functions-toggle"
              aria-expanded={showScientific}
              aria-controls="scientific-panel"
              onClick={() => setShowScientific((v) => !v)}
            >
              <span><Sparkles size={14} /> Scientific functions</span>
              <ChevronDown size={16} />
            </button>
            <div
              id="scientific-panel"
              className={`calculator-scientific-panel ${showScientific ? 'is-open' : ''}`}
            >
              <div className="calculator-scientific-grid">
                {buttonGroups.scientific.map(([value, label]) => (
                  <button
                    type="button"
                    key={label}
                    className="calculator-key scientific"
                    onClick={() => append(value)}
                    aria-label={label}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="calculator-basic-panel">
              <div className="calculator-basic-grid">
                {buttonGroups.basic.map(([value, label, action]) => {
                  let clickHandler = () => append(value);
                  if (action === 'clearEntry') clickHandler = clearEntry;
                  else if (action === 'clear') clickHandler = clear;
                  else if (action === 'backspace') clickHandler = () => setExpression((c) => c.slice(0, -1));
                  else if (action === 'calculate') clickHandler = calculate;

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
            <Clock3 size={14} /> {t?.('calculator_hint') || 'Use parentheses for clarity, and press Enter to calculate.'}
          </p>
        </section>

        <aside className="calculator-history glass" aria-label="Calculation history">
          <div className="calculator-history-heading">
            <div>
              <span className="calculator-eyebrow">
                <History size={14} /> {t?.('recent_work') || 'Recent work'}
              </span>
              <h2>{t?.('history') || 'History'}</h2>
            </div>
            <button
              type="button"
              className="calculator-icon-button"
              onClick={clearHistory}
              disabled={isClearing || history.length === 0}
              aria-label="Clear calculation history"
              title="Clear history"
            >
              {isClearing ? <Clock3 size={16} /> : <Trash2 size={16} />}
            </button>
          </div>

          {history.length === 0 ? (
            <div className="calculator-empty-history">
              <CalculatorIcon size={28} />
              <p>{t?.('calculator_empty') || 'Your calculations will appear here.'}</p>
              <span>{t?.('calculator_stored') || 'Results are securely stored for your account.'}</span>
            </div>
          ) : (
            <div className="calculator-history-list">
              {history.map((item, index) => (
                <div key={`${item.clientId}-${index}`} className="calculator-history-item-wrapper">
                  <button
                    type="button"
                    className="calculator-history-item"
                    onClick={() => {
                      setExpression(item.expression);
                      setResult(item.result);
                      setAngleMode(item.angleMode || 'DEG');
                      setAnswer(isFiniteNumber(item.numericResult) ? item.numericResult : 0);
                      setError('');
                    }}
                    aria-label={`Restore calculation: ${item.expression} = ${item.result}`}
                  >
                    <span>
                      {item.expression}{' '}
                      {!item.synced && (
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
                    onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item); }}
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