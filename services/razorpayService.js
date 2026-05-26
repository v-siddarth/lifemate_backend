const crypto = require('crypto');
const Razorpay = require('razorpay');

let cachedClient = null;
let cachedClientKey = '';

const PLAN_PERIODS = new Set(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']);

class RazorpayPlanConfigurationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RazorpayPlanConfigurationError';
    this.details = details;
    this.isRazorpayPlanConfigurationError = true;
  }
}

const getRazorpayCredentials = () => {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    return null;
  }
  return { keyId, keySecret };
};

const getRazorpayClient = () => {
  const credentials = getRazorpayCredentials();
  if (!credentials) {
    throw new Error('Razorpay credentials are not configured');
  }

  const cacheKey = `${credentials.keyId}:${credentials.keySecret}`;
  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = new Razorpay({
      key_id: credentials.keyId,
      key_secret: credentials.keySecret,
    });
    cachedClientKey = cacheKey;
  }

  return cachedClient;
};

const normalizeEnvKeyPart = (value) =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const asBool = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const getSubscriptionPlanIdSource = ({ audience, planId }) => {
  const defaultPlanId = (process.env.RAZORPAY_PLAN_ID_DEFAULT || '').trim();
  const planKey = normalizeEnvKeyPart(planId);
  const audienceKey = normalizeEnvKeyPart(audience);

  const candidateKeys = [
    audienceKey && planKey ? `RAZORPAY_PLAN_ID_${audienceKey}_${planKey}` : '',
    planKey ? `RAZORPAY_PLAN_ID_${planKey}` : '',
    defaultPlanId ? 'RAZORPAY_PLAN_ID_DEFAULT' : '',
  ].filter(Boolean);

  for (const key of candidateKeys) {
    const value = (process.env[key] || '').trim();
    if (value) return { planId: value, sourceKey: key };
  }

  return { planId: '', sourceKey: '' };
};

const getSubscriptionPlanId = ({ audience, planId }) => {
  return getSubscriptionPlanIdSource({ audience, planId }).planId;
};

const getRazorpayPlanFrequency = () => {
  const period = String(process.env.RAZORPAY_PLAN_PERIOD || 'monthly').trim().toLowerCase();
  const interval = Number(process.env.RAZORPAY_PLAN_INTERVAL || 1);

  if (!PLAN_PERIODS.has(period)) {
    throw new RazorpayPlanConfigurationError('Razorpay plan period is invalid', {
      envKey: 'RAZORPAY_PLAN_PERIOD',
      value: period,
      allowedValues: [...PLAN_PERIODS],
    });
  }

  if (!Number.isInteger(interval) || interval <= 0 || (period === 'daily' && interval < 7)) {
    throw new RazorpayPlanConfigurationError('Razorpay plan interval is invalid', {
      envKey: 'RAZORPAY_PLAN_INTERVAL',
      value: process.env.RAZORPAY_PLAN_INTERVAL || 1,
      period,
    });
  }

  return { period, interval };
};

const getRazorpayCurrency = () => String(process.env.RAZORPAY_CURRENCY || 'INR').trim().toUpperCase();

const toRazorpayAmount = (price) => {
  const amount = Math.round(Number(price) * 100);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RazorpayPlanConfigurationError('Selected paid plan is missing a valid positive price', {
      price,
    });
  }
  return amount;
};

const getCareermedPlanKey = ({ audience, planId }) =>
  `${String(audience || '').trim().toLowerCase()}:${String(planId || '').trim()}`;

const buildPlanSpec = ({ audience, plan }) => {
  const { period, interval } = getRazorpayPlanFrequency();
  return {
    appPlanId: plan.id,
    audience,
    careermedPlanKey: getCareermedPlanKey({ audience, planId: plan.id }),
    displayName: plan.displayName || plan.id,
    description: plan.description || `${plan.displayName || plan.id} subscription`,
    amount: toRazorpayAmount(plan.price),
    currency: getRazorpayCurrency(),
    period,
    interval,
  };
};

const getRazorpayErrorDetails = (err) => {
  const statusCode = Number(err?.statusCode || err?.response?.status);
  const error = err?.error || err?.response?.data?.error || null;
  return {
    statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
    code: error?.code || undefined,
    description: error?.description || err?.message || undefined,
    reason: error?.reason || undefined,
    source: error?.source || undefined,
    step: error?.step || undefined,
  };
};

