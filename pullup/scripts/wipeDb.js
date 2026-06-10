const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, writeBatch } = require('firebase/firestore');

// Load environment variables manually from .env
const envPath = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found at:', envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const parts = trimmed.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    env[key] = val;
  }
});

const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

console.log('🔄 Initializing Firebase app with Project ID:', firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const collectionsToWipe = [
  'rides',
  'bookings',
  'taxiPools',
  'poolRequests',
  'poolMembers',
  'notifications'
];

async function runWipe() {
  try {
    let totalDeleted = 0;

    // 1. Wipe standard collections
    for (const colName of collectionsToWipe) {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      console.log(`[RESET DB] Found ${snapshot.size} documents in collection '${colName}'`);
      
      if (snapshot.size > 0) {
        const batch = writeBatch(db);
        snapshot.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
          totalDeleted++;
        });
        await batch.commit();
        console.log(`[RESET DB] ✅ Wiped collection '${colName}'`);
      }
    }

    // 2. Wipe chatRooms and messages subcollection
    const chatRoomsRef = collection(db, 'chatRooms');
    const chatRoomsSnapshot = await getDocs(chatRoomsRef);
    console.log(`[RESET DB] Found ${chatRoomsSnapshot.size} chat rooms`);

    for (const roomDoc of chatRoomsSnapshot.docs) {
      const messagesRef = collection(db, 'chatRooms', roomDoc.id, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      
      if (messagesSnapshot.size > 0) {
        const batch = writeBatch(db);
        messagesSnapshot.docs.forEach((msgDoc) => {
          batch.delete(msgDoc.ref);
          totalDeleted++;
        });
        await batch.commit();
      }

      await deleteDoc(roomDoc.ref);
      totalDeleted++;
    }
    console.log('[RESET DB] ✅ Wiped chatRooms and messages');

    console.log(`🎉 Database wipe completed. Total documents deleted: ${totalDeleted}`);
  } catch (error) {
    console.error('❌ Failed to wipe Firestore database:', error);
  }
}

runWipe();
