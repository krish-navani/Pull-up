import {
    addDoc,
    collection,
    doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    Unsubscribe,
    updateDoc,
    where,
    writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

export interface ChatMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  recipientId: string;
  content: string;
  timestamp: Timestamp;
  read: boolean;
  messageType?: 'text' | 'system'; // system for "Driver is on the way", etc.
}

export interface ChatRoom {
  id: string;
  rideId: string;
  participants: string[]; // [driverId, passengerId]
  lastMessage: string;
  lastMessageTime: Timestamp;
  unreadCount: number;
  createdAt: Timestamp;
}

/**
 * Create or get a chat room for a ride
 */
export const getOrCreateChatRoom = async (
  rideId: string,
  driverId: string,
  passengerId: string
): Promise<string> => {
  try {
    const roomId = rideId;
    const roomRef = doc(db, 'chatRooms', roomId);

    // Use setDoc with merge to create if doesn't exist, or keep existing if it does
    await setDoc(
      roomRef,
      {
        rideId,
        participants: [driverId, passengerId],
        lastMessage: '',
        lastMessageTime: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log('[CHAT SERVICE] ✅ Chat room ready:', roomId);
    return roomId;
  } catch (error) {
    console.error('[CHAT SERVICE] Error creating chat room:', error);
    throw error;
  }
};

/**
 * Send a message in a chat
 */
export const sendMessage = async (
  rideId: string,
  senderId: string,
  senderName: string,
  recipientId: string,
  content: string,
  senderAvatar?: string
): Promise<string> => {
  try {
    const messagesRef = collection(db, 'chatRooms', rideId, 'messages');

    const messageDoc = await addDoc(messagesRef, {
      rideId,
      senderId,
      senderName,
      senderAvatar: senderAvatar || '',
      recipientId,
      content: content.trim(),
      timestamp: serverTimestamp(),
      read: false,
      messageType: 'text',
    });

    console.log('[CHAT SERVICE] ✅ Message sent with ID:', messageDoc.id);

    // Update room's last message (create room if doesn't exist)
    const roomRef = doc(db, 'chatRooms', rideId);
    await setDoc(
      roomRef,
      {
        rideId,
        participants: [senderId, recipientId],
        lastMessage: content.substring(0, 50),
        lastMessageTime: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true } // Merge with existing data, don't overwrite
    );

    return messageDoc.id;
  } catch (error) {
    console.error('[CHAT SERVICE] ❌ Error sending message:', error);
    throw error;
  }
};

/**
 * Send a system message (ride started, driver on way, etc)
 */
export const sendSystemMessage = async (
  rideId: string,
  message: string
): Promise<void> => {
  try {
    const messagesRef = collection(db, 'chatRooms', rideId, 'messages');

    await addDoc(messagesRef, {
      rideId,
      senderId: 'system',
      senderName: 'System',
      recipientId: '',
      content: message,
      timestamp: serverTimestamp(),
      read: true,
      messageType: 'system',
    });

    console.log('[CHAT SERVICE] ✅ System message sent');

    // Update room's last message
    const roomRef = doc(db, 'chatRooms', rideId);
    await updateDoc(roomRef, {
      lastMessage: message,
      lastMessageTime: serverTimestamp(),
    });
  } catch (error) {
    console.error('[CHAT SERVICE] ❌ Error sending system message:', error);
  }
};

/**
 * Get all messages for a ride (for initial load)
 */
export const getMessagesForRide = async (rideId: string): Promise<ChatMessage[]> => {
  try {
    const messagesRef = collection(db, 'chatRooms', rideId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(100));
    const querySnap = await getDocs(q);

    const messages: ChatMessage[] = [];
    querySnap.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data(),
      } as ChatMessage);
    });

    console.log('[CHAT SERVICE] ✅ Fetched', messages.length, 'messages for ride:', rideId);
    return messages;
  } catch (error) {
    console.error('[CHAT SERVICE] ❌ Error fetching messages:', error);
    return [];
  }
};

/**
 * Subscribe to real-time message updates
 */
