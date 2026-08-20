const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, getDocs, query, where } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDAH_IkC3mEa0I3K58YZ6NnnCNWH7u7v98",
  authDomain: "pullup-production.firebaseapp.com",
  projectId: "pullup-production",
  storageBucket: "pullup-production.firebasestorage.app",
  messagingSenderId: "286433202099",
  appId: "1:286433202099:web:e2b0d38e845d50bc3005c6",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const inspect = async () => {
  const email = 'anshika.gupta.btech2028@atlasskilltech.university';
  console.log(`Inspecting users in database...`);

  // 1. Check if document exists with ID = email
  const docByEmailIdRef = doc(db, 'users', email);
  try {
    const docByEmailId = await getDoc(docByEmailIdRef);
    if (docByEmailId.exists()) {
      console.log(`✅ Document found with ID '${email}':`, docByEmailId.data());
    } else {
      console.log(`❌ No document found with ID '${email}'`);
    }
  } catch (error) {
    console.error(`Error fetching document by ID '${email}':`, error.message);
  }

  // 2. Query users collection for email == email
  console.log(`\nQuerying 'users' collection where email == '${email}'...`);
  try {
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snapshot = await getDocs(q);
    console.log(`Found ${snapshot.size} matches by querying email field.`);
    snapshot.forEach(docSnap => {
      console.log(`  - Doc ID: ${docSnap.id}`);
      console.log(`    Data:`, docSnap.data());
    });
  } catch (error) {
    console.error(`Error querying users:`, error.message);
  }

  // 3. List some documents in userSessions to see session mappings
  console.log(`\nQuerying 'userSessions' collection...`);
  try {
    const snapshot = await getDocs(collection(db, 'userSessions'));
    console.log(`Found ${snapshot.size} session mappings.`);
    snapshot.forEach(docSnap => {
      console.log(`  - Session UID: ${docSnap.id} -> User ID:`, docSnap.data().userId);
    });
  } catch (error) {
    console.error(`Error listing userSessions:`, error.message);
  }
};

inspect().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
