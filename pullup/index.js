import './utils/backgroundLocationTask';
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('[FCM-BACKGROUND] Background message received:', JSON.stringify(remoteMessage, null, 2));
  try {
    const notification = remoteMessage.notification || {};
    const data = remoteMessage.data || {};
    
    const title = notification.title || data.title || 'New Notification';
    const body = notification.body || data.body || data.message || '';
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        channelId: 'default',
        badge: 1,
        data: data,
      },
      trigger: null,
    });
    console.log('[FCM-BACKGROUND] Background notification scheduled successfully via expo-notifications');
  } catch (err) {
    console.error('[FCM-BACKGROUND] Error in background handler:', err?.message || err);
  }
});

import 'expo-router/entry';