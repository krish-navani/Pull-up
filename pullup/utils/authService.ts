import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    User as FirebaseUser,
    signInAnonymously,
    signOut,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { User } from '../types';
import { auth, db } from './firebase';
import { checkEmailExists, deleteOTP, sendOTPEmail, validateVerifiedOTP, verifyOTP } from './otpService';

const UNIVERSITY_DOMAIN = '@atlasskilltech.university';
const STORAGE_KEY_USER = 'pullup_user_data';
const STORAGE_KEY_ROLE = 'pullup_user_role';

/**
 * Save user data to device storage for persistent login
 */
export const saveUserToStorage = async (user: User): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    if (user.role) {
      await AsyncStorage.setItem(STORAGE_KEY_ROLE, user.role);
    }
    console.log('[AUTH] User data saved to storage:', user.id);
  } catch (error) {
    console.error('[AUTH] Failed to save user to storage:', error);
  }
};

/**
 * Load user data from device storage
 */
export const loadUserFromStorage = async (): Promise<User | null> => {
  try {
    const userData = await AsyncStorage.getItem(STORAGE_KEY_USER);
    if (userData) {
      const user = JSON.parse(userData) as User;
      // Ensure profileComplete has a sensible default if missing
      if (user.profileComplete === undefined || user.profileComplete === null) {
        user.profileComplete = true;
        console.log('[AUTH] Restored user from storage with profileComplete defaulted to:', user.profileComplete);
      }
      console.log('[AUTH] User loaded from storage:', user.id, '| profileComplete:', user.profileComplete);
      return user;
    }
    return null;
  } catch (error) {
    console.error('[AUTH] Failed to load user from storage:', error);
    return null;
  }
};

/**
 * Clear user data from device storage
 */
export const clearUserFromStorage = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_USER);
    await AsyncStorage.removeItem(STORAGE_KEY_ROLE);
    console.log('[AUTH] User data cleared from storage');
  } catch (error) {
    console.error('[AUTH] Failed to clear user from storage:', error);
  }
};

export interface OTPSignUpData {
  email: string;
  fullName: string;
  phone: string;
  year: User['year'];
  course: string;
  division: string;
  role: 'passenger' | 'driver';
  profileImage?: string; // Cloudinary URL for profile picture
}

export interface OTPLoginData {
  email: string;
}

/**
 * Step 1: Send OTP to email
 */
export const sendOTP = async (email: string): Promise<{ success: boolean; message: string }> => {
  try {
    const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;

    // Validate email domain
    if (!fullEmail.endsWith(UNIVERSITY_DOMAIN)) {
      const error = `Please use your atlas university email (${UNIVERSITY_DOMAIN})`;
      throw new Error(error);
    }
    
    // Send OTP
    const result = await sendOTPEmail(email);
    return result;
  } catch (error: any) {
    throw {
      code: error.code || 'SEND_OTP_ERROR',
      message: error.message || 'Failed to send OTP',
    };
  }
};

/**
 * Step 2: Verify OTP and create account (for signup)
 */
