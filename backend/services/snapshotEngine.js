// backend/services/snapshotEngine.js
const WealthItem = require('../models/WealthItem');
const NetWorthHistory = require('../models/NetWorthHistory');
const { getLivePrices } = require('./marketDataService');
const User = require('../models/User');

// Depreciation utility — mirrored from routes/wealth.js
const calculateDepreciation = (baseValue, acquisitionDate, rate = 0.15) => {
  if (!acquisitionDate) return baseValue;
  const yearsOwned = (Date.now() - new Date(acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
  return parseFloat((baseValue * Math.pow(1 - rate, Math.max(0, yearsOwned))).toFixed(2));
};

/**
 * Capture a Net Worth snapshot for a specific user as of "now".
 * Handles live price hydration AND depreciation for physical assets.
 * @param {String} userId
 */
const takeSnapshot = async (userId) => {
  try {
    const items = await WealthItem.find({ user_id: userId });

    if (items.length === 0) {
      // Nothing to snapshot — return a zero-value snapshot
      return { totalAssets: 0, totalLiabilities: 0, netWorth: 0 };
    }

    // Identify symbols for live price hydration
    const symbols = items
      .filter(item => item.symbol && item.quantity)
      .map(item => item.symbol);

    const livePrices = symbols.length > 0 ? await getLivePrices(symbols) : {};

    let totalAssets = 0;
    let totalLiabilities = 0;

    items.forEach(item => {
      let currentVal;

      if (item.asset_class === 'illiquid_asset') {
        // Apply depreciation for physical assets
        currentVal = calculateDepreciation(item.base_value, item.acquisition_date);
      } else if (item.symbol && item.quantity && livePrices[item.symbol]) {
        // Live market value for investable assets
        currentVal = item.quantity * livePrices[item.symbol];
      } else {
        currentVal = item.base_value;
      }

      if (item.asset_class === 'liability') {
        totalLiabilities += Math.abs(currentVal);
      } else {
        totalAssets += currentVal;
      }
    });

    const netWorth = totalAssets - totalLiabilities;

    // Upsert this month's snapshot — one record per month per user
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

/**
 * Runs snapshots for all active users — suitable for a CRON job trigger
 */
const runGlobalSnapshots = async () => {
  try {
    const users = await User.find({ is_active: true });
    console.log(`Starting global net worth snapshots for ${users.length} users...`);

    // Use Promise.allSettled so one failure doesn't abort the rest
    const results = await Promise.allSettled(
      users.map(user => takeSnapshot(user._id))
    );

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

module.exports = { takeSnapshot, runGlobalSnapshots };
