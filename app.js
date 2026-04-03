const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();
const connectDB = require('./config/database');
const authRoutes = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const savedJobRoutes = require('./routes/savedJobs');
const notificationRoutes = require('./routes/notifications');
const employerRoutes = require('./routes/employer');
const jobSeekerRoutes = require('./routes/jobseeker');
const resumeRoutes = require('./routes/resume');
const adminRoutes = require('./routes/admin');
const pricingRoutes = require('./routes/pricing');
const pricingController = require('./controllers/pricingController');
const newsletterRoutes = require('./routes/newsletter');
const passport = require('./config/passport');
const { errorResponse } = require('./utils/response');

const app = express();

if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

app.use(helmet());

const fallbackOrigins = [
  'https://career-made-frontend.vercel.app',
  'https://careermed.in',
  'https://www.careermed.in',
  'http://localhost:3000',
];

const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '');

const expandOriginVariants = (origin) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return [];

  try {
    const url = new URL(normalizedOrigin);
    const variants = new Set([`${url.protocol}//${url.host}`]);

    if (!url.port && (url.protocol === 'http:' || url.protocol === 'https:')) {
      if (url.hostname.startsWith('www.')) {
        variants.add(`${url.protocol}//${url.hostname.slice(4)}`);
      } else {
        variants.add(`${url.protocol}//www.${url.hostname}`);
      }
    }

    return [...variants];
  } catch {
    return [normalizedOrigin];
  }
};

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .flatMap((origin) => expandOriginVariants(origin))
  .filter(Boolean);

// allow vercel preview domains dynamically
const isVercelPreview = (origin) =>
  origin && origin.includes('.vercel.app');

const corsAllowlist = new Set(
  [...fallbackOrigins, ...allowedOrigins].flatMap((origin) => expandOriginVariants(origin))
);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const normalizedOrigin = normalizeOrigin(origin);
    if (corsAllowlist.has(normalizedOrigin) || isVercelPreview(normalizedOrigin)) {
      return callback(null, true);
    }

    console.log('Blocked by CORS:', origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Razorpay webhook signature verification requires raw body.
app.post(
  '/api/pricing/razorpay/webhook',
  express.raw({ type: 'application/json' }),
  pricingController.handleRazorpayWebhook
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/saved-jobs', savedJobRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/employer', employerRoutes);
app.use('/api/jobseeker', jobSeekerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/newsletter', newsletterRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LifeMate API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to LifeMate API - Healthcare Job Platform',
    version: '1.0.0',
    health: '/health',
  });
});

app.use('*', (req, res) => {
  return errorResponse(res, 404, 'Route not found');
});

app.use((err, req, res, _next) => {
  console.error('Global error handler:', err);

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return errorResponse(res, 400, 'Validation failed', errors);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return errorResponse(res, 400, `${field} already exists`);
  }

  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 401, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 401, 'Token expired');
  }

  return errorResponse(res, err.status || 500, err.message || 'Internal server error');
});

module.exports = app;
