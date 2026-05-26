const Application = require('../models/Application');
const Employer = require('../models/Employer');
const Job = require('../models/Job');
const JobSeeker = require('../models/JobSeeker');
const { getPlanMapByAudience } = require('./pricingConfigService');

const OPEN_JOB_STATUSES = ['Pending', 'Active'];
const UNLIMITED_APPLICATION_LIMIT = 999999;

const isActiveSubscription = (subscription) =>
  Boolean(
    subscription &&
      subscription.plan &&
      subscription.status === 'Active' &&
      subscription.isActive !== false
  );

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfCurrentMonth = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const startOfNextMonth = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

const getSubscriptionCycle = (subscription, now = new Date()) => {
  const fallbackStart = startOfCurrentMonth(now);
  const fallbackEnd = startOfNextMonth(now);
  const startDate = toDate(subscription?.startDate);
  const endDate = toDate(subscription?.endDate);

  if (startDate && endDate && endDate > startDate) {
    return { cycleStart: startDate, cycleEnd: endDate };
  }

  return { cycleStart: fallbackStart, cycleEnd: fallbackEnd };
};

const safeRecord = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const numberLimit = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getPlanForOwner = async (audience, owner) => {
  const fallbackPlanId = audience === 'employer' ? 'Free' : '';
  const planId = owner?.subscription?.plan || fallbackPlanId;
  if (!planId) return null;

  const planMap = await getPlanMapByAudience(audience);
  return planMap[planId] || null;
};

const buildSubscriptionSnapshot = (audience, plan) => {
  if (!plan) {
    return {
      planName: '',
      features: null,
      capabilities: { features: {}, limits: {}, metadata: {} },
    };
  }

  return {
    planName: plan.displayName || plan.id,
    features: audience === 'employer' ? plan.subscriptionFeatures || null : null,
    capabilities: {
      features: safeRecord(plan.features),
      limits: safeRecord(plan.limits),
      metadata: safeRecord(plan.metadata),
    },
  };
};

const buildBaseEntitlements = ({ audience, owner, plan, now = new Date() }) => {
  const active = isActiveSubscription(owner?.subscription);
  const snapshot = safeRecord(owner?.subscription?.capabilities);
  const features = {
    ...safeRecord(snapshot.features),
    ...safeRecord(plan?.features),
  };
  const limits = {
    ...safeRecord(snapshot.limits),
    ...safeRecord(plan?.limits),
  };
  const metadata = {
    ...safeRecord(snapshot.metadata),
    ...safeRecord(plan?.metadata),
  };
  const cycle = getSubscriptionCycle(owner?.subscription, now);

  return {
    active,
    audience,
    planId: owner?.subscription?.plan || plan?.id || null,
    planName: plan?.displayName || owner?.subscription?.planName || owner?.subscription?.plan || null,
    features,
    limits,
    metadata,
    ...cycle,
  };
};

const openJobLimitFilter = ({ employerId, excludeJobId, now = new Date() }) => {
  const filter = {
    employer: employerId,
    status: { $in: OPEN_JOB_STATUSES },
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: now } },
    ],
  };

  if (excludeJobId) {
    filter._id = { $ne: excludeJobId };
  }

  return filter;
};

const countOpenJobsForEmployer = (employerId, options = {}) =>
  Job.countDocuments(openJobLimitFilter({ employerId, ...options }));

const cycleApplicationFilter = ({ ownerField, ownerId, cycleStart, cycleEnd, excludeApplicationId }) => {
  const filter = {
    [ownerField]: ownerId,
    appliedAt: {
      $gte: cycleStart,
      $lt: cycleEnd,
    },
  };

  if (excludeApplicationId) {
    filter._id = { $ne: excludeApplicationId };
  }

  return filter;
};

const countApplicationsForCycle = ({ ownerField, ownerId, cycleStart, cycleEnd, excludeApplicationId }) =>
  Application.countDocuments(
    cycleApplicationFilter({ ownerField, ownerId, cycleStart, cycleEnd, excludeApplicationId })
  );