const isMissingRazorpayPlanError = (err) => {
  const details = getRazorpayErrorDetails(err);
  return (
    details.statusCode === 400 &&
    details.code === 'BAD_REQUEST_ERROR' &&
    /invalid|could not be found/i.test(details.description || '')
  );
};

const isMatchingPlan = (planEntity, spec) => {
  if (!planEntity) return false;
  const notes = planEntity.notes || {};
  const item = planEntity.item || {};
  return (
    String(notes.careermedPlanKey || '') === spec.careermedPlanKey &&
    Number(item.amount) === spec.amount &&
    String(item.currency || '').toUpperCase() === spec.currency &&
    String(planEntity.period || '').toLowerCase() === spec.period &&
    Number(planEntity.interval) === spec.interval
  );
};

const validatePlanEntity = (planEntity, spec, context = {}) => {
  const item = planEntity?.item || {};
  const mismatches = [];

  if (Number(item.amount) !== spec.amount) {
    mismatches.push(`amount ${item.amount || 'missing'} != ${spec.amount}`);
  }
  if (String(item.currency || '').toUpperCase() !== spec.currency) {
    mismatches.push(`currency ${item.currency || 'missing'} != ${spec.currency}`);
  }
  if (String(planEntity?.period || '').toLowerCase() !== spec.period) {
    mismatches.push(`period ${planEntity?.period || 'missing'} != ${spec.period}`);
  }
  if (Number(planEntity?.interval) !== spec.interval) {
    mismatches.push(`interval ${planEntity?.interval || 'missing'} != ${spec.interval}`);
  }

  if (mismatches.length > 0) {
    throw new RazorpayPlanConfigurationError(
      `Razorpay plan ${planEntity?.id || context.planId || ''} does not match ${spec.audience} ${spec.appPlanId}. Configure the correct audience-specific plan id or enable verified plan creation.`,
      {
        ...context,
        appPlanId: spec.appPlanId,
        audience: spec.audience,
        expected: {
          amount: spec.amount,
          currency: spec.currency,
          period: spec.period,
          interval: spec.interval,
        },
        actual: {
          amount: item.amount,
          currency: item.currency,
          period: planEntity?.period,
          interval: planEntity?.interval,
        },
        mismatches,
      }
    );
  }
};

const fetchPlan = async (planId) => getRazorpayClient().plans.fetch(planId);

const findMatchingPlan = async (spec) => {
  const result = await getRazorpayClient().plans.all({ count: 100 });
  const plans = Array.isArray(result?.items) ? result.items : [];
  return plans.find((planEntity) => isMatchingPlan(planEntity, spec)) || null;
};

const createPlan = async (spec) => {
  return getRazorpayClient().plans.create({
    period: spec.period,
    interval: spec.interval,
    item: {
      name: `CareerMed ${spec.audience} ${spec.displayName}`,
      amount: spec.amount,
      currency: spec.currency,
      description: spec.description,
    },
    notes: {
      careermedPlanKey: spec.careermedPlanKey,
      audience: spec.audience,
      appPlanId: spec.appPlanId,
    },
  });
};

