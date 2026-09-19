const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectToMongo = async ({ retries = 4 } = {}) => {
  if (!MONGO_URI) throw new Error('MONGO_URI is required.');

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 8000,
        heartbeatFrequencyMS: 10000,
        maxPoolSize: 10,
        minPoolSize: 1
      });
      console.log('✅ Successfully connected to MongoDB.');
      return;
    } catch (error) {
      console.error(`❌ Failed to connect to MongoDB (attempt ${attempt + 1}/${retries + 1}):`, error.message);
      if (attempt === retries) throw error;
      await wait(Math.min(1000 * (2 ** attempt), 8000));
    }
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected.');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB connection restored.');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

module.exports = { mongoose, connectToMongo };
