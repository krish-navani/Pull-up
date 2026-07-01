/**
 * Debug utilities for troubleshooting app issues
 */

import { verifyEmailConfig } from './emailService';

/**
 * Verify all critical configurations on app startup
 */
export const verifyAppConfiguration = async () => {
  console.log('[DEBUG] ============ APP CONFIGURATION CHECK ============');
  
  const envInfo = {
    Environment: process.env.NODE_ENV || 'development',
    'OTP Backend URL (Env)': process.env.EXPO_PUBLIC_OTP_BACKEND_URL || '❌ NOT SET',
    'API URL (Env)': process.env.EXPO_PUBLIC_API_URL || '❌ NOT SET',
    'Google Maps API Key': process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ? `✅ SET (${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.substring(0, 8)}...)` : '❌ MISSING',
    'Firebase Project': process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '❌ MISSING',
    'Build Profile / Config': __DEV__ ? 'Development Client / Expo Go' : 'Release / Built Binary',
  };
  console.log('[DEBUG] App Startup Environment:', envInfo);

  // Check Firebase Setup
  const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ? '✅ SET' : '❌ MISSING',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✅ SET' : '❌ MISSING',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ? '✅ SET' : '❌ MISSING',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ? '✅ SET' : '❌ MISSING',
  };
  console.log('[DEBUG] Firebase Config Status:', firebaseConfig);
  
  // Verify Live OTP Backend Connection
  try {
    const backendValid = await verifyEmailConfig();
    console.log('[DEBUG] Live OTP Backend Health Check:', backendValid ? '✅ HEALTHY' : '❌ UNHEALTHY');
  } catch (error) {
    console.error('[DEBUG] Live OTP Backend Verification Error:', error);
  }

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