const resolveSubscriptionPlan = async ({ audience, plan }) => {
  const spec = buildPlanSpec({ audience, plan });
  const configured = getSubscriptionPlanIdSource({ audience, planId: plan.id });
  const autoCreatePlans = asBool(process.env.RAZORPAY_AUTO_CREATE_PLANS, false);

  if (configured.planId) {
    try {
      const planEntity = await fetchPlan(configured.planId);
      validatePlanEntity(planEntity, spec, {
        planId: configured.planId,
        sourceKey: configured.sourceKey,
      });
      return {
        planId: planEntity.id,
        source: configured.sourceKey,
        planEntity,
        created: false,
      };
    } catch (err) {
      if (!isMissingRazorpayPlanError(err) && !err?.isRazorpayPlanConfigurationError) {
        throw err;
      }

      if (!autoCreatePlans) {
        throw new RazorpayPlanConfigurationError(
          `Razorpay plan configured in ${configured.sourceKey} is not usable for ${audience} ${plan.id}. Create a matching plan in the current Razorpay account and update the plan id, or set RAZORPAY_AUTO_CREATE_PLANS=true after confirming live plan creation is allowed.`,
          {
            planId: configured.planId,
            sourceKey: configured.sourceKey,
            appPlanId: plan.id,
            audience,
            gateway: getRazorpayErrorDetails(err),
            originalError: err?.details,
          }
        );
      }
    }
  }

  const existingPlan = await findMatchingPlan(spec);
  if (existingPlan) {
    return {
      planId: existingPlan.id,
      source: 'razorpay_existing_plan',
      planEntity: existingPlan,
      created: false,
    };
  }

  if (!autoCreatePlans) {
    const expectedEnvKey = `RAZORPAY_PLAN_ID_${normalizeEnvKeyPart(audience)}_${normalizeEnvKeyPart(plan.id)}`;
    throw new RazorpayPlanConfigurationError(
      `Razorpay plan mapping missing for ${audience} ${plan.id}. Configure ${expectedEnvKey} with a plan from the current Razorpay account, or enable RAZORPAY_AUTO_CREATE_PLANS=true to create verified monthly INR plans from the app catalog.`,
      {
        expectedEnvKey,
        appPlanId: plan.id,
        audience,
      }
    );
  }

  const createdPlan = await createPlan(spec);
  return {
    planId: createdPlan.id,
    source: 'razorpay_created_plan',
    planEntity: createdPlan,
    created: true,
  };
};

const validateSubscriptionPlanForCheckout = async ({ audience, plan, razorpayPlanId }) => {
  const spec = buildPlanSpec({ audience, plan });
  const planEntity = await fetchPlan(razorpayPlanId);
  validatePlanEntity(planEntity, spec, { planId: razorpayPlanId });
  return planEntity;
};

const createSubscription = async ({
  planId,
  totalCount = Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT || 12),
  quantity = 1,
  customerNotify = 1,
  notes = {},
}) => {
  const credentials = getRazorpayCredentials();
  if (!credentials) {
    throw new Error('Razorpay credentials are not configured');
  }

  const payload = {
    plan_id: planId,
    total_count: totalCount,
    quantity,
    customer_notify: customerNotify,
    notes,
  };

  console.info('Creating Razorpay subscription', {
    planId,
    totalCount,
    quantity,
    userId: notes.userId,
    audience: notes.audience,
    appPlanId: notes.appPlanId,
  });

  return getRazorpayClient().subscriptions.create(payload);
};

const cancelSubscription = async (subscriptionId, cancelAtCycleEnd = true) => {
  return getRazorpayClient().subscriptions.cancel(subscriptionId, Boolean(cancelAtCycleEnd));
};

const fetchSubscription = async (subscriptionId) => {
  return getRazorpayClient().subscriptions.fetch(subscriptionId);
};

const fetchPayment = async (paymentId) => {
  return getRazorpayClient().payments.fetch(paymentId);
};

const safeCompareSignature = (a, b) => {
  const first = Buffer.from(String(a || ''));
  const second = Buffer.from(String(b || ''));
  if (first.length !== second.length) return false;
  return crypto.timingSafeEqual(first, second);
};

const verifySubscriptionPaymentSignature = ({
  subscriptionId,
  paymentId,
  signature,
  keySecret,
}) => {
  const secret = keySecret || (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!secret) return false;

  const generated = crypto
    .createHmac('sha256', secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex');

  return safeCompareSignature(generated, signature);
};

const verifyWebhookSignature = ({ rawBody, webhookSignature }) => {
  const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!secret || !rawBody || !webhookSignature) return false;

  const generated = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeCompareSignature(generated, webhookSignature);
};

module.exports = {
  getRazorpayCredentials,
  getRazorpayClient,
  getSubscriptionPlanId,
  getSubscriptionPlanIdSource,
  resolveSubscriptionPlan,
  validateSubscriptionPlanForCheckout,
  fetchPlan,
  createSubscription,
  cancelSubscription,
  fetchSubscription,
  fetchPayment,
  verifySubscriptionPaymentSignature,
  verifyWebhookSignature,
  RazorpayPlanConfigurationError,
};
