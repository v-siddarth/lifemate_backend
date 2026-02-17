const nodemailer = require('nodemailer');

/**
 * Email Service
 * Handles sending various types of emails (verification, password reset, notifications, etc.)
 */

// Create transporter
const createTransporter = () => {
  const emailHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const emailPort = Number(process.env.EMAIL_PORT || 587);
  const emailUser = (process.env.EMAIL_USER || '').trim();
  const emailPass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

  if (!emailUser || !emailPass) {
    throw new Error('EMAIL_USER and EMAIL_PASS must be configured for sending emails.');
  }

  return nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465, // true for 465, false for 587
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
};

/**
 * Notify jobseeker: application submitted
 */
const sendApplicationSubmittedToJobSeeker = async (candidateEmail, candidateName, jobTitle, companyName) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"LifeMate" <${process.env.EMAIL_FROM || 'noreply@lifemate.com'}>`,
      to: candidateEmail,
      subject: `Application Submitted: ${jobTitle} at ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LifeMate</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Healthcare Job Platform</p>
          </div>

          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Your application is submitted!</h2>
            <p style="color: #666; line-height: 1.6;">Hi ${candidateName},</p>
            <p style="color: #666; line-height: 1.6;">We've sent your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/jobseeker/applications" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                View your applications
              </a>
            </div>
            <p style="color: #666; line-height: 1.6; font-size: 14px;">We'll notify you when the employer reviews or updates your status.</p>
          </div>

          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 14px;">© 2024 LifeMate. All rights reserved.</p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Application submitted email sent to jobseeker:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending application submitted email:', error);
    throw error;
  }
};

/**
 * Notify jobseeker: application status update (Interview/Offered)
 */
