import express from 'express';
import http from 'http';
import admin from 'firebase-admin';
import routes from './routes.js';
import { initializeFirebase, getDb } from './firebase.js';

const app = express();
app.use(express.json());
app.use('/api/otp', routes);

let server: http.Server;
const PORT = 3099;
const suffix = `lifecycle_${Date.now()}`;

// Mock IDs for testing
const driverId = `driver_${suffix}`;
const passengerId = `passenger_${suffix}`;
const taxiCreatorId = `taxi_creator_${suffix}`;
const taxiMemberId = `taxi_member_${suffix}`;

const rideEmptyId = `ride_empty_${suffix}`;
const rideWithBookingsId = `ride_booked_${suffix}`;
const rideNoShowId = `ride_noshow_${suffix}`;
const taxiEmptyId = `taxi_empty_${suffix}`;
const taxiNoShowId = `taxi_noshow_${suffix}`;
const rideReminder30mId = `ride_rem30_${suffix}`;
const rideReminder10mId = `ride_rem10_${suffix}`;
const rideArchiveId = `ride_archive_${suffix}`;

const docsToCleanup: string[] = [];
const collectionsToCleanup: string[] = ['archivedRides', 'archivedTaxiPools', 'walletTransactions', 'wallets'];

// Helper to make POST requests via Node's native HTTP library
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

async function runLifecycleTests() {
  console.log('🚀 Starting PullUp Ride & Pool Lifecycle Management System E2E verification...');
  
  initializeFirebase();
  const db = getDb();
  console.log('✅ Firebase initialized');

  server = app.listen(PORT, async () => {
    console.log(`✅ Test server running on http://localhost:${PORT}`);
    try {
      await runTestCases(db);
      console.log('\n🎉 ALL LIFECYCLE CHECKLIST TESTS PASSED SUCCESSFULLY! 🎉');
      await cleanupAll(db);
      process.exit(0);
    } catch (err: any) {
      console.error('\n❌ LIFECYCLE E2E VERIFICATION TEST FAILED:', err);
      await cleanupAll(db);
      process.exit(1);
    }
  });
}

