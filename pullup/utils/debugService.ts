/**
 * Debug utilities for troubleshooting app issues
 */

import { verifyEmailConfig } from './emailService';

/**
 * Verify all critical configurations on app startup
 */
export const verifyAppConfiguration = async () => {
  console.log('[DEBUG] ============ APP CONFIGURATION CHECK ============');
  
  // Check Firebase
  const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ? '✅ SET' : '❌ MISSING',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✅ SET' : '❌ MISSING',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ? '✅ SET' : '❌ MISSING',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ? '✅ SET' : '❌ MISSING',
  };
  console.log('[DEBUG] Firebase Config:', firebaseConfig);

  // Check OTP Backend
  const otpBackendConfig = {
    backendUrl: process.env.EXPO_PUBLIC_OTP_BACKEND_URL ? '✅ SET' : '❌ MISSING',
  };
  console.log('[DEBUG] OTP Backend Config:', otpBackendConfig);

  // Verify OTP Backend
  try {
    const backendValid = await verifyEmailConfig();
    console.log('[DEBUG] OTP Backend Verification:', backendValid ? '✅ VALID' : '❌ INVALID');
  } catch (error) {
    console.error('[DEBUG] OTP Backend Verification Error:', error);
  }

  // Check OTP settings
  const otpConfig = {
    length: process.env.EXPO_PUBLIC_OTP_LENGTH || '6',
    expiryMinutes: process.env.EXPO_PUBLIC_OTP_EXPIRY_MINUTES || '10',
  };
  console.log('[DEBUG] OTP Config:', otpConfig);

  console.log('[DEBUG] ====================================================\n');
};

/**
 * Log detailed OTP verification attempt
 */
export const logOTPAttempt = (email: string, attemptType: 'send' | 'verify') => {
  console.log(`[DEBUG] OTP ${attemptType.toUpperCase()} ATTEMPT:`, {
    email,
    timestamp: new Date().toISOString(),
  });
};