const getEmployerEntitlements = async (employer, options = {}) => {
  const now = options.now || new Date();
  const plan = await getPlanForOwner('employer', employer);
  const base = buildBaseEntitlements({ audience: 'employer', owner: employer, plan, now });
  const maxJobPosts = numberLimit(
    base.limits.maxJobPosts ?? employer?.subscription?.features?.maxJobPosts,
    1
  );
  const unlimitedApplications =
    base.features.unlimitedApplications === true ||
    employer?.subscription?.features?.unlimitedApplications === true;
  const maxApplications = unlimitedApplications
    ? UNLIMITED_APPLICATION_LIMIT
    : numberLimit(
        base.limits.maxApplications ?? employer?.subscription?.features?.maxApplications,
        10
      );
  const [openJobPosts, applicationsThisCycle] = await Promise.all([
    countOpenJobsForEmployer(employer._id, {
      excludeJobId: options.excludeJobId,
      now,
    }),
    countApplicationsForCycle({
      ownerField: 'employer',
      ownerId: employer._id,
      cycleStart: base.cycleStart,
      cycleEnd: base.cycleEnd,
      excludeApplicationId: options.excludeApplicationId,
    }),
  ]);

  const canPostJob = openJobPosts < maxJobPosts;
  const canReceiveApplications = unlimitedApplications || applicationsThisCycle < maxApplications;

  return {
    ...base,
    usage: {
      openJobPosts,
      maxJobPosts,
      remainingJobPosts: Math.max(0, maxJobPosts - openJobPosts),
      canPostJob,
      canUseFeaturedJobs: base.features.featuredJobPosts === true,
      applicationsThisCycle,
      maxApplications,
      unlimitedApplications,
      remainingApplications: unlimitedApplications
        ? null
        : Math.max(0, maxApplications - applicationsThisCycle),
      canReceiveApplications,
    },
  };
};

const getJobSeekerEntitlements = async (jobSeeker, options = {}) => {
  const now = options.now || new Date();
  const plan = await getPlanForOwner('jobseeker', jobSeeker);
  const base = buildBaseEntitlements({ audience: 'jobseeker', owner: jobSeeker, plan, now });
  const hasApplicationLimit =
    base.active &&
    Object.prototype.hasOwnProperty.call(base.limits, 'maxApplications');
  const maxApplications = hasApplicationLimit
    ? numberLimit(base.limits.maxApplications, 0)
    : null;
  const applicationsThisCycle = await countApplicationsForCycle({
    ownerField: 'jobSeeker',
    ownerId: jobSeeker._id,
    cycleStart: base.cycleStart,
    cycleEnd: base.cycleEnd,
    excludeApplicationId: options.excludeApplicationId,
  });
  const canApply = !hasApplicationLimit || applicationsThisCycle < maxApplications;

  return {
    ...base,
    usage: {
      applicationsThisCycle,
      maxApplications,
      hasApplicationLimit,
      remainingApplications: hasApplicationLimit
        ? Math.max(0, maxApplications - applicationsThisCycle)
        : null,
      canApply,
    },
  };
};

const getOwnerEntitlements = async (audience, owner, options = {}) => {
  if (audience === 'employer') {
    return getEmployerEntitlements(owner, options);
  }
  if (audience === 'jobseeker') {
    return getJobSeekerEntitlements(owner, options);
  }
  return null;
};

const isOpenJobStatus = (status) => OPEN_JOB_STATUSES.includes(status);

const getEmployerJobBarrier = async ({
  employer,
  targetStatus,
  wantsFeatured,
  excludeJobId,
  enforceJobLimit = true,
}) => {
  const entitlements = await getEmployerEntitlements(employer, { excludeJobId });

  if (wantsFeatured && entitlements.usage.canUseFeaturedJobs !== true) {
    return {
      field: 'isFeatured',
      message: 'Featured job posts are not included in your current plan.',
      entitlements,
    };
  }

  if (enforceJobLimit && isOpenJobStatus(targetStatus) && !entitlements.usage.canPostJob) {
    return {
      field: 'maxJobPosts',
      message: `Your plan allows ${entitlements.usage.maxJobPosts} open job post${entitlements.usage.maxJobPosts === 1 ? '' : 's'}. Upgrade your plan or close an existing job to post more.`,
      entitlements,
    };
  }

  return null;
};

