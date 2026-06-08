import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
// @ts-ignore - getReactNativePersistence is not exposed in default firebase/auth type declarations for node, but works at runtime in React Native
import { Auth, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

if (!firebaseConfig.apiKey) {
  console.error('[FIREBASE] ❌ CRITICAL: Firebase API key is missing! Check environment variables.');
}
if (!firebaseConfig.projectId) {
  console.error('[FIREBASE] ❌ CRITICAL: Firebase project ID is missing! Check environment variables.');
}

// Initialize Firebase only once (safe for hot-reload)
const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth with AsyncStorage persistence for React Native
let auth: Auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e: any) {
    // Auth already initialized (e.g., hot-reload) — reuse the existing instance
    console.warn('[FIREBASE] Auth already initialized, reusing instance:', e?.message);
    auth = getAuth(app);
  }
}

export { auth };

export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

export default app;
