/* —————————————————————————————————————
 * Notification Manager Utility
 * Enterprise-grade state synchronization, persistence, throttling,
 * and filtering for the MyCoinwise Notification & Alert Center.
 * ————————————————————————————————————— */

const STORAGE_KEYS = {
  READ: 'mcw_read_notifications',
  ARCHIVED: 'mcw_dismissed_alerts', // kept for backwards compatibility with legacy dismissed alerts
  PINNED: 'mcw_pinned_notifications',
  MODE: 'mcw_notification_mode',
  CUSTOM_HISTORY: 'mcw_custom_notifications_v1',
};

// ── In-memory sets initialized lazily from localStorage ──
let readSet = null;
let archivedSet = null;
let pinnedSet = null;
let currentMode = null;
const listeners = new Set();

const isClient = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

function safeGetItem(key, fallback = null) {
  if (!isClient) return fallback;
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn(`[NotificationManager] Failed to read ${key}`, e);
    return fallback;
  }
}

function safeSetItem(key, value) {
  if (!isClient) return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`[NotificationManager] Failed to persist ${key}`, e);
  }
}

function initSets() {
  if (readSet && archivedSet && pinnedSet) return;

  try {
    const rawRead = safeGetItem(STORAGE_KEYS.READ);
    readSet = new Set(rawRead ? JSON.parse(rawRead) : []);
  } catch {
    readSet = new Set();
  }

  try {
    const rawArchived = safeGetItem(STORAGE_KEYS.ARCHIVED);
    archivedSet = new Set(rawArchived ? JSON.parse(rawArchived) : []);
  } catch {
    archivedSet = new Set();
  }

  try {
    const rawPinned = safeGetItem(STORAGE_KEYS.PINNED);
    pinnedSet = new Set(rawPinned ? JSON.parse(rawPinned) : []);
  } catch {
    pinnedSet = new Set();
  }

  currentMode = safeGetItem(STORAGE_KEYS.MODE, 'normal');
  if (!['normal', 'priority', 'silent'].includes(currentMode)) {
    currentMode = 'normal';
  }
}

// ── Broadcast change to local listeners & other windows ──
function notifyChange() {
  const snapshot = {
    readCount: readSet?.size || 0,
    archivedCount: archivedSet?.size || 0,
    pinnedCount: pinnedSet?.size || 0,
    mode: currentMode,
  };

  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.error('[NotificationManager] Listener error', err);
    }
  });

  if (isClient) {
    window.dispatchEvent(new CustomEvent('mcw-notifications-updated', { detail: snapshot }));
  }
}

// Listen for storage events from other tabs
if (isClient) {
  window.addEventListener('storage', (e) => {
    if (Object.values(STORAGE_KEYS).includes(e.key)) {
      readSet = null;
      archivedSet = null;
      pinnedSet = null;
      initSets();
      notifyChange();
    }
  });
}

