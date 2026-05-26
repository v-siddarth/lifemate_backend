const {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  forbiddenResponse,
} = require('../utils/response');
const {
  getAllPlans,
  getPlansByAudience,
  getEmployerPlanMap,
  getPlanMapByAudience,
  FEATURE_REGISTRY,
  LIMIT_REGISTRY,
  TEXT_METADATA_FIELDS,
} = require('../services/pricingConfigService');
const Employer = require('../models/Employer');
const JobSeeker = require('../models/JobSeeker');
const SubscriptionEventLog = require('../models/SubscriptionEventLog');
const {
  getRazorpayCredentials,
  resolveSubscriptionPlan,
  createSubscription,
  cancelSubscription,
  fetchSubscription,
  fetchPayment,
  verifySubscriptionPaymentSignature,
  verifyWebhookSignature,
} = require('../services/razorpayService');
const { getOwnerEntitlements } = require('../services/planEntitlementService');

const setNoStoreCacheHeaders = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
};

const inferAudienceFromUser = (user) => {
  if (!user) return null;
  if (user.role === 'employer') return 'employer';
  if (user.role === 'jobseeker') return 'jobseeker';
  return null;
};

const resolveSubscriptionStatus = (value) => {
  const status = String(value || '').toLowerCase();
  if (!status) return undefined;
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'completed' || status === 'expired') return 'Expired';
  if (status === 'halted' || status === 'pending' || status === 'paused') return 'Inactive';
  return 'Active';
};

const toDateFromUnix = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return new Date(number * 1000);
};

const resolvePaymentStatus = (value) => {
  const status = String(value || '').toLowerCase();
  if (!status) return 'paid';
  if (status === 'captured' || status === 'authorized') return 'paid';
  return status;
};

const isActiveSubscription = (subscription) =>
  Boolean(
    subscription &&
      subscription.plan &&
      subscription.status === 'Active' &&
      subscription.isActive !== false
  );

const getSubscriptionOwnerContext = async (user, { createJobSeeker = false } = {}) => {
  const audience = inferAudienceFromUser(user);
  if (audience === 'employer') {
    const owner = await Employer.findOne({ user: user._id });
    return { audience, owner, ownerIdField: 'employerId', displayName: owner?.organizationName || '' };
  }

  if (audience === 'jobseeker') {
    let owner = await JobSeeker.findOne({ user: user._id });
    if (!owner && createJobSeeker) {
      owner = await JobSeeker.create({ user: user._id });
    }
    return {
      audience,
      owner,
      ownerIdField: 'jobSeekerId',
      displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    };
  }

  return { audience: null, owner: null, ownerIdField: null, displayName: '' };
};

const getProfileNotFoundMessage = (audience) =>
  audience === 'jobseeker' ? 'Job seeker profile not found' : 'Employer profile not found';

const getRazorpayErrorDetails = (err) => {
  const statusCode = Number(err?.statusCode || err?.response?.status);
  const error = err?.error || err?.response?.data?.error || null;
  return {
    statusCode: Number.isFinite(statusCode) ? statusCode : 502,
    code: error?.code || undefined,
    description: error?.description || err?.message || undefined,
    reason: error?.reason || undefined,
    source: error?.source || undefined,
    step: error?.step || undefined,
  };
};

const isRazorpayPlanConfigurationError = (err) =>
  Boolean(err?.isRazorpayPlanConfigurationError);

const sanitizeWebhookPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return {};
  return payload;
};

