const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

const projectRoot = process.cwd();
dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

console.log('🔍 Initializing SMTP verification tests for GoDaddy...');
console.log('  SMTP Host:', process.env.MAIL_HOST || 'smtpout.secureserver.net');
console.log('  SMTP Port:', process.env.MAIL_PORT || '465');
console.log('  SMTP User:', process.env.MAIL_USER);

const mailHost = process.env.MAIL_HOST || 'smtpout.secureserver.net';
const mailPort = parseInt(process.env.MAIL_PORT || '465', 10);
const mailUser = process.env.MAIL_USER;
const mailPass = process.env.MAIL_PASSWORD;

if (!mailUser || !mailPass) {
  console.error('❌ Error: MAIL_USER or MAIL_PASSWORD not found in environment configuration.');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: mailHost,
  port: mailPort,
  secure: mailPort === 465,
  auth: {
    user: mailUser,
    pass: mailPass,
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function runTests() {
  try {
    console.log('\n🧪 Test 1: Verifying connection to SMTP server...');
    await transporter.verify();
    console.log('  ✅ SMTP connection verified successfully.');

    console.log('\n🧪 Test 2: Sending a test email...');
    const testRecipient = mailUser; // send to self
    const info = await transporter.sendMail({
      from: `"PullUp Verification System" <${mailUser}>`,
      to: testRecipient,
      subject: 'PullUp SMTP Verification Test',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #667eea;">GoDaddy SMTP Integration Test</h2>
          <p>This is a test email from your PullUp backend setup verifying that the SMTP configuration for <strong>${mailUser}</strong> is working perfectly!</p>
          <p>Timestamp: <strong>${new Date().toISOString()}</strong></p>
        </div>
      `,
      text: `PullUp GoDaddy SMTP verification is working perfectly! Sent at: ${new Date().toISOString()}`
    });

    console.log('  ✅ Test email sent successfully.');
    console.log('  Message ID:', info.messageId);
    console.log('\n🎉 ALL SMTP INTEGRATION TESTS PASSED!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ SMTP VERIFICATION TEST FAILED:', error);
    process.exit(1);
  }
}

runTests();
