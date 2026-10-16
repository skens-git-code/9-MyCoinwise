/* —————————————————————————————————————
 * Accounts Page
 * Full CRUD interface for user financial accounts (bank, wallet,
 * credit card, investment, cash, custom types) with search, sort,
 * grid/list views, archive/restore, currency-aware net-worth
 * aggregation, and optional transaction linking.
 *
 * Key behaviors:
 *   - Account cards render in their own currency; the summary card
 *     converts to the user's base currency.
 *   - Account-linked transactions are excluded from the summary to
 *     avoid double-counting (balance already reflects them).
 *   - Archive is parallel-safe via a Set of in-flight IDs.
 *   - Custom types are persisted before creating the first account
 *     that uses them.
 *   - Currency can only be changed while the account balance is zero.
 *   - Search/sort/view preferences live in local state only.
 * ————————————————————————————————————— */

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit3, Trash2, Wallet, CreditCard, Landmark, Coins,
  Archive, ArchiveRestore, Eye, EyeOff, Info, Search, X,
  LayoutGrid, List, ArrowUpDown, TrendingUp, TrendingDown,
  AlertTriangle, RefreshCw, DollarSign, Hash, Loader2,
} from 'lucide-react';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { api, CURRENCIES } from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';
import {
  convertCurrency as convertFxCurrency,
  fetchRatesToInr,
  getFallbackRatesToInr,
  readCachedRatesToInr,
  resolveCurrency,
} from '../utils/currencyRates';

/* ============================================================
 * Constants
 * ============================================================ */

// ── Icon map for account cards ──
const ICONS = {
  Wallet: <Wallet size={24} />,
  CreditCard: <CreditCard size={24} />,
  Landmark: <Landmark size={24} />,
  Coins: <Coins size={24} />,
};

// ── Built-in account types and the full allowed list ──
const BASE_ACCOUNT_TYPES = ['bank', 'wallet', 'credit_card', 'investment', 'cash'];
const ACCOUNT_TYPES = [...BASE_ACCOUNT_TYPES, 'other'];

// ── Preset color palette for account cards ──
const COLOR_PRESETS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#6b7280',
];

// ── Sort menu options ──
const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'balance_desc', label: 'Balance (High → Low)' },
  { value: 'balance_asc', label: 'Balance (Low → High)' },
  { value: 'type_asc', label: 'Type' },
  { value: 'created_desc', label: 'Newest First' },
  { value: 'created_asc', label: 'Oldest First' },
];

// ── Numeric and pattern guards ──
const MAX_BALANCE = 999_999_999.99;

// Accepts: 12  |  12.  |  12.5  |  12.50  |  .5  |  -.5  |  -0.01
const BALANCE_REGEX = /^-?(\d+(\.\d{0,2})?|\.\d{1,2})$/;
// Custom type: starts with a letter, then letters/digits/underscores
const CUSTOM_TYPE_REGEX = /^[a-z][a-z0-9_]*$/;

/* ============================================================
 * Helpers
 * ============================================================ */

/**
 * Format a value as currency.
 * Account cards use their own currency; the summary uses the user's base
 * currency. This prevents a EUR account from being rendered as INR.
 */
