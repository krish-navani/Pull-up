// Get project root
const projectRoot = process.cwd();

// Load .env only in development (Vercel uses its own env system)
if (process.env.NODE_ENV !== 'production') {
  try {
    // Dynamic import to avoid issues in production builds
    const dotenv = require('dotenv');
    const path = require('path');
    dotenv.config({ path: path.join(projectRoot, 'backend', '.env.local') });
    dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
  } catch (e) {
    // Ignore errors in production
  }
}

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Firebase
  firebase: {
    projectId: (process.env.FIREBASE_PROJECT_ID || '').trim(),
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : '',
    clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
  },

  // Email
  mail: {
    service: process.env.MAIL_SERVICE || 'gmail',
    user: process.env.MAIL_USER || '',
    password: process.env.MAIL_PASSWORD || '',
    fromName: process.env.MAIL_FROM_NAME || 'PullUp',
  },

  // OTP
  otp: {
    length: parseInt(process.env.OTP_LENGTH || '4', 10),
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
    maxAttempts: parseInt(process.env.MAX_OTP_ATTEMPTS || '5', 10),
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5', 10),
  },

  corsOrigin: process.env.CORS_ORIGIN || '*',
  universityDomain: process.env.UNIVERSITY_DOMAIN || '@atlasskilltech.university',
};

// Strict validation (fail fast)
export const validateConfig = () => {
  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'MAIL_USER',
    'MAIL_PASSWORD',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[CONFIG] Validation passed');
  }
};