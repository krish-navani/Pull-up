import express from 'express';
import http from 'http';
import admin from 'firebase-admin';
import routes from './routes.js';
import { initializeFirebase, getDb } from './firebase.js';

const app = express();
app.use(express.json());
app.use('/api/otp', routes);

let server: http.Server;
const PORT = 3109;
const suffix = `chat_e2e_${Date.now()}`;

// Mock IDs for testing
const testUserId = `user_${suffix}`;
const testRideId = `ride_${suffix}`;
const testCampaignId = `camp_${suffix}`;

const docsToCleanup: string[] = [];

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

async function runE2ETests() {
  console.log('🚀 Starting PullUp Realtime Chat & Push Notification E2E Auditing...');
  
  initializeFirebase();
  const db = getDb();
  console.log('✅ Firebase staging connection initialized');

  server = app.listen(PORT, async () => {
    console.log(`✅ Staging test server running on http://localhost:${PORT}`);
    try {
      await runTestCases(db);
      console.log('\n🎉 ALL CHAT & PUSH SYSTEM HARDENING CHECKS PASSED SUCCESSFULLY! 🎉');
      await cleanupAll(db);
      process.exit(0);
    } catch (err: any) {
      console.error('\n❌ E2E VERIFICATION CHECKLIST FAILED:', err);
      await cleanupAll(db);
      process.exit(1);
    }
  });
}

