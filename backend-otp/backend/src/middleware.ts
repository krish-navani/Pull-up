import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';

// Extend Request type to include rateLimit property
declare global {
  namespace Express {
    interface Request {
      rateLimit?: {
        limit: number;
        current: number;
        remaining: number;
        resetTime: number;
      };
    }
  }
}

// Rate limiter for OTP send requests per email (strict: 5 per 15 min)
export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  keyGenerator: (req) => {
    // Use email as key if available, otherwise use IP
    return 'send:' + (req.body?.email?.toLowerCase() || req.ip || 'unknown');
  },
  handler: (req: Request, res: Response) => {
    const retryAfter = req.rateLimit?.resetTime 
      ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      : 60;
    
    res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Please try again later.`,
      retryAfter,
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/otp/health';
  },
});

// Separate, more permissive rate limiter for OTP verify attempts per email
// (10 per 15 min — allows normal retry flows without blocking legitimate users)
export const verifyRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests * 2,
  keyGenerator: (req) => {
    return 'verify:' + (req.body?.email?.toLowerCase() || req.ip || 'unknown');
  },
  handler: (req: Request, res: Response) => {
    const retryAfter = req.rateLimit?.resetTime 
      ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      : 60;
    
    res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many verification attempts. Please try again later.`,
      retryAfter,
    });
  },
  skip: (req) => {
    return req.path === '/api/otp/health';
  },
});

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateOTP = (otp: string, expectedLength: number): boolean => {
  return /^\d+$/.test(otp) && otp.length === expectedLength;
};
