import React, { useState, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, ArrowUpRight, ArrowDownRight, 
  Trash2, Edit3, Plus, Wallet, FileText 
} from 'lucide-react';
import { AppContext } from '../App';
import TransactionForm from '../components/TransactionForm';

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

    result.sort((a, b) => {
      if (sortBy === 'date-desc') return new Date(b.date) - new Date(a.date);
      if (sortBy === 'date-asc') return new Date(a.date) - new Date(b.date);
      if (sortBy === 'amount-desc') return b.amount - a.amount;
      if (sortBy === 'amount-asc') return a.amount - b.amount;
      return 0;
    });

    return result;
  }, [transactions, searchTerm, filterType, sortBy]);

  const [selectedTxId, setSelectedTxId] = useState(null);
  
  const selectedTx = useMemo(() => {
    return transactions.find(t => t.id === selectedTxId) || null;
  }, [selectedTxId, transactions]);

  const confirmDelete = async () => {
    if (!deletingTx) return;
    setIsDeleting(true);
    await deleteTransaction(deletingTx.id);
    setIsDeleting(false);
    if (selectedTxId === deletingTx.id) setSelectedTxId(null);
    setDeletingTx(null);
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
                {filtered.map((t) => (
                  <motion.div key={t.id} variants={ITEM_VARIANTS} initial="hidden" animate="show" exit={{ opacity: 0, height: 0 }} layout
                    className={`il-item ${selectedTxId === t.id ? 'active' : ''}`}
                    onClick={() => setSelectedTxId(t.id)}
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
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* --- RIGHT PANEL (Details) --- */}
        <div className="inbox-detail-pane glass">
          <AnimatePresence mode="wait">
            {selectedTx ? (
              <motion.div key={selectedTx.id} className="idp-content"
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
                    <label>Total Earned</label>
                    <span className="success">{fmt(totalIncome)}</span>
                  </div>
                  <div className="iqs-box glass">
                    <label>Total Spent</label>
                    <span className="danger">{fmt(totalExpense)}</span>
                  </div>
                  <div className="iqs-box glass">
                    <label>Net Change</label>
                    <span className="primary">{fmt(netChange)}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      <AnimatePresence>
        {isAdding && <TransactionForm onClose={() => setIsAdding(false)} onSubmit={async (tx) => { await addTransaction(tx); setIsAdding(false); }} />}
        {editingTx && <TransactionForm initialData={editingTx} onClose={() => setEditingTx(null)} onSubmit={async (tx) => { await editTransaction(tx.id, tx); setEditingTx(null); }} />}
        
        {/* Confirm Delete Modal */}
        {deletingTx && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeletingTx(null)}>
            <motion.div className="modal-box glass" initial={{ scale: 0.88, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 24 }} transition={{ type: 'spring', damping: 22 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)' }}><Trash2 size={18} /> Delete Transaction?</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
                Are you sure you want to delete this <strong>{deletingTx.type}</strong> of <strong>{fmt(deletingTx.amount)}</strong> for <strong>{deletingTx.category}</strong>? This action cannot be undone.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setDeletingTx(null)}>Cancel</button>
                <button className="btn-primary" style={{ background: 'var(--danger)' }} onClick={confirmDelete} disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
