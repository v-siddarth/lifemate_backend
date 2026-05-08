describe('CORS configuration', () => {
  const expectCorsMethodsToCoverApiRoutes = (methodsHeader) => {
    const advertisedMethods = String(methodsHeader || '').split(',');
    ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].forEach((method) => {
      expect(advertisedMethods).toContain(method);
    });
  };

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
    expectCorsMethodsToCoverApiRoutes(response.headers['access-control-allow-methods']);
  });

  it('allows admin PATCH preflight requests from the production domain', async () => {
    const request = require('supertest');
    const app = loadApp();

    const response = await request(app)
      .options('/api/admin/employers/69f1e64052804a31f39a2765/verify')
      .set('Origin', 'https://www.careermed.in')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'content-type,authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://www.careermed.in');
    expectCorsMethodsToCoverApiRoutes(response.headers['access-control-allow-methods']);
    expect(response.headers['access-control-allow-headers']).toBe('Content-Type,Authorization');
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
