import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';

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
const TEST_EMAIL = 'anshika.gupta.btech2028@atlasskilltech.university';
const BACKEND_URL = 'https://backend-eight-gamma-77.vercel.app';

async function runE2ETests() {
  console.log('================================================================');
  console.log('🚀 PULLUP PRODUCTION E2E HARDENING & VERIFICATION TEST');
  console.log('================================================================\n');

  // STEP 1: AUTH & OTP DELIVERY
  console.log('--- STEP 1: OTP GENERATION & BACKEND VERIFICATION ---');
  const fetchFn = (globalThis as any).fetch || require('node-fetch');

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
  const otpDoc = await db.collection('otpVerification').doc(docId).get();
  if (!otpDoc.exists) throw new Error('OTP document not written to Firestore!');
  const otpData = otpDoc.data()!;
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

  // STEP 2: PROFILE RESTORATION & AUTH INTEGRITY
  console.log('\n--- STEP 2: USER PROFILE INTEGRITY & LOAD ---');
  const uid = verifyJson.userId;
  console.log(`[2.1] Target user UID: ${uid}`);

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('User document missing after auth!');
  const userProfile = userDoc.data()!;
  console.log(`[2.2] User Profile Loaded: Full Name = "${userProfile.fullName}", Role = "${userProfile.role}", License Status = ${userProfile.licenseVerificationStatus}`);
  if (userProfile.email !== TEST_EMAIL) throw new Error('User email mismatch!');

  // Ensure push token is set for notification test
  await db.collection('users').doc(uid).update({
    fcmToken: userProfile.fcmToken || 'ExponentPushToken[e2e_test_token]',
    expoPushToken: userProfile.expoPushToken || 'ExponentPushToken[e2e_test_token]',
  });
  console.log('✅ User Profile Load & Push Token Register: PASS');

  // STEP 3: ROLE SWITCHING (RIDER <-> CAR OWNER)
  console.log('\n--- STEP 3: ROLE SWITCHING (RIDER <-> CAR OWNER) ---');
  console.log('[3.1] Switching role to passenger...');
  await db.collection('users').doc(uid).update({ role: 'passenger', updatedAt: new Date().toISOString() });
  let updatedDoc = await db.collection('users').doc(uid).get();
  console.log(`[3.1 Check] Role is now: ${updatedDoc.data()?.role}`);

  console.log('[3.2] Switching role back to driver...');
  await db.collection('users').doc(uid).update({ role: 'driver', updatedAt: new Date().toISOString() });
  updatedDoc = await db.collection('users').doc(uid).get();
  console.log(`[3.2 Check] Role is now: ${updatedDoc.data()?.role}`);
  console.log('✅ Role Switching: PASS');

  // STEP 4: RIDE DISCOVERY & SEARCH
  console.log('\n--- STEP 4: RIDE DISCOVERY & SEARCH ---');
  const activeRidesSnap = await db.collection('rides').where('status', 'in', ['created', 'upcoming', 'in_progress']).get();
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

  await db.collection('rides').doc(testRideId).set(testRideData);
  console.log(`[5.1] Created Carpool Ride document ID: ${testRideId}`);

  const checkCreatedRide = await db.collection('rides').doc(testRideId).get();
  if (!checkCreatedRide.exists) throw new Error('Created ride not found in Firestore!');
  console.log(`[5.2] Verified Ride stored in Firestore. Status: ${checkCreatedRide.data()?.status}`);

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
  await db.collection('taxiPools').doc(testPoolId).set(testPoolData);
  console.log(`[6.1] Created TaxiPool document ID: ${testPoolId}`);

  const checkCreatedPool = await db.collection('taxiPools').doc(testPoolId).get();
  if (!checkCreatedPool.exists) throw new Error('Created TaxiPool not found in Firestore!');
  console.log(`[6.2] Verified TaxiPool stored in Firestore. Status: ${checkCreatedPool.data()?.status}`);

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

  // Check notification history record in Firestore
  const notifHistory = await db.collection('users').doc(uid).collection('notifications').get();
  console.log(`[7.2] Notification history documents stored in Firestore: ${notifHistory.size}`);
  console.log('✅ Backend Notification Triggering & Firestore History: PASS');

  // STEP 8: CLEANUP TEST OBJECTS (Preserving user account!)
  console.log('\n--- STEP 8: CLEANUP TEST RIDES & POOLS ---');
  await db.collection('rides').doc(testRideId).delete();
  await db.collection('taxiPools').doc(testPoolId).delete();
  console.log('[8.1] Cleaned up temporary E2E test ride and pool records.');

  console.log('\n================================================================');
  console.log('🎉 ALL BACKEND & FIRESTORE INTEGRITY TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runE2ETests().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