async function runTestCases(db: admin.firestore.Firestore) {
  // 1. Seed Users
  const users = [
    { id: driverId, fullName: 'Lifecycle Driver' },
    { id: passengerId, fullName: 'Lifecycle Passenger' },
    { id: taxiCreatorId, fullName: 'Taxi Owner' },
    { id: taxiMemberId, fullName: 'Taxi Passenger' },
  ];

  for (const u of users) {
    await db.collection('users').doc(u.id).set({
      fullName: u.fullName,
      email: `${u.id}@atlasskilltech.university`,
      phone: '9876543210',
      createdAt: admin.firestore.Timestamp.now(),
    });
    docsToCleanup.push(`users/${u.id}`);
  }
  console.log('✅ Mock users pre-populated in Firestore');

  // =========================================================================
  // 🧪 TEST 1: Empty Car Pool Cleanup & Expiry
  // =========================================================================
  console.log('\n🧪 TEST 1: Empty Car Pool Cleanup');
  
  // Create an active ride with past departure time and 0 passengers
  await db.collection('rides').doc(rideEmptyId).set({
    driverId: driverId,
    driverName: 'Lifecycle Driver',
    totalSeats: 3,
    availableSeats: 3,
    price: 150,
    status: 'active',
    departureTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
    createdAt: admin.firestore.Timestamp.now(),
  });
  docsToCleanup.push(`rides/${rideEmptyId}`);

  // Trigger reminders & expiry sweep
  console.log('  Triggering /process-reminders for empty car pool expiry...');
  const res1 = await postJson('/api/otp/process-reminders', {});
  if (res1.statusCode !== 200 || !res1.data.success) {
    throw new Error(`Reminder sweep failed: ${JSON.stringify(res1.data)}`);
  }

  // Verify the ride was archived and deleted from the active collection
  const activeRideEmptySnap = await db.collection('rides').doc(rideEmptyId).get();
  if (activeRideEmptySnap.exists) {
    throw new Error('TEST 1 FAILED: Expired empty ride was not deleted from active rides collection');
  }

  const archivedRideSnap = await db.collection('archivedRides').doc(rideEmptyId).get();
  if (!archivedRideSnap.exists) {
    throw new Error('TEST 1 FAILED: Expired empty ride was not moved to archivedRides collection');
  }

  const archivedRideData = archivedRideSnap.data()!;
  if (archivedRideData.status !== 'expired') {
    throw new Error(`TEST 1 FAILED: Archived ride status should be expired, got: ${archivedRideData.status}`);
  }
  console.log('  ✅ VERIFIED: Past departure ride with 0 bookings is expired and archived.');

  // =========================================================================
  // 🧪 TEST 2: Active Ride Expiry with Bookings
  // =========================================================================
  console.log('\n🧪 TEST 2: Active Ride Expiry with Bookings');
  
  // Create an active ride with past departure time and 1 confirmed passenger
  await db.collection('rides').doc(rideWithBookingsId).set({
    driverId: driverId,
    driverName: 'Lifecycle Driver',
    totalSeats: 3,
    availableSeats: 2,
    price: 150,
    status: 'active',
    departureTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 mins ago
    createdAt: admin.firestore.Timestamp.now(),
  });
  docsToCleanup.push(`rides/${rideWithBookingsId}`);

  // Seed 1 paid booking
  const bookingId = `${rideWithBookingsId}_${passengerId}`;
  await db.collection('bookings').doc(bookingId).set({
    id: bookingId,
    rideId: rideWithBookingsId,
    driverId: driverId,
    passengerId: passengerId,
    seatsBooked: 1,
    totalPrice: 150,
    status: 'confirmed',
    paymentStatus: 'paid',
    bookedAt: new Date().toISOString(),
  });
  docsToCleanup.push(`bookings/${bookingId}`);

  // Trigger sweep
  console.log('  Triggering /process-reminders...');
  await postJson('/api/otp/process-reminders', {});

  // Verify the ride status is updated to expired, but it remains in active collection so driver can start it
  const activeRideSnap = await db.collection('rides').doc(rideWithBookingsId).get();
  if (!activeRideSnap.exists) {
    throw new Error('TEST 2 FAILED: Ride with paid bookings should remain in active collection during grace window');
  }

  const activeRideData = activeRideSnap.data()!;
  if (activeRideData.status !== 'expired') {
    throw new Error(`TEST 2 FAILED: Ride status should be expired, got: ${activeRideData.status}`);
  }
  console.log('  ✅ VERIFIED: Past departure ride with paid bookings is marked expired and stays in list for grace window.');

  // =========================================================================
  // 🧪 TEST 3: Driver No-Show & Auto Wallet Refund
  // =========================================================================
  console.log('\n🧪 TEST 3: Driver No-Show & Auto Wallet Refund');

  // Create expired/active ride with departure time 35 minutes ago, containing 1 paid passenger
  await db.collection('rides').doc(rideNoShowId).set({
    driverId: driverId,
    driverName: 'Lifecycle Driver',
    totalSeats: 3,
    availableSeats: 2,
    price: 150,
    status: 'expired',
    departureTime: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 minutes ago
    createdAt: admin.firestore.Timestamp.now(),
  });
  docsToCleanup.push(`rides/${rideNoShowId}`);

  const bookingNoShowId = `${rideNoShowId}_${passengerId}`;
  await db.collection('bookings').doc(bookingNoShowId).set({
    id: bookingNoShowId,
    rideId: rideNoShowId,
    driverId: driverId,
    passengerId: passengerId,
    seatsBooked: 1,
    totalPrice: 150,
    status: 'confirmed',
    paymentStatus: 'paid',
    bookedAt: new Date().toISOString(),
  });
  docsToCleanup.push(`bookings/${bookingNoShowId}`);

  // Trigger sweep
  console.log('  Triggering /process-reminders (no-show sweep)...');
  await postJson('/api/otp/process-reminders', {});

  // Verify ride status is no_show
  const rideNoShowSnap = await db.collection('rides').doc(rideNoShowId).get();
  if (rideNoShowSnap.data()!.status !== 'no_show') {
    throw new Error(`TEST 3 FAILED: Expected status no_show, got: ${rideNoShowSnap.data()!.status}`);
  }

  // Verify booking is cancelled and refund completed
  const bookingNoShowSnap = await db.collection('bookings').doc(bookingNoShowId).get();
  const bData = bookingNoShowSnap.data()!;
  if (bData.status !== 'cancelled' || bData.refundStatus !== 'completed' || bData.refundAmount !== 150) {
    throw new Error(`TEST 3 FAILED: Booking should be cancelled and refund completed: ${JSON.stringify(bData)}`);
  }

  // Verify passenger wallet credited
  const walletSnap = await db.collection('wallets').doc(passengerId).get();
  if (!walletSnap.exists || walletSnap.data()!.walletBalance !== 150) {
    throw new Error(`TEST 3 FAILED: Passenger wallet was not credited, got: ${walletSnap.data()?.walletBalance}`);
  }

  // Verify push and in-app notifications generated
  const notifs = await db.collection('users').doc(passengerId).collection('notifications').get();
  const ns = notifs.docs.map(n => n.data());
  const nsItem = ns.find(n => n.type === 'ride_cancelled');
  if (!nsItem || !nsItem.message.includes('driver no-show')) {
    throw new Error(`TEST 3 FAILED: Notification log not found or incorrect: ${JSON.stringify(ns)}`);
  }
  console.log('  ✅ VERIFIED: Driver no-show triggers no_show status, passenger wallet refund, and notifications.');

  // =========================================================================
  // 🧪 TEST 4: Empty Taxi Pool Cleanup
  // =========================================================================
  console.log('\n🧪 TEST 4: Empty Taxi Pool Cleanup');

  // Create open taxi pool departing 5 minutes ago with only owner
  await db.collection('taxiPools').doc(taxiEmptyId).set({
    creatorId: taxiCreatorId,
    creatorName: 'Taxi Owner',
    maxMembers: 3,
    memberCount: 1,
    status: 'OPEN',
    departureTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    createdAt: admin.firestore.Timestamp.now(),
  });
  docsToCleanup.push(`taxiPools/${taxiEmptyId}`);

  // Owner member log
  await db.collection('poolMembers').doc(`${taxiEmptyId}_${taxiCreatorId}`).set({
    poolId: taxiEmptyId,
    passengerId: taxiCreatorId,
    passengerName: 'Taxi Owner',
    joinedAt: new Date().toISOString(),
  });
  docsToCleanup.push(`poolMembers/${taxiEmptyId}_${taxiCreatorId}`);

  // Trigger sweep
  console.log('  Triggering /process-reminders...');
  await postJson('/api/otp/process-reminders', {});

  // Verify pool is archived and deleted from active taxiPools
  const activePoolSnap = await db.collection('taxiPools').doc(taxiEmptyId).get();
  if (activePoolSnap.exists) {
    throw new Error('TEST 4 FAILED: Empty taxi pool was not deleted from active collection');
  }

  const archivedPoolSnap = await db.collection('archivedTaxiPools').doc(taxiEmptyId).get();
  if (!archivedPoolSnap.exists) {
    throw new Error('TEST 4 FAILED: Empty taxi pool was not archived');
  }
  console.log('  ✅ VERIFIED: Empty taxi pool expired and archived successfully.');

  // =========================================================================
  // 🧪 TEST 5: Reminder Notifications Delivery
  // =========================================================================
  console.log('\n🧪 TEST 5: Reminder Notifications Delivery');

  // Create ride departing in 25 minutes (trigger 30m alerts)
  await db.collection('rides').doc(rideReminder30mId).set({
    driverId: driverId,
    driverName: 'Lifecycle Driver',
    totalSeats: 3,
    availableSeats: 2,
    price: 150,
    status: 'active',
    departureTime: new Date(Date.now() + 25 * 60 * 1000).toISOString(), // 25 mins from now
    createdAt: admin.firestore.Timestamp.now(),
  });
  docsToCleanup.push(`rides/${rideReminder30mId}`);

  // Seed passenger booking
  const b30mId = `${rideReminder30mId}_${passengerId}`;
  await db.collection('bookings').doc(b30mId).set({
    id: b30mId,
    rideId: rideReminder30mId,
    driverId: driverId,
    passengerId: passengerId,
    seatsBooked: 1,
    totalPrice: 150,
    status: 'confirmed',
    paymentStatus: 'paid',
    bookedAt: new Date().toISOString(),
  });
  docsToCleanup.push(`bookings/${b30mId}`);

  // Trigger sweep
  console.log('  Triggering /process-reminders (30m reminder)...');
  await postJson('/api/otp/process-reminders', {});

  // Verify reminder30mSent is true on ride
  const r30Snap = await db.collection('rides').doc(rideReminder30mId).get();
  if (!r30Snap.data()!.reminder30mSent) {
    throw new Error('TEST 5 FAILED: reminder30mSent flag not updated to true');
  }

  // Create ride departing in 8 minutes (trigger 10m alerts)
  await db.collection('rides').doc(rideReminder10mId).set({
    driverId: driverId,
    driverName: 'Lifecycle Driver',
    totalSeats: 3,
    availableSeats: 2,
    price: 150,
    status: 'active',
    departureTime: new Date(Date.now() + 8 * 60 * 1000).toISOString(), // 8 mins from now
    createdAt: admin.firestore.Timestamp.now(),
  });
  docsToCleanup.push(`rides/${rideReminder10mId}`);

  const b10mId = `${rideReminder10mId}_${passengerId}`;
  await db.collection('bookings').doc(b10mId).set({
    id: b10mId,
    rideId: rideReminder10mId,
    driverId: driverId,
    passengerId: passengerId,
    seatsBooked: 1,
    totalPrice: 150,
    status: 'confirmed',
    paymentStatus: 'paid',
    bookedAt: new Date().toISOString(),
  });
  docsToCleanup.push(`bookings/${b10mId}`);

  // Trigger sweep
  console.log('  Triggering /process-reminders (10m reminder)...');
  await postJson('/api/otp/process-reminders', {});

  // Verify reminder10mSent is true
  const r10Snap = await db.collection('rides').doc(rideReminder10mId).get();
  if (!r10Snap.data()!.reminder10mSent) {
    throw new Error('TEST 5 FAILED: reminder10mSent flag not updated to true');
  }
  console.log('  ✅ VERIFIED: Reminder sweep triggers driver & passenger alerts at 30m and 10m.');

  // =========================================================================
  // 🧪 TEST 6: Completed Ride Archiving (> 30 Days)
  // =========================================================================
  console.log('\n🧪 TEST 6: Completed Ride Archiving (> 30 Days)');

  // Create completed ride with completedAt 31 days ago
  await db.collection('rides').doc(rideArchiveId).set({
    driverId: driverId,
    driverName: 'Lifecycle Driver',
    totalSeats: 3,
    status: 'completed',
    completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    departureTime: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: admin.firestore.Timestamp.now(),
  });
  docsToCleanup.push(`rides/${rideArchiveId}`);

  // Trigger sweep
  console.log('  Triggering /process-reminders (archive sweep)...');
  await postJson('/api/otp/process-reminders', {});

  // Verify archived and deleted
  const rArchiveActiveSnap = await db.collection('rides').doc(rideArchiveId).get();
  if (rArchiveActiveSnap.exists) {
    throw new Error('TEST 6 FAILED: Completed ride older than 30 days should be deleted from active collection');
  }

  const rArchivedSnap = await db.collection('archivedRides').doc(rideArchiveId).get();
  if (!rArchivedSnap.exists) {
    throw new Error('TEST 6 FAILED: Completed ride older than 30 days was not archived');
  }
  console.log('  ✅ VERIFIED: Completed ride older than 30 days moved to archives.');

  // =========================================================================
  // 🧪 TEST 7: Notifications Purge (> 90 Days)
  // =========================================================================
  console.log('\n🧪 TEST 7: Notifications Purge (> 90 Days)');

  // Create a mock user notification document older than 90 days
  const oldNotifId = `old_notif_${suffix}`;
  const notifRef = db.collection('users').doc(passengerId).collection('notifications').doc(oldNotifId);
  await notifRef.set({
    id: oldNotifId,
    userId: passengerId,
    type: 'general',
    title: 'Old alert',
    message: 'This is older than 90 days',
    read: true,
    createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 91 * 24 * 60 * 60 * 1000)), // 91 days ago
  });

  // Trigger sweep
  console.log('  Triggering /process-reminders (notifications purge)...');
  await postJson('/api/otp/process-reminders', {});

  // Verify deleted
  const notifSnap = await notifRef.get();
  if (notifSnap.exists) {
    throw new Error('TEST 7 FAILED: Notification older than 90 days was not deleted');
  }
  console.log('  ✅ VERIFIED: Old notifications are successfully purged.');
}

async function cleanupAll(db: admin.firestore.Firestore) {
  console.log('\n🧹 Cleaning up test documents from Firestore staging...');
  
  // Clean custom subcollections
  for (const id of [passengerId]) {
    try {
      const qSnap = await db.collection('users').doc(id).collection('notifications').get();
      const batch = db.batch();
      qSnap.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
    } catch (e) {}
  }

  // Delete seeded docs
  for (const docPath of docsToCleanup) {
    try {
      await db.doc(docPath).delete();
      console.log(`  Deleted document: ${docPath}`);
    } catch (e: any) {
      console.warn(`  Failed to delete document ${docPath}:`, e.message);
    }
  }

  // Delete from archival collections
  for (const col of collectionsToCleanup) {
    try {
      const snap = await db.collection(col).get();
      const batch = db.batch();
      snap.docs.forEach((doc) => {
        if (doc.id.includes(suffix)) {
          batch.delete(doc.ref);
          console.log(`  Cleaned archive: ${col}/${doc.id}`);
        }
      });
      await batch.commit();
    } catch (e) {}
  }

  // Close Express server
  if (server) {
    server.close(() => {
      console.log('🔌 Test Express server stopped');
    });
  }
}

// Start testing
runLifecycleTests();
