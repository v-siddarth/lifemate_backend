const JobSeeker = require('../models/JobSeeker');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const { uploadToDrive, deleteFromDrive, RESUME_FOLDER_ID } = require('../config/googleDrive');
const { successResponse, errorResponse, notFoundResponse, validationErrorResponse } = require('../utils/response');
const PHONE_REGEX = /^[\+]?[1-9][\d]{0,15}$/;

// helper to find JS profile
async function getJobSeekerByUser(userId) {
  const js = await JobSeeker.findOne({ user: userId });
  return js;
}

function splitFullName(fullName) {
  const value = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!value) return { firstName: '', lastName: '' };
  const parts = value.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: 'User' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

// GET /api/jobseeker/profile
exports.getMyProfile = async (req, res) => {
  try {
    const js = await JobSeeker.findOne({ user: req.user._id })
      .populate({ path: 'user', select: 'firstName lastName email phone profileImage role' });
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');
    return successResponse(res, 200, 'Job seeker profile fetched', { jobSeeker: js });
  } catch (err) {
    console.error('Get jobseeker profile error:', err);
    return errorResponse(res, 500, 'Failed to fetch job seeker profile');
  }
};

// PUT /api/jobseeker/profile
exports.updateMyProfile = async (req, res) => {
  try {
    const js = await JobSeeker.findOne({ user: req.user._id });
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    let payload = req.body || {};
    if (typeof req.body?.profile === 'string') {
      try {
        payload = JSON.parse(req.body.profile);
      } catch {
        return errorResponse(res, 400, 'Invalid profile payload');
      }
    }

    const allowed = [
      'title',
      'bio',
      'specializations',
      'experience',
      'education',
      'workExperience',
      'skills',
      'certifications',
      'jobPreferences',
      'privacySettings',
      'personalInfo',
      'professionalInfo',
      'documents',
    ];

    for (const key of allowed) {
      if (payload[key] !== undefined) {
        let value = payload[key];
        // If complex field is sent as string, try to parse JSON
        if (
          typeof value === 'string' &&
          [
            'specializations',
            'experience',
            'education',
            'workExperience',
            'skills',
            'certifications',
            'jobPreferences',
            'privacySettings',
            'personalInfo',
            'professionalInfo',
            'documents',
          ].includes(key)
        ) {
          try {
            value = JSON.parse(value);
          } catch {
            // Special handling: experience sent as a number string => map to { totalYears }
            if (key === 'experience') {
              const n = Number(value);
              if (!Number.isNaN(n)) {
                value = { totalYears: n };
              }
            }
          }
        }
        // If experience is a number, wrap it
        if (key === 'experience' && typeof value === 'number') {
          value = { totalYears: value };
        }
        if (key === 'personalInfo' && value && typeof value === 'object') {
          // Primary email/mobile come from User model; do not allow overwrite from this endpoint
          delete value.email;
          delete value.phone;
          delete value.primaryEmail;
          delete value.primaryPhone;
        }
        if (key === 'education' && Array.isArray(value)) {
          value = value.map((item) => {
            if (!item || typeof item !== 'object') return item;
            return {
              ...item,
              yearOfCompletion: item.yearOfCompletion ? Number(item.yearOfCompletion) : item.yearOfCompletion,
              startYear: item.startYear ? Number(item.startYear) : item.startYear,
            };
          });
        }
        if (key === 'workExperience' && Array.isArray(value)) {
          value = value.map((item) => {
            if (!item || typeof item !== 'object') return item;
            const organization = item.organization || item.company;
            return {
              ...item,
              organization,
              company: organization,
            };
          });
        }
        if (key === 'professionalInfo' && value && typeof value === 'object') {
          const doctorSubSpecialties = Array.isArray(value.doctorSubSpecialties)
            ? value.doctorSubSpecialties
            : value.doctorSubSpecialty
              ? [value.doctorSubSpecialty]
              : [];
          value = {
            ...value,
            doctorSubSpecialties,
            doctorSubSpecialty: doctorSubSpecialties[0] || value.doctorSubSpecialty || '',
          };
        }
        if (key === 'jobPreferences' && value && typeof value === 'object') {
          const preferredLocations = Array.isArray(value.preferredLocations) ? value.preferredLocations : [];
          value = {
            ...value,
            preferredLocations: preferredLocations
              .map((location) => ({
                city: String(location?.city || '').trim(),
                state: String(location?.state || 'Maharashtra').trim(),
                country: String(location?.country || 'India').trim(),
              }))
              .filter((location) => Boolean(location.city)),
          };
        }
        js.set(key, value);
      }
    }

    const userPayload = (payload.user && typeof payload.user === 'object') ? payload.user : {};
    const incomingFullName = payload.fullName || userPayload.fullName;
    if (incomingFullName) {
      const parsed = splitFullName(incomingFullName);
      if (parsed.firstName) req.user.firstName = parsed.firstName;
      if (parsed.lastName) req.user.lastName = parsed.lastName;
    }
    if (typeof userPayload.firstName === 'string' && userPayload.firstName.trim()) {
      req.user.firstName = userPayload.firstName.trim();
    }
    if (typeof userPayload.lastName === 'string' && userPayload.lastName.trim()) {
      req.user.lastName = userPayload.lastName.trim();
    }
    if (typeof userPayload.phone === 'string') {
      const phone = userPayload.phone.trim();
      if (phone && !PHONE_REGEX.test(phone)) {
        return errorResponse(res, 400, 'Please enter a valid phone number');
      }
      req.user.phone = phone || undefined;
    }

    // Keep old fields in sync for existing screens
    if (payload.professionalInfo?.category) {
      js.title =
        payload.professionalInfo.category === 'Other'
          ? payload.professionalInfo.otherCategory || 'Other'
          : payload.professionalInfo.category;
    }
    if (payload.professionalInfo) {
      const sourceInfo = js.professionalInfo || {};
      const specs = Array.isArray(sourceInfo.specifications) ? sourceInfo.specifications : [];
      const fields = Array.isArray(sourceInfo.doctorSubSpecialties)
        ? sourceInfo.doctorSubSpecialties
        : (sourceInfo.doctorSubSpecialty ? [sourceInfo.doctorSubSpecialty] : []);
      js.specializations = [...new Set([...specs, ...fields].filter(Boolean))];
    }

    // Optional file uploads (multipart/form-data)
    if (req.files?.profilePhoto?.[0]) {
      const image = req.files.profilePhoto[0];
      if (!/^image\//.test(image.mimetype)) {
        return errorResponse(res, 400, 'Only image files are allowed for profile photo');
      }

      if (req.user.profileImageDriveFileId) {
        try {
          await deleteFromDrive(req.user.profileImageDriveFileId);
        } catch (error) {
          console.error('Failed to delete old profile photo from Drive:', error.message);
        }
      }

      const imageExt = image.originalname.includes('.')
        ? image.originalname.slice(image.originalname.lastIndexOf('.'))
        : '.jpg';
      const driveResult = await uploadToDrive(
        image.buffer,
        `profile_photo_${js._id}_${Date.now()}${imageExt}`,
        RESUME_FOLDER_ID,
        image.mimetype
      );

      req.user.profileImage = driveResult.webViewLink;
      req.user.profileImageDriveFileId = driveResult.fileId;
    }

    if (req.files?.panCardImage?.[0]) {
      const image = req.files.panCardImage[0];
      const up = await uploadToCloudinary(
        image.buffer,
        `lifemate/jobseekers/${js._id}/documents`,
        'image'
      );
      js.set('documents.panCardImage', {
        url: up.secure_url,
        filename: image.originalname,
        uploadedAt: new Date(),
        publicId: up.public_id,
        bytes: up.bytes,
      });
    }

    if (req.files?.aadhaarCardImage?.[0]) {
      const image = req.files.aadhaarCardImage[0];
      const up = await uploadToCloudinary(
        image.buffer,
        `lifemate/jobseekers/${js._id}/documents`,
        'image'
      );
      js.set('documents.aadhaarCardImage', {
        url: up.secure_url,
        filename: image.originalname,
        uploadedAt: new Date(),
        publicId: up.public_id,
        bytes: up.bytes,
      });
      // Backward compatible mapping
      js.set('documents.aadhaarCardFrontImage', {
        url: up.secure_url,
        filename: image.originalname,
        uploadedAt: new Date(),
        publicId: up.public_id,
        bytes: up.bytes,
      });
    }

    if (req.files?.aadhaarCardFrontImage?.[0]) {
      const image = req.files.aadhaarCardFrontImage[0];
      const up = await uploadToCloudinary(
        image.buffer,
        `lifemate/jobseekers/${js._id}/documents`,
        'image'
      );
      js.set('documents.aadhaarCardFrontImage', {
        url: up.secure_url,
        filename: image.originalname,
        uploadedAt: new Date(),
        publicId: up.public_id,
        bytes: up.bytes,
      });
    }

    if (req.files?.aadhaarCardBackImage?.[0]) {
      const image = req.files.aadhaarCardBackImage[0];
      const up = await uploadToCloudinary(
        image.buffer,
        `lifemate/jobseekers/${js._id}/documents`,
        'image'
      );
      js.set('documents.aadhaarCardBackImage', {
        url: up.secure_url,
        filename: image.originalname,
        uploadedAt: new Date(),
        publicId: up.public_id,
        bytes: up.bytes,
      });
    }

    await js.save();
    await req.user.save();
    const updated = await JobSeeker.findById(js._id).populate({
      path: 'user',
      select: 'firstName lastName email phone profileImage role',
    });
    return successResponse(res, 200, 'Job seeker profile updated', { jobSeeker: updated });
  } catch (err) {
    console.error('Update jobseeker profile error:', err);
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));
      return validationErrorResponse(res, errors);
    }
    return errorResponse(res, 500, 'Failed to update job seeker profile');
  }
};

