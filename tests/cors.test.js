describe('CORS configuration', () => {
  const loadApp = () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    return require('../app');
  };

  afterEach(() => {
    delete process.env.CORS_ORIGINS;
  });

  it('keeps production domains allowed while using explicit preview origins', async () => {
    process.env.CORS_ORIGINS = 'https://careermed-preview.vercel.app';

    const request = require('supertest');
    const app = loadApp();

    const response = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://www.careermed.in')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://www.careermed.in');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows configured preview origin only when listed in CORS_ORIGINS', async () => {
    process.env.CORS_ORIGINS = 'https://careermed-preview.vercel.app';

    const request = require('supertest');
    const app = loadApp();

    const response = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://careermed-preview.vercel.app')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://careermed-preview.vercel.app');
  });

  it('blocks random vercel preview origins that are not explicitly configured', async () => {
    process.env.CORS_ORIGINS = 'https://careermed-preview.vercel.app';

    const request = require('supertest');
    const app = loadApp();

    const response = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://random-branch.vercel.app')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
