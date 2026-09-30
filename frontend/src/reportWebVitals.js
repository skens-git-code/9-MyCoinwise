import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';
import * as Sentry from '@sentry/react';

function sendToAnalytics(metric) {
  try {
    Sentry.addBreadcrumb({
      category: 'web-vitals',
      message: `${metric.name}: ${Math.round(metric.value)}ms (rating: ${metric.rating})`,
      level: 'info',
      data: metric,
    });
    if (typeof Sentry.setMeasurement === 'function') {
      Sentry.setMeasurement(metric.name, metric.value, metric.name === 'CLS' ? '' : 'millisecond');
    }
  } catch {
    // Sentry not initialized or not available
  }

  if (import.meta.env.DEV) {
    console.debug(`[Web Vitals] ${metric.name}:`, Math.round(metric.value), metric.rating);
  }
}

export function initWebVitals() {
  onCLS(sendToAnalytics);
  onINP(sendToAnalytics);
  onLCP(sendToAnalytics);
  onFCP(sendToAnalytics);
  onTTFB(sendToAnalytics);
}
