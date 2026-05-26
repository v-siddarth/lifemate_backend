const AdminPricingConfig = require('../models/AdminPricingConfig');

const EMPLOYER_PLAN_IDS = ['Free', 'Basic', 'Premium', 'Enterprise'];
const JOBSEEKER_PLAN_IDS = ['Basic', 'Growth', 'Pro'];
const ALLOWED_AUDIENCES = ['employer', 'jobseeker'];

const LEGACY_JOBSEEKER_PLAN_IDS = {
  'JS Starter': 'Basic',
  'JS Growth': 'Growth',
  'JS Pro': 'Pro',
};

const FEATURE_REGISTRY = {
  employer: [
    {
      key: 'advancedSearch',
      label: 'Advanced Search',
      category: 'Candidate Discovery',
      tooltip: 'Unlock deeper filters for faster healthcare candidate sourcing.',
      icon: 'search',
      aliases: ['advanced search'],
    },
    {
      key: 'prioritySupport',
      label: 'Priority Support',
      category: 'Support',
      tooltip: 'Give this plan faster support handling.',
      icon: 'headphones',
      aliases: ['priority support', 'dedicated account support'],
    },
    {
      key: 'customBranding',
      label: 'Custom Branding',
      category: 'Branding',
      tooltip: 'Allow branded employer pages and branded hiring touchpoints.',
      icon: 'badge',
      aliases: ['branding', 'custom branding', 'priority support + branding'],
    },
    {
      key: 'featuredJobPosts',
      label: 'Featured Job Posts',
      category: 'Visibility',
      tooltip: 'Let employers boost selected jobs in listing surfaces.',
      icon: 'star',
      aliases: ['featured job posts', 'featured jobs'],
    },
    {
      key: 'unlimitedApplications',
      label: 'Unlimited Applications',
      category: 'Hiring Limits',
      tooltip: 'Remove the regular application intake cap.',
      icon: 'infinity',
      aliases: ['unlimited applications', 'unlimited scale setup'],
    },
    {
      key: 'analyticsDashboard',
      label: 'Analytics Dashboard',
      category: 'Insights',
      tooltip: 'Show hiring funnel and application performance insights.',
      icon: 'bar-chart',
      aliases: ['analytics dashboard', 'analytics'],
    },
    {
      key: 'aiCandidateMatch',
      label: 'AI Candidate Match',
      category: 'AI Tools',
      tooltip: 'Enable AI-assisted candidate recommendations.',
      icon: 'sparkles',
      aliases: ['ai candidate match', 'candidate match'],
    },
    {
      key: 'teamMembers',
      label: 'Team Members',
      category: 'Collaboration',
      tooltip: 'Allow multi-user hiring workflows for the employer account.',
      icon: 'users',
      aliases: ['team members', 'team seats'],
    },
    {
      key: 'resumeAccess',
      label: 'Resume Access',
      category: 'Candidate Discovery',
      tooltip: 'Allow access to candidate resume details where permitted.',
      icon: 'file-text',
      aliases: ['resume access', 'resume downloads'],
    },
    {
      key: 'bulkHiringTools',
      label: 'Bulk Hiring Tools',
      category: 'Operations',
      tooltip: 'Enable tools for large-volume shortlisting and outreach.',
      icon: 'layers',
      aliases: ['bulk hiring tools', 'bulk hiring'],
    },
  ],
  jobseeker: [
    {
      key: 'priorityVisibility',
      label: 'Priority Visibility',
      category: 'Visibility',
      tooltip: 'Boost profile visibility in employer discovery surfaces.',
      icon: 'trending-up',
      aliases: ['priority visibility', 'priority profile visibility', 'top visibility boost'],
    },
    {
      key: 'resumeBoost',
      label: 'Resume Boost',
      category: 'Profile Growth',
      tooltip: 'Give the candidate additional profile and resume promotion.',
      icon: 'rocket',
      aliases: ['resume boost', 'resume improvement hints'],
    },
    {
      key: 'mockInterviews',
      label: 'Mock Interviews',
      category: 'Career Support',
      tooltip: 'Include interview preparation support.',
      icon: 'mic',
      aliases: ['mock interviews', 'mock interview support'],
    },
    {
      key: 'careerAssistance',
      label: 'Career Assistance',
      category: 'Career Support',
      tooltip: 'Include priority guidance from the CareerMed team.',
      icon: 'life-buoy',
      aliases: ['career assistance', 'priority career assistance'],
    },
    {
      key: 'applicationInsights',
      label: 'Application Insights',
      category: 'Insights',
      tooltip: 'Show application performance and profile improvement signals.',
      icon: 'bar-chart',
      aliases: ['application insights'],
    },
    {
      key: 'aiResumeReview',
      label: 'AI Resume Review',
      category: 'AI Tools',
      tooltip: 'Enable AI-assisted resume review and suggestions.',
      icon: 'sparkles',
      aliases: ['ai resume review'],
    },
    {
      key: 'verifiedBadge',
      label: 'Verified Badge',
      category: 'Trust',
      tooltip: 'Display a premium verification badge where eligible.',
      icon: 'badge-check',
      aliases: ['verified badge'],
    },
    {
      key: 'directRecruiterAccess',
      label: 'Direct Recruiter Access',
      category: 'Recruiter Access',
      tooltip: 'Unlock direct recruiter access features.',
      icon: 'messages-square',
      aliases: ['direct recruiter access'],
    },
    {
      key: 'skillAnalytics',
      label: 'Skill Analytics',
      category: 'Insights',
      tooltip: 'Show skill demand and profile strength analytics.',
      icon: 'activity',
      aliases: ['skill analytics'],
    },
    {
      key: 'premiumCommunityAccess',
      label: 'Premium Community Access',
      category: 'Community',
      tooltip: 'Unlock premium candidate community benefits.',
      icon: 'users',
      aliases: ['premium community access', 'community support'],
    },
  ],
};

