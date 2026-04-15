// CurrencyConverter.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, RefreshCw, X, TrendingUp, AlertCircle } from 'lucide-react';

// ==================== CONSTANTS ====================
const ALL_CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺' },
  GBP: { symbol: '£', name: 'British Pound', flag: '🇬🇧' },
  JPY: { symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺' },
  INR: { symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪' },
  CHF: { symbol: 'Fr', name: 'Swiss Franc', flag: '🇨🇭' },
  CNY: { symbol: '¥', name: 'Chinese Yuan', flag: '🇨🇳' },
  MXN: { symbol: '$', name: 'Mexican Peso', flag: '🇲🇽' },
  BRL: { symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷' },
  KRW: { symbol: '₩', name: 'South Korean Won', flag: '🇰🇷' },
  THB: { symbol: '฿', name: 'Thai Baht', flag: '🇹🇭' },
};

const FALLBACK_RATES = {
  INR: 1, USD: 83.5, EUR: 90.2, GBP: 105.8, JPY: 0.56,
  CAD: 61.2, AUD: 53.8, SGD: 61.5, AED: 22.7, CHF: 95.0,
  CNY: 11.5, MXN: 4.9, BRL: 16.4, KRW: 0.063, THB: 2.35,
};

const API_CONFIG = {
  BASE_URL: 'https://api.exchangerate-api.com/v4/latest',
  CACHE_DURATION: 30 * 60 * 1000, // 30 minutes
  MAX_AMOUNT: 1e9, // 1 billion
  DEBOUNCE_DELAY: 300,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};

const DECIMAL_CONFIG = {
  JPY: 0, KRW: 0, // Zero decimal currencies
  DEFAULT: 2,
};

// ==================== UTILITY FUNCTIONS ====================
const getCacheKey = (baseCurrency) => `exchange_rates_${baseCurrency}`;

const validateAmount = (value) => {
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > API_CONFIG.MAX_AMOUNT) return API_CONFIG.MAX_AMOUNT;
  return Math.round(num * 100) / 100; // Round to 2 decimals
};

const formatNumber = (num, currencyCode = null) => {
  if (num === null || isNaN(num)) return '0.00';
  
  const decimals = currencyCode && DECIMAL_CONFIG[currencyCode] !== undefined 
    ? DECIMAL_CONFIG[currencyCode] 
    : DECIMAL_CONFIG.DEFAULT;
  
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  });
};

