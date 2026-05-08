const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { unauthorizedResponse, forbiddenResponse } = require('../utils/response');

/**
 * Authentication middleware to verify JWT tokens
 * Checks if user is authenticated and adds user info to request
 */
const authenticate = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for token in cookies
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // If no token found
    if (!token) {
      return unauthorizedResponse(res, 'Access denied. No token provided.');
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return unauthorizedResponse(res, 'Token is valid but user no longer exists.');
      }

      // Check if user is active
      if (!user.isActive) {
        return forbiddenResponse(res, 'Account is deactivated.');
      }

      // Check if user is blocked
      if (user.isBlocked) {
        return forbiddenResponse(res, 'Account is blocked.');
      }

      // Check if account is locked
      if (user.isLocked) {
        return forbiddenResponse(res, 'Account is temporarily locked due to multiple failed login attempts.');
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return unauthorizedResponse(res, 'Token has expired.');
      } else if (error.name === 'JsonWebTokenError') {
        return unauthorizedResponse(res, 'Invalid token.');
      } else {
        return unauthorizedResponse(res, 'Token verification failed.');
      }
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return unauthorizedResponse(res, 'Authentication failed.');
  }
};

/**
 * Authorization middleware to check user roles
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return unauthorizedResponse(res, 'Authentication required.');
    }

    if (!roles.includes(req.user.role)) {
      return forbiddenResponse(res, `Access denied. Required role: ${roles.join(' or ')}`);
    }

    next();
  };
};

/**
 * Middleware to check if user is jobseeker
 */
const requireJobSeeker = authorize('jobseeker');

/**
 * Middleware to check if user is employer
 */
const requireEmployer = authorize('employer');

/**
 * Middleware to check if user is admin
 */
const requireAdmin = authorize('admin');

/**
 * Middleware to check if user is employer or admin
 */
const requireEmployerOrAdmin = authorize('employer', 'admin');

/**
 * Middleware to check if user is jobseeker or admin
 */
const requireJobSeekerOrAdmin = authorize('jobseeker', 'admin');

/**
 * Optional authentication middleware
 * Similar to authenticate but doesn't fail if no token is provided
 * Useful for endpoints that work for both authenticated and anonymous users
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for token in cookies
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // If no token found, continue without authentication
    if (!token) {
      req.user = null;
      return next();
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive && !user.isBlocked && !user.isLocked) {
        req.user = user;
      } else {
        req.user = null;
      }

      next();
    } catch {
      // If token is invalid, continue without authentication
      req.user = null;
      next();
    }
  } catch (error) {
    console.error('Optional authentication error:', error);
    req.user = null;
    next();
  }
};

/**
 * Middleware to check if user owns the resource or is admin
 * @param {string} resourceUserIdField - Field name that contains user ID in the resource
 */
const requireOwnershipOrAdmin = (resourceUserIdField = 'user') => {
  return (req, res, next) => {
    if (!req.user) {
      return unauthorizedResponse(res, 'Authentication required.');
    }

    // Admin can access any resource
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user owns the resource
    const resourceUserId = req.resource ? req.resource[resourceUserIdField] : req.params.userId;
    
    if (resourceUserId && resourceUserId.toString() !== req.user._id.toString()) {
      return forbiddenResponse(res, 'Access denied. You can only access your own resources.');
    }

    next();
  };
};

/**
 * Middleware to check if user has verified email
 */
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return unauthorizedResponse(res, 'Authentication required.');
  }

  if (!req.user.isEmailVerified) {
    return forbiddenResponse(res, 'Email verification required. Please verify your email address.');
  }

  next();
};

/**
 * Middleware to check if employer is verified
 */
const requireEmployerVerification = async (req, res, next) => {
  try {
    if (!req.user) {
      return unauthorizedResponse(res, 'Authentication required.');
    }

    if (req.user.role !== 'employer') {
      return forbiddenResponse(res, 'Access denied. Employer role required.');
    }

    // Get employer details
    const Employer = require('../models/Employer');
    const employer = await Employer.findOne({ user: req.user._id });

    if (!employer) {
      return forbiddenResponse(res, 'Employer profile not found.');
    }

    if (!employer.verification.isVerified) {
      return forbiddenResponse(res, 'Employer verification required. Please complete your verification process.');
    }

    req.employer = employer;
    next();
  } catch (error) {
    console.error('Employer verification check error:', error);
    return forbiddenResponse(res, 'Verification check failed.');
  }
};

module.exports = {
  authenticate,
  authorize,
  requireJobSeeker,
  requireEmployer,
  requireAdmin,
  requireEmployerOrAdmin,
  requireJobSeekerOrAdmin,
  optionalAuth,
  requireOwnershipOrAdmin,
  requireEmailVerification,
  requireEmployerVerification,
};
