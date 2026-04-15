import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, AlertTriangle, Info, CheckCircle, Zap, Lightbulb } from 'lucide-react';

const TYPE_CONFIG = {
  danger:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: AlertTriangle },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: AlertTriangle },
  info:    { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)', icon: Info },
  success: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: CheckCircle },
  tip:     { color: '#059669', bg: 'rgba(5, 150, 105,0.12)', icon: Lightbulb },
};

export default function AlertsCenter({ alerts = [], onClose }) {
  const [dismissed, setDismissed] = useState([]);

  const visible = alerts.filter((_, i) => !dismissed.includes(i));

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-box glass"
        initial={{ scale: 0.88, x: 60 }} animate={{ scale: 1, x: 0 }}
        exit={{ scale: 0.9, x: 60 }}
        transition={{ type: 'spring', damping: 24, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 440, width: '100%', borderTop: '4px solid var(--brand-primary)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={20} color="var(--brand-primary)" />
            Smart Alerts
            {visible.length > 0 && (
              <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 100, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 800 }}>
                {visible.length}
              </span>
            )}
          </h3>
          <motion.button className="icon-btn" onClick={onClose} whileHover={{ rotate: 90, scale: 1.1 }}>
            <X size={18} />
          </motion.button>
        </div>

        {/* Alert List */}
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <AnimatePresence>
            {visible.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}
              >
                <CheckCircle size={44} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>All clear! No active alerts.</p>
                <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Keep up your great spending habits!</p>
              </motion.div>
            ) : (
              alerts.map((alert, i) => {
                if (dismissed.includes(i)) return null;
                const cfg = TYPE_CONFIG[alert.type] || TYPE_CONFIG.info;
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0, padding: 0 }}
                    transition={{ delay: i * 0.06 }}
                    style={{
                      background: cfg.bg,
                      border: `1px solid ${cfg.color}33`,
                      borderRadius: 14,
                      padding: '14px 16px',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      position: 'relative',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: `${cfg.color}22`, color: cfg.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Icon size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.9rem', color: cfg.color, marginBottom: 3 }}>
                        {alert.title}
                      </p>
                      <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {alert.message}
                      </p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.2 }}
                      onClick={() => setDismissed(d => [...d, i])}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 2, flexShrink: 0
                      }}
                    >
                      <X size={14} />
                    </motion.button>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {visible.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => setDismissed(alerts.map((_, i) => i))}
            style={{
              marginTop: 16, width: '100%', padding: '11px 0',
              borderRadius: 12, border: '1px solid var(--glass-border)',
              background: 'var(--glass-1)', color: 'var(--text-secondary)',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem'
            }}
          >
            Dismiss All
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
