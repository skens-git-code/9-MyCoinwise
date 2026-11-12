import React, { useContext, useEffect, useRef, useState } from 'react';
import { QueryClientContext, useIsFetching } from '@tanstack/react-query';

function QueryFetchingObserver({ onChange }) {
  const fetchingCount = useIsFetching();
  useEffect(() => {
    onChange(fetchingCount > 0);
  }, [fetchingCount, onChange]);
  return null;
}

/**
 * NavigationProgressBar
 *
 * Non-blocking top progress indicator driven by active React Query fetches
 * and background workspace syncs. Uses a 140ms activation delay so instant
 * cached route transitions never flash, and animates strictly with GPU
 * `transform` and `opacity`.
 */
export default function NavigationProgressBar({ isActive = false, delayMs = 140 }) {
  const queryClient = useContext(QueryClientContext);
  const [isQueryFetching, setIsQueryFetching] = useState(false);
  const busy = isActive || isQueryFetching;
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (busy) {
      timerRef.current = setTimeout(() => {
        setVisible(true);
      }, delayMs);
    } else {
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, 120);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [busy, delayMs]);

  return (
    <>
      {queryClient ? <QueryFetchingObserver onChange={setIsQueryFetching} /> : null}
      <div
        className={`nav-progress-bar ${visible ? 'is-visible' : ''}`}
        role="progressbar"
        aria-label="Loading content"
        aria-hidden={!visible}
        data-testid="nav-progress-bar"
      >
        <div className="nav-progress-bar__fill" />
      </div>
    </>
  );
}
