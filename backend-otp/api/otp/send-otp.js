const { parseRequestBody, validateEmail } = require('../utils');
const { checkRateLimit } = require('../rateLimit');

// Load backend modules (now CommonJS)
let config, sendOTP, sendOTPEmail, initializeFirebase, validateConfig;
let initialized = false;

const initBackend = () => {
  if (initialized) return;
  
  try {
    // Require CommonJS modules from compiled backend
    const configModule = require('../../backend/dist/config.js');
    const otpModule = require('../../backend/dist/otpService.js');
    const emailModule = require('../../backend/dist/emailService.js');
    const firebaseModule = require('../../backend/dist/firebase.js');
    
    // Extract exports
    config = configModule.config;
    sendOTP = otpModule.sendOTP;
    sendOTPEmail = emailModule.sendOTPEmail;
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

    const { email } = body;

    // Validate email required
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Email is required',
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

    // Rate limiting: per-email limit
    const rateLimitKey = fullEmail.toLowerCase();
    const limiter = checkRateLimit(
      'send-otp',
      rateLimitKey,
      config.rateLimit.maxRequests,
      config.rateLimit.windowMs
    );

    if (!limiter.allowed) {
      const retryAfter = Math.ceil((limiter.resetTime - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many OTP requests. Please try again later.',
        retryAfter,
      });
    }

    console.log(`[API] /send-otp request for: ${fullEmail}`);

    // Generate and save OTP to Firestore
    const otpResult = await sendOTP(fullEmail);
    console.log(`[API] OTP generated for: ${fullEmail}`);

    // Send OTP via email
    try {
      await sendOTPEmail(fullEmail, otpResult.otp, config.otp.expiryMinutes);
      console.log(`[API] ✅ OTP email sent to: ${fullEmail}`);
    } catch (emailError) {
      console.error(`[API] ⚠️ OTP saved but email send failed:`, emailError.message);
      // Still return success - OTP was created
      return res.json({
        success: true,
        message: 'OTP generated. Email delivery in progress - check spam folder.',
      });
    }

    res.json({
      success: true,
      message: 'OTP sent to your email. Check your inbox and spam folder.',
    });
  } catch (error) {
    console.error('[API] /send-otp error:', error);
    
    // Determine appropriate error response
    let statusCode = 500;
    let code = 'UNKNOWN_ERROR';
    let message = 'Failed to send OTP';

    if (error.message && error.message.includes('missing')) {
      statusCode = 500;
      code = 'CONFIG_ERROR';
      message = 'Server configuration incomplete';
    } else if (error.message && error.message.includes('OTP')) {
      statusCode = 400;
      code = 'OTP_ERROR';
      message = error.message;
    }

    res.status(statusCode).json({
      success: false,
      code,
      message,
    });
  }
};