const applyPaidPlanToEmployer = async ({
  employer,
  planId,
  razorpaySubscriptionId,
  razorpayStatus,
  invoiceId,
  paymentId,
  eventId,
  eventCreatedAt,
  subscriptionEntity,
}) => {
  const planMap = await getEmployerPlanMap();
  const targetPlan = planMap[planId];
  if (!targetPlan) {
    throw new Error(`Employer plan not found for id: ${planId}`);
  }

  employer.subscription.plan = planId;
  employer.subscription.planId = subscriptionEntity?.plan_id || employer.subscription.planId;
  employer.subscription.planName = targetPlan.displayName || planId;
  employer.subscription.userType = 'employer';
  employer.subscription.subscriptionId =
    razorpaySubscriptionId || employer.subscription.subscriptionId;
  employer.subscription.paymentId = paymentId || employer.subscription.paymentId;
  employer.subscription.paymentStatus = resolvePaymentStatus(
    subscriptionEntity?.payment_status || subscriptionEntity?.status || 'paid'
  );
  employer.subscription.pendingPlan = undefined;
  employer.subscription.features = targetPlan.subscriptionFeatures;
  employer.subscription.capabilities = {
    features: targetPlan.features || {},
    limits: targetPlan.limits || {},
    metadata: targetPlan.metadata || {},
  };
  employer.subscription.status = resolveSubscriptionStatus(razorpayStatus) || 'Active';
  employer.subscription.isActive = employer.subscription.status === 'Active';
  employer.subscription.autoRenew = !['cancelled', 'completed', 'expired'].includes(
    String(razorpayStatus || '').toLowerCase()
  );
  employer.subscription.startDate =
    toDateFromUnix(subscriptionEntity?.current_start) || employer.subscription.startDate || new Date();
  employer.subscription.endDate =
    toDateFromUnix(subscriptionEntity?.current_end) || employer.subscription.endDate;

  employer.subscription.razorpay = {
    ...(employer.subscription.razorpay || {}),
    provider: 'razorpay',
    planId: subscriptionEntity?.plan_id || employer.subscription.razorpay?.planId,
    subscriptionId: razorpaySubscriptionId || employer.subscription.razorpay?.subscriptionId,
    status: String(razorpayStatus || employer.subscription.razorpay?.status || '').toLowerCase(),
    shortUrl: subscriptionEntity?.short_url || employer.subscription.razorpay?.shortUrl,
    currentStart:
      toDateFromUnix(subscriptionEntity?.current_start) || employer.subscription.razorpay?.currentStart,
    currentEnd:
      toDateFromUnix(subscriptionEntity?.current_end) || employer.subscription.razorpay?.currentEnd,
    chargeAt: toDateFromUnix(subscriptionEntity?.charge_at) || employer.subscription.razorpay?.chargeAt,
    endAt: toDateFromUnix(subscriptionEntity?.end_at) || employer.subscription.razorpay?.endAt,
    lastPaymentId: paymentId || employer.subscription.razorpay?.lastPaymentId,
    lastInvoiceId: invoiceId || employer.subscription.razorpay?.lastInvoiceId,
    lastWebhookEventId: eventId || employer.subscription.razorpay?.lastWebhookEventId,
    lastWebhookAt: eventCreatedAt || new Date(),
  };
};

