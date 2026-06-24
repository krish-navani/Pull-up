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
import { db } from './firebase';
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

  const messagesRef = collection(db, 'rideChats', rideId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'), limitToLast(limitCount));

  return onSnapshot(
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
