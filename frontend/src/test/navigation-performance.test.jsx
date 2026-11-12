import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  preloadRoute,
  getPrefetchHandlers,
  clearPrefetchCache,
  isRoutePrefetched,
  routeLoaders,
} from '../utils/routePrefetch';
import NavigationProgressBar from '../components/NavigationProgressBar';
import ScrollToTop from '../components/ScrollToTop';
import { queryClient as appQueryClient } from '../lib/queryClient';

describe('Navigation & UI Performance', () => {
  beforeEach(() => {
    clearPrefetchCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('routePrefetch', () => {
    it('deduplicates route preloads and normalizes query/hash/trailing slash', () => {
      const spy = vi.spyOn(routeLoaders, '/transactions').mockResolvedValue({});

      expect(isRoutePrefetched('/transactions')).toBe(false);
      preloadRoute('/transactions/?filter=food#top');
      expect(isRoutePrefetched('/transactions')).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);

      // Repeat calls must not invoke the loader again
      preloadRoute('/transactions');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('provides hover, focus, and touch prefetch handlers', () => {
      const spy = vi.spyOn(routeLoaders, '/analytics').mockResolvedValue({});
      const handlers = getPrefetchHandlers('/analytics');

      expect(typeof handlers.onMouseEnter).toBe('function');
      expect(typeof handlers.onFocus).toBe('function');
      expect(typeof handlers.onTouchStart).toBe('function');

      handlers.onMouseEnter();
      handlers.onFocus();
      handlers.onTouchStart();

      expect(isRoutePrefetched('/analytics')).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('ignores unknown routes safely', () => {
      expect(preloadRoute('/non-existent-route')).toBeNull();
      expect(isRoutePrefetched('/non-existent-route')).toBe(false);
    });
  });

  describe('NavigationProgressBar', () => {
    it('delays showing to avoid flashing on fast cache hits and hides when idle', () => {
      vi.useFakeTimers();
      const qc = new QueryClient();

      const { rerender } = render(
        <QueryClientProvider client={qc}>
          <NavigationProgressBar isActive={false} delayMs={140} />
        </QueryClientProvider>
      );

      const bar = screen.getByTestId('nav-progress-bar');
      expect(bar.className).not.toContain('is-visible');

      // Activate loading
      rerender(
        <QueryClientProvider client={qc}>
          <NavigationProgressBar isActive={true} delayMs={140} />
        </QueryClientProvider>
      );

      // Still hidden before delayMs threshold
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(bar.className).not.toContain('is-visible');

      // Visible once delayMs elapses
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(bar.className).toContain('is-visible');

      // Hides smoothly after loading ends
      rerender(
        <QueryClientProvider client={qc}>
          <NavigationProgressBar isActive={false} delayMs={140} />
        </QueryClientProvider>
      );
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(bar.className).not.toContain('is-visible');
    });
  });

  describe('ScrollToTop', () => {
    it('resets .island-content-wrapper scroll position on navigation', () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'island-content-wrapper';
      wrapper.scrollTop = 320;
      const scrollToMock = vi.fn(() => {
        wrapper.scrollTop = 0;
      });
      wrapper.scrollTo = scrollToMock;
      document.body.appendChild(wrapper);

      render(
        <MemoryRouter initialEntries={['/transactions']}>
          <ScrollToTop />
        </MemoryRouter>
      );

      expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
      expect(wrapper.scrollTop).toBe(0);

      document.body.removeChild(wrapper);
    });
  });

  describe('queryClient caching defaults', () => {
    it('keeps 5m staleTime, 15m gcTime, and disables disruptive window-focus refetch', () => {
      const defaults = appQueryClient.getDefaultOptions().queries;
      expect(defaults.staleTime).toBe(1000 * 60 * 5);
      expect(defaults.gcTime).toBe(1000 * 60 * 15);
      expect(defaults.refetchOnWindowFocus).toBe(false);
    });
  });
});

