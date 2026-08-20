const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');

// Client SDK Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDAH_IkC3mEa0I3K58YZ6NnnCNWH7u7v98",
  authDomain: "pullup-production.firebaseapp.com",
  projectId: "pullup-production",
  storageBucket: "pullup-production.firebasestorage.app",
  messagingSenderId: "286433202099",
  appId: "1:286433202099:web:e2b0d38e845d50bc3005c6",
};

const clientApp = initializeApp(firebaseConfig);
const clientAuth = getAuth(clientApp);
const clientDb = getFirestore(clientApp);

const TEST_EMAIL = 'fresh.signup.btech2028@atlasskilltech.university';
const TEST_OTP = '9999';

async function forensicTrace(operation, collectionName, docId, payload, fn) {
  const currentAuthUid = clientAuth.currentUser?.uid || 'NULL';
  
  console.log(`[FORENSIC-TRACE] === START FIRESTORE CALL ===`);
  console.log(`[FORENSIC-TRACE] Operation: ${operation}`);
  console.log(`[FORENSIC-TRACE] Collection: ${collectionName}`);
  console.log(`[FORENSIC-TRACE] Document ID: ${docId || 'N/A'}`);
  console.log(`[FORENSIC-TRACE] Authenticated Firebase UID: ${currentAuthUid}`);
  console.log(`[FORENSIC-TRACE] request.auth.uid: ${currentAuthUid}`);
  console.log(`[FORENSIC-TRACE] User Document ID: ${docId || 'N/A'}`);
  console.log(`[FORENSIC-TRACE] Request Payload:`, JSON.stringify(payload, null, 2));
  
  try {
    const result = await fn();
    console.log(`[FORENSIC-TRACE] Result: SUCCESS ✅`);
    console.log(`[FORENSIC-TRACE] === END FIRESTORE CALL ===`);
    return result;
  } catch (error) {
    console.log(`[FORENSIC-TRACE] Result: FAILED ❌`);
    console.log(`[FORENSIC-TRACE] Exact Exception: ${error?.name || 'Error'} - ${error?.message || error}`);
    console.log(`[FORENSIC-TRACE] Exception JSON:`, JSON.stringify(error));
    console.log(`[FORENSIC-TRACE] Complete Stack Trace:\n`, error?.stack || new Error().stack);
    console.log(`[FORENSIC-TRACE] === END FIRESTORE CALL ===`);
    throw error;
  }
}

async function main() {
  console.log('Signing in anonymously client-side...');
  const userCredential = await signInAnonymously(clientAuth);
  const anonUid = userCredential.user.uid;
  console.log(`✅ Client authenticated, UID: ${anonUid}`);

  // Operation 2: Sync Session
  console.log(`\n--- Simulating syncUserSession ---`);
  const sessionRef = doc(clientDb, 'userSessions', anonUid);
  const sessionPayload = {
    userId: anonUid,
    updatedAt: new Date().toISOString()
  };
  try {
    await forensicTrace('setDoc', 'userSessions', anonUid, sessionPayload, () =>
      setDoc(sessionRef, sessionPayload)
    );
  } catch (err) {
    console.error('syncUserSession simulation threw error.');
    return;
  }

  // Operation 3: Create User Document
  console.log(`\n--- Simulating createUserDocument ---`);
  const userDocRef = doc(clientDb, 'users', anonUid);
  const userPayload = {
    id: anonUid,
    email: TEST_EMAIL,
    fullName: 'Test Onboarding User',
    phone: '9999999999',
    year: 'First Year',
    course: 'BTech',
    division: 'A',
    role: 'passenger',
    profileImage: null,
    homeAddress: {
      address: 'Atlas SkillTech University, Mumbai',
      latitude: 19.0707255,
      longitude: 72.8752988,
      city: 'Mumbai'
    },
    licenseVerified: false,
    profileComplete: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await forensicTrace('setDoc', 'users', anonUid, userPayload, () =>
      setDoc(userDocRef, userPayload)
    );
    console.log('✅ User document created successfully!');
  } catch (err) {
    console.error('createUserDocument simulation threw error.');
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
