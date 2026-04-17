const mongoose = require('mongoose');
const LoginLog = require('./models/LoginLog');

mongoose.connect('mongodb://localhost:27017/MyCoinwise')
  .then(async () => {
    const count = await LoginLog.countDocuments();
    console.log(`LoginLog count: ${count}`);
    process.exit(0);
  });
