const mongoose = require('mongoose');
require('dotenv').config();

async function dropIndex() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const collection = mongoose.connection.collection('transactions');
    await collection.dropIndex('user_id_1_recurrence_instance_key_1');
    console.log('Index dropped successfully');
  } catch (err) {
    console.log('Error dropping index:', err.message);
  } finally {
    mongoose.disconnect();
  }
}

dropIndex();
