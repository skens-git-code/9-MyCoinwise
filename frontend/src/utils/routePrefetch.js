/**
 * Route Chunk Prefetcher
 *
 * Centralizes dynamic `import()` loaders for all lazy-loaded pages so
 * navigation links, breadcrumbs, and overlays can warm up route chunks
 * on hover, focus, or touchstart before the user completes a click.
 *
 * Vite/Rollup deduplicates concurrent dynamic imports, and `prefetchedRoutes`
 * avoids redundant switch lookups and makes prefetch state observable in tests.
 */

const prefetchedRoutes = new Set();

export const routeLoaders = {
  '/': () => import('../pages/Dashboard'),
  '/transactions': () => import('../pages/Transactions'),
  '/calendar': () => import('../pages/Calendar'),
  '/analytics': () => import('../pages/Analytics'),
  '/calculator': () => import('../pages/Calculator'),
  '/tax': () => import('../pages/Tax'),
  '/reports': () => import('../pages/Reports'),
  '/download': () => import('../pages/Reports'),
  '/statements': () => import('../pages/Reports'),
  '/accounts': () => import('../pages/Accounts'),
  '/budgets': () => import('../pages/Budgets'),
  '/goals': () => import('../pages/Goals'),
  '/subscriptions': () => import('../pages/Subscriptions'),
  '/cashflow': () => import('../pages/Cashflow'),
  '/wealth': () => import('../pages/Wealth'),
  '/about': () => import('../pages/About'),
  '/settings': () => import('../pages/SettingsPage'),
  '/terms': () => import('../pages/Terms'),
  '/privacy': () => import('../pages/Privacy'),
  '/welcome': () => import('../pages/Landing/Landing'),
  '/login': () => import('../pages/Login'),
  '/register': () => import('../pages/Register'),
  '/forgot-password': () => import('../pages/ForgotPassword'),
  '/reset-password': () => import('../pages/ResetPassword'),
  '/verify-email': () => import('../pages/VerifyEmail'),
  '/404': () => import('../pages/NotFound'),
};

/**
 * Normalize a path string (strip query/hash/trailing slash) for loader lookup.
 */
function normalizeRoutePath(to) {
  if (typeof to !== 'string' || !to) return '';
  const clean = to.split(/[?#]/)[0];
  if (clean.length > 1 && clean.endsWith('/')) {
    return clean.slice(0, -1);
  }
  return clean;
}

/**
 * Preload a route's JS chunk if it has not been prefetched yet.
 * Safe to call repeatedly on mouseenter/focus/touchstart.
 */
export function preloadRoute(to) {
  const path = normalizeRoutePath(to);
  const loader = routeLoaders[path];
  if (!loader || prefetchedRoutes.has(path)) {
    return null;
  }

  prefetchedRoutes.add(path);
  try {
    return Promise.resolve(loader()).catch(() => {
      // Allow retry if a transient network error occurred while prefetching
      prefetchedRoutes.delete(path);
      return null;
    });
  } catch {
    prefetchedRoutes.delete(path);
    return null;
  }
}

/**
 * Returns memo-friendly event handlers for NavLink / Link prefetching.
 */
export function getPrefetchHandlers(to) {
  const trigger = () => preloadRoute(to);
  return {
    onMouseEnter: trigger,
    onFocus: trigger,
    onTouchStart: trigger,
  };
}

/**
 * Exposed for testing / diagnostics.
 */
export function clearPrefetchCache() {
  prefetchedRoutes.clear();
}

export function isRoutePrefetched(to) {
  return prefetchedRoutes.has(normalizeRoutePath(to));
}

