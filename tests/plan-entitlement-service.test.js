const employerPlan = (overrides = {}) => ({
  id: 'Basic',
  audience: 'employer',
  displayName: 'Basic',
  features: {
    featuredJobPosts: false,
    unlimitedApplications: false,
    ...(overrides.features || {}),
  },
  limits: {
    maxJobPosts: 1,
    maxApplications: 1,
    ...(overrides.limits || {}),
  },
  metadata: {},
  subscriptionFeatures: {
    maxJobPosts: overrides.limits?.maxJobPosts ?? 1,
    maxApplications: overrides.features?.unlimitedApplications ? 999999 : overrides.limits?.maxApplications ?? 1,
    featuredJobPosts: Boolean(overrides.features?.featuredJobPosts),
    unlimitedApplications: Boolean(overrides.features?.unlimitedApplications),
  },
});

const jobSeekerPlan = (overrides = {}) => ({
  id: 'Growth',
  audience: 'jobseeker',
  displayName: 'Growth',
  features: overrides.features || {},
  limits: {
    maxApplications: 1,
    ...(overrides.limits || {}),
  },
  metadata: {},
});

const employer = {
  _id: 'employer-1',
  subscription: {
    plan: 'Basic',
    status: 'Active',
    isActive: true,
    startDate: new Date('2026-05-01T00:00:00.000Z'),
    endDate: new Date('2026-06-01T00:00:00.000Z'),
  },
};

const jobSeeker = {
  _id: 'jobseeker-1',
  subscription: {
    plan: 'Growth',
    status: 'Active',
    isActive: true,
    startDate: new Date('2026-05-01T00:00:00.000Z'),
    endDate: new Date('2026-06-01T00:00:00.000Z'),
  },
};

const loadService = ({
  employerPlans = { Basic: employerPlan() },
  jobSeekerPlans = { Growth: jobSeekerPlan() },
  jobCount = 0,
  applicationCounts = [],
  employerUpdateResult = { matchedCount: 0, modifiedCount: 0 },
  jobSeekerUpdateResult = { matchedCount: 0, modifiedCount: 0 },
} = {}) => {
  jest.resetModules();

  const countDocumentsMock = jest.fn().mockResolvedValue(jobCount);
  const applicationCountMock = jest.fn();
  applicationCounts.forEach((count) => applicationCountMock.mockResolvedValueOnce(count));
  applicationCountMock.mockResolvedValue(0);
  const employerUpdateManyMock = jest.fn().mockResolvedValue(employerUpdateResult);
  const jobSeekerUpdateManyMock = jest.fn().mockResolvedValue(jobSeekerUpdateResult);

  jest.doMock('../models/Job', () => ({
    countDocuments: countDocumentsMock,
  }));
  jest.doMock('../models/Application', () => ({
    countDocuments: applicationCountMock,
  }));
  jest.doMock('../models/Employer', () => ({
    updateMany: employerUpdateManyMock,
  }));
  jest.doMock('../models/JobSeeker', () => ({
    updateMany: jobSeekerUpdateManyMock,
  }));
  jest.doMock('../services/pricingConfigService', () => ({
    getPlanMapByAudience: jest.fn((audience) =>
      Promise.resolve(audience === 'employer' ? employerPlans : jobSeekerPlans)
    ),
  }));

  return {
    service: require('../services/planEntitlementService'),
    countDocumentsMock,
    applicationCountMock,
    employerUpdateManyMock,
    jobSeekerUpdateManyMock,
  };
};

describe('planEntitlementService', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('syncs existing subscribers when plan snapshots change', async () => {
    const { service, employerUpdateManyMock, jobSeekerUpdateManyMock } = loadService({
      employerUpdateResult: { matchedCount: 2, modifiedCount: 2 },
      jobSeekerUpdateResult: { matchedCount: 1, modifiedCount: 1 },
    });

    const result = await service.syncSubscribersForPlans([
      employerPlan({ limits: { maxJobPosts: 3 } }),
      jobSeekerPlan({ limits: { maxApplications: 5 } }),
    ]);

    expect(result.syncedSubscriberCount).toBe(3);
    expect(employerUpdateManyMock).toHaveBeenCalledWith(
      { 'subscription.plan': 'Basic' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'subscription.features': expect.objectContaining({ maxJobPosts: 3 }),
        }),
      })
    );
    expect(jobSeekerUpdateManyMock).toHaveBeenCalledWith(
      { 'subscription.plan': 'Growth' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'subscription.capabilities': expect.objectContaining({
            limits: expect.objectContaining({ maxApplications: 5 }),
          }),
        }),
      })
    );
  });

  it('blocks creating or activating an open job when the plan job limit is reached', async () => {
    const { service } = loadService({ jobCount: 1, applicationCounts: [0] });

    const barrier = await service.getEmployerJobBarrier({
      employer,
      targetStatus: 'Pending',
      wantsFeatured: false,
    });

    expect(barrier).toEqual(
      expect.objectContaining({
        field: 'maxJobPosts',
      })
    );
  });

  it('blocks featured jobs when the plan does not include featured job posts', async () => {
    const { service } = loadService({ jobCount: 0, applicationCounts: [0] });

    const barrier = await service.getEmployerJobBarrier({
      employer,
      targetStatus: 'Pending',
      wantsFeatured: true,
    });

    expect(barrier).toEqual(
      expect.objectContaining({
        field: 'isFeatured',
      })
    );
  });

  it('blocks a second employer application in the same cycle when maxApplications is 1', async () => {
    const inactiveJobSeeker = {
      ...jobSeeker,
      subscription: { status: 'Inactive', isActive: false },
    };
    const { service } = loadService({ jobCount: 0, applicationCounts: [1] });

    const barrier = await service.getApplicationBarrier({
      employer,
      jobSeeker: inactiveJobSeeker,
      existingApplication: null,
    });

    expect(barrier).toEqual(
      expect.objectContaining({
        message: 'This employer has reached the application limit for the current billing cycle.',
      })
    );
  });

  it('allows employer applications beyond numeric max when unlimitedApplications is enabled', async () => {
    const { service } = loadService({
      employerPlans: {
        Basic: employerPlan({ features: { unlimitedApplications: true }, limits: { maxApplications: 1 } }),
      },
      applicationCounts: [20, 0],
    });

    const barrier = await service.getApplicationBarrier({
      employer,
      jobSeeker: { ...jobSeeker, subscription: { status: 'Inactive', isActive: false } },
      existingApplication: null,
    });

    expect(barrier).toBeNull();
  });

  it('blocks active subscribed jobseekers at their application limit', async () => {
    const { service } = loadService({
      employerPlans: {
        Basic: employerPlan({ features: { unlimitedApplications: true } }),
      },
      applicationCounts: [0, 1],
    });

    const barrier = await service.getApplicationBarrier({
      employer,
      jobSeeker,
      existingApplication: null,
    });

    expect(barrier).toEqual(
      expect.objectContaining({
        message: 'You have reached your application limit for the current billing cycle.',
      })
    );
  });
});
