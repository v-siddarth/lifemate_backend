const crypto = require('crypto');
const axios = require('axios');

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

const getRazorpayCredentials = () => {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    return null;
  }
  return { keyId, keySecret };
};

const getSubscriptionPlanId = (planId) => {
  const defaultPlanId = (process.env.RAZORPAY_PLAN_ID_DEFAULT || '').trim();
  const mapping = {
    Basic: (process.env.RAZORPAY_PLAN_ID_BASIC || '').trim(),
    Premium: (process.env.RAZORPAY_PLAN_ID_PREMIUM || '').trim(),
    Enterprise: (process.env.RAZORPAY_PLAN_ID_ENTERPRISE || '').trim(),
  };
  return mapping[planId] || defaultPlanId || '';
};

const createBasicAuthHeader = (keyId, keySecret) => {
  const token = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return `Basic ${token}`;
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

  const response = await axios.post(`${RAZORPAY_API_BASE}/subscriptions`, payload, {
    headers: {
      Authorization: createBasicAuthHeader(credentials.keyId, credentials.keySecret),
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  return response.data;
};

const cancelSubscription = async (subscriptionId, cancelAtCycleEnd = true) => {
  const credentials = getRazorpayCredentials();
  if (!credentials) {
    throw new Error('Razorpay credentials are not configured');
  }

  const response = await axios.post(
    `${RAZORPAY_API_BASE}/subscriptions/${subscriptionId}/cancel`,
    { cancel_at_cycle_end: Boolean(cancelAtCycleEnd) },
    {
      headers: {
        Authorization: createBasicAuthHeader(credentials.keyId, credentials.keySecret),
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  return response.data;
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
    .update(`${subscriptionId}|${paymentId}`)
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
  getSubscriptionPlanId,
  createSubscription,
  cancelSubscription,
  verifySubscriptionPaymentSignature,
  verifyWebhookSignature,
};
