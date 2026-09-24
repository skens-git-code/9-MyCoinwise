/* —————————————————————————————————————
 * API Service
 * Central Axios client for the backend.
 *
 * Responsibilities:
 *   - Resolve the API base URL from env or fallback.
 *   - Attach a JWT to every non-public request.
 *   - Clear auth state on 401 and emit `mcw:auth-expired`.
 *   - Expose currency / avatar constants used across the app.
 *   - Provide typed methods for every backend route.
 *
 * Auth token lookup:
 *   - Accepts a `?token=` query parameter once (auto-persists).
 *   - Otherwise reads from localStorage, then sessionStorage.
 *
 * Global timeout:
 *   - 30s, to tolerate cold starts on Render.com.
 * ————————————————————————————————————— */

import axios from 'axios';

// Resolve API base URL: respects VITE_API_URL, auto-detects local dev server,
// or defaults to deployed production backend.
const resolveApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location) {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5001/api';
    }
  }
  return 'https://nine-budgettracker.onrender.com/api';
};

export const API_URL = resolveApiUrl();

/* Original getStoredToken:
export const getStoredToken = () => localStorage.getItem('mcw-token') || sessionStorage.getItem('mcw-token');
*/
/* ─────────────────────────────────────
 * Get Stored Token
 * Priority:
 *   1. `?token=` query param (also sets onboarding complete).
 *   2. localStorage under `mcw-token`.
 *   3. sessionStorage under `mcw-token`.
 * ───────────────────────────────────── */
export const getStoredToken = () => {
  try {
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const p = new URLSearchParams(window.location.search);
      const urlToken = p.get('token');
      if (urlToken) {
        localStorage.setItem('mcw-token', urlToken);
        localStorage.setItem('mcw-onboarding-completed', 'true');
        return urlToken;
      }
    }
  } catch { /* ignore */ }
  return localStorage.getItem('mcw-token') || sessionStorage.getItem('mcw-token');
};

// ── Global timeout: 30s prevents prematurely timing out on cold starts ──
axios.defaults.timeout = 30000;

// --- Axios Request Interceptor for JWT ---
// ── Attaches the auth token unless the route is public ──
axios.interceptors.request.use((config) => {
  const requestUrl = String(config.url || '');
  const isUnauthenticatedRoute =
    requestUrl.includes('/auth/login') ||
    requestUrl.includes('/auth/register') ||
    requestUrl.includes('/auth/check-username') ||
    requestUrl.includes('/auth/resend-verification') ||
    requestUrl.includes('/health');

  if (!isUnauthenticatedRoute) {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// --- Axios Response Interceptor: clear token on 401 ---
// ── Clears auth state and broadcasts an auth-expired event ──
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mcw-token');
      sessionStorage.removeItem('mcw-token');
      const requestUrl = String(error.config?.url || '');
      if (!requestUrl.includes('/auth/')) {
        window.dispatchEvent(new CustomEvent('mcw:auth-expired'));
      }
    }
    return Promise.reject(error);
  }
);

/* ─────────────────────────────────────
 * Currency Map
 * Symbol + display name for each supported currency.
 * ───────────────────────────────────── */
export const CURRENCIES = {
  INR: { symbol: '₹', name: 'Indian Rupee' },
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham' },
  CHF: { symbol: 'Fr', name: 'Swiss Franc' },
  CNY: { symbol: '¥', name: 'Chinese Yuan' },
  MXN: { symbol: '$', name: 'Mexican Peso' },
  BRL: { symbol: 'R$', name: 'Brazilian Real' },
  KRW: { symbol: '₩', name: 'South Korean Won' },
  THB: { symbol: '฿', name: 'Thai Baht' },
};

