import { collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Clean helper function to wipe all dynamic collection data from Firestore (for testing/reset).
 * Deletes all documents inside rides, bookings, taxiPools, poolRequests, poolMembers, notifications, and chatRooms.
 */
export const wipeAllFirestoreCommutes = async (): Promise<{ success: boolean; count: number }> => {
  try {
    console.log('[RESET DB] Starting Firestore database wipe...');
    let totalDeleted = 0;

    const collectionsToWipe = [
      'rides',
      'bookings',
      'taxiPools',
      'poolRequests',
      'poolMembers',
      'notifications'
    ];

    // 1. Wipe standard collections
    for (const colName of collectionsToWipe) {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      console.log(`[RESET DB] Found ${snapshot.size} documents in collection '${colName}'`);
      
      if (snapshot.size > 0) {
        // Use batch for performance and atomicity where possible
        const batch = writeBatch(db);
        snapshot.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
          totalDeleted++;
        });
        await batch.commit();
        console.log(`[RESET DB] ✅ Wiped collection '${colName}'`);
      }
    }

    // 2. Wipe chatRooms and their nested messages subcollections
    const chatRoomsRef = collection(db, 'chatRooms');
    const chatRoomsSnapshot = await getDocs(chatRoomsRef);
    console.log(`[RESET DB] Found ${chatRoomsSnapshot.size} chat rooms`);

    for (const roomDoc of chatRoomsSnapshot.docs) {
      // Fetch messages inside this room
      const messagesRef = collection(db, 'chatRooms', roomDoc.id, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      
      if (messagesSnapshot.size > 0) {
        const batch = writeBatch(db);
        messagesSnapshot.docs.forEach((msgDoc) => {
          batch.delete(msgDoc.ref);
          totalDeleted++;
        });
        await batch.commit();
      }

      // Delete the room document itself
      await deleteDoc(roomDoc.ref);
      totalDeleted++;
    }
    console.log('[RESET DB] ✅ Wiped chatRooms and messages');

    console.log(`[RESET DB] 🎉 Database wipe completed. Total documents deleted: ${totalDeleted}`);
    return { success: true, count: totalDeleted };
  } catch (error: any) {
    console.error('[RESET DB] ❌ Failed to wipe Firestore collections:', error);
    throw new Error(error.message || 'Failed to wipe database');
  }
};
