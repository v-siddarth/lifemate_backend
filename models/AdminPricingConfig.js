const mongoose = require('mongoose');

const planConfigSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    audience: {
      type: String,
      enum: ['employer', 'jobseeker'],
      required: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    tag: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    ctaLabel: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'Choose Plan',
    },
    highlighted: {
      type: Boolean,
      default: false,
    },
    features: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    limits: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    featureList: {
      type: [String],
      default: [],
    },
    displayFeatures: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    displayLimits: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    subscriptionFeatures: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const adminPricingConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: 'default',
    },
    plans: {
      type: [planConfigSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminPricingConfig', adminPricingConfigSchema);
