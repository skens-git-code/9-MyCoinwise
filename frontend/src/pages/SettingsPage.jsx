// SettingsPage.jsx - COMPLETE VERSION
import React, { useState, useContext, useEffect, useRef, useCallback, useMemo, useReducer, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save, User, Users, Target, Moon, Sun, Download, CheckCircle, AlertCircle,
  Palette, Database, Plus, Settings, ShieldAlert, Globe, Bell, Zap, Smartphone,
  FileText, Trash2, X, Loader, Key, Shield, Bell as BellIcon, Eye,
  Link, Calendar, Clock, Users as UsersIcon, Activity, Cloud, Upload,
  Mail, Lock, Smartphone as Phone, Fingerprint, History, TrendingUp,
  LogOut, RefreshCw, Copy, Check, AlertTriangle, EyeOff
} from 'lucide-react';
import { AppContext } from '../App';
import { CURRENCIES, AVATARS, AVATAR_COLORS, api } from '../services/api';
import { LANGUAGES } from '../services/i18n';
import { exportToPDF } from '../services/pdfExport';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
// ============= HELPER FUNCTIONS =============
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email?.trim() || '');
const validateGoal = (goal) => {
  if (!goal) return { isValid: true, value: null };
  const num = Number(goal);
  return { isValid: !isNaN(num) && num >= 0, value: num };
};
const sanitizeInput = (input) => input?.trim().replace(/[<>]/g, '') || '';

// ============= PASSWORD STRENGTH INDICATOR =============
const PasswordStrengthIndicator = ({ password }) => {
  const getStrength = () => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) score++;
    if (password.match(/[0-9]/)) score++;
    if (password.match(/[^a-zA-Z0-9]/)) score++;
    return score;
  };

  const strength = getStrength();
  const strengthText = ['Very Weak', 'Weak', 'Medium', 'Strong', 'Very Strong'][strength];
  const strengthColor = ['#ef4444', '#f59e0b', '#eab308', '#10b981', '#059669'][strength];

  if (!password) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              background: i < strength ? strengthColor : '#e5e7eb',
              borderRadius: 2,
              transition: 'all 0.3s'
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '0.75rem', color: strengthColor }}>{strengthText}</span>
    </div>
  );
};

