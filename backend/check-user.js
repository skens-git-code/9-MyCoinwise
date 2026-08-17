require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const User = require('./models/User');

async function test() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ZenithSpend');
  const user = await User.findOne({ username: 'Sarthak Mathapati' });
  if (user) {
    console.log("Balance is:", user.balance);
  } else {
    const anyUser = await User.findOne();
    if(anyUser) console.log("Any user balance is:", anyUser.balance, "Name:", anyUser.username);
  }
  process.exit(0);
}
test();
