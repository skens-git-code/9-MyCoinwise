/* —————————————————————————————————————
 * Protected Route Component
 * Gate that wraps authenticated routes. On initial auth load it
 * shows a full-screen loader; on failure it shows an ErrorState;
 * on missing auth it redirects to /login.
 *
 * Props:
 *   - children : the protected subtree.
 *
 * Behavior:
 *   - Waits for the initial auth check before deciding.
 *   - Uses `useDelayedLoading` to avoid flashing the loader for very
 *     fast auth resolutions (250 ms threshold).
 *   - Background syncs (`isInitialAuthLoad === false`) never unmount
 *     the UI, even if a loader would otherwise show.
 *   - Redirects to /login only after the initial check has completed
 *     and there is no user.
 * ————————————————————————————————————— */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { getStoredToken } from '../services/api';
import Loader from './Loader';
import ErrorState from './ErrorState';
import useDelayedLoading from '../hooks/useDelayedLoading';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function ProtectedRoute({ children }) {
  // ── Auth state from context ──
  const { user, isInitialAuthLoad, globalError, token } = useAppState();
  const { refetch } = useAppActions();

  // ── Current location, needed to redirect back after login ──
  const location = useLocation();

  // Check if session token exists in context or local/session storage
  const hasStoredToken = Boolean(token || getStoredToken());

  // ── Delay the loader so fast auth checks do not flash ──
  const showLoader = useDelayedLoading(isInitialAuthLoad, 250);

  // ── 1. Unauthenticated: No token and initial auth check is finished ──
  if (!hasStoredToken && !user && !isInitialAuthLoad) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // ── 2. Auth failed: show a full-screen retryable error ──
  if (globalError && !user) {
    return <ErrorState title="Connection Failed" message={globalError} onRetry={refetch} fullScreen />;
  }

  // ── 3. Initial load still in progress: show the full-screen loader ──
  if ((showLoader || (hasStoredToken && !user)) && isInitialAuthLoad) {
    return <Loader fullScreen mode="auth" />;
  }

  // ── 4. Token exists but user profile is missing after initial sync (e.g. backend cold start or timeout) ──
  // NEVER bounce them to /login in a 5-second redirect loop! Give them a clean retry screen.
  if (hasStoredToken && !user) {
    return (
      <ErrorState
        title="Syncing Your Account"
        message="Your session is active but data could not be refreshed from the server. Please check your connection."
        onRetry={refetch}
        fullScreen
      />
    );
  }

  // ── 5. Auth is valid: render the protected subtree ──
  return children;
}