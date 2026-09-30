// d3-tilt.js
const boundElements = new WeakSet();

export function initTilt(root = typeof document !== 'undefined' ? document : null) {
  if (typeof window === 'undefined' || !root) return;
  if (typeof document !== 'undefined' && document.hidden) return;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  if (reduce || noHover || isMobile) return;

  const MAX = 12; // degrees

  const attach = (el) => {
    if (!el || boundElements.has(el)) return;
    boundElements.add(el);

    let raf = 0;
    const onMove = (e) => {
      if (document.hidden) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--mx', `${px * 100}%`);
        el.style.setProperty('--my', `${py * 100}%`);
        el.style.setProperty('--ry', `${(px - 0.5) * MAX * 2}deg`);
        el.style.setProperty('--rx', `${(0.5 - py) * MAX * 2}deg`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--mx', '50%');
      el.style.setProperty('--my', '50%');
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave, { passive: true });
  };

  root.querySelectorAll('[data-tilt], .bento-tile, .stat-card.glass')
      .forEach(attach);
}

// Auto-init + debounced MutationObserver for dynamically rendered cards
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initTilt(), { once: true });
  } else {
    initTilt();
  }

  if (typeof MutationObserver !== 'undefined' && document.body) {
    let pendingRaf = 0;
    const observer = new MutationObserver(() => {
      if (pendingRaf) return;
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = 0;
        initTilt();
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
  }
}
