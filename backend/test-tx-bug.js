const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('./models/User');
const Transaction = require('./models/Transaction');
mongoose.connect('mongodb://localhost:27017/MyCoinwise', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Connected to DB');
    
    // Create a dummy user
    const user = await User.create({
      username: 'Test User',
      email: 'testtx2@example.com',
      password: 'password123',
      balance: 1000
    });
    console.log('Initial user balance:', user.balance);

    // Add income transaction
    const amount = '500.50'; // simulate string from request
    const type = 'income';

    const numericAmount = Number(amount);
    const modifier = type === 'income' ? numericAmount : -numericAmount;
    
    await User.findByIdAndUpdate(user._id, { $inc: { balance: modifier } });
    
    const updatedUser = await User.findById(user._id);
    console.log('User balance after $inc:', updatedUser.balance);

    await User.deleteOne({ _id: user._id });
    mongoose.disconnect();
  });