const sendApplicationStatusUpdateToJobSeeker = async (candidateEmail, candidateName, jobTitle, companyName, status) => {
  try {
    const transporter = createTransporter();

    const statusColor = status === 'Offered' ? '#28a745' : '#1e90ff';
    const subject = status === 'Offered'
      ? `Congratulations! Offer for ${jobTitle}`
      : `You're moved to Interview for ${jobTitle}`;

    const mailOptions = {
      from: `"LifeMate" <${process.env.EMAIL_FROM || 'noreply@lifemate.com'}>`,
      to: candidateEmail,
      subject: `${subject} - ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LifeMate</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Healthcare Job Platform</p>
          </div>

          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: ${statusColor}; margin-bottom: 20px;">${subject}</h2>
            <p style="color: #666; line-height: 1.6;">Hi ${candidateName},</p>
            <p style="color: #666; line-height: 1.6;">Your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been updated to <strong>${status}</strong>.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/jobseeker/applications" style="background: ${statusColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                View details
              </a>
            </div>
          </div>

          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 14px;">© 2024 LifeMate. All rights reserved.</p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Application status update email sent to jobseeker:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending application status update email:', error);
    throw error;
  }
};

/**
 * Send email verification email
 * @param {string} email - Recipient email
 * @param {string} token - Verification token
 * @param {string} firstName - User's first name
 */
const sendVerificationEmail = async (email, token, firstName) => {
  try {
    const transporter = createTransporter();
    
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;
    
    const mailOptions = {
      from: `"LifeMate" <${process.env.EMAIL_FROM || 'noreply@lifemate.com'}>`,
      to: email,
      subject: 'Verify Your Email Address - LifeMate',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LifeMate</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Healthcare Job Platform</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Welcome to LifeMate, ${firstName}!</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Thank you for registering with LifeMate. To complete your registration and start exploring healthcare job opportunities, please verify your email address by clicking the button below.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Verify Email Address
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              If the button doesn't work, you can copy and paste this link into your browser:
            </p>
            
            <p style="color: #667eea; word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px;">
              ${verificationUrl}
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-top: 30px; font-size: 14px;">
              This verification link will expire in 24 hours. If you didn't create an account with LifeMate, please ignore this email.
            </p>
          </div>
          
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 14px;">
              © 2024 LifeMate. All rights reserved.
            </p>
            <p style="color: #999; margin: 5px 0 0 0; font-size: 12px;">
              This is an automated email. Please do not reply to this message.
            </p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} token - Reset token
 * @param {string} firstName - User's first name
 */
const sendPasswordResetEmail = async (email, token, firstName) => {
  try {
    const transporter = createTransporter();
    
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    
    const mailOptions = {
      from: `"LifeMate" <${process.env.EMAIL_FROM || 'noreply@lifemate.com'}>`,
      to: email,
      subject: 'Reset Your Password - LifeMate',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LifeMate</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Healthcare Job Platform</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Hello ${firstName},
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              We received a request to reset your password for your LifeMate account. If you made this request, click the button below to reset your password.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              If the button doesn't work, you can copy and paste this link into your browser:
            </p>
            
            <p style="color: #667eea; word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px;">
              ${resetUrl}
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-top: 30px; font-size: 14px;">
              This password reset link will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
              For security reasons, please do not share this link with anyone.
            </p>
          </div>
          
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 14px;">
              © 2024 LifeMate. All rights reserved.
            </p>
            <p style="color: #999; margin: 5px 0 0 0; font-size: 12px;">
              This is an automated email. Please do not reply to this message.
            </p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

/**
 * Send OTP email
 * @param {string} email - Recipient email
 * @param {string} firstName - User's first name
 * @param {string} otp - One-time password
 * @param {'register'|'forgot_password'} purpose - OTP purpose
 */
const sendOtpEmail = async (email, firstName, otp, purpose) => {
  try {
    const transporter = createTransporter();
    const title = purpose === 'register' ? 'Registration OTP' : 'Password Reset OTP';
    const description =
      purpose === 'register'
        ? 'Use this OTP to complete your account registration.'
        : 'Use this OTP to reset your account password.';

    const mailOptions = {
      from: `"LifeMate" <${process.env.EMAIL_FROM || 'noreply@lifemate.com'}>`,
      to: email,
      subject: `${title} - LifeMate`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LifeMate</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Healthcare Job Platform</p>
          </div>

          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">${title}</h2>

            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Hello ${firstName || 'User'},
            </p>

            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              ${description}
            </p>

            <div style="margin: 24px 0; text-align: center;">
              <span style="display: inline-block; background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; letter-spacing: 8px; font-size: 28px; font-weight: 700; color: #111827; padding: 14px 24px;">
                ${otp}
              </span>
            </div>

            <p style="color: #666; line-height: 1.6; margin-top: 24px; font-size: 14px;">
              This OTP will expire in 10 minutes. For security reasons, do not share this code with anyone.
            </p>
          </div>

          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 14px;">© 2024 LifeMate. All rights reserved.</p>
            <p style="color: #999; margin: 5px 0 0 0; font-size: 12px;">This is an automated email. Please do not reply.</p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error;
  }
};

/**
 * Send job application notification email
 * @param {string} employerEmail - Employer's email
 * @param {string} employerName - Employer's name
 * @param {string} jobTitle - Job title
 * @param {string} candidateName - Candidate's name
 * @param {string} candidateEmail - Candidate's email
 */
const sendApplicationNotificationEmail = async (employerEmail, employerName, jobTitle, candidateName, candidateEmail) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"LifeMate" <${process.env.EMAIL_FROM || 'noreply@lifemate.com'}>`,
      to: employerEmail,
      subject: `New Application for ${jobTitle} - LifeMate`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LifeMate</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Healthcare Job Platform</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">New Job Application Received</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Hello ${employerName},
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              You have received a new application for the position: <strong>${jobTitle}</strong>
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #667eea; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Application Details:</h3>
              <p style="margin: 5px 0;"><strong>Candidate Name:</strong> ${candidateName}</p>
              <p style="margin: 5px 0;"><strong>Candidate Email:</strong> ${candidateEmail}</p>
              <p style="margin: 5px 0;"><strong>Job Title:</strong> ${jobTitle}</p>
              <p style="margin: 5px 0;"><strong>Applied On:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/employer/applications" 
                 style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                View Application
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-top: 30px; font-size: 14px;">
              Log in to your LifeMate employer dashboard to review the full application and candidate profile.
            </p>
          </div>
          
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 14px;">
              © 2024 LifeMate. All rights reserved.
            </p>
            <p style="color: #999; margin: 5px 0 0 0; font-size: 12px;">
              This is an automated email. Please do not reply to this message.
            </p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Application notification email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending application notification email:', error);
    throw error;
  }
};

/**
 * Send interview invitation email
 * @param {string} candidateEmail - Candidate's email
 * @param {string} candidateName - Candidate's name
 * @param {string} jobTitle - Job title
 * @param {string} companyName - Company name
 * @param {Object} interviewDetails - Interview details
 */
const sendInterviewInvitationEmail = async (candidateEmail, candidateName, jobTitle, companyName, interviewDetails) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"LifeMate" <${process.env.EMAIL_FROM || 'noreply@lifemate.com'}>`,
      to: candidateEmail,
      subject: `Interview Invitation for ${jobTitle} - ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LifeMate</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Healthcare Job Platform</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Interview Invitation</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Congratulations ${candidateName}!
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              We are pleased to invite you for an interview for the position of <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #28a745; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Interview Details:</h3>
              <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(interviewDetails.date).toLocaleDateString()}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${interviewDetails.time}</p>
              <p style="margin: 5px 0;"><strong>Type:</strong> ${interviewDetails.type}</p>
              ${interviewDetails.location ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${interviewDetails.location}</p>` : ''}
              ${interviewDetails.meetingLink ? `<p style="margin: 5px 0;"><strong>Meeting Link:</strong> <a href="${interviewDetails.meetingLink}">${interviewDetails.meetingLink}</a></p>` : ''}
              ${interviewDetails.notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${interviewDetails.notes}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/jobseeker/applications" 
                 style="background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                View Application
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-top: 30px; font-size: 14px;">
              Please confirm your attendance by replying to this email or through your LifeMate dashboard.
            </p>
          </div>
          
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 14px;">
              © 2024 LifeMate. All rights reserved.
            </p>
            <p style="color: #999; margin: 5px 0 0 0; font-size: 12px;">
              This is an automated email. Please do not reply to this message.
            </p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Interview invitation email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending interview invitation email:', error);
    throw error;
  }
};

/**
 * Send welcome email
 * @param {string} email - Recipient email
 * @param {string} firstName - User's first name
 * @param {string} role - User's role
 */
const sendWelcomeEmail = async (email, firstName, role) => {
  try {
    const transporter = createTransporter();
    
    const dashboardUrl = role === 'jobseeker' 
      ? `${process.env.FRONTEND_URL}/jobseeker/dashboard`
      : `${process.env.FRONTEND_URL}/employer/dashboard`;
    
    const mailOptions = {
      from: `"LifeMate" <${process.env.EMAIL_FROM || 'noreply@lifemate.com'}>`,
      to: email,
      subject: 'Welcome to LifeMate - Your Healthcare Career Journey Starts Here!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to LifeMate!</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Healthcare Job Platform</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello ${firstName}!</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Welcome to LifeMate, the premier platform connecting healthcare professionals with amazing career opportunities!
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Your account has been successfully created and verified. You're now ready to ${role === 'jobseeker' ? 'explore healthcare job opportunities and advance your career' : 'find the best healthcare talent for your organization'}.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; border-left: 4px solid #667eea; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">What's Next?</h3>
              ${role === 'jobseeker' ? `
                <ul style="color: #666; line-height: 1.6;">
                  <li>Complete your profile to increase your visibility to employers</li>
                  <li>Upload your resume and portfolio</li>
                  <li>Set your job preferences and notifications</li>
                  <li>Start browsing and applying to healthcare jobs</li>
                </ul>
              ` : `
                <ul style="color: #666; line-height: 1.6;">
                  <li>Complete your organization profile</li>
                  <li>Upload your company logo and documents</li>
                  <li>Get your organization verified</li>
                  <li>Start posting healthcare job opportunities</li>
                </ul>
              `}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}" 
                 style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Go to Dashboard
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-top: 30px; font-size: 14px;">
              If you have any questions or need assistance, feel free to contact our support team. We're here to help you succeed!
            </p>
          </div>
          
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 14px;">
              © 2024 LifeMate. All rights reserved.
            </p>
            <p style="color: #999; margin: 5px 0 0 0; font-size: 12px;">
              This is an automated email. Please do not reply to this message.
            </p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendApplicationNotificationEmail,
  sendInterviewInvitationEmail,
  sendWelcomeEmail,
  sendOtpEmail,
  // Added exports below
  sendApplicationSubmittedToJobSeeker,
  sendApplicationStatusUpdateToJobSeeker,
};
