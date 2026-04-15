const mongoose = require('./db');
const Goal = require('./models/Goal');

async function migrate() {
  console.log('Migrating Goals to fix Decimal128 NaN issues...');
  try {
    // We get the raw collection to avoid Mongoose casting bugs while reading
    const collection = mongoose.connection.collection('goals');
    const goals = await collection.find({}).toArray();
    let updatedCount = 0;

    for (let goal of goals) {
      let needsUpdate = false;
      let updates = {};

      // Check target
      if (goal.target && goal.target._bsontype === 'Decimal128') {
        updates.target = parseFloat(goal.target.toString());
        needsUpdate = true;
      } else if (typeof goal.target === 'string') {
        updates.target = parseFloat(goal.target);
        needsUpdate = true;
      }

      // Check saved
      if (goal.saved && goal.saved._bsontype === 'Decimal128') {
        updates.saved = parseFloat(goal.saved.toString());
        needsUpdate = true;
      } else if (typeof goal.saved === 'string') {
        updates.saved = parseFloat(goal.saved);
        needsUpdate = true;
      }

      // Check auto_save_amount
      if (goal.auto_save_amount && goal.auto_save_amount._bsontype === 'Decimal128') {
        updates.auto_save_amount = parseFloat(goal.auto_save_amount.toString());
        needsUpdate = true;
      } else if (typeof goal.auto_save_amount === 'string') {
        updates.auto_save_amount = parseFloat(goal.auto_save_amount);
        needsUpdate = true;
      }

      if (needsUpdate) {
        await collection.updateOne({ _id: goal._id }, { $set: updates });
        updatedCount++;
      }
    }

    console.log(`Migration completed! Updated ${updatedCount} goals.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

mongoose.connection.once('open', migrate);
