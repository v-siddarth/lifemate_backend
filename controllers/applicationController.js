const Application = require("../models/Application");
const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const Employer = require("../models/Employer");
const {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  forbiddenResponse,
} = require("../utils/response");
const {
  sendApplicationNotificationEmail,
  sendApplicationSubmittedToJobSeeker,
  sendApplicationStatusUpdateToJobSeeker,
} = require("../services/emailService");
const {
  createNotification,
  notifyApplicationStatusChange,
} = require("../services/notificationService");
const { getApplicationBarrier } = require("../services/planEntitlementService");

const { uploadToCloudinary } = require("../config/cloudinary");

const APPLICATION_STATUSES = [
  "Applied",
  "Under Review",
  "Shortlisted",
  "Interview",
  "Offered",
  "Rejected",
  "Withdrawn",
];

// Build filters for list endpoints
const buildFilters = (q = {}) => {
  const f = {};
  if (q.status) f.status = q.status;
  if (q.job || q.jobId) f.job = q.job || q.jobId;
  if (q.employer) f.employer = q.employer;
  if (q.jobSeeker) f.jobSeeker = q.jobSeeker;
  if (q.viewed === "true") f.isViewedByEmployer = true;
  if (q.viewed === "false") f.isViewedByEmployer = false;
  if (q.dateFrom || q.dateTo) {
    f.appliedAt = {};
    if (q.dateFrom) f.appliedAt.$gte = new Date(q.dateFrom);
    if (q.dateTo) f.appliedAt.$lte = new Date(q.dateTo);
  }
  return f;
};

