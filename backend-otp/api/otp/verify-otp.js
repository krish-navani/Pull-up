const { parseRequestBody, validateEmail, validateOTP } = require('../utils');
const { checkRateLimit } = require('../rateLimit');

// Load backend modules (now CommonJS)
let config, verifyOTP, initializeFirebase, validateConfig;
let initialized = false;

const initBackend = () => {
  if (initialized) return;
  
  try {
    // Require CommonJS modules from compiled backend
    const configModule = require('../../backend/dist/config.js');
    const otpModule = require('../../backend/dist/otpService.js');
    const firebaseModule = require('../../backend/dist/firebase.js');
    
    // Extract exports
    config = configModule.config;
    verifyOTP = otpModule.verifyOTP;
    initializeFirebase = firebaseModule.initializeFirebase;
    validateConfig = configModule.validateConfig;
    
    // Validate all required env vars are set
    validateConfig();
    
    // Initialize Firebase
    initializeFirebase();
    
    console.log('[INIT] Backend modules loaded successfully');
    initialized = true;
  } catch (error) {
    console.error('[INIT] Failed to load backend modules:', error.message);
    throw error;
  }
};

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vercel-protection-bypass');
};

module.exports = async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Only POST requests are allowed',
    });
  }

  try {
    // Initialize backend on first request
    if (!initialized) {
      initBackend();
    }

    // Parse request body
    let body;
    try {
      body = await parseRequestBody(req);
    } catch (e) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REQUEST',
        message: e.message,
      });
    }

    const { email, otp } = body;

    // Validate email required
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Email is required',
      });
    }

    // Validate OTP required
    if (!otp || typeof otp !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OTP',
        message: 'OTP is required',
      });
    }

    // Add university domain if missing
    const fullEmail = email.includes('@') 
      ? email 
      : email + config.universityDomain;

    // Validate email format
    if (!validateEmail(fullEmail)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL_FORMAT',
        message: 'Invalid email format',
      });
    }

    // Validate OTP format
    if (!validateOTP(otp, config.otp.length)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OTP_FORMAT',
        message: `OTP must be ${config.otp.length} digits`,
      });
    }

    // Rate limiting: per-email limit for verification attempts
    const rateLimitKey = fullEmail.toLowerCase();
    const limiter = checkRateLimit(
      'verify-otp',
      rateLimitKey,
      config.otp.maxAttempts,
      config.rateLimit.windowMs
    );

    if (!limiter.allowed) {
      const retryAfter = Math.ceil((limiter.resetTime - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many verification attempts. Please try again later.',
        retryAfter,
      });
    }

    console.log(`[API] /verify-otp request for: ${fullEmail}`);

    // Verify OTP against Firestore
    const result = await verifyOTP(fullEmail, otp);
    console.log(`[API] ✅ OTP verified for: ${fullEmail}`);

    res.json({
      success: true,
      message: 'OTP verified successfully. You can now proceed to the next step.',
    });
  } catch (error) {
    console.error('[API] /verify-otp error:', error);
    
    // Determine appropriate error response
    let statusCode = 400;
    let code = 'VERIFICATION_FAILED';
    let message = error.message || 'OTP verification failed';

    if (error.message && error.message.includes('expired')) {
      code = 'OTP_EXPIRED';
      message = 'OTP has expired. Please request a new one.';
    } else if (error.message && error.message.includes('not found')) {
      code = 'OTP_NOT_FOUND';
      message = 'OTP not found. Please request a new one.';
    } else if (error.message && error.message.includes('invalid')) {
      code = 'INVALID_OTP';
      message = 'The OTP you entered is incorrect.';
    } else if (error.message && error.message.includes('exceeded')) {
      statusCode = 429;
      code = 'MAX_ATTEMPTS_EXCEEDED';
      message = 'Maximum verification attempts exceeded. Please request a new OTP.';
    } else if (error.message && error.message.includes('missing')) {
      statusCode = 500;
      code = 'CONFIG_ERROR';
      message = 'Server configuration incomplete';
    }

    res.status(statusCode).json({
      success: false,
      code,
      message,
    });
  }
};