const applyPaidPlanToJobSeeker = async ({
  jobSeeker,
  planId,
  razorpaySubscriptionId,
  razorpayStatus,
  invoiceId,
  paymentId,
  eventId,
  eventCreatedAt,
  subscriptionEntity,
  paymentEntity,
}) => {
  const planMap = await getPlanMapByAudience('jobseeker');
  const targetPlan = planMap[planId];
  if (!targetPlan) {
    throw new Error(`Job seeker plan not found for id: ${planId}`);
  }

  jobSeeker.subscription.plan = planId;
  jobSeeker.subscription.planId = subscriptionEntity?.plan_id || jobSeeker.subscription.planId;
  jobSeeker.subscription.planName = targetPlan.displayName || planId;
  jobSeeker.subscription.userType = 'jobseeker';
  jobSeeker.subscription.subscriptionId =
    razorpaySubscriptionId || jobSeeker.subscription.subscriptionId;
  jobSeeker.subscription.paymentId = paymentId || jobSeeker.subscription.paymentId;
  jobSeeker.subscription.paymentStatus = resolvePaymentStatus(paymentEntity?.status || 'paid');
  jobSeeker.subscription.pendingPlan = undefined;
  jobSeeker.subscription.capabilities = {
    features: targetPlan.features || {},
    limits: targetPlan.limits || {},
    metadata: targetPlan.metadata || {},
  };
  jobSeeker.subscription.status = resolveSubscriptionStatus(razorpayStatus) || 'Active';
  jobSeeker.subscription.isActive = jobSeeker.subscription.status === 'Active';
  jobSeeker.subscription.autoRenew = !['cancelled', 'completed', 'expired'].includes(
    String(razorpayStatus || '').toLowerCase()
  );
  jobSeeker.subscription.startDate =
    toDateFromUnix(subscriptionEntity?.current_start) || jobSeeker.subscription.startDate || new Date();
  jobSeeker.subscription.endDate =
    toDateFromUnix(subscriptionEntity?.current_end) || jobSeeker.subscription.endDate;

  jobSeeker.subscription.razorpay = {
    ...(jobSeeker.subscription.razorpay || {}),
    provider: 'razorpay',
    planId: subscriptionEntity?.plan_id || jobSeeker.subscription.razorpay?.planId,
    subscriptionId: razorpaySubscriptionId || jobSeeker.subscription.razorpay?.subscriptionId,
    status: String(razorpayStatus || jobSeeker.subscription.razorpay?.status || '').toLowerCase(),
    shortUrl: subscriptionEntity?.short_url || jobSeeker.subscription.razorpay?.shortUrl,
    currentStart:
      toDateFromUnix(subscriptionEntity?.current_start) ||
      jobSeeker.subscription.razorpay?.currentStart,
    currentEnd:
      toDateFromUnix(subscriptionEntity?.current_end) ||
      jobSeeker.subscription.razorpay?.currentEnd,
    chargeAt: toDateFromUnix(subscriptionEntity?.charge_at) || jobSeeker.subscription.razorpay?.chargeAt,
    endAt: toDateFromUnix(subscriptionEntity?.end_at) || jobSeeker.subscription.razorpay?.endAt,
    lastPaymentId: paymentId || jobSeeker.subscription.razorpay?.lastPaymentId,
    lastInvoiceId: invoiceId || jobSeeker.subscription.razorpay?.lastInvoiceId,
    lastWebhookEventId: eventId || jobSeeker.subscription.razorpay?.lastWebhookEventId,
    lastWebhookAt: eventCreatedAt || new Date(),
  };
};

const applyFreePlanToEmployer = async ({ employer, planId }) => {
  const planMap = await getEmployerPlanMap();
  const plan = planMap[planId];
  if (!plan) {
    throw new Error(`Employer plan not found for id: ${planId}`);
  }
  employer.subscription.plan = planId;
  employer.subscription.planId = planId;
  employer.subscription.planName = plan.displayName || planId;
  employer.subscription.userType = 'employer';
  employer.subscription.subscriptionId = undefined;
  employer.subscription.paymentId = undefined;
  employer.subscription.paymentStatus = 'free';
  employer.subscription.pendingPlan = undefined;
  employer.subscription.features = plan.subscriptionFeatures;
  employer.subscription.capabilities = {
    features: plan.features || {},
    limits: plan.limits || {},
    metadata: plan.metadata || {},
  };
  employer.subscription.status = 'Active';
  employer.subscription.isActive = true;
  employer.subscription.autoRenew = false;
  employer.subscription.startDate = new Date();
  employer.subscription.endDate = undefined;
};

const applyPendingPaidSubscription = ({
  owner,
  audience,
  plan,
  razorpayPlanId,
  checkoutSubscription,
}) => {
  const subscription = owner.subscription || {};
  const currentlyActive = isActiveSubscription(subscription);

  subscription.pendingPlan = plan.id;
  subscription.planId = razorpayPlanId;
  subscription.planName = plan.displayName || plan.id;
  subscription.userType = audience;
  subscription.subscriptionId = checkoutSubscription.id;
  subscription.paymentStatus = 'created';
  subscription.capabilities = {
    features: plan.features || {},
    limits: plan.limits || {},
    metadata: plan.metadata || {},
  };
  subscription.isActive = currentlyActive;
  if (!currentlyActive) {
    subscription.status = 'Inactive';
  }
  subscription.razorpay = {
    ...(subscription.razorpay || {}),
    provider: 'razorpay',
    planId: razorpayPlanId,
    subscriptionId: checkoutSubscription.id,
    status: checkoutSubscription.status,
    shortUrl: checkoutSubscription.short_url,
    chargeAt: toDateFromUnix(checkoutSubscription.charge_at),
    currentStart: toDateFromUnix(checkoutSubscription.current_start),
    currentEnd: toDateFromUnix(checkoutSubscription.current_end),
  };

  owner.subscription = subscription;
};

