import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/main.scss'
import App from './App.jsx'
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient.js';
import { initWebVitals } from './reportWebVitals.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';

initWebVitals();

// Tilt interactions are desktop-only eye candy: load them lazily on devices
// with a fine pointer so mobile pays zero main-thread cost.
if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)')?.matches) {
  import('./utils/d3-tilt.js').catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
