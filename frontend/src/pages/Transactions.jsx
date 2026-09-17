import React, {
  useState, useContext, useMemo, useDeferredValue, useRef, useEffect, useCallback,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, ArrowUpRight, ArrowDownRight,
  Trash2, Edit3, Plus, Wallet, FileText, X,
  Download, Upload, Copy, CheckSquare, Square,
  FileSpreadsheet, FileCode, CheckCircle2, ChevronDown,
  Layers, RefreshCw, Undo2, AlertTriangle, Loader2, Tag,
  Calendar, DollarSign, Keyboard, Receipt,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import TransactionForm from '../components/TransactionForm';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';
import { api } from '../services/api';

/* ============================================================
 * Constants
 * ============================================================ */
const DEFAULT_CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Shopping', 'Entertainment',
  'Health', 'Education', 'Bills', 'Salary', 'Freelance', 'Gift',
  'Rent', 'Travel', 'Fitness', 'Subscriptions', 'Utilities',
  'Insurance', 'Investment', 'Transfer', 'Other', 'Allowance',
];

const LOCALE_MAP = {
  en: 'en-US', hi: 'hi-IN', mr: 'mr-IN', bgc: 'hi-IN', kn: 'kn-IN',
};
const resolveLocale = (lang) =>
  LOCALE_MAP[lang] || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

const ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
};

const UNDO_TIMEOUT_MS = 6000;

/* ============================================================
 * Helpers
 * ============================================================ */
