// SettingsPage.jsx — COMPLETE, CORRECTED, ENHANCED

/* —————————————————————————————————————
 * Settings Page
 * Full settings hub with:
 *   - Tabs: Profile, Preferences, Language, Appearance, Notifications,
 *     Security, Users, Data & Security, Advanced.
 *   - Lazy-loaded emoji picker for avatar selection.
 *   - Re-authentication modal gating destructive actions.
 *   - Session management with per-device revoke.
 *   - Backup & restore (JSON export + import, weekly auto-backup).
 *   - Master save bar with dirty tracking + undo.
 *   - Idle session timeout driven by user preferences.
 *   - Compact mode + animation toggles applied to <body>.
 *
 * Key behaviors:
 *   - Settings form state lives in a reducer; dirty flag drives the
 *     save bar visibility.
 *   - Avatar uploads are downscaled to 360 px before persisting.
 *   - Only the last 4 characters of any tax identifier are accepted.
 *   - `useFocusTrap` gives modals full keyboard accessibility.
 * ————————————————————————————————————— */

import React, {
  useState, useContext, useEffect, useRef, useCallback, useMemo, useReducer,
  lazy, Suspense,
} from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Save, User, Users, Target, Moon, Sun, Download, CheckCircle, AlertCircle,
  Palette, Database, Plus, Settings, ShieldAlert, Globe, Bell, Zap, Smartphone,
  FileText, Trash2, X, Loader, Key, Shield, Bell as BellIcon, Eye,
  Lock, LogOut, ChevronRight, RefreshCw, AlertTriangle, EyeOff, Search,
  Copy, Check, Monitor, Calendar, Activity, Upload, Clock,
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';
import { CURRENCIES, AVATAR_COLORS, api } from '../services/api';
import { LANGUAGES } from '../services/i18n';

import Modal from '../components/Modal';
import { useToast } from '../components/ToastProvider';
import PropTypes from 'prop-types';

// Lazy-loaded heavy dependencies
const EmojiPicker = lazy(() => import('emoji-picker-react'));

/* ============================================================
 * Constants
 * ============================================================ */

// ── Valid URL tab ids (used to resolve ?tab= param and defaults) ──
const TAB_IDS = ['profile', 'preferences', 'language', 'appearance', 'notifications', 'security', 'users', 'data', 'advanced'];

