/* —————————————————————————————————————
 * Cleanup Duplicates & Balances Migration
 * One-time script to repair historical data.
 *
 * Steps:
 *   1. Identify and soft-delete duplicate transaction rows created by
 *      earlier race conditions.
 *   2. Correct anomalous test account initial balances (e.g. '44ee'
 *      3,444,444 EUR).
 *   3. Resynchronize all account current_balance values.
 *   4. Resynchronize all user balance totals.
 *
 * Usage:
 *   node backend/scripts/cleanup-duplicates-and-balances.js [--dry-run]
 *
 * --dry-run prints what would change without writing to the database.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const User = require('../models/User');
const { transactionIntegrityKey } = require('../utils/transactionIntegrity');

// ── Detect dry-run mode ──
const isDryRun = process.argv.includes('--dry-run');

// ── Main migration routine ──
async function run() {
  // ── Require MONGO_URI ──
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is missing in .env');
    process.exit(1);
  }

  // ── Connect to MongoDB ──
  console.log(`Connecting to MongoDB... (${isDryRun ? 'DRY RUN' : 'LIVE RUN'})`);
  await mongoose.connect(uri);

  /* —————————————————————————————————————
   * Step 1: Scan for duplicate transactions
   * A duplicate is a non-deleted transaction whose (user_id, integrity
   * key) pair has already been seen. The first occurrence is kept; the
   * rest are soft-deleted.
   * ————————————————————————————————————— */
  console.log('\n--- Step 1: Scanning for duplicate transactions ---');
  const allTransactions = await Transaction.find({ is_deleted: { $ne: true } })
    .sort({ created_at: 1, _id: 1 })
    .lean();

  const seenKeys = new Map();
  const duplicateIds = [];

  for (const tx of allTransactions) {
    const key = `${tx.user_id}:${transactionIntegrityKey(tx)}`;
    if (seenKeys.has(key)) {
      duplicateIds.push(tx._id);
    } else {
      seenKeys.set(key, tx._id);
    }
  }

  console.log(`Found ${duplicateIds.length} duplicate active transaction(s).`);

  if (duplicateIds.length > 0) {
    console.log('Duplicate IDs to mark deleted:', duplicateIds);

    // ── Soft-delete duplicates (skipped in dry-run) ──
    if (!isDryRun) {
      await Transaction.updateMany(
        { _id: { $in: duplicateIds } },
        { $set: { is_deleted: true } }
      );
      console.log(`Successfully soft-deleted ${duplicateIds.length} duplicate transactions.`);
    }
  }

  /* —————————————————————————————————————
   * Step 2: Fix anomalous test account balances
   * Targets accounts named '44ee' whose initial_balance is > 100,000 —
   * a known artifact of an earlier test seed.
   * ————————————————————————————————————— */
  console.log('\n--- Step 2: Checking anomalous test accounts ---');
  const anomalousAccounts = await Account.find({
    name: '44ee',
    initial_balance: { $gt: 100000 },
  }).lean();

  if (anomalousAccounts.length > 0) {
    console.log(
      `Found ${anomalousAccounts.length} anomalous account(s):`,
      anomalousAccounts.map((a) => ({ id: a._id, name: a.name, init: a.initial_balance }))
    );

    // ── Zero out anomalous balances (skipped in dry-run) ──
    if (!isDryRun) {
      for (const acc of anomalousAccounts) {
        await Account.findByIdAndUpdate(acc._id, {
          $set: { initial_balance: 0, current_balance: 0 },
        });
      }
      console.log('Reset anomalous account initial_balance and current_balance to 0.');
    }
  } else {
    console.log('No anomalous 44ee accounts found with > 100,000 balance.');
  }

  /* —————————————————————————————————————
   * Step 3: Resynchronize account current_balance
   * For each account: current_balance = initial_balance + income - expense.
   * Accounts zeroed in Step 2 use an initial_balance of 0 for the
   * calculation (only in a live run — the DB was not actually changed
   * in dry-run, so the original value is used).
   * ————————————————————————————————————— */
  console.log('\n--- Step 3: Resynchronizing account current_balance ---');
  const accounts = await Account.find({}).lean();

  for (const acc of accounts) {
    // ── Aggregate income and expense for this account ──
    const [agg] = await Transaction.aggregate([
      {
        $match: {
          account_id: acc._id,
          is_deleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$account_id',
          income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
          expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
        },
      },
    ]);

    // ── Effective initial balance (honors Step 2 only on live runs) ──
    const initial =
      anomalousAccounts.some((a) => String(a._id) === String(acc._id)) && !isDryRun
        ? 0
        : Number(acc.initial_balance || 0);

    const income = agg?.income || 0;
    const expense = agg?.expense || 0;
    const currentBalance = Number((initial + income - expense).toFixed(2));

    console.log(
      `Account ${acc.name} (${acc._id}): initial=${initial}, income=${income}, expense=${expense} => current_balance=${currentBalance}`
    );

    // ── Persist the recalculated balance (skipped in dry-run) ──
    if (!isDryRun) {
      await Account.findByIdAndUpdate(acc._id, { $set: { current_balance: currentBalance } });
    }
  }

  /* —————————————————————————————————————
   * Step 4: Resynchronize User balances
   * user.balance = sum(income) - sum(expense) across all non-deleted
   * transactions. In a live run, transactions soft-deleted in Step 1
   * are excluded explicitly so their effect is removed from the total.
   * ————————————————————————————————————— */
  console.log('\n--- Step 4: Resynchronizing User balances ---');
  const users = await User.find({}).lean();

  for (const user of users) {
    // ── Aggregate income and expense for this user ──
    const [agg] = await Transaction.aggregate([
      {
        $match: {
          user_id: user._id,
          is_deleted: { $ne: true },
          // In a live run, explicitly exclude the just-soft-deleted ids
          // so the aggregation is deterministic even if the updateMany
          // write has not fully propagated.
          _id: { $nin: isDryRun ? [] : duplicateIds },
        },
      },
      {
        $group: {
          _id: '$user_id',
          income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
          expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
        },
      },
    ]);

    const netBalance = Number(((agg?.income || 0) - (agg?.expense || 0)).toFixed(2));
    console.log(
      `User ${user.username} (${user.email}): previous balance=${user.balance}, new calculated net=${netBalance}`
    );

    // ── Persist the recalculated balance (skipped in dry-run) ──
    if (!isDryRun) {
      await User.findByIdAndUpdate(user._id, { $set: { balance: netBalance } });
    }
  }

  // ── Done ──
  console.log(`\nMigration completed successfully (${isDryRun ? 'DRY RUN' : 'COMMITTED'}).`);
  process.exit(0);
}

// ── Entry point: run and handle failures ──
run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});