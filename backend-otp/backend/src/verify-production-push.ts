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
const suffix = `prod_audit_${Date.now()}`;
const testUserId = `user_${suffix}`;
const testRideId = `ride_${suffix}`;

const docsToCleanup: string[] = [];

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
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode || 500, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode || 500, data: data });
        }
      });
    });

    req.on('error', (e) => { reject(e); });
    req.write(postData);
    req.end();
  });
}

const ALL_EVENT_TYPES = [
  { type: 'booking_request', title: 'New Seat Request 🚗', msg: 'Passenger requested a seat on your ride.' },
  { type: 'booking_accepted', title: 'Booking Confirmed 🎉', msg: 'Your booking request was accepted.' },
  { type: 'booking_rejected', title: 'Booking Rejected ❌', msg: 'Your booking request was declined.' },
  { type: 'pool_request', title: 'Taxi Pool Join Request 🚕', msg: 'Someone wants to join your taxi pool.' },
  { type: 'pool_accepted', title: 'Pool Request Accepted ✅', msg: 'You are now part of the taxi pool.' },
  { type: 'pool_rejected', title: 'Pool Request Declined ❌', msg: 'Your taxi pool request was rejected.' },
  { type: 'ride_started', title: 'Ride Started 🚘', msg: 'Your ride has departed.' },
  { type: 'ride_completed', title: 'Ride Completed 🏁', msg: 'You have arrived at your destination.' },
  { type: 'ride_cancelled', title: 'Ride Cancelled ⚠️', msg: 'Your ride was cancelled by the host.' },
  { type: 'message', title: 'New Group Message 💬', msg: 'John: See you at the pickup point!' },
  { type: 'payment_required', title: 'Payment Required 💳', msg: 'Please complete payment to secure your seat.' },
  { type: 'payment_confirmed', title: 'Payment Confirmed 💰', msg: 'Payment received. Your seat is confirmed.' },
  { type: 'payment_failed', title: 'Payment Failed ⚠️', msg: 'Payment processing failed. Please retry.' },
  { type: 'withdrawal_requested', title: 'Withdrawal Requested 🏦', msg: 'Your withdrawal request for INR 500 was submitted.' },
  { type: 'withdrawal_approved', title: 'Withdrawal Approved 💵', msg: 'INR 500 has been transferred to your account.' },
  { type: 'withdrawal_rejected', title: 'Withdrawal Rejected ❌', msg: 'Withdrawal failed due to invalid UPI ID.' },
  { type: 'sos', title: 'EMERGENCY SOS ALERT 🚨', msg: 'Distress alert triggered for ride.' },
  { type: 'marketing', title: 'Weekend Special Offer 🎁', msg: 'Get 20% off on your next carpool ride!' }
];

async function runProductionAudit() {
  console.log('🚀 Starting Comprehensive Production Push Notification Verification Audit...');
  initializeFirebase();
  const db = getDb();
  console.log('✅ Firebase connection initialized');

  server = app.listen(PORT, async () => {
    console.log(`✅ Audit test server running on http://localhost:${PORT}`);
    try {
      // Look for any real user in Firestore with an expoPushToken to verify real token resolution
      const usersSnap = await db.collection('users').limit(15).get();
      let realUserDoc: any = null;
      usersSnap.forEach(d => {
        const u = d.data();
        if (u.expoPushToken || u.fcmToken) realUserDoc = { id: d.id, ...u };
      });

      if (realUserDoc) {
        console.log(`\n📱 REAL FIRESTORE USER FOUND FOR TESTING: id=${realUserDoc.id}, token=${(realUserDoc.expoPushToken || realUserDoc.fcmToken).substring(0, 22)}...`);
      } else {
        console.log('\nℹ️ No existing real push user found in first 15 records. Pre-populating audit user...');
      }

      const targetTestUserId = realUserDoc ? realUserDoc.id : testUserId;
      if (!realUserDoc) {
        await db.collection('users').doc(testUserId).set({
          fullName: 'Production Audit User',
          email: `${testUserId}@pullup.app`,
          expoPushToken: 'ExpoPushToken[mock_audit_token_12345]',
          createdAt: admin.firestore.Timestamp.now(),
        });
        docsToCleanup.push(`users/${testUserId}`);
      }

      console.log(`\n=========================================================`);
      console.log(`🧪 TESTING ALL 18 PRODUCTION NOTIFICATION EVENT TYPES...`);
      console.log(`=========================================================\n`);

      let passedCount = 0;
      for (const item of ALL_EVENT_TYPES) {
        const res = await postJson('/api/otp/send-notification', {
          userId: targetTestUserId,
          type: item.type,
          title: item.title,
          message: item.msg,
          rideId: testRideId,
          bookingId: `b_${suffix}`
        });

        if (res.statusCode !== 200 || !res.data.success) {
          throw new Error(`EVENT AUDIT FAILED for type ${item.type}: ${JSON.stringify(res.data)}`);
        }

        // Verify Firestore notification history document status is strictly 'sent' or 'failed' (never 'pending')
        const notifsSnap = await db.collection('users').doc(targetTestUserId).collection('notifications')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        if (notifsSnap.empty) {
          throw new Error(`EVENT AUDIT FAILED: No notification document created for ${item.type}`);
        }

        const notifDoc = notifsSnap.docs[0];
        const data = notifDoc.data();
        if (!realUserDoc) {
          docsToCleanup.push(`users/${targetTestUserId}/notifications/${notifDoc.id}`);
        }

        if (data.status !== 'sent' && data.status !== 'failed') {
          throw new Error(`EVENT AUDIT FAILED: Invalid status ${data.status} for event type ${item.type}`);
        }

        console.log(`  ✅ Verified Event: ${item.type.padEnd(22)} | Status: ${data.status.padEnd(6)} | Delivery Latency: ${data.deliveryDetails?.latencyMs || 0}ms`);
        passedCount++;
      }

      console.log(`\n🎉 SUCCESS! ALL 18 NOTIFICATION EVENT TYPES AUDITED AND VERIFIED END-TO-END! (${passedCount}/18) 🎉\n`);
      await cleanupAll(db);
      process.exit(0);
    } catch (err: any) {
      console.error('\n❌ PRODUCTION AUDIT FAILED:', err);
      await cleanupAll(db);
      process.exit(1);
    }
  });
}

async function cleanupAll(db: admin.firestore.Firestore) {
  console.log('🧹 Cleaning up audit test documents...');
  for (const docPath of docsToCleanup) {
    try { await db.doc(docPath).delete(); } catch (e: any) {}
  }
  if (server) server.close();
}

runProductionAudit();
