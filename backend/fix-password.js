const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect('mongodb://localhost:27017/MyCoinwise')
  .then(async () => {
    // We will just update ALL users to 'password123' so they can log in
    // Since the Mongoose hook handles the hashing automatically:
    const users = await User.find({});
    for (const u of users) {
      u.password = 'password123';
      await u.save();
    }
    console.log(`✅ Fixed! Reset ${users.length} accounts to password: password123`);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
