import admin from 'firebase-admin';
import { config } from './config.js';

let dbInstance: admin.firestore.Firestore | null = null;

export const initializeFirebase = () => {
  if (!admin.apps.length) {
    if (
      !config.firebase.projectId ||
      !config.firebase.privateKey ||
      !config.firebase.clientEmail
    ) {
      throw new Error('Firebase config is incomplete');
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId,
          privateKey: config.firebase.privateKey,
          clientEmail: config.firebase.clientEmail,
        }),
      });

      console.log('[FIREBASE] Initialized');
    } catch (error: any) {
        console.error('[FIREBASE] Init error:', error.message);
      throw error;
    }
  }

  if (!dbInstance) {
    dbInstance = admin.firestore();
  }

  return dbInstance;
};

export const getDb = () => {
  if (!dbInstance) {
    return initializeFirebase();
  }
  return dbInstance;
};

// Graceful shutdown
export const closeFirebase = async () => {
  if (dbInstance) {
    await dbInstance.terminate();
    dbInstance = null;
  }
};