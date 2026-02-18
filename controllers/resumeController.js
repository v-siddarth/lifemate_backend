const Resume = require('../models/Resume');
const JobSeeker = require('../models/JobSeeker');
const { generateAndUploadResumePDF } = require('../services/pdfService');
const { deleteFromDrive } = require('../config/googleDrive');
const {
  successResponse,
  errorResponse,
  notFoundResponse,
  validationErrorResponse,
} = require('../utils/response');

exports.listResumes = async (req, res) => {
  try {
    const userId = req.user._id;

    const resumes = await Resume.find({ userId })
      .select('title personalInfo isDefault stats createdAt updatedAt')
      .sort({ createdAt: -1 });

    return successResponse(res, 200, 'Resumes fetched successfully', { resumes });
  } catch (error) {
    console.error('List resumes error:', error);
    return errorResponse(res, 500, 'Failed to fetch resumes');
  }
};

exports.buildResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, autoPopulate, personalInfo, summary, styling } = req.body;

    const resumeData = {
      userId,
      title: title || 'My Resume',
      personalInfo,
      summary,
      styling,
      workExperience: [],
      education: [],
      skills: [],
      certifications: [],
      projects: [],
    };

    if (autoPopulate) {
      const jobSeeker = await JobSeeker.findOne({ user: userId }).populate(
        'user',
        'firstName lastName email'
      );

      if (jobSeeker) {
        resumeData.personalInfo = {
          fullName: `${jobSeeker.user.firstName} ${jobSeeker.user.lastName}`,
          email: jobSeeker.user.email,
          phone: jobSeeker.phone || personalInfo?.phone || '',
          linkedIn: jobSeeker.linkedIn || personalInfo?.linkedIn || '',
          github: personalInfo?.github || '',
          website: personalInfo?.website || '',
          address: jobSeeker.address || personalInfo?.address || {},
        };

        if (jobSeeker.workExperience) resumeData.workExperience = jobSeeker.workExperience;
        if (jobSeeker.education) resumeData.education = jobSeeker.education;
        if (jobSeeker.skills) resumeData.skills = jobSeeker.skills;
        if (jobSeeker.certifications) resumeData.certifications = jobSeeker.certifications;
        if (jobSeeker.summary) resumeData.summary = jobSeeker.summary;
      }
    }

    const resume = await Resume.create(resumeData);
    return successResponse(res, 201, 'Resume created successfully', { resume });
  } catch (error) {
    console.error('Build resume error:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return validationErrorResponse(res, errors);
    }
    return errorResponse(res, 500, 'Failed to create resume');
  }
};

exports.getResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const resumeId = req.params.id;

    const resume = await Resume.findOne({ _id: resumeId, userId });

    if (!resume) {
      return notFoundResponse(res, 'Resume not found');
    }

    return successResponse(res, 200, 'Resume fetched successfully', { resume });
  } catch (error) {
    console.error('Get resume error:', error);
    return errorResponse(res, 500, 'Failed to fetch resume');
  }
};

exports.updateResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const resumeId = req.params.id;
    const { regeneratePdf, ...updateData } = req.body;

    const resume = await Resume.findOne({ _id: resumeId, userId });

    if (!resume) {
      return notFoundResponse(res, 'Resume not found');
    }

    const protectedFields = ['_id', 'userId', '__v', 'createdAt', 'updatedAt', 'stats', 'pdfUrl', 'pdfDriveFileId'];
    for (const field of protectedFields) {
      if (field in updateData) delete updateData[field];
    }

    Object.assign(resume, updateData);
    await resume.save();

    if (regeneratePdf) {
      try {
        // Delete old PDF from Drive if it exists
        if (resume.pdfDriveFileId) {
          try {
            await deleteFromDrive(resume.pdfDriveFileId);
          } catch (e) {
            console.error('Failed to delete old PDF from Drive:', e.message);
          }
        }

        const jobSeeker = await JobSeeker.findOne({ user: userId });
        const pdfResult = await generateAndUploadResumePDF(resume.toObject(), jobSeeker._id.toString());

        resume.pdfUrl = pdfResult.url;
        resume.pdfDriveFileId = pdfResult.driveFileId;
        await resume.save();
      } catch (pdfError) {
        console.error('PDF regeneration error:', pdfError);
      }
    }

    return successResponse(res, 200, 'Resume updated successfully', { resume });
  } catch (error) {
    console.error('Update resume error:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
      }));
      return validationErrorResponse(res, errors);
    }
    return errorResponse(res, 500, 'Failed to update resume');
  }
};

