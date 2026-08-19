import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Calculator as CalculatorIcon, Check, Clock3, Copy, Delete,
  History, Keyboard, MemoryStick, Sparkles, Trash2
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { api } from '../services/api';

const HISTORY_KEY = 'mycoinwise-calculator-history';
const PENDING_KEY = 'mycoinwise-calculator-pending';
const MEMORY_KEY = 'mycoinwise-calculator-memory';
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'sqrt', 'cbrt', 'abs', 'exp', 'floor', 'ceil', 'round', 'pow', 'min', 'max'
]);

const isFiniteNumber = (value) => Number.isFinite(value);
const getHistoryKey = (userId) => `${HISTORY_KEY}:${userId || 'guest'}`;
const getPendingKey = (userId) => `${PENDING_KEY}:${userId || 'guest'}`;
const newClientId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const normalizeHistoryItem = (item) => ({
  id: item.id || item._id || item.client_id,
  clientId: item.clientId || item.client_id || item.id || item._id,
  expression: item.expression,
  result: item.result,
  numericResult: item.numericResult ?? item.numeric_result,
  angleMode: item.angleMode || item.angle_mode || 'DEG',
  timestamp: item.timestamp || item.created_at || Date.now()
});

function tokenize(expression) {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
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
      tokens.push({ type: char === '(' || char === ')' || char === ',' ? char : 'operator', value: char });
      index += 1;
      continue;
    }
    throw new Error(`Unsupported character: ${char}`);
  }
  return tokens;
}

