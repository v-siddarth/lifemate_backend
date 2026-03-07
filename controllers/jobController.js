const Job = require('../models/Job');
const Employer = require('../models/Employer');
const {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  forbiddenResponse,
} = require('../utils/response');
const { notifyMatchingJobSeekersForJob } = require('../services/notificationService');

const normalizeScreeningQuestions = (raw) => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      if (!item) return null;
      const question =
        typeof item === 'string'
          ? item.trim()
          : typeof item.question === 'string'
            ? item.question.trim()
            : '';

      if (!question) return null;

      return {
        question,
        required: Boolean(item.required),
        order: Number.isFinite(item.order) ? Number(item.order) : index,
      };
    })
    .filter(Boolean);
};

const buildJobFilters = (q) => {
  const f = {};
  if (q.status) f.status = q.status;
  if (q.specialization) f.specialization = q.specialization;
  if (q.city) f['location.city'] = q.city;
  if (q.state) f['location.state'] = q.state;
  if (q.country) f['location.country'] = q.country;
  if (q.jobType) f.jobType = q.jobType;
  if (q.shift) f.shift = q.shift;
  if (q.isRemote !== undefined) f.isRemote = q.isRemote === 'true';
  if (q.experienceMin) f['experienceRequired.minYears'] = { $lte: Number(q.experienceMin) };
  if (q.experienceMax) f['experienceRequired.maxYears'] = { $gte: Number(q.experienceMax) };
  if (q.dateFrom || q.dateTo) {
    f.postedAt = {};
    if (q.dateFrom) f.postedAt.$gte = new Date(q.dateFrom);
    if (q.dateTo) f.postedAt.$lte = new Date(q.dateTo);
  }
  if (q.search) f.$text = { $search: q.search };
  return f;
};

const canAccessNonPublicJob = async (req, job) => {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'employer') return false;

  const employer = await Employer.findOne({ user: req.user._id });
  return !!(employer && employer._id.toString() === job.employer.toString());
};

// GET /jobs
exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const filters = buildJobFilters(req.query);
    const sort = req.query.sort || '-postedAt';

    const isPublicAudience = !req.user || req.user.role === 'jobseeker';
    if (isPublicAudience) {
      // Jobseekers/public must only see active jobs.
      filters.status = 'Active';
    } else if (!req.query.includeArchived) {
      filters.status = { $ne: 'Archived' };
    }

    const [items, total] = await Promise.all([
      Job.find(filters).sort(sort).skip(skip).limit(limit),
      Job.countDocuments(filters),
    ]);

    return successResponse(res, 200, 'Jobs fetched', {
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('List jobs error:', err);
    return errorResponse(res, 500, 'Failed to fetch jobs');
  }
};

// GET /jobs/my (employer)
exports.listByEmployer = async (req, res) => {
  try {
    const employer = await Employer.findOne({ user: req.user._id });
    if (!employer) return errorResponse(res, 403, 'Employer profile not found');

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const filters = buildJobFilters(req.query);
    filters.employer = employer._id;

    const sort = req.query.sort || '-postedAt';
    if (!req.query.includeArchived) {
      filters.status = { $ne: 'Archived' };
    }

    const [items, total] = await Promise.all([
      Job.find(filters).sort(sort).skip(skip).limit(limit),
      Job.countDocuments(filters),
    ]);

    return successResponse(res, 200, 'Employer jobs fetched', {
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('List employer jobs error:', err);
    return errorResponse(res, 500, 'Failed to fetch employer jobs');
  }
};

// GET /jobs/:id
exports.getById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return notFoundResponse(res, 'Job not found');

    if (job.status !== 'Active') {
      const allowed = await canAccessNonPublicJob(req, job);
      if (!allowed) {
        return forbiddenResponse(res, 'Not authorized to view this job.');
      }
    }

    job.incViews().catch(() => {});

    return successResponse(res, 200, 'Job fetched', { job });
  } catch (err) {
    console.error('Get job error:', err);
    return errorResponse(res, 500, 'Failed to fetch job');
  }
};

