import admin from 'firebase-admin';
import http from 'https';
import { config } from './config.js';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    }),
  });
}

const db = admin.firestore();
const liveBackendUrl = 'https://backend-eight-gamma-77.vercel.app';
const email = 'audit-test@atlasskilltech.university';

// Map email to document ID matching the backend implementation
const getOTPDocId = (emailStr: string): string => {
  return emailStr.replace(/[.@]/g, '_').toLowerCase();
};

function postRequest(urlStr: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const urlObj = new URL(urlStr);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

const runTest = async () => {
  console.log('=== LIVE OTP FLOW E2E VERIFICATION ===');
  console.log(`1. Sending OTP to ${email} via live Vercel backend...`);
  
  const sendRes = await postRequest(`${liveBackendUrl}/api/otp/send-otp`, { email });
  console.log('Response from /send-otp:', sendRes);

  if (!sendRes.success) {
    throw new Error(`Failed to send OTP: ${JSON.stringify(sendRes)}`);
  }

  const docId = getOTPDocId(email);
  console.log(`\n2. Retrieving generated OTP directly from live Firestore (doc ID: ${docId})...`);
  // Wait 2 seconds to allow Firestore write propagation from backend
  await new Promise(resolve => setTimeout(resolve, 2000));

  const docRef = db.collection('otpVerification').doc(docId);
  const docSnap = await docRef.get();
  
  if (!docSnap.exists) {
    throw new Error(`No OTP record found in Firestore for ${email} with docId: ${docId}!`);
  }

  const otpData = docSnap.data()!;
  console.log('Retrieved OTP Data:', otpData);
  const otpCode = otpData.otp;

  console.log(`\n3. Verifying OTP Code: ${otpCode} on live Vercel backend...`);
  const verifyRes = await postRequest(`${liveBackendUrl}/api/otp/verify-otp`, {
    email,
    otp: otpCode
  });
  console.log('Response from /verify-otp:', verifyRes);

  if (verifyRes.success && verifyRes.firebaseToken) {
    console.log('\n🎉 SUCCESS: Live OTP E2E authentication verified successfully!');
    console.log('Minted Custom Firebase Token:', verifyRes.firebaseToken.substring(0, 30) + '...');
  } else {
    console.error('\n❌ FAILED: Live OTP verification failed!');
  }
};

runTest().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
