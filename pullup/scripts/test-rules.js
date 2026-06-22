const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDoc, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDAH_IkC3mEa0I3K58YZ6NnnCNWH7u7v98",
  authDomain: "pullup-production.firebaseapp.com",
  projectId: "pullup-production",
  storageBucket: "pullup-production.firebasestorage.app",
  messagingSenderId: "286433202099",
  appId: "1:286433202099:web:e2b0d38e845d50bc3005c6",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const runTest = async () => {
  console.log('1. Signing in anonymously...');
  const userCredential = await signInAnonymously(auth);
  const anonUid = userCredential.user.uid;
  console.log(`✅ Signed in anonymously with UID: ${anonUid}`);

  const targetUserId = 'TB1UCx0IZJdOkKZzBYJ0prbWy3s2';
  const rideId = 'sulIJEVVlmNzvdpP94Vg';

  // Try writing session mapping
  console.log(`\n2. Writing session mapping: userSessions/${anonUid} -> ${targetUserId}...`);
  try {
    const sessionRef = doc(db, 'userSessions', anonUid);
    await setDoc(sessionRef, {
      userId: targetUserId,
      updatedAt: new Date().toISOString(),
    });
    console.log('✅ Session mapping written successfully!');
  } catch (error) {
    console.error('❌ Failed to write session mapping:', error.message);
  }

  // Try reading the session mapping we just wrote
  console.log(`\n3. Verifying we can read userSessions/${anonUid}...`);
  try {
    const sessionDoc = await getDoc(doc(db, 'userSessions', anonUid));
    console.log(`✅ Read session document:`, sessionDoc.data());
  } catch (error) {
    console.error('❌ Failed to read session mapping:', error.message);
  }

  // Try reading the user profile
  console.log(`\n4. Reading users/${targetUserId}...`);
  try {
    const userDoc = await getDoc(doc(db, 'users', targetUserId));
    console.log(`✅ Read user doc:`, userDoc.exists() ? 'Found' : 'Not Found');
  } catch (error) {
    console.error('❌ Failed to read user doc:', error.message);
  }

  // Try reading the ride chat room
  console.log(`\n5. Reading rideChats/${rideId}...`);
  try {
    const chatDoc = await getDoc(doc(db, 'rideChats', rideId));
    console.log(`✅ Read ride chat room:`, chatDoc.exists() ? 'Found' : 'Not Found', chatDoc.data());
  } catch (error) {
    console.error('❌ Failed to read ride chat:', error.message);
  }
};

runTest().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
