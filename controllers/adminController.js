const User = require('../models/User');
const Employer = require('../models/Employer');
const Job = require('../models/Job');
const Application = require('../models/Application');
const AdminPricingConfig = require('../models/AdminPricingConfig');
const {
  EMPLOYER_PLAN_IDS,
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
} = require('../services/pricingConfigService');
const {
  successResponse,
  errorResponse,
  notFoundResponse,
  validationErrorResponse,
} = require('../utils/response');
const {
  buildSubscriptionSnapshot,
  syncSubscribersForPlans,
} = require('../services/planEntitlementService');

const ALLOWED_SUBSCRIPTION_PLANS = EMPLOYER_PLAN_IDS;
const ALLOWED_SUBSCRIPTION_STATUSES = ['Active', 'Inactive', 'Cancelled', 'Expired'];

const parsePagination = (query, defaultLimit = 20) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, parseInt(query.limit, 10) || defaultLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const monthBucketStart = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const getMonthRanges = (count) => {
  const now = new Date();
  const endMonth = monthBucketStart(now);
  const ranges = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    const start = new Date(Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    ranges.push({
      key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
      label: start.toLocaleString('en-US', { month: 'short' }),
      start,
      end,
    });
  }

  return ranges;
};

const distributionMap = (rows) =>
  rows.reduce((acc, row) => {
    acc[row._id || 'Unknown'] = row.count;
    return acc;
  }, {});

const setNoStoreCacheHeaders = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
};


// GET /api/admin/users
exports.listUsers = async (req, res) => {
  try {
    const { q, role, isActive, isBlocked } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const filters = {};

    if (role) filters.role = role;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (isBlocked !== undefined) filters.isBlocked = isBlocked === 'true';
    if (q) {
      filters.$or = [
        { email: new RegExp(q, 'i') },
        { firstName: new RegExp(q, 'i') },
        { lastName: new RegExp(q, 'i') },
      ];
    }

    const [items, total] = await Promise.all([
      User.find(filters).select('-password').sort('-createdAt').skip(skip).limit(limit),
      User.countDocuments(filters),
    ]);

    return successResponse(res, 200, 'Users fetched', { items, total, page, limit });
  } catch (err) {
    console.error('Admin list users error:', err);
    return errorResponse(res, 500, 'Failed to fetch users');
  }
};

// PATCH /api/admin/users/:id/status
exports.updateUserStatus = async (req, res) => {
  try {
    const { isActive, isBlocked } = req.body;
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return notFoundResponse(res, 'User not found');

    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (typeof isBlocked === 'boolean') user.isBlocked = isBlocked;
    await user.save();

    return successResponse(res, 200, 'User status updated', { user });
  } catch (err) {
    console.error('Admin update user status error:', err);
    return errorResponse(res, 500, 'Failed to update user');
  }
};

// PATCH /api/admin/users/:id/role
exports.changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = ['jobseeker', 'employer', 'admin'];
    if (!allowed.includes(role)) {
      return validationErrorResponse(res, [{ field: 'role', message: 'Invalid role' }]);
    }

    const user = await User.findById(req.params.id).select('-password');
    if (!user) return notFoundResponse(res, 'User not found');

    user.role = role;
    await user.save();
    return successResponse(res, 200, 'User role updated', { user });
  } catch (err) {
    console.error('Admin change role error:', err);
    return errorResponse(res, 500, 'Failed to change role');
  }
};