// POST /jobs/:id/apply (jobseeker)
exports.apply = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job || !job.isOpen())
      return notFoundResponse(res, "Job not open for applications");

    const jobSeeker = await JobSeeker.findOne({ user: req.user._id }).populate({
      path: "user",
      select: "firstName lastName email",
    });
    if (!jobSeeker)
      return errorResponse(res, 403, "Job seeker profile not found");

    const employer = await Employer.findById(job.employer);
    if (!employer) return errorResponse(res, 400, "Employer not found for job");

    // Normalize body fields for both JSON and multipart
    let coverLetter = req.body.coverLetter;
    if (typeof coverLetter === "string") {
      coverLetter = { text: coverLetter };
    } else if (!coverLetter || typeof coverLetter !== "object") {
      coverLetter = {};
    }

    let answers = req.body.answers;
    if (typeof answers === "string") {
      try {
        answers = JSON.parse(answers);
      } catch {
        answers = [];
      }
    }
    if (!Array.isArray(answers)) answers = [];

    const configuredScreeningQuestions = Array.isArray(job.screeningQuestions)
      ? job.screeningQuestions
          .map((item) => {
            if (!item || typeof item.question !== "string") return null;
            return {
              id: item._id ? String(item._id) : "",
              question: item.question.trim(),
              required: Boolean(item.required),
            };
          })
          .filter(Boolean)
      : [];

    const normalizedAnswers = answers
      .map((item) => {
        if (!item) return null;
        const questionId =
          typeof item.questionId === "string" ? item.questionId.trim() : "";
        const question =
          typeof item.question === "string" ? item.question.trim() : "";
        const answer = typeof item.answer === "string" ? item.answer.trim() : "";
        if (!answer) return null;
        return { questionId, question, answer };
      })
      .filter(Boolean);

    let finalAnswers = normalizedAnswers;
    if (configuredScreeningQuestions.length > 0) {
      const answerByQuestionId = new Map(
        normalizedAnswers
          .filter((item) => item.questionId)
          .map((item) => [item.questionId, item])
      );
      const answerByQuestionText = new Map(
        normalizedAnswers
          .filter((item) => item.question)
          .map((item) => [item.question.toLowerCase(), item])
      );

      const missingRequired = configuredScreeningQuestions
        .filter((q) => q.required)
        .find((q) => {
          const byId = q.id ? answerByQuestionId.get(q.id) : null;
          const byText = answerByQuestionText.get(q.question.toLowerCase());
          return !((byId && byId.answer) || (byText && byText.answer));
        });

      if (missingRequired) {
        return validationErrorResponse(res, [
          {
            field: "answers",
            message: `Required screening question missing answer: "${missingRequired.question}"`,
          },
        ]);
      }

      finalAnswers = configuredScreeningQuestions
        .map((q) => {
          const matched = (q.id && answerByQuestionId.get(q.id)) ||
            answerByQuestionText.get(q.question.toLowerCase());
          if (!matched || !matched.answer) return null;
          return {
            questionId: q.id,
            question: q.question,
            answer: matched.answer,
          };
        })
        .filter(Boolean);
    }

    const payload = {
      job: job._id,
      jobSeeker: jobSeeker._id,
      employer: employer._id,
      coverLetter,
      answers: finalAnswers,
    };

    // Handle optional file uploads (multer memory storage is used in route)
    if (req.files && req.files.resume && req.files.resume[0]) {
      const file = req.files.resume[0];
      const up = await uploadToCloudinary(
        file.buffer,
        `lifemate/applications/${jobSeeker._id}`,
        "raw"
      );
      payload.resume = {
        url: up.secure_url,
        filename: file.originalname,
        uploadedAt: new Date(),
        publicId: up.public_id,
        bytes: up.bytes,
      };
    }

    if (
      req.files &&
      req.files.coverLetterFile &&
      req.files.coverLetterFile[0]
    ) {
      const file = req.files.coverLetterFile[0];
      const up = await uploadToCloudinary(
        file.buffer,
        `lifemate/applications/${jobSeeker._id}`,
        "raw"
      );
      payload.coverLetter = Object.assign({}, payload.coverLetter, {
        fileUrl: up.secure_url,
        filename: file.originalname,
        publicId: up.public_id,
        bytes: up.bytes,
      });
    }

    const existingApplication = await Application.findOne({
      job: job._id,
      jobSeeker: jobSeeker._id,
    });

    let application = existingApplication;
    let attemptNumber = 1;

    if (existingApplication) {
      const existingAttempts = Number(existingApplication.applyAttempts || 1);

      if (existingApplication.status !== "Withdrawn") {
        return errorResponse(res, 400, "You have already applied to this job");
      }

      if (existingAttempts >= 2) {
        return errorResponse(
          res,
          400,
          "You have reached the maximum apply attempts for this job and cannot apply again."
        );
      }

      const barrier = await getApplicationBarrier({
        employer,
        jobSeeker,
        existingApplication,
      });
      if (barrier) {
        return validationErrorResponse(res, [
          { field: barrier.field, message: barrier.message },
        ]);
      }

      attemptNumber = existingAttempts + 1;
      const reappliedAt = new Date();
      existingApplication.status = "Applied";
      existingApplication.appliedAt = reappliedAt;
      existingApplication.updatedAtManual = reappliedAt;
      existingApplication.applyAttempts = attemptNumber;
      existingApplication.answers = payload.answers || [];

      if (payload.resume) {
        existingApplication.resume = payload.resume;
      }

      if (payload.coverLetter && Object.keys(payload.coverLetter).length > 0) {
        existingApplication.coverLetter = Object.assign(
          {},
          existingApplication.coverLetter || {},
          payload.coverLetter
        );
      }

      existingApplication.history.push({
        status: "Applied",
        note: `Reapplied by candidate (attempt ${attemptNumber} of 2)`,
        by: req.user._id,
        at: reappliedAt,
      });

      await existingApplication.save();
      application = existingApplication;
    } else {
      const barrier = await getApplicationBarrier({
        employer,
        jobSeeker,
        existingApplication: null,
      });
      if (barrier) {
        return validationErrorResponse(res, [
          { field: barrier.field, message: barrier.message },
        ]);
      }

      const createdAt = new Date();
      payload.applyAttempts = 1;
      payload.history = [
        {
          status: "Applied",
          note: "Application submitted",
          by: req.user._id,
          at: createdAt,
        },
      ];
      application = await Application.create(payload);
      attemptNumber = 1;
    }

    // increment application count on job (non-blocking)
    job.incApplications().catch(() => {});
    // increment total applications count on employer (non-blocking)
    employer.updateApplicationStats(1).catch(() => {});

    createNotification({
      user: req.user._id,
      role: "jobseeker",
      type: "application_status",
      title: "Application submitted",
      message:
        attemptNumber === 2
          ? `Application submitted again for ${job.title}. If you withdraw again, you cannot apply to this job anymore.`
          : `Your application for ${job.title} at ${employer.organizationName} was submitted successfully.`,
      ctaPath: "/dashboard/jobseeker/applications",
      ctaLabel: "View Application",
      metadata: {
        applicationId: String(application._id),
        status: "Applied",
        jobId: String(job._id),
        attemptNumber,
      },
      dedupeKey: `application-submitted:${application._id}:attempt-${attemptNumber}`,
    }).catch(() => {});

    // Send emails in background (non-blocking)
    try {
      // Notify employer of new application if notifications enabled
      if (employer?.settings?.emailNotifications?.newApplication !== false) {
        sendApplicationNotificationEmail(
          employer.contactPerson.email,
          employer.contactPerson.name || employer.organizationName,
          job.title,
          `${jobSeeker.user.firstName} ${jobSeeker.user.lastName}`.trim(),
          jobSeeker.user.email
        ).catch(() => {});
      }
      // Notify jobseeker confirmation
      sendApplicationSubmittedToJobSeeker(
        jobSeeker.user.email,
        `${jobSeeker.user.firstName} ${jobSeeker.user.lastName}`.trim(),
        job.title,
        employer.organizationName
      ).catch(() => {});
    } catch {}

    const warning =
      attemptNumber === 2
        ? "Warning: if you withdraw this application again, you will not be able to apply for this job anymore."
        : null;

    return successResponse(
      res,
      existingApplication ? 200 : 201,
      warning || "Application submitted",
      { application, attemptNumber, warning }
    );
  } catch (err) {
    console.error("Apply error:", err);
    if (err.code === 11000) {
      return errorResponse(res, 400, "You have already applied to this job");
    }
    if (err.name === "ValidationError") {
      const errors = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
      }));
      return validationErrorResponse(res, errors);
    }
    return errorResponse(res, 500, "Failed to submit application");
  }
};

