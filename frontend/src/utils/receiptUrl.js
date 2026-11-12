/**
 * Resolves a backend API base origin and safely formats receipt image URLs
 * without adding extra named imports onto mocked `services/api` modules.
 */

export const resolveApiOrigin = () => {
  const configured = import.meta?.env?.VITE_API_URL;
  if (configured) {
    return configured.replace(/\/+$/, '').replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined' && window.location) {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5001';
    }
  }
  return 'https://nine-budgettracker.onrender.com';
};

export const resolveReceiptUrl = (rawUrl) => {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) return null;

  if (/^\/(?:api\/)?uploads\/receipts\/[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(trimmed)) {
    const apiOrigin = resolveApiOrigin();
    const normalizedPath = trimmed.startsWith('/api/') ? trimmed : `/api${trimmed}`;
    return `${apiOrigin}${normalizedPath}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Reject invalid/unsafe URLs (e.g. javascript:, data:)
  }
  return null;
};