const LIMIT_REGISTRY = {
  employer: [
    {
      key: 'maxJobPosts',
      label: 'Max Job Posts',
      category: 'Hiring Limits',
      unit: 'posts',
      defaultValue: 1,
      tooltip: 'Maximum active job posts allowed for this employer plan.',
    },
    {
      key: 'maxApplications',
      label: 'Max Applications',
      category: 'Hiring Limits',
      unit: 'applications',
      defaultValue: 10,
      tooltip: 'Maximum applications the employer can receive under this plan.',
    },
    {
      key: 'teamSeats',
      label: 'Team Seats',
      category: 'Collaboration',
      unit: 'seats',
      defaultValue: 1,
      tooltip: 'Number of employer team members included.',
    },
    {
      key: 'resumeDownloads',
      label: 'Resume Downloads',
      category: 'Candidate Discovery',
      unit: 'downloads',
      defaultValue: 0,
      tooltip: 'Monthly resume download allowance.',
    },
  ],
  jobseeker: [
    {
      key: 'maxApplications',
      label: 'Max Applications',
      category: 'Application Limits',
      unit: 'applications',
      defaultValue: 25,
      tooltip: 'Suggested monthly application allowance for the plan.',
    },
    {
      key: 'resumeBoosts',
      label: 'Resume Boosts',
      category: 'Profile Growth',
      unit: 'boosts',
      defaultValue: 0,
      tooltip: 'Monthly resume/profile boost allowance.',
    },
    {
      key: 'mockInterviewCredits',
      label: 'Mock Interview Credits',
      category: 'Career Support',
      unit: 'credits',
      defaultValue: 0,
      tooltip: 'Included mock interview credits per month.',
    },
    {
      key: 'recruiterMessages',
      label: 'Recruiter Messages',
      category: 'Recruiter Access',
      unit: 'messages',
      defaultValue: 0,
      tooltip: 'Direct recruiter message allowance.',
    },
  ],
};

const TEXT_METADATA_FIELDS = [
  {
    key: 'planLabel',
    label: 'Plan Label',
    maxLength: 80,
    tooltip: 'Optional short label shown near the plan name.',
  },
  {
    key: 'badgeText',
    label: 'Badge Text',
    maxLength: 80,
    tooltip: 'Optional premium badge text on the pricing card.',
  },
  {
    key: 'ctaLabel',
    label: 'CTA Label',
    maxLength: 80,
    tooltip: 'Button label shown to customers for this plan.',
  },
];

