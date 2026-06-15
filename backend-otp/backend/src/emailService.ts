import nodemailer from 'nodemailer';
import { config } from './config.js';

let primaryTransporter: nodemailer.Transporter | null = null;
let secondaryTransporter: nodemailer.Transporter | null = null;

export const getPrimaryMailer = (): nodemailer.Transporter => {
  if (!primaryTransporter) {
    const mailUser = config.mail.user ? config.mail.user.trim() : '';
    const mailPass = config.mail.password ? config.mail.password.trim() : '';

    console.log('=== PRIMARY SMTP CONFIG ===');
    console.log('MAIL_USER:', mailUser);
    console.log('MAIL_HOST:', process.env.MAIL_HOST || 'smtp.titan.email');
    console.log('MAIL_PORT:', process.env.MAIL_PORT || '465');
    console.log('=========================');

    primaryTransporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.titan.email',
      port: Number(process.env.MAIL_PORT || 465),
      secure: process.env.MAIL_PORT === '587' ? false : true,
      auth: {
        user: mailUser,
        pass: mailPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 5000, // 5 seconds connect timeout
      greetingTimeout: 5000,   // 5 seconds greeting timeout
      socketTimeout: 10000,    // 10 seconds idle socket timeout
    });
  }
  return primaryTransporter;
};

export const getSecondaryMailer = (): nodemailer.Transporter => {
  if (!secondaryTransporter) {
    const mailUser = config.mail.secondary.user ? config.mail.secondary.user.trim() : '';
    const mailPass = config.mail.secondary.password ? config.mail.secondary.password.trim() : '';

    console.log('=== SECONDARY SMTP CONFIG ===');
    console.log('SECONDARY_MAIL_USER:', mailUser);
    console.log('SECONDARY_MAIL_HOST:', config.mail.secondary.host);
    console.log('SECONDARY_MAIL_PORT:', config.mail.secondary.port);
    console.log('===========================');

    secondaryTransporter = nodemailer.createTransport({
      host: config.mail.secondary.host,
      port: config.mail.secondary.port,
      secure: config.mail.secondary.port === 587 ? false : true,
      auth: {
        user: mailUser,
        pass: mailPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 5000, // 5 seconds connect timeout
      greetingTimeout: 5000,   // 5 seconds greeting timeout
      socketTimeout: 10000,    // 10 seconds idle socket timeout
    });
  }
  return secondaryTransporter;
};

// Deprecated alias for compatibility
export const initializeMailer = (): nodemailer.Transporter => {
  return getPrimaryMailer();
};

// Deprecated alias for compatibility
export const getMailer = (): nodemailer.Transporter => {
  return getPrimaryMailer();
};

export const sendOTPEmail = async (
  email: string,
  otp: string,
  expiryMinutes: number
): Promise<boolean> => {
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + expiryMinutes);
  const formattedTime = expiryTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0; color: white;">
        <h1 style="margin: 0; font-size: 24px;">PullUp - OTP Verification</h1>
      </div>
      
      <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px;">
        <p style="color: #333; font-size: 16px; margin-top: 0;">Hi there,</p>
        
        <p style="color: #666; font-size: 14px;">Your One-Time Password (OTP) for PullUp email verification is:</p>
        
        <div style="background-color: white; border: 2px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px;">${otp}</p>
        </div>
        
        <p style="color: #666; font-size: 13px; background-color: #ffe6e6; padding: 12px; border-radius: 4px; border-left: 4px solid #ff6b6b;">
          <strong>⏰ Expires at:</strong> ${formattedTime} (${expiryMinutes} minutes from now)
        </p>
        
        <p style="color: #666; font-size: 13px; margin-top: 20px;">
          <strong>🔒 Security Notice:</strong> Never share this OTP with anyone. PullUp support will never ask for your OTP.
        </p>
        
        <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">
          If you didn't request this OTP, please ignore this email and your account remains secure.
        </p>
      </div>
    </div>
  `;

  // 1. Try sending via Primary Mailer
  try {
    const primaryUser = config.mail.user ? config.mail.user.trim() : '';
    if (!primaryUser) {
      throw new Error('Primary SMTP credentials not configured (MAIL_USER is blank)');
    }

    console.log(`[EMAIL-PRIMARY] Attempting delivery to ${email} via primary SMTP...`);
    const primaryMailer = getPrimaryMailer();
    const info = await primaryMailer.sendMail({
      from: `"${config.mail.fromName}" <${primaryUser}>`,
      to: email,
      subject: `Your PullUp OTP: ${otp}`,
      html: htmlContent,
      text: `Your OTP for PullUp: ${otp}. It expires at ${formattedTime}. Do not share this code.`,
    });

    console.log(`[EMAIL-PRIMARY] ✅ Delivered successfully to ${email}:`, info.messageId);
    return true;
  } catch (primaryError: any) {
    console.warn(`[EMAIL-PRIMARY] ❌ Failed to send to ${email}:`, primaryError.message);

    // 2. Fall back to Secondary Mailer
    try {
      const secondaryUser = config.mail.secondary.user ? config.mail.secondary.user.trim() : '';
      if (!secondaryUser) {
        throw new Error('Secondary SMTP credentials not configured (SECONDARY_MAIL_USER is blank)');
      }

      console.log(`[EMAIL-SECONDARY] Attempting fallback delivery to ${email} via secondary SMTP...`);
      const secondaryMailer = getSecondaryMailer();
      const info = await secondaryMailer.sendMail({
        from: `"${config.mail.secondary.fromName}" <${secondaryUser}>`,
        to: email,
        subject: `Your PullUp OTP: ${otp} (Fallback)`,
        html: htmlContent,
        text: `Your OTP for PullUp: ${otp}. It expires at ${formattedTime}. Do not share this code.`,
      });

      console.log(`[EMAIL-SECONDARY] ✅ Delivered successfully to ${email} using fallback SMTP:`, info.messageId);
      return true;
    } catch (secondaryError: any) {
      console.error(`[EMAIL-SECONDARY] ❌ Secondary fallback failed:`, secondaryError.message);
      throw new Error(`Email delivery failed on both primary and secondary SMTP providers. Primary: ${primaryError.message} | Secondary: ${secondaryError.message}`);
    }
  }
};

export const verifyMailerConfig = async (): Promise<boolean> => {
  let primarySuccess = false;
  let secondarySuccess = false;

  console.log('[EMAIL] Verifying SMTP configurations...');

  try {
    const primaryUser = config.mail.user ? config.mail.user.trim() : '';
    if (primaryUser) {
      const primaryMailer = getPrimaryMailer();
      await primaryMailer.verify();
      console.log('[EMAIL] ✅ Primary SMTP connection verified');
      primarySuccess = true;
    } else {
      console.log('[EMAIL] ℹ️ Primary SMTP not configured');
    }
  } catch (error: any) {
    console.error('[EMAIL] ❌ Primary SMTP verification failed:', error.message);
  }

  try {
    const secondaryUser = config.mail.secondary.user ? config.mail.secondary.user.trim() : '';
    if (secondaryUser) {
      const secondaryMailer = getSecondaryMailer();
      await secondaryMailer.verify();
      console.log('[EMAIL] ✅ Secondary SMTP connection verified');
      secondarySuccess = true;
    } else {
      console.log('[EMAIL] ℹ️ Secondary SMTP not configured');
    }
  } catch (error: any) {
    console.error('[EMAIL] ❌ Secondary SMTP verification failed:', error.message);
  }

  return primarySuccess || secondarySuccess;
};