const mongoose = require('mongoose');

const subscriptionEventLogSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    subscriptionId: {
      type: String,
      trim: true,
    },
    payload: {
      type: Object,
      default: {},
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SubscriptionEventLog', subscriptionEventLogSchema);