// PATCH /applications/:id/rating (employer/admin)
exports.setRating = async (req, res) => {
  try {
    const { rating } = req.body;
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return validationErrorResponse(res, [
        { field: "rating", message: "Rating must be between 1 and 5" },
      ]);
    }

    const application = await Application.findById(req.params.id).populate(
      "job"
    );
    if (!application) return notFoundResponse(res, "Application not found");

    if (req.user.role !== "admin") {
      const employer = await Employer.findOne({ user: req.user._id });
      if (
        !employer ||
        application.employer.toString() !== employer._id.toString()
      ) {
        return forbiddenResponse(
          res,
          "Not authorized to rate this application"
        );
      }
    }

    application.rating = rating;
    await application.save();

    // Notify jobseeker when moved to Interview or Offered
    try {
      const status = application.status;
      if (["Interview", "Offered"].includes(status)) {
        const candidate = application.jobSeeker;
        const candidateName = candidate?.user
          ? `${candidate.user.firstName} ${candidate.user.lastName}`.trim()
          : "";
        const candidateEmail = candidate?.user?.email;
        const jobTitle = application.job?.title || "Your Application";
        const companyName =
          application.employer?.organizationName || "Employer";
        if (candidateEmail) {
          sendApplicationStatusUpdateToJobSeeker(
            candidateEmail,
            candidateName,
            jobTitle,
            companyName,
            status
          ).catch(() => {});
        }
      }
    } catch {}
    return successResponse(res, 200, "Rating updated", { application });
  } catch (err) {
    console.error("Set rating error:", err);
    return errorResponse(res, 500, "Failed to update rating");
  }
};

