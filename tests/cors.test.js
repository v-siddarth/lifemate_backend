describe('CORS configuration', () => {
  const loadApp = () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    return require('../app');
  };

  afterEach(() => {
    delete process.env.CORS_ORIGINS;
  });

  it('keeps fallback production domains even when CORS_ORIGINS is set', async () => {
    process.env.CORS_ORIGINS = 'https://career-made-frontend-ebon.vercel.app';

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

  it('allows apex and www variants for configured origins', async () => {
    process.env.CORS_ORIGINS = 'https://careermed.in';

    const request = require('supertest');
    const app = loadApp();

    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://www.careermed.in');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://www.careermed.in');
  });
});
