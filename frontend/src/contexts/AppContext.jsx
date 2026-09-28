import { createContext, useContext } from 'react';

/**
 * StateContext: Holds application data and reactive status values.
 * Components that only read data will subscribe to this context.
 */
export const AppStateContext = createContext(null);

/**
 * ActionsContext: Holds stable handler and mutation functions.
 * Components that only trigger actions will subscribe to this context
 * and will NOT re-render when transactions, accounts, or user data update.
 */
export const AppActionsContext = createContext(null);

/**
 * Unified AppContext: Preserved for backwards compatibility with
 * existing consumers and tests. Combines memoized state + actions.
 */
export const AppContext = createContext(null);

/**
 * Hook to consume only data slices.
 */
export function useAppState() {
  const stateContext = useContext(AppStateContext);
  const appContext = useContext(AppContext);
  return stateContext || appContext || {};
}

/**
 * Hook to consume only action handlers.
 */
export function useAppActions() {
  const actionsContext = useContext(AppActionsContext);
  const appContext = useContext(AppContext);
  return actionsContext || appContext || {};
}

/**
 * Hook to consume combined context with graceful fallback.
 */
export function useAppContext() {
  const combined = useContext(AppContext);
  if (combined) return combined;

  const state = useContext(AppStateContext) || {};
  const actions = useContext(AppActionsContext) || {};
  return { ...state, ...actions };
}
