import admin from 'firebase-admin';

export type MembershipStatus = 'active' | 'payment_pending' | 'inactive' | 'failed_or_cancelled';

export interface MembershipCheckResult {
  isActive: boolean;
  status: MembershipStatus;
  expiryDate?: string | null;
  subscriptionId?: string | null;
  planId?: string | null;
}

/**
 * Validates whether a user has an active PullUp membership / pass.
 */
export function evaluateUserMembership(userData: any): MembershipCheckResult {
  if (!userData) {
    return { isActive: false, status: 'inactive' };
  }

  const rawStatus = String(userData.subscriptionStatus || '').toLowerCase();
  const rawExpiry = userData.subscriptionExpiry ? new Date(userData.subscriptionExpiry).getTime() : null;
  const now = Date.now();

  // If status is active, check expiry if present
  if (rawStatus === 'active') {
    if (rawExpiry && rawExpiry <= now) {
      return {
        isActive: false,
        status: 'inactive',
        expiryDate: userData.subscriptionExpiry,
        subscriptionId: userData.subscriptionId || null,
        planId: userData.subscriptionPlanId || null,
      };
    }
    return {
      isActive: true,
      status: 'active',
      expiryDate: userData.subscriptionExpiry || null,
      subscriptionId: userData.subscriptionId || null,
      planId: userData.subscriptionPlanId || null,
    };
  }

  if (['payment_pending', 'pending', 'authenticated', 'created'].includes(rawStatus)) {
    return {
      isActive: false,
      status: 'payment_pending',
      subscriptionId: userData.subscriptionId || null,
    };
  }

  if (['halted', 'payment_failed', 'cancelled', 'paused'].includes(rawStatus)) {
    return {
      isActive: false,
      status: 'failed_or_cancelled',
      subscriptionId: userData.subscriptionId || null,
    };
  }

  return {
    isActive: false,
    status: 'inactive',
  };
}

/**
 * Asserts active membership in backend routes, throwing error if not active.
 */
export async function assertActiveMembership(
  db: admin.firestore.Firestore,
  userId: string
): Promise<MembershipCheckResult> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new Error('USER_NOT_FOUND');
  }

  const result = evaluateUserMembership(userDoc.data());
  if (!result.isActive) {
    const error: any = new Error('MEMBERSHIP_REQUIRED');
    error.code = 'MEMBERSHIP_REQUIRED';
    error.status = result.status;
    throw error;
  }

  return result;
}
