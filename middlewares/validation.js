const { validationErrorResponse } = require('../utils/response');

/**
 * Validation middleware functions
 * Validates request data before processing
 */

/**
 * Generic validation middleware
 * @param {Function} validator - Validation function
 * @param {string} errorMessage - Error message for validation failure
 */
const validate = (validator, errorMessage = 'Validation failed') => {
  return (req, res, next) => {
    const { error } = validator(req.body);
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      return validationErrorResponse(res, errors);
    }
    next();
  };
};

/**
 * Registration validation
 */
const validateRegistration = (req, res, next) => {
  const { email, password, firstName, lastName, role, phone } = req.body;
  const errors = [];

  // Email validation
  if (!email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
    errors.push({ field: 'email', message: 'Please enter a valid email address' });
  }

  // Password validation
  if (!password) {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (password.length < 6) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters long' });
  } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    errors.push({ field: 'password', message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' });
  }

  // First name validation
  if (!firstName) {
    errors.push({ field: 'firstName', message: 'First name is required' });
  } else if (firstName.trim().length < 2) {
    errors.push({ field: 'firstName', message: 'First name must be at least 2 characters long' });
  } else if (firstName.trim().length > 50) {
    errors.push({ field: 'firstName', message: 'First name cannot exceed 50 characters' });
  }

  // Last name validation
  if (!lastName) {
    errors.push({ field: 'lastName', message: 'Last name is required' });
  } else if (lastName.trim().length < 2) {
    errors.push({ field: 'lastName', message: 'Last name must be at least 2 characters long' });
  } else if (lastName.trim().length > 50) {
    errors.push({ field: 'lastName', message: 'Last name cannot exceed 50 characters' });
  }

  // Role validation
  if (!role) {
    errors.push({ field: 'role', message: 'Role is required' });
  } else if (!['jobseeker', 'employer'].includes(role)) {
    errors.push({ field: 'role', message: 'Role must be either jobseeker or employer' });
  }

  // Phone validation (optional)
  if (phone && !/^[\+]?[1-9][\d]{0,15}$/.test(phone)) {
    errors.push({ field: 'phone', message: 'Please enter a valid phone number' });
  }

  if (errors.length > 0) {
    return validationErrorResponse(res, errors);
  }

  next();
};

/**
 * Login validation
 */
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  // Email validation
  if (!email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
    errors.push({ field: 'email', message: 'Please enter a valid email address' });
  }

  // Password validation
  if (!password) {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) {
    return validationErrorResponse(res, errors);
  }

  next();
};

/**
 * OTP request validation
 */
const validateOtpRequest = (req, res, next) => {
  const { email } = req.body;
  const errors = [];

  if (!email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
    errors.push({ field: 'email', message: 'Please enter a valid email address' });
  }

  if (errors.length > 0) {
    return validationErrorResponse(res, errors);
  }

  next();
};

/**
 * OTP verification validation
 */
const validateOtpVerification = (req, res, next) => {
  const { email, otp } = req.body;
  const errors = [];

  if (!email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
    errors.push({ field: 'email', message: 'Please enter a valid email address' });
  }

  if (!otp) {
    errors.push({ field: 'otp', message: 'OTP is required' });
  } else if (!/^\d{6}$/.test(String(otp))) {
    errors.push({ field: 'otp', message: 'OTP must be a 6-digit number' });
  }

  if (errors.length > 0) {
    return validationErrorResponse(res, errors);
  }

  next();
};

/**
 * Password reset validation
 */
const validatePasswordReset = (req, res, next) => {
  const { password } = req.body;
  const errors = [];

  // Password validation
  if (!password) {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (password.length < 6) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters long' });
  } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    errors.push({ field: 'password', message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' });
  }

  if (errors.length > 0) {
    return validationErrorResponse(res, errors);
  }

  next();
};

/**
 * Password change validation
 */
const validatePasswordChange = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const errors = [];

  // Current password validation
  if (!currentPassword) {
    errors.push({ field: 'currentPassword', message: 'Current password is required' });
  }

  // New password validation
  if (!newPassword) {
    errors.push({ field: 'newPassword', message: 'New password is required' });
  } else if (newPassword.length < 6) {
    errors.push({ field: 'newPassword', message: 'New password must be at least 6 characters long' });
  } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
    errors.push({ field: 'newPassword', message: 'New password must contain at least one uppercase letter, one lowercase letter, and one number' });
  }

  // Check if new password is different from current password
  if (currentPassword && newPassword && currentPassword === newPassword) {
    errors.push({ field: 'newPassword', message: 'New password must be different from current password' });
  }

  if (errors.length > 0) {
    return validationErrorResponse(res, errors);
  }

  next();
};

