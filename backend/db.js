const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ZenithSpend';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ Successfully connected to MongoDB.');
  })
  .catch((error) => {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    console.log('💡 Note: Ensure MongoDB is running and MONGO_URI in .env is correct.');
  });

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected.');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

module.exports = mongoose;