export const verifyOTPAndCreateAccount = async (
  email: string,
  otp: string,
  signUpData: OTPSignUpData
): Promise<User> => {
  try {
    const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;

    // Check if email already exists
    const emailExists = await checkEmailExists(fullEmail);
    if (emailExists) {
      const error = 'This email is already registered';
      throw new Error(error);
    }

    // Validate OTP (it was already verified in signup screen, just validate it still exists and is valid)
    await validateVerifiedOTP(email, otp);

    // Create anonymous auth user
    const userCredential = await signInAnonymously(auth);
    const firebaseUser = userCredential.user;

    // Create user document in Firestore
    const userData: User = {
      id: firebaseUser.uid,
      email: fullEmail,
      fullName: signUpData.fullName,
      phone: signUpData.phone || '',
      year: signUpData.year,
      course: signUpData.course,
      division: signUpData.division,
      role: signUpData.role,
      profileImage: signUpData.profileImage || null,
      licenseVerified: false,
      profileComplete: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log('[AUTH] Creating account with profileComplete =', userData.profileComplete);
    await setDoc(doc(db, 'users', firebaseUser.uid), userData);

    // Delete OTP after successful verification
    await deleteOTP(email);
    
    // Save user data to device storage for persistent login
    await saveUserToStorage(userData);
    
    console.log('[AUTH] Account created successfully with profileComplete:', userData.profileComplete);
    return userData;
  } catch (error: any) {
    throw {
      code: error.code || 'VERIFY_OTP_ERROR',
      message: error.message || 'OTP verification failed',
    };
  }
};

/**
 * Step 2 (Alternative): Verify OTP and login (for existing users)
 */
export const verifyOTPAndLogin = async (email: string, otp: string): Promise<User> => {
  try {
    const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;

    // Verify OTP
    await verifyOTP(email, otp);

    // Get user data from Firestore
    const usersQuery = query(collection(db, 'users'), where('email', '==', fullEmail));
    const snapshot = await getDocs(usersQuery);

    if (snapshot.empty) {
      throw new Error('User not found. Please sign up first.');
    }

    const userDoc = snapshot.docs[0];
    const userData = ensureUserDefaults(userDoc.data());

    console.log('[AUTH] Login: User data:', {
      profileComplete: userData.profileComplete,
      role: userData.role,
      licenseVerified: userData.licenseVerified,
    });

    // Note: We no longer block login for unverified drivers.
    // The navigation guard in _layout.tsx will redirect them to license-upload.
    // This prevents the circular dependency where they can't access any screens.
    if (userData.role === 'driver' && !userData.licenseVerified) {
      console.warn('[AUTH] ⚠️ Driver license not verified - navigation guard will redirect to license verification');
    }

    // Sign in anonymously (for persistence)
    const userCredential = await signInAnonymously(auth);

    // Delete OTP after successful verification
    await deleteOTP(email);

    // Save user data to device storage for persistent login
    console.log('[AUTH] Saving user to storage with profileComplete:', userData.profileComplete);
    await saveUserToStorage(userData);

    return userData;
  } catch (error: any) {
    throw {
      code: error.code || 'VERIFY_OTP_ERROR',
      message: error.message || 'OTP verification failed',
    };
  }
};

/**
 * Ensure user data from Firestore has safe defaults for critical fields.
 * This prevents navigation guard mismatches when fields are undefined.
 */
const ensureUserDefaults = (firestoreData: Record<string, any>): User => {
  const isStatusVerified = firestoreData?.licenseVerificationStatus === 'verified';
  return {
    ...firestoreData,
    profileComplete: firestoreData?.profileComplete ?? true,
    licenseVerified: firestoreData?.licenseVerified === true || isStatusVerified,
    licenseVerificationStatus: firestoreData?.licenseVerificationStatus ?? undefined,
    role: firestoreData?.role ?? 'passenger',
  } as User;
};

/**
 * Get current user data
 */
export const getCurrentUser = async (): Promise<User | null> => {
  // First try to look up by the stored user ID (from original signup)
  // This is necessary because signInAnonymously creates new UIDs each time
  try {
    const storedUser = await loadUserFromStorage();
    if (storedUser?.id) {
      const userRef = doc(db, 'users', storedUser.id);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        return ensureUserDefaults(userDoc.data());
      } else {
        // Self-healing: Re-create the user document in Firestore using the local cached user data.
        // This handles cases where the database was wiped but the local app is still logged in.
        console.log('[AUTH] ℹ️ Stored user document not found in Firestore. Re-creating document for:', storedUser.id);
        const userData: User = {
          ...storedUser,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(userRef, userData);
        console.log('[AUTH] ✅ Re-created user document in Firestore.');
        return userData;
      }
    }
  } catch (error) {
    console.error('[AUTH] Error looking up user by stored ID:', error);
  }

  // Fallback to Firebase auth UID
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    return null;
  }

  try {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // If Firebase user is authenticated but no Firestore doc exists,
      // try to recover by copying the local storedUser to this UID.
      const storedUser = await loadUserFromStorage();
      if (storedUser) {
        console.log('[AUTH] ℹ️ Firestore user doc not found. Re-creating on UID:', firebaseUser.uid);
        const userData: User = {
          ...storedUser,
          id: firebaseUser.uid, // Sync ID with active Auth UID
          updatedAt: new Date().toISOString(),
        };
        await setDoc(userRef, userData);
        console.log('[AUTH] ✅ Re-created user document on active UID.');
        return userData;
      }
      return null;
    }

    return ensureUserDefaults(userDoc.data());
  } catch (error) {
    return null;
  }
};

