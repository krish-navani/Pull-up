import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

type FirestoreOperation =
  | 'setDoc'
  | 'updateDoc'
  | 'addDoc'
  | 'getDoc'
  | 'getDocs'
  | 'deleteDoc'
  | 'onSnapshot';

type TraceOptions = {
  path?: string;
  destinationId?: string | null;
  merge?: boolean;
  contextUserId?: string | null;
};

function safeJson(value: any): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error: any) {
    return `[unserializable payload: ${error?.message || error}]`;
  }
}

export async function forensicTrace<T>(
  operation: FirestoreOperation,
  collectionName: string,
  docId: string | null,
  payload: any,
  fn: () => Promise<T>,
  options?: TraceOptions
): Promise<T> {
  const currentAuthUid = auth.currentUser?.uid || 'NULL';
  const isAnonymous = auth.currentUser?.isAnonymous ?? null;
  const fullPath = options?.path || (docId ? `${collectionName}/${docId}` : collectionName);
  const destinationId = options?.destinationId ?? docId ?? null;

  let asyncStorageUserId = 'NULL';
  let asyncStorageRawUser = 'NULL';
  let asyncStorageRole = 'NULL';

  try {
    const storedUserStr = await AsyncStorage.getItem('pullup_user_data');
    if (storedUserStr) {
      const storedUser = JSON.parse(storedUserStr);
      asyncStorageUserId = storedUser?.id || 'NULL';
      asyncStorageRawUser = safeJson(storedUser);
    }
    asyncStorageRole = (await AsyncStorage.getItem('pullup_user_role')) || 'NULL';
  } catch (error: any) {
    asyncStorageRawUser = `[AsyncStorage read failed: ${error?.message || error}]`;
  }

  console.log('[FORENSIC-TRACE] === START FIRESTORE CALL ===');
  console.log(`[FORENSIC-TRACE] Operation: ${operation}`);
  console.log(`[FORENSIC-TRACE] Path: ${fullPath}`);
  console.log(`[FORENSIC-TRACE] Collection/Query Root: ${collectionName}`);
  console.log(`[FORENSIC-TRACE] Document ID: ${docId || 'N/A'}`);
  console.log(`[FORENSIC-TRACE] Destination Document ID: ${destinationId || 'N/A'}`);
  console.log(`[FORENSIC-TRACE] Options: ${safeJson({ merge: options?.merge ?? false })}`);
  console.log(`[FORENSIC-TRACE] Authenticated Firebase UID: ${currentAuthUid}`);
  console.log(`[FORENSIC-TRACE] request.auth.uid: ${currentAuthUid}`);
  console.log(`[FORENSIC-TRACE] auth.currentUser.isAnonymous: ${isAnonymous}`);
  console.log(`[FORENSIC-TRACE] Context User ID: ${options?.contextUserId || 'N/A'}`);
  console.log(`[FORENSIC-TRACE] AsyncStorage User ID: ${asyncStorageUserId}`);
  console.log(`[FORENSIC-TRACE] AsyncStorage Role: ${asyncStorageRole}`);
  console.log(`[FORENSIC-TRACE] AsyncStorage User Snapshot: ${asyncStorageRawUser}`);
  console.log(`[FORENSIC-TRACE] Request Payload: ${safeJson(payload)}`);
  console.log(`[FORENSIC-TRACE] Caller Stack:\n${new Error().stack || 'N/A'}`);

  try {
    const result = await fn();
    console.log('[FORENSIC-TRACE] Result: SUCCESS');
    console.log('[FORENSIC-TRACE] === END FIRESTORE CALL ===');
    return result;
  } catch (error: any) {
    console.log('[FORENSIC-TRACE] Result: FAILED');
    console.log(`[FORENSIC-TRACE] Failed Path: ${fullPath}`);
    console.log(`[FORENSIC-TRACE] Failed Operation: ${operation}`);
    console.log(`[FORENSIC-TRACE] Failed Auth UID: ${currentAuthUid}`);
    console.log(`[FORENSIC-TRACE] Failed Destination ID: ${destinationId || 'N/A'}`);
    console.log(`[FORENSIC-TRACE] Exact Exception: ${error?.name || 'Error'} - ${error?.message || error}`);
    console.log(`[FORENSIC-TRACE] Exception Code: ${error?.code || 'N/A'}`);
    console.log(`[FORENSIC-TRACE] Exception JSON: ${safeJson(error)}`);
    console.log(`[FORENSIC-TRACE] Complete Stack Trace:\n${error?.stack || new Error().stack}`);
    console.log('[FORENSIC-TRACE] === END FIRESTORE CALL ===');
    throw error;
  }
}
