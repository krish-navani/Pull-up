import dotenv from 'dotenv';
import path from 'path';
import admin from 'firebase-admin';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();

async function main() {
  const sessionDoc = await db.collection('userSessions').doc('csvKsIOILhMtcSiQW8pD57rVijU2').get();
  console.log('userSessions/csvKsIOILhMtcSiQW8pD57rVijU2 exists?', sessionDoc.exists);
  if (sessionDoc.exists) {
    console.log('userSessions data:', sessionDoc.data());
  }

  const userDoc = await db.collection('users').doc('csvKsIOILhMtcSiQW8pD57rVijU2').get();
  console.log('users/csvKsIOILhMtcSiQW8pD57rVijU2 exists?', userDoc.exists);
  if (userDoc.exists) {
    console.log('user email:', userDoc.data()?.email);
  }
}

main().catch(console.error);
