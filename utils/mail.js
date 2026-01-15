const nodemailer = require("nodemailer");

// Get email configuration from environment variables or use defaults
const SMTP_USER = process.env.SMTP_USER || "mybookserp@softomation.com";
const SMTP_PASS = process.env.SMTP_PASS || "Softo#2025";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 465;
const SMTP_SECURE = process.env.SMTP_SECURE === "false" ? false : true; // Default to true for port 465
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "Books Billing System";

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

// Send email with 6-digit code for password reset
const sendPasswordResetCode = async (email, code) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
      to: email,
      subject: "Password Reset Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p style="color: #666; font-size: 16px;">
            You have requested to reset your password. Please use the following 6-digit code to proceed:
          </p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <h1 style="color: #1890ff; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
          </div>
          <p style="color: #666; font-size: 14px;">
            This code will expire in 10 minutes. If you did not request this password reset, please ignore this email.
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      `,
      text: `Your password reset code is: ${code}. This code will expire in 10 minutes.`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Password reset email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return { success: false, error: error.message };
  }
};

// Send general email (for future use)
const sendEmail = async (to, subject, html, text) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPasswordResetCode,
  sendEmail,
  createTransporter,
};