// GET /api/admin/employers
exports.listEmployers = async (req, res) => {
  try {
    const { isVerified, q } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const filters = {};

    if (isVerified !== undefined) filters['verification.isVerified'] = isVerified === 'true';
    if (q) {
      filters.$or = [
        { organizationName: new RegExp(q, 'i') },
        { 'address.city': new RegExp(q, 'i') },
        { 'address.state': new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
      ];
    }

    const [items, total] = await Promise.all([
      Employer.find(filters).sort('-createdAt').skip(skip).limit(limit),
      Employer.countDocuments(filters),
    ]);

    return successResponse(res, 200, 'Employers fetched', { items, total, page, limit });
  } catch (err) {
    console.error('Admin list employers error:', err);
    return errorResponse(res, 500, 'Failed to fetch employers');
  }
};

// PATCH /api/admin/employers/:id/verify
exports.verifyEmployer = async (req, res) => {
  try {
    const employer = await Employer.findById(req.params.id);
    if (!employer) return notFoundResponse(res, 'Employer not found');

    employer.verification.isVerified = true;
    employer.verification.verifiedAt = new Date();
    employer.verification.verifiedBy = req.user._id;
    await employer.save();

    return successResponse(res, 200, 'Employer verified', { employer });
  } catch (err) {
    console.error('Admin verify employer error:', err);
    return errorResponse(res, 500, 'Failed to verify employer');
  }
};

// PATCH /api/admin/employers/:id/unverify
exports.unverifyEmployer = async (req, res) => {
  try {
    const employer = await Employer.findById(req.params.id);
    if (!employer) return notFoundResponse(res, 'Employer not found');

    employer.verification.isVerified = false;
    employer.verification.verifiedAt = undefined;
    employer.verification.verifiedBy = undefined;
    await employer.save();

    return successResponse(res, 200, 'Employer unverified', { employer });
  } catch (err) {
    console.error('Admin unverify employer error:', err);
    return errorResponse(res, 500, 'Failed to unverify employer');
  }
};

// GET /api/admin/jobs
exports.listJobs = async (req, res) => {
  try {
    const { q, status, jobType } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const filters = {};

    if (status) filters.status = status;
    if (jobType) filters.jobType = jobType;
    if (q) {
      filters.$or = [
        { title: new RegExp(q, 'i') },
        { specialization: new RegExp(q, 'i') },
        { organizationName: new RegExp(q, 'i') },
        { 'location.city': new RegExp(q, 'i') },
        { 'location.state': new RegExp(q, 'i') },
      ];
    }

    const [items, total] = await Promise.all([
      Job.find(filters)
        .populate('employer', 'organizationName')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      Job.countDocuments(filters),
    ]);

    return successResponse(res, 200, 'Admin jobs fetched', { items, total, page, limit });
  } catch (err) {
    console.error('Admin list jobs error:', err);
    return errorResponse(res, 500, 'Failed to fetch jobs');
  }
};

// GET /api/admin/pricing-plans
exports.getPricingPlans = async (req, res) => {
  try {
    setNoStoreCacheHeaders(res);
    const plans = await getAllPlans({ includeInactive: true });
    return successResponse(res, 200, 'Pricing plans fetched', {
      plans,
      employerPlans: plans.filter((plan) => plan.audience === 'employer'),
      jobSeekerPlans: plans.filter((plan) => plan.audience === 'jobseeker'),
      featureRegistry: FEATURE_REGISTRY,
      limitRegistry: LIMIT_REGISTRY,
      textMetadataFields: TEXT_METADATA_FIELDS,
    });
  } catch (err) {
    console.error('Admin get pricing plans error:', err);
    return errorResponse(res, 500, 'Failed to fetch pricing plans');
  }
};

// PUT /api/admin/pricing-plans
exports.updatePricingPlans = async (req, res) => {
  try {
    setNoStoreCacheHeaders(res);
    const forceReseed = req.body?.forceReseed === true;
    const inputPlans = req.body?.plans;
    if (!Array.isArray(inputPlans)) {
      return validationErrorResponse(res, [{ field: 'plans', message: 'Plans array is required' }]);
    }

    if (forceReseed || inputPlans.length === 0) {
      const resetPlans = DEFAULT_PRICING_PLANS.map((plan) => normalizePlan(plan, plan));
      await ensurePricingConfig();
      await AdminPricingConfig.findOneAndUpdate(
        { key: 'default' },
        { $set: { plans: resetPlans } },
        { new: true, runValidators: true }
      );
      const plans = await getAllPlans({ includeInactive: true });
      const syncSummary = await syncSubscribersForPlans(plans);
      return successResponse(res, 200, 'Pricing plans reset to defaults', {
        plans,
        featureRegistry: FEATURE_REGISTRY,
        limitRegistry: LIMIT_REGISTRY,
        textMetadataFields: TEXT_METADATA_FIELDS,
        syncSummary,
      });
    }

    const validationErrors = validatePlanCatalogInput(inputPlans);
    if (validationErrors.length > 0) {
      return validationErrorResponse(res, validationErrors);
    }

    const invalidEmployerIds = inputPlans
      .filter((plan) => plan?.audience === 'employer')
      .map((plan) => plan?.id)
      .filter((id) => !ALLOWED_SUBSCRIPTION_PLANS.includes(id));
    if (invalidEmployerIds.length > 0) {
      return validationErrorResponse(res, [
        { field: 'id', message: 'Employer plan id must be one of Free, Basic, Premium, Enterprise' },
      ]);
    }

    const defaultMap = DEFAULT_PRICING_PLANS.reduce((acc, plan) => {
      acc[`${plan.audience}:${plan.id}`] = plan;
      return acc;
    }, {});

    const config = await ensurePricingConfig();
    const existingMap = (config.plans || []).reduce((acc, plan) => {
      acc[`${plan.audience}:${plan.id}`] = normalizePlan(plan.toObject ? plan.toObject() : plan);
      return acc;
    }, {});
    const inputMap = inputPlans.reduce((acc, plan) => {
      acc[`${plan.audience}:${plan.id}`] = plan;
      return acc;
    }, {});

    const keys = new Set([
      ...Object.keys(defaultMap),
      ...Object.keys(existingMap),
      ...Object.keys(inputMap),
    ]);

    const merged = [...keys].map((key) =>
      normalizePlan(
        {
          ...(defaultMap[key] || {}),
          ...(existingMap[key] || {}),
          ...(inputMap[key] || {}),
        },
        defaultMap[key] || existingMap[key] || inputMap[key]
      )
    );

    const hasEmployerDefaults = merged.some(
      (plan) => plan.audience === 'employer' && plan.id === 'Free'
    );
    if (!hasEmployerDefaults) {
      return validationErrorResponse(res, [
        { field: 'plans', message: 'Employer Free plan must exist' },
      ]);
    }

    await AdminPricingConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: { plans: merged } },
      { new: true, runValidators: true }
    );
    const plans = await getAllPlans({ includeInactive: true });
    const syncSummary = await syncSubscribersForPlans(plans);

    return successResponse(res, 200, 'Pricing plans updated', {
      plans,
      featureRegistry: FEATURE_REGISTRY,
      limitRegistry: LIMIT_REGISTRY,
      textMetadataFields: TEXT_METADATA_FIELDS,
      syncSummary,
    });
  } catch (err) {
    console.error('Admin update pricing plans error:', err);
    return errorResponse(res, 500, 'Failed to update pricing plans');
  }
};

