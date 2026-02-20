const crypto = require('crypto');
const User = require('../models/User');
const Otp = require('../models/Otp');
const JobSeeker = require('../models/JobSeeker');
const Employer = require('../models/Employer');
const {
  generateTokens,
  verifyRefreshToken,
  verifyOAuthExchangeToken,
  verifyOAuthPendingToken,
} = require('../utils/jwt');
const {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse,
} = require('../utils/response');
const { getRefreshCookieOptions, getRefreshCookieClearOptions } = require('../utils/cookies');
const emailService = require('../services/emailService');

const buildUserResponse = (user) => ({
  id: user._id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  phone: user.phone,
  profileImage: user.profileImage,
  isEmailVerified: user.isEmailVerified,
  lastLogin: user.lastLogin,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
};

const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', getRefreshCookieClearOptions());
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const createOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

const hashOtp = (email, otp, purpose) => {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'lifemate-otp-secret';
  return crypto.createHash('sha256').update(`${email}:${purpose}:${otp}:${secret}`).digest('hex');
};

const validateStrongPassword = (password) => {
  if (!password) return 'Password is required';
  if (password.length < 6) return 'Password must be at least 6 characters long';
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    return 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
  }
  return null;
};

const issueOtp = async ({ email, purpose, firstName }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const existingOtp = await Otp.findOne({ email: normalizedEmail, purpose });
  const now = Date.now();

  if (existingOtp && existingOtp.lastSentAt && now - existingOtp.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const secondsRemaining = Math.ceil(
      (OTP_RESEND_COOLDOWN_MS - (now - existingOtp.lastSentAt.getTime())) / 1000
    );
    const error = new Error(`Please wait ${secondsRemaining} seconds before requesting a new OTP.`);
    error.statusCode = 429;
    throw error;
  }

  const otp = createOtpCode();
  const otpHash = hashOtp(normalizedEmail, otp, purpose);
  const expiresAt = new Date(now + OTP_TTL_MS);

  let deliveredViaEmail = true;
  try {
    await emailService.sendOtpEmail(normalizedEmail, firstName, otp, purpose);
  } catch (error) {
    const allowDevOtpFallback =
      process.env.NODE_ENV !== 'production' && String(process.env.OTP_DEV_FALLBACK || '').toLowerCase() === 'true';

    if (!allowDevOtpFallback) {
      throw error;
    }

    deliveredViaEmail = false;
    console.warn('OTP email delivery failed, using development fallback mode.');
    console.warn(`DEV_OTP (${purpose}) for ${normalizedEmail}: ${otp}`);
  }

  await Otp.findOneAndUpdate(
    { email: normalizedEmail, purpose },
    {
      $set: {
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(now),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { deliveredViaEmail };
};

const verifyOtpRecord = async ({ email, purpose, otp }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const otpRecord = await Otp.findOne({ email: normalizedEmail, purpose });

  if (!otpRecord) {
    return { success: false, message: 'Invalid or expired OTP.' };
  }

  if (otpRecord.expiresAt.getTime() <= Date.now()) {
    await Otp.deleteOne({ _id: otpRecord._id });
    return { success: false, message: 'OTP has expired. Please request a new one.' };
  }

  if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: otpRecord._id });
    return { success: false, message: 'OTP verification failed too many times. Please request a new OTP.' };
  }

  const expectedHash = hashOtp(normalizedEmail, otp, purpose);
  if (otpRecord.otpHash !== expectedHash) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    return { success: false, message: 'Invalid OTP.' };
  }

  await Otp.deleteOne({ _id: otpRecord._id });
  return { success: true };
};

const resolvePostLoginPath = async (user) => {
  if (user.role === 'employer') {
    const employerProfileExists = await Employer.exists({ user: user._id });
    return employerProfileExists ? '/dashboard/employee/jobs' : '/dashboard/employee/profile/create';
  }
  if (user.role === 'admin') {
    return '/dashboard/admin';
  }
  return '/dashboard/jobseeker';
};

