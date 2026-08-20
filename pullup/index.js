import './utils/backgroundLocationTask';
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Ensure the Android notification channel exists immediately on app launch
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'PullUp alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#D4500A',
    sound: 'default',
    showBadge: true,
    bypassDnd: true,
  }).catch((err) => console.warn('[INDEX] Failed to ensure default notification channel:', err));
}

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('[FCM-BACKGROUND] Background message received:', JSON.stringify(remoteMessage, null, 2));
  try {
    const notification = remoteMessage.notification;
    const data = remoteMessage.data || {};

    // If FCM notification payload exists, native Android FCM delivery handles system tray display.
    // Do NOT schedule a duplicate local notification.
    if (notification && (notification.title || notification.body)) {
      console.log('[FCM-BACKGROUND] FCM notification payload present. Native Android FCM will display in system tray. Skipping duplicate local notification.');
      return;
    }

    // Message is data-only (no notification block). Schedule local notification.
    const title = data.title || 'New Notification';
    const body = data.body || data.message || '';

    if (title || body) {
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
      console.log('[FCM-BACKGROUND] Data-only background notification scheduled successfully via expo-notifications');
    }
  } catch (err) {
    console.error('[FCM-BACKGROUND] Error in background handler:', err?.message || err);
  }
});

import 'expo-router/entry';