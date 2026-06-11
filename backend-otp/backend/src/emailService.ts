import nodemailer from 'nodemailer';
import { config } from './config.js';

let transporter: nodemailer.Transporter | null = null;

export const initializeMailer = (): nodemailer.Transporter => {
  if (!transporter) {
    // === ENHANCED DEBUGGING ===
    console.log('=== SMTP CONFIG DEBUG ===');
    console.log('MAIL_USER:', process.env.MAIL_USER);
    console.log('MAIL_USER trimmed:', process.env.MAIL_USER ? process.env.MAIL_USER.trim() : '');
    console.log('MAIL_USER length:', process.env.MAIL_USER ? process.env.MAIL_USER.length : 0);
    console.log('MAIL_HOST:', process.env.MAIL_HOST);
    console.log('MAIL_PORT:', process.env.MAIL_PORT);
    console.log('MAIL_PASSWORD length:', config.mail.password ? config.mail.password.length : 0);
    if (config.mail.password && config.mail.password.length > 0) {
      console.log('MAIL_PASSWORD first 3 chars:', config.mail.password.substring(0, 3));
      console.log('MAIL_PASSWORD last 3 chars:', config.mail.password.substring(config.mail.password.length - 3));
    }
    console.log('=========================');

    // Trim credentials
    const mailUser = config.mail.user ? config.mail.user.trim() : '';
    const mailPass = config.mail.password ? config.mail.password.trim() : '';

    // TITAN MAIL SPECIFIC CONFIG
    transporter = nodemailer.createTransport({
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

    transporter.verify((error: Error | null, success: boolean) => {
      if (error) {
        console.error('SMTP Verify Error:', error);
        console.error('Error code:', (error as any).code);
        console.error('Error command:', (error as any).command);
        console.error('Error response:', (error as any).response);
      } else {
        console.log('SMTP Server Ready - Configuration successful!');
      }
    });

    console.log('[EMAIL] Service initialized with Titan Mail');
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

    const fromAddress = config.mail.user ? config.mail.user.trim() : '';
    console.log(`[EMAIL] Sending from: "${config.mail.fromName}" <${fromAddress}>`);
    console.log(`[EMAIL] Sending to: ${email}`);

    const info = await mailer.sendMail({
      from: `"${config.mail.fromName}" <${fromAddress}>`,
      to: email,
      subject: `Your PullUp OTP: ${otp}`,
      html: htmlContent,
      text: `Your OTP for PullUp: ${otp}. It expires at ${formattedTime}. Do not share this code.`,
    });

    console.log(`[EMAIL] Sent to ${email}:`, info.messageId);
    return true;
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`[EMAIL] Failed to send to ${email}:`, err.message);
    console.error('[EMAIL] Full error:', JSON.stringify(err, null, 2));
    throw error;
  }
};

export const verifyMailerConfig = async (): Promise<boolean> => {
  try {
    const mailer = getMailer();
    await mailer.verify();
    console.log('[EMAIL] Configuration verified');
    return true;
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[EMAIL] Verification failed:', err.message);
    return false;
  }
};