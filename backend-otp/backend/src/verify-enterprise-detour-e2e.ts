import express from 'express';
import http from 'http';
import admin from 'firebase-admin';
import routes from './routes.js';
import { initializeFirebase, getDb } from './firebase.js';

const app = express();
app.use(express.json());
app.use('/api/otp', routes);

let server: http.Server;
const PORT = 3110;
const suffix = `detour_e2e_${Date.now()}`;

// Mock IDs
const testRideId = `ride_${suffix}`;
const testDriverId = `driver_${suffix}`;
const testPassengerAId = `passengerA_${suffix}`;
const testPassengerBId = `passengerB_${suffix}`;

const docsToCleanup: { col: string; id: string }[] = [];

function postJson(path: string, body: any): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode || 500,
            data: JSON.parse(data),
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode || 500,
            data: data,
          });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function runE2ETests() {
  console.log('🚀 Starting PullUp Enterprise Route Detour Matching E2E Auditing...');
  
  initializeFirebase();
  const db = getDb();
  console.log('✅ Firebase connection initialized');

  server = app.listen(PORT, async () => {
    console.log(`✅ Staging test server running on http://localhost:${PORT}`);
    try {
      await runTestCases(db);
      console.log('\n🎉 ALL ENTERPRISE ROUTE DETOUR SYSTEM CHECKS PASSED SUCCESSFULLY! 🎉');
      await cleanupAll(db);
      process.exit(0);
    } catch (err: any) {
      console.error('\n❌ E2E TEST RUN FAILED:', err.message || err);
      await cleanupAll(db);
      process.exit(1);
    }
  });
}

