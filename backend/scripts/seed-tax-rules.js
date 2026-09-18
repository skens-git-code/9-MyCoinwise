require('dotenv').config();
const { connectToMongo, mongoose } = require('../db');
const TaxRuleSet = require('../models/TaxRuleSet');
const indiaRules = require('../services/taxRules/india-2024');
const usRules = require('../services/taxRules/us-federal-2024');

async function seed() {
  await connectToMongo();
  const rules = [...indiaRules, ...usRules];
  for (const rule of rules) {
    await TaxRuleSet.updateOne({ rule_key: rule.rule_key }, { $set: rule }, { upsert: true, runValidators: true });
  }
  console.log(`Seeded ${rules.length} tax rule sets.`);
  await mongoose.connection.close();
}

seed().catch(async (error) => {
  console.error(error);
  await mongoose.connection.close().catch(() => {});
  process.exitCode = 1;
});
