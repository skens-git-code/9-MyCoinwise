/* —————————————————————————————————————
 * Tax Rule Set Seed Script
 * Idempotently upserts the built-in India and US tax rule sets
 * into MongoDB using `rule_key` as the unique identifier.
 *
 * Usage:
 *   node <path-to>/seedTaxRules.js
 *
 * Safe to re-run — existing rules with matching `rule_key` are
 * updated, new ones are inserted.
 * ————————————————————————————————————— */

// ── Load environment and dependencies ──
require('dotenv').config();
const { connectToMongo, mongoose } = require('../db');
const TaxRuleSet = require('../models/TaxRuleSet');
const indiaRules = require('../services/taxRules/india-2024');
const usRules = require('../services/taxRules/us-federal-2024');

// ── Main seed routine ──
async function seed() {
  // ── Connect to MongoDB ──
  await connectToMongo();

  // ── Merge India and US rule sets into a single list ──
  const rules = [...indiaRules, ...usRules];

  // ── Upsert each rule set (idempotent by rule_key) ──
  for (const rule of rules) {
    await TaxRuleSet.updateOne(
      { rule_key: rule.rule_key },
      { $set: rule },
      { upsert: true, runValidators: true }
    );
  }

  console.log(`Seeded ${rules.length} tax rule sets.`);

  // ── Close the DB connection cleanly ──
  await mongoose.connection.close();
}

// ── Entry point: run and surface failures ──
seed().catch(async (error) => {
  console.error(error);
  await mongoose.connection.close().catch(() => {});
  process.exitCode = 1;
});