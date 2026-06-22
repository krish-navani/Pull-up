import { getDb, initializeFirebase } from './firebase';

const checkDb = async () => {
  // Initialize firebase using config-based credentials
  const db = getDb();
  const rideId = 'sulIJEVVlmNzvdpP94Vg';
  const userId = 'TB1UCx0IZJdOkKZzBYJ0prbWy3s2';

  console.log(`=== DB INSPECTION FOR RIDE: ${rideId} AND USER: ${userId} ===`);

  // 1. Check userSessions mapping
  const sessionsSnap = await db.collection('userSessions').get();
  console.log('\n--- Active User Sessions Mapping ---');
  sessionsSnap.forEach(doc => {
    console.log(`Session: ${doc.id} -> User:`, doc.data());
  });

  // 2. Check user profile
  const userDoc = await db.collection('users').doc(userId).get();
  if (userDoc.exists) {
    console.log('\n--- User Profile ---');
    console.log(JSON.stringify(userDoc.data(), null, 2));
  } else {
    console.log(`\n❌ User profile ${userId} not found`);
  }

  // 3. Check ride details
  const rideDoc = await db.collection('rides').doc(rideId).get();
  if (rideDoc.exists) {
    console.log('\n--- Ride Details (Carpool) ---');
    console.log(JSON.stringify(rideDoc.data(), null, 2));
  } else {
    console.log(`\n❌ Ride ${rideId} not found in carpools`);
  }

  // 4. Check taxiPool details
  const poolDoc = await db.collection('taxiPools').doc(rideId).get();
  if (poolDoc.exists) {
    console.log('\n--- Taxi Pool Details ---');
    console.log(JSON.stringify(poolDoc.data(), null, 2));
  } else {
    console.log(`\n❌ Ride ${rideId} not found in taxiPools`);
  }

  // 5. Check bookings
  const bookingsSnap = await db.collection('bookings')
    .where('rideId', '==', rideId)
    .get();
  console.log('\n--- Bookings for this Ride ---');
  if (bookingsSnap.empty) {
    console.log('No bookings found');
  } else {
    bookingsSnap.forEach(doc => {
      console.log(`Booking ${doc.id}:`, JSON.stringify(doc.data(), null, 2));
    });
  }

  // 6. Check poolMembers
  const membersSnap = await db.collection('poolMembers')
    .where('poolId', '==', rideId)
    .get();
  console.log('\n--- Pool Members for this Taxi Pool ---');
  if (membersSnap.empty) {
    console.log('No pool members found');
  } else {
    membersSnap.forEach(doc => {
      console.log(`Member ${doc.id}:`, JSON.stringify(doc.data(), null, 2));
    });
  }
};

checkDb().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
