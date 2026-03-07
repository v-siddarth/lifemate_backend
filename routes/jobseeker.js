const express = require('express');
const router = express.Router();
const jobSeekerController = require('../controllers/jobSeekerController');
const { authenticate, requireJobSeeker } = require('../middlewares/auth');
const { uploadAny, uploadDocument } = require('../middlewares/upload');

router.get('/profile', authenticate, requireJobSeeker, jobSeekerController.getMyProfile);
router.put(
  '/profile',
  authenticate,
  requireJobSeeker,
  uploadAny.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'panCardImage', maxCount: 1 },
    { name: 'aadhaarCardImage', maxCount: 1 },
    { name: 'aadhaarCardFrontImage', maxCount: 1 },
    { name: 'aadhaarCardBackImage', maxCount: 1 },
  ]),
  jobSeekerController.updateMyProfile
);

router.post('/resume', authenticate, requireJobSeeker, uploadDocument.single('resume'), jobSeekerController.uploadResume);
router.delete('/resume', authenticate, requireJobSeeker, jobSeekerController.deleteResume);

router.post('/cover-letter', authenticate, requireJobSeeker, uploadDocument.single('coverLetter'), jobSeekerController.uploadCoverLetter);
router.delete('/cover-letter', authenticate, requireJobSeeker, jobSeekerController.deleteCoverLetter);

router.post(
  '/professional-document/council-registration-certificate',
  authenticate,
  requireJobSeeker,
  uploadAny.single('councilRegistrationCertificate'),
  jobSeekerController.uploadCouncilRegistrationCertificate
);
router.delete(
  '/professional-document/council-registration-certificate',
  authenticate,
  requireJobSeeker,
  jobSeekerController.deleteCouncilRegistrationCertificate
);

router.post(
  '/education/:educationId/certificate',
  authenticate,
  requireJobSeeker,
  uploadAny.single('educationCertificate'),
  jobSeekerController.uploadEducationCertificate
);
router.delete(
  '/education/:educationId/certificate',
  authenticate,
  requireJobSeeker,
  jobSeekerController.deleteEducationCertificate
);

router.post(
  '/work-experience/:experienceId/document',
  authenticate,
  requireJobSeeker,
  uploadAny.single('experienceDocument'),
  jobSeekerController.uploadWorkExperienceDocument
);
router.delete(
  '/work-experience/:experienceId/document',
  authenticate,
  requireJobSeeker,
  jobSeekerController.deleteWorkExperienceDocument
);

// Projects management
router.post('/projects', authenticate, requireJobSeeker, jobSeekerController.addProject);
router.put('/projects/:projectId', authenticate, requireJobSeeker, jobSeekerController.updateProject);
router.delete('/projects/:projectId', authenticate, requireJobSeeker, jobSeekerController.deleteProject);

// Languages management
router.post('/languages', authenticate, requireJobSeeker, jobSeekerController.addLanguage);
router.put('/languages/:languageId', authenticate, requireJobSeeker, jobSeekerController.updateLanguage);
router.delete('/languages/:languageId', authenticate, requireJobSeeker, jobSeekerController.deleteLanguage);

module.exports = router;