// GET /applications/me (jobseeker)
exports.listMyApplications = async (req, res) => {
  try {
    const jobSeeker = await JobSeeker.findOne({ user: req.user._id });
    if (!jobSeeker)
      return errorResponse(res, 403, "Job seeker profile not found");

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filters = buildFilters({ ...req.query, jobSeeker: jobSeeker._id });
    const sort = req.query.sort || "-appliedAt";

    const [items, total] = await Promise.all([
      Application.find(filters)
        .populate("job")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Application.countDocuments(filters),
    ]);

    return successResponse(res, 200, "Applications fetched", {
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("List my applications error:", err);
    return errorResponse(res, 500, "Failed to fetch applications");
  }
};

// GET /applications/employer (employer)
exports.listEmployerApplications = async (req, res) => {
  try {
    const employer = await Employer.findOne({ user: req.user._id });
    if (!employer) return errorResponse(res, 403, "Employer profile not found");

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filters = buildFilters({ ...req.query, employer: employer._id });
    const sort = req.query.sort || "-appliedAt";

    const [items, total] = await Promise.all([
      Application.find(filters)
        .populate({ path: "job", select: "title organizationName location status jobType" })
        .populate({
          path: "jobSeeker",
          select:
            "title specializations experience resume coverLetter professionalInfo personalInfo",
          populate: {
            path: "user",
            select: "firstName lastName email phone profileImage",
          },
        })
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Application.countDocuments(filters),
    ]);

    return successResponse(res, 200, "Employer applications fetched", {
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("List employer applications error:", err);
    return errorResponse(res, 500, "Failed to fetch applications");
  }
};
exports.getById = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate("job")
      .populate({
        path: "jobSeeker",
        select:
          "title bio specializations experience education workExperience skills certifications resume coverLetter personalInfo professionalInfo profileCompletion",
        populate: {
          path: "user",
          select: "firstName lastName email phone profileImage role",
        },
      })
      .populate("employer");

    if (!application) return notFoundResponse(res, "Application not found");

    const isAdmin = req.user.role === "admin";

    if (!isAdmin) {
      const jobSeeker = await JobSeeker.findOne({ user: req.user._id });
      const employer = await Employer.findOne({ user: req.user._id });
      const ownsAsSeeker =
        jobSeeker &&
        application.jobSeeker.toString() === jobSeeker._id.toString();
      const ownsAsEmployer =
        employer &&
        (application.employer.toString() === employer._id.toString() ||
          (application.job &&
            application.job.employer &&
            application.job.employer.toString() === employer._id.toString()));
      if (!ownsAsSeeker && !ownsAsEmployer) {
        return forbiddenResponse(
          res,
          "Not authorized to view this application"
        );
      }

      // Mark viewed by employer when appropriate (non-blocking)
      if (ownsAsEmployer && !application.isViewedByEmployer) {
        application.isViewedByEmployer = true;
        application.save().catch(() => {});
      }
    }

    return successResponse(res, 200, "Application fetched", { application });
  } catch (err) {
    console.error("Get application error:", err);
    return errorResponse(res, 500, "Failed to fetch application");
  }
};

// PATCH /applications/:id/status (employer/admin)
exports.updateStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!APPLICATION_STATUSES.includes(status)) {
      return validationErrorResponse(res, [
        { field: "status", message: "Invalid application status" },
      ]);
    }

    const application = await Application.findById(req.params.id)
      .populate("job")
      .populate({
        path: "jobSeeker",
        populate: { path: "user", select: "firstName lastName email" },
      })
      .populate("employer");
    if (!application) return notFoundResponse(res, "Application not found");

    if (req.user.role !== "admin") {
      const employer = await Employer.findOne({ user: req.user._id });
      const ownsAsEmployer =
        employer &&
        (application.employer.toString() === employer._id.toString() ||
          (application.job &&
            application.job.employer &&
            application.job.employer.toString() === employer._id.toString()));
      if (!ownsAsEmployer) {
        return forbiddenResponse(
          res,
          "Not authorized to update this application"
        );
      }
    }

    const oldStatus = application.status;
    const statusUpdatedAt = new Date();
    application.status = status;
    application.updatedAtManual = statusUpdatedAt;
    application.history.push({
      status,
      note,
      by: req.user._id,
      at: statusUpdatedAt,
    });
    await application.save();

    // Update employer stats if status changed to/from "Offered"
    let employer = application.employer;
    if (!employer || !employer._id) {
      employer = await Employer.findById(application.employer);
    }

    if (employer) {
      // If transitioning TO "Offered", increment totalHires
      if (status === "Offered" && oldStatus !== "Offered") {
        await employer.updateHireStats(1);
      }
      // If transitioning FROM "Offered" to something else, decrement totalHires
      else if (oldStatus === "Offered" && status !== "Offered") {
        await employer.updateHireStats(-1);
      }
    }

    // Notify jobseeker on status changes (all statuses)
    try {
      const candidateUserId = application.jobSeeker?.user?._id || application.jobSeeker?.user;
      notifyApplicationStatusChange({
        userId: candidateUserId,
        status,
        oldStatus,
        jobTitle: application.job?.title,
        companyName: application.employer?.organizationName,
        applicationId: application._id,
        dedupeKey: `application-status:${application._id}:${statusUpdatedAt.getTime()}`,
      }).catch(() => {});

      if (oldStatus !== status) {
        const candidate = application.jobSeeker;
        const candidateName = candidate?.user
          ? `${candidate.user.firstName} ${candidate.user.lastName}`.trim()
          : "";
        const candidateEmail = candidate?.user?.email;
        const jobTitle = application.job?.title || "Your Application";
        const companyName =
          application.employer?.organizationName || "Employer";
        if (candidateEmail) {
          sendApplicationStatusUpdateToJobSeeker(
            candidateEmail,
            candidateName,
            jobTitle,
            companyName,
            status
          ).catch(() => {});
        }
      }
    } catch {}

    return successResponse(res, 200, "Application status updated", {
      application,
    });
  } catch (err) {
    console.error("Update application status error:", err);
    return errorResponse(res, 500, "Failed to update application status");
  }
};

