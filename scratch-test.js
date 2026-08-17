require('dotenv').config({ path: 'backend/.env' });
const mongoose = require('mongoose');
const User = require('./backend/models/User');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to", process.env.MONGO_URI);
  
  const user = await User.findOne();
  if (!user) {
    console.log("No user found.");
    process.exit(1);
  }
  
  console.log(`User: ${user.username}, Balance: ${user.balance}`);
  
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    console.log("Transaction started...");
    
    await User.findByIdAndUpdate(user._id, { $inc: { balance: 10 } }, { session });
    
    await session.commitTransaction();
    console.log("Transaction committed.");
  } catch (err) {
    console.error("Error with transaction:", err.message);
  } finally {
    session.endSession();
  }
  
  const updatedUser = await User.findById(user._id);
  console.log(`Updated Balance: ${updatedUser.balance}`);
  
  process.exit(0);
}
test();
