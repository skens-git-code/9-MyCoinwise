/* Quantum Glass interaction runtime.
   Kept module-scoped through the IIFE so it never creates globals. */
const QuantumRuntime = (() => {
  'use strict';

  const CONFIG = Object.freeze({
    revealThreshold: 0.08,
    magneticStrength: 0.12,
    tiltMax: 0,
    frameLimit: 16,
    maxDisplayTime: 4500,
  });

  const AppState = {
    isMobile: false,
    prefersReducedMotion: false,
    currentTheme: 'light',
  };

  const Storage = Object.freeze({
    get(key, fallback = null) {
      try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* Private browsing safe */ }
    },
  });

  const Utils = Object.freeze({
    throttle(fn, limit = CONFIG.frameLimit) {
      let lastRun = 0;
      let timeoutId;
      return (...args) => {
        const now = performance.now();
        const remaining = limit - (now - lastRun);
        if (remaining <= 0) {
          clearTimeout(timeoutId);
          lastRun = now;
          fn(...args);
        } else if (!timeoutId) {
          timeoutId = setTimeout(() => {
            timeoutId = null;
            lastRun = performance.now();
            fn(...args);
          }, remaining);
        }
      };
    },
    escapeHtml(value) {
      const node = document.createElement('div');
      node.textContent = String(value ?? '');
      return node.innerHTML;
    },
  });

  class AnimationManager {
    constructor(root) {
      this.root = root;
      this.observer = null;
    }

    init() {
      const targets = this.root.querySelectorAll('.fade-in, .stagger-animation, [data-reveal]');
      if (!targets.length) return;
      if (AppState.prefersReducedMotion || !('IntersectionObserver' in window)) {
        targets.forEach((element) => element.classList.add('is-visible'));
        return;
      }
      this.observer = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, { threshold: CONFIG.revealThreshold });
      targets.forEach((element) => this.observer.observe(element));
    }

    destroy() { this.observer?.disconnect(); }
  }

  class InteractiveElementsManager {
    constructor(root) {
      this.root = root;
      this.cleanups = [];
      this.tiltElements = [];
    }

    init() {
      if (AppState.prefersReducedMotion || AppState.isMobile) return;
      this.initMagneticLinks();
      this.initTiltElements();
    }

    initMagneticLinks() {
      this.root.querySelectorAll('[data-magnetic], .inav-item').forEach((element) => {
        const onMove = Utils.throttle((event) => {
          const rect = element.getBoundingClientRect();
          const x = (event.clientX - (rect.left + rect.width / 2)) * CONFIG.magneticStrength;
          const y = (event.clientY - (rect.top + rect.height / 2)) * CONFIG.magneticStrength;
          element.style.setProperty('--magnetic-x', `${x}px`);
          element.style.setProperty('--magnetic-y', `${y}px`);
          element.classList.add('is-magnetic');
        });
        const reset = () => {
          element.style.removeProperty('--magnetic-x');
          element.style.removeProperty('--magnetic-y');
          element.classList.remove('is-magnetic');
        };
        element.addEventListener('mousemove', onMove, { passive: true });
        element.addEventListener('mouseleave', reset, { passive: true });
        this.cleanups.push(() => {
          element.removeEventListener('mousemove', onMove);
          element.removeEventListener('mouseleave', reset);
        });
      });
    }

    initTiltElements() {
      this.root.querySelectorAll('[data-tilt], .interactive-card').forEach((element) => {
        const onMove = Utils.throttle((event) => {
          const rect = element.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
          const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
          element.style.setProperty('--mouse-x', `${(x + 1) * 50}%`);
          element.style.setProperty('--mouse-y', `${(y + 1) * 50}%`);
          element.style.transform = `perspective(900px) rotateX(${-y * CONFIG.tiltMax}deg) rotateY(${x * CONFIG.tiltMax}deg) translateY(-5px)`;
        });
        const reset = () => { element.style.transform = ''; };
        element.addEventListener('mousemove', onMove, { passive: true });
        element.addEventListener('mouseleave', reset, { passive: true });
        this.cleanups.push(() => {
          element.removeEventListener('mousemove', onMove);
          element.removeEventListener('mouseleave', reset);
          element.style.transform = '';
        });
      });
    }

    destroy() { this.cleanups.splice(0).forEach((cleanup) => cleanup()); }
  }

  class CommandPaletteManager {
    constructor(root) {
      this.root = root;
      this.palette = null;
      this.onKeyDown = this.onKeyDown.bind(this);
    }

    init() {
      window.addEventListener('keydown', this.onKeyDown);
    }

    onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.toggle();
      }
      if (event.key === 'Escape' && this.palette) this.close();
    }

    toggle() { this.palette ? this.close() : this.open(); }

    open() {
      const commands = [
        { label: 'Go to Dashboard', action: () => this.navigate('/') },
        { label: 'View Transactions', action: () => this.navigate('/transactions') },
        { label: 'Open Analytics', action: () => this.navigate('/analytics') },
        { label: 'Open Settings', action: () => this.navigate('/settings') },
      ];
      this.palette = document.createElement('div');
      this.palette.className = 'quantum-command-palette';
      this.palette.setAttribute('role', 'dialog');
      this.palette.setAttribute('aria-label', 'Command palette');
      this.palette.innerHTML = `<div class="quantum-command-box"><input autofocus type="search" placeholder="Search commands…" aria-label="Search commands" /><div class="quantum-command-list"></div><p class="quantum-command-hint">Press <kbd>Esc</kbd> to close</p></div>`;
      this.root.appendChild(this.palette);
      const input = this.palette.querySelector('input');
      const list = this.palette.querySelector('.quantum-command-list');
      const render = () => {
        const query = input.value.toLowerCase();
        list.replaceChildren(...commands.filter(({ label }) => label.toLowerCase().includes(query)).map(({ label, action }) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.addEventListener('click', action, { once: true });
          return button;
        }));
      };
      input.addEventListener('input', render);
      this.palette.addEventListener('click', (event) => { if (event.target === this.palette) this.close(); });
      render();
      input.focus();
    }

    navigate(path) {
      this.close();
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }

    close() { this.palette?.remove(); this.palette = null; }
    destroy() { window.removeEventListener('keydown', this.onKeyDown); this.close(); }
  }

  class QuantumRuntimeInstance {
    constructor(root) {
      this.root = root;
      this.animation = new AnimationManager(root);
      this.interactive = new InteractiveElementsManager(root);
      this.commands = new CommandPaletteManager(root);
    }

    init() {
      AppState.isMobile = window.matchMedia('(max-width: 768px)').matches;
      AppState.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const themeRoot = this.root.querySelector?.('.app-island-layout') || this.root.documentElement || this.root;
      const storedTheme = themeRoot.dataset?.theme || Storage.get('mcw-theme', 'light');
      AppState.currentTheme = storedTheme === 'amoled' ? 'amoled' : 'light';
      this.animation.init();
      this.interactive.init();
      this.commands.init();
      return this;
    }

    destroy() {
      this.animation.destroy();
      this.interactive.destroy();
      this.commands.destroy();
    }
  }

  return { create: (root = document) => new QuantumRuntimeInstance(root).init(), CONFIG, AppState, Storage, Utils };
})();

export default QuantumRuntime;
