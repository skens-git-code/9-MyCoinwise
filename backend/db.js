const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/MyCoinwise';
const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/MyCoinwise';

const connectToMongo = async () => {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('✅ Successfully connected to MongoDB.');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);

    if (MONGO_URI === LOCAL_MONGO_URI) {
      console.log('💡 Note: Ensure MongoDB is running on port 27017.');
      return;
    }

    console.log('↪️  Falling back to local MongoDB at 127.0.0.1:27017.');
    try {
      await mongoose.connect(LOCAL_MONGO_URI, { serverSelectionTimeoutMS: 8000 });
      console.log('✅ Successfully connected to local MongoDB.');
    } catch (localError) {
      console.error('❌ Local MongoDB fallback failed:', localError.message);
      console.log('💡 Note: Ensure MongoDB is running on port 27017.');
    }
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