const sendRegistrationOtp = async (req, res) => {
  try {
    const { email, firstName } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return errorResponse(res, 400, 'User already exists with this email address.');
    }

    try {
      const otpResult = await issueOtp({ email: normalizedEmail, purpose: 'register', firstName });
      const message = otpResult.deliveredViaEmail
        ? 'OTP sent to your email address.'
        : 'OTP generated in development fallback mode. Check backend logs.';
      return successResponse(res, 200, message);
    } catch (otpError) {
      if (otpError.statusCode === 429) {
        return errorResponse(res, 429, otpError.message);
      }
      if (otpError.code === 'EAUTH') {
        return errorResponse(
          res,
          500,
          'Email service authentication failed. Please verify EMAIL_USER/EMAIL_PASS configuration.'
        );
      }
      console.error('Registration OTP send error:', otpError);
      return errorResponse(res, 500, 'Failed to send OTP. Please try again.');
    }
  } catch (error) {
    console.error('Registration OTP error:', error);
    return errorResponse(res, 500, 'Failed to process OTP request. Please try again.');
  }
};

const verifyRegistrationOtp = async (req, res) => {
  try {
    const { email, otp, password, firstName, lastName, role, phone } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return errorResponse(res, 400, 'User already exists with this email address.');
    }

    const otpResult = await verifyOtpRecord({ email: normalizedEmail, purpose: 'register', otp });
    if (!otpResult.success) {
      return errorResponse(res, 400, otpResult.message);
    }

    const user = await User.create({
      email: normalizedEmail,
      password,
      firstName,
      lastName,
      role,
      phone,
    });

    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    if (role === 'jobseeker') {
      await JobSeeker.create({ user: user._id });
    }

    try {
      await emailService.sendVerificationEmail(user.email, verificationToken, user.firstName);
    } catch (emailError) {
      console.error('Verification email sending failed:', emailError);
    }

    const tokens = generateTokens(user._id, user.role);
    await user.addRefreshToken(tokens.refreshToken);
    setRefreshTokenCookie(res, tokens.refreshToken);
    const nextPath = await resolvePostLoginPath(user);

    return successResponse(
      res,
      201,
      'User registered successfully. Please check your email for verification.',
      {
        user: buildUserResponse(user),
        accessToken: tokens.accessToken,
        nextPath,
      }
    );
  } catch (error) {
    console.error('Registration OTP verification error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return validationErrorResponse(res, errors);
    }

    return errorResponse(res, 500, 'Registration failed. Please try again.');
  }
};

const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 400, 'User already exists with this email address.');
    }

    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      role,
      phone,
    });

    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    if (role === 'jobseeker') {
      await JobSeeker.create({ user: user._id });
    }

    try {
      await emailService.sendVerificationEmail(user.email, verificationToken, user.firstName);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    const tokens = generateTokens(user._id, user.role);
    await user.addRefreshToken(tokens.refreshToken);
    setRefreshTokenCookie(res, tokens.refreshToken);
    const nextPath = await resolvePostLoginPath(user);

    return successResponse(
      res,
      201,
      'User registered successfully. Please check your email for verification.',
      {
        user: buildUserResponse(user),
        accessToken: tokens.accessToken,
        nextPath,
      }
    );
  } catch (error) {
    console.error('Registration error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return validationErrorResponse(res, errors);
    }

    return errorResponse(res, 500, 'Registration failed. Please try again.');
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return unauthorizedResponse(res, 'Invalid email or password.');
    }

    if (user.isLocked) {
      return unauthorizedResponse(
        res,
        'Account is temporarily locked due to multiple failed login attempts. Please try again later.'
      );
    }

    if (user.isBlocked) {
      return unauthorizedResponse(res, 'Account is blocked. Please contact support.');
    }

    if (!user.isActive) {
      return unauthorizedResponse(res, 'Account is deactivated. Please contact support.');
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return unauthorizedResponse(res, 'Invalid email or password.');
    }

    await user.resetLoginAttempts();

    const tokens = generateTokens(user._id, user.role);
    await user.addRefreshToken(tokens.refreshToken);
    setRefreshTokenCookie(res, tokens.refreshToken);
    const nextPath = await resolvePostLoginPath(user);

    return successResponse(res, 200, 'Login successful', {
      user: buildUserResponse(user),
      accessToken: tokens.accessToken,
      nextPath,
    });
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 500, 'Login failed. Please try again.');
  }
};

