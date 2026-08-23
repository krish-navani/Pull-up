import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.vercel') });
dotenv.config({ path: path.join(__dirname, '.env.vercel.prod') });

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const primaryUser = clean(process.env.MAIL_USER);
const primaryPass = clean(process.env.MAIL_PASSWORD);
const gmailUser = clean(process.env.GMAIL_USER);
const gmailPass = clean(process.env.GMAIL_PASSWORD);
const testRecipient = clean(process.env.TEST_RECIPIENT) || primaryUser || gmailUser || 'anshika.gupta.btech2028@atlasskilltech.university';

const providers = [
  { name: 'GoDaddy smtpout SSL 465', host: 'smtpout.secureserver.net', port: 465, secure: true, requireTLS: false, user: primaryUser, pass: primaryPass },
  { name: 'GoDaddy smtpout STARTTLS 587', host: 'smtpout.secureserver.net', port: 587, secure: false, requireTLS: true, user: primaryUser, pass: primaryPass },
  { name: 'GoDaddy smtp SSL 465', host: 'smtp.secureserver.net', port: 465, secure: true, requireTLS: false, user: primaryUser, pass: primaryPass },
  { name: 'GoDaddy relay-hosting 25', host: 'relay-hosting.secureserver.net', port: 25, secure: false, requireTLS: false, user: primaryUser, pass: primaryPass },
  { name: 'Gmail SMTP STARTTLS 587', host: 'smtp.gmail.com', port: 587, secure: false, requireTLS: true, user: gmailUser, pass: gmailPass },
];

const formatError = (error) => {
  const parts = [error?.message || String(error)];
  if (error?.code) parts.push(`code=${error.code}`);
  if (error?.command) parts.push(`command=${error.command}`);
  if (error?.responseCode) parts.push(`responseCode=${error.responseCode}`);
  if (error?.response) parts.push(`response=${error.response}`);
  return parts.join(' | ');
};

const testProvider = async (provider) => {
  console.log(`\n=== ${provider.name} ===`);
  console.log(`host=${provider.host}`);
  console.log(`port=${provider.port}`);
  console.log(`secure=${provider.secure}`);
  console.log(`requireTLS=${provider.requireTLS}`);
  console.log(`user=${provider.user || 'NOT_SET'}`);
  console.log(`passwordPresent=${provider.pass.length > 0}`);
  console.log(`passwordLength=${provider.pass.length}`);

  if (!provider.user || !provider.pass) {
    console.log('RESULT=SKIPPED credentials not configured');
    return { name: provider.name, ok: false, skipped: true, reason: 'credentials not configured' };
  }

  const transporter = nodemailer.createTransport({
    host: provider.host,
    port: provider.port,
    secure: provider.secure,
    requireTLS: provider.requireTLS,
    auth: { user: provider.user, pass: provider.pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    console.log('verify=start');
    await transporter.verify();
    console.log('verify=success');
    const info = await transporter.sendMail({
      from: `"PullUp SMTP Test" <${provider.user}>`,
      to: testRecipient,
      subject: `PullUp SMTP Test - ${provider.name}`,
      text: `PullUp SMTP diagnostic succeeded using ${provider.name}.`,
      html: `<p>PullUp SMTP diagnostic succeeded using <strong>${provider.name}</strong>.</p>`,
    });
    console.log(`send=success messageId=${info.messageId}`);
    return { name: provider.name, ok: true, messageId: info.messageId };
  } catch (error) {
    const formatted = formatError(error);
    console.log(`RESULT=FAILED ${formatted}`);
    return { name: provider.name, ok: false, skipped: false, reason: formatted };
  }
};

console.log('=== PullUp SMTP Diagnostic Test ===');
console.log(`NODE_ENV=${process.env.NODE_ENV || ''}`);
console.log(`TEST_RECIPIENT=${testRecipient}`);

const results = [];
for (const provider of providers) {
  results.push(await testProvider(provider));
}

console.log('\n=== SUMMARY ===');
for (const result of results) {
  if (result.ok) {
    console.log(`${result.name}: PASS messageId=${result.messageId}`);
  } else if (result.skipped) {
    console.log(`${result.name}: SKIPPED ${result.reason}`);
  } else {
    console.log(`${result.name}: FAIL ${result.reason}`);
  }
}

const firstPass = results.find((result) => result.ok);
process.exitCode = firstPass ? 0 : 1;