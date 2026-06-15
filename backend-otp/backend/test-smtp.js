import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('=== SMTP DIAGNOSTIC TEST ===');
console.log('NODE_ENV:', process.env.NODE_ENV);

const primaryUser = process.env.MAIL_USER || '';
const primaryPass = process.env.MAIL_PASSWORD || '';
const primaryHost = process.env.MAIL_HOST || 'smtp.titan.email';
const primaryPort = Number(process.env.MAIL_PORT || 465);

const secondaryUser = process.env.SECONDARY_MAIL_USER || '';
const secondaryPass = process.env.SECONDARY_MAIL_PASSWORD || '';
const secondaryHost = process.env.SECONDARY_MAIL_HOST || 'smtp.gmail.com';
const secondaryPort = Number(process.env.SECONDARY_MAIL_PORT || 465);

const testRecipient = process.env.TEST_RECIPIENT || primaryUser || secondaryUser || 'krish@pullupapp.in';

const testProvider = async (name, host, port, user, pass) => {
  console.log(`\nTesting [${name}] Provider...`);
  console.log(`Host: ${host}`);
  console.log(`Port: ${port}`);
  console.log(`User: ${user ? user : '❌ NOT SET'}`);
  console.log(`Password: ${pass ? '●●●●●●●●' : '❌ NOT SET'}`);

  if (!user || !pass) {
    console.log(`⚠️  Skipping test for [${name}] (credentials not configured)`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 587 ? false : true,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 5000,
  });

  try {
    console.log(`Connecting to ${host}...`);
    await transporter.verify();
    console.log(`✅ SMTP Connection and Auth successful for [${name}]!`);
    
    console.log(`Sending test email to ${testRecipient}...`);
    const info = await transporter.sendMail({
      from: `"${name} Test" <${user}>`,
      to: testRecipient,
      subject: `PullUp SMTP Test - ${name}`,
      text: `Hello, this is a test email from the PullUp SMTP diagnostic script using the ${name} provider.`,
      html: `<h3>PullUp SMTP Test</h3><p>Hello, this is a test email from the PullUp SMTP diagnostic script using the <b>${name}</b> provider.</p>`,
    });
    console.log(`✅ Email sent successfully! MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Connection/Auth/Send failed for [${name}]:`, error.message);
    return false;
  }
};

async function run() {
  const primaryResult = await testProvider('Primary', primaryHost, primaryPort, primaryUser, primaryPass);
  const secondaryResult = await testProvider('Secondary', secondaryHost, secondaryPort, secondaryUser, secondaryPass);

  console.log('\n=== SUMMARY ===');
  console.log('Primary SMTP:', primaryResult ? '✅ WORKING' : '❌ FAILED/NOT CONFIGURED');
  console.log('Secondary SMTP:', secondaryResult ? '✅ WORKING' : '❌ FAILED/NOT CONFIGURED');
  console.log('================');
}

run();