const logout = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;

    if (token) {
      await req.user.removeRefreshToken(token);
    }

    clearRefreshTokenCookie(res);
    return successResponse(res, 200, 'Logout successful');
  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse(res, 500, 'Logout failed. Please try again.');
  }
};

const refreshToken = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return unauthorizedResponse(res, 'Refresh token not provided.');
    }

    const decoded = verifyRefreshToken(token);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return unauthorizedResponse(res, 'Invalid refresh token.');
    }

    const tokenExists = user.refreshTokens.some((t) => t.token === token);
    if (!tokenExists) {
      return unauthorizedResponse(res, 'Invalid refresh token.');
    }

    if (!user.isActive || user.isBlocked || user.isLocked) {
      return unauthorizedResponse(res, 'Account is not active.');
    }

    const tokens = generateTokens(user._id, user.role);

    await user.removeRefreshToken(token);
    await user.addRefreshToken(tokens.refreshToken);
    setRefreshTokenCookie(res, tokens.refreshToken);

    return successResponse(res, 200, 'Token refreshed successfully', {
      accessToken: tokens.accessToken,
    });
  } catch (error) {
    console.error('Token refresh error:', error);

    if (error.name === 'TokenExpiredError') {
      clearRefreshTokenCookie(res);
      return unauthorizedResponse(res, 'Refresh token has expired. Please login again.');
    }
    if (error.name === 'JsonWebTokenError') {
      return unauthorizedResponse(res, 'Invalid refresh token.');
    }

    return errorResponse(res, 500, 'Token refresh failed. Please try again.');
  }
};

const oauthExchange = async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) {
      return unauthorizedResponse(res, 'OAuth exchange code is required.');
    }

    const decoded = verifyOAuthExchangeToken(code);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive || user.isBlocked || user.isLocked) {
      return unauthorizedResponse(res, 'OAuth exchange failed.');
    }

    const tokens = generateTokens(user._id, user.role);
    await user.addRefreshToken(tokens.refreshToken);
    setRefreshTokenCookie(res, tokens.refreshToken);
    const nextPath = await resolvePostLoginPath(user);

    return successResponse(res, 200, 'OAuth exchange successful', {
      user: buildUserResponse(user),
      accessToken: tokens.accessToken,
      nextPath,
    });
  } catch (error) {
    console.error('OAuth exchange error:', error);
    return unauthorizedResponse(res, 'OAuth exchange failed. Please login again.');
  }
};

const sendOauthOtp = async (req, res) => {
  try {
    const { pendingCode } = req.body || {};
    if (!pendingCode) {
      return errorResponse(res, 400, 'OAuth pending code is required.');
    }

    const pending = verifyOAuthPendingToken(pendingCode);
    if (!pending?.email) {
      return unauthorizedResponse(res, 'Invalid OAuth pending code.');
    }

    const otpResult = await issueOtp({
      email: pending.email,
      purpose: 'oauth_login',
      firstName: pending.firstName || 'User',
    });

    const message = otpResult.deliveredViaEmail
      ? 'OTP sent to your Google email address.'
      : 'OTP generated in development fallback mode. Check backend logs.';
    return successResponse(res, 200, message);
  } catch (error) {
    if (error.statusCode === 429) {
      return errorResponse(res, 429, error.message);
    }
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return unauthorizedResponse(res, 'OAuth session expired. Please continue with Google again.');
    }
    if (error.code === 'EAUTH') {
      return errorResponse(
        res,
        500,
        'Email service authentication failed. Please verify EMAIL_USER/EMAIL_PASS configuration.'
      );
    }
    console.error('OAuth OTP send error:', error);
    return errorResponse(res, 500, 'Failed to send OTP. Please try again.');
  }
};