const getApplicationBarrier = async ({ employer, jobSeeker, existingApplication }) => {
  const excludeApplicationId = existingApplication?._id;
  const employerEntitlements = await getEmployerEntitlements(employer, { excludeApplicationId });

  if (!employerEntitlements.usage.canReceiveApplications) {
    return {
      field: 'maxApplications',
      message: 'This employer has reached the application limit for the current billing cycle.',
      entitlements: employerEntitlements,
    };
  }

  const jobSeekerEntitlements = await getJobSeekerEntitlements(jobSeeker, { excludeApplicationId });

  if (
    jobSeekerEntitlements.usage.hasApplicationLimit &&
    !jobSeekerEntitlements.usage.canApply
  ) {
    return {
      field: 'maxApplications',
      message: 'You have reached your application limit for the current billing cycle.',
      entitlements: jobSeekerEntitlements,
    };
  }

  return null;
};

const matchedCountOf = (result) =>
  Number(result?.matchedCount ?? result?.n ?? result?.modifiedCount ?? result?.nModified ?? 0);

const modifiedCountOf = (result) =>
  Number(result?.modifiedCount ?? result?.nModified ?? 0);

const syncSubscribersForPlans = async (plans) => {
  const employerPlans = (plans || []).filter((plan) => plan.audience === 'employer');
  const jobSeekerPlans = (plans || []).filter((plan) => plan.audience === 'jobseeker');

  const employerResults = await Promise.all(
    employerPlans.map((plan) => {
      const snapshot = buildSubscriptionSnapshot('employer', plan);
      return Employer.updateMany(
        { 'subscription.plan': plan.id },
        {
          $set: {
            'subscription.planName': snapshot.planName,
            'subscription.features': snapshot.features,
            'subscription.capabilities': snapshot.capabilities,
          },
        }
      );
    })
  );

  const jobSeekerResults = await Promise.all(
    jobSeekerPlans.map((plan) => {
      const snapshot = buildSubscriptionSnapshot('jobseeker', plan);
      return JobSeeker.updateMany(
        { 'subscription.plan': plan.id },
        {
          $set: {
            'subscription.planName': snapshot.planName,
            'subscription.capabilities': snapshot.capabilities,
          },
        }
      );
    })
  );

  const employerMatched = employerResults.reduce((sum, result) => sum + matchedCountOf(result), 0);
  const employerModified = employerResults.reduce((sum, result) => sum + modifiedCountOf(result), 0);
  const jobSeekerMatched = jobSeekerResults.reduce((sum, result) => sum + matchedCountOf(result), 0);
  const jobSeekerModified = jobSeekerResults.reduce((sum, result) => sum + modifiedCountOf(result), 0);

  return {
    employers: {
      matched: employerMatched,
      modified: employerModified,
    },
    jobSeekers: {
      matched: jobSeekerMatched,
      modified: jobSeekerModified,
    },
    syncedSubscriberCount: employerMatched + jobSeekerMatched,
    modifiedSubscriberCount: employerModified + jobSeekerModified,
  };
};

module.exports = {
  OPEN_JOB_STATUSES,
  UNLIMITED_APPLICATION_LIMIT,
  buildSubscriptionSnapshot,
  countOpenJobsForEmployer,
  getApplicationBarrier,
  getEmployerEntitlements,
  getEmployerJobBarrier,
  getJobSeekerEntitlements,
  getOwnerEntitlements,
  getSubscriptionCycle,
  isActiveSubscription,
  isOpenJobStatus,
  openJobLimitFilter,
  syncSubscribersForPlans,
};