export const subscribeToMessages = (
  rideId: string,
  onMessagesUpdate: (messages: ChatMessage[]) => void
): Unsubscribe => {
  try {
    const messagesRef = collection(db, 'chatRooms', rideId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (querySnap) => {
        const messages: ChatMessage[] = [];
        querySnap.forEach((doc) => {
          messages.push({
            id: doc.id,
            ...doc.data(),
          } as ChatMessage);
        });

        console.log('[CHAT SERVICE] 📨 Real-time update:', messages.length, 'messages');
        onMessagesUpdate(messages);
      },
      (error) => {
        console.error('[CHAT SERVICE] ❌ Error subscribing to messages:', error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('[CHAT SERVICE] ❌ Error setting up subscription:', error);
    return () => {};
  }
};

/**
 * Mark a message as read
 */
export const markMessageAsRead = async (rideId: string, messageId: string): Promise<void> => {
  try {
    const messageRef = doc(db, 'chatRooms', rideId, 'messages', messageId);
    await updateDoc(messageRef, { read: true });
  } catch (error) {
    console.error('[CHAT SERVICE] ❌ Error marking message as read:', error);
  }
};

/**
 * Mark all messages from a sender as read
 */
export const markAllMessagesAsRead = async (
  rideId: string,
  userId: string
): Promise<void> => {
  try {
    const messagesRef = collection(db, 'chatRooms', rideId, 'messages');
    // Mark INCOMING messages (where current user is recipient) as read
    const q = query(messagesRef, where('recipientId', '==', userId), where('read', '==', false));
    const querySnap = await getDocs(q);

    const batch = writeBatch(db);
    querySnap.forEach((doc) => {
      batch.update(doc.ref, { read: true });
    });

    await batch.commit();
    console.log('[CHAT SERVICE] ✅ Marked incoming messages as read');
  } catch (error) {
    console.error('[CHAT SERVICE] ❌ Error marking messages as read:', error);
  }
};

/**
 * Get unread message count for a user in a ride
 */
export const getUnreadCount = async (rideId: string, userId: string): Promise<number> => {
  try {
    const messagesRef = collection(db, 'chatRooms', rideId, 'messages');
    const q = query(
      messagesRef,
      where('recipientId', '==', userId),
      where('read', '==', false)
    );
    const querySnap = await getDocs(q);
    return querySnap.size;
  } catch (error) {
    console.error('[CHAT SERVICE] ❌ Error getting unread count:', error);
    return 0;
  }
};

/**
 * Delete a message (soft delete by setting content to [deleted])
 */
export const deleteMessage = async (rideId: string, messageId: string): Promise<void> => {
  try {
    const messageRef = doc(db, 'chatRooms', rideId, 'messages', messageId);
    await updateDoc(messageRef, {
      content: '[Message deleted]',
      timestamp: serverTimestamp(),
    });
    console.log('[CHAT SERVICE] ✅ Message deleted');
  } catch (error) {
    console.error('[CHAT SERVICE] ❌ Error deleting message:', error);
  }
};

/**
 * Get initial starter messages for a ride
 */
export const initializeRideChat = async (
  rideId: string,
  driverId: string,
  driverName: string
): Promise<void> => {
  try {
    // Check if ride already has messages
    const messagesRef = collection(db, 'chatRooms', rideId, 'messages');
    const q = query(messagesRef, limit(1));
    const querySnap = await getDocs(q);

    if (querySnap.empty) {
      console.log('[CHAT SERVICE] Initializing ride chat messages');
      // Send starter messages

      // Message 1: Driver introduction
      const messagesCollection = collection(db, 'chatRooms', rideId, 'messages');

      // System message
      await addDoc(messagesCollection, {
        rideId,
        senderId: 'system',
        senderName: 'System',
        recipientId: '',
        content: 'Your ride has started! Feel free to message {driverName} or the passenger.',
        timestamp: serverTimestamp(),
        read: true,
        messageType: 'system',
      });

      console.log('[CHAT SERVICE] ✅ Ride chat initialized with starter messages');
    }
  } catch (error) {
    console.error('[CHAT SERVICE] ❌ Error initializing ride chat:', error);
  }
};
