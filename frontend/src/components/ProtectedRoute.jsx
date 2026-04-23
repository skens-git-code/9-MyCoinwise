import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AppContext } from '../App';
import Loader from './Loader';
import ErrorState from './ErrorState';
import useDelayedLoading from '../hooks/useDelayedLoading';

export default function ProtectedRoute({ children }) {
  const { user, isInitialAuthLoad, globalError, refetch } = useContext(AppContext);
  const location = useLocation();
  const showLoader = useDelayedLoading(isInitialAuthLoad, 250);

  if (globalError && !user) {
    return <ErrorState title="Connection Failed" message={globalError} onRetry={refetch} fullScreen />;
  }

  // Only show full screen loader on initial check. Background syncs shouldn't unmount the UI.
  if (showLoader && !user) {
    return <Loader fullScreen mode="auth" />;
  }

  if (!user && !isInitialAuthLoad) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
