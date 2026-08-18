const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const connectToMongo = async () => {
  if (!MONGO_URI) throw new Error('MONGO_URI is required.');
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('✅ Successfully connected to MongoDB.');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);

    throw error;
  }
};

connectToMongo();

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected.');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

module.exports = mongoose;
