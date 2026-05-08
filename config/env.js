const { PRODUCTION_FRONTEND_ORIGINS } = require('./origins');

const asBool = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const missingFrom = (keys) =>
  keys.filter((key) => !String(process.env[key] || '').trim());

const parseOrigin = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

const parseOriginCsv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => parseOrigin(item))
    .filter(Boolean);

const validateEnvironment = () => {
  if (process.env.NODE_ENV !== 'production') return;

  const requiredBase = [
    'MONGODB_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'OTP_SECRET',
    'FRONTEND_URL',
    'CORS_ORIGINS',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_PASS',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];

  const missing = missingFrom(requiredBase);
  const paidCheckoutEnabled = asBool(process.env.PAID_CHECKOUT_ENABLED, true);

  if (paidCheckoutEnabled) {
    missing.push(...missingFrom(['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']));

    const hasAnyPlanId = [
      'RAZORPAY_PLAN_ID_DEFAULT',
      'RAZORPAY_PLAN_ID_BASIC',
      'RAZORPAY_PLAN_ID_PREMIUM',
      'RAZORPAY_PLAN_ID_ENTERPRISE',
    ].some((key) => String(process.env[key] || '').trim());

    if (!hasAnyPlanId) {
      missing.push('RAZORPAY_PLAN_ID_DEFAULT (or specific plan ids)');
    }
  }

  const frontendOrigin = parseOrigin(process.env.FRONTEND_URL);
  if (!frontendOrigin) {
    missing.push('FRONTEND_URL (must be a valid absolute http/https origin)');
  }
  if (frontendOrigin && !PRODUCTION_FRONTEND_ORIGINS.includes(frontendOrigin.toLowerCase())) {
    missing.push(
      `FRONTEND_URL (production must be one of: ${PRODUCTION_FRONTEND_ORIGINS.join(', ')})`
    );
  }

  const configuredOrigins = parseOriginCsv(process.env.CORS_ORIGINS);
  if (configuredOrigins.length === 0) {
    missing.push('CORS_ORIGINS (must contain at least one valid origin)');
  }

  const invalidLocalOrigins = configuredOrigins.filter((origin) => origin.includes('localhost'));
  if (invalidLocalOrigins.length > 0) {
    missing.push('CORS_ORIGINS (localhost origins are not allowed in production)');
  }

  if (missing.length > 0) {
    throw new Error(`Missing or invalid production environment variables: ${missing.join(', ')}`);
  }
};

module.exports = {
  validateEnvironment,
};