const DEFAULT_PRICING_PLANS = [
  {
    id: 'Free',
    audience: 'employer',
    displayName: 'Free',
    price: 0,
    description: 'Starter plan for low-volume hiring.',
    tag: 'For new employers',
    ctaLabel: 'Choose Free',
    highlighted: false,
    features: {
      advancedSearch: false,
      prioritySupport: false,
      customBranding: false,
      featuredJobPosts: false,
      unlimitedApplications: false,
      analyticsDashboard: false,
      aiCandidateMatch: false,
      teamMembers: false,
      resumeAccess: false,
      bulkHiringTools: false,
    },
    limits: {
      maxJobPosts: 1,
      maxApplications: 10,
      teamSeats: 1,
      resumeDownloads: 0,
    },
    metadata: {
      planLabel: 'Starter',
      badgeText: '',
      ctaLabel: 'Choose Free',
    },
    featureList: ['1 active job post', 'Up to 10 applications', 'Basic profile visibility'],
    subscriptionFeatures: {
      maxJobPosts: 1,
      maxApplications: 10,
      teamSeats: 1,
      resumeDownloads: 0,
      advancedSearch: false,
      prioritySupport: false,
      customBranding: false,
      featuredJobPosts: false,
      unlimitedApplications: false,
      analyticsDashboard: false,
      aiCandidateMatch: false,
      teamMembers: false,
      resumeAccess: false,
      bulkHiringTools: false,
    },
    isActive: true,
  },
  {
    id: 'Basic',
    audience: 'employer',
    displayName: 'Basic',
    price: 300,
    description: 'Built for clinics with ongoing hiring.',
    tag: 'Most chosen',
    ctaLabel: 'Choose Basic',
    highlighted: true,
    features: {
      advancedSearch: true,
      prioritySupport: false,
      customBranding: false,
      featuredJobPosts: true,
      unlimitedApplications: false,
      analyticsDashboard: false,
      aiCandidateMatch: false,
      teamMembers: true,
      resumeAccess: true,
      bulkHiringTools: false,
    },
    limits: {
      maxJobPosts: 5,
      maxApplications: 100,
      teamSeats: 2,
      resumeDownloads: 25,
    },
    metadata: {
      planLabel: 'Growth hiring',
      badgeText: 'Most chosen',
      ctaLabel: 'Choose Basic',
    },
    featureList: ['5 active job posts', 'Up to 100 applications', 'Advanced search'],
    subscriptionFeatures: {
      maxJobPosts: 5,
      maxApplications: 100,
      teamSeats: 2,
      resumeDownloads: 25,
      advancedSearch: true,
      prioritySupport: false,
      customBranding: false,
      featuredJobPosts: true,
      unlimitedApplications: false,
      analyticsDashboard: false,
      aiCandidateMatch: false,
      teamMembers: true,
      resumeAccess: true,
      bulkHiringTools: false,
    },
    isActive: true,
  },
  {
    id: 'Premium',
    audience: 'employer',
    displayName: 'Premium',
    price: 900,
    description: 'For hospitals hiring continuously.',
    tag: 'Scale hiring',
    ctaLabel: 'Choose Premium',
    highlighted: false,
    features: {
      advancedSearch: true,
      prioritySupport: true,
      customBranding: true,
      featuredJobPosts: true,
      unlimitedApplications: false,
      analyticsDashboard: true,
      aiCandidateMatch: true,
      teamMembers: true,
      resumeAccess: true,
      bulkHiringTools: true,
    },
    limits: {
      maxJobPosts: 25,
      maxApplications: 500,
      teamSeats: 5,
      resumeDownloads: 150,
    },
    metadata: {
      planLabel: 'Advanced hiring',
      badgeText: 'Scale hiring',
      ctaLabel: 'Choose Premium',
    },
    featureList: ['25 active job posts', 'Up to 500 applications', 'Priority support + branding'],
    subscriptionFeatures: {
      maxJobPosts: 25,
      maxApplications: 500,
      teamSeats: 5,
      resumeDownloads: 150,
      advancedSearch: true,
      prioritySupport: true,
      customBranding: true,
      featuredJobPosts: true,
      unlimitedApplications: false,
      analyticsDashboard: true,
      aiCandidateMatch: true,
      teamMembers: true,
      resumeAccess: true,
      bulkHiringTools: true,
    },
    isActive: true,
  },
  {
    id: 'Enterprise',
    audience: 'employer',
    displayName: 'Enterprise',
    price: 1800,
    description: 'Enterprise healthcare recruitment operations.',
    tag: 'High volume',
    ctaLabel: 'Contact Sales',
    highlighted: false,
    features: {
      advancedSearch: true,
      prioritySupport: true,
      customBranding: true,
      featuredJobPosts: true,
      unlimitedApplications: true,
      analyticsDashboard: true,
      aiCandidateMatch: true,
      teamMembers: true,
      resumeAccess: true,
      bulkHiringTools: true,
    },
    limits: {
      maxJobPosts: 9999,
      maxApplications: 5000,
      teamSeats: 25,
      resumeDownloads: 1000,
    },
    metadata: {
      planLabel: 'Enterprise scale',
      badgeText: 'High volume',
      ctaLabel: 'Contact Sales',
    },
    featureList: ['Unlimited scale setup', '5000 applications capacity', 'Dedicated account support'],
    subscriptionFeatures: {
      maxJobPosts: 9999,
      maxApplications: 5000,
      teamSeats: 25,
      resumeDownloads: 1000,
      advancedSearch: true,
      prioritySupport: true,
      customBranding: true,
      featuredJobPosts: true,
      unlimitedApplications: true,
      analyticsDashboard: true,
      aiCandidateMatch: true,
      teamMembers: true,
      resumeAccess: true,
      bulkHiringTools: true,
    },
    isActive: true,
  },
  {
    id: 'Basic',
    audience: 'jobseeker',
    displayName: 'Basic',
    price: 99,
    description: 'Basic tools for applying and profile building.',
    tag: 'Start focused',
    ctaLabel: 'Choose Basic',
    highlighted: false,
    features: {
      priorityVisibility: false,
      resumeBoost: false,
      mockInterviews: false,
      careerAssistance: false,
      applicationInsights: false,
      aiResumeReview: false,
      verifiedBadge: false,
      directRecruiterAccess: false,
      skillAnalytics: false,
      premiumCommunityAccess: true,
    },
    limits: {
      maxApplications: 25,
      resumeBoosts: 0,
      mockInterviewCredits: 0,
      recruiterMessages: 0,
    },
    metadata: {
      planLabel: 'Starter',
      badgeText: '',
      ctaLabel: 'Choose Basic',
    },
    featureList: ['Standard profile', 'Basic applications', 'Community support'],
    subscriptionFeatures: null,
    isActive: true,
  },
  {
    id: 'Growth',
    audience: 'jobseeker',
    displayName: 'Growth',
    price: 199,
    description: 'Improve interview chances and visibility.',
    tag: 'Popular',
    ctaLabel: 'Choose Growth',
    highlighted: true,
    features: {
      priorityVisibility: true,
      resumeBoost: true,
      mockInterviews: false,
      careerAssistance: false,
      applicationInsights: true,
      aiResumeReview: true,
      verifiedBadge: true,
      directRecruiterAccess: false,
      skillAnalytics: true,
      premiumCommunityAccess: true,
    },
    limits: {
      maxApplications: 100,
      resumeBoosts: 2,
      mockInterviewCredits: 0,
      recruiterMessages: 3,
    },
    metadata: {
      planLabel: 'Career growth',
      badgeText: 'Popular',
      ctaLabel: 'Choose Growth',
    },
    featureList: ['Priority profile visibility', 'Application insights', 'Resume improvement hints'],
    subscriptionFeatures: null,
    isActive: true,
  },
  {
    id: 'Pro',
    audience: 'jobseeker',
    displayName: 'Pro',
    price: 399,
    description: 'Advanced career acceleration features.',
    tag: 'Maximum support',
    ctaLabel: 'Choose Pro',
    highlighted: false,
    features: {
      priorityVisibility: true,
      resumeBoost: true,
      mockInterviews: true,
      careerAssistance: true,
      applicationInsights: true,
      aiResumeReview: true,
      verifiedBadge: true,
      directRecruiterAccess: true,
      skillAnalytics: true,
      premiumCommunityAccess: true,
    },
    limits: {
      maxApplications: 250,
      resumeBoosts: 6,
      mockInterviewCredits: 2,
      recruiterMessages: 10,
    },
    metadata: {
      planLabel: 'Maximum support',
      badgeText: 'Pro',
      ctaLabel: 'Choose Pro',
    },
    featureList: ['Top visibility boost', 'Mock interview support', 'Priority career assistance'],
    subscriptionFeatures: null,
    isActive: true,
  },
];

const safeRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value;
};

const sortObject = (value) =>
  Object.keys(safeRecord(value))
    .sort()
    .reduce((acc, key) => {
      acc[key] = value[key];
      return acc;
    }, {});

const getRegistryEntries = (registry, audience) =>
  Array.isArray(registry[audience]) ? registry[audience] : [];

const getRegistryKeys = (registry, audience) =>
  getRegistryEntries(registry, audience).map((item) => item.key);

const isSafeCapabilityKey = (key) => /^[a-z][A-Za-z0-9]{1,80}$/.test(String(key || ''));

const toTitleCase = (value) =>
  String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeStringList = (value) =>
  Array.isArray(value)
    ? value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    : [];

const normalizeTextForMatch = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const toPlainObject = (value) => {
  if (!value) return null;
  if (typeof value.toObject === 'function') return value.toObject();
  if (value._doc && typeof value._doc === 'object') return { ...value._doc };
  return value;
};

const numberOrDefault = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const inferLegacyFeatures = (audience, featureList) => {
  const normalizedLines = normalizeStringList(featureList).map(normalizeTextForMatch);

  return getRegistryEntries(FEATURE_REGISTRY, audience).reduce((acc, feature) => {
    const aliases = [feature.label, ...(feature.aliases || [])].map(normalizeTextForMatch);
    acc[feature.key] = normalizedLines.some((line) =>
      aliases.some((alias) => alias && (line === alias || line.includes(alias)))
    );
    return acc;
  }, {});
};

