const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const USER_ROLES = ['jobseeker', 'employer', 'admin'];

/**
 * User Schema - Base user model for all user types
 * Handles common user properties and authentication methods
 */

const userSchema = new mongoose.Schema({
  // Basic Informatio
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters'],
    select: false, // Don't include password in queries by default
  },

  role: {
    type: String,
    enum: USER_ROLES,
    default: 'jobseeker',
    required: true,
  },
  
  // Profile Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters'],
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters'],
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number'],
  },
  profileImage: {
    type: String, // Cloudinary URL
    default: null,
  },
  profileImageDriveFileId: {
    type: String,
    default: null,
  },
  
  // Account Status
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  
  // OAuth fields
  oauthProvider: {
    type: String,
    enum: ['google'],
  },
  oauthId: {
    type: String,
  },
  
  // Email Verification
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // Password Reset
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Refresh Tokens (for JWT refresh functionality)
  refreshTokens: [{
    token: String,
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000, // 30 days
    },
  }],
  
  // Timestamps
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: Date,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

/**
 * Hash password before saving
 */
userSchema.pre('save', async function(next) {
  // Only hash the password if it exists and has been modified
  if (!this.password || !this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Compare password method
 * @param {string} candidatePassword - Password to compare
 * @returns {Promise<boolean>} True if password matches
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generate JWT access token
 * @returns {string} JWT token
 */
userSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    { 
      userId: this._id, 
      role: this.role,
      email: this.email 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

/**
 * Generate JWT refresh token
 * @returns {string} JWT refresh token
 */
userSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { userId: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );
};

/**
 * Generate email verification token
 * @returns {string} Verification token
 */
userSchema.methods.generateEmailVerificationToken = function() {
  const token = jwt.sign(
    { userId: this._id, type: 'email_verification' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  this.emailVerificationToken = token;
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return token;
};

/**
 * Generate password reset token
 * @returns {string} Reset token
 */
userSchema.methods.generatePasswordResetToken = function() {
  const token = jwt.sign(
    { userId: this._id, type: 'password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  this.passwordResetToken = token;
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  
  return token;
};

/**
 * Increment login attempts
 */
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

/**
 * Reset login attempts
 */
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() },
  });
};

/**
 * Add refresh token to user's token list
 * @param {string} token - Refresh token to add
 */
userSchema.methods.addRefreshToken = function(token) {
  this.refreshTokens.push({ token });
  return this.save();
};

/**
 * Remove refresh token from user's token list
 * @param {string} token - Refresh token to remove
 */
userSchema.methods.removeRefreshToken = function(token) {
  this.refreshTokens = this.refreshTokens.filter(t => t.token !== token);
  return this.save();
};

/**
 * Clear all refresh tokens
 */
userSchema.methods.clearAllRefreshTokens = function() {
  this.refreshTokens = [];
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
