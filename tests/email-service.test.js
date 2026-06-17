describe('Email service sender identity', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the authenticated Gmail sender when EMAIL_FROM is a different address', () => {
    process.env.EMAIL_HOST = 'smtp.gmail.com';
    process.env.EMAIL_USER = 'careermed.sender@gmail.com';
    process.env.EMAIL_FROM = 'noreply@lifemate.com';
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const emailService = require('../services/emailService');

    expect(emailService._private.getSenderEmail()).toBe('careermed.sender@gmail.com');
  });

  it('allows EMAIL_FROM on non-Gmail SMTP providers', () => {
    process.env.EMAIL_HOST = 'smtp.resend.com';
    process.env.EMAIL_USER = 'apikey';
    process.env.EMAIL_FROM = 'support@careermed.in';

    const emailService = require('../services/emailService');

    expect(emailService._private.getSenderEmail()).toBe('support@careermed.in');
  });
});