// POST /api/jobseeker/resume  —  NOW USES GOOGLE DRIVE
exports.uploadResume = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    if (!req.file) return errorResponse(res, 400, 'No resume file uploaded');

    // Only allow PDF files
    if (req.file.mimetype !== 'application/pdf') {
      return errorResponse(res, 400, 'Only PDF files are allowed for resume upload');
    }

    // Delete previous resume from Google Drive (if exists)
    if (js.resume && js.resume.driveFileId) {
      try {
        await deleteFromDrive(js.resume.driveFileId);
      } catch (e) {
        console.error('Failed to delete old resume from Drive:', e.message);
      }
    }
    // Also clean up old Cloudinary resume if migrating
    if (js.resume && js.resume.publicId) {
      try {
        await deleteFromCloudinary(js.resume.publicId);
      } catch (e) {
        console.error('Failed to delete old resume from Cloudinary:', e.message);
      }
    }

    // Upload to Google Drive
    const driveResult = await uploadToDrive(
      req.file.buffer,
      `resume_${js._id}_${Date.now()}.pdf`,
      RESUME_FOLDER_ID
    );

    js.resume = {
      url: driveResult.webViewLink,
      filename: req.file.originalname,
      uploadedAt: new Date(),
      driveFileId: driveResult.fileId,
      bytes: driveResult.size,
      storageType: 'google_drive',
    };
    await js.save();

    return successResponse(res, 200, 'Resume uploaded', { resume: js.resume });
  } catch (err) {
    console.error('Upload resume error:', err);
    return errorResponse(res, 500, 'Failed to upload resume');
  }
};