exports.deleteResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const resumeId = req.params.id;

    const resume = await Resume.findOne({ _id: resumeId, userId });

    if (!resume) {
      return notFoundResponse(res, 'Resume not found');
    }

    // Delete PDF from Google Drive
    if (resume.pdfDriveFileId) {
      try {
        await deleteFromDrive(resume.pdfDriveFileId);
      } catch (driveError) {
        console.error('Drive delete error:', driveError.message);
      }
    }

    await resume.deleteOne();

    return successResponse(res, 200, 'Resume deleted successfully');
  } catch (error) {
    console.error('Delete resume error:', error);
    return errorResponse(res, 500, 'Failed to delete resume');
  }
};

exports.previewResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const resumeId = req.params.id;

    const resume = await Resume.findOne({ _id: resumeId, userId });

    if (!resume) {
      return notFoundResponse(res, 'Resume not found');
    }

    resume.stats.views += 1;
    await resume.save();

    return successResponse(res, 200, 'Resume preview loaded', { resume });
  } catch (error) {
    console.error('Preview resume error:', error);
    return errorResponse(res, 500, 'Failed to load resume preview');
  }
};

exports.downloadResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const resumeId = req.params.id;

    const resume = await Resume.findOne({ _id: resumeId, userId });

    if (!resume) {
      return notFoundResponse(res, 'Resume not found');
    }

    resume.stats.downloads += 1;

    if (!resume.pdfUrl) {
      // Delete old Drive file if regenerating
      if (resume.pdfDriveFileId) {
        try {
          await deleteFromDrive(resume.pdfDriveFileId);
        } catch (e) {
          console.error('Failed to delete old PDF from Drive:', e.message);
        }
      }

      const jobSeeker = await JobSeeker.findOne({ user: userId });
      const pdfResult = await generateAndUploadResumePDF(resume.toObject(), jobSeeker._id.toString());

      resume.pdfUrl = pdfResult.url;
      resume.pdfDriveFileId = pdfResult.driveFileId;
    }

    await resume.save();

    return successResponse(res, 200, 'Resume download generated', {
      downloadUrl: resume.pdfUrl,
    });
  } catch (error) {
    console.error('Download resume error:', error);
    return errorResponse(res, 500, 'Failed to download resume');
  }
};

exports.generatePDF = async (req, res) => {
  try {
    const userId = req.user._id;
    const resumeId = req.params.id;

    const resume = await Resume.findOne({ _id: resumeId, userId });

    if (!resume) {
      return notFoundResponse(res, 'Resume not found');
    }

    // Delete old Drive file before regenerating
    if (resume.pdfDriveFileId) {
      try {
        await deleteFromDrive(resume.pdfDriveFileId);
      } catch (e) {
        console.error('Failed to delete old PDF from Drive:', e.message);
      }
    }

    const jobSeeker = await JobSeeker.findOne({ user: userId });

    const pdfResult = await generateAndUploadResumePDF(resume.toObject(), jobSeeker._id.toString());

    resume.pdfUrl = pdfResult.url;
    resume.pdfDriveFileId = pdfResult.driveFileId;
    await resume.save();

    return successResponse(res, 200, 'PDF generated successfully', {
      pdfUrl: resume.pdfUrl,
    });
  } catch (error) {
    console.error('Generate PDF error:', error);
    return errorResponse(res, 500, 'Failed to generate PDF');
  }
};

exports.setDefaultResume = async (req, res) => {
  try {
    const userId = req.user._id;
    const resumeId = req.params.id;

    const resume = await Resume.findOne({ _id: resumeId, userId });

    if (!resume) {
      return notFoundResponse(res, 'Resume not found');
    }

    await Resume.updateMany({ userId, _id: { $ne: resumeId } }, { isDefault: false });

    resume.isDefault = true;
    await resume.save();

    return successResponse(res, 200, 'Resume set as default');
  } catch (error) {
    console.error('Set default resume error:', error);
    return errorResponse(res, 500, 'Failed to set default resume');
  }
};