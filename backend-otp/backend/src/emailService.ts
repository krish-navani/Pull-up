import nodemailer from 'nodemailer';
import { config } from './config.js';

type SmtpCandidate = {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user: string;
  pass: string;
  fromName: string;
  allowBlankAuth?: boolean;
};

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const formatSmtpError = (error: any): string => {
  const parts = [error?.message || String(error)];
  if (error?.code) parts.push(`code=${error.code}`);
  if (error?.command) parts.push(`command=${error.command}`);
  if (error?.responseCode) parts.push(`responseCode=${error.responseCode}`);
  if (error?.response) parts.push(`response=${error.response}`);
  return parts.join(' | ');
};

const logCandidateConfig = (candidate: SmtpCandidate, phase: string) => {
  console.log(`[SMTP DIAGNOSTICS] [${candidate.name}] ${phase}`);
  console.log(`[SMTP DIAGNOSTICS] [${candidate.name}] host=${candidate.host}`);
  console.log(`[SMTP DIAGNOSTICS] [${candidate.name}] port=${candidate.port}`);
  console.log(`[SMTP DIAGNOSTICS] [${candidate.name}] secure=${candidate.secure}`);
  console.log(`[SMTP DIAGNOSTICS] [${candidate.name}] requireTLS=${candidate.requireTLS}`);
  console.log(`[SMTP DIAGNOSTICS] [${candidate.name}] user=${candidate.user || 'NOT_SET'}`);
  console.log(`[SMTP DIAGNOSTICS] [${candidate.name}] passwordPresent=${candidate.pass.length > 0}`);
  console.log(`[SMTP DIAGNOSTICS] [${candidate.name}] passwordLength=${candidate.pass.length}`);
};

const createTransporter = (candidate: SmtpCandidate): nodemailer.Transporter => {
  const auth = candidate.user && candidate.pass
    ? { user: candidate.user, pass: candidate.pass }
    : undefined;

  return nodemailer.createTransport({
    host: candidate.host,
    port: candidate.port,
    secure: candidate.secure,
    requireTLS: candidate.requireTLS,
    auth,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 7000,
  });
};

export const getSmtpCandidates = (): SmtpCandidate[] => {
  const primaryUser = clean(config.mail.user);
  const primaryPass = clean(config.mail.password);
  const secondaryUser = clean(config.mail.secondary.user);
  const secondaryPass = clean(config.mail.secondary.password);
  const gmailUser = clean(process.env.GMAIL_USER);
  const gmailPass = clean(process.env.GMAIL_PASSWORD);

  const candidates: SmtpCandidate[] = [
    {
      name: 'GoDaddy smtpout SSL 465',
      host: 'smtpout.secureserver.net',
      port: 465,
      secure: true,
      requireTLS: false,
      user: primaryUser,
      pass: primaryPass,
      fromName: config.mail.fromName,
    },
    {
      name: 'GoDaddy smtpout STARTTLS 587',
      host: 'smtpout.secureserver.net',
      port: 587,
      secure: false,
      requireTLS: true,
      user: primaryUser,
      pass: primaryPass,
      fromName: config.mail.fromName,
    },
    {
      name: 'GoDaddy smtp SSL 465',
      host: 'smtp.secureserver.net',
      port: 465,
      secure: true,
      requireTLS: false,
      user: primaryUser,
      pass: primaryPass,
      fromName: config.mail.fromName,
    },
    {
      name: 'GoDaddy relay-hosting 25',
      host: 'relay-hosting.secureserver.net',
      port: 25,
      secure: false,
      requireTLS: false,
      user: primaryUser,
      pass: primaryPass,
      fromName: config.mail.fromName,
    },
  ];

  if (secondaryUser || secondaryPass || process.env.SECONDARY_MAIL_HOST) {
    candidates.push({
      name: 'Secondary SMTP',
      host: config.mail.secondary.host,
      port: config.mail.secondary.port,
      secure: config.mail.secondary.port !== 587,
      requireTLS: config.mail.secondary.port === 587,
      user: secondaryUser,
      pass: secondaryPass,
      fromName: config.mail.secondary.fromName,
    });
  }

  candidates.push({
    name: 'Gmail SMTP STARTTLS 587',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    user: gmailUser,
    pass: gmailPass,
    fromName: process.env.GMAIL_FROM_NAME || config.mail.fromName || 'PullUp',
  });

  return candidates;
};

export const getPrimaryMailer = (): nodemailer.Transporter => {
  return createTransporter(getSmtpCandidates()[0]);
};