const applyPaidPlanToOwner = async ({
  owner,
  audience,
  planId,
  razorpaySubscriptionId,
  razorpayStatus,
  invoiceId,
  paymentId,
  eventId,
  eventCreatedAt,
  subscriptionEntity,
  paymentEntity,
}) => {
  if (audience === 'employer') {
    await applyPaidPlanToEmployer({
      employer: owner,
      planId,
      razorpaySubscriptionId,
      razorpayStatus,
      invoiceId,
      paymentId,
      eventId,
      eventCreatedAt,
      subscriptionEntity,
    });
    return;
  }

  await applyPaidPlanToJobSeeker({
    jobSeeker: owner,
    planId,
    razorpaySubscriptionId,
    razorpayStatus,
    invoiceId,
    paymentId,
    eventId,
    eventCreatedAt,
    subscriptionEntity,
    paymentEntity,
  });
};

// GET /api/pricing/plans
exports.listPlans = async (req, res) => {
  try {
    setNoStoreCacheHeaders(res);

    const requestedAudience = req.query.audience;
    if (
      requestedAudience !== undefined &&
      requestedAudience !== 'employer' &&
      requestedAudience !== 'jobseeker'
    ) {
      return validationErrorResponse(res, [
        { field: 'audience', message: 'Audience must be employer or jobseeker' },
      ]);
    }

    const userAudience = inferAudienceFromUser(req.user);
    const audience = userAudience || requestedAudience || null;
    const includeInactive = req.user?.role === 'admin';

    const plans = audience
      ? await getPlansByAudience(audience, { includeInactive })
      : await getAllPlans({ includeInactive });

    const activePlans = plans.filter((plan) => plan.isActive);
    const finalPlans = includeInactive ? plans : activePlans;

    return successResponse(res, 200, 'Pricing plans fetched', {
      audience: audience || 'all',
      plans: finalPlans,
      employerPlans: finalPlans.filter((plan) => plan.audience === 'employer'),
      jobSeekerPlans: finalPlans.filter((plan) => plan.audience === 'jobseeker'),
      featureRegistry: FEATURE_REGISTRY,
      limitRegistry: LIMIT_REGISTRY,
      textMetadataFields: TEXT_METADATA_FIELDS,
    });
  } catch (err) {
    console.error('List pricing plans error:', err);
    return errorResponse(res, 500, 'Failed to fetch pricing plans');
  }
};

// GET /api/pricing/my-subscription
exports.getMySubscription = async (req, res) => {
  try {
    const { audience, owner } = await getSubscriptionOwnerContext(req.user, {
      createJobSeeker: req.user?.role === 'jobseeker',
    });

    if (!audience) {
      return forbiddenResponse(res, 'Only employer and job seeker subscriptions are supported');
    }

    if (!owner) {
      return notFoundResponse(res, getProfileNotFoundMessage(audience));
    }

    const entitlements = await getOwnerEntitlements(audience, owner);

    return successResponse(res, 200, 'Subscription fetched', {
      audience,
      subscription: owner.subscription || null,
      entitlements,
    });
  } catch (err) {
    console.error('Get my subscription error:', err);
    return errorResponse(res, 500, 'Failed to fetch subscription');
  }
};

