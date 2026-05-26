const Employer = require('../models/Employer');
const { successResponse, errorResponse, validationErrorResponse, notFoundResponse, getPaginationMeta } = require('../utils/response');
const { uploadToDrive, RESUME_FOLDER_ID } = require('../config/googleDrive');

const MANDATORY_CERTIFICATE_NAMES = [
  'Bombay Nursing Certificate',
  'Hospital Registration Certificate',
];
const SPECIALIZATION_MAX_LENGTH = 100;

const ALLOWED_CERTIFICATE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const normalizeSpecialization = (value = '') =>
  String(value).trim().replace(/\s+/g, ' ').slice(0, SPECIALIZATION_MAX_LENGTH);

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/employer/profile
exports.getMyProfile = async (req, res) => {
  try {
    let employer = await Employer.findOne({ user: req.user._id });
    
    if (!employer) {
      if (req.user.role === 'employer') {
        employer = await Employer.create({ user: req.user._id });
      } else {
        return notFoundResponse(res, 'Employer profile not found');
      }
    }
    
    return successResponse(res, 200, 'Employer profile fetched', { employer });
  } catch (err) {
    console.error('Get employer profile error:', err);
    return errorResponse(res, 500, 'Failed to fetch employer profile');
  }
};

// GET /api/employer/profile/refresh - Refetch and sync stats with database
exports.refreshProfile = async (req, res) => {
  try {
    const employer = await Employer.findOne({ user: req.user._id });
    if (!employer) return notFoundResponse(res, 'Employer profile not found');

    // Sync all stats from database
    await employer.syncActiveJobStats();
    await employer.syncAllStats();

    // Fetch fresh copy
    const updated = await Employer.findById(employer._id);
    return successResponse(res, 200, 'Employer profile refreshed with latest stats', { employer: updated });
  } catch (err) {
    console.error('Refresh employer profile error:', err);
    return errorResponse(res, 500, 'Failed to refresh employer profile');
  }
};

// POST /api/employer/profile (create or update in one call)
exports.createOrUpdateProfile = async (req, res) => {
  try {
    let body = { ...(req.body || {}) };

    if (typeof req.body?.profile === 'string') {
      try {
        body = JSON.parse(req.body.profile);
      } catch {
        return errorResponse(res, 400, 'Invalid profile payload');
      }
    }

    if (typeof body.employerCertificates === 'string') {
      try {
        body.employerCertificates = JSON.parse(body.employerCertificates);
      } catch {
        body.employerCertificates = [];
      }
    }

    if (body.organizationType === 'Other' && !String(body.organizationTypeOther || '').trim()) {
      return validationErrorResponse(res, [
        { field: 'organizationTypeOther', message: 'Please specify organization type when selecting Other' },
      ]);
    }

    if (body.numberOfBeds !== undefined && body.numberOfBeds !== null && body.numberOfBeds !== '') {
      const beds = Number(body.numberOfBeds);
      if (!Number.isFinite(beds) || beds < 0) {
        return validationErrorResponse(res, [
          { field: 'numberOfBeds', message: 'Please provide a valid number of beds' },
        ]);
      }
      body.numberOfBeds = Math.floor(beds);
    } else if (body.numberOfBeds === '') {
      body.numberOfBeds = undefined;
    }

    if (Array.isArray(body.specializations)) {
      const normalizedSpecializations = body.specializations
        .map(normalizeSpecialization)
        .filter(Boolean);
      body.specializations = [...new Set(normalizedSpecializations)];
    }

    if (Array.isArray(body.employerCertificates)) {
      const uploadedCertificateFiles = req.files?.employerCertificateFiles || [];
      const fileKeysRaw = req.body?.employerCertificateFileKeys;
      const fileKeys = Array.isArray(fileKeysRaw)
        ? fileKeysRaw
        : fileKeysRaw
          ? [fileKeysRaw]
          : [];
      const uploadedByKey = {};

      for (const file of uploadedCertificateFiles) {
        if (!ALLOWED_CERTIFICATE_MIME_TYPES.has(file.mimetype)) {
          return errorResponse(
            res,
            400,
            `Unsupported document type for certificate upload: ${file.mimetype}`
          );
        }
      }

      const uploadResults = await Promise.all(
        uploadedCertificateFiles.map(async (file, index) => {
          const uploadKey = String(fileKeys[index] || '').trim();
          const safeOriginalName = String(file.originalname || 'certificate')
            .replace(/[^\w.\-]+/g, '_')
            .slice(0, 120);
          const uploaded = await uploadToDrive(
            file.buffer,
            `employer_certificate_${req.user._id}_${Date.now()}_${index}_${safeOriginalName}`,
            RESUME_FOLDER_ID,
            file.mimetype
          );
          return {
            uploadKey,
            url: uploaded.webViewLink,
            driveFileId: uploaded.fileId,
          };
        })
      );

      for (const item of uploadResults) {
        if (!item.uploadKey) continue;
        uploadedByKey[item.uploadKey] = {
          url: item.url,
          driveFileId: item.driveFileId,
        };
      }

      body.employerCertificates = body.employerCertificates
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const name = String(item.name || '').trim();
          const uploadKey = String(item.uploadKey || '').trim();
          return {
            ...item,
            name,
            customName: String(item.customName || '').trim(),
            category: MANDATORY_CERTIFICATE_NAMES.includes(name) ? 'Mandatory' : 'Optional',
            issuingBody: String(item.issuingBody || '').trim(),
            documentUrl: String(uploadedByKey[uploadKey]?.url || item.documentUrl || '').trim(),
            driveFileId: String(
              uploadedByKey[uploadKey]?.driveFileId || item.driveFileId || ''
            ).trim(),
            notes: String(item.notes || '').trim(),
          };
        })
        .filter((item) => item.name);

      const invalidOther = body.employerCertificates.find(
        (item) => item.name === 'Other' && !item.customName
      );
      if (invalidOther) {
        return validationErrorResponse(res, [
          { field: 'employerCertificates', message: 'Custom name is required when certificate type is Other' },
        ]);
      }

      const missingMandatory = MANDATORY_CERTIFICATE_NAMES.filter((requiredName) => {
        const found = body.employerCertificates.find(
          (item) => item.name === requiredName && item.documentUrl
        );
        return !found;
      });

      if (missingMandatory.length > 0) {
        return validationErrorResponse(res, [
          {
            field: 'employerCertificates',
            message: `Mandatory certificates are missing: ${missingMandatory.join(', ')}`,
          },
        ]);
      }
    } else {
      return validationErrorResponse(res, [
        {
          field: 'employerCertificates',
          message: 'Please upload mandatory employer certificates',
        },
      ]);
    }

    let employer = await Employer.findOne({ user: req.user._id });

    if (!employer) {
      employer = new Employer({ ...body, user: req.user._id });
    } else {
      Object.assign(employer, body);
    }

    await employer.save();

    return successResponse(res, 200, 'Employer profile saved', { employer });
  } catch (err) {
    console.error('Save employer profile error:', err);
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));
      return validationErrorResponse(res, errors);
    }
    return errorResponse(res, 500, 'Failed to save employer profile');
  }
};