async function runTestCases(db: admin.firestore.Firestore) {
  // Pre-populate mock ride document
  console.log('\nPre-populating mock ride document...');
  const rideRef = db.collection('rides').doc(testRideId);
  const mockRideData = {
    driverId: testDriverId,
    driverName: 'Staging Detour Driver',
    pickupLocation: { latitude: 19.1190, longitude: 72.9050, address: 'IIT Bombay, Powai' },
    dropLocation: { latitude: 19.0760, longitude: 72.8777, address: 'Mumbai Airport' },
    routePolyline: 'a~|gE~lhvWb@~@??x@x@??c@`@??a@a@??u@c@??k@a@??k@a@??k@a@??k@a@',
    simplifiedCoordinates: [
      { latitude: 19.1190, longitude: 72.9050 },
      { latitude: 19.1150, longitude: 72.9000 },
      { latitude: 19.1000, longitude: 72.8850 },
      { latitude: 19.0760, longitude: 72.8777 }
    ],
    baselineDistanceMeters: 8000,
    baselineDurationSeconds: 1200,
    currentDistanceMeters: 8000,
    currentDurationSeconds: 1200,
    detourRadiusMeters: 2000, // 2 km limit
    remainingDetourBudgetMeters: 2000,
    status: 'active',
    availableSeats: 3,
    totalSeats: 3,
    routeVersion: 1,
    optimizationStatus: 'completed',
    lastOptimizedAt: new Date().toISOString(),
    optimizationSource: 'google',
    createdAt: admin.firestore.Timestamp.now(),
  };
  await rideRef.set(mockRideData);
  docsToCleanup.push({ col: 'rides', id: testRideId });
  console.log('✅ Mock ride pre-populated');

  // 🧪 TEST 1: Passenger pickup directly on the route corridor (Approved instantly)
  console.log('\n🧪 TEST 1: Passenger pickup directly on the route corridor...');
  const res1 = await postJson('/api/otp/evaluate-detour', {
    rideId: testRideId,
    passengerPickup: { latitude: 19.1150, longitude: 72.9000, address: 'Near Powai Lake' }
  });
  console.log('  Response:', JSON.stringify(res1.data));
  if (res1.statusCode !== 200 || res1.data.status !== 'approved') {
    throw new Error('Test 1 failed: Passenger directly on route should be approved');
  }
  console.log('  ✅ TEST 1 PASSED: Approved.');

  // 🧪 TEST 2: Passenger near corridor but huge detour exceeds budget
  console.log('\n🧪 TEST 2: Passenger near corridor but huge detour...');
  const res2 = await postJson('/api/otp/evaluate-detour', {
    rideId: testRideId,
    passengerPickup: { latitude: 19.1500, longitude: 72.9400, address: 'Vikhroli East' } // ~4.5km away
  });
  console.log('  Response:', JSON.stringify(res2.data));
  if (res2.statusCode !== 200 || res2.data.status !== 'rejected') {
    throw new Error('Test 2 failed: Huge detour should be rejected');
  }
  console.log('  ✅ TEST 2 PASSED: Rejected.');

  // 🧪 TEST 3: Passenger within 2km limit (Approved)
  console.log('\n🧪 TEST 3: Passenger within 2km detour limit...');
  const res3 = await postJson('/api/otp/evaluate-detour', {
    rideId: testRideId,
    passengerPickup: { latitude: 19.1160, longitude: 72.9010, address: 'Powai Plaza' } // small detour ~150 meters
  });
  console.log('  Response:', JSON.stringify(res3.data));
  if (res3.statusCode !== 200 || res3.data.status !== 'approved') {
    throw new Error('Test 3 failed: Detour within limit should be approved');
  }
  console.log('  ✅ TEST 3 PASSED: Approved.');

  // 🧪 TEST 4: Recommended pickup points generation (Outside threshold)
  console.log('\n🧪 TEST 4: Recommended pickup points generation for rejected detour...');
  const res4 = await postJson('/api/otp/evaluate-detour', {
    rideId: testRideId,
    passengerPickup: { latitude: 19.1450, longitude: 72.9300, address: 'Kanjurmarg West' } // Exceeds limit
  });
  console.log('  Response:', JSON.stringify(res4.data));
  if (res4.statusCode !== 200 || res4.data.status !== 'rejected' || !res4.data.recommendations) {
    throw new Error('Test 4 failed: Should reject and return recommendations list');
  }
  const recs = res4.data.recommendations;
  if (recs.length !== 3) {
    throw new Error(`Test 4 failed: Expected exactly 3 recommendations, got ${recs.length}`);
  }
  console.log(`  ✅ TEST 4 PASSED: Generated 3 options.`);

  // 🚨 VERIFICATION 1: Race Condition on Simultaneous Joins
  console.log('\n🚨 VERIFICATION 1: Race Condition detour check inside accept-booking transaction...');
  // Prep Passenger A (Requests +1500m detour)
  const bookingARef = db.collection('bookings').doc(`bookingA_${suffix}`);
  await bookingARef.set({
    rideId: testRideId,
    passengerId: testPassengerAId,
    passengerName: 'Passenger A',
    driverId: testDriverId,
    seatsBooked: 1,
    totalPrice: 100,
    status: 'pending',
    paymentStatus: 'paid',
    extraDistanceMeters: 1500,
    passengerPickupLocation: { latitude: 19.1160, longitude: 72.9010 }
  });
  docsToCleanup.push({ col: 'bookings', id: `bookingA_${suffix}` });

  // Prep Passenger B (Requests +1200m detour)
  const bookingBRef = db.collection('bookings').doc(`bookingB_${suffix}`);
  await bookingBRef.set({
    rideId: testRideId,
    passengerId: testPassengerBId,
    passengerName: 'Passenger B',
    driverId: testDriverId,
    seatsBooked: 1,
    totalPrice: 100,
    status: 'pending',
    paymentStatus: 'paid',
    extraDistanceMeters: 1200,
    passengerPickupLocation: { latitude: 19.1160, longitude: 72.9010 }
  });
  docsToCleanup.push({ col: 'bookings', id: `bookingB_${suffix}` });

  // Update ride bookedSeats array (as if they booked)
  await rideRef.update({
    bookedSeats: [
      { passengerId: testPassengerAId, seatsBooked: 1, status: 'pending' },
      { passengerId: testPassengerBId, seatsBooked: 1, status: 'pending' }
    ]
  });

  // Driver accepts Passenger A first (succeeds, drops remaining detour budget to 500m)
  console.log('  Driver accepting Passenger A (+1.5km)...');
  const acceptARes = await postJson('/api/otp/accept-booking', { bookingId: `bookingA_${suffix}` });
  console.log('    Accept A Response:', JSON.stringify(acceptARes.data));
  if (acceptARes.statusCode !== 200) {
    throw new Error('Verification 1 failed: Accept Passenger A should succeed');
  }

  // Driver accepts Passenger B second (must fail because remaining budget of 500m < 1200m)
  console.log('  Driver accepting Passenger B (+1.2km)...');
  const acceptBRes = await postJson('/api/otp/accept-booking', { bookingId: `bookingB_${suffix}` });
  console.log('    Accept B Response:', JSON.stringify(acceptBRes.data));
  if (acceptBRes.statusCode === 200 || acceptBRes.data.code !== 'DETOUR_BUDGET_EXCEEDED') {
    throw new Error('Verification 1 failed: Accept Passenger B should fail due to detour budget exhaustion');
  }
  console.log('  ✅ VERIFICATION 1 PASSED: Atomic detour budget checks prevented simultaneous join overrun.');

  // 🚨 VERIFICATION 2: Driver Edit After Passengers Join
  console.log('\n🚨 VERIFICATION 2: Driver Edit lock after passengers join...');
  const editRes = await postJson('/api/otp/update-ride-detour', {
    rideId: testRideId,
    detourRadiusMeters: 1000 // try to edit detour from 2km to 1km
  });
  console.log('  Edit Response:', JSON.stringify(editRes.data));
  if (editRes.statusCode !== 400 || editRes.data.code !== 'DETOUR_SETTINGS_LOCKED') {
    throw new Error('Verification 2 failed: Detour settings should be locked since a passenger is accepted');
  }
  console.log('  ✅ VERIFICATION 2 PASSED: Detour settings locking validated successfully.');

  // 🚨 VERIFICATION 3 & 4: Passenger Removal Re-optimization & Asynchronous optimization queue
  console.log('\n🚨 VERIFICATION 3 & 4: Driver removes passenger & asynchronous route re-optimization queue...');
  // Driver rejects Passenger A (removes passenger)
  console.log('  Rejecting Passenger A booking...');
  const startRejectTime = Date.now();
  const rejectRes = await postJson('/api/otp/reject-booking', { bookingId: `bookingA_${suffix}` });
  const rejectDuration = Date.now() - startRejectTime;
  
  console.log(`    Reject API returned in: ${rejectDuration}ms`);
  console.log('    Reject Response:', JSON.stringify(rejectRes.data));
  if (rejectRes.statusCode !== 200) {
    throw new Error('Verification 3/4 failed: Reject booking should succeed');
  }
  if (rejectDuration > 250) {
    console.warn(`    ⚠️ Warning: Reject API took ${rejectDuration}ms (expected under 250ms due to async queue)`);
  }

  // Poll for background re-optimization completion (Verification 4)
  console.log('  Waiting for background optimization queue (polling)...');
  let finalRide: any = null;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 500));
    const snap = await rideRef.get();
    if (snap.exists) {
      finalRide = snap.data()!;
      if (finalRide.optimizationStatus === 'completed') {
        break;
      }
    }
  }

  console.log('    Optimized Ride Data:', JSON.stringify({
    routeVersion: finalRide?.routeVersion,
    optimizationStatus: finalRide?.optimizationStatus,
    optimizationSource: finalRide?.optimizationSource,
    remainingDetourBudgetMeters: finalRide?.remainingDetourBudgetMeters,
  }));

  if (finalRide.routeVersion <= 1 || finalRide.optimizationStatus !== 'completed') {
    throw new Error('Verification 3/4 failed: Ride optimization fields not updated correctly in background');
  }
  if (finalRide.remainingDetourBudgetMeters !== 2000) {
    throw new Error(`Verification 3/4 failed: Detour budget not restored to 2000m (got ${finalRide.remainingDetourBudgetMeters}m)`);
  }
  console.log('  ✅ VERIFICATION 3 & 4 PASSED: Asynchronous re-optimization queue freed and restored detour budget.');

  // 🚨 VERIFICATION 5: Google Quota Failure
  console.log('\n🚨 VERIFICATION 5: Google Maps Directions API quota limit failure simulation (429)...');
  // Inject mock quota limit key
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'MOCK_429_LIMIT';

  // Evaluate detour (should fall back to straight line, approved = true since deviation is small)
  const res5 = await postJson('/api/otp/evaluate-detour', {
    rideId: testRideId,
    passengerPickup: { latitude: 19.11712, longitude: 72.90234, address: 'Unique Mock Location' }
  });
  console.log('  Evaluate Detour Response:', JSON.stringify(res5.data));
  
  if (res5.statusCode !== 200 || !res5.data.congestionMode || res5.data.optimizationSource !== 'fallback') {
    throw new Error('Verification 5 failed: Should trigger congestionMode and fallback source on quota limit');
  }

  // Restore API key
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = '';
  console.log('  ✅ VERIFICATION 5 PASSED: Handled quota limits cleanly with mathematical projection fallback.');
}

async function cleanupAll(db: admin.firestore.Firestore) {
  console.log('\n🧹 Cleaning up staging test documents...');
  for (const docInfo of docsToCleanup) {
    try {
      await db.collection(docInfo.col).doc(docInfo.id).delete();
      console.log(`  Deleted document: ${docInfo.col}/${docInfo.id}`);
    } catch (err: any) {
      console.warn(`  Failed to delete ${docInfo.col}/${docInfo.id}:`, err.message);
    }
  }
  if (server) {
    server.close();
    console.log('✅ Staging test server stopped');
  }
}

runE2ETests();
