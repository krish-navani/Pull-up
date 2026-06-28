import { initializeFirebase, getDb } from './firebase.js';
// @ts-ignore
import fetch from 'node-fetch';

async function auditExpoReceipt() {
  console.log('--------------------------------------------------');
  console.log('🚀 EXPO PUSH NOTIFICATION & RECEIPT AUDIT RUNNER');
  console.log('--------------------------------------------------');

  initializeFirebase();
  const db = getDb();

  let pushToken = '';
  let userId = '';

  const usersSnap = await db.collection('users').get();
  usersSnap.forEach(doc => {
    const data = doc.data();
    if (data.expoPushToken && data.expoPushToken.startsWith('ExponentPushToken[')) {
      pushToken = data.expoPushToken;
      userId = doc.id;
    }
  });

  if (!pushToken) {
    console.log('ℹ️ No real ExponentPushToken[...] found in Firestore users. Using standard valid ExponentPushToken structure...');
    pushToken = 'ExponentPushToken[1234567890abcdef123456]';
  } else {
    console.log(`📱 REAL EXPO PUSH USER FOUND: userId=${userId}, token=${pushToken}`);
  }

  const pushPayload = {
    to: pushToken,
    title: 'Live Receipt Forensic Test 🧪',
    body: 'Verifying Expo push ticket delivery and 20s receipt status',
    sound: 'default',
    badge: 1,
    priority: 'high',
    data: { testId: 'audit_' + Date.now() }
  };

  console.log('\n[STEP 1] Sending Push Notification to Expo Gateway...');
  console.log('Request Payload:', JSON.stringify(pushPayload, null, 2));

  const sendRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pushPayload)
  });

  const sendData: any = await sendRes.json();
  console.log('\n[STEP 2] Expo Send Response:');
  console.log(JSON.stringify(sendData, null, 2));

  const ticket = Array.isArray(sendData?.data) ? sendData.data[0] : sendData?.data;
  const ticketId = ticket?.id;

  if (!ticketId) {
    console.log('\n⚠️ Expo returned status:', ticket?.status, 'message:', ticket?.message);
    if (ticket?.details) {
      console.log('Ticket Details:', JSON.stringify(ticket.details, null, 2));
    }
    process.exit(0);
  }

  console.log(`\n🎟️ OBTAINED EXPO TICKET ID: ${ticketId}`);
  console.log('⏳ Waiting 20 seconds for Expo & downstream FCM/APNs relay to process receipt...');

  for (let i = 20; i > 0; i--) {
    process.stdout.write(`...waiting ${i}s \r`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\n✅ 20 seconds elapsed. Calling Expo Receipts API...');

  const receiptPayload = { ids: [ticketId] };
  console.log('\n[STEP 3] Fetching Receipt from https://exp.host/--/api/v2/push/getReceipts...');
  console.log('Request Payload:', JSON.stringify(receiptPayload, null, 2));

  const receiptRes = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(receiptPayload)
  });

  const receiptData = await receiptRes.json();

  console.log('\n==================================================');
  console.log('📄 FULL EXPO RECEIPT JSON RESPONSE');
  console.log('==================================================');
  console.log(JSON.stringify(receiptData, null, 2));
  console.log('==================================================\n');

  process.exit(0);
}

auditExpoReceipt().catch(err => {
  console.error('❌ Audit script failed:', err);
  process.exit(1);
});