const formatCurrency = (value, currencyCode = 'INR', locale) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currencyCode} ${num.toFixed(2)}`;
  }
};

// ── Extract the effective id from an account (supports both shapes) ──
const accountId = (account) => account?.id ?? account?._id ?? null;

// ── Convert a raw type string into a display label ──
const humanizeType = (type) =>
  String(type || 'other')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/* ============================================================
 * Sub-components
 * ============================================================ */

// ── Summary stat tile used at the top of the page ──
const StatCard = React.memo(({ icon, label, value, sub, tone = 'default' }) => (
  <motion.div
    className="glass stat-card"
    whileHover={{ y: -3 }}
    style={{
      padding: '1.25rem 1.5rem',
      borderRadius: 18,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '0.5rem',
      minHeight: 110,
      boxSizing: 'border-box',
    }}
  >
    {/* ── Header: icon + uppercase label ── */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: 'var(--text-muted)',
        fontSize: '0.78rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      <span style={{ display: 'inline-flex', opacity: 0.85 }}>{icon}</span>
      {label}
    </div>

    {/* ── Value (tone controls color) ── */}
    <div
      style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        color:
          tone === 'success'
            ? 'var(--success-color, #10b981)'
            : tone === 'danger'
              ? 'var(--danger-color, #ef4444)'
              : 'var(--text-main)',
      }}
    >
      {value}
    </div>

    {/* ── Optional sub text ── */}
    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', minHeight: '1.1rem' }}>
      {sub || ''}
    </div>
  </motion.div>
));
StatCard.displayName = 'StatCard';

// ── Skeleton shown while accounts are still loading ──
const AccountsSkeleton = () => (
  <div className="account-page" style={{ maxWidth: 'var(--content-max-width, 1240px)', margin: '0 auto', width: '100%' }} role="status" aria-label="Loading accounts">
    <div className="shimmer" style={{ width: 220, height: 32, borderRadius: 10, marginBottom: 10 }} />
    <div className="shimmer" style={{ width: 360, maxWidth: '80%', height: 16, borderRadius: 8, marginBottom: 28 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="glass shimmer" style={{ height: 116, borderRadius: 18 }} />
      ))}
    </div>
    <div className="glass shimmer" style={{ height: 180, borderRadius: 18 }} />
  </div>
);

/* ============================================================
 * Main Component
 * ============================================================ */

export default function Accounts() {
  // ── App context: accounts, transactions, i18n, actions ──
  const {
    accounts = [],
    transactions: rawTransactions = [],
    currency: userCurrency = 'INR',
    lang,
    loading,
    user,
  } = useAppState();
  const {
    refetch,
    t,
  } = useAppActions();
  const { showToast } = useToast();

  // ── Locale hint derived from the app language ──
  const locale =
    lang === 'hi' || lang === 'bgc' ? 'hi-IN'
      : lang === 'mr' ? 'mr-IN'
        : lang === 'kn' ? 'kn-IN'
          : undefined;

  // ── Translation helper with inline fallback ──
  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);

  // ── FX rates to INR, seeded from cache or bundled fallback ──
  const [fxRatesToInr, setFxRatesToInr] = useState(() => (
    readCachedRatesToInr() || getFallbackRatesToInr()
  ));

  // ── Refresh FX rates on mount; keep bundled rates while offline ──
  useEffect(() => {
    const controller = new AbortController();
    fetchRatesToInr(controller.signal)
      .then((rates) => setFxRatesToInr(rates))
      .catch(() => { /* Keep bundled rates while offline. */ });
    return () => controller.abort();
  }, []);

  /* ---------------- UI state ---------------- */

  // ── Modal visibility ──
  const [showAdd, setShowAdd] = useState(false);

  // ── Currently-edited / target-for-action account ──
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [customTypeToRemove, setCustomTypeToRemove] = useState(null);

  // ── In-flight flags ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRemovingType, setIsRemovingType] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use a Set so multiple archive operations can run in parallel.
  const [archivingIds, setArchivingIds] = useState(() => new Set());

  // ── View toggles ──
  const [showArchived, setShowArchived] = useState(false);

  // Search / sort / view
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [viewMode, setViewMode] = useState('grid');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef(null);
  const sortButtonRef = useRef(null);

  /* ---------------- Form state ---------------- */

  // ── Fields for the add/edit account form ──
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currency, setCurrency] = useState(userCurrency);
  const [initialBalance, setInitialBalance] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [icon, setIcon] = useState('Wallet');
  const [customType, setCustomType] = useState('');
  const [formError, setFormError] = useState('');

  /* ---------------- Derived lists ---------------- */

  // ── Custom account types stored on the user ──
  const customTypes = useMemo(
    () => (Array.isArray(user?.custom_account_types) ? user.custom_account_types : []),
    [user]
  );


  // Currency options — include editing account's currency even if it's not in CURRENCIES.
  const allCurrencyOptions = useMemo(() => {
    const set = new Set(Object.keys(CURRENCIES || {}));
    if (editingAccount?.currency) set.add(editingAccount.currency);
    if (currency && !set.has(currency)) set.add(currency);
    return Array.from(set);
  }, [editingAccount, currency]);
  // ── Dynamic Mobile Viewport & Virtual Keypad Height Tracking for Modal ──
  useEffect(() => {
    if (!showAdd || typeof window === 'undefined') return undefined;

    const updateViewportBounds = () => {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      const offsetTop = vv ? vv.offsetTop : 0;
      document.documentElement.style.setProperty('--tx-modal-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--tx-modal-viewport-offset-top', `${offsetTop}px`);
    };

    updateViewportBounds();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateViewportBounds);
      vv.addEventListener('scroll', updateViewportBounds);
    }
    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateViewportBounds);
        vv.removeEventListener('scroll', updateViewportBounds);
      }
      document.documentElement.style.removeProperty('--tx-modal-viewport-height');
      document.documentElement.style.removeProperty('--tx-modal-viewport-offset-top');
    };
  }, [showAdd]);

  const handleAddBalancePreset = useCallback((presetVal) => {
    const current = parseFloat(initialBalance) || 0;
    setInitialBalance(String(current + presetVal));
    setFormError('');
  }, [initialBalance]);

  const handleBalanceChange = useCallback((e) => {
    const clean = e.target.value.replace(/,/g, '.');
    if (clean === '' || /^-?\d*\.?\d{0,2}$/.test(clean)) {
      setInitialBalance(clean);
      setFormError('');
    }
  }, []);

  /* ---------------- Outside‑click / Escape for sort menu ---------------- */
  useEffect(() => {
    if (!showSortMenu) return undefined;

    // ── Close on outside click ──
    const onClickOutside = (e) => {
      if (
        sortMenuRef.current && !sortMenuRef.current.contains(e.target) &&
        sortButtonRef.current && !sortButtonRef.current.contains(e.target)
      ) {
        setShowSortMenu(false);
      }
    };

    // ── Close on Escape and return focus to the trigger ──
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowSortMenu(false);
        sortButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [showSortMenu]);

  /* ============================================================
   * Derived data
   * ============================================================ */

  // ── Filtered and sorted account list ──
  const displayedAccounts = useMemo(() => {
    let list = showArchived
      ? accounts
      : accounts.filter((a) => a.is_active !== false);

    // ── Search filter (name, type, currency, balance) ──
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const name = String(a.name || '').toLowerCase();
        const typeStr = String(a.type || '').toLowerCase();
        const curr = String(a.currency || '').toLowerCase();
        const bal = String(a.current_balance ?? '').toLowerCase();
        return (
          name.includes(q) ||
          typeStr.includes(q) ||
          curr.includes(q) ||
          bal.includes(q)
        );
      });
    }

    // ── Sorting ──
    const sorted = [...list];
    switch (sortBy) {
      case 'name_asc':
        sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        break;
      case 'name_desc':
        sorted.sort((a, b) => String(b.name || '').localeCompare(String(a.name || '')));
        break;
      case 'balance_desc':
        sorted.sort((a, b) => (Number(b.current_balance) || 0) - (Number(a.current_balance) || 0));
        break;
      case 'balance_asc':
        sorted.sort((a, b) => (Number(a.current_balance) || 0) - (Number(b.current_balance) || 0));
        break;
      case 'type_asc':
        sorted.sort((a, b) => String(a.type || '').localeCompare(String(b.type || '')));
        break;
      case 'created_asc':
        sorted.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        break;
      case 'created_desc':
      default:
        sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }
    return sorted;
  }, [accounts, showArchived, searchQuery, sortBy]);

  /**
   * Group by type. Order:
   *   canonical types (bank, wallet, …) → custom types → 'other' (always last)
   */
  const groupedAccounts = useMemo(() => {
    const groups = new Map();
    displayedAccounts.forEach((acc) => {
      const key = String(acc.type || 'other');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(acc);
    });

    // ── Order groups: canonical first, 'other' last, custom alphabetical ──
    const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
      // 'other' always sinks to the bottom.
      if (a === 'other' && b !== 'other') return 1;
      if (b === 'other' && a !== 'other') return -1;
      const ai = ACCOUNT_TYPES.indexOf(a);
      const bi = ACCOUNT_TYPES.indexOf(b);
      const aCanonical = ai !== -1 && a !== 'other';
      const bCanonical = bi !== -1 && b !== 'other';
      if (aCanonical && bCanonical) return ai - bi;
      if (aCanonical) return -1;
      if (bCanonical) return 1;
      return a.localeCompare(b);
    });

    return orderedKeys.map((key) => ({
      type: key,
      label: humanizeType(key),
      accounts: groups.get(key),
    }));
  }, [displayedAccounts]);

  /* ---------------- Net‑worth aggregation ---------------- */
  const {
    totalsByCurrency,
    totalInBase,
    allCurrencies,
    unknownRateCurrencies,
  } = useMemo(() => {
    const totals = {};
    let totalBase = 0;
    const base = userCurrency || 'INR';
    const unknownRates = new Set();

    // ── Sum balances per currency and convert to base ──
    accounts
      .filter((a) => a.is_active !== false)
      .forEach((a) => {
        const curr = a.currency || base;
        const bal = Number(a.current_balance) || 0;
        totals[curr] = (totals[curr] || 0) + bal;

        const converted = convertFxCurrency(
          bal,
          resolveCurrency(curr, base),
          resolveCurrency(base),
          fxRatesToInr
        );
        if (converted == null) {
          unknownRates.add(curr);
        } else {
          totalBase += converted;
        }
      });

    // Account balances already include linked transactions. Include only
    // unassigned transactions here so Accounts and Dashboard reconcile without
    // double-counting account-linked activity.
    for (const transaction of Array.isArray(rawTransactions) ? rawTransactions : []) {
      if (!transaction || transaction.is_deleted === true || transaction.account_id) continue;
      const amount = Number(transaction.amount);
      if (!Number.isFinite(amount)) continue;
      const converted = convertFxCurrency(
        amount,
        resolveCurrency(transaction.currency, base),
        resolveCurrency(base),
        fxRatesToInr
      );
      if (converted === null) continue;
      totalBase += String(transaction.type).toLowerCase() === 'income' ? converted : -converted;
    }

    return {
      totalsByCurrency: totals,
      totalInBase: totalBase,
      allCurrencies: Object.keys(totals),
      unknownRateCurrencies: Array.from(unknownRates),
    };
  }, [accounts, rawTransactions, userCurrency, fxRatesToInr]);

  /* ---------------- Summary stats ---------------- */
  const stats = useMemo(() => {
    const active = accounts.filter((a) => a.is_active !== false);
    const archived = accounts.filter((a) => a.is_active === false);
    const positive = active.filter((a) => Number(a.current_balance) > 0).length;
    const negative = active.filter((a) => Number(a.current_balance) < 0).length;
    return {
      total: accounts.length,
      active: active.length,
      archived: archived.length,
      positive,
      negative,
    };
  }, [accounts]);

  /* ============================================================
   * Form helpers
   * ============================================================ */

  // ── Reset the form to default create-account values ──
  const resetForm = useCallback(() => {
    setName('');
    setType('bank');
    setCurrency(userCurrency);
    setInitialBalance('');
    setColor('#3b82f6');
    setIcon('Wallet');
    setCustomType('');
    setEditingAccount(null);
    setFormError('');
  }, [userCurrency]);

  // ── Populate the form for editing an existing account ──
  const openEdit = useCallback(
    (account) => {
      setEditingAccount(account);
      setName(account.name || '');
      setType(account.type || 'bank');
      setCurrency(account.currency || userCurrency);
      const bal = Number(account.current_balance);
      setInitialBalance(Number.isFinite(bal) ? bal.toFixed(2) : '0.00');
      setColor(account.color || '#3b82f6');
      setIcon(Object.keys(ICONS).includes(account.icon) ? account.icon : 'Wallet');
      setCustomType('');
      setFormError('');
      setShowAdd(true);
    },
    [userCurrency]
  );

  // ── Clear the form error when the user edits any field ──
  const clearError = useCallback(() => {
    setFormError((prev) => (prev ? '' : prev));
  }, []);

  /* ============================================================
   * Validation (pure) — no side effects
   * ============================================================ */

  /**
   * Returns:
   *   { ok: true, payload: {...}, newCustomType: string|null }
   *   { ok: false, error: string }
   */
  const validateForm = useCallback(() => {
    const trimmedName = name.trim();

    // --- Resolve final type ---
    let finalType = type;
    let newCustomType = null; // commit only if the rest of the form is valid

    if (type === 'other') {
      const cType = customType.trim().toLowerCase().replace(/\s+/g, '_');
      if (!cType) return { ok: false, error: 'Custom account type is required.' };
      if (!CUSTOM_TYPE_REGEX.test(cType)) {
        return {
          ok: false,
          error: 'Custom type may only contain letters, numbers and underscores, and must start with a letter.',
        };
      }
      finalType = cType;
      if (!ACCOUNT_TYPES.includes(cType) && !customTypes.includes(cType)) {
        newCustomType = cType;
      }
    }

    // --- Name ---
    if (!trimmedName) return { ok: false, error: 'Account name is required.' };
    if (trimmedName.length > 100) {
      return { ok: false, error: 'Account name must be 100 characters or fewer.' };
    }

    // ── Reject duplicate names (excluding the account being edited) ──
    const editingId = accountId(editingAccount);
    const duplicate = accounts.some(
      (a) =>
        String(a.name || '').toLowerCase() === trimmedName.toLowerCase() &&
        accountId(a) !== editingId
    );
    if (duplicate) {
      return { ok: false, error: 'An account with that name already exists.' };
    }

    // --- Balance (create only) ---
    let balance = 0;
    if (!editingAccount) {
      if (initialBalance === '' || initialBalance === '-' || initialBalance === '.') {
        return { ok: false, error: 'Please enter an initial balance.' };
      }
      if (!BALANCE_REGEX.test(initialBalance)) {
        return {
          ok: false,
          error: 'Balance must be a number with at most two decimal places.',
        };
      }
      balance = Number(initialBalance);
      if (!Number.isFinite(balance) || Math.abs(balance) > MAX_BALANCE) {
        return {
          ok: false,
          error: `Balance must be between -${MAX_BALANCE} and ${MAX_BALANCE}.`,
        };
      }
    }

    return {
      ok: true,
      newCustomType,
      payload: {
        name: trimmedName,
        type: finalType,
        currency,
        initial_balance: balance,
        color,
        icon,
      },
    };
  }, [
    name, type, customType, customTypes, accounts, editingAccount,
    initialBalance, currency, color, icon,
  ]);

  /* ============================================================
   * Submit handler
   * ============================================================ */

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      // ── Validate first ──
      const result = validateForm();
      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setIsSubmitting(true);
      setFormError('');

      try {
        // Persist new custom type BEFORE creating the account.
        if (result.newCustomType) {
          const uid = user?.id || user?._id;
          if (!uid) throw new Error('Missing user id.');
          try {
            await api.updateSettings(uid, {
              custom_account_types: [...customTypes, result.newCustomType],
            });
          } catch (err) {
            console.error('Failed to save custom type:', err);
            setFormError('Could not save custom type. Please try again.');
            setIsSubmitting(false);
            return;
          }
        }

        // ── Edit path vs. create path ──
        if (editingAccount) {
          const payload = {
            name: result.payload.name,
            type: result.payload.type,
            color: result.payload.color,
            icon: result.payload.icon,
          };
          // Only allow currency change when balance is zero.
          if (Math.abs(Number(editingAccount.current_balance) || 0) < 0.005) {
            payload.currency = result.payload.currency;
          }
          await api.updateAccount(accountId(editingAccount), payload);
          showToast('success', 'Account updated successfully!');
        } else {
          await api.createAccount(result.payload);
          showToast('success', 'Account created successfully!');
        }

        resetForm();
        setShowAdd(false);
        await refetch();
      } catch (err) {
        showToast('error', err?.response?.data?.error || 'Failed to save account.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting, validateForm, user, customTypes,
      editingAccount, resetForm, refetch, showToast,
    ]
  );

  /* ============================================================
   * Delete handler
   * ============================================================ */

  const handleDelete = useCallback(async () => {
    if (!accountToDelete || isDeleting) return;
    const id = accountId(accountToDelete);
    if (!id) {
      showToast('error', 'Invalid account reference.');
      setAccountToDelete(null);
      return;
    }

    const hasKnownCount = typeof accountToDelete.transaction_count === 'number';
    const transactionCount = hasKnownCount ? accountToDelete.transaction_count : null;

    // If the count is known and non-zero, block client-side.
    if (hasKnownCount && transactionCount > 0) {
      showToast(
        'error',
        `This account has ${transactionCount} transaction(s). Please delete or reassign them first.`
      );
      setAccountToDelete(null);
      return;
    }

    // If the count is unknown, warn once and let the backend decide.
    if (!hasKnownCount) {
      const proceed = window.confirm(
        'We could not verify whether this account has transactions. The server will refuse the deletion if it does. Continue?'
      );
      if (!proceed) return;
    }

    setIsDeleting(true);
    try {
      await api.deleteAccount(id);
      showToast('success', 'Account deleted.');
      setAccountToDelete(null);
      await refetch();
    } catch (err) {
      console.error(err);
      showToast('error', err?.response?.data?.error || 'Failed to delete account.');
    } finally {
      setIsDeleting(false);
    }
  }, [accountToDelete, isDeleting, refetch, showToast]);

  /* ============================================================
   * Archive / Restore (parallel-safe)
   * ============================================================ */

  const toggleArchive = useCallback(
    async (account) => {
      const id = accountId(account);
      if (!id) return;
      if (archivingIds.has(id)) return;

      // ── Restore when currently archived; otherwise archive ──
      const willRestore = account.is_active === false;

      // ── Track in-flight id ──
      setArchivingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      try {
        await api.updateAccount(id, { is_active: willRestore });
        showToast('success', `Account ${willRestore ? 'restored' : 'archived'}.`);
        await refetch();
      } catch (err) {
        showToast('error', err?.response?.data?.error || 'Failed to update archive status.');
      } finally {
        // ── Remove id from in-flight set ──
        setArchivingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [archivingIds, refetch, showToast]
  );

  /* ============================================================
   * Remove custom type (with confirmation modal)
   * ============================================================ */

  const confirmRemoveCustomType = useCallback(() => {
    if (!customTypeToRemove || isRemovingType) return;
    const uid = user?.id || user?._id;
    if (!uid) {
      showToast('error', 'Missing user id.');
      setCustomTypeToRemove(null);
      return;
    }

    setIsRemovingType(true);
    const newCustom = customTypes.filter((ct) => ct !== customTypeToRemove);

    (async () => {
      try {
        await api.updateSettings(uid, { custom_account_types: newCustom });
        // ── Reset the form type if the removed one was selected ──
        if (type === customTypeToRemove) setType('bank');
        showToast('success', 'Custom type removed.');
        setCustomTypeToRemove(null);
        await refetch();
      } catch {
        showToast('error', 'Failed to remove custom type.');
      } finally {
        setIsRemovingType(false);
      }
    })();
  }, [customTypeToRemove, isRemovingType, user, customTypes, type, refetch, showToast]);

  /* ============================================================
   * Refresh handler
   * ============================================================ */

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refetch();
      showToast('success', 'Accounts refreshed.');
    } catch {
      showToast('error', 'Failed to refresh.');
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refetch, showToast]);

  /* ============================================================
   * Render
   * ============================================================ */

  // ── Show skeleton until the first load completes ──
  if (loading && accounts.length === 0) {
    return <AccountsSkeleton />;
  }

  // ── Derived flags used by the form ──
  const isEditing = Boolean(editingAccount);
  const editingBalanceIsZero =
    isEditing && Math.abs(Number(editingAccount?.current_balance) || 0) < 0.005;

  return (
    <div
      className="account-page"
      style={{ maxWidth: 'var(--content-max-width, 1240px)', margin: '0 auto', width: '100%' }}
    >

      {/* ===================== Header ===================== */}
      {/* ===================== Header ===================== */}
      <header className="island-header glass-sm accounts-header" style={{ marginBottom: '1.25rem' }}>
        {/* ── Page title + subtitle ── */}
        <div className="ih-left">
          <div className="ih-titles">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Landmark className="text-brand" size={24} aria-hidden />
              {tr('accounts', 'Accounts')}
            </h1>
            <p>{tr('bank_accounts', 'Manage your bank accounts, wallets, and credit cards.')}</p>
          </div>
        </div>

        {/* ── Header actions: archive toggle, refresh, add ── */}
        <div className="inbox-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowArchived((s) => !s)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', padding: '8px 14px' }}
            aria-pressed={showArchived}
          >
            {showArchived ? <EyeOff size={15} /> : <Eye size={15} />}
            <span>{showArchived ? 'Hide Archived' : 'Show Archived'}</span>
            {stats.archived > 0 && !showArchived && (
              <span className="ih-badge" style={{ marginLeft: 4 }}>
                {stats.archived}
              </span>
            )}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh accounts"
            aria-label="Refresh accounts"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '8px 14px' }}
          >
            {isRefreshing ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              resetForm();
              setShowAdd(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', padding: '9px 16px' }}
          >
            <Plus size={16} /> <span>{tr('add_account', 'Add Account')}</span>
          </button>
        </div>
      </header>

      {/* ===================== Summary stats ===================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: 'var(--spacing-lg, 24px)',
        }}
      >
        {/* ── Net worth (base currency) ── */}
        <StatCard
          icon={<DollarSign size={14} />}
          label={`${tr('net_worth', 'Net Worth')} (${userCurrency})`}
          value={formatCurrency(totalInBase, userCurrency, locale)}
          sub={
            unknownRateCurrencies.length > 0
              ? `⚠ Excluded: ${unknownRateCurrencies.join(', ')} (no rate)`
              : undefined
          }
        />

        {/* ── Total accounts (active + archived) ── */}
        <StatCard
          icon={<Hash size={14} />}
          label={tr('accounts_count', 'Accounts')}
          value={stats.active}
          sub={`${stats.archived} ${tr('archived', 'archived')} · ${stats.total} ${tr('total', 'total')}`}
        />

        {/* ── Positive balances count ── */}
        <StatCard
          icon={<TrendingUp size={14} />}
          label={tr('positive_balances', 'Positive Balances')}
          value={stats.positive}
          tone="success"
        />

        {/* ── Negative balances count (danger tone when > 0) ── */}
        <StatCard
          icon={<TrendingDown size={14} />}
          label={tr('negative_balances', 'Negative Balances')}
          value={stats.negative}
          tone={stats.negative > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* ===================== Balances by currency ===================== */}
      {allCurrencies.length > 1 && (
        <div
          className="glass"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 12,
            marginBottom: 'var(--spacing-lg, 24px)',
            display: 'flex',
            gap: '1.25rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {tr('currency', 'Balances by Currency')}
          </span>
          {allCurrencies.map((curr) => (
            <span key={curr} style={{ fontWeight: 600 }}>
              {formatCurrency(totalsByCurrency[curr], curr, locale)}
            </span>
          ))}
        </div>
      )}

      {/* ===================== Toolbar ===================== */}
      {accounts.length > 0 && (
        <div
          className="account-toolbar glass"
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            padding: '0.65rem 0.85rem',
            borderRadius: 12,
            marginBottom: 'var(--spacing-lg, 24px)',
            flexWrap: 'wrap',
          }}
        >
          {/* ── Search input ── */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
              aria-hidden
            />
            <input
              type="search"
              placeholder={tr('search_accounts', 'Search by name, type, currency or balance…')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: 32 }}
              aria-label={tr('search_accounts', 'Search accounts')}
              enterKeyHint="search"
            />
          </div>

          {/* ── Sort dropdown ── */}
          <div ref={sortMenuRef} style={{ position: 'relative' }}>
            <button
              ref={sortButtonRef}
              className="btn-secondary"
              onClick={() => setShowSortMenu((s) => !s)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              aria-haspopup="listbox"
              aria-expanded={showSortMenu}
              aria-controls="sort-menu"
            >
              <ArrowUpDown size={14} />
              {SORT_OPTIONS.find((o) => o.value === sortBy)?.label || 'Sort'}
            </button>
            <AnimatePresence>
              {showSortMenu && (
                <motion.ul
                  id="sort-menu"
                  role="listbox"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  style={{
                    position: 'absolute',
                    top: '110%',
                    right: 0,
                    background: 'var(--bg-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 10,
                    listStyle: 'none',
                    padding: '0.35rem',
                    margin: 0,
                    minWidth: 220,
                    zIndex: 20,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  }}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <li key={opt.value} role="option" aria-selected={sortBy === opt.value}>
                      <button
                        type="button"
                        onClick={() => {
                          setSortBy(opt.value);
                          setShowSortMenu(false);
                          sortButtonRef.current?.focus();
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.45rem 0.6rem',
                          background:
                            sortBy === opt.value ? 'var(--bg-color)' : 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                        }}
                      >
                        {opt.label}
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          {/* ── Grid / list view toggle ── */}
          <div
            role="radiogroup"
            aria-label="View mode"
            style={{
              display: 'inline-flex',
              background: 'var(--bg-color)',
              borderRadius: 8,
              padding: 2,
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              className={viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '0.3rem 0.6rem', border: 'none' }}
              aria-label="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '0.3rem 0.6rem', border: 'none' }}
              aria-label="List view"
            >
              <List size={14} />
            </button>
          </div>

          {/* ── Clear search (only when a query is present) ── */}
          {searchQuery && (
            <button
              className="icon-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* ===================== Account groups ===================== */}
      {displayedAccounts.length === 0 ? (
        /* ── Empty state: search vs. no accounts ── */
        <div
          className="accounts-empty glass"
          style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}
        >
          {searchQuery ? (
            <>
              <Search
                size={48}
                style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }}
                aria-hidden
              />
              <h3 style={{ marginBottom: '0.5rem' }}>No matches</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                No accounts match “{searchQuery}”.
              </p>
              <button className="btn-secondary" onClick={() => setSearchQuery('')}>
                Clear search
              </button>
            </>
          ) : (
            <>
              <Landmark
                size={48}
                style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.5 }}
                aria-hidden
              />
              <h3 style={{ marginBottom: '0.5rem' }}>
                {showArchived
                  ? tr('no_archived_accounts', 'No archived accounts')
                  : tr('no_accounts_yet', 'No active accounts yet')}
              </h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                {tr(
                  'create_first_account',
                  'Add your bank, credit, or cash accounts to track where your money lives.'
                )}
              </p>
              {!showArchived && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    resetForm();
                    setShowAdd(true);
                  }}
                >
                  <Plus size={18} /> {tr('add_account', 'Add Account')}
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        /* ── Grouped account cards ── */
        groupedAccounts.map((group) => (
          <section key={group.type} style={{ marginBottom: '2rem' }}>
            {/* ── Group header: label + count ── */}
            <h4
              style={{
                textTransform: 'capitalize',
                color: 'var(--text-muted)',
                marginBottom: '1rem',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '0.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span>{group.label}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>
                {group.accounts.length}
              </span>
            </h4>

            <div
              className={viewMode === 'grid' ? 'accounts-grid' : 'accounts-list'}
              style={
                viewMode === 'grid'
                  ? {
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '1rem',
                    }
                  : { display: 'flex', flexDirection: 'column', gap: '0.65rem' }
              }
            >
              {group.accounts.map((account) => {
                const isArchived = account.is_active === false;
                const id = accountId(account);
                const accent = account.color || '#3b82f6';
                const iconEl = ICONS[account.icon] || <Wallet size={24} />;
                const archiving = id && archivingIds.has(id);
                const balanceNum = Number(account.current_balance) || 0;
                const accCurrency = account.currency || userCurrency;

                return (
                  <motion.div
                    key={id || `name:${account.name}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="account-card glass"
                    style={{
                      '--account-accent': accent,
                      opacity: isArchived ? 0.7 : 1,
                      borderLeftColor: isArchived ? 'var(--text-muted)' : accent,
                      padding: '1rem 1.1rem',
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: viewMode === 'list' ? 'row' : 'column',
                      alignItems: viewMode === 'list' ? 'center' : 'stretch',
                      gap: '1rem',
                      justifyContent: 'space-between',
                    }}
                  >
                    {/* ── Left column: icon + name + type/currency chips ── */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.9rem',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          background: `${accent}20`,
                          color: accent,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                        aria-hidden
                      >
                        {iconEl}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3
                          style={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            marginBottom: '0.15rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={account.name}
                        >
                          {account.name}
                          {isArchived && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                marginLeft: '0.5rem',
                                color: 'var(--text-muted)',
                                fontWeight: 400,
                              }}
                            >
                              (archived)
                            </span>
                          )}
                        </h3>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: 'var(--bg-color)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {humanizeType(account.type)}
                          </span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              color: 'var(--text-muted)',
                              alignSelf: 'center',
                            }}
                          >
                            {accCurrency}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ── Right column: balance + action buttons ── */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        flex: viewMode === 'list' ? '0 0 auto' : 1,
                      }}
                    >
                      <div style={{ textAlign: viewMode === 'list' ? 'right' : 'left' }}>
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.72rem',
                            display: 'block',
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                          }}
                        >
                          Balance
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '1.2rem',
                            fontVariantNumeric: 'tabular-nums',
                            letterSpacing: '-0.01em',
                            color:
                              balanceNum < 0
                                ? 'var(--danger-color, #ef4444)'
                                : 'var(--text-main)',
                          }}
                        >
                          {formatCurrency(balanceNum, accCurrency, locale)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        {/* ── Transaction count hint ── */}
                        {account.transaction_count > 0 && (
                          <span
                            title={`${account.transaction_count} transaction(s)`}
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              marginRight: 4,
                            }}
                          >
                            <Info size={12} />
                            {account.transaction_count}
                          </span>
                        )}

                        {/* ── Edit ── */}
                        <button
                          className="icon-btn"
                          onClick={() => openEdit(account)}
                          aria-label={`Edit account ${account.name}`}
                          title="Edit"
                        >
                          <Edit3 size={15} />
                        </button>

                        {/* ── Archive / restore ── */}
                        <button
                          className="icon-btn"
                          onClick={() => toggleArchive(account)}
                          disabled={Boolean(archiving)}
                          aria-label={
                            isArchived
                              ? `Restore account ${account.name}`
                              : `Archive account ${account.name}`
                          }
                          title={isArchived ? 'Restore' : 'Archive'}
                        >
                          {archiving ? (
                            <Loader2 size={15} className="spin" />
                          ) : isArchived ? (
                            <ArchiveRestore size={15} />
                          ) : (
                            <Archive size={15} />
                          )}
                        </button>

                        {/* ── Delete ── */}
                        <button
                          className="icon-btn"
                          onClick={() => setAccountToDelete(account)}
                          aria-label={`Delete account ${account.name}`}
                          title="Delete"
                          style={{ color: 'var(--danger-color, #ef4444)' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* ===================== Add / Edit Modal ===================== */}
      <AnimatePresence>
        {showAdd && (
          <Modal
            isOpen={showAdd}
            title={isEditing ? 'Edit Account' : 'Add Account'}
            onClose={() => {
              if (isSubmitting) return;
              setShowAdd(false);
              resetForm();
            }}
          >
            <form
              onSubmit={handleSubmit}
              className="account-form"
              noValidate
              onFocusCapture={() => {
                if (typeof window !== 'undefined' && window.scrollY !== 0) window.scrollTo(0, 0);
              }}
            >
              <div className="modal-form-scrollable">
                {/* ── Form Error Banner ── */}
                <AnimatePresence>
                  {formError && (
                    <motion.p
                      id="account-form-error"
                      className="form-error"
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{
                        display: 'flex',
                        gap: '0.4rem',
                        alignItems: 'center',
                        color: 'var(--danger-color, #ef4444)',
                        marginBottom: '1rem',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      <AlertTriangle size={15} /> {formError}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* ── Hero Balance Card (when adding) or Balance Info (when editing) ── */}
                {!isEditing ? (
                  <div className="tx-hero-amount income" style={{ marginBottom: '1.25rem' }}>
                    <div className="tx-amount-label-row">
                      <span className="tx-field-label">Initial Balance *</span>
                      <span className="tx-currency-badge">
                        {CURRENCIES?.[currency]?.symbol || currency} {currency}
                      </span>
                    </div>
                    <div className="tx-amount-display">
                      <span className="tx-amount-symbol" aria-hidden="true">
                        {CURRENCIES?.[currency]?.symbol || currency}
                      </span>
                      <input
                        id="account-balance"
                        type="text"
                        value={initialBalance}
                        onChange={handleBalanceChange}
                        placeholder="0.00"
                        required
                        inputMode="decimal"
                        className="tx-amount-input"
                        aria-label={`Initial Balance in ${currency}`}
                      />
                    </div>
                    {/* Quick Preset Chips */}
                    <div className="tx-amount-presets" role="group" aria-label="Quick balance presets">
                      {[1000, 5000, 10000, 50000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="tx-preset-chip"
                          onClick={() => handleAddBalancePreset(preset)}
                        >
                          +{CURRENCIES?.[currency]?.symbol || ''}{preset.toLocaleString()}
                        </button>
                      ))}
                      {initialBalance ? (
                        <button
                          type="button"
                          className="tx-preset-chip tx-preset-clear"
                          onClick={() => setInitialBalance('')}
                          title="Clear balance"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--glass-border)',
                      padding: '12px 16px',
                      borderRadius: 14,
                      marginBottom: '1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        Current Balance
                      </span>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(initialBalance, currency, locale)}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', maxWidth: 200, textAlign: 'right' }}>
                      Reconciled via transactions
                    </span>
                  </div>
                )}

                {/* ── Account Name ── */}
                <div className="form-field account-form-name" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="account-name" style={{ fontSize: '0.8rem', fontWeight: 650, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Account Name *
                  </label>
                  <input
                    id="account-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearError();
                    }}
                    required
                    maxLength={100}
                    placeholder="e.g. Chase Checking, HDFC Salary"
                    autoComplete="off"
                    autoFocus={!isEditing}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--glass-border)',
                      background: 'var(--surface-1)',
                      color: 'var(--text-primary)',
                      fontSize: '0.92rem',
                    }}
                    aria-describedby={formError ? 'account-form-error' : undefined}
                    aria-invalid={Boolean(formError)}
                  />
                </div>

                {/* ── Segmented Account Type Selector ── */}
                <div style={{ marginBottom: '1.15rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 650, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.45rem' }}>
                    Account Type *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '6px' }}>
                    {[
                      { key: 'bank', label: 'Bank', iconName: 'Landmark', defaultColor: '#3b82f6', emoji: '🏦' },
                      { key: 'credit_card', label: 'Card', iconName: 'CreditCard', defaultColor: '#ef4444', emoji: '💳' },
                      { key: 'wallet', label: 'Wallet', iconName: 'Wallet', defaultColor: '#8b5cf6', emoji: '👛' },
                      { key: 'investment', label: 'Invest', iconName: 'Coins', defaultColor: '#10b981', emoji: '📈' },
                      { key: 'cash', label: 'Cash', iconName: 'Coins', defaultColor: '#f59e0b', emoji: '💵' },
                      { key: 'other', label: 'Other', iconName: 'Wallet', defaultColor: '#6b7280', emoji: '✨' },
                    ].map((tItem) => {
                      const isSelected = type === tItem.key;
                      return (
                        <button
                          key={tItem.key}
                          type="button"
                          onClick={() => {
                            setType(tItem.key);
                            setIcon(tItem.iconName);
                            if (!isEditing) setColor(tItem.defaultColor);
                            clearError();
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            padding: '8px 10px',
                            borderRadius: 10,
                            border: isSelected ? '1px solid var(--brand-primary)' : '1px solid var(--glass-border)',
                            background: isSelected ? 'rgba(14, 165, 233, 0.12)' : 'var(--surface-1)',
                            color: isSelected ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            transition: 'all 0.16s ease',
                          }}
                        >
                          <span>{tItem.emoji}</span>
                          <span>{tItem.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom type input when "other" is selected */}
                  {type === 'other' && (
                    <input
                      type="text"
                      placeholder="Enter custom account type name"
                      value={customType}
                      onChange={(e) => {
                        setCustomType(e.target.value);
                        clearError();
                      }}
                      style={{
                        marginTop: '0.5rem',
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--glass-border)',
                        background: 'var(--surface-1)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                      }}
                      required
                      maxLength={40}
                      aria-label="Custom account type"
                    />
                  )}
                </div>

                {/* ── Currency & Icon Grid ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.15rem' }}>
                  {/* Currency */}
                  <div className="form-field">
                    <label htmlFor="account-currency" style={{ fontSize: '0.78rem', fontWeight: 650, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                      Currency *
                    </label>
                    <select
                      id="account-currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      disabled={isEditing && !editingBalanceIsZero}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--glass-border)',
                        background: 'var(--surface-1)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                      }}
                    >
                      {allCurrencyOptions.map((code) => {
                        const info = CURRENCIES?.[code];
                        return (
                          <option key={code} value={code}>
                            {code} {info?.symbol ? `(${info.symbol})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Icon */}
                  <div className="form-field">
                    <label htmlFor="account-icon" style={{ fontSize: '0.78rem', fontWeight: 650, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                      Icon
                    </label>
                    <select
                      id="account-icon"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--glass-border)',
                        background: 'var(--surface-1)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                      }}
                    >
                      {Object.keys(ICONS).map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ── Color Picker Palette ── */}
                <div className="form-field" style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 650, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.45rem' }}>
                    Card Color Accent
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.55rem',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`color-swatch ${color === c ? 'active' : ''}`}
                        style={{
                          background: c,
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          border: color === c ? '3px solid #ffffff' : '2px solid transparent',
                          boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.16s ease',
                        }}
                        onClick={() => setColor(c)}
                        aria-label={`Choose color ${c}`}
                        aria-pressed={color === c}
                      />
                    ))}
                    <input
                      id="account-color"
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      style={{
                        width: 34,
                        height: 34,
                        padding: 0,
                        border: 'none',
                        cursor: 'pointer',
                        background: 'transparent',
                        borderRadius: '50%',
                      }}
                      aria-label="Custom color picker"
                    />
                  </div>
                </div>
              </div>

              {/* ── Actions ── */}
              <div
                className="account-form-actions"
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--glass-border)',
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowAdd(false);
                    resetForm();
                  }}
                  disabled={isSubmitting}
                  style={{ padding: '9px 18px', borderRadius: 10 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                  style={{
                    padding: '9px 22px',
                    borderRadius: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                  }}
                >
                  {isSubmitting && <Loader2 size={16} className="spin" />}
                  <span>
                    {isSubmitting
                      ? 'Saving…'
                      : isEditing
                        ? 'Update Account'
                        : 'Create Account'}
                  </span>
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* ===================== Delete Modal ===================== */}
      <AnimatePresence>
        {accountToDelete && (
          <Modal
            isOpen={Boolean(accountToDelete)}
            title="Delete Account"
            onClose={() => {
              if (!isDeleting) setAccountToDelete(null);
            }}
          >
            <div style={{ padding: '1rem 0' }}>
              <p>
                Are you sure you want to permanently delete{' '}
                <strong>{accountToDelete.name}</strong>?
              </p>

              {/* ── Known non-zero transaction warning ── */}
              {typeof accountToDelete.transaction_count === 'number' &&
                accountToDelete.transaction_count > 0 && (
                  <p
                    style={{
                      color: 'var(--danger-color, #ef4444)',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                      display: 'flex',
                      gap: '0.4rem',
                      alignItems: 'center',
                    }}
                  >
                    <AlertTriangle size={14} /> This account has{' '}
                    {accountToDelete.transaction_count} transaction(s). They must be
                    deleted or reassigned first.
                  </p>
                )}

              {/* ── Unknown transaction count warning ── */}
              {typeof accountToDelete.transaction_count !== 'number' && (
                <p
                  style={{
                    color: 'var(--warning-color, #f59e0b)',
                    fontSize: '0.875rem',
                    marginTop: '0.5rem',
                    display: 'flex',
                    gap: '0.4rem',
                    alignItems: 'center',
                  }}
                >
                  <AlertTriangle size={14} /> We couldn’t verify this account’s
                  transactions. The server will refuse the deletion if any exist.
                </p>
              )}

              {/* ── Irreversible-action notice ── */}
              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem',
                  marginTop: '0.5rem',
                }}
              >
                This action cannot be undone. Consider archiving instead.
              </p>

              {/* ── Actions ── */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '1rem',
                  marginTop: '2rem',
                }}
              >
                <button
                  className="btn-secondary"
                  disabled={isDeleting}
                  onClick={() => setAccountToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ background: 'var(--danger-color, #ef4444)' }}
                  onClick={handleDelete}
                  disabled={
                    isDeleting ||
                    (typeof accountToDelete.transaction_count === 'number' &&
                      accountToDelete.transaction_count > 0)
                  }
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ===================== Remove Custom Type Modal ===================== */}
      <AnimatePresence>
        {customTypeToRemove && (
          <Modal
            isOpen={Boolean(customTypeToRemove)}
            title="Remove Custom Type"
            onClose={() => {
              if (!isRemovingType) setCustomTypeToRemove(null);
            }}
          >
            <div style={{ padding: '1rem 0' }}>
              <p>
                Remove <strong>{humanizeType(customTypeToRemove)}</strong> from your
                custom account types?
              </p>

              {/* ── Explains the effect on existing accounts ── */}
              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem',
                  marginTop: '0.5rem',
                }}
              >
                Accounts that already use this type will keep it, but it will no
                longer appear when creating new accounts.
              </p>

              {/* ── Actions ── */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '1rem',
                  marginTop: '2rem',
                }}
              >
                <button
                  className="btn-secondary"
                  disabled={isRemovingType}
                  onClick={() => setCustomTypeToRemove(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ background: 'var(--danger-color, #ef4444)' }}
                  onClick={confirmRemoveCustomType}
                  disabled={isRemovingType}
                >
                  {isRemovingType ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}