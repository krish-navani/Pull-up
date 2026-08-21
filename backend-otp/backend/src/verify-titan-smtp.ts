import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

async function testAllTitanVariations() {
  console.log('🔍 Starting Deep Titan Mail SMTP Diagnostics...\n');

  const user = (process.env.MAIL_USER || 'krish@pullup.in').trim();
  const pass = (process.env.MAIL_PASSWORD || '').trim().replace(/^"|"$/g, '');

  console.log('User:', user);
  console.log('Password length:', pass.length);
  console.log('Password preview:', pass.substring(0, 3) + '***' + pass.substring(pass.length - 2));

  const testConfigs = [
    {
      name: 'smtp.titan.email:465 (SSL/TLS - Direct)',
      transporter: nodemailer.createTransport({
        host: 'smtp.titan.email',
        port: 465,
        secure: true,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      }),
    },
    {
      name: 'smtp.titan.email:587 (STARTTLS - Explicit)',
      transporter: nodemailer.createTransport({
        host: 'smtp.titan.email',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      }),
    },
    {
      name: 'smtp.titan.email:587 (STARTTLS - AUTH Method LOGIN)',
      transporter: nodemailer.createTransport({
        host: 'smtp.titan.email',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { type: 'login', user, pass },
        tls: { rejectUnauthorized: false },
      } as any),
    },
    {
      name: 'smtp.titan.email:465 (SSL - AUTH Method LOGIN)',
      transporter: nodemailer.createTransport({
        host: 'smtp.titan.email',
        port: 465,
        secure: true,
        auth: { type: 'login', user, pass },
        tls: { rejectUnauthorized: false },
      } as any),
    },
  ];

  for (const item of testConfigs) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Testing: ${item.name}`);
    try {
      await item.transporter.verify();
      console.log(`✅ SUCCESS! Verified on ${item.name}`);
      const info = await item.transporter.sendMail({
        from: `"PullUp System" <${user}>`,
        to: user,
        subject: `Titan SMTP Test Success (${item.name})`,
        text: 'Titan Mail SMTP verification successful.',
      });
      console.log(`🎉 EMAIL SENT SUCCESSFULLY! MessageId: ${info.messageId}`);
      process.exit(0);
    } catch (err: any) {
      console.error(`❌ Failed on ${item.name}:`, err.message);
    }
  }

  console.log(`\n==================================================`);
  console.log(`❌ All Titan Mail SMTP configurations failed with authentication error (535 5.7.8).`);
  console.log(`==================================================`);
  process.exit(1);
}

testAllTitanVariations();
