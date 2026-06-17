const request = require('supertest');
const app = require('../app');

describe('Health endpoint', () => {
  it('returns service health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('CareerMed API is running');
  });

  it('accepts Vercel proxy headers without rate limit validation errors', async () => {
    const response = await request(app)
      .get('/health')
      .set('X-Forwarded-For', '203.0.113.10');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
