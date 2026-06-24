import { getDb } from './src/firebase';

async function main() {
  const doc = await getDb().collection('otpVerification').doc('test_atlasskilltech_university').get();
  if (doc.exists) {
    console.log('OTP Document:', doc.data());
  } else {
    console.log('OTP Document not found');
  }
}

main().catch(console.error);
