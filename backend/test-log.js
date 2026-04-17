const mongoose = require('mongoose');
const LoginLog = require('./models/LoginLog');

mongoose.connect('mongodb://localhost:27017/MyCoinwise')
  .then(async () => {
    try {
      await LoginLog.create({
        email: 'test@example.com',
        status: 'success',
        reason: 'login'
      });
      console.log('Success');
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  });
