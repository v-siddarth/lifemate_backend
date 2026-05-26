const crypto = require('crypto');

describe('razorpayService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves audience-specific subscription plan ids before generic ids', () => {
    process.env.RAZORPAY_PLAN_ID_DEFAULT = 'plan_default';
    process.env.RAZORPAY_PLAN_ID_BASIC = 'plan_generic_basic';
    process.env.RAZORPAY_PLAN_ID_JOBSEEKER_BASIC = 'plan_jobseeker_basic';

    const { getSubscriptionPlanId } = require('../services/razorpayService');

    expect(getSubscriptionPlanId({ audience: 'jobseeker', planId: 'Basic' })).toBe(
      'plan_jobseeker_basic'
    );
    expect(getSubscriptionPlanId({ audience: 'employer', planId: 'Basic' })).toBe(
      'plan_generic_basic'
    );
  });

  it('falls back to default subscription plan id when a specific mapping is absent', () => {
    process.env.RAZORPAY_PLAN_ID_DEFAULT = 'plan_default';

    const { getSubscriptionPlanId } = require('../services/razorpayService');

    expect(getSubscriptionPlanId({ audience: 'jobseeker', planId: 'Growth' })).toBe(
      'plan_default'
    );
  });

  it('verifies Razorpay subscription checkout signatures server-side', () => {
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    const subscriptionId = 'sub_123';
    const paymentId = 'pay_123';
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${subscriptionId}|${paymentId}`)
      .digest('hex');

    const { verifySubscriptionPaymentSignature } = require('../services/razorpayService');

    expect(
      verifySubscriptionPaymentSignature({ subscriptionId, paymentId, signature })
    ).toBe(true);
    expect(
      verifySubscriptionPaymentSignature({
        subscriptionId,
        paymentId,
        signature: 'bad_signature',
      })
    ).toBe(false);
  });

  it('creates an audience-specific Razorpay plan when the configured id belongs to another account and auto-create is enabled', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_live_key';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    process.env.RAZORPAY_PLAN_ID_JOBSEEKER_BASIC = 'plan_old';
    process.env.RAZORPAY_AUTO_CREATE_PLANS = 'true';

    const client = {
      plans: {
        fetch: jest.fn().mockRejectedValue({
          response: {
            status: 400,
            data: {
              error: {
                code: 'BAD_REQUEST_ERROR',
                description: 'The ID provided is invalid or could not be found.',
              },
            },
          },
        }),
        all: jest.fn().mockResolvedValue({ items: [] }),
        create: jest.fn().mockResolvedValue({
          id: 'plan_new_jobseeker_basic',
          period: 'monthly',
          interval: 1,
          item: { amount: 9900, currency: 'INR' },
          notes: { careermedPlanKey: 'jobseeker:Basic' },
        }),
      },
    };
    jest.doMock('razorpay', () => jest.fn(() => client));

    const { resolveSubscriptionPlan } = require('../services/razorpayService');
    const result = await resolveSubscriptionPlan({
      audience: 'jobseeker',
      plan: {
        id: 'Basic',
        displayName: 'Basic',
        price: 99,
        description: 'Basic plan',
      },
    });

    expect(result).toMatchObject({
      planId: 'plan_new_jobseeker_basic',
      source: 'razorpay_created_plan',
      created: true,
    });
    expect(client.plans.create).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 'monthly',
        interval: 1,
        item: expect.objectContaining({
          amount: 9900,
          currency: 'INR',
        }),
        notes: expect.objectContaining({
          careermedPlanKey: 'jobseeker:Basic',
          audience: 'jobseeker',
          appPlanId: 'Basic',
        }),
      })
    );
  });

  it('rejects a mapped Razorpay plan when amount does not match the selected app plan', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_live_key';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    process.env.RAZORPAY_PLAN_ID_JOBSEEKER_BASIC = 'plan_employer_basic';

    const client = {
      plans: {
        fetch: jest.fn().mockResolvedValue({
          id: 'plan_employer_basic',
          period: 'monthly',
          interval: 1,
          item: { amount: 30000, currency: 'INR' },
          notes: { careermedPlanKey: 'employer:Basic' },
        }),
      },
    };
    jest.doMock('razorpay', () => jest.fn(() => client));

    const { resolveSubscriptionPlan } = require('../services/razorpayService');

    await expect(
      resolveSubscriptionPlan({
        audience: 'jobseeker',
        plan: {
          id: 'Basic',
          displayName: 'Basic',
          price: 99,
          description: 'Basic plan',
        },
      })
    ).rejects.toMatchObject({
      isRazorpayPlanConfigurationError: true,
    });
  });
});
