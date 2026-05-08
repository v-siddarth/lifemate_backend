const request = require('supertest');
const app = require('../app');

describe('Health endpoint', () => {
  it('returns service health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('CareerMed API is running');
  });
});