// PATCH /applications/:id/withdraw (jobseeker)
exports.withdrawMine = async (req, res) => {
  try {
    const jobSeeker = await JobSeeker.findOne({ user: req.user._id });
    if (!jobSeeker) {
      return errorResponse(res, 403, "Job seeker profile not found");
    }

    const application = await Application.findById(req.params.id)
      .populate("job")
      .populate("employer");

    if (!application) return notFoundResponse(res, "Application not found");

    if (application.jobSeeker.toString() !== jobSeeker._id.toString()) {
      return forbiddenResponse(res, "Not authorized to withdraw this application");
    }

    if (["Rejected", "Withdrawn"].includes(application.status)) {
      return errorResponse(
        res,
        400,
        `Cannot withdraw an application in ${application.status} status`
      );
    }

    const oldStatus = application.status;
    const withdrawnAt = new Date();
    application.status = "Withdrawn";
    application.updatedAtManual = withdrawnAt;
    application.history.push({
      status: "Withdrawn",
      note: req.body?.note || "Withdrawn by candidate",
      by: req.user._id,
      at: withdrawnAt,
    });
    await application.save();

    let employer = application.employer;
    if (!employer || !employer._id) {
      employer = await Employer.findById(application.employer);
    }

    if (employer && oldStatus === "Offered") {
      await employer.updateHireStats(-1);
    }

    // Notify jobseeker that application was withdrawn
    try {
      const candidate = await JobSeeker.findById(application.jobSeeker).populate({
        path: "user",
        select: "firstName lastName email",
      });
      const candidateName = candidate?.user
        ? `${candidate.user.firstName} ${candidate.user.lastName}`.trim()
        : "";
      const candidateEmail = candidate?.user?.email;
      const jobTitle = application.job?.title || "Your Application";
      const companyName = employer?.organizationName || "Employer";

      if (candidateEmail) {
        sendApplicationStatusUpdateToJobSeeker(
          candidateEmail,
          candidateName,
          jobTitle,
          companyName,
          "Withdrawn"
        ).catch(() => {});
      }
    } catch {}

    return successResponse(res, 200, "Application withdrawn successfully", {
      application,
    });
  } catch (err) {
    console.error("Withdraw application error:", err);
    return errorResponse(res, 500, "Failed to withdraw application");
  }
};

// GET /applications/job/:jobId (employer)
exports.listApplicationsForJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    // Ensure requester is the owner of the job
    const employer = await Employer.findOne({ user: req.user._id });
    if (!employer) return errorResponse(res, 403, "Employer profile not found");

    const job = await Job.findOne({ _id: jobId, employer: employer._id });
    if (!job)
      return forbiddenResponse(
        res,
        "Not authorized to view applications for this job"
      );

    const applications = await Application.find({ job: jobId })
      .populate({ path: "job" })
      .populate({
        path: "jobSeeker",
        select: "title specializations experience resume coverLetter",
        populate: {
          path: "user",
          select: "firstName lastName email phone profileImage",
        },
      })
      .sort("-appliedAt");

    return successResponse(res, 200, "Applications fetched", { applications });
  } catch (err) {
    console.error("List applications for job error:", err);
    return errorResponse(res, 500, "Failed to fetch applications");
  }
};

exports.getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;

    const app = await Application.findById(id)
      .populate({
        path: "jobSeeker",
        select:
          "user summary professionalSummary skills workExperience education resume",
        populate: [
          {
            path: "user",
            select: "firstName lastName email phone profileImage",
          },
          { path: "resume", select: "url fileUrl filename originalName" },
        ],
      })
      .populate({ path: "job", select: "title organizationName" })
      .populate({ path: "employer", select: "organizationName" })
      .lean();

    if (!app) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    // Normalize resume for frontend (expecting { url, filename })
    const r = app?.jobSeeker?.resume;
    if (r && typeof r === "object") {
      app.jobSeeker.resume = {
        url: r.fileUrl || r.url || "",
        filename: r.originalName || r.filename || "Resume",
      };
    }

    return res.status(200).json({ success: true, data: { application: app } });
  } catch (err) {
    console.error("getApplicationById error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch application" });
  }
};
