const {
  FEATURE_REGISTRY,
  LIMIT_REGISTRY,
  JOBSEEKER_PLAN_IDS,
  normalizePlan,
} = require('../services/pricingConfigService');

describe('pricingConfigService', () => {
  it('uses Phase 1 job seeker plan ids', () => {
    expect(JOBSEEKER_PLAN_IDS).toEqual(['Basic', 'Growth', 'Pro']);
  });

  it('normalizes legacy job seeker plan ids without keeping free paid-plan pricing', () => {
    expect(
      normalizePlan({
        id: 'JS Starter',
        audience: 'jobseeker',
        displayName: 'Starter',
        price: 0,
      })
    ).toEqual(
      expect.objectContaining({
        id: 'Basic',
        audience: 'jobseeker',
        displayName: 'Basic',
        price: 99,
      })
    );

    expect(
      normalizePlan({
        id: 'JS Growth',
        audience: 'jobseeker',
        price: 199,
      })
    ).toEqual(
      expect.objectContaining({
        id: 'Growth',
        audience: 'jobseeker',
        price: 199,
      })
    );
  });

  it('exposes reusable feature and limit registries for both audiences', () => {
    expect(FEATURE_REGISTRY.employer.map((item) => item.key)).toEqual(
      expect.arrayContaining(['advancedSearch', 'prioritySupport', 'aiCandidateMatch'])
    );
    expect(FEATURE_REGISTRY.jobseeker.map((item) => item.key)).toEqual(
      expect.arrayContaining(['priorityVisibility', 'resumeBoost', 'aiResumeReview'])
    );
    expect(LIMIT_REGISTRY.employer.map((item) => item.key)).toEqual(
      expect.arrayContaining(['maxJobPosts', 'maxApplications', 'teamSeats', 'resumeDownloads'])
    );
  });

  it('migrates legacy textarea features into structured capabilities', () => {
    const plan = normalizePlan({
      id: 'Growth',
      audience: 'jobseeker',
      price: 199,
      featureList: ['Priority profile visibility', 'Application insights', 'Resume improvement hints'],
    });

    expect(plan.features).toEqual(
      expect.objectContaining({
        priorityVisibility: true,
        applicationInsights: true,
        resumeBoost: true,
      })
    );
    expect(plan.displayFeatures.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Priority Visibility', 'Application Insights', 'Resume Boost'])
    );
  });

  it('keeps employer subscriptionFeatures compatible while deriving them from limits', () => {
    const plan = normalizePlan({
      id: 'Premium',
      audience: 'employer',
      price: 900,
      features: {
        advancedSearch: true,
        prioritySupport: true,
        customBranding: true,
        unlimitedApplications: true,
      },
      limits: {
        maxJobPosts: 25,
        maxApplications: 500,
        teamSeats: 5,
        resumeDownloads: 150,
      },
    });

    expect(plan.limits).toEqual(
      expect.objectContaining({
        maxJobPosts: 25,
        maxApplications: 500,
        teamSeats: 5,
        resumeDownloads: 150,
      })
    );
    expect(plan.subscriptionFeatures).toEqual(
      expect.objectContaining({
        maxJobPosts: 25,
        maxApplications: 999999,
        advancedSearch: true,
        prioritySupport: true,
        customBranding: true,
        unlimitedApplications: true,
      })
    );
  });
});
