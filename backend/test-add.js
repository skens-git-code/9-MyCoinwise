require('dotenv').config({ path: __dirname + '/backend/.env' });
const mongoose = require('mongoose');
const User = require('./models/User');
const Transaction = require('./models/Transaction');

async function test() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ZenithSpend');
  console.log("Connected to MongoDB.");

  let user = await User.findOne();
  if (!user) {
    user = await User.create({ username: 'Test', email: 'test@example.com', password: 'password123' });
    console.log("Created test user:", user._id);
  }

  console.log("Initial Balance:", user.balance);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const txData = { user_id: user._id, type: 'income', category: 'Job', amount: 5000, note: 'Test' };
    const [transaction] = await Transaction.create([txData], { session });
    
    const modifier = 5000;
    const updateRes = await User.findByIdAndUpdate(user._id, { $inc: { balance: modifier } }, { session, new: true });
    
    console.log("Update result inside session:", updateRes.balance);

    await session.commitTransaction();
    console.log("Transaction committed.");
  } catch (error) {
    await session.abortTransaction();
    console.error("Transaction aborted due to error:", error);
  } finally {
    session.endSession();
  }

  const updatedUser = await User.findById(user._id);
  console.log("Final Balance in DB:", updatedUser.balance);
  
  process.exit(0);
}

test();
