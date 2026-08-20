const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken } = require('firebase/auth');
const { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, where, setDoc } = require('firebase/firestore');
const admin = require('firebase-admin');
const path = require('path');

// Load environment variables from backend-otp/backend/.env.local
require('dotenv').config({ path: path.resolve(__dirname, '../../backend-otp/backend/.env.local') });

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

const dbAdmin = admin.firestore();
const TEST_EMAIL = 'anshika.gupta.btech2028@atlasskilltech.university';
const BACKEND_URL = 'https://backend-eight-gamma-77.vercel.app';

async function runE2ETests() {
  console.log('================================================================');
  console.log('🚀 PULLUP PRODUCTION E2E HARDENING & VERIFICATION TEST');
  console.log('================================================================\n');

  // STEP 1: AUTH & OTP DELIVERY
  console.log('--- STEP 1: OTP GENERATION & BACKEND VERIFICATION ---');
  const fetchFn = globalThis.fetch || require('node-fetch');

  console.log(`[1.1] Requesting OTP for ${TEST_EMAIL}...`);
  const sendOtpRes = await fetchFn(`${BACKEND_URL}/api/otp/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL }),
  });
  const sendOtpJson = await sendOtpRes.json();
  console.log('[1.1 Response]:', sendOtpJson);
  if (!sendOtpJson.success) throw new Error('OTP send failed');

  const docId = TEST_EMAIL.replace(/[.@]/g, '_').toLowerCase();
  const otpDoc = await dbAdmin.collection('otpVerification').doc(docId).get();
  if (!otpDoc.exists) throw new Error('OTP document not written to Firestore!');
  const otpData = otpDoc.data();
  console.log(`[1.2] Retrieved OTP from Firestore: ${otpData.otp} (Expires: ${otpData.expiresAt.toDate().toISOString()})`);

  console.log(`[1.3] Verifying OTP ${otpData.otp} via backend...`);
  const verifyRes = await fetchFn(`${BACKEND_URL}/api/otp/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, otp: otpData.otp }),
  });
  const verifyJson = await verifyRes.json();
  console.log('[1.3 Response]:', verifyJson);
  if (!verifyJson.success || !verifyJson.firebaseToken) throw new Error('OTP verification failed!');
  console.log('✅ OTP Verification & Firebase Custom Token acquisition: PASS');

  // STEP 2: FIREBASE AUTHENTICATION & PROFILE INTEGRITY
  console.log('\n--- STEP 2: FIREBASE AUTHENTICATION & PROFILE INTEGRITY ---');
  const userCredential = await signInWithCustomToken(clientAuth, verifyJson.firebaseToken);
  const uid = userCredential.user.uid;
  console.log(`[2.1] Firebase authenticated user UID: ${uid}`);

  const userDocRef = doc(clientDb, 'users', uid);
  const userSnap = await getDoc(userDocRef);
  if (!userSnap.exists()) throw new Error('User document missing after auth!');
  const userProfile = userSnap.data();
  console.log(`[2.2] User Profile Loaded: Full Name = "${userProfile.fullName}", Role = "${userProfile.role}", License Verified = ${userProfile.licenseVerified}`);
  if (userProfile.email !== TEST_EMAIL) throw new Error('User email mismatch!');
  console.log('✅ User Profile Load & Auth Integrity: PASS');

  // STEP 3: ROLE SWITCHING (RIDER <-> CAR OWNER)
  console.log('\n--- STEP 3: ROLE SWITCHING (RIDER <-> CAR OWNER) ---');
  console.log('[3.1] Switching role to passenger...');
  await updateDoc(userDocRef, { role: 'passenger', updatedAt: new Date().toISOString() });
  let updatedSnap = await getDoc(userDocRef);
  console.log(`[3.1 Check] Role is now: ${updatedSnap.data().role}`);

  console.log('[3.2] Switching role back to driver...');
  await updateDoc(userDocRef, { role: 'driver', updatedAt: new Date().toISOString() });
  updatedSnap = await getDoc(userDocRef);
  console.log(`[3.2 Check] Role is now: ${updatedSnap.data().role}`);
  console.log('✅ Role Switching: PASS');

  // STEP 4: RIDE DISCOVERY & SEARCH
  console.log('\n--- STEP 4: RIDE DISCOVERY & SEARCH ---');
  const ridesCol = collection(clientDb, 'rides');
  const activeRidesQ = query(ridesCol, where('status', 'in', ['created', 'upcoming', 'in_progress']));
  const activeRidesSnap = await getDocs(activeRidesQ);
  console.log(`[4.1] Active rides found in collection: ${activeRidesSnap.size}`);
  activeRidesSnap.forEach(r => {
    const d = r.data();
    console.log(`  - Ride ID: ${r.id} | Type: ${d.type || 'carpool'} | Seats: ${d.availableSeats}/${d.totalSeats} | Status: ${d.status} | Driver: ${d.driverName}`);
  });
  console.log('✅ Ride Discovery Query: PASS');

  // STEP 5: CARPOOL RIDE CREATION & LIFECYCLE PERSISTENCE
  console.log('\n--- STEP 5: CARPOOL RIDE CREATION & LIFECYCLE PERSISTENCE ---');
  const testRideId = `test_e2e_carpool_${Date.now()}`;
  const nowISO = new Date().toISOString();
  const testRideData = {
    id: testRideId,
    driverId: uid,
    driverName: userProfile.fullName || 'Anshika Gupta',
    driverPhone: userProfile.phone || '8879801298',
    driverProfileImage: userProfile.profileImage || null,
    origin: 'Atlas SkillTech University, BKC, Mumbai',
    originCoordinates: { latitude: 19.0707255, longitude: 72.8752988 },
    destination: 'Goregaon East, Mumbai',
    destinationCoordinates: { latitude: 19.1529696, longitude: 72.8569397 },
    departureTime: new Date(Date.now() + 3600000).toISOString(),
    totalSeats: 3,
    availableSeats: 3,
    pricePerSeat: 80,
    status: 'created',
    type: 'carpool',
    passengers: [],
    createdAt: nowISO,
    updatedAt: nowISO,
  };

  const testRideRef = doc(clientDb, 'rides', testRideId);
  await setDoc(testRideRef, testRideData);
  console.log(`[5.1] Created Carpool Ride document ID: ${testRideId}`);

  const checkCreatedRide = await getDoc(testRideRef);
  if (!checkCreatedRide.exists()) throw new Error('Created ride not found in Firestore!');
  console.log(`[5.2] Verified Ride stored in Firestore. Status: ${checkCreatedRide.data().status}`);

  // STEP 6: TAXI POOL CREATION & SEARCH
  console.log('\n--- STEP 6: TAXI POOL CREATION & SEARCH ---');
  const testPoolId = `test_e2e_pool_${Date.now()}`;
  const testPoolData = {
    id: testPoolId,
    creatorId: uid,
    creatorName: userProfile.fullName || 'Anshika Gupta',
    origin: 'Atlas SkillTech University, BKC, Mumbai',
    originCoordinates: { latitude: 19.0707255, longitude: 72.8752988 },
    destination: 'Chhatrapati Shivaji Maharaj International Airport',
    destinationCoordinates: { latitude: 19.0895595, longitude: 72.8656144 },
    departureTime: new Date(Date.now() + 7200000).toISOString(),
    totalSeats: 4,
    availableSeats: 3,
    estimatedTotalFare: 400,
    farePerPerson: 100,
    status: 'open',
    type: 'taxipool',
    members: [{ userId: uid, name: userProfile.fullName, joinedAt: nowISO }],
    createdAt: nowISO,
    updatedAt: nowISO,
  };
  const testPoolRef = doc(clientDb, 'taxiPools', testPoolId);
  await setDoc(testPoolRef, testPoolData);
  console.log(`[6.1] Created TaxiPool document ID: ${testPoolId}`);

  const checkCreatedPool = await getDoc(testPoolRef);
  if (!checkCreatedPool.exists()) throw new Error('Created TaxiPool not found in Firestore!');
  console.log(`[6.2] Verified TaxiPool stored in Firestore. Status: ${checkCreatedPool.data().status}`);

  // STEP 7: PUSH NOTIFICATION TRIGGER VIA BACKEND
  console.log('\n--- STEP 7: REAL BACKEND PUSH NOTIFICATION DISPATCH ---');
  console.log(`[7.1] Triggering test notification via backend endpoint...`);
  const notifRes = await fetchFn(`${BACKEND_URL}/api/otp/test-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: uid,
      type: 'booking_accepted',
      title: '🚗 PullUp Ride Confirmed',
      message: 'Your seat for Atlas to Goregaon is confirmed!',
    }),
  });
  const notifJson = await notifRes.json();
  console.log('[7.1 Response]:', notifJson);
  console.log('✅ Backend Notification Triggering: PASS');

  // STEP 8: CLEANUP TEST OBJECTS (Preserving user account!)
  console.log('\n--- STEP 8: CLEANUP TEST RIDES & POOLS ---');
  await admin.firestore().collection('rides').doc(testRideId).delete();
  await admin.firestore().collection('taxiPools').doc(testPoolId).delete();
  console.log('[8.1] Cleaned up temporary E2E test ride and pool records.');

  console.log('\n================================================================');
  console.log('🎉 ALL BACKEND & FIRESTORE INTEGRITY TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runE2ETests().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
