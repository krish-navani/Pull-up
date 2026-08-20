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

async function main() {
  console.log('--- USERS ---');
  const usersSnap = await db.collection('users').get();
  console.log(`Total users in collection: ${usersSnap.size}`);
  usersSnap.forEach(doc => {
    console.log(`ID: ${doc.id}`);
    console.log(`Email: ${doc.data().email}`);
    console.log(`Role: ${doc.data().role}`);
    console.log(`profileComplete: ${doc.data().profileComplete}`);
    console.log(`licenseVerified: ${doc.data().licenseVerified}`);
    console.log('---');
  });

  console.log('\n--- SESSIONS ---');
  const sessionsSnap = await db.collection('userSessions').get();
  console.log(`Total sessions in collection: ${sessionsSnap.size}`);
  sessionsSnap.forEach(doc => {
    console.log(`Session UID (Session ID): ${doc.id} -> User ID: ${doc.data().userId}`);
  });
}

main().catch(console.error);
