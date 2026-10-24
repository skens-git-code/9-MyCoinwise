import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initContentProtection,
  cleanupContentProtection,
  isAllowlistedElement,
} from '../utils/contentProtection.js';
import {
  rafThrottle,
  debounce,
  onPagePause,
  onPageResume,
  initPerformanceOptimizer,
} from '../utils/performanceOptimizer.js';

describe('Content Protection & Anti-Copy System', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="root">
        <header class="app-header">
          <h1>Coinwise Finance</h1>
        </header>
        <main class="page-content">
          <p id="protected-text">Proprietary financial analysis and metrics.</p>
          <img id="protected-img" src="/favicon.svg" alt="logo" />
          
          <div id="allow-box" class="allow-copy">
            <p id="allowed-quote">"Disciplina · Execução · Foco"</p>
          </div>

          <div id="allow-attr-box" data-allow-copy="true">
            <span id="allowed-code">TXN_998248</span>
          </div>

          <form id="test-form">
            <input id="test-input" type="text" value="editable input text" />
            <textarea id="test-textarea">editable textarea text</textarea>
            <select id="test-select">
              <option value="1">USD</option>
            </select>
          </form>

          <button id="share-btn" type="button">Share Summary</button>
        </main>
      </div>
    `;
    initContentProtection();
  });

  afterEach(() => {
    cleanupContentProtection();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('correctly identifies allowlisted elements and form controls', () => {
    const input = document.getElementById('test-input');
    const textarea = document.getElementById('test-textarea');
    const select = document.getElementById('test-select');
    const quote = document.getElementById('allowed-quote');
    const code = document.getElementById('allowed-code');
    const shareBtn = document.getElementById('share-btn');
    const protectedText = document.getElementById('protected-text');

    expect(isAllowlistedElement(input)).toBe(true);
    expect(isAllowlistedElement(textarea)).toBe(true);
    expect(isAllowlistedElement(select)).toBe(true);
    expect(isAllowlistedElement(quote)).toBe(true);
    expect(isAllowlistedElement(code)).toBe(true);
    expect(isAllowlistedElement(shareBtn)).toBe(true);
    expect(isAllowlistedElement(protectedText)).toBe(false);
  });

  it('blocks context menu on protected elements but permits it on allowlisted elements and form inputs', () => {
    const protectedText = document.getElementById('protected-text');
    const allowedQuote = document.getElementById('allowed-quote');
    const input = document.getElementById('test-input');

    const protectedEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    protectedText.dispatchEvent(protectedEvent);
    expect(protectedEvent.defaultPrevented).toBe(true);

    const allowedEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    allowedQuote.dispatchEvent(allowedEvent);
    expect(allowedEvent.defaultPrevented).toBe(false);

    const inputEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    input.dispatchEvent(inputEvent);
    expect(inputEvent.defaultPrevented).toBe(false);
  });

  it('blocks dragstart on protected media/elements but allows on allowlisted elements', () => {
    const img = document.getElementById('protected-img');
    const code = document.getElementById('allowed-code');

    const dragImgEvent = new Event('dragstart', { bubbles: true, cancelable: true });
    img.dispatchEvent(dragImgEvent);
    expect(dragImgEvent.defaultPrevented).toBe(true);

    const dragCodeEvent = new Event('dragstart', { bubbles: true, cancelable: true });
    code.dispatchEvent(dragCodeEvent);
    expect(dragCodeEvent.defaultPrevented).toBe(false);
  });

  it('blocks copy & cut events on protected elements but allows them on allowlisted elements and inputs', () => {
    const protectedText = document.getElementById('protected-text');
    const allowedCode = document.getElementById('allowed-code');
    const textarea = document.getElementById('test-textarea');

    const copyProtected = new Event('copy', { bubbles: true, cancelable: true });
    protectedText.dispatchEvent(copyProtected);
    expect(copyProtected.defaultPrevented).toBe(true);

    const copyAllowed = new Event('copy', { bubbles: true, cancelable: true });
    allowedCode.dispatchEvent(copyAllowed);
    expect(copyAllowed.defaultPrevented).toBe(false);

    const cutTextarea = new Event('cut', { bubbles: true, cancelable: true });
    textarea.dispatchEvent(cutTextarea);
    expect(cutTextarea.defaultPrevented).toBe(false);
  });

  it('blocks Ctrl+C and Cmd+C on protected elements but allows on allowlisted elements and inputs', () => {
    const protectedText = document.getElementById('protected-text');
    const allowedQuote = document.getElementById('allowed-quote');
    const input = document.getElementById('test-input');

    // Windows Ctrl+C on protected text
    const ctrlCProtected = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      ctrlKey: true,
    });
    protectedText.dispatchEvent(ctrlCProtected);
    expect(ctrlCProtected.defaultPrevented).toBe(true);

    // Mac Cmd+C on allowlisted quote
    const cmdCAllowed = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      metaKey: true,
    });
    allowedQuote.dispatchEvent(cmdCAllowed);
    expect(cmdCAllowed.defaultPrevented).toBe(false);

    // Input element typing / copying with Ctrl+C
    const ctrlCInput = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      ctrlKey: true,
    });
    input.dispatchEvent(ctrlCInput);
    expect(ctrlCInput.defaultPrevented).toBe(false);
  });

  it('blocks selectstart on protected elements but allows on allowlisted elements', () => {
    const protectedText = document.getElementById('protected-text');
    const allowedQuote = document.getElementById('allowed-quote');

    const selectProtected = new Event('selectstart', { bubbles: true, cancelable: true });
    protectedText.dispatchEvent(selectProtected);
    expect(selectProtected.defaultPrevented).toBe(true);

    const selectAllowed = new Event('selectstart', { bubbles: true, cancelable: true });
    allowedQuote.dispatchEvent(selectAllowed);
    expect(selectAllowed.defaultPrevented).toBe(false);
  });

  it('blocks Ctrl+A / Cmd+A (Select All) globally except within inputs or allowlisted elements', () => {
    const protectedText = document.getElementById('protected-text');
    const input = document.getElementById('test-input');

    const ctrlAProtected = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'a',
      ctrlKey: true,
    });
    protectedText.dispatchEvent(ctrlAProtected);
    expect(ctrlAProtected.defaultPrevented).toBe(true);

    const ctrlAInput = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'a',
      ctrlKey: true,
    });
    input.dispatchEvent(ctrlAInput);
    expect(ctrlAInput.defaultPrevented).toBe(false);
  });

  it('blocks Save Page (Ctrl+S / Cmd+S), Print (Ctrl+P / Cmd+P), and View Source (Ctrl+U / Cmd+U)', () => {
    const saveEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 's',
      ctrlKey: true,
    });
    window.dispatchEvent(saveEvent);
    expect(saveEvent.defaultPrevented).toBe(true);

    const printEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'p',
      metaKey: true,
    });
    window.dispatchEvent(printEvent);
    expect(printEvent.defaultPrevented).toBe(true);

    const viewSourceEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'u',
      ctrlKey: true,
    });
    window.dispatchEvent(viewSourceEvent);
    expect(viewSourceEvent.defaultPrevented).toBe(true);
  });

  it('intercepts F12 and DevTools inspection hotkeys', () => {
    // F12
    const f12Event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'F12',
    });
    window.dispatchEvent(f12Event);
    expect(f12Event.defaultPrevented).toBe(true);

    // Ctrl+Shift+I (Inspect)
    const ctrlShiftI = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'I',
      ctrlKey: true,
      shiftKey: true,
    });
    window.dispatchEvent(ctrlShiftI);
    expect(ctrlShiftI.defaultPrevented).toBe(true);

    // Cmd+Option+I (Mac Inspect)
    const cmdOptionI = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'i',
      metaKey: true,
      altKey: true,
    });
    window.dispatchEvent(cmdOptionI);
    expect(cmdOptionI.defaultPrevented).toBe(true);

    // Ctrl+Shift+J (Console)
    const ctrlShiftJ = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'J',
      ctrlKey: true,
      shiftKey: true,
    });
    window.dispatchEvent(ctrlShiftJ);
    expect(ctrlShiftJ.defaultPrevented).toBe(true);

    // Ctrl+Shift+C (Inspect Element)
    const ctrlShiftC = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'C',
      ctrlKey: true,
      shiftKey: true,
    });
    window.dispatchEvent(ctrlShiftC);
    expect(ctrlShiftC.defaultPrevented).toBe(true);
  });
});

describe('Full-Site Performance Optimizer', () => {
  it('rafThrottle coalesces multiple rapid invocations into a single frame', async () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const throttled = rafThrottle(spy);

    throttled(1);
    throttled(2);
    throttled(3);

    expect(spy).not.toHaveBeenCalled();

    // Advance animation frame
    vi.runAllTimers();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(3);

    vi.useRealTimers();
  });

  it('debounce delays execution until calls settle', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced('a');
    debounced('b');
    debounced('c');

    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('c');

    vi.useRealTimers();
  });

  it('Page Visibility API manages pause and resume callbacks and page-hidden class', () => {
    const pauseSpy = vi.fn();
    const resumeSpy = vi.fn();

    const unsubPause = onPagePause(pauseSpy);
    const unsubResume = onPageResume(resumeSpy);

    initPerformanceOptimizer();

    // Simulate tab hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.documentElement.classList.contains('page-hidden')).toBe(true);
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    // Simulate tab visible
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.documentElement.classList.contains('page-hidden')).toBe(false);
    expect(resumeSpy).toHaveBeenCalledTimes(1);

    unsubPause();
    unsubResume();
  });
});
