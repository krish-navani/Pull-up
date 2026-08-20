import { collection, getDocs, query, where } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { sendOTPViaBackend, verifyOTPViaBackend } from './backendApiClient';
import { auth, db } from './firebase';
import { forensicTrace } from './forensicLogger';

/**
 * Ensure the client is authenticated before legacy Firestore reads.
 * This is not used for OTP storage; otpVerification is backend-only by rules.
 */
const ensureAuthenticated = async (): Promise<void> => {
  if (!auth.currentUser) {
    console.log('[OTP] No active Firebase Auth session. Signing in anonymously...');
    const userCredential = await signInAnonymously(auth);
    console.log('[OTP] Anonymous authentication successful, UID:', userCredential.user.uid);
  }
};

const UNIVERSITY_DOMAIN = '@atlasskilltech.university';

/**
 * Send OTP to email via backend.
 * Do not fall back to client Firestore writes: firestore.rules intentionally has
 * otpVerification read/write disabled for clients.
 */
export const sendOTPEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
  const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;
  try {
    console.log('[OTP] Calling backend to send OTP for:', fullEmail);
    const result = await sendOTPViaBackend(fullEmail);
    console.log('[OTP] Backend returned:', result);
    return result;
  } catch (error: any) {
    console.error(
      '[OTP] Backend OTP send failed. Client Firestore OTP fallback is disabled by security rules:',
      error.message
    );
    throw {
      code: error.code || 'SEND_OTP_ERROR',
      message: error.message || 'Failed to send OTP. Please try again.',
    };
  }
};

/**
 * Verify OTP via backend.
 * The backend returns the Firebase custom token; clients must not read
 * otpVerification directly because rules deny that collection.
 */
export const verifyOTP = async (
  email: string,
  otp: string
): Promise<{ success: boolean; firebaseToken?: string; userId?: string }> => {
  const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;
  try {
    console.log('[OTP] Verifying OTP via backend for:', fullEmail);
    const result = await verifyOTPViaBackend(fullEmail, otp);
    console.log('[OTP] Backend verified OTP');
    return result;
  } catch (error: any) {
    console.error(
      '[OTP] Backend verification failed. Client Firestore OTP fallback is disabled by security rules:',
      error.message
    );
    throw {
      code: error.code || 'VERIFY_OTP_ERROR',
      message: error.message || 'OTP verification failed',
    };
  }
};

/**
 * Check if email exists in users collection
 */
export const checkEmailExists = async (
  email: string,
  options?: { requireExistingAuth?: boolean }
): Promise<boolean> => {
  try {
    const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;

    console.log('[OTP] checkEmailExists: Querying for email =', fullEmail);

    if (options?.requireExistingAuth) {
      if (!auth.currentUser || auth.currentUser.isAnonymous) {
        throw new Error('checkEmailExists requires an active custom-token Firebase session.');
      }
    } else {
      await ensureAuthenticated();
    }

    const usersQuery = query(
      collection(db, 'users'),
      where('email', '==', fullEmail)
    );
    const snapshot = await forensicTrace('getDocs', 'users', null, { email: fullEmail }, () =>
      getDocs(usersQuery)
    );

    const exists = !snapshot.empty;
    console.log('[OTP] checkEmailExists result:', exists, '| Users found:', snapshot.size);

    if (exists && snapshot.size > 0) {
      console.log('[OTP] User document data:', snapshot.docs[0].data());
    }

    return exists;
  } catch (error) {
    console.error('[OTP] checkEmailExists error:', error);
    return false;
  }
};
