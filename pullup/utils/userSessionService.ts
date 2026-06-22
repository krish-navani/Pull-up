import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

/**
 * Sync the current Firebase Auth session UID to the persistent user profile ID in Firestore.
 * This resolves the permission-denied issues caused by anonymous session UID rotation on app restarts.
 */
export const syncUserSession = async (userId: string): Promise<void> => {
  try {
    const firebaseUser = auth.currentUser;
    if (firebaseUser) {
      console.log(`[SESSION] Syncing session UID: ${firebaseUser.uid} -> persistent user ID: ${userId}`);
      const sessionRef = doc(db, 'userSessions', firebaseUser.uid);
      await setDoc(sessionRef, {
        userId,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log('[SESSION] ✅ Session UID synced successfully in Firestore');
    } else {
      console.log('[SESSION] ⚠️ Firebase Auth currentUser is null, cannot sync session UID.');
    }
  } catch (error) {
    console.error('[SESSION] ❌ Failed to sync user session mapping:', error);
  }
};