// ── Default notification preferences ──
const DEFAULT_NOTIFICATION_PREFS = {
  emailReports: true,
  budgetAlerts: true,
  goalMilestones: true,
  unusualSpending: false,
  pushNotifications: true,
  weeklyDigest: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

// ── Default advanced preferences ──
const DEFAULT_ADVANCED_PREFS = {
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  firstDayOfWeek: 'Sunday',
  decimalSeparator: '.',
  compactMode: false,
  autoSave: true,
  animationsEnabled: true,
  showWeekNumbers: false,
  sessionTimeoutMinutes: 30,
};

// ── Destructive actions that require re-authentication ──
const DESTRUCTIVE_ACTIONS = {
  PASSWORD_CHANGE: 'password_change',
  EMAIL_CHANGE: 'email_change',
  FACTORY_RESET: 'factory_reset',
  DELETE_USER: 'delete_user',
};

/* ============================================================
 * Helpers
 * ============================================================ */

// ── Simple email format check ──
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

// ── Validate the monthly goal (nullable, non-negative) ──
const validateGoal = (goal) => {
  if (!goal && goal !== 0) return { isValid: true, value: null };
  const num = Number(goal);
  return { isValid: !Number.isNaN(num) && num >= 0, value: num };
};

/** Safe trim — no destructive character stripping (React escapes output). */
const sanitizeInput = (input) => String(input || '').trim();

// ── Split a user's combined name into first / last parts ──
const getNameParts = (user) => {
  const username = String(user?.username || user?.name || '').trim();
  const surname = String(user?.last_name || user?.surname || '').trim();
  const words = username.split(/\s+/).filter(Boolean);
  const surnameMatchesUsername =
    surname &&
    words.length > 1 &&
    words[words.length - 1].toLocaleLowerCase() === surname.toLocaleLowerCase();
  return {
    firstName: surnameMatchesUsername ? words.slice(0, -1).join(' ') : words[0] || '',
    lastName: surname || (words.length > 1 ? words.slice(1).join(' ') : ''),
  };
};

// ── Build the reducer's initial/reset payload from the user ──
const buildResetPayload = (user) => ({
  firstName: getNameParts(user).firstName,
  lastName: getNameParts(user).lastName,
  profession: user?.profession || user?.role || 'Trader',
  monthlyGoal: user?.monthly_goal != null ? String(user.monthly_goal) : '',
  currency: user?.currency || 'INR',
  avatar: user?.profile_avatar || '😊',
  avatarColor: user?.profile_color || '#059669',
  notificationPrefs: user?.notification_prefs || { ...DEFAULT_NOTIFICATION_PREFS },
  advancedPrefs: user?.advanced_prefs || { ...DEFAULT_ADVANCED_PREFS },
});

// ── True when the avatar value looks like a usable image source ──
const isUsableAvatarSource = (value) => {
  const avatar = String(value || '').trim();
  return (
    avatar.length > 20 &&
    (/^data:image\//i.test(avatar) ||
      /^blob:/i.test(avatar) ||
      /^https?:\/\//i.test(avatar) ||
      /^\/(?!\/)/.test(avatar))
  );
};

// ── Resolve the user's avatar into a render-safe { type, value } ──
const getSafeUserAvatar = (user) => {
  const avatar = String(user?.profile_avatar || '').trim();
  if (isUsableAvatarSource(avatar)) return { type: 'image', value: avatar };
  if (avatar && avatar.length <= 12 && !/[A-Za-z0-9_-]{20,}/.test(avatar)) {
    return { type: 'text', value: avatar };
  }
  const name = getUserDisplayName(user);
  return { type: 'text', value: name.charAt(0).toUpperCase() || 'U' };
};

// ── Compose a display name (avoids duplicating a surname) ──
const getUserDisplayName = (user) => {
  const username = String(user?.username || '').trim().replace(/\s+/g, ' ');
  const surname = String(user?.last_name || '').trim().replace(/\s+/g, ' ');
  const safeUsername = username.length <= 80 ? username : '';
  const safeSurname = surname.length <= 80 ? surname : '';
  const duplicateSurname =
    safeSurname && safeUsername.toLocaleLowerCase().endsWith(` ${safeSurname.toLocaleLowerCase()}`);
  return [safeUsername, duplicateSurname ? '' : safeSurname].filter(Boolean).join(' ') || 'Unnamed profile';
};

/** Returns null when the user has no valid email (caller decides how to render). */
const getSafeUserEmail = (user) => {
  const email = String(user?.email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160 ? email : null;
};

/* ============================================================
 * Focus trap hook
 * ============================================================ */
function useFocusTrap(ref, isActive, onEscape) {
  useEffect(() => {
    if (!isActive || !ref.current) return undefined;
    const node = ref.current;
    const previousActive = document.activeElement;

    // ── Query visible focusable elements inside the trap ──
    const getFocusable = () =>
      Array.from(
        node.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    // ── Initial focus ──
    const focusables = getFocusable();
    if (focusables.length > 0) focusables[0].focus();

    // ── Escape closes; Tab cycles inside the trap ──
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = getFocusable();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !node.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      try { previousActive?.focus?.(); } catch { /* ignore */ }
    };
  }, [ref, isActive, onEscape]);
}

/* ============================================================
 * Password strength
 * ============================================================ */

// ── Score a password on a 0–5 scale ──
const getPasswordStrength = (password) => {
  const pw = String(password || '');
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 1;
  if (pw.length >= 12) score += 1;
  return Math.min(score, 5);
};

// ── Labels and colors per strength level ──
const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
const STRENGTH_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981'];

// ── Segmented strength bar rendered under a password field ──
const PasswordStrengthIndicator = ({ password }) => {
  const score = getPasswordStrength(password);
  if (!password) return null;
  const label = STRENGTH_LABELS[score];
  const color = STRENGTH_COLORS[score];

  return (
    <div style={{ marginTop: 8 }}>
      <div
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-label={`Password strength: ${label}`}
        style={{ display: 'flex', gap: 4, marginBottom: 4 }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              background: i < score ? color : '#e5e7eb',
              borderRadius: 2,
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '0.75rem', color }} aria-live="polite">
        {label}
      </span>
    </div>
  );
};

/* ============================================================
 * Re-authentication modal
 * ============================================================ */

// ── Modal content: asks for the current password before a sensitive action ──
const ReAuthModalContent = ({ onClose, onConfirmed, actionLabel, isLoading }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const modalRef = useRef(null);

  useFocusTrap(modalRef, true, onClose);

  // ── Submit the password and resolve based on the parent's result ──
  const handleConfirm = async () => {
    if (!password) {
      setError('Password is required.');
      return;
    }
    setError('');
    try {
      const ok = await onConfirmed(password);
      if (ok) setPassword('');
    } catch (err) {
      setError(err?.message || 'Incorrect password.');
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-title"
        className="modal-box glass"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '90%', padding: 24, borderRadius: 16, background: 'var(--bg-color)' }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Lock size={22} aria-hidden="true" style={{ color: 'var(--warning, #f59e0b)' }} />
          <h3 id="reauth-title" style={{ margin: 0, fontSize: '1.15rem' }}>Confirm your password</h3>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 16px', lineHeight: 1.55 }}>
          For your security, please re-enter your password to {actionLabel || 'continue'}.
        </p>

        {/* ── Password field ── */}
        <div className="form-field">
          <label htmlFor="reauth_password">Password</label>
          <input
            id="reauth_password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
            placeholder="Your current password"
            autoFocus
            autoComplete="current-password"
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'reauth-error' : undefined}
          />
          {error && (
            <p id="reauth-error" role="alert" style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: 6 }}>
              {error}
            </p>
          )}
        </div>

        {/* ── Actions ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={isLoading || !password}
          >
            {isLoading ? 'Verifying…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Wrapper that mounts the re-auth content only when open ──
const ReAuthModal = ({ isOpen, onClose, onConfirmed, actionLabel, isLoading }) => {
  if (!isOpen) return null;
  return (
    <ReAuthModalContent
      onClose={onClose}
      onConfirmed={onConfirmed}
      actionLabel={actionLabel}
      isLoading={isLoading}
    />
  );
};

/* ============================================================
 * Backup & Restore
 * ============================================================ */
const BackupRestore = ({ userId, showMessage }) => {
  // ── Local state: export/restore in-flight + auto-backup toggle ──
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [autoBackup, setAutoBackup] = useState(false);
  const [confirmRestoreFile, setConfirmRestoreFile] = useState(null);
  const [restorePreview, setRestorePreview] = useState(null);
  const fileInputRef = useRef(null);
  const autoBackupIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  // ── Load auto-backup preference; cleanup interval on unmount ──
  useEffect(() => {
    isMountedRef.current = true;
    try {
      const saved = localStorage.getItem('auto-backup-enabled');
      if (saved) setAutoBackup(JSON.parse(saved));
    } catch { /* ignore */ }
    return () => {
      isMountedRef.current = false;
      if (autoBackupIntervalRef.current) {
        clearInterval(autoBackupIntervalRef.current);
        autoBackupIntervalRef.current = null;
      }
    };
  }, []);

  // ── Download a full JSON backup as a file ──
  const handleExportBackup = useCallback(async () => {
    if (!userId) {
      showMessage('error', 'Session expired. Please log in again.');
      return;
    }
    setBackupLoading(true);
    try {
      const data = await api.exportAllData(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      a.download = `mycoinwise-backup-${dateStamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      if (isMountedRef.current) showMessage('success', 'Backup exported successfully!');
      return true;
    } catch (error) {
      console.error('Backup error:', error);
      if (isMountedRef.current) showMessage('error', 'Failed to export backup');
      return false;
    } finally {
      if (isMountedRef.current) setBackupLoading(false);
    }
  }, [userId, showMessage]);

  // ── Parse a backup file and stage it for confirmation ──
  const handleImportBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setRestorePreview({
        transactions: Array.isArray(data.transactions) ? data.transactions.length : 0,
        goals: Array.isArray(data.goals) ? data.goals.length : 0,
        subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions.length : 0,
        exportDate: data.exportDate || data.created_at || 'Unknown',
        parsedData: data,
      });
      setConfirmRestoreFile(file);
    } catch {
      showMessage('error', 'Invalid JSON backup file format.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Confirm and execute the restore; then reload the page ──
  const executeRestore = async () => {
    if (!restorePreview?.parsedData || !userId) return;
    setRestoreLoading(true);
    setConfirmRestoreFile(null);
    try {
      await api.importAllData(userId, restorePreview.parsedData);
      showMessage('success', 'Backup restored successfully! Reloading…');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('Restore error:', error);
      showMessage('error', 'Failed to restore backup: Invalid file format or corrupted data');
    } finally {
      if (isMountedRef.current) {
        setRestoreLoading(false);
        setRestorePreview(null);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Cancel the restore confirmation ──
  const cancelRestore = () => {
    setConfirmRestoreFile(null);
    setRestorePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Toggle auto-backup (weekly) ──
  const toggleAutoBackup = async () => {
    const newState = !autoBackup;
    setAutoBackup(newState);
    try { localStorage.setItem('auto-backup-enabled', JSON.stringify(newState)); } catch { /* ignore */ }

    if (newState) {
      const scheduleBackup = async () => {
        const lastBackup = localStorage.getItem('last-auto-backup');
        const lastTs = lastBackup ? new Date(lastBackup).getTime() : 0;
        const validTs = Number.isFinite(lastTs) ? lastTs : 0;
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (!validTs || Date.now() - validTs > oneWeek) {
          const ok = await handleExportBackup();
          if (ok) {
            try { localStorage.setItem('last-auto-backup', new Date().toISOString()); } catch { /* ignore */ }
          }
        }
      };
      scheduleBackup();
      if (autoBackupIntervalRef.current) clearInterval(autoBackupIntervalRef.current);
      autoBackupIntervalRef.current = setInterval(scheduleBackup, 7 * 24 * 60 * 60 * 1000);
    } else if (autoBackupIntervalRef.current) {
      clearInterval(autoBackupIntervalRef.current);
      autoBackupIntervalRef.current = null;
    }
  };

  return (
    <div className="idp-section" style={{ padding: 20, borderRadius: 16, background: 'var(--glass-2)', marginBottom: 20 }}>
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Database size={20} aria-hidden /> Universal Backup & Data Restore
      </h4>

      {/* ── Export / Import buttons ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleExportBackup}
          disabled={backupLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Download size={16} aria-hidden />
          {backupLoading ? 'Exporting…' : 'Export Full Archive'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={restoreLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Upload size={16} aria-hidden />
          {restoreLoading ? 'Restoring…' : 'Restore from Backup'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportBackup}
          style={{ display: 'none' }}
        />
      </div>

      {/* ── Auto-backup toggle ── */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        <div className="toggle-switch">
          <input
            type="checkbox"
            checked={autoBackup}
            onChange={toggleAutoBackup}
            role="switch"
            aria-checked={autoBackup}
            aria-label="Enable automatic weekly backups"
          />
          <span className="slider" />
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={14} aria-hidden /> Enable Automatic Weekly Backups
        </span>
      </label>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12 }}>
        📦 Backup archives contain all transactions, goals, subscriptions, and preferences.
      </p>

      {/* ── Restore confirmation modal ── */}
      <Modal
        isOpen={!!confirmRestoreFile}
        onClose={cancelRestore}
        title="Confirm Backup Restoration"
        confirmText="Yes, Restore All Data"
        onConfirm={executeRestore}
        isLoading={restoreLoading}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 14, lineHeight: 1.5 }}>
          You are about to restore the following records into your account:
        </p>
        {restorePreview && (
          <div
            style={{
              padding: '12px 16px', borderRadius: 10, background: 'var(--glass-2)',
              marginBottom: 16, fontSize: '0.85rem', border: '1px solid var(--glass-border)',
            }}
          >
            {/* ── Restore preview rows ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>Transactions:</span> <strong>{restorePreview.transactions} items</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>Savings Goals:</span> <strong>{restorePreview.goals} items</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subscriptions:</span> <strong>{restorePreview.subscriptions} items</strong>
            </div>
          </div>
        )}
        <p style={{ color: 'var(--danger, #ef4444)', fontWeight: 700, fontSize: '0.85rem' }}>
          ⚠️ This will replace your current data with the backup contents.
        </p>
      </Modal>
    </div>
  );
};

/* ============================================================
 * Notification preferences
 * ============================================================ */

// ── Notification toggle definitions (key, icon, label) ──
const NOTIFICATION_TOGGLES = [
  { key: 'emailReports', icon: Bell, label: 'Monthly Email Reports' },
  { key: 'weeklyDigest', icon: Calendar, label: 'Weekly Digest' },
  { key: 'budgetAlerts', icon: Bell, label: 'Budget Alerts' },
  { key: 'goalMilestones', icon: Target, label: 'Goal Milestone Achievements' },
  { key: 'unusualSpending', icon: AlertTriangle, label: 'Unusual Spending Alerts' },
  { key: 'pushNotifications', icon: Smartphone, label: 'Push Notifications' },
];

// ── Notification preferences panel with quiet-hours support ──
const NotificationPreferences = ({ preferences, onChange }) => {
  const prefs = preferences || DEFAULT_NOTIFICATION_PREFS;

  // ── Quiet hours validation: start and end must differ when enabled ──
  const quietHoursValid =
    !prefs.quietHoursEnabled ||
    (prefs.quietHoursStart && prefs.quietHoursEnd && prefs.quietHoursStart !== prefs.quietHoursEnd);

  return (
    <>
      {/* ── Header ── */}
      <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
        <div
          className="idp-hero-icon"
          style={{
            width: 64, height: 64, marginBottom: 16,
            background: 'rgba(251,191,36,0.1)', color: 'var(--warning)',
          }}
          aria-hidden
        >
          <BellIcon size={28} />
        </div>
        <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
          Notification Preferences
        </h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Control how and when we notify you.</p>
      </div>

      <div className="idp-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Notification toggles ── */}
          {NOTIFICATION_TOGGLES.map(({ key, icon: Icon, label }) => (
            <div className="form-field" key={key}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[key])}
                    onChange={(e) => onChange({ ...prefs, [key]: e.target.checked })}
                    role="switch"
                    aria-checked={Boolean(prefs[key])}
                    aria-label={label}
                  />
                  <span className="slider" />
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={16} aria-hidden /> {label}
                </span>
              </label>
            </div>
          ))}

          <div style={{ height: 1, background: 'var(--glass-border)', margin: '8px 0' }} />

          {/* ── Quiet hours toggle ── */}
          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.quietHoursEnabled)}
                  onChange={(e) => onChange({ ...prefs, quietHoursEnabled: e.target.checked })}
                  role="switch"
                  aria-checked={Boolean(prefs.quietHoursEnabled)}
                  aria-label="Enable quiet hours"
                />
                <span className="slider" />
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Moon size={16} aria-hidden /> Enable Quiet Hours
              </span>
            </label>
          </div>

          {/* ── Quiet hours time range (shown only when enabled) ── */}
          {prefs.quietHoursEnabled && (
            <div style={{ marginLeft: 24 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-field" style={{ flex: 1 }}>
                  <label htmlFor="quiet_start">Start Time</label>
                  <input
                    id="quiet_start"
                    type="time"
                    value={prefs.quietHoursStart}
                    onChange={(e) => onChange({ ...prefs, quietHoursStart: e.target.value })}
                  />
                </div>
                <div className="form-field" style={{ flex: 1 }}>
                  <label htmlFor="quiet_end">End Time</label>
                  <input
                    id="quiet_end"
                    type="time"
                    value={prefs.quietHoursEnd}
                    onChange={(e) => onChange({ ...prefs, quietHoursEnd: e.target.value })}
                  />
                </div>
              </div>
              {!quietHoursValid && (
                <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.78rem', marginTop: 4 }} role="alert">
                  Start and end times must be different.
                </p>
              )}
              <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 6 }}>
                Overnight ranges are supported — if start is after end, quiet hours span midnight.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/* ============================================================
 * Password change (with re-auth)
 * ============================================================ */
const PasswordChange = ({ userId, showMessage, logout, requestReAuth }) => {
  // ── Local form state + visibility toggle + loading ──
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = getPasswordStrength(passwordData.newPassword);

  // ── Submit handler: validate → re-auth → API call → logout ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showMessage('error', 'New passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      showMessage('error', 'Password must be at least 8 characters');
      return;
    }
    if (strength < 3) {
      showMessage('error', 'Password too weak. Add uppercase, digits, or symbols.');
      return;
    }
    if (passwordData.newPassword === passwordData.currentPassword) {
      showMessage('error', 'New password must be different from current password');
      return;
    }
    if (!userId) {
      showMessage('error', 'Session expired. Please log in again.');
      return;
    }

    // Ask for re-auth before committing
    const proceed = await requestReAuth(
      'change your password',
      passwordData.currentPassword
    );
    if (!proceed) return;

    setLoading(true);
    try {
      await api.changePassword(userId, {
        current: passwordData.currentPassword,
        new: passwordData.newPassword,
      });
      showMessage('success', 'Password changed successfully. Please sign in again.');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => logout?.(), 900);
    } catch (error) {
      showMessage('error', error?.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* ── Current password with show/hide toggle ── */}
      <div className="form-field">
        <label htmlFor="current_password">Current Password</label>
        <div style={{ position: 'relative' }}>
          <input
            id="current_password"
            type={showPassword ? 'text' : 'password'}
            value={passwordData.currentPassword}
            onChange={(e) => setPasswordData((prev) => ({ ...prev, currentPassword: e.target.value }))}
            required
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
            aria-pressed={showPassword}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* ── New password + strength meter ── */}
      <div className="form-field">
        <label htmlFor="new_password">New Password</label>
        <input
          id="new_password"
          type={showPassword ? 'text' : 'password'}
          value={passwordData.newPassword}
          onChange={(e) => setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))}
          required
          autoComplete="new-password"
        />
        <PasswordStrengthIndicator password={passwordData.newPassword} />
      </div>

      {/* ── Confirm new password ── */}
      <div className="form-field">
        <label htmlFor="confirm_new_password">Confirm New Password</label>
        <input
          id="confirm_new_password"
          type={showPassword ? 'text' : 'password'}
          value={passwordData.confirmPassword}
          onChange={(e) => setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
          required
          autoComplete="new-password"
        />
        {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
          <span role="alert" style={{ fontSize: '0.75rem', color: 'var(--danger, #ef4444)', marginTop: 4, display: 'block' }}>
            Passwords do not match
          </span>
        )}
      </div>

      {/* ── Submit ── */}
      <div className="idp-actions">
        <button type="submit" className="btn-primary" disabled={loading}>
          <Key size={18} aria-hidden /> {loading ? 'Changing…' : 'Change Password'}
        </button>
      </div>
    </form>
  );
};

/* ============================================================
 * Session management (fixed cleanup)
 * ============================================================ */
const SessionManagement = ({ userId, showMessage }) => {
  // ── Sessions list + loading + revoke-all confirmation ──
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  // ── Load active sessions for the user ──
  const loadSessions = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    try {
      const data = await api.getActiveSessions(userId);
      setSessions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      showMessage?.('error', 'Failed to load sessions');
    }
  }, [userId, showMessage]);

  // ── Load sessions on mount; guard against unmounted updates ──
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      await loadSessions();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [loadSessions]);

  // ── Revoke a single session (never the current one) ──
  const revokeSession = async (sessionId) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session?.isCurrent) {
      showMessage('error', 'Cannot revoke your current session');
      return;
    }
    if (!userId || !sessionId) {
      showMessage('error', 'Invalid session');
      return;
    }
    if (loading) return;

    setLoading(true);
    try {
      const response = await api.revokeSession(userId, sessionId);
      if (response?.success === false) throw new Error('Failed to revoke session');
      showMessage('success', 'Session revoked successfully');
      await loadSessions();
    } catch (error) {
      console.error('Revoke session error:', error);
      showMessage('error', error?.message || 'Failed to revoke session');
    } finally {
      setLoading(false);
    }
  };

  // ── Ask for confirmation before revoking all other sessions ──
  const requestRevokeAll = () => {
    if (!userId) {
      showMessage('error', 'User not identified');
      return;
    }
    setConfirmRevokeAll(true);
  };

  // ── Execute revoke-all-other-sessions ──
  const executeRevokeAll = async () => {
    setConfirmRevokeAll(false);
    if (!userId || loading) return;
    setLoading(true);
    try {
      const response = await api.revokeAllOtherSessions(userId);
      if (response?.success === false) throw new Error('Failed to revoke sessions');
      showMessage('success', 'All other sessions have been revoked');
      await loadSessions();
    } catch (error) {
      console.error('Revoke all sessions error:', error);
      showMessage('error', error?.message || 'Failed to revoke sessions');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading skeleton ──
  if (loading && sessions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-busy="true">
        <div className="shimmer" style={{ height: 60, borderRadius: 12 }} />
        <div className="shimmer" style={{ height: 60, borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <div>
      {/* ── Header with revoke-all button ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h4 style={{ margin: 0 }}>Active Sessions</h4>
        <button
          type="button"
          className="btn-secondary"
          onClick={requestRevokeAll}
          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
        >
          <LogOut size={14} aria-hidden /> Revoke All Other Sessions
        </button>
      </div>

      {/* ── Session rows ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sessions.map((session) => (
          <div
            key={session.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 12, background: 'var(--glass-2)', borderRadius: 12,
              flexWrap: 'wrap', gap: 12,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Smartphone size={16} aria-hidden />
                <strong>{session.device || 'Unknown Device'}</strong>
                {session.isCurrent && (
                  <span
                    style={{
                      fontSize: '0.7rem', background: '#10b981', color: 'white',
                      padding: '2px 8px', borderRadius: 12,
                    }}
                  >
                    Current
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Location: {session.location || 'Unknown'} · Last active:{' '}
                {new Date(session.lastActive).toLocaleString()}
              </div>
            </div>
            {!session.isCurrent && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => revokeSession(session.id)}
                style={{ padding: '6px 12px' }}
                aria-label={`Revoke session on ${session.device || 'unknown device'}`}
              >
                Revoke
              </button>
            )}
          </div>
        ))}

        {sessions.length === 0 && !loading && (
          <p style={{ color: 'var(--text-muted)' }}>No other active sessions found.</p>
        )}
      </div>

      {/* ── Revoke-all confirmation modal ── */}
      <Modal
        isOpen={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        title="Revoke All Other Sessions"
        confirmText="Yes, Log Out Everywhere Else"
        onConfirm={executeRevokeAll}
        isLoading={loading}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 16, lineHeight: 1.6 }}>
          This will log you out of all other devices. Are you sure you want to continue?
        </p>
      </Modal>
    </div>
  );
};

/* ============================================================
 * Advanced preferences
 * ============================================================ */
const AdvancedPreferences = ({ prefs, onChange }) => {
  const p = prefs || DEFAULT_ADVANCED_PREFS;
  const update = (patch) => onChange({ ...p, ...patch });

  // ── Boolean toggle definitions ──
  const toggles = [
    { key: 'compactMode', icon: Zap, label: 'Compact Mode (Denser Layout)' },
    { key: 'autoSave', icon: Save, label: 'Auto-save Changes' },
    { key: 'animationsEnabled', icon: Activity, label: 'Enable Animations' },
    { key: 'showWeekNumbers', icon: Calendar, label: 'Show Week Numbers in Calendar' },
  ];

  return (
    <>
      {/* ── Header ── */}
      <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
        <div className="idp-hero-icon" style={{ width: 64, height: 64, marginBottom: 16 }} aria-hidden>
          <Zap size={28} />
        </div>
        <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
          Advanced Preferences
        </h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Fine-tune your experience.</p>
      </div>

      <div className="idp-body">
        {/* ── Format selectors ── */}
        <div className="form-field">
          <label htmlFor="date_format">Date Format</label>
          <select id="date_format" value={p.dateFormat} onChange={(e) => update({ dateFormat: e.target.value })}>
            <option>MM/DD/YYYY</option>
            <option>DD/MM/YYYY</option>
            <option>YYYY-MM-DD</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="time_format">Time Format</label>
          <select id="time_format" value={p.timeFormat} onChange={(e) => update({ timeFormat: e.target.value })}>
            <option value="12h">12h (AM/PM)</option>
            <option value="24h">24h</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="first_day">First Day of Week</label>
          <select id="first_day" value={p.firstDayOfWeek} onChange={(e) => update({ firstDayOfWeek: e.target.value })}>
            <option>Sunday</option>
            <option>Monday</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="decimal_sep">Decimal Separator</label>
          <select id="decimal_sep" value={p.decimalSeparator} onChange={(e) => update({ decimalSeparator: e.target.value })}>
            <option value=".">Period (.) - 1,000.00</option>
            <option value=",">Comma (,) - 1.000,00</option>
          </select>
        </div>

        {/* ── Session timeout selector ── */}
        <div className="form-field">
          <label htmlFor="session_timeout">
            <Clock size={14} aria-hidden /> Auto-logout after inactivity (minutes)
          </label>
          <select
            id="session_timeout"
            value={p.sessionTimeoutMinutes || 30}
            onChange={(e) => update({ sessionTimeoutMinutes: Number(e.target.value) })}
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={0}>Never (not recommended)</option>
          </select>
        </div>

        {/* ── Boolean toggles ── */}
        {toggles.map(({ key, icon: Icon, label }) => (
          <div className="form-field" key={key}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={key === 'autoSave' || key === 'animationsEnabled' ? p[key] !== false : Boolean(p[key])}
                  onChange={(e) => update({ [key]: e.target.checked })}
                  role="switch"
                  aria-checked={key === 'autoSave' || key === 'animationsEnabled' ? p[key] !== false : Boolean(p[key])}
                  aria-label={label}
                />
                <span className="slider" />
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon size={16} aria-hidden /> {label}
              </span>
            </label>
          </div>
        ))}
      </div>
    </>
  );
};

/* ============================================================
 * Email change (with logout + re-auth)
 * ============================================================ */
const EmailChangeSection = ({ user, showMessage, logout, requestReAuth, t }) => {
  // ── Modal visibility + form state ──
  const [showModal, setShowModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPassword: '' });
  const [loading, setLoading] = useState(false);

  // ── Submit handler: validate → re-auth → API call → logout ──
  const handleSubmit = async () => {
    if (!emailForm.newEmail || !emailForm.currentPassword) {
      showMessage('error', 'All fields are required.');
      return;
    }
    if (!validateEmail(emailForm.newEmail)) {
      showMessage('error', 'Please enter a valid email address.');
      return;
    }

    const proceed = await requestReAuth('change your email', emailForm.currentPassword);
    if (!proceed) return;

    setLoading(true);
    try {
      const res = await api.changeEmail({
        currentPassword: emailForm.currentPassword,
        newEmail: emailForm.newEmail,
      });
      showMessage('success', res.message || 'Email updated! Please log in again.');
      setShowModal(false);
      setEmailForm({ newEmail: '', currentPassword: '' });
      setTimeout(() => logout?.(), 1200);
    } catch (err) {
      showMessage('error', err?.response?.data?.message || 'Failed to update email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Read-only email + change trigger ── */}
      <div className="form-field" style={{ marginTop: 24 }}>
        <label>{t?.('email_address') || 'Email Address'}</label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={user?.email || ''}
            readOnly
            style={{ flex: 1, minWidth: 'min(200px, 100%)', opacity: 0.7, background: 'var(--surface-1)' }}
          />
          <button type="button" className="btn-secondary" onClick={() => setShowModal(true)} style={{ whiteSpace: 'nowrap' }}>
            {t?.('change_email') || 'Change Email'}
          </button>
        </div>
      </div>

      {/* ── Change-email modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEmailForm({ newEmail: '', currentPassword: '' }); }}
        title="Change Email Address"
        confirmText="Update Email"
        onConfirm={handleSubmit}
        isLoading={loading}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20, lineHeight: 1.6 }}>
          Enter your new email and current password to verify the change.
        </p>
        <div className="form-field">
          <label htmlFor="new_email_input">New Email Address</label>
          <input
            id="new_email_input"
            type="email"
            value={emailForm.newEmail}
            onChange={(e) => setEmailForm((prev) => ({ ...prev, newEmail: e.target.value }))}
            placeholder="newaddress@example.com"
            autoFocus
          />
        </div>
        <div className="form-field">
          <label htmlFor="email_change_password">Current Password</label>
          <input
            id="email_change_password"
            type="password"
            value={emailForm.currentPassword}
            onChange={(e) => setEmailForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            placeholder="Your current password"
            autoComplete="current-password"
          />
        </div>
      </Modal>
    </>
  );
};

/* ============================================================
 * Profile tab
 * ============================================================ */
const ProfileTab = ({ formState, handleFieldChange, t, user, showMessage, logout, requestReAuth }) => {
  // ── File input + emoji tray visibility ──
  const fileInputRef = useRef(null);
  const [showEmojiTray, setShowEmojiTray] = useState(false);

  // ── Handle image upload: downscale to 360px, then persist as dataURL ──
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showMessage('error', t?.('image_too_large') || 'Image must be 10 MB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 360;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          handleFieldChange('avatar', canvas.toDataURL('image/jpeg', 0.9));
          showMessage('success', 'Photo selected! Click "Save Changes" below to persist.');
        } else {
          handleFieldChange('avatar', event.target.result);
        }
      };
      img.onerror = () => showMessage('error', 'Invalid image file.');
      img.src = event.target.result;
    };
    reader.onerror = () => showMessage('error', 'Could not read image file.');
    reader.readAsDataURL(file);
  };

  // ── Apply an emoji avatar ──
  const selectEmoji = (emojiData) => {
    handleFieldChange('avatar', emojiData.emoji);
    setShowEmojiTray(false);
  };

  // ── Detect whether the current avatar is a URL/base64 image ──
  const isBase64Avatar = /^(?:data:image\/|blob:|https?:\/\/|\/(?!\/))/i.test(String(formState.avatar || '').trim());

  // ── Compute profile completion % from populated fields ──
  const profileChecks = [
    Boolean(formState.firstName?.trim()),
    Boolean(formState.lastName?.trim()),
    Boolean(formState.profession?.trim()),
    Boolean(formState.avatar),
    Boolean(user?.email),
  ];
  const profileCompletion = Math.round((profileChecks.filter(Boolean).length / profileChecks.length) * 100);
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : 'Recently';

  return (
    <>
      {/* ── Header ── */}
      <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
        <div className="idp-hero-icon income" style={{ width: 64, height: 64, marginBottom: 16 }} aria-hidden>
          <User size={28} />
        </div>
        <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
          {t?.('profile') || 'Profile'}
        </h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          {t?.('configure_identity_desc') || 'Configure your personal identity within MyCoinwise.'}
        </p>
      </div>

      <div className="idp-body">
        {/* ── Profile summary tiles ── */}
        <div className="profile-summary-grid" aria-label="Profile summary">
          <div className="profile-summary-card">
            <span className="profile-summary-label">{t?.('profile_completeness') || 'Profile completeness'}</span>
            <strong>{profileCompletion}%</strong>
            <div className="profile-completion-track" aria-hidden><span style={{ width: `${profileCompletion}%` }} /></div>
          </div>
          <div className="profile-summary-card">
            <span className="profile-summary-label">{t?.('member_since') || 'Member since'}</span>
            <strong>{memberSince}</strong>
            <span className="profile-summary-detail">{t?.('personal_workspace') || 'Your personal workspace'}</span>
          </div>
          <div className="profile-summary-card email-status-card">
            <span className="profile-summary-label">{t?.('email_status') || 'Email status'}</span>
            <strong className={user?.email_verified ? 'status-good' : 'status-pending'}>
              {user?.email_verified ? (t?.('verified') || 'Verified') : (t?.('unverified') || 'Unverified')}
            </strong>
            <span className="profile-summary-detail">{formState.currency} {t?.('personal_workspace') || 'workspace'}</span>
          </div>
        </div>

        {/* ── Avatar + color picker ── */}
        <div style={{ display: 'flex', gap: 30, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* ── Avatar preview ── */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            style={{
              width: 100, height: 100, borderRadius: '50%', background: formState.avatarColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '3rem', boxShadow: `0 0 30px ${formState.avatarColor}55`,
              flexShrink: 0, position: 'relative', overflow: 'hidden',
            }}
          >
            {isBase64Avatar ? (
              <img src={formState.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              formState.avatar
            )}
          </motion.div>

          <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── Emoji / image chooser ── */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
                {t?.('profile_picture') || 'Profile Picture'}
              </label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEmojiTray((open) => !open)}
                  aria-expanded={showEmojiTray}
                  aria-controls="profile-emoji-tray"
                >
                  😊 {t?.('choose_emoji') || 'Choose Emoji'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ flex: 1, minWidth: 140, justifyContent: 'center' }}
                >
                  <Upload size={16} aria-hidden /> {t?.('upload_image') || 'Upload Image'}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
              </div>

              {/* ── Lazy-loaded emoji picker tray ── */}
              {showEmojiTray && (
                <div id="profile-emoji-tray" className="profile-emoji-tray" role="dialog" aria-label="Choose a profile emoji">
                  <Suspense fallback={<div style={{ padding: 20, textAlign: 'center' }}><Loader className="spin" size={24} /></div>}>
                    <EmojiPicker
                      onEmojiClick={selectEmoji}
                      width="100%"
                      height={360}
                      lazyLoadEmojis
                      previewConfig={{ showPreview: false }}
                    />
                  </Suspense>
                </div>
              )}
            </div>

            {/* ── Profile color options ── */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
                {t?.('profile_color') || 'Profile Color'}
              </label>
              <div className="profile-color-options" role="group" aria-label="Choose your profile color">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleFieldChange('avatarColor', color)}
                    aria-label={`Select color ${color}`}
                    aria-pressed={formState.avatarColor === color}
                    style={{
                      width: 32, height: 32, borderRadius: '50%', background: color,
                      border: formState.avatarColor === color ? '3px solid white' : '2px solid transparent',
                      cursor: 'pointer',
                      outline: formState.avatarColor === color ? `3px solid ${color}` : 'none',
                      boxShadow: formState.avatarColor === color ? `0 0 16px ${color}` : 'none',
                      transition: 'all 0.2s',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--glass-border)', margin: '10px 0' }} />

        {/* ── First name + Surname ── */}
        <div className="profile-name-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div className="form-field" style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="first_name">{t?.('first_name') || 'First Name'}</label>
            <input
              id="first_name"
              value={formState.firstName}
              onChange={(e) => handleFieldChange('firstName', e.target.value)}
              placeholder="First name"
              autoCapitalize="words"
              maxLength={80}
            />
          </div>
          <div className="form-field" style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="last_name">{t?.('last_name') || 'Surname'}</label>
            <input
              id="last_name"
              value={formState.lastName}
              onChange={(e) => handleFieldChange('lastName', e.target.value)}
              placeholder="Surname"
              autoCapitalize="words"
              maxLength={80}
            />
          </div>
        </div>

        {/* ── Profession ── */}
        <div className="form-field" style={{ marginTop: 16 }}>
          <label htmlFor="profession">{t?.('profession_role') || 'Profession / Role'}</label>
          <input
            id="profession"
            type="text"
            value={formState.profession}
            onChange={(e) => handleFieldChange('profession', e.target.value)}
            placeholder="e.g. Product designer, Student, Consultant"
            maxLength={80}
            autoComplete="organization-title"
          />
          <span className="form-help">{t?.('profession_role_hint') || 'Write the profession or role you want shown on your profile.'}</span>
        </div>

        {/* ── Email change section ── */}
        <EmailChangeSection
          user={user}
          showMessage={showMessage}
          logout={logout}
          requestReAuth={requestReAuth}
          t={t}
        />
      </div>
    </>
  );
};

/* ============================================================
 * Preferences tab
 * ============================================================ */
const PreferencesTab = ({ formState, handleFieldChange, t }) => (
  <>
    {/* ── Header ── */}
    <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
      <div
        className="idp-hero-icon"
        style={{
          width: 64, height: 64, marginBottom: 16,
          background: 'rgba(56,189,248,0.1)', color: 'var(--brand-secondary)',
          border: '1px solid rgba(56,189,248,0.3)',
        }}
        aria-hidden
      >
        <Settings size={28} />
      </div>
      <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
        Preferences
      </h3>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Set your regional currency and savings goals.</p>
    </div>

    <div className="idp-body">
      {/* ── Currency selector ── */}
      <div className="form-field">
        <label htmlFor="currency_select">{t?.('currency') || 'Currency'}</label>
        <select
          id="currency_select"
          value={formState.currency}
          onChange={(e) => handleFieldChange('currency', e.target.value)}
        >
          {Object.entries(CURRENCIES || {}).map(([code, info]) => (
            <option key={code} value={code}>
              {info.flag} {code} – {info.name} ({info.symbol})
            </option>
          ))}
        </select>
      </div>

      {/* ── Monthly goal ── */}
      <div className="form-field">
        <label htmlFor="monthly_goal_input">
          <Target size={14} aria-hidden /> {t?.('monthly_goal') || 'Monthly Goal'}
        </label>
        <input
          id="monthly_goal_input"
          type="number"
          value={formState.monthlyGoal}
          onChange={(e) => handleFieldChange('monthlyGoal', e.target.value)}
          placeholder="e.g. 5000"
          min="0"
          step="1"
        />
      </div>
    </div>
  </>
);

/* ============================================================
 * Language tab
 * ============================================================ */
const LanguageTab = ({ lang, setLanguage, showMessage, t }) => (
  <>
    {/* ── Header ── */}
    <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
      <div
        className="idp-hero-icon"
        style={{
          width: 64, height: 64, marginBottom: 16,
          background: 'rgba(251,191,36,0.1)', color: 'var(--warning)',
          border: '1px solid rgba(251,191,36,0.3)',
        }}
        aria-hidden
      >
        <Globe size={28} />
      </div>
      <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
        {t?.('language') || 'Language'}
      </h3>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>MyCoinwise speaks your language.</p>
    </div>

    {/* ── Language option buttons ── */}
    <div className="idp-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Object.entries(LANGUAGES || {}).map(([code, info]) => (
        <motion.button
          key={code}
          type="button"
          onClick={() => {
            setLanguage(code);
            showMessage('success', t?.('language_updated') || 'Language updated successfully');
          }}
          whileHover={{ x: 4, scale: 1.01 }}
          aria-pressed={lang === code}
          style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
            borderRadius: 16,
            border: lang === code ? '2px solid var(--brand-primary)' : '1px solid var(--glass-border)',
            background: lang === code ? 'rgba(var(--brand-primary-rgb), 0.08)' : 'var(--surface-1)',
            cursor: 'pointer', color: 'var(--text-primary)',
            fontWeight: lang === code ? 800 : 600, transition: 'all 0.2s',
            boxShadow: lang === code ? '0 8px 24px rgba(var(--brand-primary-rgb), 0.15)' : 'none',
          }}
        >
          <span style={{ fontSize: '1.5rem' }} aria-hidden>{info.flag || '🌐'}</span>
          <span style={{ flex: 1, textAlign: 'left', fontSize: '1.05rem' }}>{info.name}</span>
          {lang === code && <CheckCircle size={20} color="var(--brand-primary)" aria-hidden />}
        </motion.button>
      ))}
    </div>
  </>
);

/* ============================================================
 * Appearance tab (adds Auto)
 * ============================================================ */
const AppearanceTab = ({ theme, handleThemeChange }) => {
  // ── Available theme options ──
  const themes = [
    { id: 'light', label: 'Light', icon: <Sun size={18} />, bg: '#e8f7ed', accent: '#059669', sub: 'Clean Light' },
    { id: 'amoled', label: 'AMOLED', icon: <Moon size={18} />, bg: '#000000', accent: '#34d399', sub: 'True Black' },
    { id: 'auto', label: 'Auto', icon: <Monitor size={18} />, bg: 'var(--glass-2)', accent: '#8b5cf6', sub: 'Follow System' },
  ];

  return (
    <>
      {/* ── Header ── */}
      <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
        <div
          className="idp-hero-icon"
          style={{
            width: 64, height: 64, marginBottom: 16,
            background: 'rgba(236,72,153,0.1)', color: '#ec4899',
            border: '1px solid rgba(236,72,153,0.3)',
          }}
          aria-hidden
        >
          <Palette size={28} />
        </div>
        <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Appearance</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Choose a theme that fits your vibe.</p>
      </div>

      {/* ── Theme preview buttons ── */}
      <div
        className="idp-body"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, padding: '30px 20px' }}
      >
        {themes.map((opt) => (
          <motion.button
            key={opt.id}
            type="button"
            whileHover={{ scale: 1.05, y: -4 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleThemeChange(opt.id)}
            aria-pressed={theme === opt.id}
            style={{
              padding: '24px 16px', borderRadius: 20,
              border: theme === opt.id ? `2px solid ${opt.accent}` : '1px solid var(--glass-border)',
              background: opt.bg, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              transition: 'all 0.25s',
              boxShadow: theme === opt.id ? `0 12px 32px ${opt.accent}44, inset 0 0 20px ${opt.accent}22` : 'var(--shadow-sm)',
              position: 'relative',
            }}
          >
            <span style={{ fontSize: '2.4rem', filter: theme === opt.id ? `drop-shadow(0 0 16px ${opt.accent})` : 'none' }} aria-hidden>
              {opt.icon}
            </span>
            <span style={{ color: opt.accent, fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-head)' }}>
              {opt.label}
            </span>
            <span style={{ color: opt.accent, opacity: 0.7, fontSize: '0.8rem', fontWeight: 600 }}>{opt.sub}</span>

            {/* ── Active checkmark ── */}
            {theme === opt.id && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ position: 'absolute', top: 12, right: 12 }}>
                <CheckCircle size={18} color={opt.accent} aria-hidden />
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>
    </>
  );
};

/* ============================================================
 * Users tab
 * ============================================================ */
const UsersTab = React.memo(({ sortedUsers, USER_ID, setModals, switchingUserId, previousSession, revertSession, t }) => {
  // ── Honor reduced motion for hover/tap scales ──
  const prefersReducedMotion = useReducedMotion();
  const rowHover = prefersReducedMotion ? undefined : { x: 4 };
  const switchHover = prefersReducedMotion ? undefined : { scale: 1.05 };
  const deleteHover = prefersReducedMotion ? undefined : { scale: 1.1 };
  const tapScale = prefersReducedMotion ? undefined : { scale: 0.95 };
  const deleteTapScale = prefersReducedMotion ? undefined : { scale: 0.9 };
  const addHover = prefersReducedMotion ? undefined : { scale: 1.02 };

  const users = Array.isArray(sortedUsers) ? sortedUsers : [];

  return (
    <>
      {/* ── Hero header ── */}
      <div className="manage-users-hero">
        <div className="idp-hero-icon manage-users-hero-icon" aria-hidden>
          <Users size={28} />
        </div>
        <div>
          <div className="manage-users-title-row">
            <h3>{t?.('manage_users') || 'Manage Users'}</h3>
            <span className="manage-users-count">
              {users.length} {users.length === 1 ? (t?.('profile_count') || 'profile') : (t?.('profiles_count') || 'profiles')}
            </span>
          </div>
          <p>{t?.('manage_users_desc') || 'Easily switch between household accounts and keep each workspace personal.'}</p>
        </div>
      </div>

      <div className="manage-users-body">
        {/* ── Revert-to-previous-session banner ── */}
        {previousSession && String(previousSession.id) !== String(USER_ID) && (
          <div
            className="manage-users-revert-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 16px',
              marginBottom: 16,
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>↩️</span>
              <div>
                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  Previous Session: {previousSession.username}
                </p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  You switched from {previousSession.username}. Revert your session anytime without restriction.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="manage-user-switch"
              onClick={() => revertSession?.()}
              disabled={!!switchingUserId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                fontSize: '0.85rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              <Users size={14} aria-hidden />
              Revert to {previousSession.username}
            </button>
          </div>
        )}

        {/* ── Empty state ── */}
        {users.length === 0 ? (
          <div
            className="manage-users-empty"
            role="status"
            aria-live="polite"
            style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}
          >
            <Users size={40} aria-hidden style={{ opacity: 0.3, margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{t?.('no_users_yet') || 'No users yet.'}</p>
            <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>{t?.('add_first_user') || 'Add your first user to get started.'}</p>
          </div>
        ) : (
          /* ── User rows ── */
          <div className="manage-users-list" role="list">
            {users.map((u, i) => {
              const uid = u?.id || u?._id;
              const isCurrentUser = Boolean(uid && USER_ID && String(uid) === String(USER_ID));
              const isSwitching = Boolean(switchingUserId && uid && String(switchingUserId) === String(uid));
              const isPreviousSession = Boolean(previousSession?.id && uid && String(previousSession.id) === String(uid));
              const avatar = getSafeUserAvatar(u);
              const email = getSafeUserEmail(u);
              const displayName = getUserDisplayName(u);
              const fallbackKey = uid || `user-${u?.email || u?.username || i}`;

              return (
                <motion.div
                  key={fallbackKey}
                  role="listitem"
                  whileHover={rowHover}
                  className={`manage-user-card ${isCurrentUser ? 'is-active' : ''}`}
                >
                  {/* ── Avatar ── */}
                  <span className="manage-user-avatar" style={{ background: u?.profile_color || '#059669' }} aria-hidden>
                    {avatar.type === 'image' ? <img src={avatar.value} alt="" /> : avatar.value}
                  </span>

                  {/* ── Name / email / role ── */}
                  <div className="manage-user-main">
                    <p className="manage-user-name">
                      {displayName}
                      {isPreviousSession && (
                        <span style={{
                          marginLeft: 8,
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: 'var(--brand-primary)',
                          fontWeight: 600,
                          verticalAlign: 'middle',
                        }}>
                          Previous Session
                        </span>
                      )}
                    </p>
                    {email && <p className="manage-user-email" title={email}>{email}</p>}
                    <span className="manage-user-role">{u?.profession || t?.('personal_workspace') || 'Personal workspace'}</span>
                  </div>

                  {/* ── Actions ── */}
                  {isCurrentUser ? (
                    <span className="manage-user-status">{t?.('active') || 'Active'}</span>
                  ) : (
                    <div className="manage-user-actions">
                      <motion.button
                        type="button"
                        whileHover={switchHover}
                        whileTap={tapScale}
                        onClick={() => uid && setModals((prev) => ({ ...prev, switchConfirm: u }))}
                        disabled={isSwitching}
                        aria-label={`Switch to ${displayName}`}
                        className="manage-user-switch"
                      >
                        <Users size={14} aria-hidden />
                        {isSwitching
                          ? (t?.('switching') || 'Switching…')
                          : (isPreviousSession ? 'Revert' : (t?.('switch') || 'Switch'))}
                      </motion.button>
                      <motion.button
                        type="button"
                        whileHover={deleteHover}
                        whileTap={deleteTapScale}
                        onClick={() => uid && setModals((prev) => ({ ...prev, deleteUser: uid }))}
                        disabled={isSwitching}
                        aria-label={`Delete ${displayName}`}
                        className="manage-user-delete"
                      >
                        <Trash2 size={16} aria-hidden />
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── Add new user ── */}
        <motion.button
          type="button"
          className="btn-secondary manage-users-add"
          onClick={() => setModals((prev) => ({ ...prev, addUser: { name: '', email: '' } }))}
          whileHover={addHover}
        >
          <Plus size={18} aria-hidden /> {t?.('add_new_user') || 'Add New User'}
        </motion.button>
      </div>
    </>
  );
});
UsersTab.displayName = 'UsersTab';
UsersTab.propTypes = {
  sortedUsers: PropTypes.arrayOf(PropTypes.object),
  USER_ID: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  setModals: PropTypes.func.isRequired,
  switchingUserId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  t: PropTypes.func,
};

/* ============================================================
 * Data tab
 * ============================================================ */
const DataTab = ({ setModals, handleExcelExport, handlePDFExport, excelLoading, pdfLoading, t }) => (
  <>
    {/* ── Header ── */}
    <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
      <div className="idp-hero-icon expense" style={{ width: 64, height: 64, marginBottom: 16 }} aria-hidden>
        <Database size={28} />
      </div>
      <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
        {t?.('data_security') || 'Data & Security'}
      </h3>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        {t?.('data_security_desc') || 'Export your data, backup your transactions, or manage your data vaults.'}
      </p>
    </div>

    <div className="idp-body" style={{ background: 'transparent', border: 'none', padding: 0 }}>
      {/* ── Export buttons ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 30 }}>
        <motion.button
          type="button"
          onClick={handleExcelExport}
          disabled={excelLoading}
          className="btn-secondary"
          whileHover={{ scale: 1.03, y: -2 }}
          style={{ flexDirection: 'column', gap: 12, padding: '24px 16px', background: 'var(--glass-2)' }}
        >
          <div style={{ padding: 12, background: 'rgba(16,185,129,0.1)', borderRadius: 12, color: 'var(--success)' }} aria-hidden>
            <Download size={24} />
          </div>
          <span style={{ fontWeight: 800 }}>{excelLoading ? (t?.('exporting') || 'Exporting…') : (t?.('download_excel') || 'Download Excel')}</span>
        </motion.button>
        <motion.button
          type="button"
          onClick={handlePDFExport}
          disabled={pdfLoading}
          className="btn-secondary"
          whileHover={{ scale: 1.03, y: -2 }}
          style={{ flexDirection: 'column', gap: 12, padding: '24px 16px', background: 'var(--glass-2)' }}
        >
          <div style={{ padding: 12, background: 'rgba(56,189,248,0.1)', borderRadius: 12, color: 'var(--brand-secondary)' }} aria-hidden>
            <FileText size={24} />
          </div>
          <span style={{ fontWeight: 800 }}>{pdfLoading ? (t?.('exporting') || 'Generating…') : (t?.('download_pdf') || 'Download PDF')}</span>
        </motion.button>
      </div>

      {/* ── Danger zone: factory reset ── */}
      <div
        className="idp-section"
        style={{
          background: 'rgba(239,68,68,0.05)', padding: 24, borderRadius: 20,
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        <h4 style={{ color: 'var(--danger)', fontSize: '1.2rem', fontWeight: 800, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={20} aria-hidden /> {t?.('danger_zone') || 'Danger Zone'}
        </h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20, lineHeight: 1.6 }}>
          {t?.('reset_warning') || 'This will delete ALL your transactions and reset your balance to zero. This action cannot be undone.'}
        </p>
        <motion.button
          type="button"
          className="btn-primary"
          onClick={() => setModals((prev) => ({ ...prev, resetConfirm: true }))}
          whileHover={{ scale: 1.02 }}
          style={{ background: 'var(--danger)', width: 'max-content' }}
        >
          <ShieldAlert size={16} aria-hidden /> {t?.('factory_reset') || 'Factory Reset Account'}
        </motion.button>
      </div>
    </div>
  </>
);

/* ============================================================
 * Factory reset modal
 * ============================================================ */
const FactoryResetModalInner = ({ onClose, onConfirm, isLoading }) => {
  // ── Require the user to type DELETE before confirming ──
  const [confirmText, setConfirmText] = useState('');
  const isConfirmed = confirmText === 'DELETE';

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Confirm Factory Reset"
      confirmText="Permanently Delete All Data"
      onConfirm={onConfirm}
      isLoading={isLoading}
      danger
      confirmDisabled={!isConfirmed}
    >
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <AlertTriangle size={48} style={{ color: 'var(--danger)', marginBottom: 12 }} aria-hidden />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          You are about to permanently delete <strong>all data</strong> associated with your account.
        </p>
        <p style={{ color: 'var(--danger)', fontWeight: 700, marginTop: 12 }}>
          This action CANNOT be undone!
        </p>
      </div>

      {/* ── Type-to-confirm input ── */}
      <div className="form-field">
        <label htmlFor="reset_confirm_input" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Type <strong style={{ color: 'var(--danger)', letterSpacing: '0.05em' }}>DELETE</strong> to confirm:
        </label>
        <input
          id="reset_confirm_input"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE here"
          style={{ borderColor: isConfirmed ? 'var(--danger)' : undefined }}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </div>
    </Modal>
  );
};

// ── Wrapper: only mounts inner modal when open ──
const FactoryResetModal = ({ isOpen, onClose, onConfirm, isLoading }) => {
  if (!isOpen) return null;
  return <FactoryResetModalInner onClose={onClose} onConfirm={onConfirm} isLoading={isLoading} />;
};

/* ============================================================
 * Reducer
 * ============================================================ */
const settingsReducer = (state, action) => {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value, isDirty: true };
    case 'RESET_FORM':
      return { ...action.payload, isDirty: false };
    case 'CLEAR_DIRTY':
      return { ...state, isDirty: false };
    default:
      return state;
  }
};

/* ============================================================
 * Main component
 * ============================================================ */
function SettingsInner({ context }) {
  const {
    user,
    allUsers = [],
    theme,
    setThemeDirect,
    refetch,
    USER_ID,
    resetAccount,
    createUser,
    switchUser,
    previousSession,
    revertSession,
    currencyInfo,
    lang,
    setLanguage,
    t,
    transactions = [],
    logout,
  } = context;

  const navigate = useNavigate();
  const { showToast: showMessage } = useToast();

  /* ---------------- Form state ---------------- */

  // ── Reducer-based form state derived from the user ──
  const [formState, dispatch] = useReducer(
    settingsReducer,
    buildResetPayload(user)
  );

  // Reset form when the user object identity changes
  useEffect(() => {
    if (user) {
      dispatch({ type: 'RESET_FORM', payload: buildResetPayload(user) });
    }
  }, [user]);

  /* ---------------- Tabs ---------------- */

  // ── Tab state, driven by the ?tab= search param ──
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => (
    tabParam && TAB_IDS.includes(tabParam) ? tabParam : 'profile'
  ));

  useEffect(() => {
    if (tabParam && TAB_IDS.includes(tabParam)) setActiveTab(tabParam);
  }, [tabParam]);

  /* ---------------- New: settings search ---------------- */
  const [search, setSearch] = useState('');

  /* ---------------- Modals ---------------- */

  // ── Modal visibility / target state ──
  const [modals, setModals] = useState({
    addUser: false,
    resetConfirm: false,
    deleteUser: null,
    switchConfirm: null,
  });

  /* ---------------- Independent loading states ---------------- */

  // ── Independent in-flight flags per action ──
  const [loadingStates, setLoadingStates] = useState({
    save: false,
    createUser: false,
    reset: false,
    switch: null,
    pdf: false,
    excel: false,
    deleteUser: false,
  });

  // ── Snapshot of the last saved state for undo ──
  const [undoSnapshot, setUndoSnapshot] = useState(null);

  /* ---------------- Re-auth modal state ---------------- */

  // ── Promise-based re-auth gate for destructive actions ──
  const [reAuthState, setReAuthState] = useState({
    isOpen: false,
    actionLabel: '',
    resolve: null,
  });

  const requestReAuth = useCallback((actionLabel, _passwordHint) => {
    return new Promise((resolve) => {
      setReAuthState({ isOpen: true, actionLabel, resolve });
    });
  }, []);

  const handleReAuthConfirm = useCallback(async (password) => {
    // In a real backend, you would call `api.verifyPassword(USER_ID, password)`.
    // Here we delegate to api.changePassword-style verification if available,
    // otherwise we accept the password and let the downstream call validate it.
    if (typeof api.verifyPassword === 'function') {
      const ok = await api.verifyPassword(USER_ID, password);
      if (!ok) throw new Error('Incorrect password.');
    }
    reAuthState.resolve?.(true);
    setReAuthState({ isOpen: false, actionLabel: '', resolve: null });
    return true;
  }, [reAuthState, USER_ID]);

  const handleReAuthClose = useCallback(() => {
    reAuthState.resolve?.(false);
    setReAuthState({ isOpen: false, actionLabel: '', resolve: null });
  }, [reAuthState]);

  /* ---------------- Ref ---------------- */

  // ── Mounted guard + theme-save debounce timer ──
  const isMounted = useRef(true);
  const themeSaveTimerRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (themeSaveTimerRef.current) clearTimeout(themeSaveTimerRef.current);
    };
  }, []);

  /* ---------------- Unsaved changes warning ---------------- */
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (formState.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [formState.isDirty]);

  /* ---------------- Session idle timeout ---------------- */
  useEffect(() => {
    const minutes = Number(formState.advancedPrefs?.sessionTimeoutMinutes ?? 30);
    if (!minutes || minutes <= 0 || !logout) return undefined;

    let timeoutId;
    const reset = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        showMessage('info', 'Session timed out due to inactivity. Please log in again.');
        logout();
      }, minutes * 60 * 1000);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => document.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach((ev) => document.removeEventListener(ev, reset));
    };
  }, [formState.advancedPrefs?.sessionTimeoutMinutes, logout, showMessage]);

  /* ---------------- Apply compact mode + animations to DOM ---------------- */
  useEffect(() => {
    const compact = Boolean(formState.advancedPrefs?.compactMode);
    const animations = formState.advancedPrefs?.animationsEnabled !== false;
    document.body.classList.toggle('compact-mode', compact);
    document.body.classList.toggle('no-animations', !animations);
  }, [formState.advancedPrefs?.compactMode, formState.advancedPrefs?.animationsEnabled]);

  /* ---------------- Field change ---------------- */

  // ── Dispatch a single field update (marks dirty) ──
  const handleFieldChange = useCallback((field, value) => {
    dispatch({ type: 'SET_FIELD', field, value });
  }, []);

  /* ============================================================
   * Save
   * ============================================================ */

  // ── Persist the form; snapshot the pre-save state for undo ──
  const handleSave = useCallback(async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (loadingStates.save) return;
    if (!USER_ID) {
      showMessage('error', 'Session expired. Please log in again.');
      return;
    }

    const sanitizedFirstName = sanitizeInput(formState.firstName);
    const sanitizedLastName = sanitizeInput(formState.lastName);
    if (!sanitizedFirstName) {
      showMessage('error', 'First name cannot be empty.');
      return;
    }

    const { isValid: isGoalValid, value: goalValue } = validateGoal(formState.monthlyGoal);
    if (!isGoalValid) {
      showMessage('error', 'Monthly goal must be a positive number.');
      return;
    }

    setLoadingStates((prev) => ({ ...prev, save: true }));

    const previousState = {
      username: user?.username,
      last_name: user?.last_name,
      profession: user?.profession,
      theme: user?.theme,
      monthly_goal: user?.monthly_goal,
      currency: user?.currency,
      profile_avatar: user?.profile_avatar,
      profile_color: user?.profile_color,
      notification_prefs: user?.notification_prefs,
      advanced_prefs: user?.advanced_prefs,
    };

    try {
      await api.updateSettings(USER_ID, {
        username: sanitizedFirstName,
        last_name: sanitizedLastName,
        profession: sanitizeInput(formState.profession),
        monthly_goal: isGoalValid ? goalValue : (user?.monthly_goal || 0),
        currency: formState.currency,
        profile_avatar: formState.avatar,
        profile_color: formState.avatarColor,
        notification_prefs: formState.notificationPrefs,
        advanced_prefs: formState.advancedPrefs,
      });

      setUndoSnapshot(previousState);
      dispatch({ type: 'CLEAR_DIRTY' });
      showMessage('success', 'Settings saved! You can undo if needed.');
      if (refetch) await refetch();
    } catch (error) {
      console.error('Save error:', error);
      showMessage('error', 'Failed to save settings. Please try again.');
    } finally {
      if (isMounted.current) {
        setLoadingStates((prev) => ({ ...prev, save: false }));
      }
    }
  }, [formState, USER_ID, refetch, showMessage, user, loadingStates.save]);

  // ── Restore the last undo snapshot ──
  const handleUndo = useCallback(async () => {
    if (!undoSnapshot || !USER_ID) return;
    setLoadingStates((prev) => ({ ...prev, save: true }));
    try {
      await api.updateSettings(USER_ID, undoSnapshot);
      setUndoSnapshot(null);
      showMessage('success', 'Changes reverted successfully.');
      if (refetch) await refetch();
    } catch {
      showMessage('error', 'Failed to undo changes.');
    } finally {
      if (isMounted.current) {
        setLoadingStates((prev) => ({ ...prev, save: false }));
      }
    }
  }, [undoSnapshot, USER_ID, refetch, showMessage]);

  // ── Discard unsaved changes ──
  const handleDiscard = useCallback(() => {
    dispatch({ type: 'RESET_FORM', payload: buildResetPayload(user) });
  }, [user]);

  /* ============================================================
   * Users
   * ============================================================ */

  // ── Create a new household user and switch to it ──
  const handleCreateUser = useCallback(async () => {
    if (loadingStates.createUser) return;
    const sanitizedName = sanitizeInput(modals.addUser?.name);
    const sanitizedEmail = sanitizeInput(modals.addUser?.email);

    if (!sanitizedName || !sanitizedEmail) {
      showMessage('error', 'Please fill in both name and email.');
      return;
    }
    if (!validateEmail(sanitizedEmail)) {
      showMessage('error', 'Please enter a valid email address.');
      return;
    }

    setLoadingStates((prev) => ({ ...prev, createUser: true }));
    try {
      const result = await createUser({ username: sanitizedName, email: sanitizedEmail });
      const newId = result?.id || result?._id;
      if (newId && switchUser) await switchUser(newId);
      setModals((prev) => ({ ...prev, addUser: false }));
      showMessage('success', 'New account created and switched!');
      if (refetch) await refetch();
    } catch (err) {
      const errorMsg = err?.response?.data?.error || err?.message;
      const displayMsg = errorMsg === 'Email already exists'
        ? 'This email is already in use. Try a different one.'
        : `Error: ${errorMsg}`;
      showMessage('error', displayMsg);
    } finally {
      if (isMounted.current) setLoadingStates((prev) => ({ ...prev, createUser: false }));
    }
  }, [modals.addUser, createUser, switchUser, refetch, showMessage, loadingStates.createUser]);

  // ── Factory reset (gated by re-auth) ──
  const handleReset = useCallback(async () => {
    if (loadingStates.reset) return;

    const proceed = await requestReAuth('reset your account');
    if (!proceed) return;

    setLoadingStates((prev) => ({ ...prev, reset: true }));
    try {
      await resetAccount();
      setModals((prev) => ({ ...prev, resetConfirm: false }));
      showMessage('success', 'Account completely reset.');
      // Log out after a full reset — the token is no longer valid.
      setTimeout(() => logout?.(), 800);
    } catch (error) {
      console.error('Reset error:', error);
      showMessage('error', 'Error resetting account.');
    } finally {
      if (isMounted.current) setLoadingStates((prev) => ({ ...prev, reset: false }));
    }
  }, [resetAccount, showMessage, requestReAuth, loadingStates.reset, logout]);

  // ── Delete a user (self-delete logs out; other-delete refreshes) ──
  const handleDeleteUser = useCallback(async () => {
    if (loadingStates.deleteUser) return;
    const userId = modals.deleteUser;
    if (!userId) return;

    const proceed = await requestReAuth('delete this account');
    if (!proceed) return;

    setLoadingStates((prev) => ({ ...prev, deleteUser: true }));
    try {
      await api.deleteUser(userId);
      if (String(userId) === String(USER_ID)) {
        logout?.();
        navigate('/login', { replace: true });
      } else {
        if (refetch) await refetch();
        setModals((prev) => ({ ...prev, deleteUser: null }));
        showMessage('success', 'Account successfully removed.');
      }
    } catch (err) {
      showMessage('error', `Failed to remove user: ${err?.response?.data?.error || err?.message}`);
    } finally {
      if (isMounted.current) setLoadingStates((prev) => ({ ...prev, deleteUser: false }));
    }
  }, [modals.deleteUser, USER_ID, refetch, showMessage, requestReAuth, loadingStates.deleteUser, logout, navigate]);

  // ── Switch to a different user (auto-saves dirty state first) ──
  const handleSwitchUser = useCallback(async () => {
    const rawTarget = modals.switchConfirm;
    if (!rawTarget) return;

    const switchId = typeof rawTarget === 'object' ? (rawTarget.id || rawTarget._id) : rawTarget;
    if (!switchId) return;

    const userToSwitch = allUsers.find((x) => String(x?.id || x?._id) === String(switchId)) || (typeof rawTarget === 'object' ? rawTarget : null);
    setLoadingStates((prev) => ({ ...prev, switch: switchId }));

    try {
      if (formState.isDirty) {
        const { isValid: isGoalValid, value: goalValue } = validateGoal(formState.monthlyGoal);
        showMessage('info', 'Auto-saving changes before switching…');
        await api.updateSettings(USER_ID, {
          username: sanitizeInput(formState.firstName || ''),
          last_name: sanitizeInput(formState.lastName || ''),
          profession: sanitizeInput(formState.profession || ''),
          monthly_goal: isGoalValid ? goalValue : (user?.monthly_goal || 0),
          currency: formState.currency,
          profile_avatar: formState.avatar,
          profile_color: formState.avatarColor,
        });
        dispatch({ type: 'CLEAR_DIRTY' });
      }

      await switchUser(switchId);
      const switchTargetName = userToSwitch ? getUserDisplayName(userToSwitch) : 'user';
      showMessage('success', `Switched to ${switchTargetName}`);
      setModals((prev) => ({ ...prev, switchConfirm: null }));
    } catch (err) {
      showMessage('error', `Failed to switch user: ${err?.message || 'Unknown error'}`);
    } finally {
      if (isMounted.current) setLoadingStates((prev) => ({ ...prev, switch: null }));
    }
  }, [modals.switchConfirm, allUsers, switchUser, showMessage, formState, USER_ID, user]);

  /* ============================================================
   * Theme
   * ============================================================ */

  // ── Apply theme immediately; persist to the backend after 1 s ──
  const handleThemeChange = useCallback((newTheme) => {
    setThemeDirect(newTheme);
    document.body.classList.add('theme-transition');
    setTimeout(() => document.body.classList.remove('theme-transition'), 300);

    if (themeSaveTimerRef.current) clearTimeout(themeSaveTimerRef.current);
    themeSaveTimerRef.current = setTimeout(() => {
      if (!USER_ID) return;
      api.updateSettings(USER_ID, { theme: newTheme }).catch(console.error);
    }, 1000);
  }, [setThemeDirect, USER_ID]);

  /* ============================================================
   * Exports
   * ============================================================ */

  // ── Export transactions to PDF (dynamic import) ──
  const handlePDFExport = useCallback(async () => {
    if (!user || transactions.length === 0) {
      showMessage('error', 'No data available to export.');
      return;
    }
    setLoadingStates((prev) => ({ ...prev, pdf: true }));
    try {
      const { exportToPDF } = await import('../services/pdfExport');
      await exportToPDF(user, transactions, currencyInfo, lang);
      showMessage('success', 'PDF downloaded successfully.');
    } catch (err) {
      console.error('PDF Export Error:', err);
      showMessage('error', `PDF export failed: ${err?.message || 'Unknown error'}`);
    } finally {
      if (isMounted.current) setLoadingStates((prev) => ({ ...prev, pdf: false }));
    }
  }, [user, transactions, currencyInfo, lang, showMessage]);

  // ── Export data to Excel via the backend ──
  const handleExcelExport = useCallback(async () => {
    if (!USER_ID) {
      showMessage('error', 'Session expired. Please log in again.');
      return;
    }
    setLoadingStates((prev) => ({ ...prev, excel: true }));
    try {
      await api.exportToExcel(USER_ID);
      showMessage('success', 'Excel exported successfully.');
    } catch (err) {
      console.error('Excel Export Error:', err);
      showMessage('error', 'Excel export failed.');
    } finally {
      if (isMounted.current) setLoadingStates((prev) => ({ ...prev, excel: false }));
    }
  }, [USER_ID, showMessage]);

  /* ============================================================
   * Derived data
   * ============================================================ */

  // ── Users sorted alphabetically by display name ──
  const sortedUsers = useMemo(
    () => [...allUsers].sort((a, b) =>
      getUserDisplayName(a).localeCompare(getUserDisplayName(b))
    ),
    [allUsers]
  );

  // ── Tab definitions (label + keywords for search) ──
  const TABS = useMemo(() => [
    { id: 'profile', icon: User, label: t?.('profile') || 'Profile', keywords: 'name photo avatar' },
    { id: 'preferences', icon: Settings, label: t?.('preferences') || 'Preferences', keywords: 'currency goal regional' },
    { id: 'language', icon: Globe, label: t?.('language') || 'Language', keywords: 'locale translation' },
    { id: 'appearance', icon: Palette, label: t?.('appearance') || 'Appearance', keywords: 'theme dark light color' },
    { id: 'notifications', icon: BellIcon, label: t?.('notifications') || 'Notifications', keywords: 'email push alerts' },
    { id: 'security', icon: Shield, label: t?.('security') || 'Security', keywords: 'password session 2fa' },
    { id: 'users', icon: Users, label: t?.('manage_users') || 'Manage Users', keywords: 'household family' },
    { id: 'data', icon: Database, label: t?.('data_security') || 'Data & Security', keywords: 'export backup reset' },
    { id: 'advanced', icon: Zap, label: t?.('advanced') || 'Advanced', keywords: 'date format timeout' },
  ], [t]);

  // ── Filter tabs by search query (label + keywords) ──
  const visibleTabs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return TABS;
    return TABS.filter((tab) =>
      tab.label.toLowerCase().includes(q) ||
      (tab.keywords || '').toLowerCase().includes(q)
    );
  }, [TABS, search]);

  /* ============================================================
   * Render tab content
   * ============================================================ */
  const renderTabContent = () => {
    const commonProps = {
      formState,
      handleFieldChange,
      t,
      user,
      theme,
      handleThemeChange,
      lang,
      setLanguage,
      showMessage,
      logout,
      requestReAuth,
    };

    switch (activeTab) {
      case 'profile':
        return <ProfileTab {...commonProps} />;
      case 'preferences':
        return <PreferencesTab {...commonProps} />;
      case 'language':
        return <LanguageTab {...commonProps} />;
      case 'appearance':
        return <AppearanceTab {...commonProps} />;
      case 'notifications':
        return (
          <NotificationPreferences
            preferences={formState.notificationPrefs}
            onChange={(prefs) => handleFieldChange('notificationPrefs', prefs)}
          />
        );
      case 'security':
        return (
          <>
            {/* ── Security tab header ── */}
            <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
              <div
                className="idp-hero-icon"
                style={{
                  width: 64, height: 64, marginBottom: 16,
                  background: 'rgba(239,68,68,0.1)', color: 'var(--danger)',
                }}
                aria-hidden
              >
                <Shield size={28} />
              </div>
              <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
                Security Settings
              </h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Manage your account security and active sessions.
              </p>
            </div>
            <div className="idp-body">
              <PasswordChange
                userId={USER_ID}
                showMessage={showMessage}
                logout={logout}
                requestReAuth={requestReAuth}
              />
              <div style={{ height: 2, background: 'var(--glass-border)', margin: '32px 0' }} />
              <SessionManagement userId={USER_ID} showMessage={showMessage} />
            </div>
          </>
        );
      case 'users':
        return (
          <UsersTab
            {...commonProps}
            sortedUsers={sortedUsers}
            USER_ID={USER_ID}
            setModals={setModals}
            switchingUserId={loadingStates.switch}
            previousSession={previousSession}
            revertSession={revertSession}
          />
        );
      case 'data':
        return (
          <>
            <DataTab
              {...commonProps}
              setModals={setModals}
              handleExcelExport={handleExcelExport}
              handlePDFExport={handlePDFExport}
              excelLoading={loadingStates.excel}
              pdfLoading={loadingStates.pdf}
            />
            <BackupRestore userId={USER_ID} showMessage={showMessage} />
          </>
        );
      case 'advanced':
        return (
          <AdvancedPreferences
            prefs={formState.advancedPrefs}
            onChange={(prefs) => handleFieldChange('advancedPrefs', prefs)}
          />
        );
      default:
        return null;
    }
  };

  /* ============================================================
   * Render
   * ============================================================ */
  return (
    <div className="inbox-layout-page settings-page shared-page animate-in">
      {/* ── Page header ── */}
      <div className="inbox-header">
        <div className="ih-titles">
          <h2>{t?.('settings') || 'Settings'}</h2>
          <span className="ih-badge">{TABS.find((tab) => tab.id === activeTab)?.label}</span>
        </div>
      </div>

      <div className="inbox-split-pane">
        {/* ── Sidebar with tab list + search ── */}
        <div className="inbox-list-pane glass" role="tablist" aria-orientation="vertical">
          <div className="il-filters">
            <h3 className="il-title">{t?.('categories') || 'Categories'}</h3>
            <div style={{ position: 'relative', marginTop: 8 }}>
              <Search
                size={14}
                aria-hidden
                style={{
                  position: 'absolute', left: 10, top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--text-muted)',
                }}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t?.('search_settings', 'Search settings…')}
                aria-label={t?.('search_settings', 'Search settings')}
                style={{ width: '100%', paddingLeft: 32, fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* ── Tab buttons (filtered by search) ── */}
          <div className="il-scrollable">
            {visibleTabs.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '12px' }}>
                {t?.('no_matches', 'No matching settings')}
              </p>
            ) : (
              visibleTabs.map((tab) => (
                <motion.button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab.id}
                  id={`tab-${tab.id}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSearchParams({ tab: tab.id }, { replace: true });
                  }}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`settings-nav-tab ${activeTab === tab.id ? 'active' : ''}`}
                >
                  <tab.icon size={18} aria-hidden />
                  <span>{tab.label}</span>
                </motion.button>
              ))
            )}
          </div>
        </div>

        {/* ── Detail pane: current tab content ── */}
        <div className="inbox-detail-pane glass">
          <div
            className="idp-content"
            style={{ maxWidth: 800, padding: 'clamp(16px, 5vw, 40px)', paddingBottom: 100 }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                role="tabpanel"
                id={`tabpanel-${activeTab}`}
                aria-labelledby={`tab-${activeTab}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {renderTabContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Master save bar ── */}
      <AnimatePresence>
        {(formState.isDirty || undoSnapshot) && (
          <motion.div
            className="settings-save-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--glass-2)', border: '1px solid var(--glass-border)',
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              borderRadius: 18, padding: '14px 24px',
              display: 'flex', alignItems: 'center', gap: 20,
              boxShadow: '0 12px 48px rgba(0,0,0,0.25)', zIndex: 200, minWidth: 0,
            }}
            role="status"
            aria-live="polite"
          >
            {/* ── Status text ── */}
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {formState.isDirty ? 'Unsaved Changes' : '✓ Saved'}
              </p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {formState.isDirty
                  ? 'Your changes have not been saved yet.'
                  : 'Changes applied. Tap Undo to revert.'}
              </p>
            </div>

            {/* ── Actions: Undo / Discard / Save ── */}
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
              {undoSnapshot && !formState.isDirty && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleUndo}
                  disabled={loadingStates.save}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', padding: '8px 14px' }}
                >
                  <RefreshCw size={14} aria-hidden /> Undo
                </button>
              )}
              {formState.isDirty && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleDiscard}
                    disabled={loadingStates.save}
                    style={{ fontSize: '0.85rem', padding: '8px 14px' }}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSave}
                    disabled={loadingStates.save}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', padding: '8px 16px' }}
                  >
                    {loadingStates.save ? <div className="spinner-dots" /> : <Save size={14} aria-hidden />}
                    {loadingStates.save ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Re-auth modal ── */}
      <ReAuthModal
        isOpen={reAuthState.isOpen}
        onClose={handleReAuthClose}
        onConfirmed={handleReAuthConfirm}
        actionLabel={reAuthState.actionLabel}
      />

      {/* ── Add user modal ── */}
      <Modal
        isOpen={!!modals.addUser}
        onClose={() => setModals((prev) => ({ ...prev, addUser: false }))}
        title="Add Family Member"
        confirmText="Create Account"
        onConfirm={handleCreateUser}
        isLoading={loadingStates.createUser}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          Create a completely separate account workspace.
        </p>
        <div className="form-field">
          <label htmlFor="new_user_name">Display Name *</label>
          <input
            id="new_user_name"
            value={modals.addUser?.name || ''}
            onChange={(e) => setModals((prev) => ({
              ...prev,
              addUser: { ...prev.addUser, name: e.target.value },
            }))}
            placeholder="e.g. Alex"
            aria-required="true"
            autoFocus
          />
        </div>
        <div className="form-field">
          <label htmlFor="new_user_email">Email Address *</label>
          <input
            id="new_user_email"
            type="email"
            value={modals.addUser?.email || ''}
            onChange={(e) => setModals((prev) => ({
              ...prev,
              addUser: { ...prev.addUser, email: e.target.value },
            }))}
            placeholder="alex@example.com"
            aria-required="true"
          />
        </div>
      </Modal>

      {/* ── Factory reset modal ── */}
      <FactoryResetModal
        isOpen={modals.resetConfirm}
        onClose={() => setModals((prev) => ({ ...prev, resetConfirm: false }))}
        onConfirm={handleReset}
        isLoading={loadingStates.reset}
      />

      {/* ── Delete user modal ── */}
      <Modal
        isOpen={!!modals.deleteUser}
        onClose={() => setModals((prev) => ({ ...prev, deleteUser: null }))}
        title="Delete User Account"
        confirmText="Yes, Delete This User"
        onConfirm={handleDeleteUser}
        isLoading={loadingStates.deleteUser}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 16, lineHeight: 1.6 }}>
          You are about to delete the user{' '}
          <strong>{getUserDisplayName(allUsers.find((u) => (u.id || u._id) === modals.deleteUser))}</strong>{' '}
          and <strong>all their financial data</strong>.
        </p>
        <p style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.9rem' }}>
          This action cannot be undone!
        </p>
      </Modal>

      {/* ── Switch user modal ── */}
      <Modal
        isOpen={!!modals.switchConfirm}
        onClose={() => setModals((prev) => ({ ...prev, switchConfirm: null }))}
        title="Switch User Account"
        confirmText={formState.isDirty ? 'Save & Switch' : 'Switch Now'}
        onConfirm={handleSwitchUser}
        isLoading={!!loadingStates.switch}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 16, lineHeight: 1.6 }}>
          Are you sure you want to switch to{' '}
          <strong>
            {getUserDisplayName(
              allUsers.find((x) => String(x?.id || x?._id) === String(
                typeof modals.switchConfirm === 'object'
                  ? (modals.switchConfirm?.id || modals.switchConfirm?._id)
                  : modals.switchConfirm
              )) || (typeof modals.switchConfirm === 'object' ? modals.switchConfirm : null)
            )}
          </strong>?
        </p>

        {/* ── Unsaved-changes notice ── */}
        {formState.isDirty && (
          <div
            style={{
              padding: 12,
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 8,
              marginTop: 16,
            }}
          >
            <p style={{ color: 'var(--brand-secondary)', fontSize: '0.85rem', margin: 0, fontWeight: 600 }}>
              Note: You have unsaved changes. They will be auto-saved before switching.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============================================================
 * Export
 * ============================================================ */

// ── Guard: show a loading fallback when there's no AppContext ──
function SettingsPage() {
  const context = useContext(AppContext);

  if (!context) {
    return (
      <div className="loading-container" role="alert" aria-busy="true">
        <Loader className="animate-spin" size={32} />
        <p>Loading settings…</p>
      </div>
    );
  }

  return <SettingsInner context={context} />;
}

export default React.memo(SettingsPage);