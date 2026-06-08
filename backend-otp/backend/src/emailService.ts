import nodemailer from 'nodemailer';
import { config } from './config.js';

let transporter: nodemailer.Transporter | null = null;

export const initializeMailer = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: config.mail.service,
      auth: {
        user: config.mail.user,
        pass: config.mail.password,
      },
    });

    console.log('[EMAIL] Service initialized');
  }
  return transporter;
};

export const getMailer = (): nodemailer.Transporter => {
  if (!transporter) {
    return initializeMailer();
  }
  return transporter;
};

export const sendOTPEmail = async (
  email: string,
  otp: string,
  expiryMinutes: number
): Promise<boolean> => {
  try {
    const mailer = getMailer();

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

    const info = await mailer.sendMail({
      from: `"${config.mail.fromName}" <${config.mail.user}>`,
      to: email,
      subject: `Your PullUp OTP: ${otp}`,
      html: htmlContent,
      text: `Your OTP for PullUp: ${otp}. It expires at ${formattedTime}. Do not share this code.`,
    });

    console.log(`[EMAIL] Sent to ${email}:`, info.messageId);
    return true;
  } catch (error: any) {
    console.error(`[EMAIL] Failed to send to ${email}:`, error.message);
    throw error;
  }
};

export const verifyMailerConfig = async (): Promise<boolean> => {
  try {
    const mailer = getMailer();
    await mailer.verify();
    console.log('[EMAIL] Configuration verified');
    return true;
  } catch (error: any) {
    console.error('[EMAIL] Configuration verification failed:', error.message);
    return false;
  }
};
