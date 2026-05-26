const mongoose = require('mongoose');

/**
 * Employer Schema - Extended user model for employers/hospitals
 * Contains healthcare organization information and hiring preferences
 */
const employerSchema = new mongoose.Schema({
  // Reference to base User model
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  
  // Organization Information
  organizationName: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
    maxlength: [200, 'Organization name cannot exceed 200 characters'],
  },
  organizationType: {
    type: String,
    required: [true, 'Organization type is required'],
    enum: [
      'Hospital',
      'Clinic',
      'Medical Center',
      'Nursing Home',
      'Diagnostic Center',
      'Pharmacy',
      'Healthcare Startup',
      'Medical Device Company',
      'Pharmaceutical Company',
      'Healthcare IT',
      'Telemedicine',
      'Rehabilitation Center',
      'Mental Health Center',
      'Dental Clinic',
      'Veterinary Clinic',
      'Government Healthcare',
      'NGO',
      'Other'
    ],
  },
  organizationTypeOther: {
    type: String,
    trim: true,
    maxlength: [120, 'Other organization type cannot exceed 120 characters'],
  },
  
  // Organization Details
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  website: {
    type: String,
    trim: true,
    match: [/^https?:\/\/.+/, 'Please enter a valid website URL'],
  },
  foundedYear: {
    type: Number,
    min: [1800, 'Founded year cannot be before 1800'],
    max: [new Date().getFullYear(), 'Founded year cannot be in the future'],
  },
  employeeCount: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'],
  },
  numberOfBeds: {
    type: Number,
    min: [0, 'Number of beds cannot be negative'],
    max: [100000, 'Number of beds cannot exceed 100000'],
  },
  
  // Contact Information
  contactPerson: {
    name: {
      type: String,
      required: [true, 'Contact person name is required'],
      trim: true,
      maxlength: [100, 'Contact person name cannot exceed 100 characters'],
    },
    designation: {
      type: String,
      required: [true, 'Contact person designation is required'],
      trim: true,
      maxlength: [100, 'Designation cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true,
      match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number'],
    },
    email: {
      type: String,
      required: [true, 'Contact email is required'],
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    },
  },
  
  // Address Information
  address: {
    street: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true,
      maxlength: [200, 'Street address cannot exceed 200 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [50, 'City name cannot exceed 50 characters'],
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      maxlength: [50, 'State name cannot exceed 50 characters'],
    },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      trim: true,
      match: [/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit pincode'],
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      maxlength: [50, 'Country name cannot exceed 50 characters'],
      default: 'India',
    },
    coordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },
  },
  
  // Healthcare Specializations
  specializations: [{
    type: String,
    trim: true,
    maxlength: [100, 'Specialization cannot exceed 100 characters'],
  }],
  
  // Services Offered
  services: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Service name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Service description cannot exceed 500 characters'],
    },
  }],
  
  // Accreditation and Certifications
  accreditations: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Accreditation name cannot exceed 100 characters'],
    },
    issuingBody: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Issuing body cannot exceed 100 characters'],
    },
    issueDate: {
      type: Date,
      required: true,
    },
    expiryDate: {
      type: Date,
      validate: {
        validator: function(value) {
          return !value || value >= this.issueDate;
        },
        message: 'Expiry date must be after issue date',
      },
    },
    certificateUrl: {
      type: String,
      trim: true,
    },
  }],

  // Regulatory and compliance documents for healthcare organizations
  employerCertificates: [{
    name: {
      type: String,
      required: true,
      trim: true,
      enum: [
        'Bombay Nursing Certificate',
        'Hospital Registration Certificate',
        'NABH Entry Level Certificate',
        'ISO Certification',
        'NABH Full Accreditation',
        'NABL Accreditation',
        'Fire Safety NOC',
        'Clinical Establishment License',
        'Biomedical Waste Authorization',
        'PCPNDT Certificate',
        'AERB License',
        'Other',
      ],
    },
    customName: {
      type: String,
      trim: true,
      maxlength: [120, 'Custom certificate name cannot exceed 120 characters'],
    },
    category: {
      type: String,
      enum: ['Mandatory', 'Optional'],
      required: true,
      default: 'Optional',
    },
    issuingBody: {
      type: String,
      trim: true,
      maxlength: [100, 'Issuing body cannot exceed 100 characters'],
    },
    issueDate: {
      type: Date,
    },
    expiryDate: {
      type: Date,
      validate: {
        validator: function(value) {
          return !value || !this.issueDate || value >= this.issueDate;
        },
        message: 'Certificate expiry date must be after issue date',
      },
    },
    documentUrl: {
      type: String,
      trim: true,
    },
    driveFileId: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [300, 'Certificate notes cannot exceed 300 characters'],
    },
  }],
  
  // Organization Images
  logo: {
    url: String,
    filename: String,
    uploadedAt: Date,
  },
  gallery: [{
    url: {
      type: String,
      required: true,
    },
    filename: String,
    caption: {
      type: String,
      trim: true,
      maxlength: [200, 'Caption cannot exceed 200 characters'],
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  
  // Verification Status
  verification: {
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    documents: [{
      type: {
        type: String,
        enum: ['Business License', 'Registration Certificate', 'Tax Certificate', 'Insurance Certificate', 'Other'],
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
      filename: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
  },
  
  // Subscription and Billing
  subscription: {
    plan: {
      type: String,
      enum: ['Free', 'Basic', 'Premium', 'Enterprise'],
      default: 'Free',
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Cancelled', 'Expired'],
      default: 'Active',
    },
    startDate: Date,
    endDate: Date,
    autoRenew: {
      type: Boolean,
      default: false,
    },
    subscriptionId: {
      type: String,
      trim: true,
    },
    planId: {
      type: String,
      trim: true,
    },
    planName: {
      type: String,
      trim: true,
    },
    userType: {
      type: String,
      enum: ['employer'],
      default: 'employer',
    },
    paymentId: {
      type: String,
      trim: true,
    },
    paymentStatus: {
      type: String,
      trim: true,
      default: 'none',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    pendingPlan: {
      type: String,
      enum: ['Free', 'Basic', 'Premium', 'Enterprise'],
      default: undefined,
    },
    features: {
      maxJobPosts: {
        type: Number,
        default: 1,
      },
      maxApplications: {
        type: Number,
        default: 10,
      },
      teamSeats: {
        type: Number,
        default: 1,
      },
      resumeDownloads: {
        type: Number,
        default: 0,
      },
      advancedSearch: {
        type: Boolean,
        default: false,
      },
      prioritySupport: {
        type: Boolean,
        default: false,
      },
      customBranding: {
        type: Boolean,
        default: false,
      },
      featuredJobPosts: {
        type: Boolean,
        default: false,
      },
      unlimitedApplications: {
        type: Boolean,
        default: false,
      },
      analyticsDashboard: {
        type: Boolean,
        default: false,
      },
      aiCandidateMatch: {
        type: Boolean,
        default: false,
      },
      teamMembers: {
        type: Boolean,
        default: false,
      },
      resumeAccess: {
        type: Boolean,
        default: false,
      },
      bulkHiringTools: {
        type: Boolean,
        default: false,
      },
    },
    capabilities: {
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
    },
    razorpay: {
      provider: {
        type: String,
        default: 'razorpay',
      },
      planId: {
        type: String,
        trim: true,
      },
      subscriptionId: {
        type: String,
        trim: true,
      },
      status: {
        type: String,
        trim: true,
      },
      shortUrl: {
        type: String,
        trim: true,
      },
      currentStart: Date,
      currentEnd: Date,
      chargeAt: Date,
      endAt: Date,
      lastPaymentId: {
        type: String,
        trim: true,
      },
      lastInvoiceId: {
        type: String,
        trim: true,
      },
      lastWebhookEventId: {
        type: String,
        trim: true,
      },
      lastWebhookAt: Date,
    },
  },
  
  // Hiring Preferences
  hiringPreferences: {
    preferredExperience: {
      min: {
        type: Number,
        min: 0,
        max: 20,
      },
      max: {
        type: Number,
        min: 0,
        max: 50,
      },
    },
    preferredLocations: [{
      city: {
        type: String,
        required: true,
        trim: true,
        maxlength: [50, 'City name cannot exceed 50 characters'],
      },
      state: {
        type: String,
        required: true,
        trim: true,
        maxlength: [50, 'State name cannot exceed 50 characters'],
      },
    }],
    hiringProcess: {
      type: String,
      enum: ['Quick', 'Standard', 'Comprehensive'],
      default: 'Standard',
    },
    responseTime: {
      type: String,
      enum: ['Same day', '1-2 days', '3-5 days', '1 week', 'No preference'],
      default: '3-5 days',
    },
  },
  
  // Statistics
  stats: {
    totalJobPosts: {
      type: Number,
      default: 0,
    },
    activeJobPosts: {
      type: Number,
      default: 0,
    },
    totalApplications: {
      type: Number,
      default: 0,
    },
    totalHires: {
      type: Number,
      default: 0,
    },
    profileViews: {
      type: Number,
      default: 0,
    },
  },
  
  // Settings
  settings: {
    emailNotifications: {
      newApplication: {
        type: Boolean,
        default: true,
      },
      applicationUpdate: {
        type: Boolean,
        default: true,
      },
      jobPostExpiry: {
        type: Boolean,
        default: true,
      },
      subscriptionReminder: {
        type: Boolean,
        default: true,
      },
    },
    privacySettings: {
      showContactInfo: {
        type: Boolean,
        default: true,
      },
      showOrganizationDetails: {
        type: Boolean,
        default: true,
      },
      allowDirectMessages: {
        type: Boolean,
        default: true,
      },
    },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for full organization name
employerSchema.virtual('fullOrganizationName').get(function() {
  return this.organizationName;
});

// Virtual for full address
employerSchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  return `${addr.street}, ${addr.city}, ${addr.state} ${addr.pincode}, ${addr.country}`;
});

// Index for better query performance
employerSchema.index({ user: 1 });
employerSchema.index({ organizationName: 1 });
employerSchema.index({ organizationType: 1 });
employerSchema.index({ 'address.city': 1 });
employerSchema.index({ 'address.state': 1 });
employerSchema.index({ 'specializations': 1 });
employerSchema.index({ 'verification.isVerified': 1 });
employerSchema.index({ 'subscription.plan': 1 });
employerSchema.index(
  { 'subscription.razorpay.subscriptionId': 1 },
  { unique: true, sparse: true }
);

/**
 * Check if employer can post more jobs based on subscription
 */
employerSchema.methods.canPostJob = function() {
  const maxJobPosts = Number(this.subscription?.features?.maxJobPosts ?? 1);
  return this.stats.activeJobPosts < maxJobPosts;
};

/**
 * Check if employer can receive more applications based on subscription
 */
employerSchema.methods.canReceiveApplications = function() {
  const features = this.subscription?.features || {};
  if (features.unlimitedApplications === true) return true;
  const maxApplications = Number(features.maxApplications ?? 10);
  return this.stats.totalApplications < maxApplications;
};

/**
 * Update job post statistics
 */
employerSchema.methods.updateJobStats = function(increment = 1) {
  this.stats.totalJobPosts += increment;
  return this.save();
};

/**
 * Update active job post statistics
 */
employerSchema.methods.updateActiveJobStats = function(increment = 1) {
  this.stats.activeJobPosts += increment;
  return this.save();
};

/**
 * Recalculate active job posts from database (for accuracy)
 * Call this method to sync the stat with actual active jobs in DB
 */
employerSchema.methods.syncActiveJobStats = async function() {
  try {
    const Job = require('./Job');
    const activeCount = await Job.countDocuments({
      employer: this._id,
      status: 'Active'
    });
    this.stats.activeJobPosts = activeCount;
    return this.save();
  } catch (err) {
    console.error('Failed to sync active job stats:', err);
    throw err;
  }
};

/**
 * Recalculate all stats from database (for full accuracy)
 * Syncs totalJobPosts, activeJobPosts, totalApplications, and totalHires
 */
employerSchema.methods.syncAllStats = async function() {
  try {
    const Job = require('./Job');
    const Application = require('./Application');
    
    const totalJobs = await Job.countDocuments({ employer: this._id });
    const activeJobs = await Job.countDocuments({
      employer: this._id,
      status: 'Active'
    });
    const totalApps = await Application.countDocuments({ employer: this._id });
    const totalHires = await Application.countDocuments({
      employer: this._id,
      status: 'Offered'
    });
    
    this.stats.totalJobPosts = totalJobs;
    this.stats.activeJobPosts = activeJobs;
    this.stats.totalApplications = totalApps;
    this.stats.totalHires = totalHires;
    return this.save();
  } catch (err) {
    console.error('Failed to sync all stats:', err);
    throw err;
  }
};

/**
 * Update application statistics
 */
employerSchema.methods.updateApplicationStats = function(increment = 1) {
  this.stats.totalApplications += increment;
  return this.save();
};

/**
 * Update hire statistics
 */
employerSchema.methods.updateHireStats = function(increment = 1) {
  this.stats.totalHires += increment;
  return this.save();
};

module.exports = mongoose.model('Employer', employerSchema);
