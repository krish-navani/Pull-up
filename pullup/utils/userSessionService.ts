import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { forensicTrace } from './forensicLogger';

/**
 * Sync the current Firebase Auth session UID to the persistent user profile ID in Firestore.
 * Security rule required for this write:
 * /userSessions/{sessionId}: request.auth.uid == sessionId
 */
export const syncUserSession = async (userId: string): Promise<void> => {
  const firebaseUser = auth.currentUser;

  if (!firebaseUser) {
    console.error('[SESSION] Cannot sync session mapping because auth.currentUser is null.');
    throw new Error('Cannot sync user session: auth.currentUser is null');
  }

  if (firebaseUser.isAnonymous) {
    console.error('[SESSION] Refusing to sync anonymous Firebase Auth UID into userSessions.');
    throw new Error('Cannot sync user session: auth.currentUser is anonymous');
  }

  if (userId !== firebaseUser.uid) {
    console.warn(
      `[SESSION] Ignoring stale persistent user ID ${userId}; using authenticated UID ${firebaseUser.uid}.`
    );
  }

  const persistentUserId = firebaseUser.uid;

  console.log(`[SESSION] Syncing session UID ${firebaseUser.uid} -> persistent user ID ${persistentUserId}`);

  const sessionRef = doc(db, 'userSessions', firebaseUser.uid);
  const payload = {
    userId: persistentUserId,
    updatedAt: serverTimestamp(),
  };

  await forensicTrace(
    'setDoc',
    'userSessions',
    firebaseUser.uid,
    payload,
    () => setDoc(sessionRef, payload, { merge: true }),
    {
      path: `userSessions/${firebaseUser.uid}`,
      destinationId: firebaseUser.uid,
      merge: true,
      contextUserId: persistentUserId,
    }
  );

  console.log('[SESSION] Session UID synced successfully in Firestore');
};
