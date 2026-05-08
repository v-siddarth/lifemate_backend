const passport = require('passport');
const { generateOAuthPendingToken } = require('../utils/jwt');
const {
  buildFrontendOriginAllowlist,
  sanitizeRedirectOrigin,
  getCanonicalFrontendOrigin,
} = require('../config/origins');

const allowedRoles = ['jobseeker', 'employer'];
const allowedRedirectOrigins = buildFrontendOriginAllowlist();

const parseStatePayload = (rawState) => {
  if (!rawState) {
    return { role: 'jobseeker', redirectUri: null };
  }

  try {
    const decoded = Buffer.from(String(rawState), 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    const role = String(parsed.role || '').toLowerCase();
    const safeRole = allowedRoles.includes(role) ? role : 'jobseeker';
    const safeRedirectUri = sanitizeRedirectOrigin(parsed.redirectUri, allowedRedirectOrigins);

    return { role: safeRole, redirectUri: safeRedirectUri };
  } catch {
    return { role: 'jobseeker', redirectUri: null };
  }
};

// GET /api/oauth/google?role=jobseeker|employer
exports.startGoogle = (req, res, next) => {
  const role = (req.query.role || '').toLowerCase();
  const safeRole = allowedRoles.includes(role) ? role : 'jobseeker';
  const safeRedirectUri = sanitizeRedirectOrigin(req.query.redirectUri, allowedRedirectOrigins);

  const state = Buffer.from(
    JSON.stringify({
      role: safeRole,
      redirectUri: safeRedirectUri,
    }),
    'utf8'
  ).toString('base64url');

  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
};

// GET /api/oauth/google/callback
exports.googleCallback = [
  passport.authenticate('google', { session: false, failureRedirect: '/api/oauth/google/failure' }),
  async (req, res) => {
    try {
      const userPayload = req.user || {};
      const { role: requestedRole, redirectUri } = parseStatePayload(req.query.state);
      const pendingCode = generateOAuthPendingToken({
        existingUserId: userPayload.existingUserId || null,
        existingRole: userPayload.existingRole || null,
        email: userPayload.email,
        googleId: userPayload.googleId,
        firstName: userPayload.firstName,
        lastName: userPayload.lastName,
        profileImage: userPayload.profileImage,
        requestedRole,
      });

      const defaultFrontend = getCanonicalFrontendOrigin();
      const successPath = redirectUri
        ? `${redirectUri}/oauth/complete`
        : (process.env.OAUTH_SUCCESS_REDIRECT || `${defaultFrontend}/oauth/complete`);

      const redirectUrl = new URL(successPath);
      redirectUrl.searchParams.set('pending', pendingCode);
      redirectUrl.searchParams.set('role', requestedRole);

      return res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error('OAuth callback error:', error);
      const fallbackFailureRedirect = `${getCanonicalFrontendOrigin()}/oauth/failure`;
      return res.redirect(process.env.OAUTH_FAILURE_REDIRECT || fallbackFailureRedirect);
    }
  },
];

// GET /api/oauth/google/failure
exports.googleFailure = (req, res) => {
  res.status(401).json({ success: false, message: 'Google OAuth failed' });
};
