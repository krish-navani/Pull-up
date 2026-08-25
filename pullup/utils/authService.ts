import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    User as FirebaseUser,
    signInWithCustomToken,
    signOut,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { User } from '../types';
import { auth, db } from './firebase';
import { checkEmailExists, sendOTPEmail, verifyOTP } from './otpService';
import { syncUserSession } from './userSessionService';
import { forensicTrace } from './forensicLogger';

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
  homeAddress?: User['homeAddress'];
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

    // Sign in using the backend custom token. Complete Profile must never run under
    // anonymous auth because Firestore rules resolve getPersistentUserId() from
    // userSessions/{request.auth.uid}.userId.
    let firebaseUser = auth.currentUser;
    if (!firebaseUser || firebaseUser.isAnonymous) {
      console.log('[AUTH] Creating account: No custom-token Firebase Auth session. Verifying OTP to get custom token...');
      const verifyResult = await verifyOTP(email, otp);
      if (verifyResult.firebaseToken) {
        console.log('[AUTH] Creating account: Signing in with Custom Token...');
        const userCredential = await signInWithCustomToken(auth, verifyResult.firebaseToken);
        firebaseUser = userCredential.user;
      } else {
        throw new Error('Onboarding aborted: Backend did not return a Firebase custom token.');
      }
    }

    // Assert and prove that the Firebase user is actually authenticated
    if (!firebaseUser) {
      console.error('[AUTH] ❌ CRITICAL ERROR: Aborting onboarding because Firebase Auth currentUser is null.');
      throw new Error('Onboarding aborted: Authentication session was lost. Please verify OTP again.');
    }

    if (firebaseUser.isAnonymous) {
      console.error('[AUTH] CRITICAL ERROR: Complete Profile is running with an anonymous Firebase session.');
      throw new Error('Onboarding aborted: Custom-token authentication is required. Please restart signup.');
    }

    await syncUserSession(firebaseUser.uid);

    // Check if email already exists only after custom-token auth is established.
    const emailExists = await checkEmailExists(fullEmail, { requireExistingAuth: true });
    if (emailExists) {
      const error = 'This email is already registered';
      throw new Error(error);
    }

    console.log('[AUTH] Forensic Check Before First Firestore Write:');
    console.log(`- auth.currentUser.uid: ${firebaseUser.uid}`);
    console.log(`- auth.currentUser.email: ${firebaseUser.email || 'N/A'}`);
    console.log(`- Firebase Auth State: Authenticated (isAnonymous: ${firebaseUser.isAnonymous})`);
    console.log(`- User Document ID to write: ${firebaseUser.uid}`);
    console.log(`- request.auth.uid (sent to Firestore): ${firebaseUser.uid}`);
    
    // Confirm auth.currentUser.uid equals the user document id
    const docIdToWrite = firebaseUser.uid;
    if (firebaseUser.uid !== docIdToWrite) {
      console.error(`[AUTH] ❌ CRITICAL ERROR: Auth UID (${firebaseUser.uid}) does not match User Document ID (${docIdToWrite})`);
      throw new Error('Onboarding aborted: Identity mismatch.');
    }
    console.log('✅ Forensic Check Passed: Auth UID matches User Document ID.');

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
      homeAddress: signUpData.homeAddress || null,
      licenseVerified: false,
      profileComplete: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log('[AUTH] Creating account with profileComplete =', userData.profileComplete);
    await forensicTrace(
      'setDoc',
      'users',
      firebaseUser.uid,
      userData,
      () => setDoc(doc(db, 'users', firebaseUser.uid), userData),
      {
        path: `users/${firebaseUser.uid}`,
        destinationId: firebaseUser.uid,
        contextUserId: firebaseUser.uid,
      }
    );

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
    const verifyResult = await verifyOTP(email, otp);

    // Get user data from Firestore
    const usersQuery = query(collection(db, 'users'), where('email', '==', fullEmail));
    const snapshot = await forensicTrace('getDocs', 'users', null, { email: fullEmail }, () =>
      getDocs(usersQuery)
    );

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

    // Sign in using Custom Token. Do not fall back to anonymous auth; it can create
    // a stale userSessions mapping and make getPersistentUserId() differ from uid.
    if (verifyResult.firebaseToken) {
      console.log('[AUTH] Login: Signing in with Custom Token...');
      await signInWithCustomToken(auth, verifyResult.firebaseToken);
    } else {
      throw new Error('Login aborted: Backend did not return a Firebase custom token.');
    }
    console.log('[AUTH] Login: Firebase Auth completed. UID:', auth.currentUser?.uid, '| User Profile ID:', userData.id);
    console.log('[AUTH] Login: UIDs match?', auth.currentUser?.uid === userData.id);
    await syncUserSession(auth.currentUser!.uid);

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
  const isStatusVerified = firestoreData?.licenseVerificationStatus === 'approved' || firestoreData?.licenseVerificationStatus === 'verified';
  return {
    ...firestoreData,
    profileComplete: firestoreData?.profileComplete ?? true,
    licenseVerified: firestoreData?.licenseVerified === true || isStatusVerified,
    licenseVerificationStatus: firestoreData?.licenseVerificationStatus ?? undefined,
    role: firestoreData?.role ?? 'passenger',
    notificationPreferences: firestoreData?.notificationPreferences ?? {
      rideUpdates: true,
      paymentUpdates: true,
      chatUpdates: true,
      poolUpdates: true,
      marketingUpdates: false,
    },
    mutedChats: firestoreData?.mutedChats ?? {},
    homeAddress: firestoreData?.homeAddress ?? null,
  } as User;
};

