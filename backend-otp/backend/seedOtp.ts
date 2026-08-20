import dotenv from 'dotenv';
import path from 'path';
import admin from 'firebase-admin';

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();

const TEST_EMAIL = 'fresh.signup.btech2028@atlasskilltech.university';
const TEST_OTP = '9999';

async function main() {
  console.log('--- ADMIN: Cleaning up existing test records ---');
  
  // 1. Delete user if exists
  const usersSnap = await db.collection('users').where('email', '==', TEST_EMAIL).get();
  for (const doc of usersSnap.docs) {
    console.log(`Deleting existing user: ${doc.id}`);
    await doc.ref.delete();
  }

  // 2. Delete session mappings pointing to this user
  const sessionsSnap = await db.collection('userSessions').get();
  for (const doc of sessionsSnap.docs) {
    if (doc.data().userId === TEST_EMAIL) {
      await doc.ref.delete();
    }
  }

  // 3. Write verified OTP doc to otpVerification
  const docId = TEST_EMAIL.replace(/[.@]/g, '_').toLowerCase();
  console.log(`Writing verified OTP record for docId: ${docId}`);
  
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));
  
  await db.collection('otpVerification').doc(docId).set({
    email: TEST_EMAIL,
    otp: TEST_OTP,
    createdAt: now,
    expiresAt: expiresAt,
    attempts: 0,
    maxAttempts: 5,
    used: true, // Marked as verified
    verifiedAt: now
  });
  
  console.log('✅ Admin setup complete.');
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
