import { Timestamp } from 'firebase-admin/firestore';
import { config } from './config.js';
import { getDb } from './firebase.js';

interface OTPRecord {
  email: string;
  otp: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  attempts: number;
  maxAttempts: number;
  used: boolean;
  verifiedAt?: Timestamp;
}

export const generateOTP = (): string => {
  const length = config.otp.length;
  const max = Math.pow(10, length);
  return Math.floor(Math.random() * max)
    .toString()
    .padStart(length, '0');
};

const getOTPDocId = (email: string): string => {
  return email.replace(/[.@]/g, '_').toLowerCase();
};

export const sendOTP = async (email: string): Promise<{ success: boolean; message: string; otp: string }> => {
  try {
    const db = getDb();
    const docId = getOTPDocId(email);
    
    console.log(`[OTP] Generate request for: ${email}`);
    
    // Delete any existing OTP for this email
    try {
      await db.collection('otpVerification').doc(docId).delete();
      console.log(`[OTP] Deleted previous OTP for: ${email}`);
    } catch (e) {
      // Document might not exist, that's fine
    }

    // Generate new OTP
    const otp = generateOTP();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromDate(
      new Date(now.toDate().getTime() + config.otp.expiryMinutes * 60 * 1000)
    );

    const otpData: OTPRecord = {
      email,
      otp,
      createdAt: now,
      expiresAt,
      attempts: 0,
      maxAttempts: config.otp.maxAttempts,
      used: false,
    };

    // Save to Firestore
    await db.collection('otpVerification').doc(docId).set(otpData);
    console.log(`[OTP] Saved to Firestore for: ${email}`);

    return {
      success: true,
      message: 'OTP generated and will be sent via email',
      otp,
    };
  } catch (error: any) {
    console.error(`[OTP] Failed to generate:`, error.message);
    throw {
      code: 'OTP_GENERATION_FAILED',
      message: error.message || 'Failed to generate OTP',
    };
  }
};

export const verifyOTP = async (
  email: string,
  otp: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const db = getDb();
    const docId = getOTPDocId(email);

    console.log(`[OTP] Verify request for: ${email}`);

    const otpDoc = await db.collection('otpVerification').doc(docId).get();

    // Check 1: Document exists
    if (!otpDoc.exists) {
      throw new Error('OTP not found. Please request a new one.');
    }

    const otpData = otpDoc.data() as OTPRecord;
    const now = Timestamp.now();

    // Check 2: OTP not expired
    if (now.toDate() > otpData.expiresAt.toDate()) {
      await otpDoc.ref.delete();
      throw new Error('OTP has expired. Please request a new one.');
    }

    // Check 3: OTP not already used
    if (otpData.used) {
      throw new Error('OTP has already been used. Please request a new one.');
    }

    // Check 4: Max attempts not exceeded
    if (otpData.attempts >= otpData.maxAttempts) {
      await otpDoc.ref.delete();
      throw new Error('Maximum OTP verification attempts exceeded. Please request a new OTP.');
    }

    // Check 5: OTP value matches
    if (otp !== otpData.otp) {
      // Increment attempts
      const newAttempts = otpData.attempts + 1;
      await otpDoc.ref.update({
        attempts: newAttempts,
      });
      throw new Error(`Invalid OTP. ${config.otp.maxAttempts - newAttempts} attempts remaining.`);
    }

    // Check 6: Mark as used
    await otpDoc.ref.update({
      used: true,
      verifiedAt: now,
    });

    console.log(`[OTP] Verified successfully for: ${email}`);
    return {
      success: true,
      message: 'OTP verified successfully',
    };
  } catch (error: any) {
    console.error(`[OTP] Verification failed:`, error.message);
    throw {
      code: 'OTP_VERIFICATION_FAILED',
      message: error.message || 'OTP verification failed',
    };
  }
};

export const getOTPForEmail = async (email: string): Promise<OTPRecord | null> => {
  try {
    const db = getDb();
    const docId = getOTPDocId(email);
    const doc = await db.collection('otpVerification').doc(docId).get();
    
    if (doc.exists) {
      return doc.data() as OTPRecord;
    }
    return null;
  } catch (error) {
    console.error('[OTP] Error getting OTP:', error);
    return null;
  }
};

export const deleteOTP = async (email: string): Promise<void> => {
  try {
    const db = getDb();
    const docId = getOTPDocId(email);
    await db.collection('otpVerification').doc(docId).delete();
    console.log(`[OTP] Deleted for: ${email}`);
  } catch (error: any) {
    console.error('[OTP] Error deleting OTP:', error.message);
  }
};
