const PRODUCTION_FRONTEND_ORIGINS = ['https://careermed.in', 'https://www.careermed.in'];
const LOCAL_FRONTEND_ORIGINS = ['http://localhost:3000', 'http://localhost:3021'];

const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '').toLowerCase();

const toOrigin = (value) => {
  const normalized = normalizeOrigin(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return null;
  }
};

const parseOriginCsv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => toOrigin(item))
    .filter(Boolean);

const getDefaultFrontendOrigins = (nodeEnv = process.env.NODE_ENV) => {
  if (nodeEnv === 'production') {
    return PRODUCTION_FRONTEND_ORIGINS;
  }

  return [...PRODUCTION_FRONTEND_ORIGINS, ...LOCAL_FRONTEND_ORIGINS];
};

const buildFrontendOriginAllowlist = ({
  nodeEnv = process.env.NODE_ENV,
  corsOrigins = process.env.CORS_ORIGINS,
} = {}) => {
  const allowlist = new Set(getDefaultFrontendOrigins(nodeEnv).map((origin) => normalizeOrigin(origin)));

  parseOriginCsv(corsOrigins).forEach((origin) => {
    allowlist.add(normalizeOrigin(origin));
  });

  return allowlist;
};

const isOriginAllowed = (origin, allowlist = buildFrontendOriginAllowlist()) =>
  allowlist.has(normalizeOrigin(origin));

const sanitizeRedirectOrigin = (candidate, allowlist = buildFrontendOriginAllowlist()) => {
  const origin = toOrigin(candidate);
  if (!origin) return null;
  return isOriginAllowed(origin, allowlist) ? origin : null;
};

const getCanonicalFrontendOrigin = ({
  frontendUrl = process.env.FRONTEND_URL,
  nodeEnv = process.env.NODE_ENV,
} = {}) => {
  const parsedOrigin = toOrigin(frontendUrl);
  if (!parsedOrigin) return 'https://www.careermed.in';

  if (nodeEnv === 'production') {
    const isProductionOrigin = PRODUCTION_FRONTEND_ORIGINS.includes(normalizeOrigin(parsedOrigin));
    return isProductionOrigin ? parsedOrigin : 'https://www.careermed.in';
  }

  return parsedOrigin;
};

module.exports = {
  PRODUCTION_FRONTEND_ORIGINS,
  normalizeOrigin,
  toOrigin,
  parseOriginCsv,
  getDefaultFrontendOrigins,
  buildFrontendOriginAllowlist,
  isOriginAllowed,
  sanitizeRedirectOrigin,
  getCanonicalFrontendOrigin,
};
