const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const {
  validateRegistration,
  validateLogin,
  validateOtpRequest,
  validateOtpVerification,
  validatePasswordReset,
  validatePasswordChange,
} = require('../middlewares/validation');
const oauthController = require('../controllers/oauthController');

// Public routes
router.post('/register', validateRegistration, authController.register);
router.post('/register/send-otp', validateOtpRequest, authController.sendRegistrationOtp);
router.post('/register/verify-otp', validateRegistration, validateOtpVerification, authController.verifyRegistrationOtp);
router.post('/login', validateLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/oauth/exchange', authController.oauthExchange);
router.post('/oauth/send-otp', authController.sendOauthOtp);
router.post('/oauth/complete', authController.completeOauth);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerificationEmail);
router.post('/forgot-password', authController.forgotPassword);
router.post('/forgot-password/send-otp', validateOtpRequest, authController.sendForgotPasswordOtp);
router.post('/forgot-password/verify-otp', validateOtpVerification, authController.verifyForgotPasswordOtp);
router.post('/reset-password/:token', validatePasswordReset, authController.resetPassword);

// Protected routes
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.put('/change-password', authenticate, validatePasswordChange, authController.changePassword);

// OAuth route aliases (mirror /api/oauth/* under /api/auth/*)
router.get('/google', oauthController.startGoogle);
router.get('/google/callback', oauthController.googleCallback);
router.get('/google/failure', oauthController.googleFailure);

module.exports = router;
