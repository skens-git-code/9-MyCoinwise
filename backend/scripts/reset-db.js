/* —————————————————————————————————————
 * Database Reset Script
 * Safely purges user/operational collections, synchronizes all indexes,
 * and re-seeds essential static datasets (tax rule sets).
 *
 * Usage:
 *   node backend/scripts/reset-db.js
 *   npm run db:reset
 * ————————————————————————————————————— */

require('dotenv').config();
const { connectToMongo, mongoose } = require('../db');

// Models to purge
const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');
const Subscription = require('../models/Subscription');
const Event = require('../models/Event');
const WealthItem = require('../models/WealthItem');
const NetWorthHistory = require('../models/NetWorthHistory');
const Budget = require('../models/Budget');
const Account = require('../models/Account');
const Calculation = require('../models/Calculation');
const TaxProfile = require('../models/TaxProfile');
const TaxTag = require('../models/TaxTag');
const TaxPayment = require('../models/TaxPayment');
const TaxDocument = require('../models/TaxDocument');
const Session = require('../models/Session');
const TaxRuleSet = require('../models/TaxRuleSet');

const indiaRules = require('../services/taxRules/india-2024');
const usRules = require('../services/taxRules/us-federal-2024');

const USER_DATA_MODELS = [
  Transaction,
  Goal,
  Subscription,
  Event,
  WealthItem,
  NetWorthHistory,
  LoginLog,
  Session,
  Budget,
  Account,
  Calculation,
  TaxProfile,
  TaxTag,
  TaxPayment,
  TaxDocument,
  User,
];

async function resetDatabase() {
  console.log('[DB Reset] Connecting to database...');
  await connectToMongo();

  console.log('[DB Reset] Purging user data collections...');
  for (const model of USER_DATA_MODELS) {
    const result = await model.deleteMany({});
    console.log(`  - Cleared ${model.modelName}: ${result.deletedCount} documents deleted`);
  }

  console.log('[DB Reset] Synchronizing model indexes...');
  for (const model of [...USER_DATA_MODELS, TaxRuleSet]) {
    try {
      await model.syncIndexes();
      console.log(`  - Synced indexes for ${model.modelName}`);
    } catch (idxErr) {
      console.warn(`  - Warning syncing indexes for ${model.modelName}: ${idxErr.message}`);
    }
  }

  console.log('[DB Reset] Re-seeding essential tax rule sets...');
  const rules = [...indiaRules, ...usRules];
  for (const rule of rules) {
    await TaxRuleSet.updateOne(
      { rule_key: rule.rule_key },
      { $set: rule },
      { upsert: true, runValidators: true }
    );
  }
  console.log(`  - Seeded ${rules.length} tax rule sets`);

  console.log('[DB Reset] Reset completed successfully!');
  await mongoose.connection.close();
}

resetDatabase().catch(async (error) => {
  console.error('[DB Reset] Fatal error:', error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
