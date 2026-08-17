require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');
const User = require('./models/User');

async function test() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ZenithSpend');
  const user = await User.findOne({ username: 'Sarthak Mathapati' });
  if (user) {
    const txs = await Transaction.find({ user_id: user._id });
    console.log("Found transactions:", txs.length);
    if(txs.length > 0) {
      console.log(txs.map(t => ({ amount: t.amount, type: t.type })));
    }
  }
  process.exit(0);
}
test();
