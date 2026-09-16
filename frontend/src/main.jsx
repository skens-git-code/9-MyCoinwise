import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/main.scss'
import App from './App.jsx'
import { initClarity } from './services/clarity.js'
import * as Sentry from '@sentry/react';
// [REMOVED: @tanstack/react-query and @tanstack/react-query-devtools uninstalled per user instruction]
// import { QueryClientProvider } from '@tanstack/react-query';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
// import { queryClient } from './lib/queryClient.js';

initClarity();

// Initialize Sentry error monitoring when DSN is configured
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.2,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// [PREVIOUS CODE PRESERVED - Render with React Query Provider]
// createRoot(document.getElementById('root')).render(
//   <StrictMode>
//     <QueryClientProvider client={queryClient}>
//       <App />
//       {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
//     </QueryClientProvider>
//   </StrictMode>,
// );
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
