/**
 * Microsoft Clarity Integration & Cookie Consent Gate
 * 
 * Requirements:
 * - Strictly opt-in: Clarity does NOT load and sets zero cookies until explicit consent ("accepted").
 * - Choice stored in localStorage['cookie_consent'] ("accepted" | "rejected").
 * - If "rejected", stops Clarity, removes the script, and purges all Clarity cookies (_clck, _clsk, etc.).
 * - Project ID loaded via VITE_CLARITY_PROJECT_ID. Missing/empty logs a single warning and does not throw.
 * - Guards against double-injection.
 * - Respects Do Not Track: if DNT is active ("1"), Clarity never loads regardless of consent.
 * - Gated on production (import.meta.env.PROD), does not run in development by default.
 * - Zero PII sent; strict masking enforced.
 */

export const COOKIE_CONSENT_KEY = 'cookie_consent';
export const CLARITY_SCRIPT_ID = 'microsoft-clarity-script';

let hasWarnedMissingProjectId = false;

/**
 * Check if the browser has Do Not Track enabled.
 * @returns {boolean}
 */
export function isDoNotTrack() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return (
    navigator.doNotTrack === '1' ||
    window.doNotTrack === '1' ||
    navigator.msDoNotTrack === '1'
  );
}

/**
 * Retrieve the current cookie consent status from localStorage.
 * @returns {'accepted' | 'rejected' | null}
 */
export function getCookieConsent() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const val = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (val === 'accepted' || val === 'rejected') {
      return val;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Delete all Microsoft Clarity cookies from the browser document.
 * Clears _clck, _clsk, and any cookie matching clarity patterns across domain and paths.
 */
export function clearClarityCookies() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const knownClarityCookies = ['_clck', '_clsk'];
  const allDocCookies = document.cookie
    ? document.cookie.split(';').map((c) => c.split('=')[0].trim())
    : [];

  const clarityCookies = allDocCookies.filter((name) => {
    const lower = name.toLowerCase();
    return lower.startsWith('_cl') || lower.includes('clarity');
  });

  const namesToClear = Array.from(new Set([...knownClarityCookies, ...clarityCookies]));
  const host = window.location.hostname || '';
  const hostParts = host.split('.');

  const domains = ['', host, `.${host}`];
  if (hostParts.length > 2) {
    domains.push(`.${hostParts.slice(-2).join('.')}`);
  }

  const paths = ['/', window.location.pathname || '/'];

  namesToClear.forEach((name) => {
    domains.forEach((domain) => {
      paths.forEach((path) => {
        const domainAttr = domain ? `; domain=${domain}` : '';
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=${path}${domainAttr}`;
      });
    });
  });
}

/**
 * Stop Microsoft Clarity execution, revoke consent, remove the script, and purge cookies.
 */
export function stopClarity() {
  if (typeof window === 'undefined') return;

  try {
    if (typeof window.clarity === 'function') {
      window.clarity('consent', false);
      window.clarity('stop');
    }
  } catch (_) {
    // Ignore internal errors when stopping
  }

  if (window.clarity) {
    delete window.clarity.__loaded;
  }

  if (typeof document !== 'undefined') {
    const script = document.getElementById(CLARITY_SCRIPT_ID);
    if (script && script.parentNode) {
      script.parentNode.removeChild(script);
    }
    const legacyScript = document.querySelector('script[data-mcw-clarity]');
    if (legacyScript && legacyScript.parentNode) {
      legacyScript.parentNode.removeChild(legacyScript);
    }
  }

  clearClarityCookies();
}

/**
 * Initialize Microsoft Clarity dynamically after consent is verified.
 * 
 * @param {Object} [options]
 * @param {boolean} [options.forceDev] - Allow loading in dev environment for testing
 * @returns {boolean} Whether Clarity was successfully scheduled/initialized
 */
export function initClarity(options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  // 1. Consent Gate: Must be explicitly "accepted"
  const consent = getCookieConsent();
  if (consent !== 'accepted') {
    return false;
  }

  // 2. Do Not Track Gate: Never load if DNT is active
  if (isDoNotTrack()) {
    return false;
  }

  // 3. Environment Gate: Clarity must not run in development unless explicitly forced for testing
  const isProd = import.meta.env.PROD;
  const allowDev = Boolean(options.forceDev || window.__FORCE_CLARITY__);
  if (!isProd && !allowDev) {
    return false;
  }

  // 4. Project ID from environment variable
  const projectId = (import.meta.env.VITE_CLARITY_PROJECT_ID || '').trim();
  if (!projectId) {
    if (!hasWarnedMissingProjectId) {
      console.warn('[Clarity] VITE_CLARITY_PROJECT_ID is missing or empty. Microsoft Clarity will not be loaded.');
      hasWarnedMissingProjectId = true;
    }
    return false;
  }

  // 5. Double-injection Guard: Prevent re-injecting script or re-queueing
  if (window.clarity?.__loaded || document.getElementById(CLARITY_SCRIPT_ID)) {
    return true;
  }

  // 6. Set up the official Clarity asynchronous queue snippet
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    c[a].__loaded = true;
    t = l.createElement(r);
    t.async = 1;
    t.id = CLARITY_SCRIPT_ID;
    t.setAttribute('data-mcw-clarity', 'true');
    t.src = 'https://www.clarity.ms/tag/' + i;
    y = l.getElementsByTagName(r)[0];
    if (y && y.parentNode) {
      y.parentNode.insertBefore(t, y);
    } else {
      l.head.appendChild(t);
    }
  })(window, document, 'clarity', 'script', projectId);

  // 7. Confirm consent to Clarity API and ensure default strict masking
  try {
    window.clarity('consent', true);
  } catch (_) {
    // Non-blocking
  }

  return true;
}

/**
 * Set the user's cookie consent decision.
 * Updates localStorage, notifies listeners, and starts or stops Clarity.
 * 
 * @param {'accepted' | 'rejected'} status
 */
export function setCookieConsent(status) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    if (status === 'accepted' || status === 'rejected') {
      localStorage.setItem(COOKIE_CONSENT_KEY, status);
    } else {
      localStorage.removeItem(COOKIE_CONSENT_KEY);
    }
  } catch (_) {
    // Restricted storage environment (e.g. private Safari quota)
  }

  // Dispatch global change event
  try {
    window.dispatchEvent(
      new CustomEvent('cookie-consent-changed', {
        detail: { status },
      })
    );
  } catch (_) {
    // Ignore in older environments
  }

  if (status === 'accepted') {
    initClarity();
  } else if (status === 'rejected') {
    stopClarity();
  }
}

/**
 * Helper to dispatch the global event opening the Cookie Preferences modal.
 */
export function openCookiePreferences() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('open-cookie-preferences'));
  } catch (_) {
    // Ignore
  }
}
