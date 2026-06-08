import { collection, deleteDoc, doc, getDoc, getDocs, query, where, setDoc } from 'firebase/firestore';
import { Alert } from 'react-native';
import { sendOTPViaBackend, verifyOTPViaBackend } from './backendApiClient';
import { db } from './firebase';

const OTP_LENGTH = process.env.EXPO_PUBLIC_OTP_LENGTH ? parseInt(process.env.EXPO_PUBLIC_OTP_LENGTH, 10) : 4;
const OTP_EXPIRY_MINUTES = process.env.EXPO_PUBLIC_OTP_EXPIRY_MINUTES ? parseInt(process.env.EXPO_PUBLIC_OTP_EXPIRY_MINUTES, 10) : 10;
const UNIVERSITY_DOMAIN = '@atlasskilltech.university';

/**
 * Generate a random OTP
 */
export const generateOTP = (): string => {
  return Math.floor(Math.random() * Math.pow(10, OTP_LENGTH))
    .toString()
    .padStart(OTP_LENGTH, '0');
};

/**
 * Send OTP to email via backend
 */
export const sendOTPEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
  const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;
  try {
    console.log('[OTP] Calling backend to send OTP for:', fullEmail);

    // Call backend to send OTP
    const result = await sendOTPViaBackend(fullEmail);
    
    console.log('[OTP] ✅ Backend returned:', result);
    return result;
  } catch (error: any) {
    console.warn('[OTP] ❌ Backend OTP send failed, attempting direct Firestore fallback...', error.message);
    
    try {
      // Local dev mode fallback
      const otp = generateOTP();
      const otpDocId = fullEmail.replace(/[.@]/g, '_');
      const otpDocRef = doc(collection(db, 'otpVerification'), otpDocId);
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
      
      await setDoc(otpDocRef, {
        email: fullEmail,
        otp,
        createdAt: now,
        expiresAt: expiresAt,
        attempts: 0,
        maxAttempts: 5,
        used: false,
      });

      console.log(`[OTP] ⚠️ [Dev Mode Bypass] Created OTP ${otp} in Firestore for ${fullEmail}`);
      
      // Show Alert popup with the OTP so developer can copy it
      Alert.alert(
        'Dev Mode: OTP Generated',
        `Since the Vercel backend is not running/configured, a local OTP has been generated:\n\nOTP Code: ${otp}\n\n(This code has been saved to Firestore)`,
        [{ text: 'OK' }]
      );

      return {
        success: true,
        message: `[Dev Mode] Local OTP ${otp} generated in database (check terminal/popup).`,
      };
    } catch (fallbackError: any) {
      console.error('[OTP] ❌ Firestore fallback failed:', fallbackError.message);
      throw {
        code: 'SEND_OTP_ERROR',
        message: error.message || 'Failed to send OTP',
      };
    }
  }
};

/**
 * Verify OTP via backend
 */
export const verifyOTP = async (email: string, otp: string): Promise<boolean> => {
  const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;
  try {
    console.log('[OTP] Verifying OTP via backend for:', fullEmail);

    // Call backend to verify OTP
    await verifyOTPViaBackend(fullEmail, otp);
    
    console.log('[OTP] ✅ Backend verified OTP');
    return true;
  } catch (error: any) {
    console.warn('[OTP] ❌ Backend verification failed, attempting direct Firestore verification...', error.message);
    
    try {
      const otpDocId = fullEmail.replace(/[.@]/g, '_');
      const otpDocRef = doc(collection(db, 'otpVerification'), otpDocId);
      const otpDocSnapshot = await getDoc(otpDocRef);

      if (!otpDocSnapshot.exists()) {
        throw new Error('OTP not found in database. Please request a new one.');
      }

      const otpData = otpDocSnapshot.data();
      const now = new Date();
      const expiresAt = otpData.expiresAt?.toDate();

      if (expiresAt && now > expiresAt) {
        await deleteDoc(otpDocRef);
        throw new Error('OTP has expired. Please request a new one.');
      }

      if (otpData.used) {
        throw new Error('OTP has already been used. Please request a new one.');
      }

      if (otpData.otp !== otp) {
        throw new Error('Invalid OTP.');
      }

      // Mark as used
      await setDoc(otpDocRef, { ...otpData, used: true, verifiedAt: now }, { merge: true });
      console.log('[OTP] ✅ Locally verified OTP in Firestore');
      return true;
    } catch (fallbackError: any) {
      console.error('[OTP] ❌ Firestore verification failed:', fallbackError.message);
      throw {
        code: 'VERIFY_OTP_ERROR',
        message: fallbackError.message || 'OTP verification failed',
      };
    }
  }
};

/**
 * Delete OTP after user creation
 */
export const deleteOTP = async (email: string): Promise<void> => {
  try {
    const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;
    const otpDocId = fullEmail.replace(/[.@]/g, '_');
    await deleteDoc(doc(collection(db, 'otpVerification'), otpDocId));
  } catch (error) {
    // Silent fail
  }
};

/**
 * Check if email exists in users collection
 */
export const checkEmailExists = async (email: string): Promise<boolean> => {
  try {
    const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;
    
    console.log('[OTP] checkEmailExists: Querying for email =', fullEmail);
    
    const usersQuery = query(
      collection(db, 'users'),
      where('email', '==', fullEmail)
    );
    const snapshot = await getDocs(usersQuery);
    
    const exists = !snapshot.empty;
    console.log('[OTP] checkEmailExists result:', exists, '| Users found:', snapshot.size);
    
    if (exists && snapshot.size > 0) {
      console.log('[OTP] User document data:', snapshot.docs[0].data());
    }
    
    return exists;
  } catch (error) {
    console.error('[OTP] ❌ checkEmailExists error:', error);
    return false;
  }
};

/**
 * Validate that OTP was already verified (called from profile screen after signup)
 * Does NOT mark OTP as used again - just validates it was previously verified
 */
export const validateVerifiedOTP = async (email: string, otp: string): Promise<boolean> => {
  try {
    const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;
    const otpDocId = fullEmail.replace(/[.@]/g, '_');
    const otpDocRef = doc(collection(db, 'otpVerification'), otpDocId);
    const otpDocSnapshot = await getDoc(otpDocRef);

    // Check 1: OTP record exists
    if (!otpDocSnapshot.exists()) {
      throw new Error('OTP not found in database.');
    }

    const otpData = otpDocSnapshot.data();

    // Check 2: OTP not expired
    const now = new Date();
    const expiresAt = otpData.expiresAt?.toDate();

    if (now > expiresAt) {
      await deleteDoc(otpDocRef);
      throw new Error('OTP has expired. Please request a new one.');
    }

    // Check 3: OTP was marked as used (confirming it was verified in signup)
    if (!otpData.used) {
      throw new Error('OTP was not verified during signup. Please restart the signup process.');
    }

    // Check 4: OTP value matches
    if (otpData.otp !== otp) {
      throw new Error('OTP value mismatch. Invalid session.');
    }

    return true;
  } catch (error: any) {
    throw {
      code: 'VALIDATE_OTP_ERROR',
      message: error.message || 'OTP validation failed',
    };
  }
};
