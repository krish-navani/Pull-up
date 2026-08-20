import dotenv from 'dotenv';
import path from 'path';
import admin from 'firebase-admin';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const REAL_FCM_TOKEN = 'feyRuCFSQyCICYUqbmgvud:APA91bHCKzabnIje7fmghWV-KRMowkO3pp44Ayh7XLpItM32-oUouL91Af6bVitw9lI67uZDJrZGut0LD1lnVheFu65Xe6459A8cfAckjvWs3FaJ47dVKOE';

async function main() {
  console.log('\n=== FCM BACKGROUND NOTIFICATION TEST ===');
  console.log('App should be BACKGROUNDED (HOME key pressed).');
  console.log('Sending FCM with notification block...\n');

  try {
    const messageId = await admin.messaging().send({
      token: REAL_FCM_TOKEN,
      notification: {
        title: '🔔 PullUp – Ride Started',
        body: 'Your driver is on the way. Tap to track the ride.',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default',
          notificationCount: 1,
        },
      },
      data: {
        type: 'ride_started',
        rideId: 'bg_verify_001',
        targetScreen: 'navigation',
        targetId: 'bg_verify_001',
      },
    });

    console.log('✅ FCM ACCEPTED by Firebase!');
    console.log('   messageId:', messageId);
    console.log('\n📋 Check the emulator notification shade now.');
    console.log('   The notification should appear within 2-5 seconds.');
    console.log('   If not visible, it may be a React Native debug build limitation (Expo Go proxy).');
  } catch (err: any) {
    console.error('❌ FCM ERROR:', err.code, err.message);
  }
}

main().catch(console.error);
