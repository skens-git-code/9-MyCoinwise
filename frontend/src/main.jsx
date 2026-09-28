import './wdyr.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/main.scss'
import './utils/d3-tilt.js'
import App from './App.jsx'
import { initClarity } from './services/clarity.js'
import * as Sentry from '@sentry/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient.js';
import { initWebVitals } from './reportWebVitals.js';

initClarity();
initWebVitals();

// Initialize Sentry error monitoring when DSN is configured
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.2,
    beforeSend(event) {
      const scrub = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const k of ['password', 'currentPassword', 'newPassword', 'token', 'authorization', 'cookie']) {
          if (obj[k]) obj[k] = '[REDACTED]';
        }
        for (const val of Object.values(obj)) {
          if (val && typeof val === 'object') scrub(val);
        }
      };
      scrub(event.request?.data);
      scrub(event.request?.headers);
      return event;
    },
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