// DELETE /api/jobseeker/resume  —  NOW USES GOOGLE DRIVE
exports.deleteResume = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    // Delete from Google Drive
    if (js.resume && js.resume.driveFileId) {
      try {
        await deleteFromDrive(js.resume.driveFileId);
      } catch (e) {
        console.error('Failed to delete resume from Drive:', e.message);
      }
    }
    // Fallback: delete from Cloudinary if old resume
    if (js.resume && js.resume.publicId) {
      try {
        await deleteFromCloudinary(js.resume.publicId);
      } catch (e) {
        console.error('Failed to delete resume from Cloudinary:', e.message);
      }
    }

    js.resume = undefined;
    await js.save();

    return successResponse(res, 200, 'Resume deleted');
  } catch (err) {
    console.error('Delete resume error:', err);
    return errorResponse(res, 500, 'Failed to delete resume');
  }
};

// POST /api/jobseeker/cover-letter
exports.uploadCoverLetter = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    if (!req.file) return errorResponse(res, 400, 'No cover letter file uploaded');

    if (js.coverLetter && js.coverLetter.publicId) {
      try { await deleteFromCloudinary(js.coverLetter.publicId); } catch (e) {}
    }

    const up = await uploadToCloudinary(req.file.buffer, `lifemate/jobseekers/${js._id}`, 'raw');
    js.coverLetter = {
      url: up.secure_url,
      filename: req.file.originalname,
      uploadedAt: new Date(),
      publicId: up.public_id,
      bytes: up.bytes,
    };
    await js.save();

    return successResponse(res, 200, 'Cover letter uploaded', { coverLetter: js.coverLetter });
  } catch (err) {
    console.error('Upload cover letter error:', err);
    return errorResponse(res, 500, 'Failed to upload cover letter');
  }
};

