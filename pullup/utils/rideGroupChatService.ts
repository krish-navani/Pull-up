import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  Timestamp,
  Unsubscribe,
  limitToLast
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { sendNotification } from './notificationService';

export interface GroupChatMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  text: string;
  createdAt: any;
  type: 'text' | 'image' | 'location' | 'destination' | 'ride_card' | 'system';
  imageUrl?: string;
  public_id?: string;
  location?: {
    latitude: number;
    longitude: number;
    durationMinutes?: number;
    expiresAt?: string;
  };
  destination?: {
    address: string;
    latitude: number;
    longitude: number;
  };
  rideCard?: {
    rideId: string;
    rideType: 'carpool' | 'taxipool';
    pickupAddress: string;
    dropAddress: string;
    price: number;
    departureTime: string;
  };
  readBy?: string[];
}

export interface GroupChatRoom {
  rideId: string;
  rideType: 'carpool' | 'taxipool';
  participants: string[];
  lastMessage: string;
  lastMessageTime: any;
  updatedAt: any;
}

/**
 * Checks if a user is authorized to participate in a ride group chat.
 * Authorized users are:
 * 1. The driver/host of the ride/pool.
 * 2. A passenger with status 'confirmed' and paymentStatus 'paid' for a carpool.
 * 3. A member of a taxipool.
 * 4. A participant listed in the chat document.
 */
const chatAuthCache = new Set<string>();

export const isUserAuthorizedForChat = async (rideId: string, userId: string): Promise<boolean> => {
  if (userId === 'system') return true;
  const cacheKey = `${rideId}_${userId}`;
  if (chatAuthCache.has(cacheKey)) return true;

  try {
    // 1. Fast path: check rideChats participants first
    const chatRef = doc(db, 'rideChats', rideId);
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      const chatData = chatSnap.data();
      if (chatData.participants && (chatData.participants.includes(userId))) {
        chatAuthCache.add(cacheKey);
        return true;
      }
    }

    // Resolve persistent userId if userId is a session ID
    let persistentUserId = userId;
    try {
      const sessionRef = doc(db, 'userSessions', userId);
      const sessionSnap = await getDoc(sessionRef);
      if (sessionSnap.exists()) {
        const sessionData = sessionSnap.data();
        if (sessionData.userId) {
          persistentUserId = sessionData.userId;
        }
      }
    } catch (sessionErr) {
      // ignore
    }

    if (chatAuthCache.has(`${rideId}_${persistentUserId}`)) return true;

    if (chatSnap.exists()) {
      const chatData = chatSnap.data();
      if (chatData.participants && chatData.participants.includes(persistentUserId)) {
        chatAuthCache.add(cacheKey);
        chatAuthCache.add(`${rideId}_${persistentUserId}`);
        return true;
      }
    }

    // 2. Check if user is driver/host
    const rideRef = doc(db, 'rides', rideId);
    const rideSnap = await getDoc(rideRef);
    if (rideSnap.exists()) {
      const rideData = rideSnap.data();
      if (rideData.driverId === persistentUserId) {
        chatAuthCache.add(cacheKey);
        return true;
      }
    }

    // 3. Check booking
    const bookingId = `${rideId}_${persistentUserId}`;
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);
    if (bookingSnap.exists()) {
      const bookingData = bookingSnap.data();
      if (bookingData.status === 'confirmed' && bookingData.paymentStatus === 'paid') {
        chatAuthCache.add(cacheKey);
        return true;
      }
    }

    // 4. TaxiPool member
    const taxiPoolRef = doc(db, 'taxiPools', rideId);
    const taxiPoolSnap = await getDoc(taxiPoolRef);
    if (taxiPoolSnap.exists()) {
      const memberRef = doc(db, 'poolMembers', `${rideId}_${persistentUserId}`);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        chatAuthCache.add(cacheKey);
        return true;
      }
      const taxiPoolData = taxiPoolSnap.data();
      if (taxiPoolData.creatorId === persistentUserId) {
        chatAuthCache.add(cacheKey);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[GROUP CHAT SERVICE] Error checking chat authorization:', error);
    return false;
  }
};

/**
 * Initialize a new group chat room for a ride/pool
 */
