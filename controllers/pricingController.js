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
} = require('../services/pricingConfigService');
const Employer = require('../models/Employer');
const SubscriptionEventLog = require('../models/SubscriptionEventLog');
const {
  getRazorpayCredentials,
  getSubscriptionPlanId,
  createSubscription,
  cancelSubscription,
  verifySubscriptionPaymentSignature,
  verifyWebhookSignature,
} = require('../services/razorpayService');

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

const sanitizeWebhookPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return {};
  return payload;
};

const isWebhookBypassEnabled = () =>
  String(process.env.RAZORPAY_SKIP_WEBHOOK_FOR_TEST || '').toLowerCase() === 'true';

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
  employer.subscription.pendingPlan = undefined;
  employer.subscription.features = targetPlan.subscriptionFeatures;
  employer.subscription.status = resolveSubscriptionStatus(razorpayStatus) || 'Active';
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

const applyFreePlanToEmployer = async ({ employer, planId }) => {
  const planMap = await getEmployerPlanMap();
  const plan = planMap[planId];
  if (!plan) {
    throw new Error(`Employer plan not found for id: ${planId}`);
  }
  employer.subscription.plan = planId;
  employer.subscription.pendingPlan = undefined;
  employer.subscription.features = plan.subscriptionFeatures;
  employer.subscription.status = 'Active';
  employer.subscription.autoRenew = false;
  employer.subscription.startDate = new Date();
  employer.subscription.endDate = undefined;
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
    });
  } catch (err) {
    console.error('List pricing plans error:', err);
    return errorResponse(res, 500, 'Failed to fetch pricing plans');
  }
};

// GET /api/pricing/my-subscription
exports.getMySubscription = async (req, res) => {
  try {
    if (req.user?.role !== 'employer') {
      return forbiddenResponse(res, 'Only employer subscriptions are currently supported');
    }

    const employer = await Employer.findOne({ user: req.user._id }).select(
      'organizationName subscription'
    );
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    return successResponse(res, 200, 'Subscription fetched', { subscription: employer.subscription });
  } catch (err) {
    console.error('Get my subscription error:', err);
    return errorResponse(res, 500, 'Failed to fetch subscription');
  }
};

