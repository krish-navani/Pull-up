import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    Unsubscribe,
    updateDoc,
    where,
    writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { OTP_BACKEND_URL } from '@/config/environment';

export type NotificationType = 
  | 'booking_request' 
  | 'booking_accepted' 
  | 'booking_rejected'
  | 'ride_started' 
  | 'ride_completed'
  | 'ride_cancelled'
  | 'message'
  | 'pool_joined'
  | 'pool_accepted'
  | 'pool_full'
  | 'pool_request'
  | 'payment_required'
  | 'payment_confirmed'
  | 'refund_initiated'
  | 'refund_completed'
  | 'waitlist_joined'
  | 'waitlist_promoted'
  | 'waitlist_expired'
  | 'sos'
  | 'withdrawal_requested'
  | 'withdrawal_approved'
  | 'withdrawal_rejected'
  | 'withdrawal_completed'
  | 'payment_failed'
  | 'cancellation'
  | 'license_verified'
  | 'license_rejected'
  | 'license_resubmit'
  | 'general'
  | 'booking_expired'
  | 'driver_arrived'           // Driver is within 50m of passenger pickup
  | 'passenger_confirmed_pickup'; // Passenger confirmed they boarded

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  rideId: string;
  bookingId?: string;
  senderId?: string;
  senderName?: string;
  read: boolean;
  createdAt: Timestamp;
  actionUrl?: string;
}

/**
 * Send a notification to a user
 */
export const sendNotification = async (
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  rideId: string,
  bookingId?: string,
  senderId?: string,
  senderName?: string,
  actionUrl?: string
): Promise<string> => {
  // Fetch token for logging
  let token = 'unknown';
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      token = userSnap.data()?.expoPushToken || 'unknown';
    }
  } catch (err) {
    console.warn('[NOTIFICATIONS] Failed to fetch recipient token for logging:', err);
  }

  console.log(`[NOTIFICATION SENT]
recipientId: ${userId}
token: ${token}
type: ${type}`);


  let targetScreen: string | null = null;
  let targetId: string | null = null;

  try {
    // 1. Determine target screen routing metadata for deep links
    if (type === 'message') {
      targetScreen = 'group-chat';
      targetId = rideId;
    } else if (['booking_request', 'booking_accepted', 'booking_rejected'].includes(type)) {
      targetScreen = 'my-bookings';
      targetId = bookingId || rideId;
    } else if (['ride_started', 'driver_arrived', 'passenger_confirmed_pickup', 'live_tracking', 'live-tracking', 'location_update'].includes(type)) {
      targetScreen = 'navigation';
      targetId = rideId;
    } else if (['ride_completed', 'ride_cancelled', 'pool_full', 'cancellation'].includes(type)) {
      targetScreen = 'ride-details';
      targetId = rideId;
    } else if (['payment_required', 'payment_failed', 'booking_expired'].includes(type)) {
      targetScreen = 'my-bookings';
      targetId = bookingId || rideId;
    } else if (['pool_joined', 'pool_accepted', 'pool_request'].includes(type)) {
      targetScreen = 'taxi-pool-details';
      targetId = rideId;
    } else if (['waitlist_joined', 'waitlist_promoted', 'waitlist_expired'].includes(type)) {
      targetScreen = 'ride-details';
      targetId = rideId;
    } else if (['withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_completed'].includes(type)) {
      targetScreen = 'wallet';
      targetId = null;
    } else if (type === 'sos') {
      targetScreen = 'group-chat';
      targetId = rideId;
    } else if (['license_verified', 'license_rejected', 'license_resubmit'].includes(type)) {
      targetScreen = 'profile';
      targetId = null;
    }

    // 2. Call backend REST endpoint
    const backendUrl = OTP_BACKEND_URL;
    const response = await fetch(`${backendUrl}/api/otp/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        type,
        title,
        message,
        rideId: rideId || null,
        bookingId: bookingId || null,
        senderId: senderId || null,
        senderName: senderName || null,
        targetScreen,
        targetId,
        actionUrl: actionUrl || null,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status code: ${response.status}`);
    }

    const resData = await response.json();
    return resData.notifId || Math.random().toString(36).substring(7);
  } catch (error) {
    console.warn('[NOTIFICATIONS] API dispatch failed, falling back to local Firestore write:', error);

    // Fallback: Write directly to subcollection if backend is unavailable
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const notificationDoc = await addDoc(notificationsRef, {
      userId,
      type,
      title,
      message,
      rideId,
      bookingId: bookingId || null,
      senderId: senderId || null,
      senderName: senderName || null,
      read: false,
      createdAt: serverTimestamp(),
      actionUrl: actionUrl || null,
      targetScreen: targetScreen || null,
      targetId: targetId || null,
    });

    return notificationDoc.id;
  }
};

/**
 * Get all notifications for a user
 */