/**
 * Refresh user data from Firestore and update local storage.
 * Returns the refreshed user data, or null if not found.
 */
export const refreshUserFromFirestore = async (): Promise<User | null> => {
  try {
    const freshUser = await getCurrentUser();
    if (freshUser) {
      await saveUserToStorage(freshUser);
      console.log('[AUTH] User data refreshed from Firestore and saved to storage');
    }
    return freshUser;
  } catch (error) {
    console.error('[AUTH] Failed to refresh user from Firestore:', error);
    return null;
  }
};

/**
 * Unified OTP verification - handles both new and existing users
 * Returns user data and a flag indicating if this is a new user
 */
export interface VerifyOTPResult {
  user: User | null;
  isNewUser: boolean;
}

export const verifyOTPAndAutoAuth = async (email: string, otp: string): Promise<VerifyOTPResult> => {
  try {
    const fullEmail = email.includes('@') ? email : email + UNIVERSITY_DOMAIN;
    
    console.log('[AUTH] verifyOTPAndAutoAuth: Checking for email =', fullEmail);

    // Verify OTP first
    await verifyOTP(email, otp);
    console.log('[AUTH] ✅ OTP verified successfully');

    // Check if email exists
    const emailExists = await checkEmailExists(fullEmail);
    console.log('[AUTH] checkEmailExists result =', emailExists, 'for email:', fullEmail);

    if (emailExists) {
      // Existing user - login
      console.log('[AUTH] Existing user found, fetching user data from Firestore...');
      const usersQuery = query(collection(db, 'users'), where('email', '==', fullEmail));
      const snapshot = await getDocs(usersQuery);

      if (snapshot.empty) {
        console.error('[AUTH] ❌ User email found but no user document in Firestore');
        throw new Error('User profile not found');
      }

      const userDoc = snapshot.docs[0];
      const userData = ensureUserDefaults(userDoc.data());
      
      console.log('[AUTH] Firestore user data:', {
        id: userData.id,
        email: userData.email,
        profileComplete: userData.profileComplete,
        role: userData.role,
        licenseVerified: userData.licenseVerified,
      });

      console.log('[AUTH] ✅ Auto-Auth: Existing user found with profileComplete =', userData.profileComplete);

      // Note: We allow drivers to proceed even if license is not verified.
      // The app routing will handle redirecting them to license-upload screen.
      // This prevents a circular dependency where they can't access any auth screens.
      if (userData.role === 'driver' && !userData.licenseVerified) {
        console.warn('[AUTH] ⚠️ Driver license not verified yet - user will be redirected to license verification');
      }

      // Sign in anonymously (for persistence)
      await signInAnonymously(auth);
      console.log('[AUTH] ✅ Firebase anonymous auth completed');

      // Delete OTP after successful verification
      await deleteOTP(email);
      console.log('[AUTH] ✅ OTP deleted');

      // Save user data to device storage for persistent login
      console.log('[AUTH] Saving user to storage with profileComplete:', userData.profileComplete);
      await saveUserToStorage(userData);
      console.log('[AUTH] ✅ User saved to storage');

      return {
        user: userData,
        isNewUser: false,
      };
    } else {
      // New user - return null user but flag as new
      // OTP will be deleted after profile setup
      console.log('[AUTH] ℹ️ New user detected, will need profile setup');
      return {
        user: null,
        isNewUser: true,
      };
    }
  } catch (error: any) {
    console.error('[AUTH] ❌ verifyOTPAndAutoAuth failed:', error.message);
    throw {
      code: error.code || 'VERIFY_OTP_ERROR',
      message: error.message || 'OTP verification failed',
    };
  }
};

/**
 * Update user profile
 */
export const updateUserProfile = async (userId: string, updates: Partial<User>): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    throw {
      code: error.code || 'UPDATE_PROFILE_ERROR',
      message: error.message || 'Failed to update profile',
    };
  }
};

/**
 * Logout user
 */
export const logoutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
    // Clear user data from device storage
    await clearUserFromStorage();
  } catch (error: any) {
    throw {
      code: error.code || 'LOGOUT_ERROR',
      message: error.message || 'Failed to logout',
    };
  }
};

/**
 * Listen to auth state changes
 */
export const onAuthStateChanged = (callback: (user: FirebaseUser | null) => void) => {
  return auth.onAuthStateChanged(callback);
};
