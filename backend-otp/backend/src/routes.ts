import { Request, Response, Router } from 'express';
import { config } from './config.js';
import { sendOTPEmail } from './emailService.js';
import { rateLimiter, validateEmail, validateOTP } from './middleware.js';
import { sendOTP, verifyOTP } from './otpService.js';
import { getDb } from './firebase.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import admin from 'firebase-admin';

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

// ==========================================
// PULLUP PAYMENT & WALLET ARCHITECTURE
// ==========================================

let razorpay: any = null;
const getRazorpay = () => {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return razorpay;
};

const logAuditEvent = async (userId: string, action: string, amount: number, details: any) => {
  try {
    const db = getDb();
    await db.collection('auditLogs').add({
      userId,
      action,
      amount,
      details,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[AUDIT] Logged action: ${action} for user: ${userId}`);
  } catch (error: any) {
    console.error('[AUDIT] Failed to log audit event:', error.message);
  }
};

// CREATE SUBSCRIPTION ORDER
router.post('/create-subscription', async (req: Request, res: Response) => {
  try {
    const { userId, planId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const plan = planId === 'yearly' ? { price: 2500, days: 365 } : planId === 'quarterly' ? { price: 700, days: 90 } : { price: 250, days: 30 }; // Defaults to monthly

    const rzp = getRazorpay();
    const order = await rzp.orders.create({
      amount: plan.price * 100, // paise
      currency: 'INR',
      receipt: `sub_rcpt_${userId.substring(0, 8)}_${Date.now()}`,
      notes: {
        userId,
        planId: planId || 'monthly',
        planDays: plan.days.toString(),
      }
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      keyId: config.razorpay.keyId,
      planId: planId || 'monthly',
    });
  } catch (error: any) {
    console.error('[API] /create-subscription error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create subscription order' });
  }
});

// VERIFY SUBSCRIPTION PAYMENT
router.post('/verify-subscription', async (req: Request, res: Response) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, planId } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !userId) {
      return res.status(400).json({ success: false, message: 'Missing verification details' });
    }

    const generated_signature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed: invalid signature' });
    }

    const db = getDb();
    const plan = planId === 'yearly' ? { price: 2500, days: 365 } : planId === 'quarterly' ? { price: 700, days: 90 } : { price: 250, days: 30 };

    const result = await db.runTransaction(async (transaction) => {
      const subQuery = await transaction.get(db.collection('subscriptions').where('paymentId', '==', razorpay_payment_id));
      if (!subQuery.empty) {
        return { alreadyProcessed: true };
      }

      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      const userData = userDoc.data()!;
      let baseTime = Date.now();

      if (userData.subscriptionStatus === 'active' && userData.subscriptionExpiry) {
        const exp = new Date(userData.subscriptionExpiry).getTime();
        if (exp > baseTime) {
          baseTime = exp;
        }
      }

      const startTimestamp = admin.firestore.Timestamp.now();
      const expiryTimestamp = admin.firestore.Timestamp.fromDate(new Date(baseTime + plan.days * 24 * 60 * 60 * 1000));

      const subRef = db.collection('subscriptions').doc();
      transaction.set(subRef, {
        userId,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        amountPaid: plan.price,
        planId: planId || 'monthly',
        planIntervalDays: plan.days,
        subscriptionStatus: 'active',
        subscriptionStart: startTimestamp,
        subscriptionExpiry: expiryTimestamp,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      transaction.update(userRef, {
        subscriptionStatus: 'active',
        subscriptionExpiry: new Date(baseTime + plan.days * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      const statsRef = db.collection('system').doc('stats');
      const statsDoc = await transaction.get(statsRef);
      if (statsDoc.exists) {
        const statsData = statsDoc.data()!;
        transaction.update(statsRef, {
          totalRevenue: (statsData.totalRevenue || 0) + plan.price,
          activeSubscriptions: (statsData.activeSubscriptions || 0) + 1,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else {
        transaction.set(statsRef, {
          totalRevenue: plan.price,
          totalCommissions: 0,
          activeSubscriptions: 1,
          pendingWithdrawalsCount: 0,
          pendingWithdrawalsAmount: 0,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { success: true };
    });

    if (!result.alreadyProcessed) {
      await logAuditEvent(userId, 'subscription_created', plan.price, { planId, paymentId: razorpay_payment_id, orderId: razorpay_order_id });
    }

    res.json({ success: true, message: 'Subscription activated successfully' });

  } catch (error: any) {
    console.error('[API] /verify-subscription error:', error);
    res.status(500).json({ success: false, message: error.message || 'Verification failed' });
  }
});

const releaseExpiredBookings = async () => {
  try {
    const db = getDb();
    const now = admin.firestore.Timestamp.now();
    const expiredQuery = await db.collection('bookings')
      .where('status', '==', 'payment_pending')
      .where('expiresAt', '<', now)
      .get();

    for (const doc of expiredQuery.docs) {
      const bData = doc.data();
      console.log(`[CLEANUP] Releasing expired payment_pending booking: ${doc.id}`);
      await db.runTransaction(async (transaction) => {
        const bRef = db.collection('bookings').doc(doc.id);
        const rRef = db.collection('rides').doc(bData.rideId);

        const bSnap = await transaction.get(bRef);
        const rSnap = await transaction.get(rRef);

        if (bSnap.exists && bSnap.data()!.status === 'payment_pending') {
          transaction.update(bRef, {
            status: 'cancelled',
            paymentStatus: 'failed',
            updatedAt: admin.firestore.Timestamp.now(),
          });

          if (rSnap.exists) {
            const rData = rSnap.data()!;
            const updatedBookedSeats = (rData.bookedSeats || []).filter(
              (bs: any) => bs.passengerId !== bData.passengerId
            );
            transaction.update(rRef, {
              availableSeats: Math.min(rData.totalSeats, rData.availableSeats + bData.seatsBooked),
              bookedSeats: updatedBookedSeats,
              updatedAt: admin.firestore.Timestamp.now(),
            });
          }
        }
      });
      await logAuditEvent(bData.passengerId, 'pending_booking_expired', 0, { bookingId: doc.id, rideId: bData.rideId });
    }
  } catch (error: any) {
    console.error('[CLEANUP] Error during expired bookings release:', error.message);
  }
};

// CREATE CARPOOL ORDER
router.post('/create-order', async (req: Request, res: Response) => {
  try {
    releaseExpiredBookings().catch(err => console.error('[CLEANUP] Async cleanup failed:', err));

    const { rideId, passengerId, passengerName, passengerEmail, seatsBooked } = req.body;

    if (!rideId || !passengerId || !seatsBooked) {
      return res.status(400).json({ success: false, message: 'Missing booking parameters' });
    }

    const db = getDb();

    const activeCheck = await db.collection('bookings')
      .where('rideId', '==', rideId)
      .where('passengerId', '==', passengerId)
      .get();

    const active = activeCheck.docs.find(d => {
      const status = d.data().status;
      return status === 'pending' || status === 'accepted' || status === 'payment_pending';
    });

    if (active) {
      return res.status(400).json({
        success: false,
        code: 'DUPLICATE_BOOKING',
        message: 'You already have an active or pending booking for this ride.',
      });
    }

    const result = await db.runTransaction(async (transaction) => {
      const rideRef = db.collection('rides').doc(rideId);
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists) {
        throw new Error('RIDE_NOT_FOUND');
      }

      const rideData = rideSnap.data()!;
      
      if (rideData.status !== 'active') {
        throw new Error('RIDE_NOT_ACTIVE');
      }

      if (rideData.availableSeats < seatsBooked) {
        throw new Error('INSUFFICIENT_SEATS');
      }

      const totalAmount = rideData.price * seatsBooked;

      const rzp = getRazorpay();
      const order = await rzp.orders.create({
        amount: totalAmount * 100,
        currency: 'INR',
        receipt: `rcpt_car_${rideId.substring(0, 8)}_${Date.now()}`,
        notes: {
          rideId,
          passengerId,
          seatsBooked: seatsBooked.toString(),
        }
      });

      const bookingRef = db.collection('bookings').doc();
      const bookingData = {
        rideId,
        passengerId,
        passengerName,
        passengerEmail: passengerEmail || '',
        driverId: rideData.driverId,
        seatsBooked,
        pricePerSeat: rideData.price,
        totalPrice: totalAmount,
        status: 'payment_pending',
        paymentStatus: 'pending',
        orderId: order.id,
        refundStatus: 'none',
        refundAmount: 0,
        bookedAt: admin.firestore.Timestamp.now(),
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
        expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      };

      transaction.set(bookingRef, bookingData);

      const currentBookedSeats = rideData.bookedSeats || [];
      const cleanBookedSeats = currentBookedSeats.filter((b: any) => b.passengerId !== passengerId);
      
      const tempBookingInfo = {
        passengerId,
        passengerName,
        seatsBooked,
        status: 'payment_pending',
        bookedAt: new Date().toISOString(),
        orderId: order.id,
      };

      transaction.update(rideRef, {
        availableSeats: Math.max(0, rideData.availableSeats - seatsBooked),
        bookedSeats: [...cleanBookedSeats, tempBookingInfo],
        updatedAt: admin.firestore.Timestamp.now(),
      });

      return {
        bookingId: bookingRef.id,
        orderId: order.id,
        amount: order.amount,
        keyId: config.razorpay.keyId,
      };
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    console.error('[API] /create-order error:', error);
    let code = 'CREATE_ORDER_FAILED';
    let status = 500;
    let message = error.message || 'Failed to initialize booking payment';

    if (error.message === 'RIDE_NOT_FOUND') {
      status = 404;
      code = 'RIDE_NOT_FOUND';
      message = 'Ride not found';
    } else if (error.message === 'RIDE_NOT_ACTIVE') {
      status = 400;
      code = 'RIDE_NOT_ACTIVE';
      message = 'Ride is no longer active';
    } else if (error.message === 'INSUFFICIENT_SEATS') {
      status = 400;
      code = 'INSUFFICIENT_SEATS';
      message = 'Requested seat count is no longer available';
    }

    res.status(status).json({ success: false, code, message });
  }
});

// VERIFY PAYMENT & COMPLETE CARPOOL BOOKING
router.post('/verify-payment', async (req: Request, res: Response) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, bookingId } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !bookingId) {
      return res.status(400).json({ success: false, message: 'Missing payment signature verification details' });
    }

    const generated_signature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed: signature invalid' });
    }

    const db = getDb();

    const result = await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingDoc = await transaction.get(bookingRef);

      if (!bookingDoc.exists) {
        throw new Error('BOOKING_NOT_FOUND');
      }

      const bookingData = bookingDoc.data()!;

      if (bookingData.status === 'accepted' && bookingData.paymentStatus === 'paid') {
        return { bookingId, rideId: bookingData.rideId, alreadyProcessed: true };
      }

      if (bookingData.status !== 'payment_pending') {
        throw new Error('INVALID_BOOKING_STATUS');
      }

      const rideRef = db.collection('rides').doc(bookingData.rideId);
      const rideDoc = await transaction.get(rideRef);

      if (!rideDoc.exists) {
        throw new Error('RIDE_NOT_FOUND');
      }

      const rideData = rideDoc.data()!;

      transaction.update(bookingRef, {
        status: 'accepted',
        paymentStatus: 'paid',
        paymentId: razorpay_payment_id,
        paidAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      const currentBookedSeats = rideData.bookedSeats || [];
      const updatedBookedSeats = currentBookedSeats.map((b: any) => {
        if (b.passengerId === bookingData.passengerId) {
          return {
            ...b,
            status: 'accepted',
            paymentId: razorpay_payment_id,
          };
        }
        return b;
      });

      transaction.update(rideRef, {
        bookedSeats: updatedBookedSeats,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      const walletRef = db.collection('wallets').doc(bookingData.driverId);
      const walletDoc = await transaction.get(walletRef);
      if (walletDoc.exists) {
        const wData = walletDoc.data()!;
        transaction.update(walletRef, {
          pendingBalance: (wData.pendingBalance || 0) + bookingData.totalPrice,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else {
        transaction.set(walletRef, {
          userId: bookingData.driverId,
          walletBalance: 0,
          pendingBalance: bookingData.totalPrice,
          lockedBalance: 0,
          lifetimeEarnings: 0,
          lifetimeWithdrawals: 0,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      const statsRef = db.collection('system').doc('stats');
      const statsDoc = await transaction.get(statsRef);
      if (statsDoc.exists) {
        const statsData = statsDoc.data()!;
        transaction.update(statsRef, {
          totalRevenue: (statsData.totalRevenue || 0) + bookingData.totalPrice,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      const notificationRef = db.collection('users').doc(bookingData.driverId).collection('notifications').doc();
      transaction.set(notificationRef, {
        userId: bookingData.driverId,
        type: 'booking_accepted',
        title: 'New Ride Booking Confirmed',
        message: `${bookingData.passengerName} paid ₹${bookingData.totalPrice} and booked ${bookingData.seatsBooked} seat(s).`,
        rideId: bookingData.rideId,
        bookingId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { bookingId, rideId: bookingData.rideId, alreadyProcessed: false, passengerId: bookingData.passengerId, totalPrice: bookingData.totalPrice };
    });

    if (!result.alreadyProcessed) {
      await logAuditEvent(result.passengerId, 'booking_payment_verified', result.totalPrice, { bookingId, rideId: result.rideId, paymentId: razorpay_payment_id });
    }

    res.json({
      success: true,
      message: 'Payment verified and booking confirmed successfully',
      bookingId: result.bookingId,
      rideId: result.rideId,
    });

  } catch (error: any) {
    console.error('[API] /verify-payment error:', error);
    let code = 'VERIFY_PAYMENT_FAILED';
    let status = 500;
    let message = error.message || 'Failed to verify payment';

    if (error.message === 'BOOKING_NOT_FOUND') {
      status = 404;
      code = 'BOOKING_NOT_FOUND';
      message = 'Booking not found';
    } else if (error.message === 'INVALID_BOOKING_STATUS') {
      status = 400;
      code = 'INVALID_BOOKING_STATUS';
      message = 'Booking is not in pending payment state';
    } else if (error.message === 'RIDE_NOT_FOUND') {
      status = 404;
      code = 'RIDE_NOT_FOUND';
      message = 'Ride not found';
    }

    res.status(status).json({ success: false, code, message });
  }
});

// CANCEL PENDING BOOKING & RELEASE RESERVED SEATS
router.post('/cancel-pending-booking', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'Missing booking ID' });
    }

    const db = getDb();

    const result = await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingDoc = await transaction.get(bookingRef);

      if (!bookingDoc.exists) {
        throw new Error('BOOKING_NOT_FOUND');
      }

      const bookingData = bookingDoc.data()!;

      if (bookingData.status !== 'payment_pending') {
        throw new Error('CANNOT_CANCEL_NON_PENDING');
      }

      const rideRef = db.collection('rides').doc(bookingData.rideId);
      const rideDoc = await transaction.get(rideRef);

      transaction.update(bookingRef, {
        status: 'cancelled',
        paymentStatus: 'failed',
        updatedAt: admin.firestore.Timestamp.now(),
      });

      if (rideDoc.exists) {
        const rideData = rideDoc.data()!;
        const updatedBookedSeats = (rideData.bookedSeats || []).filter(
          (b: any) => b.passengerId !== bookingData.passengerId
        );

        transaction.update(rideRef, {
          availableSeats: Math.min(rideData.totalSeats, rideData.availableSeats + bookingData.seatsBooked),
          bookedSeats: updatedBookedSeats,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { passengerId: bookingData.passengerId, rideId: bookingData.rideId };
    });

    await logAuditEvent(result.passengerId, 'pending_booking_cancelled', 0, { bookingId, rideId: result.rideId });

    res.json({ success: true, message: 'Pending booking cancelled successfully and seats released' });

  } catch (error: any) {
    console.error('[API] /cancel-pending-booking error:', error);
    let code = 'CANCEL_PENDING_FAILED';
    let status = 500;
    let message = error.message || 'Failed to cancel pending booking';

    if (error.message === 'BOOKING_NOT_FOUND') {
      status = 404;
      code = 'BOOKING_NOT_FOUND';
      message = 'Booking not found';
    } else if (error.message === 'CANNOT_CANCEL_NON_PENDING') {
      status = 400;
      code = 'CANNOT_CANCEL_NON_PENDING';
      message = 'Booking is not in pending payment state';
    }

    res.status(status).json({ success: false, code, message });
  }
});

// SAFE RIDE COMPLETION (Wallet Credit & Commissions)
router.post('/complete-ride', async (req: Request, res: Response) => {
  try {
    const { rideId } = req.body;

    if (!rideId) {
      return res.status(400).json({ success: false, message: 'Ride ID is required' });
    }

    const db = getDb();

    const result = await db.runTransaction(async (transaction) => {
      const rideRef = db.collection('rides').doc(rideId);
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists) {
        throw new Error('RIDE_NOT_FOUND');
      }

      const rideData = rideSnap.data()!;

      if (rideData.status === 'completed') {
        return { alreadyProcessed: true };
      }

      if (rideData.status !== 'in_progress') {
        throw new Error('RIDE_NOT_IN_PROGRESS');
      }

      const departureTime = new Date(rideData.departureTime).getTime();
      const tenMinsLater = departureTime + 10 * 60 * 1000;
      
      if (Date.now() < tenMinsLater) {
        throw new Error('TIME_LOCK_ACTIVE');
      }

      const driverId = rideData.driverId;

      transaction.update(rideRef, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      const bookingsRef = db.collection('bookings');
      const bookingsQuery = await bookingsRef
        .where('rideId', '==', rideId)
        .where('status', '==', 'accepted')
        .get();

      let totalGrossEarnings = 0;
      let totalDriverPayout = 0;
      let totalCommissions = 0;

      const creditingActions: Array<{ bookingId: string, gross: number, payout: number, commission: number }> = [];

      for (const doc of bookingsQuery.docs) {
        const bData = doc.data();
        if (bData.paymentStatus === 'paid') {
          const gross = bData.totalPrice || 0;
          const commission = parseFloat(((gross * config.commissionPercentage) / 100).toFixed(2));
          const payout = parseFloat((gross - commission).toFixed(2));

          totalGrossEarnings += gross;
          totalDriverPayout += payout;
          totalCommissions += commission;

          creditingActions.push({
            bookingId: doc.id,
            gross,
            payout,
            commission
          });
        }
      }

      if (totalDriverPayout > 0) {
        const walletRef = db.collection('wallets').doc(driverId);
        const walletSnap = await transaction.get(walletRef);
        let walletBalance = 0;
        let pendingBalance = 0;
        let lifetimeEarnings = 0;

        if (walletSnap.exists) {
          const wData = walletSnap.data()!;
          walletBalance = wData.walletBalance || 0;
          pendingBalance = wData.pendingBalance || 0;
          lifetimeEarnings = wData.lifetimeEarnings || 0;

          // Deduct only platform commission from pendingBalance immediately.
          // The remaining payout stays in pendingBalance until cleared.
          const cleanPending = Math.max(0, pendingBalance - totalCommissions);

          transaction.update(walletRef, {
            pendingBalance: cleanPending,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        } else {
          transaction.set(walletRef, {
            userId: driverId,
            walletBalance: 0,
            pendingBalance: totalDriverPayout,
            lockedBalance: 0,
            lifetimeEarnings: 0,
            lifetimeWithdrawals: 0,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }

        for (const action of creditingActions) {
          const txRef = db.collection('walletTransactions').doc();
          const clearingAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
          
          transaction.set(txRef, {
            userId: driverId,
            rideId,
            bookingId: action.bookingId,
            amount: action.payout,
            grossAmount: action.gross,
            commissionAmount: action.commission,
            commissionPercentage: config.commissionPercentage,
            type: 'ride_earning',
            status: 'pending', // Pending 24h clearance
            referenceType: 'ride',
            referenceId: rideId,
            clearingAt,
            createdAt: admin.firestore.Timestamp.now(),
          });
        }

        const statsRef = db.collection('system').doc('stats');
        const statsDoc = await transaction.get(statsRef);
        if (statsDoc.exists) {
          const statsData = statsDoc.data()!;
          transaction.update(statsRef, {
            totalCommissions: (statsData.totalCommissions || 0) + totalCommissions,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
      }

      return { alreadyProcessed: false, driverId, totalDriverPayout, rideId };
    });

    if (!result.alreadyProcessed && result.totalDriverPayout !== undefined && result.totalDriverPayout > 0 && result.driverId && result.rideId) {
      await logAuditEvent(result.driverId, 'ride_completed_earnings', result.totalDriverPayout, { rideId: result.rideId });
    }

    res.json({ success: true, message: 'Ride completed successfully and driver wallet credited' });

  } catch (error: any) {
    console.error('[API] /complete-ride error:', error);
    let code = 'COMPLETE_RIDE_FAILED';
    let status = 500;
    let message = error.message || 'Failed to complete ride';

    if (error.message === 'RIDE_NOT_FOUND') {
      status = 404;
      code = 'RIDE_NOT_FOUND';
      message = 'Ride not found';
    } else if (error.message === 'RIDE_NOT_IN_PROGRESS') {
      status = 400;
      code = 'RIDE_NOT_IN_PROGRESS';
      message = 'Ride is not in progress';
    } else if (error.message === 'TIME_LOCK_ACTIVE') {
      status = 400;
      code = 'TIME_LOCK_ACTIVE';
      message = 'Ride cannot be marked completed until scheduled time + 10 mins';
    }

    res.status(status).json({ success: false, code, message });
  }
});

const clearPendingBalances = async (db: admin.firestore.Firestore, userId: string) => {
  try {
    const now = admin.firestore.Timestamp.now();
    const pendingTxsQuery = await db.collection('walletTransactions')
      .where('userId', '==', userId)
      .where('type', '==', 'ride_earning')
      .where('status', '==', 'pending')
      .where('clearingAt', '<=', now)
      .get();

    if (pendingTxsQuery.empty) {
      return { clearedCount: 0, clearedAmount: 0 };
    }

    let clearedAmount = 0;
    const txDocsToUpdate: string[] = [];

    for (const doc of pendingTxsQuery.docs) {
      const data = doc.data();
      clearedAmount += data.amount || 0;
      txDocsToUpdate.push(doc.id);
    }

    if (clearedAmount > 0) {
      await db.runTransaction(async (transaction) => {
        const walletRef = db.collection('wallets').doc(userId);
        const walletSnap = await transaction.get(walletRef);

        if (walletSnap.exists) {
          const wData = walletSnap.data()!;
          const currentWalletBalance = wData.walletBalance || 0;
          const currentPendingBalance = wData.pendingBalance || 0;
          const currentLifetimeEarnings = wData.lifetimeEarnings || 0;

          transaction.update(walletRef, {
            walletBalance: parseFloat((currentWalletBalance + clearedAmount).toFixed(2)),
            pendingBalance: Math.max(0, parseFloat((currentPendingBalance - clearedAmount).toFixed(2))),
            lifetimeEarnings: parseFloat((currentLifetimeEarnings + clearedAmount).toFixed(2)),
            updatedAt: admin.firestore.Timestamp.now(),
          });

          for (const txId of txDocsToUpdate) {
            const txRef = db.collection('walletTransactions').doc(txId);
            transaction.update(txRef, {
              status: 'completed',
              clearedAt: admin.firestore.Timestamp.now(),
            });
          }
        }
      });
      console.log(`[CLEARING] Cleared ₹${clearedAmount} for driver ${userId} (${txDocsToUpdate.length} transactions)`);
    }

    return { clearedCount: txDocsToUpdate.length, clearedAmount };
  } catch (error: any) {
    console.error(`[CLEARING] Error clearing pending balance for user ${userId}:`, error.message);
    throw error;
  }
};

// REFRESH WALLET: Clears pending balances and returns wallet data
router.post('/refresh-wallet', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const db = getDb();
    const clearingResult = await clearPendingBalances(db, userId);

    const walletSnap = await db.collection('wallets').doc(userId).get();
    let walletData = {};
    if (walletSnap.exists) {
      walletData = walletSnap.data()!;
    }

    res.json({
      success: true,
      cleared: clearingResult,
      wallet: walletData
    });
  } catch (error: any) {
    console.error('[API] /refresh-wallet error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to refresh wallet' });
  }
});

// VERIFY UPI & REGISTER PAYOUT METHOD
router.post('/verify-upi', async (req: Request, res: Response) => {
  try {
    const { userId, upiId } = req.body;

    if (!userId || !upiId) {
      return res.status(400).json({ success: false, message: 'Missing user ID or UPI ID' });
    }

    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    if (!upiRegex.test(upiId)) {
      return res.status(400).json({ success: false, message: 'Invalid UPI ID format (e.g. name@bank)' });
    }

    const db = getDb();
    
    const payoutMethod = {
      type: 'upi',
      upiId,
      verified: true,
      verifiedAt: admin.firestore.Timestamp.now(),
    };

    await db.collection('users').doc(userId).update({
      payoutMethod,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    await logAuditEvent(userId, 'upi_verified', 0, { upiId });

    res.json({ success: true, message: 'UPI ID verified successfully', payoutMethod });

  } catch (error: any) {
    console.error('[API] /verify-upi error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to verify UPI' });
  }
});

// REQUEST WITHDRAWAL WITH LIMITS & FREQUENCY CONTROLS
router.post('/request-withdrawal', async (req: Request, res: Response) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal amount' });
    }

    if (numAmount < config.withdrawal.minAmount || numAmount > config.withdrawal.maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Withdrawals must be between ₹${config.withdrawal.minAmount} and ₹${config.withdrawal.maxAmount}`
      });
    }

    const db = getDb();

    // Dynamically clear any pending balances that are past their 24h clearing window
    await clearPendingBalances(db, userId).catch(err => console.error('[WITHDRAW] Pre-clear error:', err.message));

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayTimestamp = admin.firestore.Timestamp.fromDate(startOfToday);

    const withdrawalsToday = await db.collection('withdrawals')
      .where('userId', '==', userId)
      .where('requestedAt', '>=', todayTimestamp)
      .get();

    const successfulOrPendingToday = withdrawalsToday.docs.filter(
      d => d.data().status === 'pending' || d.data().status === 'completed' || d.data().status === 'processing'
    );

    if (successfulOrPendingToday.length >= config.withdrawal.maxPerDay) {
      return res.status(400).json({
        success: false,
        message: `You can only request up to ${config.withdrawal.maxPerDay} withdrawal(s) per day.`
      });
    }

    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      const userData = userDoc.data()!;
      if (!userData.payoutMethod || !userData.payoutMethod.verified) {
        throw new Error('UNVERIFIED_PAYOUT_METHOD');
      }

      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);

      if (!walletDoc.exists) {
        throw new Error('WALLET_NOT_FOUND');
      }

      const wData = walletDoc.data()!;
      const currentBalance = wData.walletBalance || 0;

      if (currentBalance < numAmount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      transaction.update(walletRef, {
        walletBalance: parseFloat((currentBalance - numAmount).toFixed(2)),
        lockedBalance: parseFloat(((wData.lockedBalance || 0) + numAmount).toFixed(2)),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      const wRef = db.collection('withdrawals').doc();
      const wDataObj = {
        userId,
        amount: numAmount,
        upiId: userData.payoutMethod.upiId,
        status: 'pending',
        requestedAt: admin.firestore.Timestamp.now(),
      };
      transaction.set(wRef, wDataObj);

      const txRef = db.collection('walletTransactions').doc();
      transaction.set(txRef, {
        userId,
        amount: -numAmount,
        type: 'withdrawal',
        status: 'pending',
        referenceType: 'withdrawal',
        referenceId: wRef.id,
        createdAt: admin.firestore.Timestamp.now(),
      });

      const statsRef = db.collection('system').doc('stats');
      const statsDoc = await transaction.get(statsRef);
      if (statsDoc.exists) {
        const statsData = statsDoc.data()!;
        transaction.update(statsRef, {
          pendingWithdrawalsCount: (statsData.pendingWithdrawalsCount || 0) + 1,
          pendingWithdrawalsAmount: (statsData.pendingWithdrawalsAmount || 0) + numAmount,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { withdrawalId: wRef.id, amount: numAmount };
    });

    await logAuditEvent(userId, 'withdrawal_requested', numAmount, { withdrawalId: result.withdrawalId });

    res.json({ success: true, message: 'Withdrawal request submitted successfully', withdrawalId: result.withdrawalId });

  } catch (error: any) {
    console.error('[API] /request-withdrawal error:', error);
    let code = 'WITHDRAWAL_FAILED';
    let status = 500;
    let message = error.message || 'Failed to submit withdrawal request';

    if (error.message === 'USER_NOT_FOUND') {
      status = 404;
      code = 'USER_NOT_FOUND';
      message = 'User profile not found';
    } else if (error.message === 'UNVERIFIED_PAYOUT_METHOD') {
      status = 400;
      code = 'UNVERIFIED_PAYOUT_METHOD';
      message = 'You must add and verify your UPI ID first';
    } else if (error.message === 'WALLET_NOT_FOUND') {
      status = 404;
      code = 'WALLET_NOT_FOUND';
      message = 'Wallet not initialized';
    } else if (error.message === 'INSUFFICIENT_FUNDS') {
      status = 400;
      code = 'INSUFFICIENT_FUNDS';
      message = 'Insufficient funds in wallet';
    }

    res.status(status).json({ success: false, code, message });
  }
});

export default router;