export const initializeGroupChat = async (
  rideId: string,
  rideType: 'carpool' | 'taxipool',
  hostId: string,
  hostName: string,
  hostPhotoUrl?: string
): Promise<void> => {
  try {
    console.log(`[GROUP CHAT SERVICE] Initializing chat for ${rideType}:`, rideId);
    const roomRef = doc(db, 'rideChats', rideId);

    // Create group chat document
    await setDoc(roomRef, {
      rideId,
      rideType,
      participants: [hostId],
      lastMessage: 'Group chat created',
      lastMessageTime: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Send starter system message
    const messagesRef = collection(db, 'rideChats', rideId, 'messages');
    await addDoc(messagesRef, {
      rideId,
      senderId: 'system',
      senderName: 'System',
      senderPhoto: '',
      text: 'Group chat created! Welcome to your ride.',
      createdAt: serverTimestamp(),
      type: 'system',
    });

    console.log('[GROUP CHAT SERVICE] ✅ Group chat initialized successfully');
  } catch (error) {
    console.error('[GROUP CHAT SERVICE] ❌ Error initializing group chat:', error);
  }
};

/**
 * Add a participant to the group chat
 */
export const addParticipantToGroupChat = async (
  rideId: string,
  userId: string,
  userName: string,
  systemMessageText?: string
): Promise<void> => {
  try {
    console.log(`[GROUP CHAT SERVICE] Adding participant ${userId} to ride ${rideId}`);
    const roomRef = doc(db, 'rideChats', rideId);

    // Update participants array
    await updateDoc(roomRef, {
      participants: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });

    // Send system message
    const messagesRef = collection(db, 'rideChats', rideId, 'messages');
    await addDoc(messagesRef, {
      rideId,
      senderId: 'system',
      senderName: 'System',
      senderPhoto: '',
      text: systemMessageText || `${userName} joined the ride`,
      createdAt: serverTimestamp(),
      type: 'system',
    });

    console.log('[GROUP CHAT SERVICE] ✅ Participant added & system message sent');
  } catch (error) {
    console.error('[GROUP CHAT SERVICE] ❌ Error adding participant:', error);
  }
};

export const ensureParticipantInGroupChat = async (
  rideId: string,
  userId: string
): Promise<void> => {
  if (!rideId || !userId) return;

  try {
    const roomRef = doc(db, 'rideChats', rideId);
    await setDoc(roomRef, {
      rideId,
      participants: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.warn('[GROUP CHAT SERVICE] Failed to ensure participant in chat:', error);
  }
};

/**
 * Remove a participant from the group chat
 */
export const removeParticipantFromGroupChat = async (
  rideId: string,
  userId: string,
  userName: string
): Promise<void> => {
  try {
    console.log(`[GROUP CHAT SERVICE] Removing participant ${userId} from ride ${rideId}`);
    const roomRef = doc(db, 'rideChats', rideId);

    // Update participants array
    await updateDoc(roomRef, {
      participants: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });

    // Send system message
    const messagesRef = collection(db, 'rideChats', rideId, 'messages');
    await addDoc(messagesRef, {
      rideId,
      senderId: 'system',
      senderName: 'System',
      senderPhoto: '',
      text: `${userName} left the ride`,
      createdAt: serverTimestamp(),
      type: 'system',
    });

    console.log('[GROUP CHAT SERVICE] ✅ Participant removed & system message sent');
  } catch (error) {
    console.error('[GROUP CHAT SERVICE] ❌ Error removing participant:', error);
  }
};

/**
 * Send a message to the group chat
 */
export const sendGroupMessage = async (
  rideId: string,
  senderId: string,
  senderName: string,
  senderPhoto: string,
  text: string,
  type: 'text' | 'image' | 'location' | 'destination' | 'ride_card' | 'system' = 'text',
  extraData?: {
    imageUrl?: string;
    public_id?: string;
    location?: {
      latitude: number;
      longitude: number;
      durationMinutes?: number;
      expiresAt?: string;
    };
    destination?: {
      address: string;
      latitude: number;
      longitude: number;
    };
    rideCard?: {
      rideId: string;
      rideType: 'carpool' | 'taxipool';
      pickupAddress: string;
      dropAddress: string;
      price: number;
      departureTime: string;
    };
    triggerUserId?: string;
  }
): Promise<string> => {
  try {
    // Restrict Access: verify user is authorized for this chat
    const isAuth = await isUserAuthorizedForChat(rideId, senderId);
    if (!isAuth) {
      throw new Error('Access denied: You must be a confirmed and paid participant to send messages.');
    }

    const messagesRef = collection(db, 'rideChats', rideId, 'messages');
    
    // Add message
    const messageDoc = await addDoc(messagesRef, {
      rideId,
      senderId,
      senderName,
      senderPhoto: senderPhoto || '',
      text: text.trim(),
      createdAt: serverTimestamp(),
      type,
      readBy: [senderId], // Initialize readBy with the sender
      ...extraData
    });

    // Update last message in room
    const roomRef = doc(db, 'rideChats', rideId);
    const roomSnap = await getDoc(roomRef);
    let participants: string[] = [];
    let rideType: 'carpool' | 'taxipool' = 'carpool';
    
    if (roomSnap.exists()) {
      const data = roomSnap.data();
      participants = data.participants || [];
      rideType = data.rideType || 'carpool';
    }

    let lastMsgText = text;
    if (type === 'image') lastMsgText = 'Sent an image';
    else if (type === 'location') lastMsgText = 'Shared live location';
    else if (type === 'destination') lastMsgText = 'Shared a destination';
    else if (type === 'ride_card') lastMsgText = 'Shared ride details';

    await updateDoc(roomRef, {
      lastMessage: type === 'system' ? text : `${senderName}: ${lastMsgText}`,
      lastMessageTime: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Send Firestore notifications to other participants (except sender/triggerer)
    const isSOS = text.includes('SOS alert') || text.includes('DISTRESS ALERT') || text.includes('EMERGENCY SOS');
    const triggerUserId = (extraData && extraData.triggerUserId) ? extraData.triggerUserId : senderId;

    if (type !== 'system' || isSOS) {
      const otherParticipants = participants.filter((p) => p !== triggerUserId);
      for (const recipientId of otherParticipants) {
        try {
          await sendNotification(
            recipientId,
            isSOS ? 'sos' as any : 'message',
            isSOS ? 'SOS EMERGENCY ALERT 🚨' : 'New Group Message',
            isSOS ? text : `${senderName}: ${lastMsgText}`,
            rideId,
            undefined, // bookingId
            triggerUserId,
            isSOS ? 'Emergency' : senderName,
            `/group-chat?rideId=${rideId}&rideType=${rideType}`
          );
        } catch (notifErr) {
          console.warn('[GROUP CHAT SERVICE] Notification failed for user:', recipientId, notifErr);
        }
      }
    }

    return messageDoc.id;
  } catch (error) {
    console.error('[GROUP CHAT SERVICE] ❌ Error sending group message:', error);
    throw error;
  }
};

/**
 * Subscribe to real-time group chat messages
 */
export const subscribeToGroupMessages = (
  rideId: string,
  limitOrCallback: number | ((messages: GroupChatMessage[]) => void),
  callback?: (messages: GroupChatMessage[]) => void
): Unsubscribe => {
  let limitCount = 50;
  let onMessagesUpdate: (messages: GroupChatMessage[]) => void;

  if (typeof limitOrCallback === 'function') {
    onMessagesUpdate = limitOrCallback;
  } else {
    limitCount = limitOrCallback;
    onMessagesUpdate = callback!;
  }

  const currentUserId = auth.currentUser?.uid;
  if (!currentUserId) {
    console.error("[GROUP CHAT SERVICE] No user logged in.");
    return () => {};
  }

  let unsubscribes: Unsubscribe[] = [];
  let isCancelled = false;

  isUserAuthorizedForChat(rideId, currentUserId).then((isAuth) => {
    if (isCancelled) return;
    if (!isAuth) {
      console.warn(`[GROUP CHAT SERVICE] Access denied: User ${currentUserId} is not authorized for chat ${rideId}`);
      onMessagesUpdate([]);
      return;
    }

    const messagesRef = collection(db, 'rideChats', rideId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limitToLast(limitCount));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const messages: GroupChatMessage[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          messages.push({
            id: docSnap.id,
            rideId: data.rideId,
            senderId: data.senderId,
            senderName: data.senderName,
            senderPhoto: data.senderPhoto,
            text: data.text,
            createdAt: data.createdAt,
            type: data.type,
            imageUrl: data.imageUrl,
            public_id: data.public_id,
            location: data.location,
            destination: data.destination,
            rideCard: data.rideCard,
            readBy: data.readBy || [],
          } as GroupChatMessage);
        });
        onMessagesUpdate(messages);
      },
      (error) => {
        console.log('[COLLECTION] rideChats/' + rideId + '/messages');
        console.log('[QUERY] query(collection(db, "rideChats", "' + rideId + '", "messages"), orderBy("createdAt", "asc"), limitToLast(' + limitCount + '))');
        console.error('[PERMISSION ERROR] ' + error.message);
      }
    );
    unsubscribes.push(unsub);
  });

  return () => {
    isCancelled = true;
    unsubscribes.forEach((unsub) => unsub());
  };
};

/**
 * Subscribe to group chat room details
 */
export const subscribeToGroupChatRoom = (
  rideId: string,
  onRoomUpdate: (room: GroupChatRoom | null) => void
): Unsubscribe => {
  const roomRef = doc(db, 'rideChats', rideId);

  return onSnapshot(
    roomRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onRoomUpdate(docSnap.data() as GroupChatRoom);
      } else {
        onRoomUpdate(null);
      }
    },
    (error) => {
      console.log('[COLLECTION] rideChats');
      console.log('[QUERY] doc(db, "rideChats", "' + rideId + '")');
      console.error('[PERMISSION ERROR] ' + error.message);
    }
  );
};
