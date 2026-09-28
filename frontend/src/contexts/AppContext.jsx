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
 * @deprecated Legacy monolithic context. Scheduled for deletion in Stage 5.
 * Only retained for backward-compatibility with test fixtures that wrap <AppContext.Provider>.
 * All production code MUST consume AppStateContext or AppActionsContext directly.
 */
export const AppContext = createContext(null);

const isTestEnv = import.meta.env?.MODE === 'test';

/**
 * Hook to consume only data slices.
 * Throws in production if called outside AppStateContext.Provider.
 */
export function useAppState() {
  const stateContext = useContext(AppStateContext);
  const appContext = useContext(AppContext);
  const ctx = stateContext || (isTestEnv ? appContext : null);

  if (!ctx) {
    throw new Error('useAppState used outside AppStateContext.Provider — this is a bug.');
  }
  return ctx;
}

/**
 * Hook to consume only action handlers.
 * Throws in production if called outside AppActionsContext.Provider.
 */
export function useAppActions() {
  const actionsContext = useContext(AppActionsContext);
  const appContext = useContext(AppContext);
  const ctx = actionsContext || (isTestEnv ? appContext : null);

  if (!ctx) {
    throw new Error('useAppActions used outside AppActionsContext.Provider — this is a bug.');
  }
  return ctx;
}

/**
 * @deprecated Legacy hook to consume combined context.
 */
export function useAppContext() {
  const stateContext = useContext(AppStateContext);
  const actionsContext = useContext(AppActionsContext);
  const appContext = useContext(AppContext);

  if (isTestEnv && appContext) {
    return appContext;
  }

  if (!stateContext && !actionsContext) {
    throw new Error('useAppContext used outside Provider — this is a bug.');
  }
  return { ...(stateContext || {}), ...(actionsContext || {}) };
}
