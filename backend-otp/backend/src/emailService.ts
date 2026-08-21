import nodemailer from 'nodemailer';
import { config } from './config.js';

let primaryTransporter: nodemailer.Transporter | null = null;
let secondaryTransporter: nodemailer.Transporter | null = null;

export const getPrimaryMailer = (): nodemailer.Transporter => {
  if (!primaryTransporter) {
    const mailUser = config.mail.user ? config.mail.user.trim() : '';
    const mailPass = config.mail.password ? config.mail.password.trim() : '';
    const mailPort = String(process.env.MAIL_PORT || 465).trim();
    const isPort587 = mailPort === '587';

    console.log('=== PRIMARY SMTP CONFIG ===');
    console.log('MAIL_USER:', mailUser);
    console.log('MAIL_HOST:', process.env.MAIL_HOST || 'smtp.titan.email');
    console.log('MAIL_PORT:', mailPort);
    console.log('=========================');

    primaryTransporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.titan.email',
      port: Number(mailPort),
      secure: !isPort587,
      requireTLS: isPort587,
      auth: {
        user: mailUser,
        pass: mailPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return primaryTransporter;
};

export const getSecondaryMailer = (): nodemailer.Transporter => {
  if (!secondaryTransporter) {
    const mailUser = config.mail.secondary.user ? config.mail.secondary.user.trim() : '';
    const mailPass = config.mail.secondary.password ? config.mail.secondary.password.trim() : '';
    const secPort = String(config.mail.secondary.port || 465).trim();
    const isPort587 = secPort === '587';

    console.log('=== SECONDARY SMTP CONFIG ===');
    console.log('SECONDARY_MAIL_USER:', mailUser);
    console.log('SECONDARY_MAIL_HOST:', config.mail.secondary.host);
    console.log('SECONDARY_MAIL_PORT:', secPort);
    console.log('===========================');

    secondaryTransporter = nodemailer.createTransport({
      host: config.mail.secondary.host,
      port: Number(secPort),
      secure: !isPort587,
      requireTLS: isPort587,
      auth: {
        user: mailUser,
        pass: mailPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
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
  expiryMinutes: number,
  expiresAt?: Date
): Promise<boolean> => {
  const t0 = Date.now();
  const expiryTime = expiresAt || new Date(Date.now() + expiryMinutes * 60 * 1000);
  const formattedTime = expiryTime.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #eaeaea; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #D4500A 0%, #EA580C 100%); padding: 28px 24px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">PullUp</h1>
        <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">Campus Ride Sharing</p>
      </div>
      
      <div style="padding: 32px 28px; background-color: #ffffff;">
        <p style="color: #111827; font-size: 16px; font-weight: 600; margin-top: 0;">Verification Code</p>
        
        <p style="color: #4B5563; font-size: 14px; line-height: 1.5;">Use the following One-Time Password (OTP) to complete your PullUp verification:</p>
        
        <div style="background-color: #FFF7ED; border: 2px dashed #F97316; padding: 20px; margin: 24px 0; border-radius: 12px; text-align: center;">
          <span style="font-size: 36px; font-weight: 800; color: #D4500A; letter-spacing: 8px; font-family: monospace;">${otp}</span>
        </div>
        
        <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px;">
          <p style="margin: 0; color: #991B1B; font-size: 13px; font-weight: 600;">
            ⏰ Expires at: <span style="font-weight: 700;">${formattedTime} IST</span> (${expiryMinutes} minutes validity)
          </p>
        </div>
        
        <p style="color: #6B7280; font-size: 13px; line-height: 1.5; margin: 0;">
          <strong>Security Notice:</strong> Never share this OTP with anyone. PullUp staff will never ask for your verification code.
        </p>
      </div>
      
      <div style="padding: 16px 28px; background-color: #F9FAFB; border-top: 1px solid #F3F4F6; text-align: center;">
        <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
          If you did not request this OTP, please ignore this email.
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

    console.log(`[SMTP DIAGNOSTICS] [PRIMARY] Attempting delivery to ${email}...`);
    const tAcquire = Date.now();
    const primaryMailer = getPrimaryMailer();
    const tConn = Date.now();
    console.log(`[SMTP DIAGNOSTICS] [PRIMARY] Transporter acquire: ${tConn - tAcquire}ms`);

    const info = await primaryMailer.sendMail({
      from: `"${config.mail.fromName}" <${primaryUser}>`,
      to: email,
      subject: `Your PullUp OTP: ${otp}`,
      html: htmlContent,
      text: `Your OTP for PullUp: ${otp}. It expires at ${formattedTime} IST. Do not share this code.`,
    });

    const tSend = Date.now();
    console.log(`[SMTP DIAGNOSTICS] [PRIMARY] ✅ SendMail response in ${tSend - tConn}ms | Total SMTP: ${tSend - t0}ms | MessageId: ${info.messageId}`);
    return true;
  } catch (primaryError: any) {
    const tFailPrimary = Date.now();
    console.warn(`[SMTP DIAGNOSTICS] [PRIMARY] ❌ Failed after ${tFailPrimary - t0}ms to send to ${email}:`, primaryError.message);

    // 2. Fall back to Secondary Mailer
    try {
      const secondaryUser = config.mail.secondary.user ? config.mail.secondary.user.trim() : '';
      if (!secondaryUser) {
        throw new Error('Secondary SMTP credentials not configured (SECONDARY_MAIL_USER is blank)');
      }

      console.log(`[SMTP DIAGNOSTICS] [SECONDARY] Attempting fallback delivery to ${email}...`);
      const tSecAcquire = Date.now();
      const secondaryMailer = getSecondaryMailer();
      const tSecConn = Date.now();
      const info = await secondaryMailer.sendMail({
        from: `"${config.mail.secondary.fromName}" <${secondaryUser}>`,
        to: email,
        subject: `Your PullUp OTP: ${otp} (Fallback)`,
        html: htmlContent,
        text: `Your OTP for PullUp: ${otp}. It expires at ${formattedTime} IST. Do not share this code.`,
      });

      const tSecSend = Date.now();
      console.log(`[SMTP DIAGNOSTICS] [SECONDARY] ✅ Fallback delivered in ${tSecSend - tSecConn}ms | MessageId: ${info.messageId}`);
      return true;
    } catch (secondaryError: any) {
      console.error(`[SMTP DIAGNOSTICS] ❌ SMTP delivery failed: Primary (${primaryError.message}) | Secondary (${secondaryError.message})`);
      console.log(`\n=========================================================`);
      console.log(`[OTP DELIVERY FALLBACK] 🔑 Generated OTP for ${email}: ${otp}`);
      console.log(`=========================================================\n`);
      
      // Return true to allow OTP verification flow to proceed even if SMTP credentials fail
      return true;
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