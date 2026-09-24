/* —————————————————————————————————————
 * Snapshot Engine
 * Captures net-worth snapshots for users by hydrating wealth items
 * with live prices and depreciation, then upserting monthly records
 * into NetWorthHistory.
 *
 * Exports:
 *   takeSnapshot(userId)      – Snapshot a single user.
 *   runGlobalSnapshots()      – Snapshot all active users (CRON-friendly).
 *
 * Key behaviors:
 *   - One NetWorthHistory record per user per month (upsert by month start).
 *   - Depreciation is applied to illiquid assets and business equity.
 *   - Live market prices are used for symbol + quantity items.
 *   - `current_value_override` takes precedence over any computed value.
 *   - Global run uses Promise.allSettled so one failure doesn't abort the rest.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const WealthItem = require('../models/WealthItem');
const NetWorthHistory = require('../models/NetWorthHistory');
const { getLivePrices } = require('./marketDataService');
const User = require('../models/User');

// ── Depreciation utility — mirrored from routes/wealth.js ──
// Applies compound depreciation per year of ownership using a fixed
// default rate (0.15) when no rate is supplied.
const calculateDepreciation = (baseValue, acquisitionDate, rate = 0.15) => {
  if (!acquisitionDate) return baseValue;
  const yearsOwned = (Date.now() - new Date(acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
  return parseFloat((baseValue * Math.pow(1 - rate, Math.max(0, yearsOwned))).toFixed(2));
};

/* —————————————————————————————————————
 * Take Snapshot
 * Capture a Net Worth snapshot for a specific user as of "now".
 * Handles live price hydration AND depreciation for physical assets.
 * @param {String} userId
 * ————————————————————————————————————— */
const takeSnapshot = async (userId) => {
  try {
    // ── Load the user's wealth items ──
    const items = await WealthItem.find({ user_id: userId });

    // ── Short-circuit when there is nothing to snapshot ──
    if (items.length === 0) {
      // Nothing to snapshot — return a zero-value snapshot
      return { totalAssets: 0, totalLiabilities: 0, netWorth: 0 };
    }

    // ── Identify symbols for live price hydration ──
    const symbols = items
      .filter(item => item.symbol && item.quantity)
      .map(item => item.symbol);

    // ── Fetch live prices (best-effort) ──
    const livePrices = symbols.length > 0 ? await getLivePrices(symbols) : {};

    let totalAssets = 0;
    let totalLiabilities = 0;

    // ── Compute the current value of each item ──
    items.forEach(item => {
      let currentVal;

      if (item.current_value_override !== null && item.current_value_override !== undefined) {
        // Manual override wins over any computed value
        currentVal = item.current_value_override;
      } else if (item.asset_class === 'illiquid_asset' || item.asset_class === 'business_equity') {
        // Apply depreciation for physical assets
        currentVal = calculateDepreciation(item.base_value, item.acquisition_date);
      } else if (item.symbol && item.quantity && livePrices[item.symbol]) {
        // Live market value for investable assets
        currentVal = item.quantity * livePrices[item.symbol];
      } else {
        // Fall back to the base value
        currentVal = item.base_value;
      }

      // ── Bucket into assets vs. liabilities ──
      if (item.asset_class === 'liability') {
        totalLiabilities += Math.abs(currentVal);
      } else {
        totalAssets += currentVal;
      }
    });

    const netWorth = totalAssets - totalLiabilities;

    // ── Upsert this month's snapshot — one record per month per user ──
    // Snapshot date is pinned to the first of the current month so
    // repeated calls within the same month update the same record.
    const now = new Date();
    const snapshotDate = new Date(now.getFullYear(), now.getMonth(), 1);

    await NetWorthHistory.findOneAndUpdate(
      { user_id: userId, snapshot_date: snapshotDate },
      {
        total_assets: parseFloat(totalAssets.toFixed(2)),
        total_liabilities: parseFloat(totalLiabilities.toFixed(2)),
        net_worth: parseFloat(netWorth.toFixed(2)),
      },
      { upsert: true, new: true }
    );

    // ── Return the computed totals ──
    return {
      totalAssets: parseFloat(totalAssets.toFixed(2)),
      totalLiabilities: parseFloat(totalLiabilities.toFixed(2)),
      netWorth: parseFloat(netWorth.toFixed(2)),
    };
  } catch (error) {
    console.error(`Snapshot Error for user ${userId}:`, error);
    throw error;
  }
};

/* —————————————————————————————————————
 * Run Global Snapshots
 * Runs snapshots for all active users — suitable for a CRON job trigger.
 * Uses Promise.allSettled so one failure doesn't abort the rest.
 * ————————————————————————————————————— */
const runGlobalSnapshots = async () => {
  try {
    // ── Load all active users ──
    const users = await User.find({ is_active: true });
    console.log(`Starting global net worth snapshots for ${users.length} users...`);

    // Use Promise.allSettled so one failure doesn't abort the rest
    const results = await Promise.allSettled(
      users.map(user => takeSnapshot(user._id))
    );

    // ── Report failures (if any) ──
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`${failures.length} snapshot(s) failed:`, failures.map(f => f.reason?.message));
    }

    console.log(`Global snapshots completed. ${results.length - failures.length}/${results.length} succeeded.`);
  } catch (error) {
    console.error('Global snapshot run failed:', error);
    throw error;
  }
};

// ── Export ──
module.exports = { takeSnapshot, runGlobalSnapshots };