// POST /api/pricing/checkout-subscription
exports.createCheckoutSubscription = async (req, res) => {
  try {
    const { audience, owner, ownerIdField, displayName } = await getSubscriptionOwnerContext(req.user, {
      createJobSeeker: req.user?.role === 'jobseeker',
    });

    if (!audience) {
      return forbiddenResponse(res, 'Only employer and job seeker subscriptions are supported');
    }

    const { planId } = req.body || {};
    if (!planId || typeof planId !== 'string') {
      return validationErrorResponse(res, [{ field: 'planId', message: 'planId is required' }]);
    }

    const planMap = await getPlanMapByAudience(audience);
    const selectedPlan = planMap[planId];
    if (!selectedPlan || selectedPlan.isActive === false) {
      return validationErrorResponse(res, [{ field: 'planId', message: 'Selected plan is not available' }]);
    }

    if (!owner) {
      return notFoundResponse(res, getProfileNotFoundMessage(audience));
    }

    if (isActiveSubscription(owner.subscription) && owner.subscription.plan === planId) {
      return validationErrorResponse(res, [
        { field: 'planId', message: 'Selected plan is already active' },
      ]);
    }

    if (Number(selectedPlan.price) <= 0) {
      if (audience !== 'employer' || planId !== 'Free') {
        return validationErrorResponse(res, [
          { field: 'planId', message: 'Selected paid plan is missing a positive price' },
        ]);
      }

      await applyFreePlanToEmployer({ employer: owner, planId });
      await owner.save();
      return successResponse(res, 200, 'Free plan activated', {
        paymentRequired: false,
        subscription: owner.subscription,
      });
    }

    const credentials = getRazorpayCredentials();
    if (!credentials) {
      return errorResponse(
        res,
        500,
        'Payment gateway is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET'
      );
    }

    const resolvedPlan = await resolveSubscriptionPlan({ audience, plan: selectedPlan });
    const razorpayPlanId = resolvedPlan.planId;

    const checkoutSubscription = await createSubscription({
      planId: razorpayPlanId,
      notes: {
        userId: String(req.user._id),
        [ownerIdField]: String(owner._id),
        audience,
        appPlanId: planId,
      },
    });

    applyPendingPaidSubscription({
      owner,
      audience,
      plan: selectedPlan,
      razorpayPlanId,
      checkoutSubscription,
    });
    await owner.save();

    console.info('Checkout subscription created', {
      userId: String(req.user._id),
      audience,
      appPlanId: planId,
      subscriptionId: checkoutSubscription.id,
      razorpayPlanId,
      razorpayPlanSource: resolvedPlan.source,
      razorpayPlanCreated: resolvedPlan.created,
    });

    return successResponse(res, 200, 'Checkout subscription created', {
      paymentRequired: true,
      keyId: credentials.keyId,
      subscriptionId: checkoutSubscription.id,
      planId,
      razorpayPlanId,
      amount: selectedPlan.price,
      currency: 'INR',
      name: displayName || 'CareerMed',
      description: `${selectedPlan.displayName} subscription`,
      prefill: {
        name:
          audience === 'employer'
            ? owner.contactPerson?.name || owner.organizationName || ''
            : displayName || '',
        email:
          audience === 'employer'
            ? owner.contactPerson?.email || req.user.email || ''
            : req.user.email || '',
        contact: audience === 'employer' ? owner.contactPerson?.phone || '' : req.user.phone || '',
      },
    });
  } catch (err) {
    if (isRazorpayPlanConfigurationError(err)) {
      console.error('Razorpay plan configuration error:', err.details || err.message);
      return errorResponse(res, 500, err.message);
    }

    const gatewayError = getRazorpayErrorDetails(err);
    console.error('Create checkout subscription error:', {
      statusCode: gatewayError.statusCode,
      code: gatewayError.code,
      description: gatewayError.description,
      reason: gatewayError.reason,
      source: gatewayError.source,
      step: gatewayError.step,
    });

    const message = gatewayError.description
      ? `Payment gateway rejected subscription: ${gatewayError.description}`
      : 'Failed to create checkout subscription';
    const statusCode = gatewayError.statusCode >= 400 && gatewayError.statusCode < 500 ? 400 : 502;
    return errorResponse(res, statusCode, message);
  }
};