// ============= BACKUP & RESTORE COMPONENT =============
const BackupRestore = ({ userId, showMessage }) => {
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [autoBackup, setAutoBackup] = useState(false);
  const fileInputRef = useRef();
  // ✅ Fix: Use ref instead of window global — scoped to this instance
  const autoBackupIntervalRef = useRef(null);

  useEffect(() => {
    const savedAutoBackup = localStorage.getItem('auto-backup-enabled');
    if (savedAutoBackup) setAutoBackup(JSON.parse(savedAutoBackup));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoBackupIntervalRef.current) {
        clearInterval(autoBackupIntervalRef.current);
        autoBackupIntervalRef.current = null;
      }
    };
  }, []);

  const handleExportBackup = async () => {
    setBackupLoading(true);
    try {
      const data = await api.exportAllData(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mycoinwise-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage('success', 'Backup exported successfully!');
    } catch (error) {
      console.error('Backup error:', error);
      showMessage('error', 'Failed to export backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const [confirmRestoreFile, setConfirmRestoreFile] = useState(null);

  const handleImportBackup = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setConfirmRestoreFile(file);
  };

  const executeRestore = async () => {
    if (!confirmRestoreFile) return;
    setRestoreLoading(true);
    setConfirmRestoreFile(null);
    try {
      const text = await confirmRestoreFile.text();
      const data = JSON.parse(text);
      await api.importAllData(userId, data);
      showMessage('success', 'Backup restored successfully! Page will reload in 3 seconds.');
      setTimeout(() => window.location.reload(), 3000);
    } catch (error) {
      console.error('Restore error:', error);
      showMessage('error', 'Failed to restore backup: Invalid file format or corrupted data');
    } finally {
      setRestoreLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleAutoBackup = async () => {
    const newState = !autoBackup;
    setAutoBackup(newState);
    localStorage.setItem('auto-backup-enabled', JSON.stringify(newState));

    if (newState) {
      const scheduleBackup = () => {
        const lastBackup = localStorage.getItem('last-auto-backup');
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (!lastBackup || Date.now() - new Date(lastBackup).getTime() > oneWeek) {
          handleExportBackup();
          localStorage.setItem('last-auto-backup', new Date().toISOString());
        }
      };
      scheduleBackup();
      // ✅ Fix: clear any existing interval before creating a new one
      if (autoBackupIntervalRef.current) clearInterval(autoBackupIntervalRef.current);
      autoBackupIntervalRef.current = setInterval(scheduleBackup, 7 * 24 * 60 * 60 * 1000);
    } else {
      if (autoBackupIntervalRef.current) {
        clearInterval(autoBackupIntervalRef.current);
        autoBackupIntervalRef.current = null;
      }
    }
  };

  return (
    <div className="idp-section" style={{ padding: 20, borderRadius: 16, background: 'var(--glass-2)', marginBottom: 20 }}>
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Cloud size={20} /> Backup & Restore
      </h4>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleExportBackup}
          disabled={backupLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Download size={16} />
          {backupLoading ? 'Exporting...' : 'Export Backup'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={restoreLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Upload size={16} />
          {restoreLoading ? 'Restoring...' : 'Restore Backup'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportBackup}
          style={{ display: 'none' }}
        />
      </div>
      <div className="form-field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoBackup}
            onChange={toggleAutoBackup}
          />
          <RefreshCw size={14} /> Enable Automatic Weekly Backups
        </label>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12 }}>
        📦 Backup includes all transactions, goals, subscriptions, settings, and user preferences.
      </p>

      <Modal
        isOpen={!!confirmRestoreFile}
        onClose={() => {
          setConfirmRestoreFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        title="Confirm Backup Restoration"
        confirmText="Yes, Replace All Data"
        onConfirm={executeRestore}
        isLoading={restoreLoading}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 16, lineHeight: 1.6 }}>
          ⚠️ WARNING: Importing this backup will replace <strong>ALL</strong> current data including transactions, goals, and subscriptions.
        </p>
        <p style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>
          This action CANNOT be undone!
        </p>
      </Modal>
    </div>
  );
};

// ============= NOTIFICATION PREFERENCES =============
const NotificationPreferences = ({ preferences, onChange }) => {

  return (
    <>
      <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
        <div className="idp-hero-icon" style={{ width: 64, height: 64, marginBottom: 16, background: 'rgba(251,191,36,0.1)', color: 'var(--warning)' }}>
          <BellIcon size={28} />
        </div>
        <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Notification Preferences</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Control how and when we notify you.</p>
      </div>

      <div className="idp-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences?.emailReports}
                onChange={(e) => onChange({ ...preferences, emailReports: e.target.checked })}
              />
              <Mail size={16} /> Monthly Email Reports
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences?.weeklyDigest}
                onChange={(e) => onChange({ ...preferences, weeklyDigest: e.target.checked })}
              />
              <Calendar size={16} /> Weekly Digest
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences?.budgetAlerts}
                onChange={(e) => onChange({ ...preferences, budgetAlerts: e.target.checked })}
              />
              <BellIcon size={16} /> Budget Alerts
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences?.goalMilestones}
                onChange={(e) => onChange({ ...preferences, goalMilestones: e.target.checked })}
              />
              <Target size={16} /> Goal Milestone Achievements
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences?.unusualSpending}
                onChange={(e) => onChange({ ...preferences, unusualSpending: e.target.checked })}
              />
              <AlertTriangle size={16} /> Unusual Spending Alerts
            </label>
          </div>

          <div style={{ height: 1, background: 'var(--glass-border)', margin: '8px 0' }} />

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences?.quietHoursEnabled}
                onChange={(e) => onChange({ ...preferences, quietHoursEnabled: e.target.checked })}
              />
              <Moon size={16} /> Enable Quiet Hours
            </label>
          </div>

          {preferences?.quietHoursEnabled && (
            <div style={{ display: 'flex', gap: 12, marginLeft: 24 }}>
              <div className="form-field" style={{ flex: 1 }}>
                <label>Start Time</label>
                <input
                  type="time"
                  value={preferences.quietHoursStart}
                  onChange={(e) => onChange({ ...preferences, quietHoursStart: e.target.value })}
                />
              </div>
              <div className="form-field" style={{ flex: 1 }}>
                <label>End Time</label>
                <input
                  type="time"
                  value={preferences.quietHoursEnd}
                  onChange={(e) => onChange({ ...preferences, quietHoursEnd: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ============= PASSWORD CHANGE COMPONENT =============
const PasswordChange = ({ userId, showMessage }) => {
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showMessage('error', 'New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      showMessage('error', 'Password must be at least 8 characters');
      return;
    }

    if (passwordData.newPassword === passwordData.currentPassword) {
      showMessage('error', 'New password must be different from current password');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(userId, {
        current: passwordData.currentPassword,
        new: passwordData.newPassword
      });
      showMessage('success', 'Password changed successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      showMessage('error', error.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field">
        <label>Current Password</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={passwordData.currentPassword}
            onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="form-field">
        <label>New Password</label>
        <input
          type={showPassword ? 'text' : 'password'}
          value={passwordData.newPassword}
          onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
          required
        />
        <PasswordStrengthIndicator password={passwordData.newPassword} />
      </div>

      <div className="form-field">
        <label>Confirm New Password</label>
        <input
          type={showPassword ? 'text' : 'password'}
          value={passwordData.confirmPassword}
          onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
          required
        />
        {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
          <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 4, display: 'block' }}>
            Passwords do not match
          </span>
        )}
      </div>

      <div className="idp-actions">
        <button type="submit" className="btn-primary" disabled={loading}>
          <Key size={18} /> {loading ? 'Changing...' : 'Change Password'}
        </button>
      </div>
    </form>
  );
};

// ============= SESSION MANAGEMENT =============
const SessionManagement = ({ userId, showMessage }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    let isMounted = true;

    try {
      const data = await api.getActiveSessions(userId);

      if (isMounted) {
        setSessions(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      showMessage?.('error', 'Failed to load sessions');
    } finally {
      if (isMounted) setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [userId, showMessage]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const revokeSession = async (sessionId) => {
    if (!userId || !sessionId) {
      showMessage('error', 'Invalid session');
      return;
    }

    if (loading) return; // prevent spam clicks

    setLoading(true);

    try {
      const response = await api.revokeSession(userId, sessionId);

      if (response?.success !== false) {
        showMessage('success', 'Session revoked successfully');
        await loadSessions(); // ensure UI updates after success
      } else {
        throw new Error('Failed to revoke session');
      }
    } catch (error) {
      console.error('Revoke session error:', error);
      showMessage('error', error?.message || 'Failed to revoke session');
    } finally {
      setLoading(false);
    }
  };
  const requestRevokeAll = () => {
    if (!userId) {
      showMessage('error', 'User not identified');
      return;
    }
    setConfirmRevokeAll(true);
  };

  const executeRevokeAllOtherSessions = async () => {
    setConfirmRevokeAll(false);
    if (!userId || loading) return;

    setLoading(true);

    try {
      const response = await api.revokeAllOtherSessions(userId);

      if (response?.success !== false) {
        showMessage('success', 'All other sessions have been revoked');
        await loadSessions(); // ensure fresh data
      } else {
        throw new Error('Failed to revoke sessions');
      }
    } catch (error) {
      console.error('Revoke all sessions error:', error);
      showMessage('error', error?.message || 'Failed to revoke sessions');
    } finally {
      setLoading(false);
    }
  };

  if (loading && sessions.length === 0) return <div style={{ padding: 20, textAlign: 'center' }}>Loading sessions...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h4 style={{ margin: 0 }}>Active Sessions</h4>
        <button
          type="button"
          className="btn-secondary"
          onClick={requestRevokeAll}
          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
        >
          <LogOut size={14} /> Revoke All Other Sessions
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sessions.map(session => (
          <div
            key={session.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 12,
              background: 'var(--glass-2)',
              borderRadius: 12,
              flexWrap: 'wrap',
              gap: 12
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Smartphone size={16} />
                <strong>{session.device || 'Unknown Device'}</strong>
                {session.isCurrent && (
                  <span style={{ fontSize: '0.7rem', background: '#10b981', color: 'white', padding: '2px 8px', borderRadius: 12 }}>
                    Current
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Location: {session.location || 'Unknown'} • Last active: {new Date(session.lastActive).toLocaleString()}
              </div>
            </div>
            {!session.isCurrent && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => revokeSession(session.id)}
                style={{ padding: '6px 12px' }}
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

      <Modal
        isOpen={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        title="Revoke All Other Sessions"
        confirmText="Yes, Log Out Everywhere Else"
        onConfirm={executeRevokeAllOtherSessions}
        isLoading={loading}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 16, lineHeight: 1.6 }}>
          This action will log you out of all other devices you are currently logged into.
          Are you sure you want to continue?
        </p>
      </Modal>
    </div>
  );
};

const AdvancedPreferences = ({ prefs, onChange }) => {
  return (
    <>
      <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
        <div className="idp-hero-icon" style={{ width: 64, height: 64, marginBottom: 16 }}>
          <Zap size={28} />
        </div>
        <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Advanced Preferences</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Fine-tune your experience.</p>
      </div>

      <div className="idp-body">
        <div className="form-field">
          <label>Date Format</label>
          <select
            value={prefs?.dateFormat || 'MM/DD/YYYY'}
            onChange={(e) => onChange({ ...prefs, dateFormat: e.target.value })}
          >
            <option>MM/DD/YYYY</option>
            <option>DD/MM/YYYY</option>
            <option>YYYY-MM-DD</option>
          </select>
        </div>

        <div className="form-field">
          <label>Time Format</label>
          <select
            value={prefs?.timeFormat || '12h'}
            onChange={(e) => onChange({ ...prefs, timeFormat: e.target.value })}
          >
            <option value="12h">12h (AM/PM)</option>
            <option value="24h">24h</option>
          </select>
        </div>

        <div className="form-field">
          <label>First Day of Week</label>
          <select
            value={prefs?.firstDayOfWeek || 'Sunday'}
            onChange={(e) => onChange({ ...prefs, firstDayOfWeek: e.target.value })}
          >
            <option>Sunday</option>
            <option>Monday</option>
          </select>
        </div>

        <div className="form-field">
          <label>Decimal Separator</label>
          <select
            value={prefs?.decimalSeparator || '.'}
            onChange={(e) => onChange({ ...prefs, decimalSeparator: e.target.value })}
          >
            <option value=".">Period (.) - 1,000.00</option>
            <option value=",">Comma (,) - 1.000,00</option>
          </select>
        </div>

        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs?.compactMode || false}
              onChange={(e) => onChange({ ...prefs, compactMode: e.target.checked })}
            />
            <Zap size={16} /> Compact Mode (Denser Layout)
          </label>
        </div>

        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs?.autoSave !== false}
              onChange={(e) => onChange({ ...prefs, autoSave: e.target.checked })}
            />
            <Save size={16} /> Auto-save Changes
          </label>
        </div>

        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs?.animationsEnabled !== false}
              onChange={(e) => onChange({ ...prefs, animationsEnabled: e.target.checked })}
            />
            <Activity size={16} /> Enable Animations
          </label>
        </div>

        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs?.showWeekNumbers || false}
              onChange={(e) => onChange({ ...prefs, showWeekNumbers: e.target.checked })}
            />
            <Calendar size={16} /> Show Week Numbers in Calendar
          </label>
        </div>
      </div>
    </>
  );
};

// ============= EMAIL CHANGE SECTION =============
const EmailChangeSection = ({ user, showMessage }) => {
  const [showModal, setShowModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPassword: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!emailForm.newEmail || !emailForm.currentPassword) {
      showMessage('error', 'All fields are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.newEmail)) {
      showMessage('error', 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.changeEmail({
        currentPassword: emailForm.currentPassword,
        newEmail: emailForm.newEmail
      });
      showMessage('success', res.message || 'Email updated! Please log in again.');
      setShowModal(false);
      setEmailForm({ newEmail: '', currentPassword: '' });
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      showMessage('error', err.response?.data?.message || 'Failed to update email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="form-field" style={{ marginTop: 24 }}>
        <label>Email Address</label>
        {/* Added flexWrap to prevent squishing on mobile */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={user?.email || ''}
            readOnly
            style={{ flex: 1, minWidth: 'min(200px, 100%)', opacity: 0.7, background: 'var(--surface-1)' }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowModal(true)}
            style={{ whiteSpace: 'nowrap' }}
          >
            Change Email
          </button>
        </div>
      </div>

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
            onChange={(e) => setEmailForm(prev => ({ ...prev, newEmail: e.target.value }))}
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
            onChange={(e) => setEmailForm(prev => ({ ...prev, currentPassword: e.target.value }))}
            placeholder="Your current password"
          />
        </div>
      </Modal>
    </>
  );
};

// ============= PROFILE TAB =============
const ProfileTab = ({ formState, handleFieldChange, t, user, theme, showMessage }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        showMessage('error', 'Image must be less than 20MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        handleFieldChange('avatar', reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const isBase64Avatar = formState.avatar && formState.avatar.length > 20 && formState.avatar.startsWith('data:image');

  return (
    <>
      <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
        <div className="idp-hero-icon income" style={{ width: 64, height: 64, marginBottom: 16 }}>
          <User size={28} />
        </div>
        <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
          {t?.('profile') || 'Profile'}
        </h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Configure your personal identity within MyCoinwise.
        </p>
      </div>

      <div className="idp-body">
        <div style={{ display: 'flex', gap: 30, alignItems: 'center', flexWrap: 'wrap' }}>
          <motion.div
            whileHover={{ scale: 1.05 }}
            style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: formState.avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3rem',
              boxShadow: `0 0 30px ${formState.avatarColor}55`,
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {isBase64Avatar ? (
              <img src={formState.avatar} alt="Profile Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              formState.avatar
            )}
          </motion.div>
          <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
                Profile Picture & Emoji
              </label>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  style={{ flex: 1, minWidth: 140, justifyContent: 'center' }}
                >
                  😀 Pick Emoji
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ flex: 1, minWidth: 140, justifyContent: 'center' }}
                >
                  <Upload size={16} /> Upload Image
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleImageUpload}
                />
              </div>

              {showEmojiPicker && (
                <div style={{ position: 'absolute', zIndex: 100, marginTop: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', borderRadius: 8 }}>
                  <EmojiPicker
                    theme={theme === 'light' ? EmojiTheme.LIGHT : EmojiTheme.DARK}
                    onEmojiClick={(emojiData) => {
                      handleFieldChange('avatar', emojiData.emoji);
                      setShowEmojiPicker(false);
                    }}
                  />
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
                Profile Color
              </label>
              <div style={{ display: 'flex', gap: 12 }} role="group" aria-label="Choose your profile color">
                {AVATAR_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleFieldChange('avatarColor', color)}
                    aria-label={`Select color ${color}`}
                    aria-pressed={formState.avatarColor === color}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: color,
                      border: formState.avatarColor === color ? '3px solid white' : '2px solid transparent',
                      cursor: 'pointer',
                      outline: formState.avatarColor === color ? `3px solid ${color}` : 'none',
                      boxShadow: formState.avatarColor === color ? `0 0 16px ${color}` : 'none',
                      transition: 'all 0.2s'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--glass-border)', margin: '10px 0' }} />

        <div className="form-field">
          <label htmlFor="display_name">{t?.('display_name') || 'Display Name'}</label>
          <input
            id="display_name"
            value={formState.username}
            onChange={(e) => handleFieldChange('username', e.target.value)}
            placeholder="Your name"
            autoCapitalize="words"
          />
        </div>
        <EmailChangeSection user={user} showMessage={showMessage} />
      </div>
    </>
  );
};

// ============= PREFERENCES TAB =============
const PreferencesTab = ({ formState, handleFieldChange, t }) => (
  <>
    <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
      <div className="idp-hero-icon" style={{ width: 64, height: 64, marginBottom: 16, background: 'rgba(56,189,248,0.1)', color: 'var(--brand-secondary)', border: '1px solid rgba(56,189,248,0.3)' }}>
        <Settings size={28} />
      </div>
      <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Preferences</h3>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Set your regional currency and savings goals.</p>
    </div>

    <div className="idp-body">
      <div className="form-field">
        <label htmlFor="currency_select">{t?.('currency') || 'Currency'}</label>
        <select
          id="currency_select"
          value={formState.currency}
          onChange={(e) => handleFieldChange('currency', e.target.value)}
          aria-label="Select your currency"
        >
          {Object.entries(CURRENCIES).map(([code, info]) => (
            <option key={code} value={code}>
              {info.flag} {code} – {info.name} ({info.symbol})
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="monthly_goal_input">
          <Target size={14} aria-hidden />
          {t?.('monthly_goal') || 'Monthly Goal'}
        </label>
        <input
          id="monthly_goal_input"
          type="number"
          value={formState.monthlyGoal}
          onChange={(e) => handleFieldChange('monthlyGoal', e.target.value)}
          placeholder="e.g. 5000"
          min="0"
          step="1"
          aria-label="Set your monthly savings goal"
        />
      </div>
    </div>
  </>
);

// ============= LANGUAGE TAB =============
const LanguageTab = ({ lang, setLanguage, showMessage }) => (
  <>
    <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
      <div className="idp-hero-icon" style={{ width: 64, height: 64, marginBottom: 16, background: 'rgba(251,191,36,0.1)', color: 'var(--warning)', border: '1px solid rgba(251,191,36,0.3)' }}>
        <Globe size={28} />
      </div>
      <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Language</h3>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>MyCoinwise speaks your language.</p>
    </div>

    <div className="idp-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Object.entries(LANGUAGES).map(([code, info]) => (
        <motion.button
          key={code}
          type="button"
          onClick={() => {
            setLanguage(code);
            showMessage('success', 'Language updated successfully');
          }}
          whileHover={{ x: 4, scale: 1.01 }}
          aria-label={`Switch language to ${info.name}`}
          aria-pressed={lang === code}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '16px 20px',
            borderRadius: 16,
            border: lang === code ? '2px solid var(--brand-primary)' : '1px solid var(--glass-border)',
            background: lang === code ? 'rgba(var(--brand-primary-rgb), 0.08)' : 'var(--surface-1)',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontWeight: lang === code ? 800 : 600,
            transition: 'all 0.2s',
            boxShadow: lang === code ? '0 8px 24px rgba(var(--brand-primary-rgb), 0.15)' : 'none'
          }}
        >
          <span style={{ fontSize: '1.6rem' }} aria-hidden>{info.flag}</span>
          <span style={{ flex: 1, textAlign: 'left', fontSize: '1.1rem' }}>{info.name}</span>
          {lang === code && <CheckCircle size={20} color="var(--brand-primary)" aria-hidden />}
        </motion.button>
      ))}
    </div>
  </>
);

// ============= APPEARANCE TAB =============
const AppearanceTab = ({ theme, handleThemeChange }) => {
  const themes = [
    { id: 'dark', label: 'Dark', icon: '🌙', bg: '#06060f', accent: '#10b981', sub: 'Deep Purple' },
    { id: 'light', label: 'Light', icon: '☀️', bg: '#e8ecff', accent: '#059669', sub: 'Frosted Glass' },
    { id: 'amoled', label: 'AMOLED', icon: '⚡', bg: '#000000', accent: '#34d399', sub: 'True Black' },
  ];

  return (
    <>
      <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
        <div className="idp-hero-icon" style={{ width: 64, height: 64, marginBottom: 16, background: 'rgba(236,72,153,0.1)', color: '#ec4899', border: '1px solid rgba(236,72,153,0.3)' }}>
          <Palette size={28} />
        </div>
        <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Appearance</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Choose a theme that fits your vibe.</p>
      </div>

      <div className="idp-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, padding: '30px 20px' }}>
        {themes.map(opt => (
          <motion.button
            key={opt.id}
            type="button"
            whileHover={{ scale: 1.05, y: -4 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleThemeChange(opt.id)}
            aria-label={`Switch to ${opt.label} theme`}
            aria-pressed={theme === opt.id}
            style={{
              padding: '24px 16px',
              borderRadius: 20,
              border: theme === opt.id ? `2px solid ${opt.accent}` : '1px solid var(--glass-border)',
              background: opt.bg,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              transition: 'all 0.25s',
              boxShadow: theme === opt.id ? `0 12px 32px ${opt.accent}44, inset 0 0 20px ${opt.accent}22` : 'var(--shadow-sm)',
              position: 'relative'
            }}
          >
            <span style={{ fontSize: '2.4rem', filter: theme === opt.id ? `drop-shadow(0 0 16px ${opt.accent})` : 'none' }} aria-hidden>
              {opt.icon}
            </span>
            <span style={{ color: opt.accent, fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-head)' }}>
              {opt.label}
            </span>
            <span style={{ color: opt.accent, opacity: 0.7, fontSize: '0.8rem', fontWeight: 600 }}>
              {opt.sub}
            </span>
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

// ============= USERS TAB =============
const UsersTab = ({ sortedUsers, USER_ID, setModals, switchingUserId, t }) => (
  <>
    <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
      <div className="idp-hero-icon" style={{ width: 64, height: 64, marginBottom: 16, background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }}>
        <Users size={28} />
      </div>
      <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Manage Users</h3>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Easily switch between household accounts.</p>
    </div>

    <div className="idp-body" style={{ padding: 0, background: 'none', border: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {sortedUsers.map(u => (
          <motion.div
            key={u.id}
            whileHover={{ x: 4 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '16px 20px',
              borderRadius: 16,
              background: u.id === USER_ID ? 'linear-gradient(135deg, rgba(var(--brand-primary-rgb),0.15), rgba(var(--brand-secondary-rgb),0.05))' : 'var(--glass-2)',
              border: `1px solid ${u.id === USER_ID ? 'rgba(var(--brand-primary-rgb),0.4)' : 'var(--glass-border)'}`,
              boxShadow: u.id === USER_ID ? '0 8px 24px rgba(var(--brand-primary-rgb),0.1)' : 'none',
              flexWrap: 'wrap'
            }}
          >
            <span style={{
              fontSize: '1.4rem',
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: u.profile_color || '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 12px ${u.profile_color}66`
            }} aria-hidden>
              {u.profile_avatar || '😊'}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 800, fontSize: '1.05rem', margin: '0 0 4px', color: 'var(--text-primary)' }}>
                {u.username}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                {u.email}
              </p>
            </div>
            {u.id === USER_ID && (
              <span aria-label="Active User" style={{
                fontSize: '0.75rem',
                background: 'var(--brand-primary)',
                color: 'white',
                padding: '4px 12px',
                borderRadius: 100,
                fontWeight: 800,
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                Active
              </span>
            )}
            {u.id !== USER_ID && (
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setModals(prev => ({ ...prev, switchConfirm: u }))}
                  disabled={switchingUserId === u.id}
                  aria-label={`Switch to ${u.username}`}
                  style={{
                    background: 'rgba(var(--brand-primary-rgb), 0.1)',
                    border: '1px solid rgba(var(--brand-primary-rgb), 0.3)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--brand-primary)',
                    fontWeight: 600,
                    fontSize: '0.8rem'
                  }}
                >
                  <Users size={14} aria-hidden />
                  {switchingUserId === u.id ? 'Switching...' : 'Switch'}
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setModals(prev => ({ ...prev, deleteUser: u.id }))}
                  aria-label={`Delete ${u.username}`}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--danger)'
                  }}
                >
                  <Trash2 size={16} aria-hidden />
                </motion.button>
              </div>
            )}
          </motion.div>
        ))}
      </div>
      <motion.button
        type="button"
        className="btn-secondary"
        onClick={() => setModals(prev => ({ ...prev, addUser: { name: '', email: '' } }))}
        aria-label="Add new user"
        whileHover={{ scale: 1.02 }}
        style={{
          width: '100%',
          justifyContent: 'center',
          padding: 18,
          borderStyle: 'dashed',
          borderWidth: 2,
          background: 'rgba(255,255,255,0.02)'
        }}
      >
        <Plus size={18} aria-hidden />
        {t?.('add_new_user') || 'Add New User'}
      </motion.button>
    </div>
  </>
);

// ============= DATA TAB =============
const DataTab = ({ setModals, handleExcelExport, handlePDFExport, excelLoading, pdfLoading }) => (
  <>
    <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
      <div className="idp-hero-icon expense" style={{ width: 64, height: 64, marginBottom: 16 }}>
        <Database size={28} />
      </div>
      <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Data & Security</h3>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Export your data or permanently wipe your account.</p>
    </div>

    <div className="idp-body" style={{ background: 'transparent', border: 'none', padding: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 30 }}>
        <motion.button
          type="button"
          onClick={handleExcelExport}
          disabled={excelLoading}
          className="btn-secondary"
          whileHover={{ scale: 1.03, y: -2 }}
          style={{ flexDirection: 'column', gap: 12, padding: '24px 16px', background: 'var(--glass-2)' }}
        >
          <div style={{ padding: 12, background: 'rgba(16,185,129,0.1)', borderRadius: 12, color: 'var(--success)' }}>
            <Download size={24} aria-hidden />
          </div>
          <span style={{ fontWeight: 800 }}>{excelLoading ? 'Exporting...' : 'Download Excel'}</span>
        </motion.button>
        <motion.button
          type="button"
          onClick={handlePDFExport}
          disabled={pdfLoading}
          className="btn-secondary"
          whileHover={{ scale: 1.03, y: -2 }}
          style={{ flexDirection: 'column', gap: 12, padding: '24px 16px', background: 'var(--glass-2)' }}
        >
          <div style={{ padding: 12, background: 'rgba(56,189,248,0.1)', borderRadius: 12, color: 'var(--brand-secondary)' }}>
            <FileText size={24} aria-hidden />
          </div>
          <span style={{ fontWeight: 800 }}>{pdfLoading ? 'Generating...' : 'Download PDF'}</span>
        </motion.button>
      </div>

      <div className="idp-section" style={{ background: 'rgba(239,68,68,0.05)', padding: 24, borderRadius: 20, border: '1px solid rgba(239,68,68,0.2)' }}>
        <h4 style={{ color: 'var(--danger)', fontSize: '1.2rem', fontWeight: 800, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={20} aria-hidden /> Danger Zone
        </h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20, lineHeight: 1.6 }}>
          Permanently delete all your transactions, goals, and subscriptions. This action cannot be reversed.
        </p>
        <motion.button
          type="button"
          className="btn-primary"
          onClick={() => setModals(prev => ({ ...prev, resetConfirm: true }))}
          aria-label="Open factory reset confirmation dialog"
          whileHover={{ scale: 1.02 }}
          style={{ background: 'var(--danger)', width: 'max-content' }}
        >
          <ShieldAlert size={16} aria-hidden /> Factory Reset Account
        </motion.button>
      </div>
    </div>
  </>
);

// ============= MODAL COMPONENT =============
const Modal = ({ isOpen, onClose, title, children, confirmText, onConfirm, isLoading, danger, confirmDisabled }) => {
  const modalId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const modal = document.getElementById(modalId);
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    firstFocusable?.focus();

    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen, modalId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${modalId}-title`}
          onClick={() => !isLoading && onClose()}
          onKeyDown={(e) => e.key === 'Escape' && !isLoading && onClose()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            id={modalId}
            className="modal-box glass"
            initial={{ y: '100%', opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '100%', opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
            style={danger ? { borderColor: 'rgba(239,68,68,0.4)', boxShadow: '0 8px 32px rgba(239,68,68,0.2)' } : {}}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 id={`${modalId}-title`} style={danger ? { color: 'var(--danger)' } : {}}>
                {title}
              </h3>
              {!isLoading && (
                <button onClick={onClose} aria-label="Close modal" className="icon-button">
                  <X size={20} />
                </button>
              )}
            </div>
            {children}
            {confirmText && onConfirm && (
              <div className="modal-actions" style={{ marginTop: 24 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onConfirm}
                  disabled={isLoading || confirmDisabled}
                  style={danger ? { background: 'var(--danger)' } : {}}
                >
                  {isLoading ? 'Processing...' : confirmText}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ============= MAIN SETTINGS COMPONENT =============
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

const useMessage = () => {
  const [message, setMessage] = useState(null);
  const timeoutRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const showMessage = useCallback((type, text, duration = 4000) => {
    if (!isMounted.current) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage({ type, text });
    timeoutRef.current = setTimeout(() => {
      if (isMounted.current) setMessage(null);
    }, duration);
  }, []);

  return { message, showMessage };
};

// ============= FACTORY RESET MODAL (typed confirmation) =============
// Inner component that holds the input state — key prop resets it on each open
const FactoryResetModalInner = ({ onClose, onConfirm, isLoading }) => {
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
        <AlertTriangle size={48} style={{ color: 'var(--danger)', marginBottom: 12 }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          You are about to permanently delete <strong>all data</strong> associated with your account,
          including all transactions, budget goals, subscriptions, preferences, and export history.
        </p>
        <p style={{ color: '#ef4444', fontWeight: 700, marginTop: 12 }}>
          This action CANNOT be undone!
        </p>
      </div>
      <div className="form-field">
        <label htmlFor="reset_confirm_input" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Type <strong style={{ color: '#ef4444', letterSpacing: '0.05em' }}>DELETE</strong> to confirm:
        </label>
        <input
          id="reset_confirm_input"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE here"
          style={{ borderColor: isConfirmed ? '#ef4444' : undefined }}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </div>
    </Modal>
  );
};

const FactoryResetModal = ({ isOpen, onClose, onConfirm, isLoading }) => {
  if (!isOpen) return null;
  // key={Date.toString()} would rotate, but isOpen toggling remounts the inner component,
  // resetting its local state without needing a useEffect setState call.
  return <FactoryResetModalInner onClose={onClose} onConfirm={onConfirm} isLoading={isLoading} />;
};

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
    currencyInfo,
    lang,
    setLanguage,
    t,
    transactions = []
  } = context;

  const [formState, dispatch] = useReducer(settingsReducer, {
    username: user?.username || '',
    monthlyGoal: user?.monthly_goal?.toString() || '',
    currency: user?.currency || 'INR',
    avatar: user?.profile_avatar || '😊',
    avatarColor: user?.profile_color || '#059669',
    notificationPrefs: user?.notification_prefs || {
      emailReports: true, budgetAlerts: true, goalMilestones: true, unusualSpending: false,
      pushNotifications: true, weeklyDigest: true, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00'
    },
    advancedPrefs: user?.advanced_prefs || {
      dateFormat: 'MM/DD/YYYY', timeFormat: '12h', firstDayOfWeek: 'Sunday', decimalSeparator: '.',
      compactMode: false, autoSave: true, animationsEnabled: true, showWeekNumbers: false
    },
    isDirty: false
  });

  const [activeTab, setActiveTab] = useState('profile');
  const [modals, setModals] = useState({
    addUser: false,
    resetConfirm: false,
    deleteUser: null,
    switchConfirm: null
  });

  const [loadingStates, setLoadingStates] = useState({
    save: false,
    createUser: false,
    reset: false,
    switch: null,
    pdf: false,
    excel: false
  });

  const [undoSnapshot, setUndoSnapshot] = useState(null);

  const { message, showMessage } = useMessage();
  const isMounted = useRef(true);

  useEffect(() => {
    if (user) {
      dispatch({
        type: 'RESET_FORM',
        payload: {
          username: user.username || '',
          monthlyGoal: user.monthly_goal?.toString() || '',
          currency: user.currency || 'INR',
          avatar: user.profile_avatar || '😊',
          avatarColor: user.profile_color || '#059669',
          notificationPrefs: user.notification_prefs || {
            emailReports: true, budgetAlerts: true, goalMilestones: true, unusualSpending: false,
            pushNotifications: true, weeklyDigest: true, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00'
          },
          advancedPrefs: user.advanced_prefs || {
            dateFormat: 'MM/DD/YYYY', timeFormat: '12h', firstDayOfWeek: 'Sunday', decimalSeparator: '.',
            compactMode: false, autoSave: true, animationsEnabled: true, showWeekNumbers: false
          }
        }
      });
    }
  }, [user]);

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

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ✅ Fix: Removed redundant global Escape key handler — Modal already handles Escape internally.
  //         A global handler that resets ALL modals simultaneously could interfere with
  //         modals that need custom escape behavior in the future.

  const handleFieldChange = useCallback((field, value) => {
    dispatch({ type: 'SET_FIELD', field, value });
  }, []);

  const handleSave = useCallback(async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    const sanitizedUsername = sanitizeInput(formState.username);
    if (!sanitizedUsername) {
      showMessage('error', 'Display name cannot be empty.');
      return;
    }

    const { isValid: isGoalValid, value: goalValue } = validateGoal(formState.monthlyGoal);
    if (!isGoalValid) {
      showMessage('error', 'Monthly goal must be a positive number.');
      return;
    }

    setLoadingStates(prev => ({ ...prev, save: true }));

    try {
      // Snapshot old state for undo
      const previousState = {
        username: user?.username,
        theme: user?.theme,
        monthly_goal: user?.monthly_goal,
        currency: user?.currency,
        profile_avatar: user?.profile_avatar,
        profile_color: user?.profile_color,
        notification_prefs: user?.notification_prefs,
        advanced_prefs: user?.advanced_prefs
      };

      await api.updateSettings(USER_ID, {
        username: sanitizedUsername,
        theme,
        monthly_goal: goalValue,
        currency: formState.currency,
        profile_avatar: formState.avatar,
        profile_color: formState.avatarColor,
        notification_prefs: formState.notificationPrefs,
        advanced_prefs: formState.advancedPrefs
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
        setLoadingStates(prev => ({ ...prev, save: false }));
      }
    }
  }, [formState, theme, USER_ID, refetch, showMessage, user]);

  const handleUndo = useCallback(async () => {
    if (!undoSnapshot) return;
    setLoadingStates(prev => ({ ...prev, save: true }));
    try {
      await api.updateSettings(USER_ID, undoSnapshot);
      setUndoSnapshot(null);
      showMessage('success', 'Changes reverted successfully.');
      if (refetch) await refetch();
    } catch {
      showMessage('error', 'Failed to undo changes.');
    } finally {
      if (isMounted.current) {
        setLoadingStates(prev => ({ ...prev, save: false }));
      }
    }
  }, [undoSnapshot, USER_ID, refetch, showMessage]);

  const handleCreateUser = useCallback(async () => {
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

    setLoadingStates(prev => ({ ...prev, createUser: true }));

    try {
      const result = await createUser({
        username: sanitizedName,
        email: sanitizedEmail
      });

      if (result?.id && switchUser) {
        await switchUser(result.id);
      }

      setModals(prev => ({ ...prev, addUser: false }));
      showMessage('success', 'New account created and switched!');
      if (refetch) await refetch();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      const displayMsg = errorMsg === 'Email already exists'
        ? 'This email is already in use. Try a different one.'
        : `Error: ${errorMsg}`;
      showMessage('error', displayMsg);
    } finally {
      if (isMounted.current) {
        setLoadingStates(prev => ({ ...prev, createUser: false }));
      }
    }
  }, [modals.addUser, createUser, switchUser, refetch, showMessage]);

  const handleReset = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, reset: true }));

    try {
      await resetAccount();
      setModals(prev => ({ ...prev, resetConfirm: false }));
      showMessage('success', 'Account completely reset.');
    } catch (error) {
      console.error('Reset error:', error);
      showMessage('error', 'Error resetting account.');
    } finally {
      if (isMounted.current) {
        setLoadingStates(prev => ({ ...prev, reset: false }));
      }
    }
  }, [resetAccount, showMessage]);

  const handleDeleteUser = useCallback(async () => {
    const userId = modals.deleteUser;
    if (!userId) return;

    setLoadingStates(prev => ({ ...prev, save: true }));

    try {
      await api.deleteUser(userId);

      if (userId === USER_ID) {
        localStorage.removeItem('mcw-user-id');
        window.location.href = '/login';
      } else {
        if (refetch) await refetch();
        setModals(prev => ({ ...prev, deleteUser: null }));
        showMessage('success', 'Account successfully removed.');
      }
    } catch (err) {
      showMessage('error', `Failed to remove user: ${err.response?.data?.error || err.message}`);
    } finally {
      if (isMounted.current) {
        setLoadingStates(prev => ({ ...prev, save: false }));
      }
    }
  }, [modals.deleteUser, USER_ID, refetch, showMessage]);

  const handleSwitchUser = useCallback(async () => {
    const userToSwitch = modals.switchConfirm;
    if (!userToSwitch) return;

    setLoadingStates(prev => ({ ...prev, switch: userToSwitch.id }));

    try {
      if (formState.isDirty) {
        showMessage('success', 'Auto-saving changes before switching...', 2000);
        await api.updateSettings(USER_ID, {
          username: formState.username,
          theme,
          monthly_goal: formState.monthlyGoal,
          currency: formState.currency,
          profile_avatar: formState.avatar,
          profile_color: formState.avatarColor
        });
        dispatch({ type: 'CLEAR_DIRTY' });
      }

      await switchUser(userToSwitch.id);
      showMessage('success', `Switched to ${userToSwitch.username}`);
      if (refetch) await refetch();
      setModals(prev => ({ ...prev, switchConfirm: null }));
    } catch (err) {
      showMessage('error', `Failed to switch user: ${err.message || 'Unknown error'}`);
    } finally {
      if (isMounted.current) {
        setLoadingStates(prev => ({ ...prev, switch: null }));
      }
    }
  }, [modals.switchConfirm, switchUser, refetch, showMessage, formState, theme, USER_ID]);

  const handleThemeChange = useCallback((newTheme) => {
    setThemeDirect(newTheme);
    document.body.classList.add('theme-transition');
    setTimeout(() => document.body.classList.remove('theme-transition'), 300);

    const timeoutId = setTimeout(() => {
      api.updateSettings(USER_ID, { theme: newTheme }).catch(console.error);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [setThemeDirect, USER_ID]);

  const handlePDFExport = async () => {
    if (!user || transactions.length === 0) {
      showMessage('error', 'No data available to export.');
      return;
    }
    setLoadingStates(prev => ({ ...prev, pdf: true }));
    try {
      await exportToPDF(user, transactions, currencyInfo);
      showMessage('success', 'PDF Downloaded successfully.');
    } catch (err) {
      console.error('PDF Export Error:', err);
      showMessage('error', `PDF export failed: ${err.message}`);
    } finally {
      if (isMounted.current) setLoadingStates(prev => ({ ...prev, pdf: false }));
    }
  };

  const handleExcelExport = async () => {
    setLoadingStates(prev => ({ ...prev, excel: true }));
    try {
      await api.exportToExcel(USER_ID);
      showMessage('success', 'Excel exported successfully.');
    } catch (err) {
      console.error('Excel Export Error:', err);
      showMessage('error', 'Excel export failed.');
    } finally {
      if (isMounted.current) setLoadingStates(prev => ({ ...prev, excel: false }));
    }
  };

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  const sortedUsers = useMemo(() =>
    [...allUsers].sort((a, b) => a.username.localeCompare(b.username)),
    [allUsers]
  );

  const TABS = useMemo(() => [
    { id: 'profile', icon: User, label: t?.('profile') || 'Profile' },
    { id: 'preferences', icon: Settings, label: 'Preferences' },
    { id: 'language', icon: Globe, label: 'Language' },
    { id: 'appearance', icon: Palette, label: t?.('appearance') || 'Appearance' },
    { id: 'notifications', icon: BellIcon, label: 'Notifications' },
    { id: 'security', icon: Shield, label: 'Security' },
    { id: 'users', icon: Users, label: 'Manage Users' },
    { id: 'data', icon: Database, label: 'Data & Security' },
    { id: 'advanced', icon: Zap, label: 'Advanced' },
  ], [t]);

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
      showMessage
    };

    switch (activeTab) {
      case 'profile':
        return <ProfileTab {...commonProps} loading={loadingStates.save} onSave={handleSave} />;
      case 'preferences':
        return <PreferencesTab {...commonProps} loading={loadingStates.save} onSave={handleSave} />;
      case 'language':
        return <LanguageTab {...commonProps} />;
      case 'appearance':
        return <AppearanceTab {...commonProps} />;
      case 'notifications':
        return <NotificationPreferences userId={USER_ID} showMessage={showMessage} />;
      case 'security':
        return (
          <>
            <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
              <div className="idp-hero-icon" style={{ width: 64, height: 64, marginBottom: 16, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                <Shield size={28} />
              </div>
              <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Security Settings</h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage your account security and active sessions.</p>
            </div>
            <div className="idp-body">
              <PasswordChange userId={USER_ID} showMessage={showMessage} />
              <div style={{ height: 2, background: 'var(--glass-border)', margin: '32px 0' }} />
              <SessionManagement userId={USER_ID} showMessage={showMessage} />
            </div>
          </>
        );
      case 'users':
        return <UsersTab {...commonProps} sortedUsers={sortedUsers} USER_ID={USER_ID} setModals={setModals} switchingUserId={loadingStates.switch} />;
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
        return <AdvancedPreferences userId={USER_ID} showMessage={showMessage} />;
      default:
        return null;
    }
  };

  return (
    <div className="inbox-layout-page settings-page shared-page animate-in">
      <div className="inbox-header">
        <div className="ih-titles">
          <h2>{t?.('settings') || 'Settings'}</h2>
          <span className="ih-badge">{TABS.find(t => t.id === activeTab)?.label}</span>
        </div>
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`feedback-msg ${message.type}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}
              role="alert"
              aria-live="polite"
            >
              {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="inbox-split-pane">
        {/* Sidebar */}
        <div className="inbox-list-pane glass" style={{ flex: '0 0 280px' }} role="tablist" aria-orientation="vertical">
          <div className="il-filters" style={{ padding: '24px 20px 12px' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>
              Categories
            </h3>
          </div>
          <div className="il-scrollable" style={{ padding: '12px', gap: '4px' }}>
            {TABS.map(tab => (
              <motion.button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  borderRadius: '14px',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  background: activeTab === tab.id ? 'linear-gradient(135deg, rgba(var(--brand-primary-rgb), 0.15), rgba(var(--brand-secondary-rgb), 0.05))' : 'transparent',
                  color: activeTab === tab.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                  fontWeight: activeTab === tab.id ? 800 : 600,
                  fontSize: '0.95rem',
                  transition: 'all 0.2s',
                  boxShadow: activeTab === tab.id ? 'inset 2px 0 0 var(--brand-primary)' : 'none'
                }}
              >
                <tab.icon size={18} aria-hidden />
                {tab.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="inbox-detail-pane glass">
          <div className="idp-content" style={{ maxWidth: '800px', padding: 'clamp(16px, 5vw, 40px)', paddingBottom: '100px' }}>
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

      {/* ── Master Save Bar ── */}
      <AnimatePresence>
        {(formState.isDirty || undoSnapshot) && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--glass-2)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderRadius: '18px',
              padding: '14px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
              zIndex: 200,
              minWidth: 340
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {formState.isDirty ? 'Unsaved Changes' : '✓ Saved'}
              </p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {formState.isDirty
                  ? 'Your profile changes have not been saved yet.'
                  : 'Changes applied. Tap Undo to revert.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
              {undoSnapshot && !formState.isDirty && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleUndo}
                  disabled={loadingStates.save}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px' }}
                >
                  <RefreshCw size={14} /> Undo
                </button>
              )}
              {formState.isDirty && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => dispatch({
                      type: 'RESET_FORM', payload: {
                        username: user?.username || '',
                        monthlyGoal: user?.monthly_goal?.toString() || '',
                        currency: user?.currency || 'INR',
                        avatar: user?.profile_avatar || '😊',
                        avatarColor: user?.profile_color || '#059669',
                        notificationPrefs: user?.notification_prefs || {
                          emailReports: true, budgetAlerts: true, goalMilestones: true, unusualSpending: false,
                          pushNotifications: true, weeklyDigest: true, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00'
                        },
                        advancedPrefs: user?.advanced_prefs || {
                          dateFormat: 'MM/DD/YYYY', timeFormat: '12h', firstDayOfWeek: 'Sunday', decimalSeparator: '.',
                          compactMode: false, autoSave: true, animationsEnabled: true, showWeekNumbers: false
                        }
                      }
                    })}
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
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}
                  >
                    <Save size={14} />
                    {loadingStates.save ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <Modal
        isOpen={!!modals.addUser}
        onClose={() => setModals(prev => ({ ...prev, addUser: false }))}
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
            onChange={(e) => setModals(prev => ({
              ...prev,
              addUser: { ...prev.addUser, name: e.target.value }
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
            onChange={(e) => setModals(prev => ({
              ...prev,
              addUser: { ...prev.addUser, email: e.target.value }
            }))}
            placeholder="alex@example.com"
            aria-required="true"
          />
        </div>
      </Modal>

      <FactoryResetModal
        isOpen={modals.resetConfirm}
        onClose={() => setModals(prev => ({ ...prev, resetConfirm: false }))}
        onConfirm={handleReset}
        isLoading={loadingStates.reset}
      />

      <Modal
        isOpen={!!modals.deleteUser}
        onClose={() => setModals(prev => ({ ...prev, deleteUser: null }))}
        title="Delete User Account"
        confirmText="Yes, Delete This User"
        onConfirm={handleDeleteUser}
        isLoading={loadingStates.save}
        danger
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 16, lineHeight: 1.6 }}>
          You are about to delete the user <strong>{allUsers.find(u => u.id === modals.deleteUser)?.username}</strong>
          and <strong>all their financial data</strong>. This includes transactions, goals, and subscriptions.
        </p>
        <p style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>
          This action cannot be undone!
        </p>
      </Modal>

      <Modal
        isOpen={!!modals.switchConfirm}
        onClose={() => setModals(prev => ({ ...prev, switchConfirm: null }))}
        title="Switch User Account"
        confirmText={formState.isDirty ? "Save & Switch" : "Switch Now"}
        onConfirm={handleSwitchUser}
        isLoading={!!loadingStates.switch}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 16, lineHeight: 1.6 }}>
          Are you sure you want to switch to <strong>{modals.switchConfirm?.username}</strong>?
        </p>
        {formState.isDirty && (
          <div style={{ padding: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', marginTop: '16px' }}>
            <p style={{ color: 'var(--brand-secondary)', fontSize: '0.85rem', margin: 0, fontWeight: 600 }}>
              Note: You have unsaved changes in your profile. They will be auto-saved before switching.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ============= EXPORT =============
function SettingsPage() {
  const context = useContext(AppContext);

  if (!context) {
    return (
      <div className="loading-container" role="alert" aria-busy="true">
        <Loader className="animate-spin" size={32} />
        <p>Loading settings...</p>
      </div>
    );
  }

  return <SettingsInner context={context} />;
}

export default React.memo(SettingsPage);