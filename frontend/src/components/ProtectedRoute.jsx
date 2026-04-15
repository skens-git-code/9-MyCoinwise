import React, { useState, useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AppContext } from '../App';
import Loader from './Loader';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useContext(AppContext);
  const location = useLocation();

  if (loading) {
    return <Loader fullScreen />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