// POST /api/pricing/checkout-verify
exports.verifyCheckoutSubscription = async (req, res) => {
  try {
    const { audience, owner } = await getSubscriptionOwnerContext(req.user, {
      createJobSeeker: req.user?.role === 'jobseeker',
    });

    if (!audience) {
      return forbiddenResponse(res, 'Only employer and job seeker subscriptions are supported');
    }

    const {
      planId,
      razorpay_payment_id: paymentId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: signature,
    } = req.body || {};

    if (!planId || !paymentId || !subscriptionId || !signature) {
      return validationErrorResponse(res, [
        { field: 'payment', message: 'planId, razorpay_payment_id, razorpay_subscription_id and razorpay_signature are required' },
      ]);
    }

    const planMap = await getPlanMapByAudience(audience);
    const selectedPlan = planMap[planId];
    if (!selectedPlan || selectedPlan.isActive === false) {
      return validationErrorResponse(res, [{ field: 'planId', message: 'Selected plan is not available' }]);
    }

    const validSignature = verifySubscriptionPaymentSignature({
      subscriptionId,
      paymentId,
      signature,
    });
    if (!validSignature) {
      console.warn('Invalid Razorpay checkout signature', {
        userId: String(req.user?._id || ''),
        audience,
        planId,
        subscriptionId,
        paymentId,
      });
      return errorResponse(res, 400, 'Invalid payment signature');
    }

    if (!owner) {
      return notFoundResponse(res, getProfileNotFoundMessage(audience));
    }

    const currentStoredSubscriptionId =
      owner.subscription?.subscriptionId || owner.subscription?.razorpay?.subscriptionId;
    if (!currentStoredSubscriptionId || currentStoredSubscriptionId !== subscriptionId) {
      return errorResponse(res, 400, 'Subscription mismatch detected');
    }

    const pendingPlanId = owner.subscription?.pendingPlan || owner.subscription?.plan;
    if (pendingPlanId && pendingPlanId !== planId) {
      console.warn('Stored pending plan mismatch during checkout verification', {
        userId: String(req.user._id),
        audience,
        requestPlanId: planId,
        pendingPlanId,
        subscriptionId,
      });
      return errorResponse(res, 400, 'Subscription plan mismatch detected');
    }

    const storedRazorpayPlanId =
      owner.subscription?.razorpay?.planId || owner.subscription?.planId || null;

    let subscriptionEntity = null;
    let paymentEntity = null;
    try {
      subscriptionEntity = await fetchSubscription(subscriptionId);
    } catch (fetchErr) {
      console.warn('Razorpay subscription fetch failed after valid checkout signature', {
        userId: String(req.user._id),
        audience,
        planId,
        subscriptionId,
        error: fetchErr?.message || fetchErr,
      });
    }

    try {
      paymentEntity = await fetchPayment(paymentId);
    } catch (fetchErr) {
      console.warn('Razorpay payment fetch failed after valid checkout signature', {
        userId: String(req.user._id),
        audience,
        planId,
        subscriptionId,
        paymentId,
        error: fetchErr?.message || fetchErr,
      });
    }

    if (
      subscriptionEntity?.plan_id &&
      storedRazorpayPlanId &&
      subscriptionEntity.plan_id !== storedRazorpayPlanId
    ) {
      console.warn('Razorpay subscription plan mismatch', {
        userId: String(req.user._id),
        audience,
        appPlanId: planId,
        expectedRazorpayPlanId: storedRazorpayPlanId,
        actualRazorpayPlanId: subscriptionEntity.plan_id,
        subscriptionId,
      });
      return errorResponse(res, 400, 'Subscription plan mismatch detected');
    }

    const verifiedRazorpayPlanId = subscriptionEntity?.plan_id || storedRazorpayPlanId;
    if (!verifiedRazorpayPlanId) {
      return errorResponse(res, 400, 'Subscription plan details missing');
    }

    if (
      paymentEntity?.subscription_id &&
      String(paymentEntity.subscription_id) !== String(subscriptionId)
    ) {
      console.warn('Razorpay payment subscription mismatch', {
        userId: String(req.user._id),
        audience,
        planId,
        subscriptionId,
        paymentId,
        paymentSubscriptionId: paymentEntity.subscription_id,
      });
      return errorResponse(res, 400, 'Payment subscription mismatch detected');
    }

    await applyPaidPlanToOwner({
      owner,
      audience,
      planId,
      razorpaySubscriptionId: subscriptionId,
      razorpayStatus: subscriptionEntity?.status || 'active',
      invoiceId: paymentEntity?.invoice_id,
      paymentId,
      eventId: 'checkout-verify',
      eventCreatedAt: new Date(),
      subscriptionEntity: {
        ...(subscriptionEntity || {}),
        id: subscriptionId,
        plan_id: subscriptionEntity?.plan_id || verifiedRazorpayPlanId,
        status: subscriptionEntity?.status || 'active',
        current_start: subscriptionEntity?.current_start || Math.floor(Date.now() / 1000),
      },
      paymentEntity,
    });
    await owner.save();

    console.info('Razorpay checkout verified and subscription activated', {
      userId: String(req.user._id),
      audience,
      appPlanId: planId,
      subscriptionId,
      paymentId,
    });

    return successResponse(
      res,
      200,
      'Payment verified and subscription activated.',
      {
        status: 'active',
        subscriptionId,
        paymentId,
        subscription: owner.subscription,
      }
    );
  } catch (err) {
    if (isRazorpayPlanConfigurationError(err)) {
      console.error('Verify checkout Razorpay plan configuration error:', err.details || err.message);
      return errorResponse(res, 500, err.message);
    }

    console.error('Verify checkout subscription error:', err);
    return errorResponse(res, 500, 'Failed to verify checkout subscription');
  }
};