const normalizeFeatureFlags = ({ audience, base, fallback, hasStructuredCapabilities }) => {
  const registryKeys = getRegistryKeys(FEATURE_REGISTRY, audience);
  const fallbackFeatures = safeRecord(fallback?.features);
  const baseFeatures = safeRecord(base?.features);
  const fallbackLegacy = safeRecord(fallback?.subscriptionFeatures);
  const baseLegacy = safeRecord(base?.subscriptionFeatures || base?.features);
  const inferredLegacy = hasStructuredCapabilities
    ? {}
    : inferLegacyFeatures(audience, base?.featureList || fallback?.featureList);

  const result = {};
  registryKeys.forEach((key) => {
    result[key] = Boolean(
      baseFeatures[key] ??
        fallbackFeatures[key] ??
        baseLegacy[key] ??
        fallbackLegacy[key] ??
        inferredLegacy[key] ??
        false
    );
  });

  [fallbackFeatures, baseFeatures].forEach((source) => {
    Object.entries(source).forEach(([key, value]) => {
      if (!registryKeys.includes(key) && isSafeCapabilityKey(key) && typeof value === 'boolean') {
        result[key] = value;
      }
    });
  });

  return result;
};

const normalizeLimits = ({ audience, base, fallback }) => {
  const registryKeys = getRegistryKeys(LIMIT_REGISTRY, audience);
  const defaultByKey = getRegistryEntries(LIMIT_REGISTRY, audience).reduce((acc, limit) => {
    acc[limit.key] = numberOrDefault(limit.defaultValue, 0);
    return acc;
  }, {});
  const fallbackLegacy = safeRecord(fallback?.subscriptionFeatures);
  const baseLegacy = safeRecord(base?.subscriptionFeatures);
  const source = {
    ...defaultByKey,
    ...fallbackLegacy,
    ...safeRecord(fallback?.limits),
    ...baseLegacy,
    ...safeRecord(base?.limits),
  };

  const result = {};
  registryKeys.forEach((key) => {
    result[key] = numberOrDefault(source[key], defaultByKey[key] ?? 0);
  });

  [safeRecord(fallback?.limits), safeRecord(base?.limits)].forEach((limits) => {
    Object.entries(limits).forEach(([key, value]) => {
      if (!registryKeys.includes(key) && isSafeCapabilityKey(key)) {
        result[key] = numberOrDefault(value, 0);
      }
    });
  });

  return result;
};

const normalizeMetadata = ({ base, fallback, displayName, ctaLabel }) => {
  const metadata = {
    ...safeRecord(fallback?.metadata),
    ...safeRecord(base?.metadata),
  };

  return {
    planLabel: String(metadata.planLabel || displayName || '').trim().slice(0, 80),
    badgeText: String(metadata.badgeText || base?.tag || fallback?.tag || '').trim().slice(0, 80),
    ctaLabel: String(metadata.ctaLabel || ctaLabel || 'Choose Plan').trim().slice(0, 80),
  };
};

const getFeatureLabel = (audience, key) =>
  getRegistryEntries(FEATURE_REGISTRY, audience).find((feature) => feature.key === key)?.label ||
  toTitleCase(key);

const getLimitLabel = (audience, key) =>
  getRegistryEntries(LIMIT_REGISTRY, audience).find((limit) => limit.key === key)?.label ||
  toTitleCase(key);

const formatLimitValue = (audience, key, value) => {
  if (key === 'maxJobPosts' && Number(value) >= 9999) return 'Unlimited job posts';
  if (key === 'maxApplications' && Number(value) >= 999999) return 'Unlimited applications';
  const label = getLimitLabel(audience, key);
  return `${label}: ${Number(value).toLocaleString('en-IN')}`;
};