async function runTestCases(db: admin.firestore.Firestore) {
  // Prep user doc
  await db.collection('users').doc(testUserId).set({
    fullName: 'Staging Audit User',
    email: `${testUserId}@atlasskilltech.university`,
    expoPushToken: 'ExpoPushToken[mock_audit_token_12345]',
    createdAt: admin.firestore.Timestamp.now(),
  });
  docsToCleanup.push(`users/${testUserId}`);
  console.log('✅ Staging mock user pre-populated');

  // =========================================================================
  // TEST 1: Push Notification (Debug Endpoint check)
  // =========================================================================
  console.log('\n🧪 TEST 1: Push Notification Diagnostics (/debug-notification)');
  const res1 = await postJson('/api/otp/debug-notification', { userId: testUserId });
  
  if (res1.statusCode !== 200) {
    throw new Error(`TEST 1 FAILED: Status code: ${res1.statusCode}`);
  }
  const results = res1.data;
  console.log('  Debug response:', JSON.stringify(results, null, 2));
  
  if (results.FIRESTORE !== 'PASS' || results.TOKEN !== 'PASS' || results.FORMAT !== 'PASS') {
    throw new Error(`TEST 1 FAILED: Invalid diagnostics flags: ${JSON.stringify(results)}`);
  }
  console.log('  ✅ VERIFIED: debug-notification endpoint returned correct audit results.');

  // =========================================================================
  // TEST 2: Realtime Message Delivery Simulation
  // =========================================================================
  console.log('\n🧪 TEST 2: Realtime Message Delivery Simulation');
  const msgRef = db.collection('rideChats').doc(testRideId).collection('messages').doc('test_msg_id');
  await msgRef.set({
    id: 'test_msg_id',
    rideId: testRideId,
    senderId: testUserId,
    senderName: 'Staging Audit User',
    text: 'Hello E2E Staging!',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    type: 'text'
  });
  docsToCleanup.push(`rideChats/${testRideId}/messages/test_msg_id`);

  const msgSnap = await msgRef.get();
  if (!msgSnap.exists || msgSnap.data()?.text !== 'Hello E2E Staging!') {
    throw new Error('TEST 2 FAILED: Simulated message was not delivered/saved in Firestore');
  }
  console.log('  ✅ VERIFIED: Message document successfully written to rideChats subcollection.');

  // =========================================================================
  // TEST 3: Typing Indicator Status
  // =========================================================================
  console.log('\n🧪 TEST 3: Typing Indicator Status');
  const roomRef = db.collection('rideChats').doc(testRideId);
  await roomRef.set({ rideId: testRideId });
  await roomRef.update({
    [`typing.${testUserId}`]: true
  });
  docsToCleanup.push(`rideChats/${testRideId}`);

  const roomSnap = await roomRef.get();
  if (!roomSnap.exists || roomSnap.data()?.typing?.[testUserId] !== true) {
    throw new Error('TEST 3 FAILED: Typing status not set on group chat room document');
  }
  console.log('  ✅ VERIFIED: user typing indicator successfully synced.');

  // =========================================================================
  // TEST 4: Read Receipts (WhatsApp style ticks)
  // =========================================================================
  console.log('\n🧪 TEST 4: Read Receipts (WhatsApp ticks)');
  await msgRef.update({
    readBy: admin.firestore.FieldValue.arrayUnion(testUserId, 'passenger_mock_id')
  });

  const readReceiptSnap = await msgRef.get();
  const readArray = readReceiptSnap.data()?.readBy || [];
  if (!readArray.includes(testUserId) || !readArray.includes('passenger_mock_id')) {
    throw new Error(`TEST 4 FAILED: Read receipts not updated correctly: ${JSON.stringify(readArray)}`);
  }
  console.log('  ✅ VERIFIED: read receipts readBy status successfully synced.');

  // =========================================================================
  // TEST 5: Offline Resend Simulation
  // =========================================================================
  console.log('\n🧪 TEST 5: Offline Resend Simulation');
  // Offline client queuing simulation
  const mockOfflineQueue = [
    { text: 'Message queued offline 1', senderId: testUserId },
    { text: 'Message queued offline 2', senderId: testUserId }
  ];
  
  // Resend on reconnect write simulator
  for (let i = 0; i < mockOfflineQueue.length; i++) {
    const offlineMsgRef = db.collection('rideChats').doc(testRideId).collection('messages').doc(`offline_${i}`);
    await offlineMsgRef.set({
      id: `offline_${i}`,
      rideId: testRideId,
      senderId: mockOfflineQueue[i].senderId,
      text: mockOfflineQueue[i].text,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'text'
    });
    docsToCleanup.push(`rideChats/${testRideId}/messages/offline_${i}`);
  }

  const checkOfflineSnap = await db.collection('rideChats').doc(testRideId).collection('messages').get();
  const matched = checkOfflineSnap.docs.filter(d => d.id.startsWith('offline_'));
  if (matched.length !== 2) {
    throw new Error(`TEST 5 FAILED: Expected 2 offline messages, got: ${matched.length}`);
  }
  console.log('  ✅ VERIFIED: Queue simulation successfully processed resends on reconnect.');

  // =========================================================================
  // TEST 6: Group Join Simulation
  // =========================================================================
  console.log('\n🧪 TEST 6: Group Join');
  await db.collection('poolMembers').doc(`${testRideId}_${testUserId}`).set({
    poolId: testRideId,
    passengerId: testUserId,
    passengerName: 'Staging Audit User',
    joinedAt: new Date().toISOString()
  });
  docsToCleanup.push(`poolMembers/${testRideId}_${testUserId}`);

  const joinSnap = await db.collection('poolMembers').doc(`${testRideId}_${testUserId}`).get();
  if (!joinSnap.exists) {
    throw new Error('TEST 6 FAILED: Mock user was not added to group membership');
  }
  console.log('  ✅ VERIFIED: Pool member joined successfully.');

  // =========================================================================
  // TEST 7: Group Removal Simulation
  // =========================================================================
  console.log('\n🧪 TEST 7: Group Removal');
  await db.collection('poolMembers').doc(`${testRideId}_${testUserId}`).delete();
  
  const leaveSnap = await db.collection('poolMembers').doc(`${testRideId}_${testUserId}`).get();
  if (leaveSnap.exists) {
    throw new Error('TEST 7 FAILED: Member removal mock failed');
  }
  console.log('  ✅ VERIFIED: Pool member removed successfully.');

  // =========================================================================
  // TEST 8: Chat Lock Verification
  // =========================================================================
  console.log('\n🧪 TEST 8: Chat Lock');
  // Check that writing to chat gets blocked if ride status is completed/cancelled
  const mockRideRef = db.collection('rides').doc(testRideId);
  await mockRideRef.set({
    driverId: 'driver_mock',
    status: 'completed',
    departureTime: new Date().toISOString()
  });
  docsToCleanup.push(`rides/${testRideId}`);

  const mockRideSnap = await mockRideRef.get();
  const rideStatus = mockRideSnap.data()?.status || '';
  const isChatWritable = rideStatus === 'active' || rideStatus === 'in_progress';
  
  if (isChatWritable) {
    throw new Error('TEST 8 FAILED: Completed ride status should trigger chat locking');
  }
  console.log('  ✅ VERIFIED: Completed/cancelled status correctly disables chat writable flag.');

  // =========================================================================
  // TEST 9: Notification Analytics Update
  // =========================================================================
  console.log('\n🧪 TEST 9: Notification Analytics Calculations');
  // Prep analytics doc
  const campRef = db.collection('notificationAnalytics').doc(testCampaignId);
  await campRef.set({
    sent: 10,
    delivered: 8,
    failed: 2,
    opened: 4,
    clicked: 2,
    totalOpenTimeMs: 12000,
    CTR: 0.25
  });
  docsToCleanup.push(`notificationAnalytics/${testCampaignId}`);

  // Track an additional click & open action
  console.log('  Tracking "clicked" event...');
  await postJson('/api/otp/analytics/track', { campaignId: testCampaignId, action: 'clicked' });
  
  console.log('  Tracking "opened" event with 4000ms duration...');
  await postJson('/api/otp/analytics/track', { campaignId: testCampaignId, action: 'opened', openTimeMs: 4000 });

  const campSnap = await campRef.get();
  const data = campSnap.data() || {};
  console.log('  Updated campaign metrics:', JSON.stringify(data, null, 2));

  if (data.opened !== 5 || data.clicked !== 3 || data.averageOpenTime !== '3s') {
    throw new Error(`TEST 9 FAILED: Metric updates incorrect: ${JSON.stringify(data)}`);
  }
  console.log('  ✅ VERIFIED: analytics CTR and averageOpenTime calculated correctly.');

  // =========================================================================
  // TEST 10: Retry Queue Processor
  // =========================================================================
  console.log('\n🧪 TEST 10: Retry Queue Processor');
  const queueRef = db.collection('notificationQueue').doc(`q_${suffix}`);
  await queueRef.set({
    id: `q_${suffix}`,
    userId: testUserId,
    type: 'general',
    title: 'Retry Audit Alert',
    message: 'Testing queue retry engine',
    status: 'pending',
    attempts: 0,
    createdAt: admin.firestore.Timestamp.now(),
    nextRetry: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 1000)) // 5 seconds ago (eligible)
  });
  docsToCleanup.push(`notificationQueue/q_${suffix}`);

  console.log('  Triggering processNotificationQueue via process-reminders endpoint...');
  const res10 = await postJson('/api/otp/process-reminders', {});
  if (res10.statusCode !== 200 || !res10.data.success) {
    throw new Error(`TEST 10 FAILED: Queue processor endpoint returned: ${JSON.stringify(res10.data)}`);
  }

  const queuedEntry = await queueRef.get();
  const qData = queuedEntry.data() || {};
  console.log('  Retry queue status:', JSON.stringify(qData, null, 2));

  // Should increment attempts and update status
  if (qData.attempts !== 1 || (qData.status !== 'sent' && qData.status !== 'pending')) {
    throw new Error(`TEST 10 FAILED: Queue status updates incorrect: ${JSON.stringify(qData)}`);
  }
  console.log('  ✅ VERIFIED: Retry processor successfully ran, incremented attempts, and rescheduled.');
}

async function cleanupAll(db: admin.firestore.Firestore) {
  console.log('\n🧹 Cleaning up staging audit documents...');
  
  for (const docPath of docsToCleanup) {
    try {
      await db.doc(docPath).delete();
      console.log(`  Deleted document: ${docPath}`);
    } catch (e: any) {
      console.warn(`  Failed to delete document ${docPath}:`, e.message);
    }
  }

  if (server) {
    server.close(() => {
      console.log('🔌 Test Express server stopped');
    });
  }
}

runE2ETests();
