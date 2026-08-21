const CLARITY_PROJECT_ID = 'y60svimjg2';
const CLARITY_SCRIPT_ATTRIBUTE = 'data-mcw-clarity';

export function initClarity() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Keep the queue available even when an ad blocker or a network failure
  // prevents the remote Clarity script from loading.
  const ensureQueue = () => {
    if (typeof window.clarity === 'function') return;
    const pendingCalls = Array.isArray(window.clarity?.q) ? window.clarity.q : [];
    const clarityQueue = (...args) => {
      clarityQueue.q = clarityQueue.q || [];
      clarityQueue.q.push(args);
    };
    clarityQueue.q = pendingCalls;
    window.clarity = clarityQueue;
  };
  ensureQueue();

  const existingScript = document.querySelector(`script[${CLARITY_SCRIPT_ATTRIBUTE}]`);
  if (existingScript) {
    existingScript.addEventListener('load', ensureQueue, { once: true });
    existingScript.addEventListener('error', ensureQueue, { once: true });
    window.setTimeout(ensureQueue, 2000);
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
  script.setAttribute(CLARITY_SCRIPT_ATTRIBUTE, 'true');
  script.addEventListener('load', ensureQueue, { once: true });
  script.addEventListener('error', ensureQueue, { once: true });
  document.head.appendChild(script);
  window.setTimeout(ensureQueue, 2000);
}