export const getSecondaryMailer = (): nodemailer.Transporter => {
  const secondary = getSmtpCandidates().find((candidate) => candidate.name === 'Secondary SMTP');
  return createTransporter(secondary || getSmtpCandidates()[1]);
};

// Deprecated alias for compatibility
export const initializeMailer = (): nodemailer.Transporter => {
  return getPrimaryMailer();
};

// Deprecated alias for compatibility
export const getMailer = (): nodemailer.Transporter => {
  return getPrimaryMailer();
};

const renderOtpEmail = (otp: string, expiryMinutes: number, formattedTime: string): string => `
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
        <p style="margin: 0; color: #991B1B; font-size: 13px; font-weight: 600;">Expires at: <span style="font-weight: 700;">${formattedTime} IST</span> (${expiryMinutes} minutes validity)</p>
      </div>
      <p style="color: #6B7280; font-size: 13px; line-height: 1.5; margin: 0;"><strong>Security Notice:</strong> Never share this OTP with anyone. PullUp staff will never ask for your verification code.</p>
    </div>
    <div style="padding: 16px 28px; background-color: #F9FAFB; border-top: 1px solid #F3F4F6; text-align: center;">
      <p style="color: #9CA3AF; font-size: 12px; margin: 0;">If you did not request this OTP, please ignore this email.</p>
    </div>
  </div>
`;

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
  const htmlContent = renderOtpEmail(otp, expiryMinutes, formattedTime);
  const failures: string[] = [];

  for (const candidate of getSmtpCandidates()) {
    logCandidateConfig(candidate, `Attempting delivery to ${email}`);

    if (!candidate.user || !candidate.pass) {
      const reason = 'SMTP credentials not configured';
      failures.push(`${candidate.name}: ${reason}`);
      console.warn(`[SMTP DIAGNOSTICS] [${candidate.name}] Skipped: ${reason}`);
      continue;
    }

    const tCandidate = Date.now();
    try {
      const transporter = createTransporter(candidate);
      const info = await transporter.sendMail({
        from: `"${candidate.fromName}" <${candidate.user}>`,
        to: email,
        subject: `Your PullUp OTP: ${otp}`,
        html: htmlContent,
        text: `Your OTP for PullUp: ${otp}. It expires at ${formattedTime} IST. Do not share this code.`,
      });

      const elapsed = Date.now() - tCandidate;
      console.log(`[SMTP DIAGNOSTICS] [${candidate.name}] SendMail success in ${elapsed}ms | Total SMTP: ${Date.now() - t0}ms | MessageId: ${info.messageId}`);
      return true;
    } catch (error: any) {
      const formatted = formatSmtpError(error);
      failures.push(`${candidate.name}: ${formatted}`);
      console.error(`[SMTP DIAGNOSTICS] [${candidate.name}] Failed after ${Date.now() - tCandidate}ms: ${formatted}`);
    }
  }

  if (config.nodeEnv !== 'production') {
    console.warn('[SMTP DIAGNOSTICS] All configured SMTP providers failed. Dispatching Ethereal preview because this is not production.');
    try {
      const testAccount = await nodemailer.createTestAccount();
      const etherealTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
        tls: { rejectUnauthorized: false },
      });
      const info = await etherealTransporter.sendMail({
        from: '"PullUp Support" <noreply@pullupapp.in>',
        to: email,
        subject: `Your PullUp OTP: ${otp}`,
        html: htmlContent,
        text: `Your OTP for PullUp: ${otp}. It expires at ${formattedTime} IST. Do not share this code.`,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[LIVE EMAIL SENT] View delivered email in browser: ${previewUrl}`);
      console.log(`[OTP DISPATCH] Code for ${email}: ${otp}`);
      return true;
    } catch (etherealErr: any) {
      failures.push(`Ethereal: ${formatSmtpError(etherealErr)}`);
    }
  }

  throw new Error(`SMTP_DELIVERY_FAILED: ${failures.join(' || ')}`);
};

export const verifyMailerConfig = async (): Promise<boolean> => {
  console.log('[EMAIL] Verifying SMTP configurations...');
  let anySuccess = false;

  for (const candidate of getSmtpCandidates()) {
    logCandidateConfig(candidate, 'Verifying connection/auth');
    if (!candidate.user || !candidate.pass) {
      console.log(`[EMAIL] [${candidate.name}] Not configured`);
      continue;
    }

    try {
      const transporter = createTransporter(candidate);
      await transporter.verify();
      console.log(`[EMAIL] [${candidate.name}] Connection/auth verified`);
      anySuccess = true;
      break;
    } catch (error: any) {
      console.error(`[EMAIL] [${candidate.name}] Verification failed: ${formatSmtpError(error)}`);
    }
  }

  return anySuccess;
};