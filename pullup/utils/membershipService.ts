import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export type MembershipStatus = 'active' | 'payment_pending' | 'inactive' | 'failed_or_cancelled';

export interface UserMembershipState {
  isActive: boolean;
  status: MembershipStatus;
  expiryDate?: string | null;
  subscriptionId?: string | null;
  planId?: string | null;
}

/**
 * Evaluates membership state from user object.
 */
export function checkUserMembership(user: any): UserMembershipState {
  if (!user) {
    return { isActive: false, status: 'inactive' };
  }

  const rawStatus = String(user.subscriptionStatus || '').toLowerCase();
  const rawExpiry = user.subscriptionExpiry ? new Date(user.subscriptionExpiry).getTime() : null;
  const now = Date.now();

  if (rawStatus === 'active') {
    if (rawExpiry && rawExpiry <= now) {
      return {
        isActive: false,
        status: 'inactive',
        expiryDate: user.subscriptionExpiry,
        subscriptionId: user.subscriptionId || null,
        planId: user.subscriptionPlanId || null,
      };
    }
    return {
      isActive: true,
      status: 'active',
      expiryDate: user.subscriptionExpiry || null,
      subscriptionId: user.subscriptionId || null,
      planId: user.subscriptionPlanId || null,
    };
  }

  if (['payment_pending', 'pending', 'authenticated', 'created'].includes(rawStatus)) {
    return {
      isActive: false,
      status: 'payment_pending',
      subscriptionId: user.subscriptionId || null,
    };
  }

  if (['halted', 'payment_failed', 'cancelled', 'paused'].includes(rawStatus)) {
    return {
      isActive: false,
      status: 'failed_or_cancelled',
      subscriptionId: user.subscriptionId || null,
    };
  }

  return {
    isActive: false,
    status: 'inactive',
  };
}

/**
 * Fetches latest membership state from Firestore for a given userId.
 */
export async function fetchUserMembership(userId: string): Promise<UserMembershipState> {
  if (!userId) return { isActive: false, status: 'inactive' };
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) return { isActive: false, status: 'inactive' };
    return checkUserMembership(userSnap.data());
  } catch (error) {
    console.error('[MEMBERSHIP SERVICE] Error fetching user membership:', error);
    return { isActive: false, status: 'inactive' };
  }
}
