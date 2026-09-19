// d3-tilt.js
export function initTilt(root = typeof document !== 'undefined' ? document : null) {
  if (typeof window === 'undefined' || !root) return;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
  if (reduce || noHover) return;

  const MAX = 12; // degrees

  const attach = (el) => {
    if (!el || el.__tiltBound) return;
    el.__tiltBound = true;

    let raf = 0;
    const onMove = (e) => {
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

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
  };

  root.querySelectorAll('[data-tilt], .bento-tile, .stat-card.glass')
      .forEach(attach);
}

// Auto-init + MutationObserver for dynamically rendered cards
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initTilt());
  } else {
    initTilt();
  }

  if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver(() => initTilt()).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}
