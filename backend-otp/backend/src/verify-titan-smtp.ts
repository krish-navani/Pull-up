import dotenv from 'dotenv';
dotenv.config();

import { sendOTPEmail } from './emailService.js';

async function testFullDeliveryPipeline() {
  console.log('🚀 Testing Complete 3-Tier OTP Email Delivery Pipeline...');
  console.log('Target Email: krish@pullupapp.in');

  try {
    const success = await sendOTPEmail(
      'krish@pullupapp.in',
      '8899',
      10,
      new Date(Date.now() + 600000)
    );
    console.log(`\nResult: sendOTPEmail returned ${success}`);
    console.log('✅ OTP Delivery Engine completed cleanly!');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Exception in sendOTPEmail:', err.message);
    process.exit(1);
  }
}

testFullDeliveryPipeline();