export const getNotificationsForUser = async (userId: string): Promise<Notification[]> => {
  try {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(q);
    const notifications: Notification[] = [];

    querySnapshot.forEach((doc) => {
      notifications.push({
        id: doc.id,
        ...doc.data(),
      } as Notification);
    });

    console.log(`[NOTIFICATIONS] ✅ Fetched ${notifications.length} notifications for ${userId}`);
    return notifications;
  } catch (error) {
    console.error('[NOTIFICATIONS] Error fetching notifications:', error);
    throw error;
  }
};

/**
 * Subscribe to real-time notifications for a user
 */
export const subscribeToNotifications = (
  userId: string,
  onNotificationsChanged: (notifications: Notification[]) => void
): Unsubscribe => {
  try {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const notifications: Notification[] = [];

        querySnapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const notifData = change.doc.data();
            const createdTime = notifData.createdAt ? new Date(notifData.createdAt).getTime() : 0;
            if (Date.now() - createdTime < 2 * 60 * 1000) {
              Notifications.scheduleNotificationAsync({
                content: {
                  title: notifData.title || 'PullUp Alert',
                  body: notifData.message || '',
                  sound: 'default',
                  channelId: 'default',
                  badge: 1,
                  data: notifData,
                },
                trigger: null,
              }).catch((err) => console.warn('[NOTIFICATIONS] Error scheduling tray notification:', err));
            }
          }
        });

        querySnapshot.forEach((doc) => {
          notifications.push({
            id: doc.id,
            ...doc.data(),
          } as Notification);
        });

        console.log(
          `[NOTIFICATIONS] 🔄 Real-time update: ${notifications.length} notifications for ${userId}`
        );
        onNotificationsChanged(notifications);
      },
      (error) => {
        console.error('[NOTIFICATIONS] ❌ Snapshot listener error:', error);
        console.error('[NOTIFICATIONS] Error code:', error.code);
        console.error('[NOTIFICATIONS] Error message:', error.message);
        console.error('[NOTIFICATIONS] UserId:', userId);
        // Return empty array on error to prevent app crash
        onNotificationsChanged([]);
      }
    );

    console.log(`[NOTIFICATIONS] ✅ Subscribed to notifications for ${userId}`);
    return unsubscribe;
  } catch (error) {
    console.error('[NOTIFICATIONS] Error subscribing to notifications:', error);
    return () => {};
  }
};

/**
 * Mark a notification as read
 */
export const markNotificationAsRead = async (
  userId: string,
  notificationId: string
): Promise<void> => {
  try {
    const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);
    await updateDoc(notificationRef, { read: true });

    console.log(`[NOTIFICATIONS] ✅ Marked notification ${notificationId} as read`);
  } catch (error) {
    console.error('[NOTIFICATIONS] Error marking notification as read:', error);
    throw error;
  }
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (userId: string): Promise<void> => {
  try {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(notificationsRef, where('read', '==', false));

    const querySnapshot = await getDocs(q);

    const batch = writeBatch(db);
    querySnapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });
    if (!querySnapshot.empty) {
      await batch.commit();
    }

    console.log(`[NOTIFICATIONS] ✅ Marked all notifications as read for ${userId}`);
  } catch (error) {
    console.error('[NOTIFICATIONS] Error marking all notifications as read:', error);
    throw error;
  }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (
  userId: string,
  notificationId: string
): Promise<void> => {
  try {
    const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);
    await deleteDoc(notificationRef);

    console.log(`[NOTIFICATIONS] ✅ Deleted notification ${notificationId}`);
  } catch (error) {
    console.error('[NOTIFICATIONS] Error deleting notification:', error);
    throw error;
  }
};

/**
 * Delete all read notifications
 */
export const clearReadNotifications = async (userId: string): Promise<void> => {
  try {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(notificationsRef, where('read', '==', true));

    const querySnapshot = await getDocs(q);

    const batch = writeBatch(db);
    querySnapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    if (!querySnapshot.empty) {
      await batch.commit();
    }

    console.log(`[NOTIFICATIONS] ✅ Cleared read notifications for ${userId}`);
  } catch (error) {
    console.error('[NOTIFICATIONS] Error clearing read notifications:', error);
    throw error;
  }
};

/**
 * Get unread notification count for a user
 */
export const getUnreadCount = async (userId: string): Promise<number> => {
  try {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(notificationsRef, where('read', '==', false));

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('[NOTIFICATIONS] Error getting unread count:', error);
    return 0;
  }
};

/**
 * Subscribe to unread notification count
 */
export const subscribeToUnreadCount = (
  userId: string,
  onCountChanged: (count: number) => void
): Unsubscribe => {
  try {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(notificationsRef, where('read', '==', false));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        onCountChanged(querySnapshot.size);
      },
      (error) => {
        console.error('[NOTIFICATIONS] ❌ Unread count listener error:', error);
        console.error('[NOTIFICATIONS] UserId:', userId);
        // Return 0 on error
        onCountChanged(0);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('[NOTIFICATIONS] Error subscribing to unread count:', error);
    return () => {};
  }
};