// POST /api/pricing/cancel-subscription
exports.cancelMySubscription = async (req, res) => {
  try {
    if (req.user?.role !== 'employer') {
      return forbiddenResponse(res, 'Only employer subscriptions are currently supported');
    }

    const cancelAtCycleEnd = req.body?.cancelAtCycleEnd !== false;
    const employer = await Employer.findOne({ user: req.user._id });
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    const subscriptionId = employer.subscription?.razorpay?.subscriptionId;
    if (!subscriptionId) {
      return validationErrorResponse(res, [
        { field: 'subscription', message: 'No paid subscription found to cancel' },
      ]);
    }

    const cancelled = await cancelSubscription(subscriptionId, cancelAtCycleEnd);
    employer.subscription.autoRenew = false;
    employer.subscription.razorpay = {
      ...(employer.subscription.razorpay || {}),
      status: cancelled.status || employer.subscription.razorpay?.status,
      endAt: toDateFromUnix(cancelled.end_at) || employer.subscription.razorpay?.endAt,
      currentEnd: toDateFromUnix(cancelled.current_end) || employer.subscription.razorpay?.currentEnd,
      lastWebhookAt: new Date(),
    };

    if (String(cancelled.status || '').toLowerCase() === 'cancelled') {
      employer.subscription.status = 'Cancelled';
    }
    await employer.save();

    return successResponse(res, 200, 'Subscription cancellation request processed', {
      subscription: employer.subscription,
      razorpay: cancelled,
    });
  } catch (err) {
    console.error('Cancel subscription error:', err?.response?.data || err);
    return errorResponse(res, 500, 'Failed to cancel subscription');
  }
};

