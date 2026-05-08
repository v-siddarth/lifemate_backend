const {
  buildFrontendOriginAllowlist,
  sanitizeRedirectOrigin,
  getCanonicalFrontendOrigin,
} = require('../config/origins');

describe('origin allowlist helpers', () => {
  it('keeps production defaults strict to careermed domains', () => {
    const allowlist = buildFrontendOriginAllowlist({
      nodeEnv: 'production',
      corsOrigins: 'https://preview.careermed.in',
    });

    expect(allowlist.has('https://careermed.in')).toBe(true);
    expect(allowlist.has('https://www.careermed.in')).toBe(true);
    expect(allowlist.has('https://preview.careermed.in')).toBe(true);
    expect(allowlist.has('http://localhost:3000')).toBe(false);
    expect(allowlist.has('http://localhost:3021')).toBe(false);
  });

  it('includes local frontend origins outside production', () => {
    const allowlist = buildFrontendOriginAllowlist({
      nodeEnv: 'development',
      corsOrigins: '',
    });

    expect(allowlist.has('http://localhost:3000')).toBe(true);
    expect(allowlist.has('http://localhost:3021')).toBe(true);
  });

  it('accepts redirect origins only when explicitly allowed', () => {
    const allowlist = buildFrontendOriginAllowlist({
      nodeEnv: 'production',
      corsOrigins: 'https://careermed-preview.vercel.app',
    });

    expect(sanitizeRedirectOrigin('https://careermed-preview.vercel.app/path', allowlist)).toBe(
      'https://careermed-preview.vercel.app'
    );
    expect(sanitizeRedirectOrigin('https://random.vercel.app/path', allowlist)).toBeNull();
  });

  it('falls back to canonical production domain when FRONTEND_URL is not a production origin', () => {
    expect(
      getCanonicalFrontendOrigin({
        nodeEnv: 'production',
        frontendUrl: 'https://preview.careermed.in',
      })
    ).toBe('https://www.careermed.in');
  });
});