// GET /api/employer/all - Browse all employers (for jobseekers)
exports.getAllEmployers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      search = '', 
      organizationType = '',
      city = '',
      state = '',
      specialization = '',
      verified = '',
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    const filter = {};

    // Search by organization name or description
    if (search) {
      filter.$or = [
        { organizationName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by organization type
    if (organizationType) {
      filter.organizationType = organizationType;
    }

    // Filter by location
    if (city) {
      filter['address.city'] = { $regex: city, $options: 'i' };
    }
    if (state) {
      filter['address.state'] = { $regex: state, $options: 'i' };
    }

    // Filter by specialization
    if (specialization) {
      const normalizedSpecialization = normalizeSpecialization(specialization);
      if (normalizedSpecialization) {
        filter.specializations = {
          $regex: `^${escapeRegExp(normalizedSpecialization)}$`,
          $options: 'i',
        };
      }
    }

    // Filter by verification status
    if (verified === 'true') {
      filter['verification.isVerified'] = true;
    } else if (verified === 'false') {
      filter['verification.isVerified'] = false;
    }

    // Build sort object
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortOptions = {};
    
    switch (sortBy) {
      case 'name':
        sortOptions.organizationName = sortOrder;
        break;
      case 'jobs':
        sortOptions['stats.activeJobPosts'] = sortOrder;
        break;
      case 'views':
        sortOptions['stats.profileViews'] = sortOrder;
        break;
      default:
        sortOptions.createdAt = sortOrder;
    }

    // Execute query with pagination
    const [employers, total] = await Promise.all([
      Employer.find(filter)
        .populate({ 
          path: 'user', 
          select: 'firstName lastName email phone profileImage isActive' 
        })
        .select('-verification.documents -settings -subscription.features')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Employer.countDocuments(filter)
    ]);

    // Increment profile views for each employer (async, don't wait)
    if (employers.length > 0) {
      const employerIds = employers.map(e => e._id);
      Employer.updateMany(
        { _id: { $in: employerIds } },
        { $inc: { 'stats.profileViews': 1 } }
      ).exec().catch(err => console.error('Failed to update profile views:', err));
    }

    const meta = getPaginationMeta(pageNum, limitNum, total);

    return successResponse(res, 200, 'Employers fetched successfully', { employers }, meta);
  } catch (err) {
    console.error('Get all employers error:', err);
    return errorResponse(res, 500, 'Failed to fetch employers');
  }
};

// GET /api/employer/:id - Get single employer profile by ID (for jobseekers)
exports.getEmployerById = async (req, res) => {
  try {
    const employer = await Employer.findById(req.params.id)
      .populate({ 
        path: 'user', 
        select: 'firstName lastName email phone profileImage isActive' 
      })
      .select('-verification.documents -settings')
      .lean();

    if (!employer) {
      return notFoundResponse(res, 'Employer not found');
    }

    // Increment profile view count (async)
    Employer.findByIdAndUpdate(
      req.params.id,
      { $inc: { 'stats.profileViews': 1 } }
    ).exec().catch(err => console.error('Failed to update profile view:', err));

    return successResponse(res, 200, 'Employer profile fetched', { employer });
  } catch (err) {
    console.error('Get employer by ID error:', err);
    return errorResponse(res, 500, 'Failed to fetch employer profile');
  }
};