// DELETE /api/jobseeker/cover-letter
exports.deleteCoverLetter = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    if (js.coverLetter && js.coverLetter.publicId) {
      try { await deleteFromCloudinary(js.coverLetter.publicId); } catch (e) {}
    }
    js.coverLetter = undefined;
    await js.save();

    return successResponse(res, 200, 'Cover letter deleted');
  } catch (err) {
    console.error('Delete cover letter error:', err);
    return errorResponse(res, 500, 'Failed to delete cover letter');
  }
};

// POST /api/jobseeker/projects
exports.addProject = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    const { title, description, technologies, startDate, endDate, url, role } = req.body;
    
    if (!title) return errorResponse(res, 400, 'Project title is required');

    js.projects.push({ title, description, technologies, startDate, endDate, url, role });
    await js.save();

    return successResponse(res, 200, 'Project added successfully', { projects: js.projects });
  } catch (err) {
    console.error('Add project error:', err);
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));
      return validationErrorResponse(res, errors);
    }
    return errorResponse(res, 500, 'Failed to add project');
  }
};

// PUT /api/jobseeker/projects/:projectId
exports.updateProject = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    const project = js.projects.id(req.params.projectId);
    if (!project) return notFoundResponse(res, 'Project not found');

    const { title, description, technologies, startDate, endDate, url, role } = req.body;
    
    if (title !== undefined) project.title = title;
    if (description !== undefined) project.description = description;
    if (technologies !== undefined) project.technologies = technologies;
    if (startDate !== undefined) project.startDate = startDate;
    if (endDate !== undefined) project.endDate = endDate;
    if (url !== undefined) project.url = url;
    if (role !== undefined) project.role = role;

    await js.save();

    return successResponse(res, 200, 'Project updated successfully', { projects: js.projects });
  } catch (err) {
    console.error('Update project error:', err);
    return errorResponse(res, 500, 'Failed to update project');
  }
};

// DELETE /api/jobseeker/projects/:projectId
exports.deleteProject = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    const project = js.projects.id(req.params.projectId);
    if (!project) return notFoundResponse(res, 'Project not found');

    project.deleteOne();
    await js.save();

    return successResponse(res, 200, 'Project deleted successfully', { projects: js.projects });
  } catch (err) {
    console.error('Delete project error:', err);
    return errorResponse(res, 500, 'Failed to delete project');
  }
};

// POST /api/jobseeker/languages
exports.addLanguage = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    const { name, proficiency } = req.body;
    
    if (!name) return errorResponse(res, 400, 'Language name is required');

    js.languages.push({ name, proficiency: proficiency || 'Intermediate' });
    await js.save();

    return successResponse(res, 200, 'Language added successfully', { languages: js.languages });
  } catch (err) {
    console.error('Add language error:', err);
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));
      return validationErrorResponse(res, errors);
    }
    return errorResponse(res, 500, 'Failed to add language');
  }
};

// PUT /api/jobseeker/languages/:languageId
exports.updateLanguage = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    const language = js.languages.id(req.params.languageId);
    if (!language) return notFoundResponse(res, 'Language not found');

    const { name, proficiency } = req.body;
    
    if (name !== undefined) language.name = name;
    if (proficiency !== undefined) language.proficiency = proficiency;

    await js.save();

    return successResponse(res, 200, 'Language updated successfully', { languages: js.languages });
  } catch (err) {
    console.error('Update language error:', err);
    return errorResponse(res, 500, 'Failed to update language');
  }
};

// DELETE /api/jobseeker/languages/:languageId
exports.deleteLanguage = async (req, res) => {
  try {
    const js = await getJobSeekerByUser(req.user._id);
    if (!js) return notFoundResponse(res, 'Job seeker profile not found');

    const language = js.languages.id(req.params.languageId);
    if (!language) return notFoundResponse(res, 'Language not found');

    language.deleteOne();
    await js.save();

    return successResponse(res, 200, 'Language deleted successfully', { languages: js.languages });
  } catch (err) {
    console.error('Delete language error:', err);
    return errorResponse(res, 500, 'Failed to delete language');
  }
};
