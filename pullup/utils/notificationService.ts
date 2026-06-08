import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    Unsubscribe,
    updateDoc,
    where,
} from 'firebase/firestore';
import { db } from './firebase';

export type NotificationType = 
  | 'booking_request' 
  | 'booking_accepted' 
  | 'booking_rejected'
  | 'ride_started' 
  | 'ride_completed'
  | 'ride_cancelled'
  | 'message';

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
  try {
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
    });

    console.log(`[NOTIFICATIONS] ✅ Notification sent to ${userId}:`, title);
    return notificationDoc.id;
  } catch (error) {
    console.error('[NOTIFICATIONS] Error sending notification:', error);
    throw error;
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

    querySnapshot.forEach(async (doc) => {
      await updateDoc(doc.ref, { read: true });
    });

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

    querySnapshot.forEach(async (doc) => {
      await deleteDoc(doc.ref);
    });

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
