require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const User = require('./models/User');
async function test() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ZenithSpend');
  const user = await User.findOne({ username: 'Sarthak Mathapati' });
  if (user) console.log(user.email);
  process.exit(0);
}
test();
