require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const http = require('http');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken } = require('firebase/auth');
const { getFirestore, doc, getDoc, updateDoc, collection, getDocs } = require('firebase/firestore');

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

function getCustomToken(userId) {
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
          try {
            const json = JSON.parse(data);
            if (json.success && json.firebaseToken) {
              resolve(json.firebaseToken);
            } else {
              reject(new Error(json.message || 'Failed to get token'));
            }
          } catch (e) {
            reject(e);
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

    const { setDoc: setDocSession, doc: docSession } = require('firebase/firestore');
    await setDocSession(docSession(db, 'userSessions', USER_ID), { userId: USER_ID });
    console.log('✅ userSessions doc created/synced!');

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

    console.log('\n6. Testing Firestore READ on rides collection...');
    const ridesRef = collection(db, 'rides');
    const ridesSnap = await getDocs(ridesRef);
    console.log('✅ READ rides collection SUCCESS! Total active rides:', ridesSnap.size);

    console.log('\n7. Testing Firestore READ on rideChats with participants filter...');
    const { query: queryFS, where: whereFS } = require('firebase/firestore');
    const rideChatsRef = collection(db, 'rideChats');
    const qChats = queryFS(rideChatsRef, whereFS('participants', 'array-contains', USER_ID));
    const rideChatsSnap = await getDocs(qChats);
    console.log('✅ READ rideChats with participants filter SUCCESS! Total chats:', rideChatsSnap.size);

    console.log('\n🎉 ALL FIRESTORE PERMISSIONS VERIFIED SUCCESSFULLY WITH NO ERRORS!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ FIRESTORE PERMISSION TEST FAILED:', err.code || '', err.message || err);
    process.exit(1);
  }
}

runTest();
