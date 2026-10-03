import admin from 'firebase-admin';

export type ProfileGender = 'woman' | 'man' | 'other';

export const normalizeProfileGender = (value: unknown): ProfileGender | null =>
  value === 'woman' || value === 'man' || value === 'other' ? value : null;

export const assertWomenOnlyEligible = async (
  db: admin.firestore.Firestore,
  userId: string,
): Promise<void> => {
  const user = await db.collection('users').doc(userId).get();
  if (!user.exists || normalizeProfileGender(user.data()?.gender) !== 'woman') {
    throw new Error('WOMEN_ONLY_ELIGIBILITY_REQUIRED');
  }
};
