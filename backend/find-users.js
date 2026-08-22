const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function findUsers() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({}, 'email username');
  console.log('Users in DB:', users);
  mongoose.disconnect();
}
findUsers();
