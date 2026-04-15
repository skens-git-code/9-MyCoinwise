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

  useEffect(() => {
    const savedAutoBackup = localStorage.getItem('auto-backup-enabled');
    if (savedAutoBackup) setAutoBackup(JSON.parse(savedAutoBackup));
  }, []);

  const handleExportBackup = async () => {
    setBackupLoading(true);
    try {
      const data = await api.exportAllData(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zenith-backup-${new Date().toISOString().split('T')[0]}.json`;
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

  const handleImportBackup = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const confirmed = window.confirm(
      '⚠️ WARNING: Importing backup will replace ALL current data including transactions, goals, and subscriptions.\n\nThis action CANNOT be undone. Continue?'
    );

    if (!confirmed) {
      fileInputRef.current.value = '';
      return;
    }

    setRestoreLoading(true);
    try {
      const text = await file.text();
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
      // Set up automatic weekly backup
      const scheduleBackup = () => {
        const lastBackup = localStorage.getItem('last-auto-backup');
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        if (!lastBackup || Date.now() - new Date(lastBackup).getTime() > oneWeek) {
          handleExportBackup();
          localStorage.setItem('last-auto-backup', new Date().toISOString());
        }
      };

      scheduleBackup();
      const interval = setInterval(scheduleBackup, 7 * 24 * 60 * 60 * 1000);
      window.autoBackupInterval = interval;
    } else {
      if (window.autoBackupInterval) clearInterval(window.autoBackupInterval);
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
    </div>
  );
};

// ============= NOTIFICATION PREFERENCES =============
const NotificationPreferences = ({ userId, showMessage }) => {
  const [preferences, setPreferences] = useState({
    emailReports: true,
    budgetAlerts: true,
    goalMilestones: true,
    unusualSpending: false,
    pushNotifications: true,
    weeklyDigest: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;

    const loadPrefs = async () => {
      try {
        const saved = await api.getNotificationPreferences(userId);

        if (isMounted && saved) {
          setPreferences(saved);
        }
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
      }
    };

    loadPrefs();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const handleSave = async () => {
    if (!userId) {
      showMessage('error', 'User not identified');
      return;
    }

    if (loading) return; // prevent double click

    setLoading(true);

    try {
      const response = await api.updateNotificationPreferences(userId, preferences);

      if (response?.success !== false) {
        showMessage('success', 'Notification preferences saved!');
      } else {
        throw new Error('API returned failure');
      }
    } catch (error) {
      console.error('Save failed:', error);
      showMessage('error', error?.message || 'Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

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
                checked={preferences.emailReports}
                onChange={(e) => setPreferences(prev => ({ ...prev, emailReports: e.target.checked }))}
              />
              <Mail size={16} /> Monthly Email Reports
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences.weeklyDigest}
                onChange={(e) => setPreferences(prev => ({ ...prev, weeklyDigest: e.target.checked }))}
              />
              <Calendar size={16} /> Weekly Digest
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences.budgetAlerts}
                onChange={(e) => setPreferences(prev => ({ ...prev, budgetAlerts: e.target.checked }))}
              />
              <BellIcon size={16} /> Budget Alerts
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences.goalMilestones}
                onChange={(e) => setPreferences(prev => ({ ...prev, goalMilestones: e.target.checked }))}
              />
              <Target size={16} /> Goal Milestone Achievements
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences.unusualSpending}
                onChange={(e) => setPreferences(prev => ({ ...prev, unusualSpending: e.target.checked }))}
              />
              <AlertTriangle size={16} /> Unusual Spending Alerts
            </label>
          </div>

          <div style={{ height: 1, background: 'var(--glass-border)', margin: '8px 0' }} />

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preferences.quietHoursEnabled}
                onChange={(e) => setPreferences(prev => ({ ...prev, quietHoursEnabled: e.target.checked }))}
              />
              <Moon size={16} /> Enable Quiet Hours
            </label>
          </div>

          {preferences.quietHoursEnabled && (
            <div style={{ display: 'flex', gap: 12, marginLeft: 24 }}>
              <div className="form-field" style={{ flex: 1 }}>
                <label>Start Time</label>
                <input
                  type="time"
                  value={preferences.quietHoursStart}
                  onChange={(e) => setPreferences(prev => ({ ...prev, quietHoursStart: e.target.value }))}
                />
              </div>
              <div className="form-field" style={{ flex: 1 }}>
                <label>End Time</label>
                <input
                  type="time"
                  value={preferences.quietHoursEnd}
                  onChange={(e) => setPreferences(prev => ({ ...prev, quietHoursEnd: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        <div className="idp-actions" style={{ marginTop: 24 }}>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={loading}>
            <Save size={18} /> {loading ? 'Saving...' : 'Save Preferences'}
          </button>
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

  const handleChange = async (e) => {
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
    <form onSubmit={handleChange}>
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
  const [loading, setLoading] = useState(false);

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
  const revokeAllOtherSessions = async () => {
    if (!userId) {
      showMessage('error', 'User not identified');
      return;
    }

    const confirmed = window.confirm(
      'This will log out all other devices. Continue?'
    );

    if (!confirmed || loading) return;

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

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading sessions...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h4 style={{ margin: 0 }}>Active Sessions</h4>
        <button
          type="button"
          className="btn-secondary"
          onClick={revokeAllOtherSessions}
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

        {sessions.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No active sessions found
          </div>
        )}
      </div>
    </div>
  );
};

// ============= ADVANCED PREFERENCES =============
const AdvancedPreferences = ({ userId, showMessage }) => {
  const [prefs, setPrefs] = useState({
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    firstDayOfWeek: 'Sunday',
    decimalSeparator: '.',
    compactMode: false,
    autoSave: true,
    animationsEnabled: true,
    showWeekNumbers: false
  });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!userId) return;

    let isMounted = true;

    const loadPrefs = async () => {
      try {
        const saved = await api.getAdvancedPreferences(userId);

        if (isMounted && saved) {
          setPrefs(saved);
        }
      } catch (error) {
        console.error('Failed to load advanced preferences:', error);
      }
    };

    loadPrefs();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const handleSave = async () => {
    if (!userId) {
      showMessage('error', 'User not found');
      return;
    }

    if (loading) return;

    setLoading(true);

    try {
      await api.updateAdvancedPreferences(userId, prefs);

      showMessage('success', 'Preferences saved successfully!');
    } catch (error) {
      console.error('Save advanced preferences error:', error);
      showMessage('error', error?.message || 'Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

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
            value={prefs.dateFormat}
            onChange={(e) => setPrefs(prev => ({ ...prev, dateFormat: e.target.value }))}
          >
            <option>MM/DD/YYYY</option>
            <option>DD/MM/YYYY</option>
            <option>YYYY-MM-DD</option>
          </select>
        </div>

        <div className="form-field">
          <label>Time Format</label>
          <select
            value={prefs.timeFormat}
            onChange={(e) => setPrefs(prev => ({ ...prev, timeFormat: e.target.value }))}
          >
            <option value="12h">12h (AM/PM)</option>
            <option value="24h">24h</option>
          </select>
        </div>

        <div className="form-field">
          <label>First Day of Week</label>
          <select
            value={prefs.firstDayOfWeek}
            onChange={(e) => setPrefs(prev => ({ ...prev, firstDayOfWeek: e.target.value }))}
          >
            <option>Sunday</option>
            <option>Monday</option>
          </select>
        </div>

        <div className="form-field">
          <label>Decimal Separator</label>
          <select
            value={prefs.decimalSeparator}
            onChange={(e) => setPrefs(prev => ({ ...prev, decimalSeparator: e.target.value }))}
          >
            <option value=".">Period (.) - 1,000.00</option>
            <option value=",">Comma (,) - 1.000,00</option>
          </select>
        </div>

        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs.compactMode}
              onChange={(e) => setPrefs(prev => ({ ...prev, compactMode: e.target.checked }))}
            />
            <Zap size={16} /> Compact Mode (Denser Layout)
          </label>
        </div>

        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs.autoSave}
              onChange={(e) => setPrefs(prev => ({ ...prev, autoSave: e.target.checked }))}
            />
            <Save size={16} /> Auto-save Changes
          </label>
        </div>

        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs.animationsEnabled}
              onChange={(e) => setPrefs(prev => ({ ...prev, animationsEnabled: e.target.checked }))}
            />
            <Activity size={16} /> Enable Animations
          </label>
        </div>

        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs.showWeekNumbers}
              onChange={(e) => setPrefs(prev => ({ ...prev, showWeekNumbers: e.target.checked }))}
            />
            <Calendar size={16} /> Show Week Numbers in Calendar
          </label>
        </div>
      </div>

      <div className="idp-actions">
        <button type="button" className="btn-primary" onClick={handleSave} disabled={loading}>
          <Save size={18} /> {loading ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </>
  );
};

// ============= PROFILE TAB =============
const ProfileTab = ({ formState, handleFieldChange, t, user, loading }) => (
  <>
    <div className="idp-header" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: 30 }}>
      <div className="idp-hero-icon income" style={{ width: 64, height: 64, marginBottom: 16 }}>
        <User size={28} />
      </div>
      <h3 style={{ fontSize: '2rem', margin: '0 0 8px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>
        {t?.('profile') || 'Profile'}
      </h3>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        Configure your personal identity within Zenith.
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
            flexShrink: 0
          }}
        >
          {formState.avatar}
        </motion.div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
              Choose Avatar
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Choose your avatar">
              {AVATARS.slice(0, 12).map(avatar => (
                <button
                  key={avatar}
                  type="button"
                  onClick={() => handleFieldChange('avatar', avatar)}
                  aria-label={`Select avatar ${avatar}`}
                  aria-pressed={formState.avatar === avatar}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: formState.avatar === avatar ? 'var(--brand-primary)' : 'var(--glass-2)',
                    border: '1px solid var(--glass-border)',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    transition: 'all 0.2s',
                    opacity: formState.avatar === avatar ? 1 : 0.6
                  }}
                >
                  {avatar}
                </button>
              ))}
            </div>
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
      <div className="form-field">
        <label htmlFor="email_ro">Email (read-only)</label>
        <input id="email_ro" value={user?.email || ''} readOnly style={{ opacity: 0.5 }} />
      </div>
    </div>

    <div className="idp-actions">
      <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: 16 }}>
        <Save size={18} aria-hidden />
        {loading ? 'Saving...' : 'Save Profile Changes'}
      </button>
    </div>
  </>
);

// ============= PREFERENCES TAB =============
const PreferencesTab = ({ formState, handleFieldChange, t, loading }) => (
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

    <div className="idp-actions">
      <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: 16 }}>
        <Save size={18} aria-hidden />
        {loading ? 'Saving...' : 'Save Preferences'}
      </button>
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
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Zenith speaks your language.</p>
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
const Modal = ({ isOpen, onClose, title, children, confirmText, onConfirm, isLoading, danger }) => {
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

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
      onClick={() => !isLoading && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && !isLoading && onClose()}
    >
      <motion.div
        id={modalId}
        className="modal-box glass"
        initial={{ scale: 0.88, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.88, y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 22 }}
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
              disabled={isLoading}
              style={danger ? { background: 'var(--danger)' } : {}}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          </div>
        )}
      </motion.div>
    </div>
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
          avatarColor: user.profile_color || '#059669'
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

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setModals({
          addUser: false,
          resetConfirm: false,
          deleteUser: null,
          switchConfirm: null
        });
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleFieldChange = useCallback((field, value) => {
    dispatch({ type: 'SET_FIELD', field, value });
  }, []);

  const handleSave = useCallback(async (e) => {
    e.preventDefault();

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
      await api.updateSettings(USER_ID, {
        username: sanitizedUsername,
        theme,
        monthly_goal: goalValue,
        currency: formState.currency,
        profile_avatar: formState.avatar,
        profile_color: formState.avatarColor
      });

      dispatch({ type: 'CLEAR_DIRTY' });
      showMessage('success', 'Settings saved successfully!');
      if (refetch) await refetch();
    } catch (error) {
      console.error('Save error:', error);
      showMessage('error', 'Failed to save settings. Please try again.');
    } finally {
      if (isMounted.current) {
        setLoadingStates(prev => ({ ...prev, save: false }));
      }
    }
  }, [formState, theme, USER_ID, refetch, showMessage]);

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
        localStorage.removeItem('zs-user-id');
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
  }, [modals.switchConfirm, switchUser, refetch, showMessage]);

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
    if (formState.isDirty && user) {
      dispatch({
        type: 'RESET_FORM',
        payload: {
          username: user.username || '',
          monthlyGoal: user.monthly_goal?.toString() || '',
          currency: user.currency || 'INR',
          avatar: user.profile_avatar || '😊',
          avatarColor: user.profile_color || '#059669'
        }
      });
    }
    setActiveTab(tabId);
  }, [formState.isDirty, user]);

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
    <div className="inbox-layout-page settings-page">
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
          <form onSubmit={handleSave} className="idp-content" style={{ maxWidth: '800px', padding: '40px' }}>
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
          </form>
        </div>
      </div>

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

      <Modal
        isOpen={modals.resetConfirm}
        onClose={() => setModals(prev => ({ ...prev, resetConfirm: false }))}
        title="Confirm Factory Reset"
        confirmText="Yes, Permanently Delete All Data"
        onConfirm={handleReset}
        isLoading={loadingStates.reset}
        danger
      >
        <div style={{ marginBottom: 16 }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 16px', display: 'block', color: 'var(--danger)' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, textAlign: 'center' }}>
            You are about to permanently delete <strong>all data</strong> associated with your account.
            This includes:
          </p>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 12, paddingLeft: 20 }}>
            <li>All transactions</li>
            <li>Budget goals</li>
            <li>Subscription lists</li>
            <li>User preferences</li>
            <li>Export history</li>
          </ul>
          <p style={{ color: '#ef4444', fontWeight: 'bold', textAlign: 'center', marginTop: 16 }}>
            This action CANNOT be undone!
          </p>
        </div>
      </Modal>

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
        confirmText="Switch Now"
        onConfirm={handleSwitchUser}
        isLoading={!!loadingStates.switch}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 16, lineHeight: 1.6 }}>
          Are you sure you want to switch to <strong>{modals.switchConfirm?.username}</strong>?
        </p>
        <p style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
          Note: Any unsaved changes in your current session will be lost.
        </p>
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