// ── Avatar preset names + selectable accent colors ──
export const AVATARS = ['user1', 'user2', 'user3', 'user4', 'user5'];
export const AVATAR_COLORS = ['#059669', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#f97316', '#64748b'];

/* —————————————————————————————————————
 * API Client
 * All methods return `res.data` or (for blob / silent failures) a
 * documented fallback. Interceptors handle auth and error signalling.
 * ————————————————————————————————————— */
export const api = {
  /* ─────────────────────────────────────
   * Health & Server Wake-Up
   * ───────────────────────────────────── */

  // ── Ping the backend; returns null on failure (used for cold-start banners) ──
  healthCheck: async () => {
    try {
      const res = await axios.get(`${API_URL}/health`, { timeout: 5000 });
      return res.data;
    } catch {
      return null;
    }
  },

  /* ─────────────────────────────────────
   * Auth
   * ───────────────────────────────────── */

  // ── Log in and return { token, user } ──
  login: async (credentials) => {
    const res = await axios.post(`${API_URL}/auth/login`, credentials);
    return res.data;
  },

  // ── Register a new account and return { token, user } ──
  register: async (data) => {
    const res = await axios.post(`${API_URL}/auth/register`, data);
    return res.data;
  },

  // ── Live check if username is available ──
  checkUsername: async (username, config = {}) => {
    try {
      const res = await axios.get(`${API_URL}/auth/check-username`, {
        params: { username },
        timeout: 4000,
        ...config,
      });
      return res.data;
    } catch {
      return { available: true };
    }
  },

  // ── Resend email verification ──
  resendVerification: async (email) => {
    try {
      const res = await axios.post(`${API_URL}/auth/resend-verification`, { email }, { timeout: 6000 });
      return res.data;
    } catch {
      return { message: 'If the email exists, a verification link has been sent.' };
    }
  },

  // ── Fetch the currently authenticated user ──
  getMe: async () => {
    const res = await axios.get(`${API_URL}/auth/me`);
    return res.data;
  },

  // ── Invalidate the current session server-side ──
  logout: async () => {
    const res = await axios.post(`${API_URL}/auth/logout`);
    return res.data;
  },

  /* ─────────────────────────────────────
   * Users
   * ───────────────────────────────────── */

  // ── List users in the authenticated household ──
  getAllUsers: async () => {
    const res = await axios.get(`${API_URL}/users`);
    return res.data;
  },

  // ── Fetch a single user by id ──
  getUser: async (id) => {
    const res = await axios.get(`${API_URL}/users/${id}`);
    return res.data;
  },

  // ── Create a new household user ──
  createUser: async (data) => {
    const res = await axios.post(`${API_URL}/users`, data);
    return res.data;
  },

  // ── Reset a user's financial data (keeps the account) ──
  resetAccount: async (id) => {
    const res = await axios.post(`${API_URL}/users/${id}/reset`);
    return res.data;
  },

  // ── Issue a session token for a linked household profile ──
  switchUser: async (id) => {
    const res = await axios.post(`${API_URL}/users/${id}/switch`);
    return res.data;
  },

  /* ─────────────────────────────────────
   * Transactions
   * ───────────────────────────────────── */

  // ── List a user's transactions ──
  getTransactions: async (userId) => {
    const res = await axios.get(`${API_URL}/transactions/${userId}`);
    return res.data;
  },

  // ── Create a transaction ──
  addTransaction: async (data) => {
    const res = await axios.post(`${API_URL}/transactions`, data);
    return res.data;
  },

  // ── Update a transaction by id ──
  editTransaction: async (id, data) => {
    const res = await axios.put(`${API_URL}/transactions/${id}`, data);
    return res.data;
  },

  // ── Soft-delete a transaction by id ──
  deleteTransaction: async (id) => {
    const res = await axios.delete(`${API_URL}/transactions/${id}`);
    return res.data;
  },

  // ── Force-process overdue recurring transactions ──
  processRecurringTransactions: async () => {
    const res = await axios.post(`${API_URL}/transactions/process-recurring`);
    return res.data;
  },

  // ── Soft-delete multiple transactions in one request ──
  bulkDeleteTransactions: async (ids) => {
    const res = await axios.post(`${API_URL}/transactions/bulk-delete`, { ids });
    return res.data;
  },

  // ── Analyze a bank statement CSV and return classified rows ──
  previewBankStatement: async (content, filename = 'statement.csv') => {
    const res = await axios.post(`${API_URL}/transactions/statement/preview`, { content, filename });
    return res.data;
  },

  // ── Import the reviewed rows from a bank statement ──
  importBankStatement: async (transactions) => {
    const res = await axios.post(`${API_URL}/transactions/statement/import`, { transactions });
    return res.data;
  },

  /* ─────────────────────────────────────
   * Goals
   * ───────────────────────────────────── */

  // ── List a user's savings goals ──
  getGoals: async (userId) => {
    const res = await axios.get(`${API_URL}/goals/${userId}`);
    return res.data;
  },

  // ── Create a savings goal ──
  createGoal: async (data) => {
    const res = await axios.post(`${API_URL}/goals`, data);
    return res.data;
  },

  // ── Update a savings goal ──
  updateGoal: async (id, data) => {
    const res = await axios.put(`${API_URL}/goals/${id}`, data);
    return res.data;
  },

  // ── Delete a savings goal ──
  deleteGoal: async (id) => {
    const res = await axios.delete(`${API_URL}/goals/${id}`);
    return res.data;
  },

  /* ─────────────────────────────────────
   * Subscriptions
   * ───────────────────────────────────── */

  // ── List a user's subscriptions ──
  getSubscriptions: async (userId) => {
    const res = await axios.get(`${API_URL}/subscriptions/${userId}`);
    return res.data;
  },

  // ── Create a subscription ──
  createSubscription: async (data) => {
    const res = await axios.post(`${API_URL}/subscriptions`, data);
    return res.data;
  },

  // ── Update a subscription ──
  updateSubscription: async (id, data) => {
    const res = await axios.put(`${API_URL}/subscriptions/${id}`, data);
    return res.data;
  },

  // ── Delete a subscription ──
  deleteSubscription: async (id) => {
    const res = await axios.delete(`${API_URL}/subscriptions/${id}`);
    return res.data;
  },

  /* ─────────────────────────────────────
   * Budgets
   * ───────────────────────────────────── */

  // ── List a user's budgets ──
  getBudgets: async (userId) => {
    const res = await axios.get(`${API_URL}/budgets/${userId}`);
    return res.data;
  },

  // ── Create a budget ──
  createBudget: async (data) => {
    const res = await axios.post(`${API_URL}/budgets`, data);
    return res.data;
  },

  // ── Update a budget ──
  updateBudget: async (id, data) => {
    const res = await axios.put(`${API_URL}/budgets/${id}`, data);
    return res.data;
  },

  // ── Delete a budget ──
  deleteBudget: async (id) => {
    const res = await axios.delete(`${API_URL}/budgets/${id}`);
    return res.data;
  },

  /* ─────────────────────────────────────
   * Accounts
   * ───────────────────────────────────── */

  // ── List a user's accounts ──
  getAccounts: async (userId) => {
    const res = await axios.get(`${API_URL}/accounts/${userId}`);
    return res.data;
  },

  // ── Create an account ──
  createAccount: async (data) => {
    const res = await axios.post(`${API_URL}/accounts`, data);
    return res.data;
  },

  // ── Update an account ──
  updateAccount: async (id, data) => {
    const res = await axios.put(`${API_URL}/accounts/${id}`, data);
    return res.data;
  },

  // ── Delete an account ──
  deleteAccount: async (id) => {
    const res = await axios.delete(`${API_URL}/accounts/${id}`);
    return res.data;
  },

  /* ─────────────────────────────────────
   * Scientific Calculator History
   * ───────────────────────────────────── */

  // ── List recent calculation entries for a user ──
  getCalculations: async (userId, limit = 30) => {
    const res = await axios.get(`${API_URL}/calculations/${userId}`, { params: { limit } });
    return res.data;
  },

  // ── Save (upsert) a calculation entry ──
  saveCalculation: async (data) => {
    const res = await axios.post(`${API_URL}/calculations`, data);
    return res.data;
  },

  // ── Clear all calculations for a user ──
  clearCalculations: async (userId) => {
    const res = await axios.delete(`${API_URL}/calculations/${userId}`);
    return res.data;
  },

  // ── Delete a single calculation by client id ──
  deleteCalculation: async (userId, clientId) => {
    const res = await axios.delete(`${API_URL}/calculations/${userId}/${encodeURIComponent(clientId)}`);
    return res.data;
  },

  /* ─────────────────────────────────────
   * Export
   * ───────────────────────────────────── */

  // ── Download the Excel export as a file ──
  exportToExcel: async (userId, options = {}) => {
    const res = await axios.get(`${API_URL}/export/${userId}`, { responseType: 'blob', ...options });
    const blob = new Blob([res.data]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `mycoinwise_export_${userId}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /* ─────────────────────────────────────
   * AI Chat
   * The API key remains server-side.
   * ───────────────────────────────────── */

  // ── Send a chat message + history; returns the assistant reply ──
  chatWithAI: async (message, history) => {
    const res = await axios.post(`${API_URL}/ai/chat`, { message, history });
    return res.data;
  },

  /* ─────────────────────────────────────
   * Wealth
   * ───────────────────────────────────── */

  // ── List wealth items (hydrated with live prices) ──
  getWealthItems: async () => {
    const res = await axios.get(`${API_URL}/wealth/items`);
    return res.data;
  },

  // ── Create a wealth item ──
  createWealthItem: async (data) => {
    const res = await axios.post(`${API_URL}/wealth/items`, data);
    return res.data;
  },

  // ── Update a wealth item ──
  updateWealthItem: async (id, data) => {
    const res = await axios.put(`${API_URL}/wealth/items/${id}`, data);
    return res.data;
  },

  // ── Delete a wealth item ──
  deleteWealthItem: async (id) => {
    const res = await axios.delete(`${API_URL}/wealth/items/${id}`);
    return res.data;
  },

  // ── Fetch net-worth history snapshots ──
  getWealthHistory: async (params) => {
    const res = await axios.get(`${API_URL}/wealth/history`, { params });
    return res.data;
  },

  // ── Request AI wealth insights for the given metrics ──
  getWealthAiInsights: async (payload) => {
    const res = await axios.post(`${API_URL}/wealth/ai-insights`, payload);
    return res.data;
  },

  /* ─────────────────────────────────────
   * Cashflow
   * ───────────────────────────────────── */

  // ── Request AI cashflow insights; accepts an abort signal ──
  getCashflowAiInsights: async (payload, config = {}) => {
    const res = await axios.post(`${API_URL}/cashflow/ai-insights`, payload, config);
    return res.data;
  },

  // ── Calendar Events ────────────────────────────────────────────────────────

  // ── List a user's calendar events ──
  getEvents: async (userId) => {
    const res = await axios.get(`${API_URL}/events/${userId}`);
    return res.data;
  },

  // ── Create a calendar event ──
  addEvent: async (data) => {
    const res = await axios.post(`${API_URL}/events`, data);
    return res.data;
  },

  // ── Update a calendar event ──
  editEvent: async (id, data) => {
    const res = await axios.put(`${API_URL}/events/${id}`, data);
    return res.data;
  },

  // ── Delete a calendar event ──
  deleteEvent: async (id) => {
    const res = await axios.delete(`${API_URL}/events/${id}`);
    return res.data;
  },

  // ── Security ──────────────────────────────────────────────────────────────

  // ── Change the current user's password ──
  changePassword: async (userId, data) => {
    const res = await axios.post(`${API_URL}/security/change-password`, data);
    return res.data;
  },

  // ── Change the current user's email ──
  changeEmail: async (data) => {
    const res = await axios.post(`${API_URL}/security/change-email`, data);
    return res.data;
  },

  // ── List the user's active sessions ──
  getActiveSessions: async () => {
    const res = await axios.get(`${API_URL}/security/sessions`);
    return res.data;
  },

  // ── Revoke a single session (userId unused; kept for signature compat) ──
  revokeSession: async (_userId, sessionId) => {
    const res = await axios.delete(`${API_URL}/security/sessions/${sessionId}`);
    return res.data;
  },

  // ── Revoke every session except the current one ──
  revokeAllOtherSessions: async () => {
    const res = await axios.delete(`${API_URL}/security/sessions`);
    return res.data;
  },

  // ── Notification Preferences ──────────────────────────────────────────────

  // ── Fetch notification preferences; returns null on failure (use defaults) ──
  getNotificationPreferences: async (userId) => {
    try {
      const res = await axios.get(`${API_URL}/users/${userId}/notifications`);
      return res.data;
    } catch {
      return null; // silently fail — use component defaults
    }
  },

  // ── Update notification preferences ──
  updateNotificationPreferences: async (userId, prefs) => {
    const res = await axios.put(`${API_URL}/users/${userId}/notifications`, prefs);
    return res.data;
  },

  // ── Advanced Preferences ──────────────────────────────────────────────────

  // ── Fetch advanced preferences; returns null on failure ──
  getAdvancedPreferences: async (userId) => {
    try {
      const res = await axios.get(`${API_URL}/users/${userId}/advanced-preferences`);
      return res.data;
    } catch {
      return null;
    }
  },

  // ── Update advanced preferences ──
  updateAdvancedPreferences: async (userId, prefs) => {
    const res = await axios.put(`${API_URL}/users/${userId}/advanced-preferences`, prefs);
    return res.data;
  },

  // ── Data Backup / Restore ─────────────────────────────────────────────────

  // ── Export the full user backup as JSON ──
  exportAllData: async (userId) => {
    const res = await axios.get(`${API_URL}/export/backup/${userId}`);
    return res.data;
  },

  // ── Restore a previously exported JSON backup ──
  importAllData: async (userId, data) => {
    const res = await axios.post(`${API_URL}/users/${userId}/import`, data);
    return res.data;
  },

  // ── Settings & Account ────────────────────────────────────────────────────

  // ── Update user settings via atomic PATCH ──
  updateSettings: async (userId, settings) => {
    const res = await axios.patch(`${API_URL}/users/${userId}/settings`, settings); // Now using atomic PATCH
    return res.data;
  },

  // ── Delete a user and all associated data ──
  deleteUser: async (userId) => {
    const res = await axios.delete(`${API_URL}/users/${userId}`);
    return res.data;
  },

  /* ─────────────────────────────────────
   * Tax Center (feature-flagged on the server)
   * ───────────────────────────────────── */

  // ── List the user's tax profiles ──
  getTaxProfiles: async () => {
    const res = await axios.get(`${API_URL}/tax/profiles`);
    return res.data;
  },

  // ── Create a new tax profile ──
  createTaxProfile: async (data) => {
    const res = await axios.post(`${API_URL}/tax/profiles`, data);
    return res.data;
  },

  // ── Update an existing tax profile ──
  updateTaxProfile: async (id, data) => {
    const res = await axios.put(`${API_URL}/tax/profiles/${id}`, data);
    return res.data;
  },

  // ── Delete a tax profile and its related records ──
  deleteTaxProfile: async (id) => {
    const res = await axios.delete(`${API_URL}/tax/profiles/${id}`);
    return res.data;
  },

  // ── Estimate annual tax; accepts an optional income override ──
  estimateTax: async (profileId, incomeOverride) => {
    const payload = { profile_id: profileId };
    if (incomeOverride !== undefined && incomeOverride !== '') payload.income_override = incomeOverride;
    const res = await axios.post(`${API_URL}/tax/estimate`, payload);
    return res.data;
  },

  // ── Compare India new vs. old regime for a profile ──
  compareIndiaTaxRegimes: async (profileId) => {
    const res = await axios.post(`${API_URL}/tax/estimate/compare`, { profile_id: profileId });
    return res.data;
  },

  // ── Estimate capital gains tax for a profile ──
  estimateCapitalGainsTax: async (profileId) => {
    const res = await axios.post(`${API_URL}/tax/estimate/capital-gains`, { profile_id: profileId });
    return res.data;
  },

  // ── List tax-tagged transactions, optionally filtered by profile ──
  getTaxTaggedTransactions: async (params = {}) => {
    const res = await axios.get(`${API_URL}/tax/tagged-transactions`, { params });
    return res.data;
  },

  // ── Tag a transaction for tax (upsert) ──
  tagTransactionForTax: async (data) => {
    const res = await axios.post(`${API_URL}/tax/tag`, data);
    return res.data;
  },

  // ── Remove a transaction's tax tag ──
  removeTaxTag: async (transactionId) => {
    const res = await axios.delete(`${API_URL}/tax/tag/${transactionId}`);
    return res.data;
  },

  // ── List tax payments, optionally scoped to a profile ──
  getTaxPayments: async (params = {}) => {
    const res = await axios.get(`${API_URL}/tax/payments`, { params });
    return res.data;
  },

  // ── Record a tax payment ──
  createTaxPayment: async (data) => {
    const res = await axios.post(`${API_URL}/tax/payments`, data);
    return res.data;
  },

  // ── Delete a tax payment ──
  deleteTaxPayment: async (id) => {
    const res = await axios.delete(`${API_URL}/tax/payments/${id}`);
    return res.data;
  },

  // ── List tax documents, optionally scoped to a profile ──
  getTaxDocuments: async (params = {}) => {
    const res = await axios.get(`${API_URL}/tax/documents`, { params });
    return res.data;
  },

  // ── Index a new tax document reference ──
  createTaxDocument: async (data) => {
    const res = await axios.post(`${API_URL}/tax/documents`, data);
    return res.data;
  },

  // ── Delete a tax document ──
  deleteTaxDocument: async (id) => {
    const res = await axios.delete(`${API_URL}/tax/documents/${id}`);
    return res.data;
  },

  // ── Fetch a tax report (json | csv | pdf via server) ──
  getTaxReport: async (profileId, format = 'json') => {
    const res = await axios.get(`${API_URL}/tax/report/${profileId}`, { params: { format } });
    return res.data;
  },
};