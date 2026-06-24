import { getDb } from './firebase';

const run = async () => {
  const db = getDb();
  console.log('=== GATHERING NOTIFICATION READINESS STATS ===');

  // 1. Query users
  const usersSnap = await db.collection('users').get();
  let totalUsers = 0;
  let usersWithToken = 0;
  let usersWithoutToken = 0;
  const usersWithTokenList: any[] = [];
  const usersWithoutTokenList: any[] = [];

  usersSnap.forEach(doc => {
    totalUsers++;
    const data = doc.data();
    const token = data.expoPushToken;
    if (token && typeof token === 'string' && token.trim() !== '') {
      usersWithToken++;
      usersWithTokenList.push({ id: doc.id, phone: data.phone, token });
    } else {
      usersWithoutToken++;
      usersWithoutTokenList.push({ id: doc.id, phone: data.phone });
    }
  });

  console.log(`\nTotal Users in DB: ${totalUsers}`);
  console.log(`Users with expoPushToken: ${usersWithToken}`);
  console.log(`Users missing expoPushToken: ${usersWithoutToken}`);

  console.log('\nUsers with token detail:');
  usersWithTokenList.forEach(u => console.log(`- User ID: ${u.id}, Phone: ${u.phone}, Token: ${u.token}`));

  // 2. Query campaigns/notification analytics
  const analyticsSnap = await db.collection('notificationAnalytics').get();
  let totalSent = 0;
  let totalDelivered = 0;
  console.log('\n--- Notification Analytics / Campaigns ---');
  if (analyticsSnap.empty) {
    console.log('No notification analytics records found.');
  } else {
    analyticsSnap.forEach(doc => {
      const data = doc.data();
      console.log(`Campaign ${doc.id}: sent=${data.sentCount}, delivered=${data.deliveredCount}, title="${data.title}"`);
      totalSent += (data.sentCount || 0);
      totalDelivered += (data.deliveredCount || 0);
    });
  }

  const successRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
  console.log(`\nAggregated Notification success rate from campaigns: ${successRate.toFixed(2)}% (${totalDelivered}/${totalSent})`);

  // Let's also check in-app notifications count
  let totalInAppNotifications = 0;
  for (const userDoc of usersSnap.docs) {
    const notifsSnap = await db.collection('users').doc(userDoc.id).collection('notifications').get();
    totalInAppNotifications += notifsSnap.size;
  }
  console.log(`Total in-app notifications generated: ${totalInAppNotifications}`);
};

run().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
