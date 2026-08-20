import dotenv from 'dotenv';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import http from 'http';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Client Firebase config matching app
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'pullup-production',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const USER_ID = 'csvKsIOILhMtcSiQW8pD57rVijU2';

async function getCustomToken(userId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ userId });
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/otp/refresh-custom-token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const json = JSON.parse(data);
          if (json.success && json.firebaseToken) {
            resolve(json.firebaseToken);
          } else {
            reject(new Error(json.message || 'Failed to get token'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTest() {
  console.log('\n=== TESTING FIRESTORE PERMISSIONS WITH CUSTOM TOKEN ===');
  console.log('User ID:', USER_ID);

  try {
    console.log('\n1. Fetching custom token from backend...');
    const customToken = await getCustomToken(USER_ID);
    console.log('✅ Custom token received!');

    console.log('\n2. Signing in with Custom Token via Client Firebase Auth...');
    const userCred = await signInWithCustomToken(auth, customToken);
    console.log('✅ Signed in successfully! Auth UID:', userCred.user.uid, '| isAnonymous:', userCred.user.isAnonymous);

    console.log('\n3. Testing Firestore READ on users/' + USER_ID + '...');
    const userRef = doc(db, 'users', USER_ID);
    const userSnap = await getDoc(userRef);
    console.log('✅ READ user document SUCCESS! Exists?', userSnap.exists(), '| Email:', userSnap.data()?.email);

    console.log('\n4. Testing Firestore UPDATE on users/' + USER_ID + ' (updating lastTokenRefresh)...');
    await updateDoc(userRef, {
      lastTokenRefresh: new Date().toISOString(),
    });
    console.log('✅ UPDATE user document SUCCESS! (No permission-denied error)');

    console.log('\n5. Testing Firestore READ on notifications subcollection...');
    const notifRef = collection(db, 'users', USER_ID, 'notifications');
    const notifSnap = await getDocs(notifRef);
    console.log('✅ READ notifications SUCCESS! Total docs:', notifSnap.size);

    console.log('\n6. Testing Firestore READ on rideChats...');
    const rideChatsRef = collection(db, 'rideChats');
    const rideChatsSnap = await getDocs(rideChatsRef);
    console.log('✅ READ rideChats SUCCESS! Total docs:', rideChatsSnap.size);

    console.log('\n🎉 ALL FIRESTORE PERMISSIONS VERIFIED SUCCESSFULLY WITH NO ERRORS!\n');
  } catch (err: any) {
    console.error('\n❌ FIRESTORE PERMISSION TEST FAILED:', err.code, err.message, err.stack);
  }
}

runTest().catch(console.error);
