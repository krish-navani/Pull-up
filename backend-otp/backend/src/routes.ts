import { Request, Response, Router } from 'express';
import { config } from './config.js';
import { sendOTPEmail } from './emailService.js';
import { rateLimiter, validateEmail, validateOTP } from './middleware.js';
import { sendOTP, verifyOTP } from './otpService.js';

const router = Router();

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeEnv: config.nodeEnv,
  });
});

// Send OTP endpoint
router.post('/send-otp', rateLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Email is required',
      });
    }

    const fullEmail = email.includes('@') ? email : email + config.universityDomain;

    // Validate email format
    if (!validateEmail(fullEmail)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL_FORMAT',
        message: 'Invalid email format',
      });
    }

    console.log(`[API] /send-otp request for: ${fullEmail}`);

    // Generate and save OTP
    const otpResult = await sendOTP(fullEmail);

    // Send OTP via email
    try {
      await sendOTPEmail(fullEmail, otpResult.otp, config.otp.expiryMinutes);
      console.log(`[API] ✅ OTP email queued for: ${fullEmail}`);
    } catch (emailError: any) {
      console.error(`[API] ⚠️  OTP saved but email sending failed:`, emailError.message);
      // Still return success because OTP was generated
      return res.json({
        success: true,
        message: 'OTP generated. Email delivery delayed - check spam folder.',
        note: 'OTP has been created and will be sent shortly',
      });
    }

    res.json({
      success: true,
      message: 'OTP sent to your email',
    });
  } catch (error: any) {
    console.error('[API] /send-otp error:', error);
    res.status(500).json({
      success: false,
      code: error.code || 'OTP_SEND_ERROR',
      message: error.message || 'Failed to send OTP',
    });
  }
});

// Verify OTP endpoint
router.post('/verify-otp', rateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Email is required',
      });
    }

    if (!otp || typeof otp !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OTP',
        message: 'OTP is required',
      });
    }

    const fullEmail = email.includes('@') ? email : email + config.universityDomain;

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

    console.log(`[API] /verify-otp request for: ${fullEmail}`);

    // Verify OTP
    const result = await verifyOTP(fullEmail, otp);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error('[API] /verify-otp error:', error);
    res.status(400).json({
      success: false,
      code: error.code || 'OTP_VERIFICATION_ERROR',
      message: error.message || 'Failed to verify OTP',
    });
  }
});

export default router;
