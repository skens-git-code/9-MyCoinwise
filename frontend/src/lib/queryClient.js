import { QueryClient } from '@tanstack/react-query';

/**
 * Production-configured React Query client instance.
 *
 * Cache strategy:
 * - staleTime: 5 minutes (data remains fresh without background refetches during quick navigation)
 * - gcTime: 15 minutes (inactive cache entries are preserved for fast back/forward navigation)
 * - retry: 1 (fast failure response without long retry loops on 4xx/5xx errors)
 * - refetchOnWindowFocus: false (avoids disruptive layout updates when user tabs away and returns)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 15,    // 15 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default queryClient;