const buildDisplayCapabilities = ({ audience, features, limits, legacyFeatureList = [] }) => {
  const displayLimits = Object.entries(sortObject(limits))
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => ({
      key,
      label: getLimitLabel(audience, key),
      value: Number(value),
      displayValue: formatLimitValue(audience, key, value),
    }));

  const displayFeatures = Object.entries(sortObject(features))
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => ({
      key,
      label: getFeatureLabel(audience, key),
    }));

  const lines = [
    ...displayLimits.map((item) => item.displayValue),
    ...displayFeatures.map((item) => item.label),
    ...normalizeStringList(legacyFeatureList),
  ];
  const dedupedLines = [...new Set(lines.map((line) => line.trim()).filter(Boolean))];

  return {
    displayFeatures,
    displayLimits,
    featureList: dedupedLines,
  };
};

const buildEmployerSubscriptionFeatures = (features, limits) => ({
  maxJobPosts: numberOrDefault(limits.maxJobPosts, 1),
  maxApplications: features.unlimitedApplications
    ? 999999
    : numberOrDefault(limits.maxApplications, 10),
  teamSeats: numberOrDefault(limits.teamSeats, 1),
  resumeDownloads: numberOrDefault(limits.resumeDownloads, 0),
  advancedSearch: Boolean(features.advancedSearch),
  prioritySupport: Boolean(features.prioritySupport),
  customBranding: Boolean(features.customBranding),
  featuredJobPosts: Boolean(features.featuredJobPosts),
  unlimitedApplications: Boolean(features.unlimitedApplications),
  analyticsDashboard: Boolean(features.analyticsDashboard),
  aiCandidateMatch: Boolean(features.aiCandidateMatch),
  teamMembers: Boolean(features.teamMembers),
  resumeAccess: Boolean(features.resumeAccess),
  bulkHiringTools: Boolean(features.bulkHiringTools),
});

const normalizePlan = (raw, fallback = {}) => {
  const base = { ...fallback, ...(raw || {}) };
  const normalizedId = LEGACY_JOBSEEKER_PLAN_IDS[base.id] || base.id;
  const resolvedAudience =
    base.audience ||
    (EMPLOYER_PLAN_IDS.includes(normalizedId) ? 'employer' : null) ||
    (JOBSEEKER_PLAN_IDS.includes(normalizedId) ? 'jobseeker' : null) ||
    fallback.audience;
  const defaultPlan = DEFAULT_PRICING_PLANS.find(
    (plan) => plan.audience === resolvedAudience && plan.id === normalizedId
  );
  const rawPrice = Number(base.price);
  const fallbackPrice = Number(fallback.price);
  const defaultPrice = Number(defaultPlan?.price);
  const displayName =
    LEGACY_JOBSEEKER_PLAN_IDS[base.id] && normalizedId === 'Basic'
      ? 'Basic'
      : String(base.displayName || normalizedId || '').trim();
  const ctaLabel = String(base.ctaLabel || fallback.ctaLabel || 'Choose Plan').trim();
  const hasStructuredCapabilities =
    Boolean(base.features && typeof base.features === 'object') ||
    Boolean(base.limits && typeof base.limits === 'object') ||
    Boolean(base.metadata && typeof base.metadata === 'object');
  const features = normalizeFeatureFlags({
    audience: resolvedAudience,
    base,
    fallback: fallback || defaultPlan || {},
    hasStructuredCapabilities,
  });
  const limits = normalizeLimits({
    audience: resolvedAudience,
    base,
    fallback: fallback || defaultPlan || {},
  });
  const metadata = normalizeMetadata({ base, fallback, displayName, ctaLabel });
  const display = buildDisplayCapabilities({
    audience: resolvedAudience,
    features,
    limits,
    legacyFeatureList: hasStructuredCapabilities ? [] : base.featureList,
  });

  return {
    id: normalizedId,
    audience: resolvedAudience,
    displayName,
    price:
      resolvedAudience === 'jobseeker' &&
      normalizedId === 'Basic' &&
      (!Number.isFinite(rawPrice) || rawPrice <= 0)
        ? Number.isFinite(defaultPrice)
          ? defaultPrice
          : 99
        : Number.isFinite(rawPrice)
          ? rawPrice
          : Number.isFinite(fallbackPrice)
            ? fallbackPrice
            : 0,
    description: String(base.description || '').trim(),
    tag: String(base.tag || metadata.badgeText || '').trim(),
    ctaLabel: metadata.ctaLabel || ctaLabel || 'Choose Plan',
    highlighted: Boolean(base.highlighted),
    features,
    limits,
    metadata,
    featureList: display.featureList,
    displayFeatures: display.displayFeatures,
    displayLimits: display.displayLimits,
    subscriptionFeatures:
      resolvedAudience === 'employer' ? buildEmployerSubscriptionFeatures(features, limits) : null,
    isActive: base.isActive !== false,
  };
};

