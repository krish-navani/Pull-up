import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User } from '../types';
import { db } from './firebase';

export type PublicProfile = Pick<User, 'id' | 'fullName' | 'profileImage' | 'role' | 'course' | 'year' | 'division' | 'licenseVerified'> & {
  rating?: number;
  completedRides?: number;
  status?: string;
  lastSeen?: string;
  createdAt?: string;
  updatedAt?: string;
};

const PUBLIC_FIELDS = [
  'id', 'fullName', 'profileImage', 'role', 'course', 'year', 'division', 'licenseVerified',
  'rating', 'completedRides', 'status', 'lastSeen', 'createdAt', 'updatedAt',
] as const;

export const sanitizePublicProfile = (userId: string, source: Record<string, any>): PublicProfile => {
  const profile: Record<string, any> = { id: userId };
  for (const field of PUBLIC_FIELDS) {
    if (field !== 'id' && source[field] !== undefined) profile[field] = source[field];
  }
  profile.updatedAt = source.updatedAt || new Date().toISOString();
  return profile as PublicProfile;
};

export const syncPublicProfile = async (userId: string, source: Record<string, any>): Promise<void> => {
  await setDoc(doc(db, 'publicProfiles', userId), sanitizePublicProfile(userId, source), { merge: true });
};

export const getPublicProfile = async (userId: string): Promise<PublicProfile | null> => {
  const snapshot = await getDoc(doc(db, 'publicProfiles', userId));
  return snapshot.exists() ? snapshot.data() as PublicProfile : null;
};