/**
 * Profile update validation
 */
const validateProfileUpdate = (req, res, next) => {
  const { firstName, lastName, phone } = req.body;
  const errors = [];

  // First name validation
  if (firstName !== undefined) {
    if (!firstName || firstName.trim().length < 2) {
      errors.push({ field: 'firstName', message: 'First name must be at least 2 characters long' });
    } else if (firstName.trim().length > 50) {
      errors.push({ field: 'firstName', message: 'First name cannot exceed 50 characters' });
    }
  }

  // Last name validation
  if (lastName !== undefined) {
    if (!lastName || lastName.trim().length < 2) {
      errors.push({ field: 'lastName', message: 'Last name must be at least 2 characters long' });
    } else if (lastName.trim().length > 50) {
      errors.push({ field: 'lastName', message: 'Last name cannot exceed 50 characters' });
    }
  }

  // Phone validation (optional)
  if (phone !== undefined && phone && !/^[\+]?[1-9][\d]{0,15}$/.test(phone)) {
    errors.push({ field: 'phone', message: 'Please enter a valid phone number' });
  }

  if (errors.length > 0) {
    return validationErrorResponse(res, errors);
  }

  next();
};

/**
 * Job post validation
 */
const validateJobPost = (req, res, next) => {
  const { title, description, location, salary, experience, jobType, specializations } = req.body;
  const errors = [];

  // Title validation
  if (!title) {
    errors.push({ field: 'title', message: 'Job title is required' });
  } else if (title.trim().length < 5) {
    errors.push({ field: 'title', message: 'Job title must be at least 5 characters long' });
  } else if (title.trim().length > 100) {
    errors.push({ field: 'title', message: 'Job title cannot exceed 100 characters' });
  }

  // Description validation
  if (!description) {
    errors.push({ field: 'description', message: 'Job description is required' });
  } else if (description.trim().length < 50) {
    errors.push({ field: 'description', message: 'Job description must be at least 50 characters long' });
  } else if (description.trim().length > 2000) {
    errors.push({ field: 'description', message: 'Job description cannot exceed 2000 characters' });
  }

  // Location validation
  if (!location) {
    errors.push({ field: 'location', message: 'Job location is required' });
  } else if (location.trim().length < 3) {
    errors.push({ field: 'location', message: 'Location must be at least 3 characters long' });
  }

  // Salary validation
  if (salary) {
    if (salary.min && salary.min < 0) {
      errors.push({ field: 'salary.min', message: 'Minimum salary cannot be negative' });
    }
    if (salary.max && salary.max < 0) {
      errors.push({ field: 'salary.max', message: 'Maximum salary cannot be negative' });
    }
    if (salary.min && salary.max && salary.min > salary.max) {
      errors.push({ field: 'salary', message: 'Minimum salary cannot be greater than maximum salary' });
    }
  }

  // Experience validation
  if (experience && (experience < 0 || experience > 50)) {
    errors.push({ field: 'experience', message: 'Experience must be between 0 and 50 years' });
  }

  // Job type validation
  if (jobType && !['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'].includes(jobType)) {
    errors.push({ field: 'jobType', message: 'Invalid job type' });
  }

  // Specializations validation
  if (specializations && (!Array.isArray(specializations) || specializations.length === 0)) {
    errors.push({ field: 'specializations', message: 'At least one specialization is required' });
  }

  if (errors.length > 0) {
    return validationErrorResponse(res, errors);
  }

  next();
};

/**
 * Application validation
 */
const validateApplication = (req, res, next) => {
  const { coverLetter } = req.body;
  const errors = [];

  // Cover letter validation (optional)
  if (coverLetter && coverLetter.trim().length > 1000) {
    errors.push({ field: 'coverLetter', message: 'Cover letter cannot exceed 1000 characters' });
  }

  if (errors.length > 0) {
    return validationErrorResponse(res, errors);
  }

  next();
};

module.exports = {
  validate,
  validateRegistration,
  validateLogin,
  validateOtpRequest,
  validateOtpVerification,
  validatePasswordReset,
  validatePasswordChange,
  validateProfileUpdate,
  validateJobPost,
  validateApplication,
};