const completeOauth = async (req, res) => {
  try {
    const { pendingCode, otp, role, phone } = req.body || {};
    if (!pendingCode) {
      return errorResponse(res, 400, 'OAuth pending code is required.');
    }
    if (!otp) {
      return errorResponse(res, 400, 'OTP is required.');
    }
    if (!/^\d{6}$/.test(String(otp))) {
      return errorResponse(res, 400, 'OTP must be a 6-digit number.');
    }

    const pending = verifyOAuthPendingToken(pendingCode);
    const requestedRole = String(role || pending.requestedRole || '').toLowerCase();
    const selectedRole = ['jobseeker', 'employer'].includes(requestedRole) ? requestedRole : null;
    const normalizedEmail = String(pending.email || '').trim().toLowerCase();
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
    if (normalizedPhone && !/^[\+]?[1-9][\d]{0,15}$/.test(normalizedPhone)) {
      return errorResponse(res, 400, 'Please enter a valid phone number');
    }

    const otpResult = await verifyOtpRecord({ email: normalizedEmail, purpose: 'oauth_login', otp });
    if (!otpResult.success) {
      return errorResponse(res, 400, otpResult.message);
    }

    let user = null;
    if (pending.existingUserId) {
      user = await User.findById(pending.existingUserId);
    }
    if (!user && normalizedEmail) {
      user = await User.findOne({ email: normalizedEmail });
    }

    if (user) {
      if (!user.isActive || user.isBlocked || user.isLocked) {
        return unauthorizedResponse(res, 'Account is not active.');
      }

      if (selectedRole && user.role !== selectedRole) {
        return errorResponse(
          res,
          400,
          `This email is already registered as ${user.role}. Please continue as ${user.role}.`
        );
      }

      if (!user.oauthProvider || !user.oauthId) {
        user.oauthProvider = 'google';
        user.oauthId = pending.googleId;
        user.isEmailVerified = true;
        if (!user.profileImage && pending.profileImage) {
          user.profileImage = pending.profileImage;
        }
        await user.save();
      }

      if (normalizedPhone && user.phone !== normalizedPhone) {
        user.phone = normalizedPhone;
        await user.save();
      }

      if (user.role === 'jobseeker') {
        const existingJobseeker = await JobSeeker.findOne({ user: user._id }).select('_id').lean();
        if (!existingJobseeker) {
          await JobSeeker.create({ user: user._id });
        }
      }
    } else {
      if (!selectedRole) {
        return errorResponse(res, 400, 'Please select a role to continue.');
      }

      user = await User.create({
        email: normalizedEmail,
        role: selectedRole,
        firstName: pending.firstName || 'User',
        lastName: pending.lastName || 'Google',
        isEmailVerified: true,
        oauthProvider: 'google',
        oauthId: pending.googleId,
        profileImage: pending.profileImage || null,
        phone: normalizedPhone || undefined,
      });

      if (selectedRole === 'jobseeker') {
        await JobSeeker.create({ user: user._id });
      }
    }

    const tokens = generateTokens(user._id, user.role);
    await user.addRefreshToken(tokens.refreshToken);
    setRefreshTokenCookie(res, tokens.refreshToken);
    const nextPath = await resolvePostLoginPath(user);

    return successResponse(res, 200, 'OAuth login successful', {
      user: buildUserResponse(user),
      accessToken: tokens.accessToken,
      nextPath,
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return unauthorizedResponse(res, 'OAuth session expired. Please continue with Google again.');
    }
    console.error('OAuth completion error:', error);
    return errorResponse(res, 500, 'Failed to complete OAuth login. Please try again.');
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return errorResponse(res, 400, 'Invalid or expired verification token.');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return successResponse(res, 200, 'Email verified successfully');
  } catch (error) {
    console.error('Email verification error:', error);
    return errorResponse(res, 500, 'Email verification failed. Please try again.');
  }
};

const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return errorResponse(res, 404, 'User not found.');
    }

    if (user.isEmailVerified) {
      return errorResponse(res, 400, 'Email is already verified.');
    }

    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    try {
      await emailService.sendVerificationEmail(user.email, verificationToken, user.firstName);
      return successResponse(res, 200, 'Verification email sent successfully');
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return errorResponse(res, 500, 'Failed to send verification email. Please try again.');
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    return errorResponse(res, 500, 'Failed to resend verification email. Please try again.');
  }
};

const sendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return successResponse(res, 200, 'If the email exists, an OTP has been sent.');
    }

    try {
      const otpResult = await issueOtp({
        email: normalizedEmail,
        purpose: 'forgot_password',
        firstName: user.firstName,
      });
      const message = otpResult.deliveredViaEmail
        ? 'If the email exists, an OTP has been sent.'
        : 'OTP generated in development fallback mode. Check backend logs.';
      return successResponse(res, 200, message);
    } catch (otpError) {
      if (otpError.statusCode === 429) {
        return errorResponse(res, 429, otpError.message);
      }
      if (otpError.code === 'EAUTH') {
        return errorResponse(
          res,
          500,
          'Email service authentication failed. Please verify EMAIL_USER/EMAIL_PASS configuration.'
        );
      }
      console.error('Forgot password OTP send error:', otpError);
      return errorResponse(res, 500, 'Failed to send OTP. Please try again.');
    }
  } catch (error) {
    console.error('Forgot password OTP error:', error);
    return errorResponse(res, 500, 'Password reset request failed. Please try again.');
  }
};

const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      return validationErrorResponse(res, [{ field: 'password', message: passwordError }]);
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return errorResponse(res, 400, 'Invalid OTP or email.');
    }

    const otpResult = await verifyOtpRecord({ email: normalizedEmail, purpose: 'forgot_password', otp });
    if (!otpResult.success) {
      return errorResponse(res, 400, otpResult.message);
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    await user.clearAllRefreshTokens();
    clearRefreshTokenCookie(res);

    return successResponse(res, 200, 'Password reset successfully.');
  } catch (error) {
    console.error('Forgot password OTP verification error:', error);
    return errorResponse(res, 500, 'Password reset failed. Please try again.');
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return successResponse(res, 200, 'If the email exists, a password reset link has been sent.');
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    try {
      await emailService.sendPasswordResetEmail(user.email, resetToken, user.firstName);
      return successResponse(res, 200, 'If the email exists, a password reset link has been sent.');
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return errorResponse(res, 500, 'Failed to send password reset email. Please try again.');
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    return errorResponse(res, 500, 'Password reset request failed. Please try again.');
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+password');

    if (!user) {
      return errorResponse(res, 400, 'Invalid or expired password reset token.');
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    await user.clearAllRefreshTokens();

    return successResponse(res, 200, 'Password reset successfully');
  } catch (error) {
    console.error('Password reset error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return validationErrorResponse(res, errors);
    }

    return errorResponse(res, 500, 'Password reset failed. Please try again.');
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -refreshTokens');

    if (!user) {
      return errorResponse(res, 404, 'User not found.');
    }

    return successResponse(res, 200, 'Profile retrieved successfully', { user });
  } catch (error) {
    console.error('Get profile error:', error);
    return errorResponse(res, 500, 'Failed to retrieve profile. Please try again.');
  }
};

const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, profileImage } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return errorResponse(res, 404, 'User not found.');
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (profileImage) user.profileImage = profileImage;

    await user.save();

    return successResponse(res, 200, 'Profile updated successfully', {
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error('Update profile error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return validationErrorResponse(res, errors);
    }

    return errorResponse(res, 500, 'Profile update failed. Please try again.');
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return errorResponse(res, 404, 'User not found.');
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return errorResponse(res, 400, 'Current password is incorrect.');
    }

    user.password = newPassword;
    await user.save();

    await user.clearAllRefreshTokens();
    clearRefreshTokenCookie(res);

    return successResponse(res, 200, 'Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return validationErrorResponse(res, errors);
    }

    return errorResponse(res, 500, 'Password change failed. Please try again.');
  }
};

module.exports = {
  sendRegistrationOtp,
  verifyRegistrationOtp,
  register,
  login,
  logout,
  refreshToken,
  oauthExchange,
  sendOauthOtp,
  completeOauth,
  verifyEmail,
  resendVerificationEmail,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  changePassword,
};
