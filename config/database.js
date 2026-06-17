const mongoose = require('mongoose');

let connectionPromise = null;
let handlersRegistered = false;

const registerConnectionHandlers = () => {
  if (handlersRegistered) return;
  handlersRegistered = true;

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
  });

  process.once('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  });
};

/**
 * Database connection configuration
 * Handles MongoDB connection with proper error handling and connection events
 */
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required.');
  }

  registerConnectionHandlers();

  connectionPromise = mongoose
    .connect(process.env.MONGODB_URI, {
      autoIndex: process.env.NODE_ENV !== 'production',
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
    })
    .then((conn) => {
      console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
      return conn.connection;
    })
    .catch((error) => {
      connectionPromise = null;
      console.error('Database connection failed:', error.message);
      throw error;
    });

  return connectionPromise;
};

module.exports = connectDB;