const defaultEmployerFeatureMap = DEFAULT_PRICING_PLANS.filter(
  (plan) => plan.audience === 'employer'
).reduce((acc, plan) => {
  acc[plan.id] = buildEmployerSubscriptionFeatures(plan.features, plan.limits);
  return acc;
}, {});

const stableStringifyPlans = (plans) =>
  JSON.stringify(
    (plans || []).map((plan) => ({
      id: plan.id,
      audience: plan.audience,
      displayName: plan.displayName,
      price: plan.price,
      description: plan.description,
      tag: plan.tag,
      ctaLabel: plan.ctaLabel,
      highlighted: Boolean(plan.highlighted),
      features: sortObject(plan.features),
      limits: sortObject(plan.limits),
      metadata: sortObject(plan.metadata),
      featureList: Array.isArray(plan.featureList) ? plan.featureList : [],
      subscriptionFeatures: plan.subscriptionFeatures || null,
      isActive: plan.isActive !== false,
    }))
  );

const migratePlans = (plansInput) => {
  const current = Array.isArray(plansInput) ? plansInput : [];
  const migrated = [];
  const seen = new Set();

  const pushUniquePlan = (plan, fallback) => {
    const normalized = normalizePlan(plan, fallback);
    const key = `${normalized.audience}:${normalized.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    migrated.push(normalized);
  };

  current.forEach((plan) => {
    const plain = toPlainObject(plan);
    if (!plain) return;

    if (plain.audience) {
      pushUniquePlan(
        plain,
        DEFAULT_PRICING_PLANS.find(
          (item) =>
            item.id === (LEGACY_JOBSEEKER_PLAN_IDS[plain.id] || plain.id) &&
            item.audience === plain.audience
        )
      );
      return;
    }

    if (EMPLOYER_PLAN_IDS.includes(plain.id)) {
      pushUniquePlan(
        {
          ...plain,
          audience: 'employer',
          featureList: plain.featureList || [],
          subscriptionFeatures:
            plain.subscriptionFeatures || plain.features || defaultEmployerFeatureMap[plain.id],
        },
        DEFAULT_PRICING_PLANS.find(
          (item) => item.id === plain.id && item.audience === 'employer'
        )
      );
      return;
    }

    if (LEGACY_JOBSEEKER_PLAN_IDS[plain.id] || JOBSEEKER_PLAN_IDS.includes(plain.id)) {
      const id = LEGACY_JOBSEEKER_PLAN_IDS[plain.id] || plain.id;
      pushUniquePlan(
        {
          ...plain,
          id,
          audience: 'jobseeker',
        },
        DEFAULT_PRICING_PLANS.find((item) => item.id === id && item.audience === 'jobseeker')
      );
    }
  });

  const existingKeys = new Set(migrated.map((plan) => `${plan.audience}:${plan.id}`));
  DEFAULT_PRICING_PLANS.forEach((plan) => {
    const key = `${plan.audience}:${plan.id}`;
    if (!existingKeys.has(key)) {
      migrated.push(normalizePlan(plan, plan));
    }
  });

  return migrated.map((plan) =>
    normalizePlan(
      plan,
      DEFAULT_PRICING_PLANS.find((item) => item.audience === plan.audience && item.id === plan.id)
    )
  );
};

const validatePlanCatalogInput = (plansInput) => {
  const errors = [];

  if (!Array.isArray(plansInput)) {
    return [{ field: 'plans', message: 'Plans array is required' }];
  }

  plansInput.forEach((plan, index) => {
    const prefix = `plans.${index}`;
    if (!plan || typeof plan !== 'object') {
      errors.push({ field: prefix, message: 'Plan must be an object' });
      return;
    }

    if (!ALLOWED_AUDIENCES.includes(plan.audience)) {
      errors.push({ field: `${prefix}.audience`, message: 'Plan audience must be employer or jobseeker' });
    }

    if (plan.audience === 'employer' && !EMPLOYER_PLAN_IDS.includes(plan.id)) {
      errors.push({
        field: `${prefix}.id`,
        message: 'Employer plan id must be one of Free, Basic, Premium, Enterprise',
      });
    }

    if (plan.audience === 'jobseeker' && !JOBSEEKER_PLAN_IDS.includes(plan.id)) {
      errors.push({
        field: `${prefix}.id`,
        message: 'Job seeker plan id must be one of Basic, Growth, Pro',
      });
    }

    if (!String(plan.displayName || '').trim()) {
      errors.push({ field: `${prefix}.displayName`, message: 'Display name is required' });
    }

    if (String(plan.displayName || '').length > 80) {
      errors.push({ field: `${prefix}.displayName`, message: 'Display name cannot exceed 80 characters' });
    }

    if (!Number.isFinite(Number(plan.price)) || Number(plan.price) < 0) {
      errors.push({ field: `${prefix}.price`, message: 'Price must be a non-negative number' });
    }

    if (String(plan.description || '').length > 500) {
      errors.push({ field: `${prefix}.description`, message: 'Description cannot exceed 500 characters' });
    }

    if (String(plan.tag || '').length > 80) {
      errors.push({ field: `${prefix}.tag`, message: 'Tag cannot exceed 80 characters' });
    }

    if (String(plan.ctaLabel || '').length > 80) {
      errors.push({ field: `${prefix}.ctaLabel`, message: 'CTA label cannot exceed 80 characters' });
    }

    Object.entries(safeRecord(plan.features)).forEach(([key, value]) => {
      if (!isSafeCapabilityKey(key)) {
        errors.push({ field: `${prefix}.features.${key}`, message: 'Feature key is invalid' });
      }
      if (typeof value !== 'boolean') {
        errors.push({ field: `${prefix}.features.${key}`, message: 'Feature value must be true or false' });
      }
    });

    Object.entries(safeRecord(plan.limits)).forEach(([key, value]) => {
      if (!isSafeCapabilityKey(key)) {
        errors.push({ field: `${prefix}.limits.${key}`, message: 'Limit key is invalid' });
      }
      if (!Number.isFinite(Number(value)) || Number(value) < 0) {
        errors.push({ field: `${prefix}.limits.${key}`, message: 'Limit value must be a non-negative number' });
      }
    });

    Object.entries(safeRecord(plan.metadata)).forEach(([key, value]) => {
      if (!isSafeCapabilityKey(key)) {
        errors.push({ field: `${prefix}.metadata.${key}`, message: 'Metadata key is invalid' });
      }
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        errors.push({ field: `${prefix}.metadata.${key}`, message: 'Metadata value must be simple text' });
      }
      if (String(value || '').length > 120) {
        errors.push({ field: `${prefix}.metadata.${key}`, message: 'Metadata value cannot exceed 120 characters' });
      }
    });
  });

  return errors;
};

const ensurePricingConfig = async () => {
  await AdminPricingConfig.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default', plans: DEFAULT_PRICING_PLANS } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const current = await AdminPricingConfig.findOne({ key: 'default' }).lean();
  const migratedPlans = migratePlans(current?.plans || []);

  if (stableStringifyPlans(current?.plans || []) !== stableStringifyPlans(migratedPlans)) {
    await AdminPricingConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: { plans: migratedPlans } },
      { new: true }
    );
  }

  return AdminPricingConfig.findOne({ key: 'default' }).lean();
};

const getAllPlans = async ({ includeInactive = true } = {}) => {
  const config = await ensurePricingConfig();
  let plans = (config.plans || [])
    .map((plan) => normalizePlan(toPlainObject(plan)))
    .filter((plan) => Boolean(plan.id && plan.audience));
  if (plans.length === 0) {
    await AdminPricingConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: { plans: DEFAULT_PRICING_PLANS } },
      { new: true }
    );
    const refreshed = await AdminPricingConfig.findOne({ key: 'default' }).lean();
    plans = (refreshed?.plans || []).map((plan) => normalizePlan(plan));
  }
  if (!includeInactive) {
    plans = plans.filter((plan) => plan.isActive);
  }
  return plans;
};

const getPlansByAudience = async (audience, options = {}) => {
  const plans = await getAllPlans(options);
  return plans.filter((plan) => plan.audience === audience);
};

const getEmployerPlanMap = async () => {
  return getPlanMapByAudience('employer');
};

const getJobSeekerPlanMap = async () => {
  return getPlanMapByAudience('jobseeker');
};

const getPlanMapByAudience = async (audience) => {
  const plans = await getPlansByAudience(audience, { includeInactive: true });
  return plans.reduce((acc, plan) => {
    acc[plan.id] = plan;
    return acc;
  }, {});
};

module.exports = {
  EMPLOYER_PLAN_IDS,
  JOBSEEKER_PLAN_IDS,
  ALLOWED_AUDIENCES,
  FEATURE_REGISTRY,
  LIMIT_REGISTRY,
  TEXT_METADATA_FIELDS,
  DEFAULT_PRICING_PLANS,
  defaultEmployerFeatureMap,
  normalizePlan,
  validatePlanCatalogInput,
  ensurePricingConfig,
  getAllPlans,
  getPlansByAudience,
  getEmployerPlanMap,
  getJobSeekerPlanMap,
  getPlanMapByAudience,
};