const pad2 = (n) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD (no UTC shift). */
const toLocalDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** CSV escape + injection prevention (RFC 4180). */
const escapeCsvField = (raw) => {
  const str = raw == null ? '' : String(raw);
  const needsPrefix = /^[=+\-@\t\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  const prefixed = needsPrefix ? `'${escaped}` : escaped;
  const needsQuotes = needsPrefix || /[",\n\r\t]/.test(prefixed);
  return needsQuotes ? `"${prefixed}"` : prefixed;
};

/** Stable transaction id that never collides. */
const getTransactionId = (transaction) => {
  const id = transaction?.id ?? transaction?._id;
  return id == null ? '' : String(id);
};

const isLiveTransaction = (tx) => tx && typeof tx === 'object' && tx.is_deleted !== true;

/** Highlight a search term inside text (returns JSX fragments). */
const highlight = (text, query) => {
  const str = String(text || '');
  const q = String(query || '').trim();
  if (!q) return str;
  const idx = str.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return str;
  return (
    <>
      {str.slice(0, idx)}
      <mark className="tx-highlight">{str.slice(idx, idx + q.length)}</mark>
      {str.slice(idx + q.length)}
    </>
  );
};

/* ============================================================
 * Component
 * ============================================================ */
export default function Transactions() {
  const {
    transactions: rawTransactions = [],
    deleteTransaction,
    editTransaction,
    addTransaction,
    fmt,
    user,
    currencyInfo,
    USER_ID,
    refetch,
    t,
    lang = 'en',
    loading: contextLoading,
  } = useContext(AppContext);
  const { showToast } = useToast();

  const tr = useCallback((key, fallback) => t?.(key) || fallback, [t]);
  const locale = useMemo(() => resolveLocale(lang), [lang]);

  /* ---------------- Live transactions ---------------- */
  const transactions = useMemo(
    () => (Array.isArray(rawTransactions) ? rawTransactions.filter(isLiveTransaction) : []),
    [rawTransactions]
  );

  /* ---------------- Search / filter state ---------------- */
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [activePreset, setActivePreset] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  /* ---------------- Selection ---------------- */
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectedTxId, setSelectedTxId] = useState(null);

  /* ---------------- Bulk action state ---------------- */
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkOperating, setIsBulkOperating] = useState(false);
  const [bulkEdit, setBulkEdit] = useState({
    category: '',
    type: '',
    date: '',
  });

  /* ---------------- CRUD state ---------------- */
  const [deletingTx, setDeletingTx] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [duplicateTxData, setDuplicateTxData] = useState(null);

  /* ---------------- Import state ---------------- */
  const [showImportModal, setShowImportModal] = useState(false);
  const [statementRows, setStatementRows] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isAnalyzingStatement, setIsAnalyzingStatement] = useState(false);
  const fileInputRef = useRef(null);

  /* ---------------- Export ---------------- */
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  /* ---------------- Undo ---------------- */
  const [undoState, setUndoState] = useState(null);
  const undoTimerRef = useRef(null);
  const searchInputRef = useRef(null);
  const detailPaneRef = useRef(null);

  useEffect(() => {
    if (selectedTxId && detailPaneRef.current && window.innerWidth <= 992) {
      detailPaneRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedTxId]);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  const armUndo = useCallback((label, restoreFn) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState({ label, restoreFn });
    undoTimerRef.current = setTimeout(() => setUndoState(null), UNDO_TIMEOUT_MS);
  }, []);

  const runUndo = useCallback(async () => {
    if (!undoState) return;
    const { restoreFn } = undoState;
    setUndoState(null);
    try {
      await restoreFn();
      await refetch();
      showToast('success', tr('undo_success', 'Restored'));
    } catch {
      showToast('error', tr('undo_failed', 'Could not undo'));
    }
  }, [undoState, refetch, showToast, tr]);

  /* ============================================================
   * Categories + tags (derived from data)
   * ============================================================ */
  const categories = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES);
    transactions.forEach((tx) => { if (tx.category) set.add(String(tx.category)); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  const allTags = useMemo(() => {
    const set = new Set();
    transactions.forEach((tx) => {
      if (Array.isArray(tx.tags)) tx.tags.forEach((tg) => tg && set.add(String(tg)));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  /* ============================================================
   * Filter + sort
   * ============================================================ */
  const filtered = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const search = deferredSearchTerm.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const toTs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
    const minAmt = amountMin !== '' ? Number(amountMin) : null;
    const maxAmt = amountMax !== '' ? Number(amountMax) : null;

    let result = transactions.filter((tx) => {
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (filterCategory !== 'all' && tx.category !== filterCategory) return false;
      if (filterTag !== 'all' && !(Array.isArray(tx.tags) && tx.tags.includes(filterTag))) return false;

      if (search) {
        const hay = `${tx.category || ''} ${tx.note || ''} ${tx.merchant || ''} ${tx.amount || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }

      const ts = new Date(tx.date).getTime();
      if (Number.isFinite(ts)) {
        if (fromTs != null && ts < fromTs) return false;
        if (toTs != null && ts > toTs) return false;
      }

      const amt = safeNumber(tx.amount, 0);
      if (minAmt != null && Number.isFinite(minAmt) && amt < minAmt) return false;
      if (maxAmt != null && Number.isFinite(maxAmt) && amt > maxAmt) return false;

      // Presets
      if (activePreset === 'thisMonth') {
        const d = new Date(tx.date);
        if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return false;
      } else if (activePreset === 'highValue') {
        if (amt < 500) return false;
      } else if (activePreset === 'uncategorized') {
        if (tx.category && tx.category !== 'Other' && tx.category !== 'Uncategorized') return false;
      } else if (activePreset === 'income') {
        if (tx.type !== 'income') return false;
      } else if (activePreset === 'expense') {
        if (tx.type !== 'expense') return false;
      }

      return true;
    });

    const safeTime = (d) => {
      const ts = new Date(d).getTime();
      return Number.isFinite(ts) ? ts : 0;
    };

    result.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc': return safeTime(b.date) - safeTime(a.date);
        case 'date-asc': return safeTime(a.date) - safeTime(b.date);
        case 'amount-desc': return safeNumber(b.amount, 0) - safeNumber(a.amount, 0);
        case 'amount-asc': return safeNumber(a.amount, 0) - safeNumber(b.amount, 0);
        case 'category-asc':
          return String(a.category || '').localeCompare(String(b.category || ''));
        default: return 0;
      }
    });

    return result;
  }, [
    transactions, deferredSearchTerm, filterType, filterCategory, filterTag,
    activePreset, sortBy, dateFrom, dateTo, amountMin, amountMax,
  ]);

  const hasActiveFilters =
    searchTerm || filterType !== 'all' || filterCategory !== 'all' ||
    filterTag !== 'all' || activePreset !== 'all' || dateFrom || dateTo ||
    amountMin !== '' || amountMax !== '';

  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    setFilterType('all');
    setFilterCategory('all');
    setFilterTag('all');
    setActivePreset('all');
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
  }, []);

  /* ============================================================
   * Selected transaction
   * ============================================================ */
  const selectedTx = useMemo(() => {
    if (!selectedTxId) return null;
    return transactions.find((tx) => getTransactionId(tx) === String(selectedTxId)) || null;
  }, [selectedTxId, transactions]);

  /* ============================================================
   * Selection handlers
   * ============================================================ */
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length && filtered.length > 0) return new Set();
      return new Set(filtered.map(getTransactionId).filter(Boolean));
    });
  }, [filtered]);

  const toggleSelectOne = useCallback((id, e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (!id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /* ============================================================
   * Bulk delete (with undo)
   * ============================================================ */
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0 || isBulkOperating) return;
    const idsToDelete = Array.from(selectedIds);
    const snapshot = idsToDelete
      .map((id) => transactions.find((tx) => getTransactionId(tx) === id))
      .filter(Boolean);

    setIsBulkOperating(true);
    try {
      if (typeof api.bulkDeleteTransactions === 'function') {
        await api.bulkDeleteTransactions(idsToDelete);
      } else {
        // Fallback: parallel single deletes
        const results = await Promise.allSettled(idsToDelete.map((id) => deleteTransaction(id)));
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) throw new Error(`${failures.length} of ${idsToDelete.length} failed`);
      }
      showToast('success', tr('bulk_deleted', `Deleted ${idsToDelete.length} transactions`));

      // Snapshot for undo
      const restoreFn = async () => {
        for (const tx of snapshot) {
          const { id, _id, ...rest } = tx;
          await addTransaction({ ...rest, date: toLocalDateKey(tx.date) });
        }
      };
      armUndo(tr('bulk_deleted_undo', `${idsToDelete.length} deleted`), restoreFn);

      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      if (selectedIds.has(String(selectedTxId))) setSelectedTxId(null);
      await refetch();
    } catch (err) {
      showToast('error', err?.message || tr('bulk_delete_failed', 'Failed to delete some transactions'));
    } finally {
      setIsBulkOperating(false);
    }
  }, [selectedIds, isBulkOperating, transactions, deleteTransaction, addTransaction, refetch, showToast, tr, armUndo, selectedTxId]);

  /* ============================================================
   * Bulk edit (category, type, date) — parallel with allSettled
   * ============================================================ */
  const handleBulkEdit = useCallback(async () => {
    if (selectedIds.size === 0 || isBulkOperating) return;
    const patch = {};
    if (bulkEdit.category) patch.category = bulkEdit.category;
    if (bulkEdit.type) patch.type = bulkEdit.type;
    if (bulkEdit.date) patch.date = bulkEdit.date;
    if (Object.keys(patch).length === 0) {
      showToast('error', tr('bulk_no_change', 'Choose at least one field to update.'));
      return;
    }

    setIsBulkOperating(true);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) => editTransaction(id, patch))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        showToast('error', tr('bulk_edit_partial', `${failed} of ${ids.length} failed to update.`));
      } else {
        showToast('success', tr('bulk_edit_success', `Updated ${ids.length} transactions.`));
      }
      setSelectedIds(new Set());
      setShowBulkEditModal(false);
      setBulkEdit({ category: '', type: '', date: '' });
      await refetch();
    } catch (err) {
      showToast('error', err?.message || tr('bulk_edit_failed', 'Failed to update transactions.'));
    } finally {
      setIsBulkOperating(false);
    }
  }, [selectedIds, isBulkOperating, bulkEdit, editTransaction, refetch, showToast, tr]);

  /* ============================================================
   * Single delete (with undo)
   * ============================================================ */
  const confirmDelete = useCallback(async () => {
    if (!deletingTx || isDeleting) return;
    const id = getTransactionId(deletingTx);
    if (!id) {
      showToast('error', tr('tx_invalid', 'Invalid transaction.'));
      setDeletingTx(null);
      return;
    }
    const snapshot = { ...deletingTx };
    setIsDeleting(true);
    try {
      await deleteTransaction(id);
      showToast('success', tr('tx_deleted', 'Transaction deleted'));
      if (String(selectedTxId) === id) setSelectedTxId(null);
      setDeletingTx(null);
      await refetch();

      const restoreFn = async () => {
        const { id: _i, _id: _ii, ...rest } = snapshot;
        await addTransaction({ ...rest, date: toLocalDateKey(snapshot.date) });
      };
      armUndo(tr('tx_deleted', 'Transaction deleted'), restoreFn);
    } catch (err) {
      showToast('error', err?.message || tr('tx_delete_failed', 'Failed to delete transaction'));
    } finally {
      setIsDeleting(false);
    }
  }, [deletingTx, isDeleting, deleteTransaction, refetch, showToast, tr, selectedTxId, addTransaction, armUndo]);

  /* ============================================================
   * Add / edit / duplicate submits — with error toasts
   * ============================================================ */
  const handleAdd = useCallback(async (tx) => {
    try {
      await addTransaction(tx);
      setIsAdding(false);
      showToast('success', tr('tx_added', 'Transaction added'));
    } catch (err) {
      showToast('error', err?.message || tr('tx_add_failed', 'Failed to add transaction'));
    }
  }, [addTransaction, showToast, tr]);

  const handleDuplicate = useCallback(async (tx) => {
    try {
      await addTransaction(tx);
      setDuplicateTxData(null);
      showToast('success', tr('tx_duplicated', 'Transaction duplicated'));
    } catch (err) {
      showToast('error', err?.message || tr('tx_duplicate_failed', 'Failed to duplicate'));
    }
  }, [addTransaction, showToast, tr]);

  const handleEdit = useCallback(async (tx) => {
    try {
      const id = getTransactionId(editingTx);
      await editTransaction(id, tx);
      setEditingTx(null);
      showToast('success', tr('tx_updated', 'Transaction updated'));
    } catch (err) {
      showToast('error', err?.message || tr('tx_update_failed', 'Failed to update transaction'));
    }
  }, [editTransaction, editingTx, showToast, tr]);

  /* ============================================================
   * Duplicate action
   * ============================================================ */
  const prepareDuplicate = useCallback((tx) => {
    setDuplicateTxData({
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      note: tx.note ? `${tx.note} (Copy)` : 'Copy',
      date: toLocalDateKey(new Date()),  // local date, not UTC
      merchant: tx.merchant,
      tags: tx.tags,
      payment_method: tx.payment_method,
      is_recurring: tx.is_recurring,
      recurrence_interval: tx.recurrence_interval,
    });
  }, []);

  /* ============================================================
   * CSV export (RFC 4180 + BOM)
   * ============================================================ */
  const handleExportCSV = useCallback((exportSelected = false) => {
    const listToExport = exportSelected
      ? filtered.filter((t) => selectedIds.has(getTransactionId(t)))
      : filtered;

    if (listToExport.length === 0) {
      showToast('error', tr('nothing_to_export', 'No transactions to export'));
      return;
    }

    try {
      const headers = ['Date', 'Type', 'Category', 'Merchant', 'Note', 'Tags', 'Amount'];
      const rows = listToExport.map((t) => [
        toLocalDateKey(t.date),
        t.type,
        t.category || '',
        t.merchant || '',
        t.note || '',
        Array.isArray(t.tags) ? t.tags.join(',') : '',
        safeNumber(t.amount, 0).toFixed(2),
      ]);

      const csvContent = [
        headers.map(escapeCsvField).join(','),
        ...rows.map((r) => r.map(escapeCsvField).join(',')),
      ].join('\n');

      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transactions_${exportSelected ? 'selected_' : ''}${toLocalDateKey(new Date())}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
      showToast('success', tr('csv_exported', 'CSV downloaded'));
    } catch (err) {
      console.error(err);
      showToast('error', tr('export_failed', 'Export failed'));
    }
  }, [filtered, selectedIds, showToast, tr]);

  /* ============================================================
   * JSON export (sanitized payload)
   * ============================================================ */
  const handleExportJSON = useCallback(() => {
    try {
      const sanitized = filtered.map((t) => ({
        date: toLocalDateKey(t.date),
        type: t.type,
        category: t.category,
        merchant: t.merchant,
        note: t.note,
        tags: t.tags,
        amount: safeNumber(t.amount, 0),
        payment_method: t.payment_method,
      }));
      const blob = new Blob([JSON.stringify(sanitized, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transactions_${toLocalDateKey(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
      showToast('success', tr('json_exported', 'JSON downloaded'));
    } catch (err) {
      console.error(err);
      showToast('error', tr('export_failed', 'Export failed'));
    }
  }, [filtered, showToast, tr]);

  /* ============================================================
   * PDF export (lazy-loaded)
   * ============================================================ */
  const handleExportPDF = useCallback(async () => {
    setShowExportMenu(false);
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { exportToPDF } = await import('../services/pdfExport');
      await exportToPDF(user, filtered, currencyInfo, locale);
      showToast('success', tr('pdf_generated', 'PDF report generated'));
    } catch (err) {
      console.error(err);
      showToast('error', tr('pdf_failed', 'Failed to generate PDF'));
    } finally {
      setIsExporting(false);
    }
  }, [user, filtered, currencyInfo, locale, showToast, tr, isExporting]);

  /* ============================================================
   * Bank statement import
   * ============================================================ */
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('error', tr('file_too_large', 'Please choose a CSV smaller than 5 MB.'));
      e.target.value = '';
      return;
    }
    setIsAnalyzingStatement(true);
    try {
      const analysis = await api.previewBankStatement(await file.text(), file.name);
      const rows = (analysis.transactions || []).map((row) => ({
        ...row,
        selected: !row.duplicate,
        id: row.id || `${row.date}-${row.merchant}-${row.amount}-${Math.random().toString(36).slice(2, 8)}`,
      }));
      setStatementRows(rows);
      setShowImportModal(true);
      showToast('success', tr(
        'statement_detected',
        `${analysis.summary?.detected || rows.length} transactions detected. Review before adding.`
      ));
    } catch (error) {
      showToast('error', error?.response?.data?.error || tr(
        'statement_failed',
        'Could not analyze this statement. Please export it as CSV from your bank.'
      ));
    } finally {
      setIsAnalyzingStatement(false);
      e.target.value = '';
    }
  }, [showToast, tr]);

  const updateStatementRow = useCallback((id, patch) => {
    setStatementRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const selectedStatementCount = useMemo(
    () => statementRows.filter((row) => row.selected).length,
    [statementRows]
  );

  const handleConfirmImport = useCallback(async () => {
    const selections = statementRows.filter((row) => row.selected);
    if (selections.length === 0 || isImporting) return;
    setIsImporting(true);
    try {
      const result = await api.importBankStatement(selections);
      showToast('success', tr(
        'import_success',
        `${result.created} transaction${result.created === 1 ? '' : 's'} added${result.skipped ? `; ${result.skipped} skipped.` : '.'}`
      ));
      setShowImportModal(false);
      setStatementRows([]);
      await refetch();
    } catch (error) {
      showToast('error', error?.response?.data?.error || tr('import_failed', 'Could not add the selected transactions.'));
    } finally {
      setIsImporting(false);
    }
  }, [statementRows, isImporting, showToast, tr, refetch]);

  /* ============================================================
   * Copy transaction summary
   * ============================================================ */
  const copyTransactionSummary = useCallback(async (tx) => {
    const summary = [
      `${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)}`,
      tx.category,
      toLocalDateKey(tx.date),
      tx.merchant || null,
      tx.note || null,
    ].filter(Boolean).join(' · ');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        showToast('success', tr('copied', 'Copied to clipboard'));
      } else {
        showToast('error', tr('clipboard_unavailable', 'Clipboard not available'));
      }
    } catch {
      showToast('error', tr('copy_failed', 'Failed to copy'));
    }
  }, [fmt, showToast, tr]);

  /* ============================================================
   * Keyboard shortcuts
   * ============================================================ */
  useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      const inField = target instanceof HTMLElement && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.tagName === 'SELECT'
      );

      if (e.key === '/' && !inField) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if ((e.key === 'n' || e.key === 'N') && !inField && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsAdding(true);
        return;
      }
      if (e.key === 'Escape' && !inField) {
        if (selectedIds.size > 0) {
          clearSelection();
        } else if (hasActiveFilters) {
          clearAllFilters();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds.size, hasActiveFilters, clearSelection, clearAllFilters]);

  /* ============================================================
   * Memoized totals
   * ============================================================ */
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      const amt = safeNumber(tx.amount, 0);
      if (tx.type === 'income') income += amt;
      else if (tx.type === 'expense') expense += amt;
    }
    return { income, expense, net: income - expense };
  }, [transactions]);

  /* ============================================================
   * Loading state
   * ============================================================ */
  if (contextLoading && transactions.length === 0) {
    return (
      <div className="inbox-layout-page">
        <div className="inbox-header">
          <div className="ih-titles">
            <h2>{tr('transactions', 'Transactions')}</h2>
          </div>
        </div>
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center', borderRadius: 14 }}>
          <Loader2 className="spin" size={36} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
          <p style={{ color: 'var(--text-muted)' }}>{tr('loading', 'Loading…')}</p>
        </div>
      </div>
    );
  }

  /* ============================================================
   * Render
   * ============================================================ */
  const allFilteredSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <div className="inbox-layout-page">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .tx-highlight {
          background: rgba(245,158,11,0.35);
          padding: 0 2px;
          border-radius: 3px;
          color: inherit;
        }
      `}</style>

      <input
        type="file"
        ref={fileInputRef}
        accept=".csv,.txt,text/csv"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="inbox-header">
        <div className="ih-titles">
          <h2>{tr('transactions', 'Transactions')}</h2>
          <span className="ih-badge">
            {filtered.length} / {transactions.length}
          </span>
        </div>

        <div className="inbox-header-actions">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="btn-secondary tx-import-btn"
            onClick={() => fileInputRef.current?.click()}
            title={tr('import_title', 'Import and review a bank statement CSV')}
            disabled={isAnalyzingStatement}
          >
            {isAnalyzingStatement ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
            {isAnalyzingStatement ? tr('analyzing', 'Analyzing…') : tr('import_statement', 'Import Statement')}
          </motion.button>

          <div className="dropdown-container" style={{ position: 'relative' }}>
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="btn-secondary tx-export-btn"
              onClick={() => setShowExportMenu((v) => !v)}
              aria-expanded={showExportMenu}
              aria-haspopup="menu"
            >
              <Download size={15} /> {tr('export', 'Export')} <ChevronDown size={14} />
            </motion.button>

            <AnimatePresence>
              {showExportMenu && (
                <motion.div
                  className="tx-export-dropdown glass"
                  role="menu"
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button type="button" role="menuitem" className="tx-export-item" onClick={() => handleExportCSV(false)}>
                    <FileSpreadsheet size={15} className="text-success" aria-hidden /> {tr('export_csv', 'Export CSV (Excel)')}
                  </button>
                  <button type="button" role="menuitem" className="tx-export-item" onClick={handleExportPDF} disabled={isExporting}>
                    {isExporting ? <Loader2 size={15} className="spin" /> : <FileText size={15} className="text-danger" aria-hidden />}
                    {isExporting ? tr('generating', 'Generating…') : tr('export_pdf', 'Export PDF Report')}
                  </button>
                  <button type="button" role="menuitem" className="tx-export-item" onClick={handleExportJSON}>
                    <FileCode size={15} className="text-brand" aria-hidden /> {tr('export_json', 'Export JSON')}
                  </button>
                  {selectedIds.size > 0 && (
                    <button type="button" role="menuitem" className="tx-export-item" onClick={() => handleExportCSV(true)}>
                      <CheckSquare size={15} aria-hidden /> {tr('export_selected', 'Export Selected')} ({selectedIds.size})
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            type="button"
            aria-label={tr('add_transaction', 'Add transaction')}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="btn-primary"
            onClick={() => setIsAdding(true)}
          >
            <Plus size={16} /> {tr('add_transaction', 'Add New')}
          </motion.button>
        </div>
      </div>

      {/* Quick presets */}
      <div className="tx-presets-strip" role="group" aria-label={tr('quick_filters', 'Quick filters')}>
        {[
          { id: 'all', label: tr('category_all', 'All') },
          { id: 'thisMonth', label: tr('this_month', 'This Month') },
          { id: 'highValue', label: tr('high_value', 'High Value (>500)') },
          { id: 'uncategorized', label: tr('uncategorized', 'Uncategorized') },
          { id: 'income', label: tr('income_label', 'Income') },
          { id: 'expense', label: tr('expense_label', 'Expense') },
        ].map((p) => (
          <button
            key={p.id}
            type="button"
            className={`tx-preset-pill ${activePreset === p.id ? 'active' : ''}`}
            onClick={() => setActivePreset(p.id)}
            aria-pressed={activePreset === p.id}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Bulk toolbar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            className="tx-bulk-toolbar glass"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            role="region"
            aria-label={tr('bulk_actions', 'Bulk actions')}
          >
            <div className="tbt-left">
              <span className="tbt-count">
                <CheckCircle2 size={16} className="text-success" aria-hidden />
                {selectedIds.size} {tr('selected', 'selected')}
              </span>
            </div>
            <div className="tbt-actions">
              <button type="button" className="tbt-btn" onClick={() => setShowBulkEditModal(true)}>
                <Layers size={14} aria-hidden /> {tr('bulk_edit', 'Bulk Edit')}
              </button>
              <button type="button" className="tbt-btn danger" onClick={() => setShowBulkDeleteModal(true)}>
                <Trash2 size={14} aria-hidden /> {tr('delete_selected', 'Delete Selected')}
              </button>
              <button
                type="button"
                className="tbt-btn-close"
                onClick={clearSelection}
                aria-label={tr('deselect_all', 'Deselect all')}
                title={tr('deselect_all', 'Deselect all')}
              >
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="inbox-split-pane">
        {/* LEFT: list */}
        <div className="inbox-list-pane glass">
          <div className="il-filters">
            <div className="il-search">
              <Search className="il-search-icon" size={16} aria-hidden />
              <input
                ref={searchInputRef}
                aria-label={tr('search_transactions', 'Search transactions')}
                placeholder={tr('search_transactions_placeholder', 'Search category, note, merchant, amount…')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="icon-btn il-search-clear"
                  onClick={() => setSearchTerm('')}
                  aria-label={tr('clear_search', 'Clear search')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="il-controls">
              <select
                aria-label={tr('filter_by_type', 'Filter by type')}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">{tr('all_types', 'All Types')}</option>
                <option value="income">{tr('income_label', 'Income')}</option>
                <option value="expense">{tr('expense_label', 'Expense')}</option>
              </select>

              <select
                aria-label={tr('filter_by_category', 'Filter by category')}
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="all">{tr('all_categories', 'All Categories')}</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              {allTags.length > 0 && (
                <select
                  aria-label={tr('filter_by_tag', 'Filter by tag')}
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                >
                  <option value="all">{tr('all_tags', 'All Tags')}</option>
                  {allTags.map((tg) => <option key={tg} value={tg}>#{tg}</option>)}
                </select>
              )}

              <select
                aria-label={tr('sort_transactions', 'Sort transactions')}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date-desc">{tr('newest', 'Newest')}</option>
                <option value="date-asc">{tr('oldest', 'Oldest')}</option>
                <option value="amount-desc">{tr('highest_amount', 'Highest')}</option>
                <option value="amount-asc">{tr('lowest_amount', 'Lowest')}</option>
                <option value="category-asc">{tr('by_category', 'Category')}</option>
              </select>

              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowAdvancedFilters((v) => !v)}
                aria-label={tr('advanced_filters', 'Advanced filters')}
                aria-expanded={showAdvancedFilters}
                title={tr('advanced_filters', 'Advanced filters')}
              >
                <Filter size={16} />
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={clearAllFilters}
                  aria-label={tr('clear_filters', 'Clear filters')}
                  title={tr('clear_filters', 'Clear filters')}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <AnimatePresence>
              {showAdvancedFilters && (
                <motion.div
                  className="il-advanced-filters"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="ilaf-row">
                    <label>
                      <Calendar size={12} aria-hidden /> {tr('from', 'From')}
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      <Calendar size={12} aria-hidden /> {tr('to', 'To')}
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="ilaf-row">
                    <label>
                      <DollarSign size={12} aria-hidden /> {tr('min_amount', 'Min amount')}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amountMin}
                        onChange={(e) => setAmountMin(e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label>
                      <DollarSign size={12} aria-hidden /> {tr('max_amount', 'Max amount')}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amountMax}
                        onChange={(e) => setAmountMax(e.target.value)}
                        placeholder="—"
                      />
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {filtered.length > 0 && (
            <div className="il-select-all-bar">
              <button
                type="button"
                className="il-select-all-btn"
                onClick={toggleSelectAll}
                aria-pressed={allFilteredSelected}
              >
                {allFilteredSelected ? (
                  <CheckSquare size={16} className="text-brand" aria-hidden />
                ) : (
                  <Square size={16} aria-hidden />
                )}
                <span>{tr('select_all', 'Select All')} ({filtered.length})</span>
              </button>
            </div>
          )}

          <div className="sr-only" aria-live="polite">
            {tr('showing', 'Showing')} {filtered.length} {tr('of', 'of')} {transactions.length}
          </div>

          <div className="il-scrollable">
            {transactions.length === 0 ? (
              <div className="il-empty">
                <Wallet size={36} opacity={0.3} aria-hidden />
                <p>{tr('no_transactions', 'No transactions yet')}</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setIsAdding(true)}
                  style={{ marginTop: 10 }}
                >
                  <Plus size={14} aria-hidden /> {tr('add_first_transaction', 'Add First Transaction')}
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="il-empty">
                <Filter size={36} opacity={0.3} aria-hidden />
                <p>{tr('no_tx_found', 'No matching transactions')}</p>
                <button type="button" className="btn-secondary" onClick={clearAllFilters}>
                  {tr('clear_filters', 'Reset Filters')}
                </button>
              </div>
            ) : (
              <AnimatePresence>
                {filtered.map((tx) => {
                  const transactionId = getTransactionId(tx);
                  const isSelected = selectedIds.has(transactionId);
                  const isActive = String(selectedTxId) === transactionId;
                  const rowKey = transactionId || `tx-${Math.random().toString(36).slice(2, 8)}`;
                  return (
                    <motion.div
                      key={rowKey}
                      variants={ITEM_VARIANTS}
                      initial="hidden"
                      animate="show"
                      exit={{ opacity: 0, height: 0 }}
                      layout
                      className={`il-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedTxId(transactionId)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${tx.category}, ${tx.type}, ${fmt(tx.amount)}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTxId(transactionId);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="il-checkbox-btn"
                        onClick={(e) => toggleSelectOne(transactionId, e)}
                        aria-label={isSelected
                          ? tr('deselect_transaction', 'Deselect transaction')
                          : tr('select_transaction', 'Select transaction')}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? (
                          <CheckSquare size={16} className="text-brand" aria-hidden />
                        ) : (
                          <Square size={16} aria-hidden />
                        )}
                      </button>

                      <div className={`ili-icon ${tx.type}`} aria-hidden>
                        {tx.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      </div>
                      <div className="ili-info">
                        <p className="ili-cat">{highlight(tx.category || '', deferredSearchTerm)}</p>
                        <p className="ili-date">
                          {new Date(tx.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                          {tx.merchant && <span className="ili-note-snip"> · {highlight(tx.merchant, deferredSearchTerm)}</span>}
                          {!tx.merchant && tx.note && <span className="ili-note-snip"> · {highlight(tx.note, deferredSearchTerm)}</span>}
                        </p>
                      </div>
                      <div className="ili-amount">
                        <span className={tx.type}>
                          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* RIGHT: details */}
        <div
          className={`inbox-detail-pane ${selectedTx ? 'has-ticket' : 'glass'}`}
          ref={detailPaneRef}
        >
          <AnimatePresence>
            {selectedTx ? (
              <motion.div
                key={getTransactionId(selectedTx)}
                className="tx-ticket-card"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Top Bar: Receipt branding & Dismiss button */}
                <div className="tx-ticket-topbar">
                  <div className="tx-ticket-badge">
                    <Receipt size={13} aria-hidden />
                    <span>{tr('payment_receipt', 'PAYMENT RECEIPT')}</span>
                  </div>
                  <button
                    type="button"
                    className="tx-ticket-close-btn"
                    onClick={() => setSelectedTxId(null)}
                    aria-label={tr('close', 'Close')}
                    title={tr('close', 'Close')}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Hero section: Icon, Status, Amount, Category, Date */}
                <div className="tx-ticket-hero">
                  <div className={`tx-ticket-hero-icon ${selectedTx.type}`} aria-hidden>
                    {selectedTx.type === 'income' ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                  </div>

                  <div className={`tx-ticket-status-pill ${selectedTx.type}`}>
                    <span className="status-dot" />
                    <span>
                      {selectedTx.type === 'income'
                        ? tr('received_successfully', 'Received Successfully')
                        : tr('paid_successfully', 'Paid Successfully')}
                    </span>
                  </div>

                  <h3 className={`tx-ticket-amount ${selectedTx.type}`}>
                    {selectedTx.type === 'income' ? '+' : '-'}{fmt(selectedTx.amount)}
                  </h3>

                  <div className="tx-ticket-merchant-block">
                    <p className="tx-ticket-cat">{selectedTx.category || tr('uncategorized', 'Uncategorized')}</p>
                    {selectedTx.merchant && <p className="tx-ticket-merchant">{selectedTx.merchant}</p>}
                  </div>

                  <p className="tx-ticket-date">
                    <Calendar size={12} aria-hidden />
                    <span>
                      {new Date(selectedTx.date).toLocaleDateString(locale, {
                        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </p>
                </div>

                {/* Perforation divider with Paytm-style ticket punch notches */}
                <div className="tx-ticket-divider" aria-hidden="true">
                  <div className="tx-ticket-notch left" />
                  <div className="tx-ticket-line" />
                  <div className="tx-ticket-notch right" />
                </div>

                {/* Receipt Details Breakdown */}
                <div className="tx-ticket-body">
                  <div className="tx-ticket-row">
                    <span className="ttr-label">{tr('type', 'Type')}</span>
                    <span className={`ttr-pill ${selectedTx.type}`}>
                      {selectedTx.type === 'income'
                        ? tr('income_label', 'Income')
                        : tr('expense_label', 'Expense')}
                    </span>
                  </div>

                  <div className="tx-ticket-row">
                    <span className="ttr-label">{tr('category', 'Category')}</span>
                    <span className="ttr-val">{selectedTx.category || tr('uncategorized', 'Uncategorized')}</span>
                  </div>

                  {selectedTx.merchant && (
                    <div className="tx-ticket-row">
                      <span className="ttr-label">{tr('merchant', 'Merchant / Payee')}</span>
                      <span className="ttr-val bold">{selectedTx.merchant}</span>
                    </div>
                  )}

                  {selectedTx.note ? (
                    <div className="tx-ticket-row note-row">
                      <span className="ttr-label"><FileText size={12} aria-hidden /> {tr('description', 'Note')}</span>
                      <span className="ttr-note-box">{selectedTx.note}</span>
                    </div>
                  ) : null}

                  {Array.isArray(selectedTx.tags) && selectedTx.tags.length > 0 && (
                    <div className="tx-ticket-row tags-row">
                      <span className="ttr-label"><Tag size={12} aria-hidden /> {tr('tags', 'Tags')}</span>
                      <div className="ttr-tags">
                        {selectedTx.tags.map((tg) => (
                          <span key={tg} className="ttr-tag-chip">#{tg}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTx.transaction_number && (
                    <div className="tx-ticket-row ref-row">
                      <span className="ttr-label">{tr('txn_id', 'Txn Ref ID')}</span>
                      <div className="ttr-copy-val">
                        <code>{selectedTx.transaction_number}</code>
                        <button
                          type="button"
                          className="ttr-copy-btn"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(selectedTx.transaction_number);
                              showToast('success', tr('copied', 'Copied'));
                            } catch {
                              showToast('error', tr('copy_failed', 'Failed to copy'));
                            }
                          }}
                          title={tr('copy', 'Copy')}
                          aria-label={tr('copy_transaction_number', 'Copy transaction number')}
                        >
                          <Copy size={13} aria-hidden />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action options in responsive 2x2 grid */}
                <div className="tx-ticket-actions">
                  <button
                    type="button"
                    className="tx-ticket-btn edit"
                    onClick={() => setEditingTx(selectedTx)}
                    title={tr('edit', 'Edit')}
                  >
                    <Edit3 size={15} aria-hidden />
                    <span>{tr('edit', 'Edit')}</span>
                  </button>

                  <button
                    type="button"
                    className="tx-ticket-btn duplicate"
                    onClick={() => prepareDuplicate(selectedTx)}
                    title={tr('duplicate', 'Duplicate')}
                  >
                    <Copy size={15} aria-hidden />
                    <span>{tr('duplicate', 'Duplicate')}</span>
                  </button>

                  <button
                    type="button"
                    className="tx-ticket-btn copy"
                    onClick={() => copyTransactionSummary(selectedTx)}
                    title={tr('copy_summary', 'Copy summary')}
                  >
                    <FileText size={15} aria-hidden />
                    <span>{tr('copy_summary', 'Copy')}</span>
                  </button>

                  <button
                    type="button"
                    className="tx-ticket-btn delete"
                    onClick={() => setDeletingTx(selectedTx)}
                    title={tr('delete', 'Delete')}
                  >
                    <Trash2 size={15} aria-hidden />
                    <span>{tr('delete', 'Delete')}</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                className="idp-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Wallet size={48} className="idp-empty-icon" aria-hidden />
                <h3>{tr('select_a_transaction', 'Select a Transaction')}</h3>
                <p>
                  {tr('click_transaction_to_inspect', 'Click on any transaction to view, edit, duplicate, or inspect its details.')}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  <Keyboard size={12} aria-hidden /> {tr('shortcuts_hint', 'Press / to search, N for new')}
                </p>

                <div className="idp-quick-stats">
                  <div className="iqs-box glass">
                    <label>{tr('earned', 'EARNED')}</label>
                    <span className="success">{fmt(totals.income)}</span>
                  </div>
                  <div className="iqs-box glass">
                    <label>{tr('spent_upper', 'SPENT')}</label>
                    <span className="danger">{fmt(totals.expense)}</span>
                  </div>
                  <div className="iqs-box glass">
                    <label>{tr('net_upper', 'NET')}</label>
                    <span className="primary">{fmt(totals.net)}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Single TransactionForm mounted once, driven by mode */}
      {(isAdding || duplicateTxData || editingTx) && (
        <TransactionForm
          key={
            isAdding ? 'add'
              : duplicateTxData ? 'duplicate'
                : editingTx ? `edit-${getTransactionId(editingTx)}`
                  : 'tx'
          }
          isOpen={Boolean(isAdding || duplicateTxData || editingTx)}
          initialData={duplicateTxData || editingTx || undefined}
          onClose={() => {
            setIsAdding(false);
            setDuplicateTxData(null);
            setEditingTx(null);
          }}
          onSubmit={
            isAdding ? handleAdd
              : duplicateTxData ? handleDuplicate
                : handleEdit
          }
        />
      )}

      {/* Single delete */}
      <Modal
        isOpen={deletingTx !== null}
        onClose={() => (isDeleting ? null : setDeletingTx(null))}
        title={tr('delete_transaction_title', 'Delete Transaction?')}
        confirmText={tr('delete', 'Delete')}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        danger
      >
        {deletingTx && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
            {tr('delete_transaction_body', 'Delete this')}{' '}
            <strong>{deletingTx.type}</strong> {tr('of', 'of')}{' '}
            <strong>{fmt(deletingTx.amount)}</strong> {tr('for', 'for')}{' '}
            <strong>{deletingTx.category}</strong>?
          </p>
        )}
      </Modal>

      {/* Bulk delete */}
      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => (isBulkOperating ? null : setShowBulkDeleteModal(false))}
        title={tr('delete_bulk_title', `Delete ${selectedIds.size} transactions?`)}
        confirmText={tr('delete', 'Delete')}
        onConfirm={handleBulkDelete}
        isLoading={isBulkOperating}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
          {tr('delete_bulk_body', `This will permanently remove the ${selectedIds.size} selected transactions. You can undo for ${Math.floor(UNDO_TIMEOUT_MS / 1000)} seconds after.`)}
        </p>
      </Modal>

      {/* Bulk edit */}
      <Modal
        isOpen={showBulkEditModal}
        onClose={() => (isBulkOperating ? null : setShowBulkEditModal(false))}
        title={tr('bulk_edit_title', `Edit ${selectedIds.size} transactions`)}
        confirmText={tr('apply', 'Apply Changes')}
        onConfirm={handleBulkEdit}
        isLoading={isBulkOperating}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
          {tr('bulk_edit_hint', 'Leave fields blank to keep their current value.')}
        </p>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label htmlFor="bulk_category">{tr('category', 'Category')}</label>
          <select
            id="bulk_category"
            value={bulkEdit.category}
            onChange={(e) => setBulkEdit((p) => ({ ...p, category: e.target.value }))}
            style={{ width: '100%' }}
          >
            <option value="">{tr('no_change', '— No change —')}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label htmlFor="bulk_type">{tr('type', 'Type')}</label>
          <select
            id="bulk_type"
            value={bulkEdit.type}
            onChange={(e) => setBulkEdit((p) => ({ ...p, type: e.target.value }))}
            style={{ width: '100%' }}
          >
            <option value="">{tr('no_change', '— No change —')}</option>
            <option value="income">{tr('income_label', 'Income')}</option>
            <option value="expense">{tr('expense_label', 'Expense')}</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label htmlFor="bulk_date">{tr('date', 'Date')}</label>
          <input
            id="bulk_date"
            type="date"
            value={bulkEdit.date}
            onChange={(e) => setBulkEdit((p) => ({ ...p, date: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Import review */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          if (!isImporting) {
            setShowImportModal(false);
            setStatementRows([]);
          }
        }}
        title={tr('import_review_title', `Review ${statementRows.length} detected transactions`)}
        confirmText={tr('import_confirm', `Add ${selectedStatementCount} to Wallet`)}
        onConfirm={handleConfirmImport}
        isLoading={isImporting}
        confirmDisabled={selectedStatementCount === 0}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
          {tr('import_review_hint', 'We identify payment type, merchant, and likely category. Duplicates are ignored by default.')}
        </p>
        <div className="statement-review-summary">
          <span>{selectedStatementCount} {tr('selected', 'selected')}</span>
          <button
            type="button"
            onClick={() => setStatementRows((rows) => rows.map((row) => ({ ...row, selected: !row.duplicate })))}
          >
            {tr('add_all_new', 'Add all new')}
          </button>
          <button
            type="button"
            onClick={() => setStatementRows((rows) => rows.map((row) => ({ ...row, selected: false })))}
          >
            {tr('ignore_all', 'Ignore all')}
          </button>
        </div>
        <div className="csv-preview-table-wrap statement-review-wrap">
          <table className="csv-preview-table statement-review-table">
            <thead>
              <tr>
                <th>{tr('import_wallet_col', 'Wallet')}</th>
                <th>{tr('import_date_col', 'Date')}</th>
                <th>{tr('import_merchant_col', 'Merchant & payment')}</th>
                <th>{tr('import_category_col', 'Category')}</th>
                <th>{tr('import_amount_col', 'Amount')}</th>
                <th>{tr('import_status_col', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {statementRows.map((row) => (
                <tr key={row.id} className={row.selected ? '' : 'statement-row-ignored'}>
                  <td>
                    <button
                      type="button"
                      className={`statement-choice ${row.selected ? 'selected' : ''}`}
                      onClick={() => updateStatementRow(row.id, { selected: !row.selected })}
                      aria-pressed={row.selected}
                    >
                      {row.selected ? tr('add_to_wallet', 'Add to Wallet') : tr('ignore', 'Ignore')}
                    </button>
                  </td>
                  <td>{row.date}</td>
                  <td>
                    <strong>{row.merchant || tr('bank_transaction', 'Bank transaction')}</strong>
                    <small>
                      {(row.payment_method || 'bank_transfer').replace('_', ' ')}
                      {row.counterparty_bank ? ` · ${row.counterparty_bank}` : ''}
                    </small>
                  </td>
                  <td>
                    <select
                      aria-label={`${tr('category_for', 'Category for')} ${row.merchant || ''}`.trim()}
                      value={row.category}
                      onChange={(event) => updateStatementRow(row.id, { category: event.target.value })}
                    >
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: row.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                    {row.type === 'income' ? '+' : '-'}{fmt(row.amount)}
                  </td>
                  <td>
                    {row.duplicate ? (
                      <span className="statement-status duplicate">{tr('possible_duplicate', 'Possible duplicate')}</span>
                    ) : (
                      <span className={`statement-status ${row.confidence || ''}`}>
                        {row.confidence || tr('detected', 'detected')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Undo bar */}
      <AnimatePresence>
        {undoState && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1100, display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px', borderRadius: 999,
              background: 'var(--glass-2)', border: '1px solid var(--glass-border)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.28)', backdropFilter: 'blur(16px)',
            }}
          >
            <Undo2 size={16} aria-hidden />
            <span style={{ fontSize: '0.88rem' }}>{undoState.label}</span>
            <button
              type="button"
              className="btn-secondary"
              onClick={runUndo}
              style={{ padding: '4px 12px', fontSize: '0.8rem' }}
            >
              {tr('undo', 'Undo')}
            </button>
            <button
              type="button"
              onClick={() => setUndoState(null)}
              aria-label={tr('dismiss', 'Dismiss')}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}