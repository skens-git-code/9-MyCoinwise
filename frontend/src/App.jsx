/* eslint-disable react-refresh/only-export-components, react-hooks/exhaustive-deps */
import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
import { api, CURRENCIES } from './services/api';
import { generateAlerts, getSpendingInsights } from './services/aiEngine';
import { getT, LANGUAGES } from './services/i18n';
import ErrorBoundary from './components/ErrorBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Goals = lazy(() => import('./pages/Goals'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const Cashflow = lazy(() => import('./pages/Cashflow'));
const Wealth = lazy(() => import('./pages/Wealth'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

export const AppContext = React.createContext(null);

export function formatCurrency(amount, currency = 'USD') {
  const info = CURRENCIES[currency] || CURRENCIES.USD;
  const val = Number(amount);
  const isNeg = val < 0;
  const numStr = Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${isNeg ? '-' : ''}${info.symbol}${numStr}`;
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('mcw-theme') || 'dark');
  const [lang, setLang] = useState(() => localStorage.getItem('mcw-lang') || 'en');
  const [user, setUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(() => localStorage.getItem('mcw-token') || null);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
  }, []);

  const installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const THEME_CYCLE = ['dark', 'light', 'amoled'];
  const toggleTheme = () => {
    setTheme(prev => {
      const idx = THEME_CYCLE.indexOf(prev);
      const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
      localStorage.setItem('mcw-theme', next);
      return next;
    });
  };

  const setThemeDirect = (t) => {
    setTheme(t);
    localStorage.setItem('mcw-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  };

  const setLanguage = (code) => {
    setLang(code);
    localStorage.setItem('mcw-lang', code);
  };

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const login = async (newToken, userData) => {
    localStorage.setItem('mcw-token', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('mcw-token');
    setToken(null);
    setUser(null);
    setAllUsers([]);
    setTransactions([]);
    setGoals([]);
    setSubscriptions([]);
    setEvents([]);
  };

  const fetchData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    // Safety net: if backend doesn't respond in 16s (Render cold start), bail out
    const timeoutId = setTimeout(() => {
      console.warn('[App] fetchData timed out — clearing token and redirecting to login');
      localStorage.removeItem('mcw-token');
      setToken(null);
      setLoading(false);
    }, 16000);

    try {
      setLoading(true);
      const me = await api.getMe();
      const activeId = me._id || me.id;

      const [txData, goalsData, subsData, eventsData, usersData] = await Promise.all([
        api.getTransactions(activeId),
        api.getGoals(activeId),
        api.getSubscriptions(activeId),
        api.getEvents(activeId),
        api.getAllUsers().catch(() => [])
      ]);
      setUser(me);
      setAllUsers(usersData);
      setTransactions(txData);
      setGoals(goalsData);
      setSubscriptions(subsData);
      setEvents(eventsData);
      if (me?.theme) {
        setTheme(me.theme);
        document.documentElement.setAttribute('data-theme', me.theme);
        localStorage.setItem('mcw-theme', me.theme);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      if (err.response?.status === 401 || err.code === 'ECONNABORTED') {
        logout();
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [token]);

  const addTransaction = async (tx) => { await api.addTransaction({ ...tx, user_id: user?.id || user?._id }); await fetchData(); };
  const deleteTransaction = async (id) => { await api.deleteTransaction(id); await fetchData(); };
  const editTransaction = async (id, data) => { await api.editTransaction(id, data); await fetchData(); };
  const resetAccount = async () => { await api.resetAccount(user?.id || user?._id); await fetchData(); };

  const createUser = async (data) => {
    const result = await api.createUser(data);
    await fetchData();
    return result;
  };

  const switchUser = async (userId) => {
    try {
      setLoading(true);
      const response = await api.switchUser(userId);
      if (response && response.token) {
        localStorage.setItem('mcw-token', response.token);
        setToken(response.token);
        // fetchData is triggered automatically by token dependency in useEffect
      }
    } catch (error) {
      console.error('Switch user failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const currency = user?.currency || 'USD';
  const currencyInfo = CURRENCIES[currency] || CURRENCIES.USD;
  const fmt = (amount) => formatCurrency(amount, currency);

  const alerts = useMemo(() => generateAlerts(transactions, user), [transactions, user]);
  const insights = useMemo(() => getSpendingInsights(transactions, fmt), [transactions, currency]);
  const t = useMemo(() => getT(lang), [lang]);

  return (
    <ErrorBoundary>
      <AppContext.Provider value={{
        user, allUsers, transactions, theme, toggleTheme, setThemeDirect,
        addTransaction, deleteTransaction, editTransaction,
        resetAccount, createUser, switchUser, login, logout, loading,
        refetch: fetchData, USER_ID: user?.id || user?._id, currency, fmt, currencyInfo,
        lang, setLanguage, t, token,
        alerts, insights, deferredPrompt, installPWA, goals, subscriptions, events,
      }}>
        <Router>
          <Suspense fallback={<Loader />}>
            <Routes>
              <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
              <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <AppLayout>
                    <Suspense fallback={<Loader />}>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/transactions" element={<Transactions />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="/goals" element={<Goals />} />
                        <Route path="/subscriptions" element={<Subscriptions />} />
                        <Route path="/cashflow" element={<Cashflow />} />
                        <Route path="/wealth" element={<Wealth />} />
                        <Route path="/calendar" element={<Calendar />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="*" element={<Navigate to="/" />} />
                      </Routes>
                    </Suspense>
                  </AppLayout>
                </ProtectedRoute>
              } />
            </Routes>
          </Suspense>
        </Router>
      </AppContext.Provider>
    </ErrorBoundary>
  );
}