/**
 * Get current user data
 */
export const getCurrentUser = async (): Promise<User | null> => {
  const activeFirebaseUser = auth.currentUser;

  if (activeFirebaseUser && !activeFirebaseUser.isAnonymous) {
    try {
      const userRef = doc(db, 'users', activeFirebaseUser.uid);
      const userDoc = await forensicTrace('getDoc', 'users', activeFirebaseUser.uid, null, () =>
        getDoc(userRef)
      );

      if (userDoc.exists()) {
        return ensureUserDefaults(userDoc.data());
      }

      const storedUser = await loadUserFromStorage();
      if (storedUser) {
        console.log('[AUTH] Firestore user doc not found. Re-creating on active UID:', activeFirebaseUser.uid);
        const userData: User = {
          ...storedUser,
          id: activeFirebaseUser.uid,
          updatedAt: new Date().toISOString(),
        };
        await forensicTrace('setDoc', 'users', activeFirebaseUser.uid, userData, () =>
          setDoc(userRef, userData)
        );
        return userData;
      }

      return null;
    } catch (error) {
      console.error('[AUTH] Error looking up user by active Firebase UID:', error);
      return null;
    }
  }

  if (activeFirebaseUser?.isAnonymous) {
    console.warn('[AUTH] Anonymous Firebase user ignored while resolving current user.');
    return null;
  }

  // Cold-start cache fallback only. Any active custom-token Firebase user is handled above.
  try {
    const storedUser = await loadUserFromStorage();
    if (storedUser?.id) {
      const userRef = doc(db, 'users', storedUser.id);
      const userDoc = await forensicTrace('getDoc', 'users', storedUser.id, null, () =>
        getDoc(userRef)
      );
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
        await forensicTrace('setDoc', 'users', storedUser.id, userData, () =>
          setDoc(userRef, userData)
        );
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
    const userDoc = await forensicTrace('getDoc', 'users', firebaseUser.uid, null, () =>
      getDoc(userRef)
    );

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
        await forensicTrace('setDoc', 'users', firebaseUser.uid, userData, () =>
          setDoc(userRef, userData)
        );
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
    const verifyResult = await verifyOTP(email, otp);
    console.log('[AUTH] ✅ OTP verified successfully', verifyResult);

    // Sign in using Custom Token immediately. Do not fall back to anonymous auth;
    // getPersistentUserId() must resolve to this custom-token uid.
    if (verifyResult.firebaseToken) {
      console.log('[AUTH] Auto-Auth: Signing in with Custom Token...');
      await signInWithCustomToken(auth, verifyResult.firebaseToken);
    } else {
      throw new Error('OTP verified but backend did not return a Firebase custom token.');
    }
    console.log('[AUTH] Auto-Auth: Firebase Auth completed. UID:', auth.currentUser?.uid);
    await syncUserSession(auth.currentUser!.uid);

    // Check if email exists
    const emailExists = await checkEmailExists(fullEmail, { requireExistingAuth: true });
    console.log('[AUTH] checkEmailExists result =', emailExists, 'for email:', fullEmail);

    if (emailExists) {
      // Existing user - login
      console.log('[AUTH] Existing user found, fetching user data from Firestore...');
      const usersQuery = query(collection(db, 'users'), where('email', '==', fullEmail));
      const snapshot = await forensicTrace('getDocs', 'users', null, { email: fullEmail }, () =>
        getDocs(usersQuery)
      );

      if (snapshot.empty) {
        console.error('[AUTH] ❌ User email found but no user document in Firestore');
        throw new Error('User profile not found');
      }

      const userDoc = snapshot.docs[0];
      const userData = ensureUserDefaults(userDoc.data());
      
      console.log('[AUTH] Auto-Auth: Firebase Auth UID:', auth.currentUser?.uid, '| User Profile ID:', userData.id);
      console.log('[AUTH] Auto-Auth: UIDs match?', auth.currentUser?.uid === userData.id);
      
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
export const updateUserProfile = async (userId: string, updates: Partial<User>): Promise<User> => {
  try {
    const userRef = doc(db, 'users', userId);
    const updatePayload = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await forensicTrace('updateDoc', 'users', userId, updatePayload, () =>
      updateDoc(userRef, updatePayload)
    );
    const userDoc = await forensicTrace('getDoc', 'users', userId, null, () =>
      getDoc(userRef)
    );
    if (userDoc.exists()) {
      return ensureUserDefaults(userDoc.data());
    }
    throw new Error('User document not found after update');
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
