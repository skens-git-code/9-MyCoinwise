/* eslint-disable react-refresh/only-export-components, react-hooks/exhaustive-deps */
import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Analytics from './pages/Analytics';
import Goals from './pages/Goals';
import Subscriptions from './pages/Subscriptions';
import Cashflow from './pages/Cashflow';
import Wealth from './pages/Wealth';
import SettingsPage from './pages/SettingsPage';
import Calendar from './pages/Calendar';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
import { api, CURRENCIES } from './services/api';
import { generateAlerts, getSpendingInsights } from './services/aiEngine';
import { getT, LANGUAGES } from './services/i18n';
import ErrorBoundary from './components/ErrorBoundary';

export const AppContext = React.createContext(null);

export function formatCurrency(amount, currency = 'USD') {
  const info = CURRENCIES[currency] || CURRENCIES.USD;
  const val = Number(amount);
  const isNeg = val < 0;
  const numStr = Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${isNeg ? '-' : ''}${info.symbol}${numStr}`;
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('zs-theme') || 'dark');
  const [lang, setLang] = useState(() => localStorage.getItem('zs-lang') || 'en');
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(() => localStorage.getItem('zs-token') || null);
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
      localStorage.setItem('zs-theme', next);
      return next;
    });
  };

  const setThemeDirect = (t) => {
    setTheme(t);
    localStorage.setItem('zs-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  };

  const setLanguage = (code) => {
    setLang(code);
    localStorage.setItem('zs-lang', code);
  };

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const login = async (newToken, userData) => {
    localStorage.setItem('zs-token', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('zs-token');
    setToken(null);
    setUser(null);
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
    try {
      setLoading(true);
      const me = await api.getMe();
      const activeId = me._id || me.id;

      const [txData, goalsData, subsData, eventsData] = await Promise.all([
        api.getTransactions(activeId),
        api.getGoals(activeId),
        api.getSubscriptions(activeId),
        api.getEvents(activeId)
      ]);
      setUser(me);
      setTransactions(txData);
      setGoals(goalsData);
      setSubscriptions(subsData);
      setEvents(eventsData);
      if (me?.theme) {
        setTheme(me.theme);
        document.documentElement.setAttribute('data-theme', me.theme);
        localStorage.setItem('zs-theme', me.theme);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [token]);

  const addTransaction = async (tx) => { await api.addTransaction({ ...tx, user_id: user?.id || user?._id }); await fetchData(); };
  const deleteTransaction = async (id) => { await api.deleteTransaction(id); await fetchData(); };
  const editTransaction = async (id, data) => { await api.editTransaction(id, data); await fetchData(); };
  const resetAccount = async () => { await api.resetAccount(user?.id || user?._id); await fetchData(); };

  const currency = user?.currency || 'USD';
  const currencyInfo = CURRENCIES[currency] || CURRENCIES.USD;
  const fmt = (amount) => formatCurrency(amount, currency);

  const alerts = useMemo(() => generateAlerts(transactions, user), [transactions, user]);
  const insights = useMemo(() => getSpendingInsights(transactions, fmt), [transactions, currency]);
  const t = useMemo(() => getT(lang), [lang]);

  return (
    <ErrorBoundary>
      <AppContext.Provider value={{
        user, transactions, theme, toggleTheme, setThemeDirect,
        addTransaction, deleteTransaction, editTransaction,
        resetAccount, login, logout, loading,
        refetch: fetchData, USER_ID: user?.id || user?._id, currency, fmt, currencyInfo,
        lang, setLanguage, t, token,
        alerts, insights, deferredPrompt, installPWA, goals, subscriptions, events,
      }}>
        <Router>
          <Routes>
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
            <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout>
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
                </AppLayout>
              </ProtectedRoute>
            } />
          </Routes>
        </Router>
      </AppContext.Provider>
    </ErrorBoundary>
  );
}
