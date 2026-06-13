// Get project root
const projectRoot = process.cwd();

// Load .env only in development (Vercel uses its own env system)
if (process.env.NODE_ENV !== 'production') {
  try {
    // Dynamic import to avoid issues in production builds
    const dotenv = require('dotenv');
    const path = require('path');
    
    const paths = [
      path.join(projectRoot, '.env.development.local'),
      path.join(projectRoot, '.env.local'),
      path.join(projectRoot, '.env'),
      path.join(projectRoot, 'backend', '.env.development.local'),
      path.join(projectRoot, 'backend', '.env.local'),
      path.join(projectRoot, 'backend', '.env')
    ];

    for (const p of paths) {
      dotenv.config({ path: p });
    }
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

  // Razorpay Configuration
  razorpay: {
    keyId: (process.env.RAZORPAY_KEY_ID || 'rzp_test_mockKeyId123').trim(),
    keySecret: (process.env.RAZORPAY_KEY_SECRET || 'mockKeySecret123').trim(),
  },

  // Commission System Config
  commissionPercentage: parseFloat(process.env.COMMISSION_PERCENTAGE || '10'), // defaults to 10%

  // Withdrawal Limits & Frequencies
  withdrawal: {
    minAmount: parseInt(process.env.MIN_WITHDRAWAL_AMOUNT || '100', 10), // Min ₹100
    maxAmount: parseInt(process.env.MAX_WITHDRAWAL_AMOUNT || '2000', 10), // Max ₹2000
    maxPerDay: parseInt(process.env.MAX_WITHDRAWALS_PER_DAY || '1', 10), // Max 1 per day
  }
};

// Strict validation (fail fast)
export const validateConfig = () => {
  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'MAIL_USER',
    'MAIL_PASSWORD',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET'
  ];

  const missing = required.filter((key) => !process.env[key]);

  // For testing convenience, in development we can fall back to test values if not set
  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing environment variables in production: ${missing.join(', ')}`);
  } else if (missing.length > 0) {
    console.warn(`[CONFIG] ⚠️ Missing environment variables in development: ${missing.join(', ')}. Using default placeholders.`);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[CONFIG] Validation passed');
  }
};