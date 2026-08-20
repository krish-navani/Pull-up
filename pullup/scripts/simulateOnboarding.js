const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore } = require('firebase/firestore');

// 1. Initialize Firebase Admin SDK to seed mock OTP
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../backend-otp/backend/.env.local') });

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

const adminDb = admin.firestore();

// 2. Client SDK Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDAH_IkC3mEa0I3K58YZ6NnnCNWH7u7v98",
  authDomain: "pullup-production.firebaseapp.com",
  projectId: "pullup-production",
  storageBucket: "pullup-production.firebasestorage.app",
  messagingSenderId: "286433202099",
  appId: "1:286433202099:web:e2b0d38e845d50bc3005c6",
};

const clientApp = initializeApp(firebaseConfig);
const clientAuth = getAuth(clientApp);
const clientDb = getFirestore(clientApp);

// Mock data
const TEST_EMAIL = 'test.newuser.btech2028@atlasskilltech.university';
const TEST_OTP = '9999';

async function setup() {
  console.log('--- ADMIN: Cleaning up existing test records ---');
  
  // Delete user if exists
  const usersSnap = await adminDb.collection('users').where('email', '==', TEST_EMAIL).get();
  for (const doc of usersSnap.docs) {
    console.log(`Deleting existing user: ${doc.id}`);
    await doc.ref.delete();
  }

  // Delete session mappings pointing to this user
  const sessionsSnap = await adminDb.collection('userSessions').get();
  for (const doc of sessionsSnap.docs) {
    if (doc.data().userId === TEST_EMAIL) {
      await doc.ref.delete();
    }
  }

  // Write verified OTP doc to otpVerification
  const docId = TEST_EMAIL.replace(/[.@]/g, '_').toLowerCase();
  console.log(`Writing verified OTP record for docId: ${docId}`);
  
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));
  
  await adminDb.collection('otpVerification').doc(docId).set({
    email: TEST_EMAIL,
    otp: TEST_OTP,
    createdAt: now,
    expiresAt: expiresAt,
    attempts: 0,
    maxAttempts: 5,
    used: true, // Marked as verified
    verifiedAt: now
  });
  console.log('✅ Mock OTP record created.');
}

async function runClientFlow() {
  console.log('\n--- CLIENT: Simulating onboarding flow ---');
  
  // Import the exact functions from authService
  const { verifyOTPAndCreateAccount } = require('../utils/authService');
  
  // Sign in anonymously
  console.log('Signing in anonymously client-side...');
  const userCredential = await signInAnonymously(clientAuth);
  console.log(`✅ Client authenticated, UID: ${userCredential.user.uid}`);
  
  const signUpData = {
    email: TEST_EMAIL,
    fullName: 'Test Onboarding User',
    phone: '9999999999',
    year: 'First Year',
    course: 'BTech',
    division: 'A',
    role: 'passenger',
    homeAddress: {
      address: 'Atlas SkillTech University, Mumbai',
      latitude: 19.0707255,
      longitude: 72.8752988,
      city: 'Mumbai'
    }
  };

  console.log(`Calling verifyOTPAndCreateAccount for ${TEST_EMAIL}...`);
  try {
    const user = await verifyOTPAndCreateAccount(TEST_EMAIL, TEST_OTP, signUpData);
    console.log('✅ Onboarding completed successfully! User document:', user);
  } catch (error) {
    console.error('❌ Onboarding failed during verifyOTPAndCreateAccount:', error);
  }
}

async function main() {
  await setup();
  await runClientFlow();
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