function evaluateExpression(expression, { angleMode = 'DEG', answer = 0 } = {}) {
  const tokens = tokenize(expression.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('√', 'sqrt'));
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const isPrimaryStart = (token) => token && (token.type === 'number' || token.type === 'identifier' || token.type === '(');
  const toRadians = (value) => angleMode === 'DEG' ? value * Math.PI / 180 : value;
  const fromRadians = (value) => angleMode === 'DEG' ? value * 180 / Math.PI : value;
  const constants = { pi: Math.PI, e: Math.E, ans: answer };
  const functions = {
    sin: (value) => Math.sin(toRadians(value)), cos: (value) => Math.cos(toRadians(value)), tan: (value) => Math.tan(toRadians(value)),
    asin: (value) => fromRadians(Math.asin(value)), acos: (value) => fromRadians(Math.acos(value)), atan: (value) => fromRadians(Math.atan(value)),
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, log: Math.log10, ln: Math.log,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    pow: Math.pow, min: Math.min, max: Math.max
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
        value = assertFinite(operator === '*' ? value * right : operator === '/' ? value / right : value % right);
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
      if (!Number.isInteger(value) || value < 0 || value > 170) throw new Error('Factorial needs an integer from 0 to 170');
      let factorial = 1;
      for (let i = 2; i <= value; i += 1) factorial *= i;
      value = factorial;
    }
    if (peek()?.value === '%' && ['%', ')', ',', '+', '-', '*', '/', '^'].includes(tokens[position + 1]?.value) || (peek()?.value === '%' && !tokens[position + 1])) {
      take();
      value /= 100;
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
      if (!FUNCTIONS.has(token.value) || peek()?.type !== '(') throw new Error(`Unknown function: ${token.value}`);
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
      if ((token.value === 'pow' && args.length !== 2) || (['min', 'max'].includes(token.value) && args.length < 1) || (!['pow', 'min', 'max'].includes(token.value) && args.length !== 1)) {
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
  if (Math.abs(value) >= 1e12 || (Math.abs(value) > 0 && Math.abs(value) < 1e-9)) return value.toExponential(8);
  return Number(value.toPrecision(12)).toString();
};

const buttonGroups = {
  scientific: [
    ['sin(', 'sin'], ['cos(', 'cos'], ['tan(', 'tan'], ['log(', 'log'], ['ln(', 'ln'],
    ['asin(', 'asin'], ['acos(', 'acos'], ['atan(', 'atan'], ['sqrt(', '√'], ['cbrt(', '∛'],
    ['abs(', 'abs'], ['exp(', 'exp'], ['x!', '!'], ['π', 'π'], ['e', 'e']
  ],
  basic: [
    ['7', '7'], ['8', '8'], ['9', '9'], ['/', '÷'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['*', '×'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['-', '−'],
    ['0', '0'], ['.', '.'], ['ans', 'Ans'], ['+', '+'],
    ['%', '%'], ['^', 'xʸ']
  ]
};

export default function Calculator() {
  const { USER_ID } = useContext(AppContext);
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('0');
  const [angleMode, setAngleMode] = useState('DEG');
  const [memory, setMemory] = useState(() => Number(localStorage.getItem(MEMORY_KEY)) || 0);
  const [answer, setAnswer] = useState(0);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(getHistoryKey(USER_ID)) || '[]').map(normalizeHistoryItem); } catch { return []; }
  });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!USER_ID) return undefined;
    let active = true;
    const syncAndLoadHistory = async () => {
      const pendingKey = getPendingKey(USER_ID);
      let pending = [];
      try { pending = JSON.parse(localStorage.getItem(pendingKey) || '[]'); } catch { pending = []; }
      const remaining = [];
      for (const item of pending) {
        try {
          await api.saveCalculation({
            client_id: item.clientId,
            expression: item.expression,
            result: item.result,
            numeric_result: item.numericResult,
            angle_mode: item.angleMode
          });
        } catch { remaining.push(item); }
      }
      if (remaining.length) localStorage.setItem(pendingKey, JSON.stringify(remaining));
      else localStorage.removeItem(pendingKey);

      try {
        const remoteHistory = (await api.getCalculations(USER_ID)).map(normalizeHistoryItem);
        if (!active) return;
        setHistory(remoteHistory);
        localStorage.setItem(getHistoryKey(USER_ID), JSON.stringify(remoteHistory));
      } catch {
        if (active && remaining.length) setError('Some calculations are waiting to sync with the database.');
      }
    };
    syncAndLoadHistory();
    return () => { active = false; };
  }, [USER_ID]);

  const preview = useMemo(() => {
    if (!expression.trim()) return '';
    try { return formatResult(evaluateExpression(expression, { angleMode, answer })); } catch { return ''; }
  }, [angleMode, answer, expression]);

  const append = useCallback((value) => {
    setExpression((current) => {
      if (value === ')') {
        const openCount = (current.match(/\(/g) || []).length;
        const closeCount = (current.match(/\)/g) || []).length;
        if (closeCount >= openCount) return current;
      }
      return current === '0' ? value : current + value;
    });
    setError('');
  }, []);

  const calculate = useCallback(() => {
    if (!expression.trim()) return;
    try {
      const numericResult = evaluateExpression(expression, { angleMode, answer });
      const formatted = formatResult(numericResult);
      setResult(formatted);
      setAnswer(numericResult);
      setError('');
      const entry = normalizeHistoryItem({
        clientId: newClientId(), expression, result: formatted, numericResult, angleMode, timestamp: new Date().toISOString()
      });
      setHistory((current) => {
        const next = [entry, ...current].slice(0, 30);
        localStorage.setItem(getHistoryKey(USER_ID), JSON.stringify(next));
        return next;
      });
      if (USER_ID) {
        api.saveCalculation({
          client_id: entry.clientId,
          expression: entry.expression,
          result: entry.result,
          numeric_result: entry.numericResult,
          angle_mode: entry.angleMode
        }).catch(() => {
          const pendingKey = getPendingKey(USER_ID);
          let pending = [];
          try { pending = JSON.parse(localStorage.getItem(pendingKey) || '[]'); } catch { pending = []; }
          localStorage.setItem(pendingKey, JSON.stringify([...pending, entry].slice(-30)));
          setError('Calculation saved locally and queued for database sync.');
        });
      }
    } catch (calculationError) {
      setError(calculationError.message || 'Unable to calculate');
      setResult('Error');
    }
  }, [USER_ID, angleMode, answer, expression]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement) return;
      if (/^[0-9.+*/^%(),-]$/.test(event.key)) append(event.key);
      else if (event.key === 'Enter' || event.key === '=') calculate();
      else if (event.key === 'Backspace') setExpression((current) => current.slice(0, -1));
      else if (event.key === 'Escape') { setExpression(''); setResult('0'); setError(''); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [append, calculate]);

  const clear = () => { setExpression(''); setResult('0'); setError(''); };
  const clearHistory = async () => {
    if (USER_ID) {
      try {
        await api.clearCalculations(USER_ID);
      } catch {
        setError('Could not clear database history. Please try again.');
        return;
      }
      localStorage.removeItem(getPendingKey(USER_ID));
    }
    setHistory([]);
    localStorage.removeItem(getHistoryKey(USER_ID));
  };
  const handleMemory = (action) => {
    const numericValue = Number(result);
    const next = action === 'clear' ? 0 : action === 'store' ? (isFiniteNumber(numericValue) ? numericValue : memory) : action === 'add' ? memory + numericValue : memory;
    setMemory(next);
    localStorage.setItem(MEMORY_KEY, String(next));
  };
  const copyResult = async () => {
    try { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { setError('Clipboard access is unavailable'); }
  };

  return (
    <div className="island-page calculator-page">
      <header className="island-header glass-sm calculator-page-header">
        <div className="ih-left">
          <div className="ih-titles"><h1>Scientific Calculator</h1><p>Fast, precise calculations for everyday decisions.</p></div>
        </div>
        <div className="calculator-header-badge"><Sparkles size={15} /> Precision tools</div>
      </header>

      <div className="calculator-shell">
        <section className="calculator-main glass" aria-label="Scientific calculator">
          <div className="calculator-display">
            <div className="calculator-display-top"><span>{angleMode} mode</span><span><Keyboard size={13} /> Keyboard ready</span></div>
            <div className="calculator-expression" aria-label="Current expression">{expression || '0'}</div>
            <div className="calculator-result-row"><strong>{result}</strong><button type="button" className="calculator-copy" onClick={copyResult} aria-label="Copy result" title="Copy result">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>
            {preview && preview !== result && <div className="calculator-preview">= {preview}</div>}
            {error && <p className="calculator-error" role="alert">{error}</p>}
          </div>

          <div className="calculator-toolbar">
            <button type="button" className="calculator-tool" onClick={() => handleMemory('clear')}><MemoryStick size={15} /> MC</button>
            <button type="button" className="calculator-tool" onClick={() => append(String(memory))}><MemoryStick size={15} /> MR</button>
            <button type="button" className="calculator-tool" onClick={() => handleMemory('add')}><MemoryStick size={15} /> M+</button>
            <button type="button" className="calculator-tool" onClick={() => handleMemory('store')}><MemoryStick size={15} /> MS</button>
            <span className="calculator-memory-status">M {formatResult(memory)}</span>
            <button type="button" className="calculator-angle" onClick={() => setAngleMode((mode) => mode === 'DEG' ? 'RAD' : 'DEG')}>{angleMode}</button>
          </div>

          <div className="calculator-keypad">
            <div className="calculator-scientific-grid">
              {buttonGroups.scientific.map(([value, label]) => <button type="button" key={label} className="calculator-key scientific" onClick={() => append(value)}>{label}</button>)}
            </div>
            <div className="calculator-basic-grid">
              <button type="button" className="calculator-key utility" onClick={clear}>C</button>
              <button type="button" className="calculator-key utility" onClick={() => setExpression((current) => current.slice(0, -1))}><Delete size={18} /></button>
              <button type="button" className="calculator-key utility" onClick={() => append('(')}>(</button>
              <button type="button" className="calculator-key utility" onClick={() => append(')')}>)</button>
              {buttonGroups.basic.map(([value, label]) => <button type="button" key={`${value}-${label}`} className={`calculator-key ${['/', '*', '-', '+', '^'].includes(value) ? 'operator' : ''}`} onClick={() => append(value)}>{label}</button>)}
              <button type="button" className="calculator-key equals" onClick={calculate}>=</button>
            </div>
          </div>
          <p className="calculator-hint"><Clock3 size={14} /> Use parentheses for clarity, and press Enter to calculate.</p>
        </section>

        <aside className="calculator-history glass" aria-label="Calculation history">
          <div className="calculator-history-heading"><div><span className="calculator-eyebrow"><History size={14} /> Recent work</span><h2>History</h2></div><button type="button" className="calculator-icon-button" onClick={clearHistory} aria-label="Clear calculation history" title="Clear history"><Trash2 size={16} /></button></div>
          {history.length === 0 ? <div className="calculator-empty-history"><CalculatorIcon size={28} /><p>Your calculations will appear here.</p><span>Results are securely stored for your account.</span></div> : <div className="calculator-history-list">{history.map((item, index) => <button type="button" className="calculator-history-item" key={`${item.clientId || item.timestamp}-${index}`} onClick={() => { setExpression(item.expression); setResult(item.result); }}><span>{item.expression}</span><strong>= {item.result}</strong><small>{item.angleMode} · {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></button>)}</div>}
        </aside>
      </div>
    </div>
  );
}
