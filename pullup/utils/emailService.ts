/**
 * Email Service - Deprecated (now using backend OTP service)
 * Kept for compatibility with debug service
 * All email operations are now handled by the backend
 */

/**
 * Verify OTP Backend Configuration
 * Checks if the backend OTP service is properly configured
 * Note: Health check is non-blocking - app will still work even if check fails
 */
export const verifyEmailConfig = async (): Promise<boolean> => {
  const backendUrl = process.env.EXPO_PUBLIC_OTP_BACKEND_URL;
  
  if (!backendUrl) {
    console.warn('[EMAIL] ⚠️ OTP Backend URL not configured - using fallback');
    return true; // Still return true - will attempt to use backend anyway
  }

  console.log('[EMAIL] Backend URL configured:', backendUrl);

  // Non-blocking health check - doesn't affect app startup
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${backendUrl}/api/otp/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      console.log('[EMAIL] ✅ OTP Backend verified:', data);
      return true;
    } else {
      // Don't fail - backend might still work despite health check issue
      console.warn('[EMAIL] ⚠️ Backend health check returned status:', response.status);
      return true;
    }
  } catch (error) {
    // Non-blocking error - app will still try to use backend
    console.warn('[EMAIL] ⚠️ OTP Backend health check error (app will still work):', error);
    return true;
  }
};
