import admin from 'firebase-admin';
import crypto from 'crypto';
import { getDb } from './firebase.js';

const ACTIVE_BOOKING_STATES = new Set(['pending', 'requested', 'accepted', 'confirmed', 'arrived']);
const ACTIVE_RIDE_STATES = new Set(['active', 'open', 'full']);
const REDACTED_NAME = 'Deleted PullUp user';

const getCloudinaryPublicId = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.includes('/upload/')) return null;
  try {
    const uploadedPath = decodeURIComponent(new URL(value).pathname.split('/upload/')[1] || '').replace(/^v\d+\//, '');
    return uploadedPath ? uploadedPath.replace(/\.[a-zA-Z0-9]+$/, '') : null;
  } catch {
    return null;
  }
};

const deleteCloudinaryMedia = async (urls: unknown[]): Promise<'deleted' | 'not_configured' | 'not_applicable'> => {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  const publicIds = [...new Set(urls.map(getCloudinaryPublicId).filter((value): value is string => Boolean(value)))];
  if (publicIds.length === 0) return 'not_applicable';
  if (!cloudName || !apiKey || !apiSecret) {
    console.warn('[ACCOUNT-DELETION] Cloudinary credentials are not configured; provider retention applies to uploaded media.');
    return 'not_configured';
  }
  for (const publicId of publicIds) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`).digest('hex');
    const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature });
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: 'POST', body });
    if (!response.ok) throw new Error(`Cloudinary deletion failed with HTTP ${response.status}`);
  }
  return 'deleted';
};

const commitOperations = async (operations: Array<(batch: FirebaseFirestore.WriteBatch) => void>) => {
  const db = getDb();
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch();
    operations.slice(offset, offset + 400).forEach((operation) => operation(batch));
    await batch.commit();
  }
};

const queryBoth = async (collectionName: string, fields: string[], uid: string) => {
  const snapshots = await Promise.all(fields.map((field) => getDb().collection(collectionName).where(field, '==', uid).get()));
  const docs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => docs.set(document.ref.path, document)));
  return [...docs.values()];
};

export const createDeletionAuthorization = async (email: string): Promise<string> => {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const users = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
  // Do not expose whether an account exists. A token with no UID can never authorize deletion.
  const uid = users.empty ? null : users.docs[0].id;
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await db.collection('accountDeletionAuthorizations').doc(tokenHash).set({
    uid,
    emailHash: crypto.createHash('sha256').update(normalizedEmail).digest('hex'),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
    used: false,
  });
  return token;
};

export const consumeDeletionAuthorization = async (token: string): Promise<string> => {
  const db = getDb();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const ref = db.collection('accountDeletionAuthorizations').doc(tokenHash);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!snapshot.exists || !data?.uid || data.used || data.expiresAt?.toMillis() < Date.now()) {
      throw Object.assign(new Error('Deletion authorization is invalid or expired.'), { status: 401 });
    }
    transaction.update(ref, { used: true, usedAt: admin.firestore.FieldValue.serverTimestamp() });
    return data.uid as string;
  });
};

export const deletePullUpAccount = async (uid: string): Promise<{ alreadyDeleted: boolean }> => {
  const db = getDb();
  const uidHash = crypto.createHash('sha256').update(uid).digest('hex');
  const auditRef = db.collection('accountDeletionAudit').doc(uidHash);
  const existingAudit = await auditRef.get();
  if (existingAudit.data()?.status === 'completed') {
    await admin.auth().deleteUser(uid).catch((error: any) => {
      if (error?.code !== 'auth/user-not-found') throw error;
    });
    return { alreadyDeleted: true };
  }

  const userRef = db.collection('users').doc(uid);
  const userBeforeDeletion = (await userRef.get()).data() || {};
  await auditRef.set({ status: 'processing', requestedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await userRef.set({ deletionStatus: 'processing', fcmToken: null, expoPushToken: null, pushToken: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  const [bookings, rides, taxiPools, poolMembers, poolRequests, waitlist, queue, scheduled] = await Promise.all([
    queryBoth('bookings', ['passengerId', 'driverId'], uid),
    queryBoth('rides', ['driverId'], uid),
    queryBoth('taxiPools', ['creatorId'], uid),
    queryBoth('poolMembers', ['passengerId'], uid),
    queryBoth('poolRequests', ['passengerId', 'creatorId'], uid),
    queryBoth('rideWaitlist', ['userId', 'passengerId'], uid),
    queryBoth('notificationQueue', ['userId', 'targetUserId'], uid),
    queryBoth('scheduledNotifications', ['userId', 'targetUserId'], uid),
  ]);

  const operations: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  bookings.forEach((document) => {
    const data = document.data();
    const active = ACTIVE_BOOKING_STATES.has(String(data.status || '').toLowerCase());
    operations.push((batch) => batch.set(document.ref, {
      ...(active ? { status: 'cancelled', cancellationReason: 'account_deleted', cancelledAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      ...(data.passengerId === uid ? { passengerName: REDACTED_NAME, passengerImage: null, passengerPhone: null, passengerDeleted: true } : {}),
      ...(data.driverId === uid ? { driverName: REDACTED_NAME, driverImage: null, driverPhone: null, driverDeleted: true } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }));
  });
  rides.forEach((document) => {
    const data = document.data();
    const active = ACTIVE_RIDE_STATES.has(String(data.status || '').toLowerCase());
    operations.push((batch) => batch.set(document.ref, {
      ...(active ? { status: 'cancelled', cancellationReason: 'account_deleted', cancelledAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      driverName: REDACTED_NAME,
      driverImage: null,
      driverPhone: null,
      driverDeleted: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }));
  });
  taxiPools.forEach((document) => {
    const data = document.data();
    const active = ACTIVE_RIDE_STATES.has(String(data.status || '').toLowerCase());
    operations.push((batch) => batch.set(document.ref, {
      ...(active ? { status: 'cancelled', cancellationReason: 'account_deleted' } : {}),
      creatorName: REDACTED_NAME,
      creatorImage: null,
      creatorDeleted: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }));
  });
  [...poolMembers, ...poolRequests].forEach((document) => operations.push((batch) => batch.set(document.ref, {
    status: 'cancelled',
    passengerName: REDACTED_NAME,
    passengerImage: null,
    accountDeleted: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })));
  [...waitlist, ...queue, ...scheduled].forEach((document) => operations.push((batch) => batch.delete(document.ref)));
  await commitOperations(operations);

  const mediaCleanup = await deleteCloudinaryMedia([userBeforeDeletion.profileImage, userBeforeDeletion.licenseImageUri, userBeforeDeletion.licenseImageUrl]);
  const userSnapshot = await userRef.get();
  if (userSnapshot.exists) await db.recursiveDelete(userRef);
  await Promise.all([
    db.collection('userSessions').doc(uid).delete().catch(() => undefined),
    db.collection('publicProfiles').doc(uid).delete().catch(() => undefined),
    db.collection('wallets').doc(uid).delete().catch(() => undefined),
  ]);

  await admin.auth().deleteUser(uid).catch((error: any) => {
    if (error?.code !== 'auth/user-not-found') throw error;
  });
  await auditRef.set({
    status: 'completed',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    retention: 'Shared completed ride and payment audit records retained in anonymized form.',
    mediaCleanup,
  }, { merge: true });
  return { alreadyDeleted: false };
};