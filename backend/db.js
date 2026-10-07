/**
 * MongoDB connection helper.
 *
 * Responsibilities:
 *  - Load `.env` from this directory (not the process CWD) before reading config.
 *  - Connect with bounded exponential-backoff retries.
 *  - Attach connection-state listeners that log via the shared `logger`.
 *
 * Configuration is read from `config/env.js`, which is responsible for loading
 * and validating `.env`.
 */

const mongoose = require('mongoose');
const { logger } = require('./utils/logger');
// config/env.js loads dotenv from an absolute path and validates every variable,
// so the backend boots correctly regardless of the directory it is started from.
const { config } = require('./config/env');

/** @param {number} ms Milliseconds to sleep. @returns {Promise<void>} */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connect to MongoDB, retrying with exponential backoff.
 *
 * Side effects: opens the shared mongoose connection and logs each attempt.
 *
 * @param {{ retries?: number }} [options] Maximum number of retries after the
 *   first attempt (default 4, i.e. up to 5 attempts total).
 * @returns {Promise<void>} Resolves once connected.
 * @throws {Error} If `MONGO_URI` is unset, or if the final attempt fails.
 */
const connectToMongo = async ({ retries = 4 } = {}) => {
  const mongoUri = config.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI is required.');

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 8000,
        heartbeatFrequencyMS: 10000,
        maxPoolSize: 10,
        minPoolSize: 1,
      });
      logger.info('✅ Successfully connected to MongoDB.');
      return;
    } catch (error) {
      logger.error(`❌ Failed to connect to MongoDB (attempt ${attempt + 1}/${retries + 1}): ${error.message}`);
      if (attempt === retries) throw error;
      await wait(Math.min(1000 * (2 ** attempt), 8000));
    }
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️  MongoDB disconnected.');
});

mongoose.connection.on('reconnected', () => {
  logger.info('✅ MongoDB connection restored.');
});

mongoose.connection.on('error', (err) => {
  logger.error(`❌ MongoDB connection error: ${err.message}`);
});

module.exports = { mongoose, connectToMongo };