// GET /api/admin/subscriptions
exports.listSubscriptions = async (req, res) => {
  try {
    setNoStoreCacheHeaders(res);
    const { q, plan, status, autoRenew } = req.query;
    const { page, limit, skip } = parsePagination(req.query);
    const employerPlans = await getPlansByAudience('employer', { includeInactive: true });
    const byId = employerPlans.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    const filters = {};
    if (plan) filters['subscription.plan'] = plan;
    if (status) filters['subscription.status'] = status;
    if (autoRenew !== undefined) filters['subscription.autoRenew'] = autoRenew === 'true';
    if (q) {
      filters.$or = [
        { organizationName: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { 'address.city': new RegExp(q, 'i') },
        { 'address.state': new RegExp(q, 'i') },
      ];
    }

    const [items, total, byPlanRows, byStatusRows, renewalDueSoon] = await Promise.all([
      Employer.find(filters)
        .select(
          'organizationName email address subscription stats verification createdAt'
        )
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      Employer.countDocuments(filters),
      Employer.aggregate([
        { $match: filters },
        { $group: { _id: '$subscription.plan', count: { $sum: 1 } } },
      ]),
      Employer.aggregate([
        { $match: filters },
        { $group: { _id: '$subscription.status', count: { $sum: 1 } } },
      ]),
      Employer.countDocuments({
        ...filters,
        'subscription.status': 'Active',
        'subscription.endDate': {
          $gte: new Date(),
          $lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    const byPlan = distributionMap(byPlanRows);
    const byStatus = distributionMap(byStatusRows);

    const estimatedMrr = Object.entries(byPlan).reduce((sum, [planName, count]) => {
      const price = byId[planName]?.price || 0;
      return sum + price * count;
    }, 0);

    return successResponse(res, 200, 'Subscriptions fetched', {
      items,
      total,
      page,
      limit,
      overview: {
        byPlan,
        byStatus,
        estimatedMrr,
        renewalDueSoon,
      },
      plans: employerPlans,
    });
  } catch (err) {
    console.error('Admin list subscriptions error:', err);
    return errorResponse(res, 500, 'Failed to fetch subscriptions');
  }
};

// PATCH /api/admin/subscriptions/:id
exports.updateEmployerSubscription = async (req, res) => {
  try {
    const employer = await Employer.findById(req.params.id);
    if (!employer) return notFoundResponse(res, 'Employer not found');
    const byId = await getEmployerPlanMap();

    const { plan, status, autoRenew, startDate, endDate } = req.body || {};

    if (plan !== undefined && !ALLOWED_SUBSCRIPTION_PLANS.includes(plan)) {
      return validationErrorResponse(res, [{ field: 'plan', message: 'Invalid plan' }]);
    }

    if (status !== undefined && !ALLOWED_SUBSCRIPTION_STATUSES.includes(status)) {
      return validationErrorResponse(res, [{ field: 'status', message: 'Invalid status' }]);
    }

    const updates = {};

    if (plan !== undefined) {
      const snapshot = buildSubscriptionSnapshot('employer', byId[plan]);
      updates['subscription.plan'] = plan;
      updates['subscription.planName'] = snapshot.planName || plan;
      updates['subscription.features'] = snapshot.features || defaultEmployerFeatureMap.Free;
      updates['subscription.capabilities'] = snapshot.capabilities;
    }

    if (status !== undefined) {
      updates['subscription.status'] = status;
    }

    if (typeof autoRenew === 'boolean') {
      updates['subscription.autoRenew'] = autoRenew;
    }

    if (startDate !== undefined) {
      if (startDate === null || startDate === '') {
        updates['subscription.startDate'] = undefined;
      } else {
        const parsedStart = new Date(startDate);
        if (Number.isNaN(parsedStart.getTime())) {
          return validationErrorResponse(res, [{ field: 'startDate', message: 'Invalid start date' }]);
        }
        updates['subscription.startDate'] = parsedStart;
      }
    }

    if (endDate !== undefined) {
      if (endDate === null || endDate === '') {
        updates['subscription.endDate'] = undefined;
      } else {
        const parsedEnd = new Date(endDate);
        if (Number.isNaN(parsedEnd.getTime())) {
          return validationErrorResponse(res, [{ field: 'endDate', message: 'Invalid end date' }]);
        }
        updates['subscription.endDate'] = parsedEnd;
      }
    }

    if (
      updates['subscription.startDate'] &&
      updates['subscription.endDate'] &&
      updates['subscription.endDate'] < updates['subscription.startDate']
    ) {
      return validationErrorResponse(res, [
        { field: 'endDate', message: 'End date must be after start date' },
      ]);
    }

    if (
      !updates['subscription.startDate'] &&
      status === 'Active' &&
      !employer.subscription.startDate
    ) {
      updates['subscription.startDate'] = new Date();
    }

    Object.entries(updates).forEach(([key, value]) => {
      employer.set(key, value);
    });

    await employer.save();

    return successResponse(res, 200, 'Subscription updated', { employer });
  } catch (err) {
    console.error('Admin update subscription error:', err);
    return errorResponse(res, 500, 'Failed to update subscription');
  }
};

// GET /api/admin/stats
exports.getStats = async (req, res) => {
  try {
    const byId = await getEmployerPlanMap();
    const [users, employers, jobs, applications, verifiedEmployers, activeJobs, activeSubscriptions] =
      await Promise.all([
        User.countDocuments({}),
        Employer.countDocuments({}),
        Job.countDocuments({}),
        Application.countDocuments({}),
        Employer.countDocuments({ 'verification.isVerified': true }),
        Job.countDocuments({ status: 'Active' }),
        Employer.countDocuments({
          'subscription.status': 'Active',
          'subscription.plan': { $ne: 'Free' },
        }),
      ]);

    const subscriptionsByPlanRows = await Employer.aggregate([
      { $group: { _id: '$subscription.plan', count: { $sum: 1 } } },
    ]);
    const subscriptionsByPlan = distributionMap(subscriptionsByPlanRows);

    const estimatedMrr = Object.entries(subscriptionsByPlan).reduce((sum, [planName, count]) => {
      const price = byId[planName]?.price || 0;
      return sum + price * count;
    }, 0);

    return successResponse(res, 200, 'Stats fetched', {
      users,
      employers,
      jobs,
      applications,
      verifiedEmployers,
      activeJobs,
      activeSubscriptions,
      estimatedMrr,
      subscriptionsByPlan,
    });
  } catch (err) {
    console.error('Admin get stats error:', err);
    return errorResponse(res, 500, 'Failed to fetch stats');
  }
};

// GET /api/admin/analytics
exports.getAnalytics = async (req, res) => {
  try {
    const byId = await getEmployerPlanMap();
    const months = Math.min(12, Math.max(3, parseInt(req.query.months, 10) || 6));
    const ranges = getMonthRanges(months);

    const monthly = await Promise.all(
      ranges.map(async (range) => {
        const createdWindow = { $gte: range.start, $lt: range.end };
        const [users, employers, jobs, applications] = await Promise.all([
          User.countDocuments({ createdAt: createdWindow }),
          Employer.countDocuments({ createdAt: createdWindow }),
          Job.countDocuments({ createdAt: createdWindow }),
          Application.countDocuments({ createdAt: createdWindow }),
        ]);

        return {
          month: range.label,
          key: range.key,
          users,
          employers,
          jobs,
          applications,
        };
      })
    );

    const [jobStatusRows, subPlanRows, subStatusRows, roleRows] = await Promise.all([
      Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Employer.aggregate([{ $group: { _id: '$subscription.plan', count: { $sum: 1 } } }]),
      Employer.aggregate([{ $group: { _id: '$subscription.status', count: { $sum: 1 } } }]),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    ]);

    const subscriptionPlans = distributionMap(subPlanRows);
    const estimatedMrr = Object.entries(subscriptionPlans).reduce((sum, [planName, count]) => {
      const price = byId[planName]?.price || 0;
      return sum + price * count;
    }, 0);

    return successResponse(res, 200, 'Analytics fetched', {
      monthly,
      distributions: {
        jobStatus: distributionMap(jobStatusRows),
        subscriptionPlans,
        subscriptionStatus: distributionMap(subStatusRows),
        userRoles: distributionMap(roleRows),
      },
      estimatedMrr,
    });
  } catch (err) {
    console.error('Admin analytics error:', err);
    return errorResponse(res, 500, 'Failed to fetch analytics');
  }
};
