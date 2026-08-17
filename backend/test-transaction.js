require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ZenithSpend');
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      console.log("Transaction started successfully.");
      await session.commitTransaction();
    } catch(e) {
      console.log("Error starting transaction:", e.message);
    } finally {
      session.endSession();
    }
  } catch(e) {
    console.log("Connect error:", e.message);
  }
  process.exit(0);
}
test();