// POST /api/pricing/checkout-subscription
exports.createCheckoutSubscription = async (req, res) => {
  try {
    if (req.user?.role !== 'employer') {
      return forbiddenResponse(res, 'Only employer subscriptions are currently supported');
    }

    const { planId } = req.body || {};
    if (!planId || typeof planId !== 'string') {
      return validationErrorResponse(res, [{ field: 'planId', message: 'planId is required' }]);
    }

    const planMap = await getEmployerPlanMap();
    const selectedPlan = planMap[planId];
    if (!selectedPlan || selectedPlan.isActive === false) {
      return validationErrorResponse(res, [{ field: 'planId', message: 'Selected plan is not available' }]);
    }

    const employer = await Employer.findOne({ user: req.user._id });
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    if (Number(selectedPlan.price) <= 0) {
      await applyFreePlanToEmployer({ employer, planId });
      await employer.save();
      return successResponse(res, 200, 'Free plan activated', {
        paymentRequired: false,
        subscription: employer.subscription,
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

    const razorpayPlanId = getSubscriptionPlanId(planId);
    if (!razorpayPlanId) {
      return errorResponse(
        res,
        500,
        `Razorpay plan mapping missing for ${planId}. Configure RAZORPAY_PLAN_ID_${planId.toUpperCase()} or RAZORPAY_PLAN_ID_DEFAULT`
      );
    }

    const checkoutSubscription = await createSubscription({
      planId: razorpayPlanId,
      notes: {
        userId: String(req.user._id),
        employerId: String(employer._id),
        appPlanId: planId,
      },
    });

    employer.subscription.pendingPlan = planId;
    employer.subscription.status = 'Inactive';
    employer.subscription.razorpay = {
      ...(employer.subscription.razorpay || {}),
      provider: 'razorpay',
      planId: razorpayPlanId,
      subscriptionId: checkoutSubscription.id,
      status: checkoutSubscription.status,
      shortUrl: checkoutSubscription.short_url,
      chargeAt: toDateFromUnix(checkoutSubscription.charge_at),
      currentStart: toDateFromUnix(checkoutSubscription.current_start),
      currentEnd: toDateFromUnix(checkoutSubscription.current_end),
    };
    await employer.save();

    return successResponse(res, 200, 'Checkout subscription created', {
      paymentRequired: true,
      keyId: credentials.keyId,
      subscriptionId: checkoutSubscription.id,
      planId,
      razorpayPlanId,
      amount: selectedPlan.price,
      currency: 'INR',
      name: employer.organizationName || 'CareerMed',
      description: `${selectedPlan.displayName} subscription`,
      prefill: {
        name: employer.contactPerson?.name || employer.organizationName || '',
        email: employer.contactPerson?.email || req.user.email || '',
        contact: employer.contactPerson?.phone || '',
      },
    });
  } catch (err) {
    console.error('Create checkout subscription error:', err?.response?.data || err);
    return errorResponse(res, 500, 'Failed to create checkout subscription');
  }
};

// POST /api/pricing/checkout-verify
exports.verifyCheckoutSubscription = async (req, res) => {
  try {
    if (req.user?.role !== 'employer') {
      return forbiddenResponse(res, 'Only employer subscriptions are currently supported');
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

    const validSignature = verifySubscriptionPaymentSignature({
      subscriptionId,
      paymentId,
      signature,
    });
    if (!validSignature) {
      return errorResponse(res, 400, 'Invalid payment signature');
    }

    const employer = await Employer.findOne({ user: req.user._id });
    if (!employer) {
      return notFoundResponse(res, 'Employer profile not found');
    }

    const currentStoredSubscriptionId = employer.subscription?.razorpay?.subscriptionId;
    if (currentStoredSubscriptionId && currentStoredSubscriptionId !== subscriptionId) {
      return errorResponse(res, 400, 'Subscription mismatch detected');
    }

    employer.subscription.pendingPlan = planId;
    employer.subscription.razorpay = {
      ...(employer.subscription.razorpay || {}),
      provider: 'razorpay',
      subscriptionId,
      status: 'authenticated',
      lastPaymentId: paymentId,
      lastWebhookAt: new Date(),
    };
    if (isWebhookBypassEnabled()) {
      await applyPaidPlanToEmployer({
        employer,
        planId,
        razorpaySubscriptionId: subscriptionId,
        razorpayStatus: 'active',
        invoiceId: undefined,
        paymentId,
        eventId: 'test-bypass',
        eventCreatedAt: new Date(),
        subscriptionEntity: {
          id: subscriptionId,
          status: 'active',
          current_start: Math.floor(Date.now() / 1000),
        },
      });
    }
    await employer.save();

    return successResponse(
      res,
      200,
      isWebhookBypassEnabled()
        ? 'Payment verified and activated in test bypass mode.'
        : 'Payment verified. Awaiting activation webhook.',
      {
      status: isWebhookBypassEnabled() ? 'active' : 'authenticated',
      subscriptionId,
      paymentId,
      }
    );
  } catch (err) {
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

    const employer = await Employer.findOne({
      'subscription.razorpay.subscriptionId': razorpaySubscriptionId,
    });
    if (!employer) {
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

    const pendingPlanId = employer.subscription.pendingPlan || employer.subscription.plan;
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
      await applyPaidPlanToEmployer({
        employer,
        planId: pendingPlanId,
        razorpaySubscriptionId,
        razorpayStatus: subscriptionEntity?.status || invoiceEntity?.status || 'active',
        invoiceId: invoiceEntity?.id,
        paymentId: paymentEntity?.id,
        eventId,
        eventCreatedAt,
        subscriptionEntity,
      });
    } else if (
      ['subscription.pending', 'subscription.halted', 'payment.failed', 'invoice.payment_failed'].includes(
        normalizedEvent
      )
    ) {
      employer.subscription.status = 'Inactive';
      employer.subscription.razorpay = {
        ...(employer.subscription.razorpay || {}),
        status: String(subscriptionEntity?.status || 'pending').toLowerCase(),
        lastPaymentId: paymentEntity?.id || employer.subscription.razorpay?.lastPaymentId,
        lastInvoiceId: invoiceEntity?.id || employer.subscription.razorpay?.lastInvoiceId,
        lastWebhookEventId: eventId || employer.subscription.razorpay?.lastWebhookEventId,
        lastWebhookAt: eventCreatedAt,
      };
    } else if (['subscription.cancelled', 'subscription.completed', 'subscription.expired'].includes(normalizedEvent)) {
      employer.subscription.status = normalizedEvent === 'subscription.cancelled' ? 'Cancelled' : 'Expired';
      employer.subscription.autoRenew = false;
      employer.subscription.pendingPlan = undefined;
      employer.subscription.razorpay = {
        ...(employer.subscription.razorpay || {}),
        status: String(subscriptionEntity?.status || normalizedEvent).toLowerCase(),
        currentEnd:
          toDateFromUnix(subscriptionEntity?.current_end) || employer.subscription.razorpay?.currentEnd,
        endAt: toDateFromUnix(subscriptionEntity?.end_at) || employer.subscription.razorpay?.endAt,
        lastWebhookEventId: eventId || employer.subscription.razorpay?.lastWebhookEventId,
        lastWebhookAt: eventCreatedAt,
      };
    } else {
      employer.subscription.razorpay = {
        ...(employer.subscription.razorpay || {}),
        status: String(subscriptionEntity?.status || employer.subscription.razorpay?.status || '').toLowerCase(),
        lastWebhookEventId: eventId || employer.subscription.razorpay?.lastWebhookEventId,
        lastWebhookAt: eventCreatedAt,
      };
    }

    await employer.save();

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
