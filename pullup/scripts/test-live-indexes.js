const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDocs, collection, query, where, orderBy, collectionGroup } = require('firebase/firestore');

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
  console.log(`✅ Signed in with UID: ${anonUid}`);

  const testUserId = 'TB1UCx0IZJdOkKZzBYJ0prbWy3s2';

  // Session mapping
  console.log(`\n2. Writing session mapping: userSessions/${anonUid} -> ${testUserId}...`);
  await setDoc(doc(db, 'userSessions', anonUid), {
    userId: testUserId,
    updatedAt: new Date().toISOString(),
  });
  console.log('✅ Session mapping written.');

  // Index 1: walletTransactions (userId ASC, createdAt DESC)
  console.log('\n3. Testing Query 1: walletTransactions by userId and createdAt DESC...');
  try {
    const q1 = query(
      collection(db, 'walletTransactions'),
      where('userId', '==', testUserId),
      orderBy('createdAt', 'desc')
    );
    const snap1 = await getDocs(q1);
    console.log(`✅ Index 1 Active! (Query returned ${snap1.size} docs)`);
  } catch (error) {
    console.log('❌ Index 1 Error:', error.message);
  }

  // Index 2: walletTransactions (userId ASC, type ASC, status ASC, clearingAt ASC)
  console.log('\n4. Testing Query 2: walletTransactions clearing query...');
  try {
    const q2 = query(
      collection(db, 'walletTransactions'),
      where('userId', '==', testUserId),
      where('type', '==', 'credit'),
      where('status', '==', 'pending'),
      orderBy('clearingAt', 'asc')
    );
    const snap2 = await getDocs(q2);
    console.log(`✅ Index 2 Active! (Query returned ${snap2.size} docs)`);
  } catch (error) {
    console.log('❌ Index 2 Error:', error.message);
  }

  // Index 3: withdrawals (userId ASC, requestedAt ASC)
  console.log('\n5. Testing Query 3: withdrawals by userId and requestedAt ASC...');
  try {
    const q3 = query(
      collection(db, 'withdrawals'),
      where('userId', '==', testUserId),
      orderBy('requestedAt', 'asc')
    );
    const snap3 = await getDocs(q3);
    console.log(`✅ Index 3 Active! (Query returned ${snap3.size} docs)`);
  } catch (error) {
    console.log('❌ Index 3 Error:', error.message);
  }

  // Index 4: bookings (status ASC, expiresAt ASC)
  console.log('\n6. Testing Query 4: bookings status/expiresAt sweep query...');
  try {
    const q4 = query(
      collection(db, 'bookings'),
      where('status', '==', 'accepted'),
      orderBy('expiresAt', 'asc')
    );
    const snap4 = await getDocs(q4);
    console.log(`✅ Index 4 Active! (Query returned ${snap4.size} docs)`);
  } catch (error) {
    console.log('❌ Index 4 Error:', error.message);
  }

  // Index 5: notifications collection group index on createdAt
  console.log('\n7. Testing Query 5: notifications collectionGroup by createdAt...');
  try {
    const q5 = query(
      collectionGroup(db, 'notifications'),
      orderBy('createdAt', 'desc')
    );
    const snap5 = await getDocs(q5);
    console.log(`✅ Index 5 Active! (Query returned ${snap5.size} docs)`);
  } catch (error) {
    console.log('❌ Index 5 Error:', error.message);
  }
};

runTest().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
