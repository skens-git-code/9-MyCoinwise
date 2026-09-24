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

import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AppContext } from '../contexts/AppContext';
import Loader from './Loader';
import ErrorState from './ErrorState';
import useDelayedLoading from '../hooks/useDelayedLoading';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
export default function ProtectedRoute({ children }) {
  // ── Auth state from context ──
  const { user, isInitialAuthLoad, globalError, refetch } = useContext(AppContext);

  // ── Current location, needed to redirect back after login ──
  const location = useLocation();

  // ── Delay the loader so fast auth checks do not flash ──
  const showLoader = useDelayedLoading(isInitialAuthLoad, 250);

  // ── Auth failed: show a full-screen retryable error ──
  if (globalError && !user) {
    return <ErrorState title="Connection Failed" message={globalError} onRetry={refetch} fullScreen />;
  }

  // Only show full screen loader on initial check. Background syncs shouldn't unmount the UI.
  // ── Initial load still in progress: show the full-screen loader ──
  if (showLoader && !user) {
    return <Loader fullScreen mode="auth" />;
  }

  // ── Initial check finished with no user: redirect to login ──
  if (!user && !isInitialAuthLoad) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // ── Auth is valid: render the protected subtree ──
  return children;
}