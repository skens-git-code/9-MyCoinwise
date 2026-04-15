import axios from 'axios';

const API_URL = 'http://localhost:5001/api';

// --- Axios Interceptor for JWT ---
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('zs-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export const CURRENCIES = {
  INR: { symbol: '₹', name: 'Indian Rupee',       flag: '🇮🇳' },
  USD: { symbol: '$',   name: 'US Dollar',          flag: '🇺🇸' },
  EUR: { symbol: '€',   name: 'Euro',               flag: '🇪🇺' },
  GBP: { symbol: '£',   name: 'British Pound',      flag: '🇬🇧' },
  JPY: { symbol: '¥',   name: 'Japanese Yen',       flag: '🇯🇵' },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar',    flag: '🇨🇦' },
  AUD: { symbol: 'A$',  name: 'Australian Dollar',  flag: '🇦🇺' },
  SGD: { symbol: 'S$',  name: 'Singapore Dollar',   flag: '🇸🇬' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham',          flag: '🇦🇪' },
  CHF: { symbol: 'Fr',  name: 'Swiss Franc',        flag: '🇨🇭' },
  CNY: { symbol: '¥',   name: 'Chinese Yuan',       flag: '🇨🇳' },
  MXN: { symbol: '$',   name: 'Mexican Peso',       flag: '🇲🇽' },
  BRL: { symbol: 'R$',  name: 'Brazilian Real',     flag: '🇧🇷' },
  KRW: { symbol: '₩',   name: 'South Korean Won',   flag: '🇰🇷' },
  THB: { symbol: '฿',   name: 'Thai Baht',          flag: '🇹🇭' },
};

export const AVATARS = ['😊', '😎', '🦁', '🐯', '🦊', '🐺', '🦄', '🐉', '🦋', '🌟', '🔥', '💎', '🚀', '🎯', '💼', '✈️'];
export const AVATAR_COLORS = ['#059669', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#f97316', '#8b5cf6'];

export const api = {
  // Auth
  login: async (credentials) => {
    const res = await axios.post(`${API_URL}/auth/login`, credentials);
    return res.data;
  },
  register: async (data) => {
    const res = await axios.post(`${API_URL}/auth/register`, data);
    return res.data;
  },
  getMe: async () => {
    const res = await axios.get(`${API_URL}/auth/me`);
    return res.data;
  },

  // Users
  getAllUsers: async () => {
    const res = await axios.get(`${API_URL}/users`);
    return res.data;
  },
  getUser: async (id) => {
    const res = await axios.get(`${API_URL}/users/${id}`);
    return res.data;
  },
  createUser: async (data) => {
    const res = await axios.post(`${API_URL}/auth/register`, data); // Redirected to auth register
    return res.data;
  },
  updateSettings: async (id, data) => {
    const res = await axios.put(`${API_URL}/users/${id}/settings`, data);
    return res.data;
  },
  resetAccount: async (id) => {
    const res = await axios.post(`${API_URL}/users/${id}/reset`);
    return res.data;
  },
  deleteUser: async (id) => {
    const res = await axios.delete(`${API_URL}/users/${id}`);
    return res.data;
  },

  getNotificationPreferences: async (userId) => {
    try {
      const res = await axios.get(`${API_URL}/users/${userId}/notifications`);
      return res.data;
    } catch {
      return {
        emailReports: true, budgetAlerts: true, goalMilestones: true, unusualSpending: false,
        pushNotifications: true, weeklyDigest: true, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00'
      };
    }
  },
  updateNotificationPreferences: async (userId, data) => {
    const res = await axios.put(`${API_URL}/users/${userId}/notifications`, data);
    return res.data;
  },

  // Transactions
  getTransactions: async (userId) => {
    const res = await axios.get(`${API_URL}/transactions/${userId}`);
    return res.data;
  },
  addTransaction: async (data) => {
    const res = await axios.post(`${API_URL}/transactions`, data);
    return res.data;
  },
  editTransaction: async (id, data) => {
    const res = await axios.put(`${API_URL}/transactions/${id}`, data);
    return res.data;
  },
  deleteTransaction: async (id) => {
    const res = await axios.delete(`${API_URL}/transactions/${id}`);
    return res.data;
  },

  // Goals
  getGoals: async (userId) => {
    const res = await axios.get(`${API_URL}/goals/${userId}`);
    return res.data;
  },
  createGoal: async (data) => {
    const res = await axios.post(`${API_URL}/goals`, data);
    return res.data;
  },
  updateGoal: async (id, data) => {
    const res = await axios.put(`${API_URL}/goals/${id}`, data);
    return res.data;
  },
  deleteGoal: async (id) => {
    const res = await axios.delete(`${API_URL}/goals/${id}`);
    return res.data;
  },

  // Subscriptions
  getSubscriptions: async (userId) => {
    const res = await axios.get(`${API_URL}/subscriptions/${userId}`);
    return res.data;
  },
  createSubscription: async (data) => {
    const res = await axios.post(`${API_URL}/subscriptions`, data);
    return res.data;
  },
  deleteSubscription: async (id) => {
    const res = await axios.delete(`${API_URL}/subscriptions/${id}`);
    return res.data;
  },

  // Export
  exportToExcel: async (userId, options = {}) => {
    const res = await axios.get(`${API_URL}/export/${userId}`, { responseType: 'blob', ...options });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `zenith_spend_export_${userId}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
};
