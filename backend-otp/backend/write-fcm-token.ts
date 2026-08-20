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
const REAL_FCM_TOKEN = 'feyRuCFSQyCICYUqbmgvud:APA91bHCKzabnIje7fmghWV-KRMowkO3pp44Ayh7XLpItM32-oUouL91Af6bVitw9lI67uZDJrZGut0LD1lnVheFu65Xe6459A8cfAckjvWs3FaJ47dVKOE';
const USER_ID = 'csvKsIOILhMtcSiQW8pD57rVijU2';

async function main() {
  console.log(`Writing real FCM token for user: ${USER_ID}`);
  console.log(`Token: ${REAL_FCM_TOKEN.substring(0, 30)}...`);

  await db.collection('users').doc(USER_ID).update({
    fcmToken: REAL_FCM_TOKEN,
    expoPushToken: null,
    lastTokenRefresh: admin.firestore.Timestamp.now(),
  });

  const doc = await db.collection('users').doc(USER_ID).get();
  const data = doc.data() || {};
  console.log('\n✅ Firestore updated successfully!');
  console.log('  fcmToken:', data.fcmToken?.substring(0, 30) + '...');
  console.log('  expoPushToken:', data.expoPushToken);
}

main().catch(console.error);
