const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('job expiry visibility', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('filters expired jobs out of public listings', async () => {
    const findChain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };

    const findMock = jest.fn(() => findChain);
    const countDocumentsMock = jest.fn().mockResolvedValue(0);

    jest.doMock('../models/Job', () => ({
      find: findMock,
      countDocuments: countDocumentsMock,
    }));
    jest.doMock('../models/Employer', () => ({}));

    const jobController = require('../controllers/jobController');
    const req = { query: {}, user: { role: 'jobseeker' } };
    const res = createMockResponse();

    await jobController.list(req, res);

    expect(findMock).toHaveBeenCalledTimes(1);
    const filters = findMock.mock.calls[0][0];
    expect(filters.status).toBe('Active');
    expect(filters.$or).toEqual([
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: expect.any(Date) } },
    ]);
  });

  it('blocks expired jobs on direct public detail requests', async () => {
    const findByIdMock = jest.fn().mockResolvedValue({
      _id: 'job-1',
      status: 'Active',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      isOpen: () => false,
      incViews: jest.fn(),
    });

    jest.doMock('../models/Job', () => ({
      findById: findByIdMock,
    }));
    jest.doMock('../models/Employer', () => ({
      findOne: jest.fn(),
    }));

    const jobController = require('../controllers/jobController');
    const req = { params: { id: 'job-1' }, user: { role: 'jobseeker' } };
    const res = createMockResponse();

    await jobController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Job is no longer available',
      })
    );
  });

  it('still allows employers to open their expired job details', async () => {
    const incViewsMock = jest.fn().mockResolvedValue(undefined);
    const findByIdMock = jest.fn().mockResolvedValue({
      _id: 'job-1',
      employer: { toString: () => 'employer-1' },
      status: 'Active',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      isOpen: () => false,
      incViews: incViewsMock,
    });

    jest.doMock('../models/Job', () => ({
      findById: findByIdMock,
    }));
    jest.doMock('../models/Employer', () => ({
      findOne: jest.fn().mockResolvedValue({ _id: { toString: () => 'employer-1' } }),
    }));

    const jobController = require('../controllers/jobController');
    const req = { params: { id: 'job-1' }, user: { role: 'employer', _id: 'user-1' } };
    const res = createMockResponse();

    await jobController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Job fetched',
      })
    );
  });
});
