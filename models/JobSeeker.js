const mongoose = require('mongoose');

const PROFESSIONAL_CATEGORIES = [
  'Doctor',
  'Nurse',
  'Technician',
  'Pharmacy',
  'Support',
  'Admin',
  'Insurance',
  'Marketing',
  'Other',
];

/**
 * JobSeeker Schema - Extended user model for job seekers
 * Contains healthcare-specific job seeker information and preferences
 */
const jobSeekerSchema = new mongoose.Schema({
  // Reference to base User model
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },

  // Personal information editable from profile form
  personalInfo: {
    age: {
      type: Number,
      min: [18, 'Age must be at least 18'],
      max: [100, 'Age cannot exceed 100'],
    },
    maritalStatus: {
      type: String,
      enum: ['Married', 'Unmarried'],
    },
    alternateEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [255, 'Alternate email cannot exceed 255 characters'],
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid alternate email address'],
    },
    alternatePhone: {
      type: String,
      trim: true,
      maxlength: [20, 'Alternate phone cannot exceed 20 characters'],
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
    },
    dateOfBirth: {
      type: Date,
    },
    address: {
      line1: {
        type: String,
        trim: true,
        maxlength: [200, 'Address line cannot exceed 200 characters'],
      },
      line2: {
        type: String,
        trim: true,
        maxlength: [200, 'Address line cannot exceed 200 characters'],
      },
      country: {
        type: String,
        trim: true,
        maxlength: [50, 'Country name cannot exceed 50 characters'],
      },
      state: {
        type: String,
        trim: true,
        maxlength: [50, 'State name cannot exceed 50 characters'],
      },
      city: {
        type: String,
        trim: true,
        maxlength: [50, 'City name cannot exceed 50 characters'],
      },
      pincode: {
        type: String,
        trim: true,
        maxlength: [12, 'Pincode cannot exceed 12 characters'],
      },
    },
  },

  // New professional classification fields
  professionalInfo: {
    category: {
      type: String,
      enum: PROFESSIONAL_CATEGORIES,
      trim: true,
    },
    otherCategory: {
      type: String,
      trim: true,
      maxlength: [100, 'Other category cannot exceed 100 characters'],
    },
    specifications: [{
      type: String,
      trim: true,
      maxlength: [100, 'Specification cannot exceed 100 characters'],
    }],
    otherSpecification: {
      type: String,
      trim: true,
      maxlength: [100, 'Other specification cannot exceed 100 characters'],
    },
    doctorSpecialization: {
      type: String,
      trim: true,
      maxlength: [100, 'Doctor specialization cannot exceed 100 characters'],
    },
    doctorSubSpecialty: {
      type: String,
      trim: true,
      maxlength: [100, 'Doctor sub-specialty cannot exceed 100 characters'],
    },
    doctorSubSpecialties: [{
      type: String,
      trim: true,
      maxlength: [100, 'Doctor sub-specialty cannot exceed 100 characters'],
    }],
    otherDoctorSubSpecialty: {
      type: String,
      trim: true,
      maxlength: [100, 'Other doctor field cannot exceed 100 characters'],
    },
    councilNo: {
      type: String,
      trim: true,
      maxlength: [50, 'Council number cannot exceed 50 characters'],
    },
    location: {
      country: {
        type: String,
        trim: true,
        maxlength: [50, 'Country name cannot exceed 50 characters'],
      },
      state: {
        type: String,
        trim: true,
        maxlength: [50, 'State name cannot exceed 50 characters'],
      },
      city: {
        type: String,
        trim: true,
        maxlength: [50, 'City name cannot exceed 50 characters'],
      },
    },
  },

  // Government KYC fields
  documents: {
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [10, 'PAN number cannot exceed 10 characters'],
    },
    aadhaarNumber: {
      type: String,
      trim: true,
      maxlength: [12, 'Aadhaar number cannot exceed 12 characters'],
    },
    panCardImage: {
      url: String,
      filename: String,
      uploadedAt: Date,
      publicId: String,
      bytes: Number,
    },
    aadhaarCardImage: {
      url: String,
      filename: String,
      uploadedAt: Date,
      publicId: String,
      bytes: Number,
    },
    aadhaarCardFrontImage: {
      url: String,
      filename: String,
      uploadedAt: Date,
      publicId: String,
      bytes: Number,
    },
    aadhaarCardBackImage: {
      url: String,
      filename: String,
      uploadedAt: Date,
      publicId: String,
      bytes: Number,
    },
  },
  
  // Professional Information
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters'],
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [1000, 'Bio cannot exceed 1000 characters'],
  },
  
  // Healthcare Specialization
  specializations: [{
    type: String,
    trim: true,
    maxlength: [100, 'Specialization cannot exceed 100 characters'],
  }],
  
  // Experience Information
  experience: {
    totalYears: {
      type: Number,
      min: [0, 'Experience cannot be negative'],
      max: [50, 'Experience cannot exceed 50 years'],
    },
    currentPosition: {
      type: String,
      trim: true,
      maxlength: [100, 'Current position cannot exceed 100 characters'],
    },
    currentCompany: {
      type: String,
      trim: true,
      maxlength: [100, 'Current company cannot exceed 100 characters'],
    },
    isCurrentlyEmployed: {
      type: Boolean,
      default: true,
    },
  },
  
  // Education
  education: [{
    degree: {
      type: String,
      required: true,
      trim: true,
      enum: [
        'MBBS',
        'MD',
        'MS',
        'DNB',
        'DM',
        'MCh',
        'BAMS',
        'BHMS',
        'BUMS',
        'Unani',
        'BDS',
        'MDS',
        'BPT',
        'MPT',
        'ANM',
        'GNM',
        'BSc Nursing',
        'Post Basic BSc Nursing',
        'MSc Nursing',
        'DMLT',
        'BMLT',
        'Diploma in OT Technician',
        'Diploma in Radiology Imaging',
        'Diploma in Dialysis Technician',
        'D.Pharm',
        'B.Pharm',
        'M.Pharm',
        'Pharm.D',
        'BBA',
        'MBA',
        'MHA',
        'PG Diploma',
        'BCom',
        'IRDA Certification',
        'BSc',
        'MSc',
        'PhD',
        'Diploma',
        'Certificate',
        'Other',
      ],
    },
    field: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Field cannot exceed 100 characters'],
    },
    institution: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Institution name cannot exceed 200 characters'],
    },
    yearOfCompletion: {
      type: Number,
      required: true,
      min: [1950, 'Year cannot be before 1950'],
      max: [new Date().getFullYear() + 5, 'Year cannot be more than 5 years in future'],
    },
    startYear: {
      type: Number,
      min: [1950, 'Start year cannot be before 1950'],
      max: [new Date().getFullYear() + 5, 'Start year cannot be more than 5 years in future'],
    },
    grade: {
      type: String,
      trim: true,
      maxlength: [20, 'Grade cannot exceed 20 characters'],
    },
  }],
  
  // Work Experience Details
  workExperience: [{
    position: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Position cannot exceed 100 characters'],
    },
    company: {
      type: String,
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters'],
      required: function() {
        return !this.organization;
      },
    },
    organization: {
      type: String,
      trim: true,
      maxlength: [100, 'Organization name cannot exceed 100 characters'],
      required: function() {
        return !this.company;
      },
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Location cannot exceed 100 characters'],
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      validate: {
        validator: function(value) {
          return !value || value >= this.startDate;
        },
        message: 'End date must be after start date',
      },
    },
    isCurrent: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    achievements: [{
      type: String,
      trim: true,
      maxlength: [200, 'Achievement cannot exceed 200 characters'],
    }],
  }],
  
  // Skills and Certifications
  skills: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, 'Skill name cannot exceed 50 characters'],
    },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      default: 'Intermediate',
    },
  }],
  
  certifications: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Certification name cannot exceed 100 characters'],
    },
    issuingOrganization: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Organization name cannot exceed 100 characters'],
    },
    issueDate: {
      type: Date,
      required: true,
    },
    expiryDate: {
      type: Date,
      validate: {
        validator: function(value) {
          return !value || value >= this.issueDate;
        },
        message: 'Expiry date must be after issue date',
      },
    },
    credentialId: {
      type: String,
      trim: true,
      maxlength: [50, 'Credential ID cannot exceed 50 characters'],
    },
    credentialUrl: {
      type: String,
      trim: true,
    },
  }],
  
  // Job Preferences
  jobPreferences: {
    preferredLocations: [{
      city: {
        type: String,
        required: true,
        trim: true,
        maxlength: [50, 'City name cannot exceed 50 characters'],
      },
      state: {
        type: String,
        required: true,
        trim: true,
        maxlength: [50, 'State name cannot exceed 50 characters'],
      },
      country: {
        type: String,
        required: true,
        trim: true,
        maxlength: [50, 'Country name cannot exceed 50 characters'],
        default: 'India',
      },
    }],
    preferredJobTypes: [{
      type: String,
      enum: ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Volunteer'],
    }],
    preferredShifts: [{
      type: String,
      enum: ['Day', 'Night', 'Rotating', 'Flexible'],
    }],
    expectedSalary: {
      min: {
        type: Number,
        min: [0, 'Minimum salary cannot be negative'],
      },
      max: {
        type: Number,
        min: [0, 'Maximum salary cannot be negative'],
      },
      currency: {
        type: String,
        default: 'INR',
        enum: ['INR', 'USD', 'EUR', 'GBP'],
      },
      period: {
        type: String,
        default: 'Annual',
        enum: ['Hourly', 'Daily', 'Monthly', 'Annual'],
      },
    },
    expectedBenefits: [{
      type: String,
      trim: true,
      maxlength: [100, 'Expected benefit cannot exceed 100 characters'],
    }],
    availability: {
      type: String,
      enum: ['Immediately', '2 weeks', '1 month', '2 months', '3 months', 'Negotiable'],
      default: 'Negotiable',
    },
    willingToRelocate: {
      type: Boolean,
      default: false,
    },
    remoteWorkPreference: {
      type: String,
      enum: ['On-site only', 'Remote only', 'Hybrid', 'No preference'],
      default: 'No preference',
    },
  },
  
  // Documents
  resume: {
    url: String,
    filename: String,
    uploadedAt: Date,
    publicId: String,
    driveFileId: String,
    storageType: String,
    bytes: Number,
  },
  coverLetter: {
    url: String,
    filename: String,
    uploadedAt: Date,
    publicId: String,
    driveFileId: String,
    storageType: String,
    bytes: Number,
  },
  portfolio: [{
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Portfolio title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Portfolio description cannot exceed 500 characters'],
    },
    url: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['Document', 'Image', 'Video', 'Link'],
      default: 'Link',
    },
  }],
  
  // Projects (for resume builder)
  projects: [{
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Project title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Project description cannot exceed 500 characters'],
    },
    technologies: [{
      type: String,
      trim: true,
      maxlength: [50, 'Technology name cannot exceed 50 characters'],
    }],
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    url: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      trim: true,
      maxlength: [100, 'Role cannot exceed 100 characters'],
    },
  }],
  
  // Languages (for resume builder)
  languages: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, 'Language name cannot exceed 50 characters'],
    },
    proficiency: {
      type: String,
      enum: ['Basic', 'Intermediate', 'Fluent', 'Native'],
      default: 'Intermediate',
    },
  }],
  
  // Built Resumes
  builtResumes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
  }],
  
  // Profile Completion
  profileCompletion: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  
  // Privacy Settings
  privacySettings: {
    showContactInfo: {
      type: Boolean,
      default: true,
    },
    showCurrentSalary: {
      type: Boolean,
      default: false,
    },
    showProfileToEmployers: {
      type: Boolean,
      default: true,
    },
    allowDirectMessages: {
      type: Boolean,
      default: true,
    },
  },
  
  // Statistics
  stats: {
    profileViews: {
      type: Number,
      default: 0,
    },
    applicationsSubmitted: {
      type: Number,
      default: 0,
    },
    interviewsScheduled: {
      type: Number,
      default: 0,
    },
    jobsOffered: {
      type: Number,
      default: 0,
    },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for full name (from User model)
jobSeekerSchema.virtual('fullName').get(function() {
  return this.user ? `${this.user.firstName} ${this.user.lastName}` : '';
});

// Index for better query performance
jobSeekerSchema.index({ user: 1 });
jobSeekerSchema.index({ 'specializations': 1 });
jobSeekerSchema.index({ 'experience.totalYears': 1 });
jobSeekerSchema.index({ 'jobPreferences.preferredLocations.city': 1 });
jobSeekerSchema.index({ 'jobPreferences.preferredLocations.state': 1 });
jobSeekerSchema.index({ 'profileCompletion': 1 });

/**
 * Calculate profile completion percentage
 */
jobSeekerSchema.methods.calculateProfileCompletion = function() {
  let completion = 0;
  const totalFields = 10;
  
  if (this.title || this.professionalInfo?.category) completion += 10;
  if (this.bio) completion += 10;
  if (this.specializations && this.specializations.length > 0) completion += 10;
  if (this.experience.totalYears !== undefined) completion += 10;
  if (this.education && this.education.length > 0) completion += 10;
  if (this.workExperience && this.workExperience.length > 0) completion += 10;
  if (this.skills && this.skills.length > 0) completion += 10;
  if (this.jobPreferences.preferredLocations && this.jobPreferences.preferredLocations.length > 0) completion += 10;
  if (this.resume && this.resume.url) completion += 10;
  if (this.user && this.user.profileImage) completion += 10;
  
  this.profileCompletion = completion;
  return completion;
};

/**
 * Update profile completion before saving
 */
jobSeekerSchema.pre('save', function(next) {
  if (this.professionalInfo) {
    const subSpecs = this.professionalInfo.doctorSubSpecialties;
    if (Array.isArray(subSpecs) && subSpecs.length > 0) {
      this.professionalInfo.doctorSubSpecialty = subSpecs[0];
    } else if (this.professionalInfo.doctorSubSpecialty) {
      this.professionalInfo.doctorSubSpecialties = [this.professionalInfo.doctorSubSpecialty];
    }
  }

  if (Array.isArray(this.workExperience)) {
    this.workExperience = this.workExperience.map((item) => {
      if (!item) return item;
      if (item.organization && !item.company) {
        item.company = item.organization;
      }
      if (item.company && !item.organization) {
        item.organization = item.company;
      }
      return item;
    });
  }

  this.calculateProfileCompletion();
  next();
});

module.exports = mongoose.model('JobSeeker', jobSeekerSchema);
