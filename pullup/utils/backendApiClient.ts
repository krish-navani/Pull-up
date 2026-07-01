import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { OTP_BACKEND_URL } from '@/config/environment';

const REMOTE_BACKEND_URL = OTP_BACKEND_URL;

// Web dev: same-origin proxy in metro.config.js avoids CORS on the Vercel OTP API
const BACKEND_URL =
  Platform.OS === 'web' && __DEV__ ? '' : REMOTE_BACKEND_URL;
const BYPASS_TOKEN = process.env.EXPO_PUBLIC_VERCEL_BYPASS_TOKEN || '';

// Create axios instance with defaults
const apiClient: AxiosInstance = axios.create({
  baseURL: `${BACKEND_URL}/api/otp`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add bypass token to URLs if available
const addBypassToken = (url: string): string => {
  if (!BYPASS_TOKEN) return url;
  
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${BYPASS_TOKEN}`;
};

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log(`[BACKEND-API] ${config.method?.toUpperCase()} ${config.url}`);
    
    // Add bypass token to headers if available
    if (BYPASS_TOKEN) {
      config.headers['x-vercel-protection-bypass'] = BYPASS_TOKEN;
    }
    
    return config;
  },
  (error) => {
    console.error('[BACKEND-API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log(`[BACKEND-API] ✅ Response:`, response.data);
    return response;
  },
  (error) => {
    const message = error.response?.data?.message || error.message;
    const code = error.response?.data?.code || 'UNKNOWN_ERROR';
    
    console.error(`[BACKEND-API] ❌ Error (${code}):`, message);
    
    // Re-throw with consistent format
    throw {
      code,
      message,
      status: error.response?.status,
    };
  }
);

/**
 * Send OTP to email via backend
 */
export const sendOTPViaBackend = async (
  email: string
): Promise<{ success: boolean; message: string }> => {
  try {
    console.log('[BACKEND-API] Sending OTP to:', email);
    
    const response = await apiClient.post('/send-otp', {
      email,
    });

    if (response.data.success) {
      console.log('[BACKEND-API] ✅ OTP sent successfully');
      return {
        success: true,
        message: response.data.message || 'OTP sent to your email',
      };
    } else {
      throw new Error(response.data.message || 'Failed to send OTP');
    }
  } catch (error: any) {
    console.error('[BACKEND-API] Failed to send OTP:', error);
    throw {
      code: error.code || 'SEND_OTP_ERROR',
      message: error.message || 'Failed to send OTP. Please check your internet connection.',
    };
  }
};

/**
 * Verify OTP via backend
 */
export const verifyOTPViaBackend = async (
  email: string,
  otp: string
): Promise<{ success: boolean; message: string; firebaseToken?: string; userId?: string }> => {
  try {
    console.log('[BACKEND-API] Verifying OTP for:', email);
    
    const response = await apiClient.post('/verify-otp', {
      email,
      otp,
    });

    if (response.data.success) {
      console.log('[BACKEND-API] ✅ OTP verified successfully');
      return {
        success: true,
        message: response.data.message || 'OTP verified successfully',
        firebaseToken: response.data.firebaseToken,
        userId: response.data.userId,
      };
    } else {
      throw new Error(response.data.message || 'Failed to verify OTP');
    }
  } catch (error: any) {
    console.error('[BACKEND-API] Failed to verify OTP:', error);
    throw {
      code: error.code || 'VERIFY_OTP_ERROR',
      message: error.message || 'Failed to verify OTP',
    };
  }
};

/**
 * Check backend health
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    console.log('[BACKEND-API] Checking backend health...');
    const response = await apiClient.get('/health');
    console.log('[BACKEND-API] ✅ Backend is healthy');
    return response.data.status === 'ok';
  } catch (error: any) {
    console.error('[BACKEND-API] ❌ Backend health check failed:', error.message);
    return false;
  }
};

export default apiClient;