export const notificationManager = {
  /** Subscribe to notification state changes */
  subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  /** Get snapshot of read IDs */
  getReadIds() {
    initSets();
    return new Set(readSet);
  },

  /** Check if a notification is read */
  isRead(id) {
    if (!id) return false;
    initSets();
    return readSet.has(String(id));
  },

  /** Mark single notification as read */
  markAsRead(id) {
    if (!id) return;
    initSets();
    const str = String(id);
    if (!readSet.has(str)) {
      readSet.add(str);
      safeSetItem(STORAGE_KEYS.READ, JSON.stringify([...readSet]));
      notifyChange();
    }
  },

  /** Mark single notification as unread */
  markAsUnread(id) {
    if (!id) return;
    initSets();
    const str = String(id);
    if (readSet.has(str)) {
      readSet.delete(str);
      safeSetItem(STORAGE_KEYS.READ, JSON.stringify([...readSet]));
      notifyChange();
    }
  },

  /** Mark list of notification IDs as read */
  markAllAsRead(ids = []) {
    initSets();
    let changed = false;
    ids.forEach((id) => {
      if (id && !readSet.has(String(id))) {
        readSet.add(String(id));
        changed = true;
      }
    });
    if (changed) {
      safeSetItem(STORAGE_KEYS.READ, JSON.stringify([...readSet]));
      notifyChange();
    }
  },

  /** Get snapshot of archived/dismissed IDs */
  getArchivedIds() {
    initSets();
    return new Set(archivedSet);
  },

  /** Check if a notification is archived */
  isArchived(id) {
    if (!id) return false;
    initSets();
    return archivedSet.has(String(id));
  },

  /** Archive / Dismiss a notification */
  archive(id) {
    if (!id) return;
    initSets();
    const str = String(id);
    if (!archivedSet.has(str)) {
      archivedSet.add(str);
      // Automatically mark as read on archive
      readSet.add(str);
      safeSetItem(STORAGE_KEYS.ARCHIVED, JSON.stringify([...archivedSet]));
      safeSetItem(STORAGE_KEYS.READ, JSON.stringify([...readSet]));
      notifyChange();
    }
  },

  /** Unarchive / Restore a notification */
  unarchive(id) {
    if (!id) return;
    initSets();
    const str = String(id);
    if (archivedSet.has(str)) {
      archivedSet.delete(str);
      safeSetItem(STORAGE_KEYS.ARCHIVED, JSON.stringify([...archivedSet]));
      notifyChange();
    }
  },

  /** Archive all active IDs */
  archiveAll(ids = []) {
    initSets();
    let changed = false;
    ids.forEach((id) => {
      if (id) {
        const str = String(id);
        if (!archivedSet.has(str)) {
          archivedSet.add(str);
          readSet.add(str);
          changed = true;
        }
      }
    });
    if (changed) {
      safeSetItem(STORAGE_KEYS.ARCHIVED, JSON.stringify([...archivedSet]));
      safeSetItem(STORAGE_KEYS.READ, JSON.stringify([...readSet]));
      notifyChange();
    }
  },

  /** Permanently clear all history */
  clearAllHistory() {
    initSets();
    archivedSet.clear();
    readSet.clear();
    pinnedSet.clear();
    safeSetItem(STORAGE_KEYS.ARCHIVED, JSON.stringify([]));
    safeSetItem(STORAGE_KEYS.READ, JSON.stringify([]));
    safeSetItem(STORAGE_KEYS.PINNED, JSON.stringify([]));
    notifyChange();
  },

  /** Check if pinned */
  isPinned(id) {
    if (!id) return false;
    initSets();
    return pinnedSet.has(String(id));
  },

  /** Toggle pin status */
  togglePin(id) {
    if (!id) return false;
    initSets();
    const str = String(id);
    const nextPinned = !pinnedSet.has(str);
    if (nextPinned) {
      pinnedSet.add(str);
    } else {
      pinnedSet.delete(str);
    }
    safeSetItem(STORAGE_KEYS.PINNED, JSON.stringify([...pinnedSet]));
    notifyChange();
    return nextPinned;
  },

  /** Get Notification delivery mode ('normal' | 'priority' | 'silent') */
  getMode() {
    initSets();
    return currentMode || 'normal';
  },

  /** Set delivery mode */
  setMode(mode) {
    if (!['normal', 'priority', 'silent'].includes(mode)) return;
    initSets();
    currentMode = mode;
    safeSetItem(STORAGE_KEYS.MODE, mode);
    notifyChange();
  },

  /** Check if current time falls within Quiet Hours */
  isInQuietHours(userPrefs) {
    if (!userPrefs?.quietHoursEnabled) return false;
    const start = userPrefs.quietHoursStart || '22:00';
    const end = userPrefs.quietHoursEnd || '08:00';

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    const startMins = (sH || 0) * 60 + (sM || 0);
    const endMins = (eH || 0) * 60 + (eM || 0);

    if (startMins <= endMins) {
      return currentMins >= startMins && currentMins <= endMins;
    }
    // Overnight span (e.g. 22:00 to 08:00)
    return currentMins >= startMins || currentMins <= endMins;
  },

  /** Human-readable relative time */
  formatRelativeTime(timestamp) {
    if (!timestamp) return 'Recently';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Recently';

    const diffMs = Date.now() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  },
};