// POST /api/pricing/razorpay/webhook
exports.handleRazorpayWebhook = async (req, res) => {
  try {
    const rawBody = req.body;
    const signature = req.headers['x-razorpay-signature'];
    const eventId = String(req.headers['x-razorpay-event-id'] || '');

    const signatureValid = verifyWebhookSignature({ rawBody, webhookSignature: signature });
    if (!signatureValid) {
      return errorResponse(res, 400, 'Invalid webhook signature');
    }

    const payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : '{}');
    const eventType = payload?.event;
    if (!eventType) {
      return errorResponse(res, 400, 'Webhook event type missing');
    }

    if (eventId) {
      const alreadyProcessed = await SubscriptionEventLog.findOne({ eventId }).lean();
      if (alreadyProcessed) {
        return successResponse(res, 200, 'Webhook already processed', { duplicate: true });
      }
    }

    const subscriptionEntity = payload?.payload?.subscription?.entity;
    const paymentEntity = payload?.payload?.payment?.entity;
    const invoiceEntity = payload?.payload?.invoice?.entity;
    const razorpaySubscriptionId =
      subscriptionEntity?.id || paymentEntity?.subscription_id || invoiceEntity?.subscription_id;

    if (!razorpaySubscriptionId) {
      if (eventId) {
        await SubscriptionEventLog.create({
          eventId,
          eventType,
          payload: sanitizeWebhookPayload(payload),
        });
      }
      return successResponse(res, 200, 'Webhook ignored. Subscription id missing', { ignored: true });
    }

    let audience = 'employer';
    let owner = await Employer.findOne({
      'subscription.razorpay.subscriptionId': razorpaySubscriptionId,
    });
    if (!owner) {
      owner = await JobSeeker.findOne({
        'subscription.razorpay.subscriptionId': razorpaySubscriptionId,
      });
      audience = owner ? 'jobseeker' : audience;
    }

    if (!owner) {
      if (eventId) {
        await SubscriptionEventLog.create({
          eventId,
          eventType,
          subscriptionId: razorpaySubscriptionId,
          payload: sanitizeWebhookPayload(payload),
        });
      }
      return successResponse(res, 200, 'Webhook ignored. Subscription not mapped', { ignored: true });
    }

    const pendingPlanId = owner.subscription.pendingPlan || owner.subscription.plan;
    const eventCreatedAt =
      toDateFromUnix(payload?.created_at) ||
      toDateFromUnix(paymentEntity?.created_at) ||
      toDateFromUnix(subscriptionEntity?.created_at) ||
      new Date();

    const normalizedEvent = String(eventType).toLowerCase();
    if (
      ['subscription.activated', 'subscription.charged', 'subscription.authenticated', 'invoice.paid'].includes(
        normalizedEvent
      )
    ) {
      await applyPaidPlanToOwner({
        owner,
        audience,
        planId: pendingPlanId,
        razorpaySubscriptionId,
        razorpayStatus: subscriptionEntity?.status || invoiceEntity?.status || 'active',
        invoiceId: invoiceEntity?.id,
        paymentId: paymentEntity?.id,
        eventId,
        eventCreatedAt,
        subscriptionEntity,
        paymentEntity,
      });
    } else if (
      ['subscription.pending', 'subscription.halted', 'payment.failed', 'invoice.payment_failed'].includes(
        normalizedEvent
      )
    ) {
      owner.subscription.status = 'Inactive';
      owner.subscription.razorpay = {
        ...(owner.subscription.razorpay || {}),
        status: String(subscriptionEntity?.status || 'pending').toLowerCase(),
        lastPaymentId: paymentEntity?.id || owner.subscription.razorpay?.lastPaymentId,
        lastInvoiceId: invoiceEntity?.id || owner.subscription.razorpay?.lastInvoiceId,
        lastWebhookEventId: eventId || owner.subscription.razorpay?.lastWebhookEventId,
        lastWebhookAt: eventCreatedAt,
      };
    } else if (['subscription.cancelled', 'subscription.completed', 'subscription.expired'].includes(normalizedEvent)) {
      owner.subscription.status = normalizedEvent === 'subscription.cancelled' ? 'Cancelled' : 'Expired';
      owner.subscription.autoRenew = false;
      owner.subscription.pendingPlan = undefined;
      owner.subscription.razorpay = {
        ...(owner.subscription.razorpay || {}),
        status: String(subscriptionEntity?.status || normalizedEvent).toLowerCase(),
        currentEnd:
          toDateFromUnix(subscriptionEntity?.current_end) || owner.subscription.razorpay?.currentEnd,
        endAt: toDateFromUnix(subscriptionEntity?.end_at) || owner.subscription.razorpay?.endAt,
        lastWebhookEventId: eventId || owner.subscription.razorpay?.lastWebhookEventId,
        lastWebhookAt: eventCreatedAt,
      };
    } else {
      owner.subscription.razorpay = {
        ...(owner.subscription.razorpay || {}),
        status: String(subscriptionEntity?.status || owner.subscription.razorpay?.status || '').toLowerCase(),
        lastWebhookEventId: eventId || owner.subscription.razorpay?.lastWebhookEventId,
        lastWebhookAt: eventCreatedAt,
      };
    }

    await owner.save();

    if (eventId) {
      await SubscriptionEventLog.create({
        eventId,
        eventType,
        subscriptionId: razorpaySubscriptionId,
        payload: sanitizeWebhookPayload(payload),
      });
    }

    return successResponse(res, 200, 'Webhook processed');
  } catch (err) {
    console.error('Razorpay webhook processing error:', err);
    return errorResponse(res, 500, 'Failed to process webhook');
  }
};
