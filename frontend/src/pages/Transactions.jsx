import React, { useState, useContext, useMemo, useDeferredValue, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, ArrowUpRight, ArrowDownRight, 
  Trash2, Edit3, Plus, Wallet, FileText, X,
  Download, Upload, Copy, CheckSquare, Square,
  FileSpreadsheet, FileCode, CheckCircle2, ChevronDown,
  Layers, RefreshCw
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import TransactionForm from '../components/TransactionForm';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';
import { exportToPDF } from '../services/pdfExport';

const STAGGER_VARIANTS = {
  hidden: { opacity: 0 },
  show: { transition: { staggerChildren: 0.04 } }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 }
};

const CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Shopping', 'Entertainment',
  'Health', 'Education', 'Bills', 'Salary', 'Freelance', 'Gift',
  'Rent', 'Travel', 'Fitness', 'Subscriptions', 'Utilities',
  'Insurance', 'Investment', 'Other', 'Allowance'
];

export default function Transactions() {
  const { transactions = [], deleteTransaction, editTransaction, addTransaction, fmt, user, currencyInfo, USER_ID } = useContext(AppContext);
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [filterType, setFilterType] = useState('all');
  const [activePreset, setActivePreset] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  
  // Selection & Bulk Actions
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('Food');
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkOperating, setIsBulkOperating] = useState(false);

  // Single Delete & Edit
  const [deletingTx, setDeletingTx] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [duplicateTxData, setDuplicateTxData] = useState(null);

  // Import Modal & State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Export Dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);

  const getTransactionId = (transaction) => String(transaction?.id || transaction?._id || '');

  // Filter and Sort Logic
  const filtered = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let result = transactions.filter(t => {
      const matchType = filterType === 'all' || t.type === filterType;
      const searchStr = `${t.category} ${t.note || ''} ${t.amount}`.toLowerCase();
      const matchSearch = searchStr.includes(deferredSearchTerm.trim().toLowerCase());

      // Filter presets
      let matchPreset = true;
      if (activePreset === 'thisMonth') {
        const d = new Date(t.date);
        matchPreset = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      } else if (activePreset === 'highValue') {
        matchPreset = Number(t.amount) >= 500;
      } else if (activePreset === 'uncategorized') {
        matchPreset = !t.category || t.category === 'Other' || t.category === 'Uncategorized';
      }

      return matchType && matchSearch && matchPreset;
    });

    const safeGetTime = (d) => {
      const t = new Date(d).getTime();
      return isNaN(t) ? 0 : t;
    };

    result.sort((a, b) => {
      if (sortBy === 'date-desc') return safeGetTime(b.date) - safeGetTime(a.date);
      if (sortBy === 'date-asc') return safeGetTime(a.date) - safeGetTime(b.date);
      if (sortBy === 'amount-desc') return b.amount - a.amount;
      if (sortBy === 'amount-asc') return a.amount - b.amount;
      return 0;
    });

    return result;
  }, [transactions, deferredSearchTerm, filterType, activePreset, sortBy]);

  const [selectedTxId, setSelectedTxId] = useState(null);
  
  const selectedTx = useMemo(() => {
    return transactions.find(t => getTransactionId(t) === String(selectedTxId)) || null;
  }, [selectedTxId, transactions]);

  // Bulk Selection Handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(t => getTransactionId(t))));
    }
  };

  const toggleSelectOne = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkOperating(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await deleteTransaction(id);
      }
      showToast('success', `Deleted ${selectedIds.size} transactions`);
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      if (selectedIds.has(String(selectedTxId))) setSelectedTxId(null);
    } catch {
      showToast('error', 'Failed to delete some transactions');
    } finally {
      setIsBulkOperating(false);
    }
  };

  // Bulk Category Change
  const handleBulkCategoryChange = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkOperating(true);
    try {
      for (const id of Array.from(selectedIds)) {
        const tx = transactions.find(t => getTransactionId(t) === id);
        if (tx) {
          await editTransaction(id, { ...tx, category: bulkCategory });
        }
      }
      showToast('success', `Updated category to "${bulkCategory}" for ${selectedIds.size} transactions`);
      setSelectedIds(new Set());
      setShowBulkCategoryModal(false);
    } catch {
      showToast('error', 'Failed to update category for some transactions');
    } finally {
      setIsBulkOperating(false);
    }
  };

  // Single Delete
  const confirmDelete = async () => {
    if (!deletingTx) return;
    setIsDeleting(true);
    try {
      await deleteTransaction(getTransactionId(deletingTx));
      showToast('success', 'Transaction deleted');
    } catch {
      showToast('error', 'Failed to delete transaction');
    } finally {
      setIsDeleting(false);
      if (String(selectedTxId) === getTransactionId(deletingTx)) setSelectedTxId(null);
      setDeletingTx(null);
    }
  };

  // Duplicate Action
  const handleDuplicate = (tx) => {
    setDuplicateTxData({
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      note: tx.note ? `${tx.note} (Copy)` : 'Copy',
      date: new Date().toISOString().split('T')[0]
    });
  };

  // Export Handlers
  const handleExportCSV = (exportSelected = false) => {
    const listToExport = exportSelected
      ? filtered.filter(t => selectedIds.has(getTransactionId(t)))
      : filtered;

    if (listToExport.length === 0) {
      showToast('error', 'No transactions to export');
      return;
    }

    const headers = ['Date', 'Type', 'Category', 'Note', 'Amount'];
    const rows = listToExport.map(t => [
      new Date(t.date).toISOString().split('T')[0],
      t.type,
      `"${(t.category || '').replace(/"/g, '""')}"`,
      `"${(t.note || '').replace(/"/g, '""')}"`,
      t.amount
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_${exportSelected ? 'selected_' : ''}${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    showToast('success', 'CSV downloaded successfully');
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(filtered, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    showToast('success', 'JSON downloaded successfully');
  };

  const handleExportPDF = async () => {
    setShowExportMenu(false);
    try {
      await exportToPDF(user, filtered, currencyInfo);
      showToast('success', 'PDF Report generated');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to generate PDF');
    }
  };

  // CSV Import Parsing
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text !== 'string') return;

      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        showToast('error', 'CSV file is empty or has no header.');
        return;
      }

      const rows = [];
      // Skip header, parse up to 100 rows
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        if (parts.length >= 3) {
          const date = parts[0] || new Date().toISOString().split('T')[0];
          let type = parts[1]?.toLowerCase() === 'income' ? 'income' : 'expense';
          let category = parts[2] || 'Other';
          let note = parts[3] || '';
          let amount = parseFloat(parts[4] || parts[3] || parts[1] || '0');

          if (!isNaN(amount) && amount > 0) {
            rows.push({ date, type, category, note, amount });
          }
        }
      }

      if (rows.length === 0) {
        showToast('error', 'Could not parse any valid transaction rows from CSV.');
        return;
      }

      setImportRows(rows);
      setShowImportModal(true);
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (importRows.length === 0) return;
    setIsImporting(true);
    try {
      for (const row of importRows) {
        await addTransaction(row);
      }
      showToast('success', `Imported ${importRows.length} transactions successfully!`);
      setShowImportModal(false);
      setImportRows([]);
    } catch {
      showToast('error', 'Failed to import some rows.');
    } finally {
      setIsImporting(false);
    }
  };

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((a, c) => a + Number(c.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((a, c) => a + Number(c.amount), 0);
  const netChange = totalIncome - totalExpense;

  return (
    <div className="inbox-layout-page">
      {/* Hidden file input for CSV Import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      <div className="inbox-header">
        <div className="ih-titles">
          <h2>Transactions</h2>
          <span className="ih-badge">{transactions.length} total</span>
        </div>

        <div className="inbox-header-actions">
          {/* Import CSV */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            title="Import bank statement or CSV"
          >
            <Upload size={15} /> Import CSV
          </motion.button>

          {/* Export Dropdown */}
          <div className="dropdown-container" style={{ position: 'relative' }}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="btn-secondary"
              onClick={() => setShowExportMenu(prev => !prev)}
            >
              <Download size={15} /> Export <ChevronDown size={14} />
            </motion.button>

            <AnimatePresence>
              {showExportMenu && (
                <motion.div
                  className="tx-export-dropdown glass"
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  onClick={e => e.stopPropagation()}
                >
                  <button className="tx-export-item" onClick={() => handleExportCSV(false)}>
                    <FileSpreadsheet size={15} className="text-success" />
                    <span>Export CSV (Excel)</span>
                  </button>
                  <button className="tx-export-item" onClick={handleExportPDF}>
                    <FileText size={15} className="text-danger" />
                    <span>Export PDF Report</span>
                  </button>
                  <button className="tx-export-item" onClick={handleExportJSON}>
                    <FileCode size={15} className="text-brand" />
                    <span>Export JSON</span>
                  </button>
                  {selectedIds.size > 0 && (
                    <button className="tx-export-item" onClick={() => handleExportCSV(true)}>
                      <CheckSquare size={15} />
                      <span>Export Selected ({selectedIds.size})</span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            aria-label="Add transaction"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="btn-primary"
            onClick={() => setIsAdding(true)}
          >
            <Plus size={16} /> Add New
          </motion.button>
        </div>
      </div>

      {/* Quick Filter Presets Strip */}
      <div className="tx-presets-strip">
        {[
          { id: 'all', label: 'All' },
          { id: 'thisMonth', label: 'This Month' },
          { id: 'highValue', label: 'High Value (>500)' },
          { id: 'uncategorized', label: 'Uncategorized' }
        ].map(p => (
          <button
            key={p.id}
            className={`tx-preset-pill ${activePreset === p.id ? 'active' : ''}`}
            onClick={() => setActivePreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Bulk Actions Toolbar (Visible when >= 1 item is selected) */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            className="tx-bulk-toolbar glass"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
          >
            <div className="tbt-left">
              <span className="tbt-count">
                <CheckCircle2 size={16} className="text-success" />
                {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="tbt-actions">
              <button
                className="tbt-btn"
                onClick={() => setShowBulkCategoryModal(true)}
              >
                <Layers size={14} /> Change Category
              </button>
              <button
                className="tbt-btn danger"
                onClick={() => setShowBulkDeleteModal(true)}
              >
                <Trash2 size={14} /> Delete Selected
              </button>
              <button
                className="tbt-btn-close"
                onClick={() => setSelectedIds(new Set())}
                title="Deselect all"
              >
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="inbox-split-pane">
        
        {/* --- LEFT NAVIGATION (List) --- */}
        <div className="inbox-list-pane glass">
          <div className="il-filters">
            <div className="il-search">
              <Search size={16} aria-hidden="true" />
              <input
                aria-label="Search transactions"
                placeholder="Search category, note, or amount..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="il-controls">
              <select
                aria-label="Filter transactions by type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
              <select
                aria-label="Sort transactions"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date-desc">Newest</option>
                <option value="date-asc">Oldest</option>
                <option value="amount-desc">Highest</option>
                <option value="amount-asc">Lowest</option>
              </select>
              {(searchTerm || filterType !== 'all' || activePreset !== 'all') && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => { setSearchTerm(''); setFilterType('all'); setActivePreset('all'); }}
                  aria-label="Clear transaction filters"
                  title="Clear filters"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Select All Bar */}
          {filtered.length > 0 && (
            <div className="il-select-all-bar">
              <button className="il-select-all-btn" onClick={toggleSelectAll}>
                {selectedIds.size === filtered.length && filtered.length > 0 ? (
                  <CheckSquare size={16} className="text-brand" />
                ) : (
                  <Square size={16} />
                )}
                <span>Select All ({filtered.length})</span>
              </button>
            </div>
          )}

          <div className="sr-only" aria-live="polite">Showing {filtered.length} of {transactions.length} transactions</div>

          <div className="il-scrollable">
            {transactions.length === 0 ? (
               <div className="il-empty">
                 <Wallet size={36} opacity={0.3} />
                 <p>No transactions yet</p>
                 <button className="btn-primary" onClick={() => setIsAdding(true)} style={{ marginTop: 10 }}>
                   <Plus size={14} /> Add First Transaction
                 </button>
               </div>
            ) : filtered.length === 0 ? (
               <div className="il-empty">
                 <Filter size={36} opacity={0.3} />
                 <p>No matching transactions</p>
                 <button className="btn-secondary" onClick={() => { setSearchTerm(''); setFilterType('all'); setActivePreset('all'); }}>
                   Reset Filters
                 </button>
               </div>
            ) : (
              <AnimatePresence>
                {filtered.map((t) => {
                  const transactionId = getTransactionId(t);
                  const isSelected = selectedIds.has(transactionId);
                  const isActive = String(selectedTxId) === transactionId;
                  return (
                  <motion.div
                    key={transactionId}
                    variants={ITEM_VARIANTS}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, height: 0 }}
                    layout
                    className={`il-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedTxId(transactionId)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${t.category}, ${t.type}, ${fmt(t.amount)}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTxId(transactionId);
                      }
                    }}
                  >
                    {/* Multi-select checkbox */}
                    <button
                      className="il-checkbox-btn"
                      onClick={(e) => toggleSelectOne(transactionId, e)}
                      aria-label={isSelected ? 'Deselect transaction' : 'Select transaction'}
                    >
                      {isSelected ? (
                        <CheckSquare size={16} className="text-brand" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>

                    <div className={`ili-icon ${t.type}`}>
                      {t.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    </div>
                    <div className="ili-info">
                      <p className="ili-cat">{t.category}</p>
                      <p className="ili-date">
                        {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {t.note && <span className="ili-note-snip"> · {t.note}</span>}
                      </p>
                    </div>
                    <div className="ili-amount">
                      <span className={t.type}>{t.type === 'income' ? '+' : '-'}{fmt(t.amount)}</span>
                    </div>
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* --- RIGHT PANEL (Details) --- */}
        <div className="inbox-detail-pane glass">
          <AnimatePresence mode="wait">
            {selectedTx ? (
              <motion.div
                key={getTransactionId(selectedTx)}
                className="idp-content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <div className="idp-header">
                  <div className={`idp-hero-icon ${selectedTx.type}`}>
                    {selectedTx.type === 'income' ? <ArrowUpRight size={32} /> : <ArrowDownRight size={32} />}
                  </div>
                  <h3 className={`idp-amount ${selectedTx.type}`}>
                    {selectedTx.type === 'income' ? '+' : '-'}{fmt(selectedTx.amount)}
                  </h3>
                  <p className="idp-cat">{selectedTx.category}</p>
                  <p className="idp-date">
                    {new Date(selectedTx.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>

                <div className="idp-body">
                  <div className="idp-section">
                    <label>Type</label>
                    <p style={{ textTransform: 'capitalize', color: selectedTx.type === 'income' ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                      {selectedTx.type}
                    </p>
                  </div>
                  <div className="idp-section">
                    <label><FileText size={14}/> Note</label>
                    {selectedTx.note ? (
                      <p className="idp-note-box">{selectedTx.note}</p>
                    ) : (
                      <p className="idp-note-empty">No notes provided.</p>
                    )}
                  </div>
                </div>

                <div className="idp-actions">
                  <button className="idp-btn edit" onClick={() => setEditingTx(selectedTx)}>
                    <Edit3 size={16} /> Edit Details
                  </button>
                  <button className="idp-btn duplicate" onClick={() => handleDuplicate(selectedTx)} title="Duplicate transaction">
                    <Copy size={16} /> Duplicate
                  </button>
                  <button className="idp-btn delete" onClick={() => setDeletingTx(selectedTx)}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" className="idp-empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <Wallet size={48} className="idp-empty-icon" />
                <h3>Select a Transaction</h3>
                <p>Click on any transaction in the list to view, edit, duplicate, or inspect its details.</p>

                <div className="idp-quick-stats">
                  <div className="iqs-box glass">
                    <label>Earned</label>
                    <span className="success">{fmt(totalIncome)}</span>
                  </div>
                  <div className="iqs-box glass">
                    <label>Spent</label>
                    <span className="danger">{fmt(totalExpense)}</span>
                  </div>
                  <div className="iqs-box glass">
                    <label>Net</label>
                    <span className="primary">{fmt(netChange)}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      <AnimatePresence mode="wait">
        {isAdding && (
          <TransactionForm
            onClose={() => setIsAdding(false)}
            onSubmit={async (tx) => { await addTransaction(tx); setIsAdding(false); }}
          />
        )}

        {duplicateTxData && (
          <TransactionForm
            initialData={duplicateTxData}
            onClose={() => setDuplicateTxData(null)}
            onSubmit={async (tx) => { await addTransaction(tx); setDuplicateTxData(null); }}
          />
        )}

        {editingTx && (
          <TransactionForm
            initialData={editingTx}
            onClose={() => setEditingTx(null)}
            onSubmit={async (tx) => { await editTransaction(getTransactionId(tx), tx); setEditingTx(null); }}
          />
        )}
        
        {/* Single Confirm Delete Modal */}
        <Modal
          isOpen={deletingTx !== null}
          onClose={() => setDeletingTx(null)}
          title="Delete Transaction?"
          confirmText="Yes, Delete"
          onConfirm={confirmDelete}
          isLoading={isDeleting}
          danger={true}
        >
          {deletingTx && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
              Are you sure you want to delete this <strong>{deletingTx.type}</strong> of <strong>{fmt(deletingTx.amount)}</strong> for <strong>{deletingTx.category}</strong>?
            </p>
          )}
        </Modal>

        {/* Bulk Delete Modal */}
        <Modal
          isOpen={showBulkDeleteModal}
          onClose={() => setShowBulkDeleteModal(false)}
          title={`Delete ${selectedIds.size} Transactions?`}
          confirmText={`Delete ${selectedIds.size} Transactions`}
          onConfirm={handleBulkDelete}
          isLoading={isBulkOperating}
          danger={true}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
            This will permanently remove the {selectedIds.size} selected transactions. This action cannot be undone.
          </p>
        </Modal>

        {/* Bulk Category Change Modal */}
        <Modal
          isOpen={showBulkCategoryModal}
          onClose={() => setShowBulkCategoryModal(false)}
          title={`Change Category for ${selectedIds.size} Transactions`}
          confirmText="Update Category"
          onConfirm={handleBulkCategoryChange}
          isLoading={isBulkOperating}
        >
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Select New Category</label>
            <select
              value={bulkCategory}
              onChange={e => setBulkCategory(e.target.value)}
              className="filter-select"
              style={{ width: '100%', marginTop: 8 }}
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </Modal>

        {/* CSV Import Preview Modal */}
        <Modal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title={`Import ${importRows.length} Transactions`}
          confirmText={`Confirm & Import ${importRows.length} Items`}
          onConfirm={handleConfirmImport}
          isLoading={isImporting}
        >
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
            Review the parsed transactions from your CSV file before importing:
          </p>
          <div className="csv-preview-table-wrap">
            <table className="csv-preview-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {importRows.slice(0, 15).map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.date}</td>
                    <td style={{ textTransform: 'capitalize', color: row.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>{row.type}</td>
                    <td>{row.category}</td>
                    <td>{fmt(row.amount)}</td>
                    <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {importRows.length > 15 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                + {importRows.length - 15} more items will be imported.
              </p>
            )}
          </div>
        </Modal>
      </AnimatePresence>
    </div>
  );
}