// ==================== CUSTOM HOOKS ====================
const useExchangeRates = (baseCurrency = 'INR') => {
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortControllerRef = useRef(null);

  const fetchWithRetry = useCallback(async (url, retries = API_CONFIG.RETRY_ATTEMPTS) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, API_CONFIG.RETRY_DELAY * (i + 1)));
      }
    }
  }, []);

  const fetchExchangeRates = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    try {
      // Check cache
      const cacheKey = getCacheKey(baseCurrency);
      const cached = localStorage.getItem(cacheKey);
      const cachedTime = localStorage.getItem(`${cacheKey}_timestamp`);
      
      if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < API_CONFIG.CACHE_DURATION) {
        const cachedData = JSON.parse(cached);
        setRates(cachedData.rates);
        setLastUpdated(new Date(cachedData.timestamp));
        setUsingFallback(false);
        setLoading(false);
        return;
      }

      // Fetch fresh rates
      const data = await fetchWithRetry(`${API_CONFIG.BASE_URL}/${baseCurrency}`);
      
      if (data?.rates) {
        setRates(data.rates);
        const now = new Date();
        setLastUpdated(now);
        
        localStorage.setItem(cacheKey, JSON.stringify({
          rates: data.rates,
          timestamp: now.toISOString(),
          base: baseCurrency,
        }));
        localStorage.setItem(`${cacheKey}_timestamp`, now.getTime().toString());
        setUsingFallback(false);
        setError(null);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Failed to fetch rates:', err);
      
      // Use fallback rates
      setRates(FALLBACK_RATES);
      setLastUpdated(new Date());
      setUsingFallback(true);
      setError('Using offline rates. Live rates unavailable.');
    } finally {
      setLoading(false);
    }
  }, [baseCurrency, fetchWithRetry]);

  useEffect(() => {
    fetchExchangeRates();
    const interval = setInterval(fetchExchangeRates, API_CONFIG.CACHE_DURATION);
    
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchExchangeRates]);

  return { rates, loading, error, usingFallback, lastUpdated, refetch: fetchExchangeRates };
};

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// ==================== MAIN COMPONENT ====================
export default function CurrencyConverter({ onClose, initialFrom = 'USD', initialTo = 'INR', initialAmount = '1' }) {
  // State
  const [amount, setAmount] = useState(initialAmount);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  
  // Custom hooks
  const { rates, loading, error, usingFallback, lastUpdated, refetch } = useExchangeRates();
  const debouncedAmount = useDebounce(amount, API_CONFIG.DEBOUNCE_DELAY);

  // ==================== CORE LOGIC ====================
  // ✅ FIXED: Derive result directly during render - no effect needed!
  const convert = useCallback((amountValue, fromCurrency, toCurrency, exchangeRates) => {
    if (!exchangeRates) return 0;
    
    const numAmount = validateAmount(amountValue);
    if (numAmount === 0) return 0;
    
    if (fromCurrency === toCurrency) return numAmount;
    
    const fromRate = exchangeRates[fromCurrency];
    const toRate = exchangeRates[toCurrency];
    
    if (!fromRate || !toRate) {
      console.warn(`Missing rates for: ${fromCurrency} or ${toCurrency}`);
      return 0;
    }
    
    // Convert through base currency (INR)
    const inBase = numAmount / fromRate;
    const result = inBase * toRate;
    
    return Math.round(result * 10000) / 10000; // Round to 4 decimal places
  }, []);

  // ✅ Calculate result directly during render (pure computation)
  const result = useMemo(() => {
    if (!rates) return null;
    return convert(debouncedAmount, from, to, rates);
  }, [debouncedAmount, from, to, rates, convert]);

  const getExchangeRate = useCallback(() => {
    if (!rates) return null;
    return convert(1, from, to, rates);
  }, [from, to, rates, convert]);

  // ==================== EVENT HANDLERS ====================
  const handleAmountChange = useCallback((e) => {
    let value = e.target.value;
    
    // Allow empty or valid numbers
    if (value === '') {
      setAmount('');
      return;
    }
    
    // Validate format (allow only numbers and single decimal)
    if (/^\d*\.?\d*$/.test(value)) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue <= API_CONFIG.MAX_AMOUNT) {
        setAmount(value);
      } else if (numValue > API_CONFIG.MAX_AMOUNT) {
        setAmount(API_CONFIG.MAX_AMOUNT.toString());
      }
    }
  }, []);

  const handleSwap = useCallback(() => {
    setFrom(to);
    setTo(from);
    // Reset amount to 1 on swap for better UX
    setAmount('1');
  }, [from, to]);

  const handlePairSelect = useCallback((pairFrom, pairTo) => {
    setFrom(pairFrom);
    setTo(pairTo);
    setAmount('1');
  }, []);

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // ==================== RENDER HELPERS ====================
  const popularPairs = useMemo(() => [
    { from: 'USD', to: 'INR' }, { from: 'EUR', to: 'INR' },
    { from: 'GBP', to: 'INR' }, { from: 'JPY', to: 'INR' },
    { from: 'AED', to: 'INR' }, { from: 'SGD', to: 'INR' },
  ], []);

  const exchangeRate = getExchangeRate();

  // ==================== LOADING STATE ====================
  if (loading && !rates) {
    return (
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        role="dialog"
        aria-label="Currency converter loading"
      >
        <motion.div
          className="modal-box glass"
          initial={{ scale: 0.88, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.88, y: 24 }}
          style={{ maxWidth: 480, width: '100%' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <RefreshCw size={32} className="spinning" style={{ color: 'var(--brand-secondary)' }} />
            <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Loading exchange rates...</p>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // ==================== MAIN RENDER ====================
  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-label="Currency converter"
      aria-modal="true"
    >
      <motion.div
        className="modal-box glass"
        initial={{ scale: 0.88, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.88, y: 24 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 480, width: '100%', borderTop: '4px solid var(--brand-secondary)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem' }}>
            <ArrowLeftRight size={20} color="var(--brand-secondary)" /> 
            Currency Converter
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <motion.button
              className="icon-btn"
              onClick={handleRefresh}
              whileHover={{ rotate: 180, scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              disabled={loading}
              style={{ opacity: loading ? 0.5 : 1 }}
              aria-label="Refresh rates"
            >
              <RefreshCw size={16} />
            </motion.button>
            <motion.button 
              className="icon-btn" 
              onClick={onClose} 
              whileHover={{ rotate: 90, scale: 1.1 }}
              aria-label="Close"
            >
              <X size={18} />
            </motion.button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.75rem',
              color: '#f59e0b'
            }}
            role="alert"
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Amount Input */}
        <div className="form-field" style={{ marginBottom: 16 }}>
          <label htmlFor="amount-input">Amount</label>
          <input
            id="amount-input"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={handleAmountChange}
            placeholder="Enter amount..."
            style={{ fontSize: '1.2rem', fontWeight: 700 }}
            autoFocus
            aria-label="Amount to convert"
          />
        </div>

        {/* Currency Selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="from-currency">From</label>
            <select 
              id="from-currency"
              value={from} 
              onChange={e => setFrom(e.target.value)}
              aria-label="From currency"
            >
              {Object.entries(ALL_CURRENCIES).map(([code, info]) => (
                <option key={code} value={code}>
                  {info.flag} {code} – {info.name}
                </option>
              ))}
            </select>
          </div>

          <motion.button
            onClick={handleSwap}
            whileHover={{ rotate: 180, scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1px solid var(--glass-border)',
              background: 'var(--glass-2)',
              cursor: 'pointer',
              color: 'var(--brand-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 20
            }}
            aria-label="Swap currencies"
          >
            <RefreshCw size={16} />
          </motion.button>

          <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="to-currency">To</label>
            <select 
              id="to-currency"
              value={to} 
              onChange={e => setTo(e.target.value)}
              aria-label="To currency"
            >
              {Object.entries(ALL_CURRENCIES).map(([code, info]) => (
                <option key={code} value={code}>
                  {info.flag} {code} – {info.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Result Display */}
        <AnimatePresence mode="wait">
          <motion.div
            key={result}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(5, 150, 105,0.12))',
              border: '1px solid rgba(6,182,212,0.3)',
              borderRadius: 16,
              padding: '20px 24px',
              marginBottom: 20,
              textAlign: 'center'
            }}
          >
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 6 }}>
              {ALL_CURRENCIES[from]?.flag} {formatNumber(validateAmount(amount))} {from} equals
            </p>
            <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand-secondary)', fontFamily: "'Space Grotesk'" }}>
              {ALL_CURRENCIES[to]?.symbol}{formatNumber(result, to)}
            </p>
            {exchangeRate && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 6 }}>
                1 {from} = {ALL_CURRENCIES[to]?.symbol}{formatNumber(exchangeRate, to)} {to}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Popular Pairs */}
        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            Popular INR Rates (indicative)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {popularPairs.map(pair => {
              const rate = rates ? convert(1, pair.from, pair.to, rates) : null;
              const isActive = from === pair.from && to === pair.to;
              return (
                <motion.button
                  key={`${pair.from}-${pair.to}`}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handlePairSelect(pair.from, pair.to)}
                  style={{
                    background: isActive ? 'rgba(5, 150, 105,0.2)' : 'var(--glass-1)',
                    border: `1px solid ${isActive ? 'var(--brand-primary)' : 'var(--glass-border)'}`,
                    borderRadius: 10,
                    padding: '8px 6px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    transition: 'all 0.2s ease'
                  }}
                  aria-label={`Convert ${pair.from} to ${pair.to}`}
                >
                  <p style={{ fontSize: '0.7rem', fontWeight: 700 }}>{ALL_CURRENCIES[pair.from]?.flag} {pair.from}</p>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                    = {ALL_CURRENCIES[pair.to]?.symbol}{rate ? formatNumber(rate, pair.to) : '...'}
                  </p>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 14 }}>
          <TrendingUp size={10} style={{ marginRight: 4 }} />
          {usingFallback ? 'Offline rates' : 'Live rates'} · 
          Last updated: {lastUpdated ? lastUpdated.toLocaleDateString('en-IN', { 
            day: 'numeric', 
            month: 'short', 
            hour: '2-digit', 
            minute: '2-digit' 
          }) : '...'}
        </p>
      </motion.div>
    </motion.div>
  );
}