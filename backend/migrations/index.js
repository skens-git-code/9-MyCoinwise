/**
 * One-time, versioned data migrations.
 *
 * Replaces the previous "self-healing" pattern in `server.js`, which ran a
 * `User.updateMany` UPDATE on every single boot. Migrations now run only when
 * the recorded schema version is behind, and the applied version is persisted,
 * so subsequent boots skip the work entirely.
 *
 * Adding a migration:
 *   1. Increment `LATEST_VERSION`.
 *   2. Add an `if (currentVersion < N) { ... }` block.
 *   3. Keep each block idempotent anyway — a crash between the data change and
 *      the version bump will re-run it on the next boot.
 */

const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const { repairBalances } = require('./repair-balances');

/** Key under which the applied schema version is stored. */
const SCHEMA_VERSION_KEY = 'schema_version';

/**
 * Current schema version. Bump this when adding a migration block.
 *
 *   1 — backfill household_id on legacy root accounts
 *   2 — repair balances zeroed by the missing-`date` projection bug
 */
const LATEST_VERSION = 2;

/**
 * Tiny key/value collection holding migration bookkeeping.
 * Declared here rather than in models/ because it is infrastructure, not
 * application domain data.
 */
const MetaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed },
    applied_at: { type: Date },
  },
  { collection: 'meta', versionKey: false }
);

const Meta = mongoose.models.Meta || mongoose.model('Meta', MetaSchema);

/**
 * Apply every pending migration.
 *
 * @returns {Promise<{ from: number, to: number, applied: number[] }>}
 *   The version range migrated and which migration numbers ran.
 */
async function runMigrations() {
  const record = await Meta.findOne({ key: SCHEMA_VERSION_KEY });
  const from = Number(record?.value ?? 0);

  if (from >= LATEST_VERSION) {
    logger.info(`Migrations up to date (schema v${from}).`);
    return { from, to: from, applied: [] };
  }

  logger.info(`Running migrations from schema v${from} to v${LATEST_VERSION}...`);
  const applied = [];

  if (from < 1) {
    // ── v1: backfill household_id on legacy root accounts ──
    // Each account becomes its own household. Expressed as a single
    // aggregation-pipeline update, so it runs server-side in one operation.
    const User = require('../models/User');
    const result = await User.updateMany(
      { $or: [{ household_id: null }, { household_id: { $exists: false } }] },
      [{ $set: { household_id: '$_id' } }]
    );
    logger.info(`Migration v1: backfilled household_id on ${result.modifiedCount} user(s).`);
    applied.push(1);
  }

  if (from < 2) {
    // ── v2: repair balances zeroed by the missing-`date` projection ──
    // `syncUserBalance` persisted 0 for every user whose transactions were all
    // misclassified as future-dated. Idempotent: it recomputes from source.
    const { scanned, updated, changes } = await repairBalances();
    logger.info(`Migration v2: scanned ${scanned} user(s), corrected ${updated} balance(s).`);
    for (const change of changes.slice(0, 20)) {
      logger.info(`  balance repair ${change.username}: ${change.before} -> ${change.after}`);
    }
    if (changes.length > 20) logger.info(`  ...and ${changes.length - 20} more.`);
    applied.push(2);
  }

  await Meta.updateOne(
    { key: SCHEMA_VERSION_KEY },
    { $set: { key: SCHEMA_VERSION_KEY, value: LATEST_VERSION, applied_at: new Date() } },
    { upsert: true }
  );

  logger.info(`Migrations complete (schema v${LATEST_VERSION}).`);
  return { from, to: LATEST_VERSION, applied };
}

module.exports = { runMigrations, Meta, LATEST_VERSION };
