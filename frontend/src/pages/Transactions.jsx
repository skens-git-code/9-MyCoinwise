import React, { useState, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, ArrowUpRight, ArrowDownRight, 
  Trash2, Edit3, Plus, Wallet, FileText 
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import TransactionForm from '../components/TransactionForm';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';

const STAGGER_VARIANTS = {
  hidden: { opacity: 0 },
  show: { transition: { staggerChildren: 0.05 } }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -14 },
  show: { opacity: 1, x: 0 }
};

export default function Transactions() {
  const { transactions, deleteTransaction, editTransaction, addTransaction, fmt } = useContext(AppContext);
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [deletingTx, setDeletingTx] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Modals
  const [editingTx, setEditingTx] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  // Filter and Sort Logic
  const filtered = useMemo(() => {
    let result = transactions.filter(t => {
      const matchType = filterType === 'all' || t.type === filterType;
      const searchStr = `${t.category} ${t.note || ''} ${t.amount}`.toLowerCase();
      const matchSearch = searchStr.includes(searchTerm.toLowerCase());
      return matchType && matchSearch;
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
  }, [transactions, searchTerm, filterType, sortBy]);

  const [selectedTxId, setSelectedTxId] = useState(null);

  const getTransactionId = (transaction) => String(transaction?.id || transaction?._id || '');
  
  const selectedTx = useMemo(() => {
    return transactions.find(t => getTransactionId(t) === String(selectedTxId)) || null;
  }, [selectedTxId, transactions]);

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

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((a, c) => a + Number(c.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((a, c) => a + Number(c.amount), 0);
  const netChange = totalIncome - totalExpense;

  return (
    <div className="inbox-layout-page">
      <div className="inbox-header">
        <div className="ih-titles">
          <h2>Transactions</h2>
          <span className="ih-badge">{transactions.length} total</span>
        </div>
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="btn-primary" onClick={() => setIsAdding(true)}>
          <Plus size={16} /> Add New
        </motion.button>
      </div>

      <div className="inbox-split-pane">
        
        {/* --- LEFT NAVIGATION (List) --- */}
        <div className="inbox-list-pane glass">
          <div className="il-filters">
            <div className="il-search">
              <Search size={16} />
              <input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="il-controls">
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="date-desc">Newest</option>
                <option value="amount-desc">Highest</option>
              </select>
            </div>
          </div>

          <div className="il-scrollable">
            {transactions.length === 0 ? (
               <div className="il-empty">
                 <Wallet size={36} opacity={0.3} />
                 <p>No transactions yet</p>
               </div>
            ) : filtered.length === 0 ? (
               <div className="il-empty">
                 <Filter size={36} opacity={0.3} />
                 <p>No results found</p>
               </div>
            ) : (
              <AnimatePresence>
                {filtered.map((t) => {
                  const transactionId = getTransactionId(t);
                  return (
                  <motion.div key={transactionId} variants={ITEM_VARIANTS} initial="hidden" animate="show" exit={{ opacity: 0, height: 0 }} layout
                    className={`il-item ${String(selectedTxId) === transactionId ? 'active' : ''}`}
                    onClick={() => setSelectedTxId(transactionId)}
                    role="button"
                    tabIndex="0"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTxId(transactionId);
                      }
                    }}
                  >
                    <div className={`ili-icon ${t.type}`}>
                      {t.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    </div>
                    <div className="ili-info">
                      <p className="ili-cat">{t.category}</p>
                      <p className="ili-date">{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
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
              <motion.div key={getTransactionId(selectedTx)} className="idp-content"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
              >
                <div className="idp-header">
                  <div className={`idp-hero-icon ${selectedTx.type}`}>
                    {selectedTx.type === 'income' ? <ArrowUpRight size={32} /> : <ArrowDownRight size={32} />}
                  </div>
                  <h3 className={`idp-amount ${selectedTx.type}`}>
                    {selectedTx.type === 'income' ? '+' : '-'}{fmt(selectedTx.amount)}
                  </h3>
                  <p className="idp-cat">{selectedTx.category}</p>
                  <p className="idp-date">{new Date(selectedTx.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>

                <div className="idp-body">
                  <div className="idp-section">
                    <label>Type</label>
                    <p style={{ textTransform: 'capitalize', color: selectedTx.type === 'income' ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{selectedTx.type}</p>
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
                  <button className="idp-btn delete" onClick={() => setDeletingTx(selectedTx)}>
                    <Trash2 size={16} /> Delete Transaction
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" className="idp-empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <Wallet size={48} className="idp-empty-icon" />
                <h3>Select a Transaction</h3>
                <p>Click on any transaction in the list to view its full details.</p>

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
        {isAdding && <TransactionForm onClose={() => setIsAdding(false)} onSubmit={async (tx) => { await addTransaction(tx); setIsAdding(false); }} />}
        {editingTx && <TransactionForm initialData={editingTx} onClose={() => setEditingTx(null)} onSubmit={async (tx) => { await editTransaction(getTransactionId(tx), tx); setEditingTx(null); }} />}
        
        {/* Confirm Delete Modal */}
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
              Are you sure you want to delete this <strong>{deletingTx.type}</strong> of <strong>{fmt(deletingTx.amount)}</strong> for <strong>{deletingTx.category}</strong>? This action cannot be undone.
            </p>
          )}
        </Modal>
      </AnimatePresence>
    </div>
  );
}
