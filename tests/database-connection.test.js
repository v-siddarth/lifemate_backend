describe('Database connection handling', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.dontMock('mongoose');
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('rejects connection failures without exiting the process', async () => {
    process.env.MONGODB_URI = 'mongodb+srv://example.invalid/test';
    const connectError = new Error('Atlas connection failed');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should not be called');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.doMock('mongoose', () => ({
      connection: {
        readyState: 0,
        on: jest.fn(),
        close: jest.fn(),
      },
      connect: jest.fn().mockRejectedValue(connectError),
    }));

    const connectDB = require('../config/database');

    await expect(connectDB()).rejects.toThrow('Atlas connection failed');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('enables proxy trust for Vercel forwarded headers', () => {
    process.env.NODE_ENV = 'test';
    jest.dontMock('mongoose');
    const app = require('../app');

    expect(app.get('trust proxy')).toBe(1);
  });
});
