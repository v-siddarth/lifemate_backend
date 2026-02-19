const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Configure Google OAuth strategy (stateless)
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
  passReqToCallback: true,
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails && profile.emails[0] && profile.emails[0].value;
    const googleId = profile.id;

    if (!email) {
      return done(null, false, { message: 'Google account does not have a public email' });
    }

    const existingUser = await User.findOne({ $or: [
      { oauthProvider: 'google', oauthId: googleId },
      { email }
    ] });

    return done(null, {
      existingUserId: existingUser ? String(existingUser._id) : null,
      existingRole: existingUser ? existingUser.role : null,
      email,
      googleId,
      firstName: profile.name && profile.name.givenName ? profile.name.givenName : 'User',
      lastName: profile.name && profile.name.familyName ? profile.name.familyName : 'Google',
      profileImage: profile.photos && profile.photos[0] && profile.photos[0].value ? profile.photos[0].value : null,
    });
  } catch (error) {
    return done(error, null);
  }
}));

// No sessions used
module.exports = passport;