// POST /jobs (employer)
exports.create = async (req, res) => {
  try {
    const employer = await Employer.findOne({ user: req.user._id });
    if (!employer) return errorResponse(res, 403, 'Employer profile not found');
    const hasCompleteAddress = Boolean(
      employer?.address?.street?.trim() &&
      employer?.address?.city?.trim() &&
      employer?.address?.state?.trim() &&
      employer?.address?.pincode?.trim()
    );
    if (!hasCompleteAddress) {
      return validationErrorResponse(res, [
        {
          field: 'address',
          message: 'Complete employer profile address is required before posting jobs.',
        },
      ]);
    }

    const payload = { ...req.body };
    payload.employer = employer._id;
    payload.organizationName = employer.organizationName;
    payload.screeningQuestions = normalizeScreeningQuestions(payload.screeningQuestions);
    if (!payload.location) {
      payload.location = {
        city: employer.address.city,
        state: employer.address.state,
        country: employer.address.country,
      };
    }

    const job = await Job.create(payload);

    await employer.updateJobStats(1);
    if (job.status === 'Active') {
      await employer.updateActiveJobStats(1);
      notifyMatchingJobSeekersForJob(job).catch(() => {});
    }

    return successResponse(res, 201, 'Job created', { job });
  } catch (err) {
    console.error('Create job error:', err);
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
      }));
      return validationErrorResponse(res, errors);
    }
    return errorResponse(res, 500, 'Failed to create job');
  }
};

// PATCH /jobs/:id (employer/admin)
exports.update = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return notFoundResponse(res, 'Job not found');

    if (req.user.role !== 'admin') {
      const employer = await Employer.findOne({ user: req.user._id });
      if (!employer || job.employer.toString() !== employer._id.toString()) {
        return errorResponse(res, 403, 'Not authorized to update this job');
      }
    }

    const updates = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updates, 'screeningQuestions')) {
      updates.screeningQuestions = normalizeScreeningQuestions(
        updates.screeningQuestions
      );
    }

    Object.assign(job, updates);
    await job.save();
    return successResponse(res, 200, 'Job updated', { job });
  } catch (err) {
    console.error('Update job error:', err);
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
      }));
      return validationErrorResponse(res, errors);
    }
    return errorResponse(res, 500, 'Failed to update job');
  }
};

// PATCH /jobs/:id/status (employer/admin)
exports.changeStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const job = await Job.findById(req.params.id);
    if (!job) return notFoundResponse(res, 'Job not found');

    let employer;
    if (req.user.role !== 'admin') {
      employer = await Employer.findOne({ user: req.user._id });
      if (!employer || job.employer.toString() !== employer._id.toString()) {
        return errorResponse(res, 403, 'Not authorized to change status');
      }
    } else {
      employer = await Employer.findById(job.employer);
    }

    const oldStatus = job.status;
    job.status = status;
    await job.save();

    if (oldStatus !== status) {
      if (status === 'Active' && oldStatus !== 'Active') {
        await employer.updateActiveJobStats(1);
        notifyMatchingJobSeekersForJob(job).catch(() => {});
      } else if (oldStatus === 'Active' && status !== 'Active') {
        await employer.updateActiveJobStats(-1);
      }
    }

    return successResponse(res, 200, 'Status updated', { job });
  } catch (err) {
    console.error('Change status error:', err);
    return errorResponse(res, 500, 'Failed to change status');
  }
};

// DELETE /jobs/:id (employer/admin)
exports.remove = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return notFoundResponse(res, 'Job not found');

    let employer;
    if (req.user.role !== 'admin') {
      employer = await Employer.findOne({ user: req.user._id });
      if (!employer || job.employer.toString() !== employer._id.toString()) {
        return errorResponse(res, 403, 'Not authorized to delete');
      }
    } else {
      employer = await Employer.findById(job.employer);
    }

    const oldStatus = job.status;
    job.status = 'Archived';
    await job.save();

    if (oldStatus === 'Active') {
      await employer.updateActiveJobStats(-1);
    }

    return successResponse(res, 200, 'Job archived');
  } catch (err) {
    console.error('Delete job error:', err);
    return errorResponse(res, 500, 'Failed to delete job');
  }
};
