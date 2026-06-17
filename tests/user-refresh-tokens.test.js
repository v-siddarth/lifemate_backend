const User = require('../models/User');

describe('User refresh token storage', () => {
  it('does not declare a TTL index on refresh token dates', () => {
    const dangerousIndexes = User.schema.indexes().filter(([key, options]) => {
      return key['refreshTokens.createdAt'] === 1 || options.expireAfterSeconds !== undefined;
    });

    expect(dangerousIndexes).toEqual([]);
  });

  it('prunes expired refresh token subdocuments without deleting the user', () => {
    const user = new User({
      email: 'token-prune@example.com',
      password: 'Password1',
      role: 'jobseeker',
      firstName: 'Token',
      lastName: 'Prune',
    });
    const now = new Date('2026-06-17T00:00:00.000Z');

    user.refreshTokens = [
      { token: 'expired', createdAt: new Date('2026-05-01T00:00:00.000Z') },
      { token: 'fresh', createdAt: new Date('2026-06-16T00:00:00.000Z') },
    ];

    user.pruneExpiredRefreshTokens({
      now,
      maxAgeMs: 30 * 24 * 60 * 60 * 1000,
    });

    expect(user.refreshTokens.map((entry) => entry.token)).toEqual(['fresh']);
  });

  it('keeps only the newest refresh token subdocuments when over the cap', () => {
    const user = new User({
      email: 'token-cap@example.com',
      password: 'Password1',
      role: 'jobseeker',
      firstName: 'Token',
      lastName: 'Cap',
    });

    user.refreshTokens = [
      { token: 'oldest', createdAt: new Date('2026-06-10T00:00:00.000Z') },
      { token: 'middle', createdAt: new Date('2026-06-11T00:00:00.000Z') },
      { token: 'newest', createdAt: new Date('2026-06-12T00:00:00.000Z') },
    ];

    user.pruneExpiredRefreshTokens({
      now: new Date('2026-06-17T00:00:00.000Z'),
      maxAgeMs: 30 * 24 * 60 * 60 * 1000,
      maxTokens: 2,
    });

    expect(user.refreshTokens.map((entry) => entry.token)).toEqual(['middle', 'newest']);
  });
});
