/* —————————————————————————————————————
 * Email Service
 * Sends transactional emails (verification, password reset) via SMTP.
 *
 * Configuration (via environment variables):
 *   SMTP_HOST      — SMTP server hostname (e.g., smtp.gmail.com)
 *   SMTP_PORT      — SMTP port (default: 587)
 *   SMTP_USER      — SMTP username / email address
 *   SMTP_PASS      — SMTP password / app password
 *   EMAIL_FROM     — "From" address (defaults to SMTP_USER)
 *   FRONTEND_URL   — Base URL for links in emails
 *
 * When SMTP is not configured (dev mode), emails are logged to the
 * console instead of sent. This avoids blocking development.
 * ————————————————————————————————————— */

const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

// ── Resolve SMTP config from env ──
const isSmtpConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

// ── Create a reusable transporter (lazy singleton) ──
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  if (isSmtpConfigured()) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    logger.info('Email service: SMTP transport configured');
  } else {
    logger.warn(
      'Email service: SMTP not configured — emails will be logged to console. ' +
      'Set SMTP_HOST, SMTP_USER, and SMTP_PASS to enable sending.'
    );
  }

  return transporter;
};

// ── Resolve the frontend base URL ──
const getFrontendUrl = () =>
  (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

// ── Send an email (or log it in dev mode) ──
const sendEmail = async ({ to, subject, html, text }) => {
  const transport = getTransporter();

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@mycoinwise.app',
    to,
    subject,
    html,
    text: text || subject,
  };

  if (!transport) {
    // Dev mode: log the email contents instead of sending
    logger.info('📧 [DEV EMAIL]', {
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
    });
    return { messageId: 'dev-mode', accepted: [to] };
  }

  const info = await transport.sendMail(mailOptions);
  logger.info('Email sent', { to, subject, messageId: info.messageId });
  return info;
};

/* —————————————————————————————————————
 * Email Templates
 * ————————————————————————————————————— */

// ── Password Reset Email ──
const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${getFrontendUrl()}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a2e;">Reset Your Password</h2>
      <p>You requested a password reset for your MyCoinwise account.</p>
      <p>Click the link below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      <p style="margin: 30px 0;">
        <a href="${resetUrl}" style="background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        If you did not request this, you can safely ignore this email.
        Your password will remain unchanged.
      </p>
      <p style="color: #999; font-size: 12px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${resetUrl}" style="color: #059669;">${resetUrl}</a>
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'MyCoinwise — Reset Your Password',
    html,
    text: `Reset your password: ${resetUrl} (expires in 1 hour)`,
  });
};

// ── Email Verification Email ──
const sendVerificationEmail = async (email, verifyToken) => {
  const verifyUrl = `${getFrontendUrl()}/verify-email?token=${verifyToken}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a2e;">Verify Your Email</h2>
      <p>Welcome to MyCoinwise! Please verify your email address to secure your account.</p>
      <p>Click the link below to verify. This link expires in <strong>24 hours</strong>.</p>
      <p style="margin: 30px 0;">
        <a href="${verifyUrl}" style="background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
          Verify Email
        </a>
      </p>
      <p style="color: #999; font-size: 12px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${verifyUrl}" style="color: #059669;">${verifyUrl}</a>
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'MyCoinwise — Verify Your Email Address',
    html,
    text: `Verify your email: ${verifyUrl} (expires in 24 hours)`,
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  isSmtpConfigured,
};
