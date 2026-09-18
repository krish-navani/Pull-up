import { Request, Response } from 'express';
import admin from 'firebase-admin';
import { getDb } from './firebase.js';
import { config } from './config.js';
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifySubscriptionSignature,
  verifyWebhookSignature,
  fetchRazorpayPayment,
  captureRazorpayPayment,
  createRazorpayRefund,
  createRouteTransfer,
  reverseRouteTransfer,
  createOrLinkRazorpayAccount,
} from './razorpayService.js';
import { getStoredBookingAmountPaise } from './fareService.js';

// Helper to extract authenticated user ID from Bearer token (with dev/test fallback)
async function getAuthenticatedUserId(req: Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const testUserId = req.body?.userId || req.body?.passengerId || req.body?.driverId;
    if (config.nodeEnv !== 'production' && testUserId) {
      return testUserId;
    }
    throw new Error('UNAUTHORIZED');
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken.uid;
  } catch (err) {
    const testUserId = req.body?.userId || req.body?.passengerId || req.body?.driverId;
    if (config.nodeEnv !== 'production' && testUserId) {
      return testUserId;
    }
    throw err;
  }
}

/**
 * Driver Razorpay Linked Account Setup (Razorpay Route)
 */
export async function handleDriverPayoutAccountSetup(req: Request, res: Response) {
  try {
    const authenticatedUserId = await getAuthenticatedUserId(req);
    const { email, phone, name, businessName, accountId } = req.body;

    const db = getDb();
    const userRef = db.collection('users').doc(authenticatedUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    const userData = userDoc.data()!;
    const driverName = name || userData.fullName || 'PullUp Driver';
    const driverEmail = email || userData.email;

    const accountResult = await createOrLinkRazorpayAccount({
      email: driverEmail,
      phone: phone || userData.phone || '',
      name: driverName,
      existingAccountId: accountId,
    });

    await userRef.update({
      razorpayAccountId: accountResult.accountId,
      razorpayAccountStatus: accountResult.status || 'active',
      payoutMethod: {
        type: 'razorpay_route',
        accountId: accountResult.accountId,
        verified: true,
        verifiedAt: admin.firestore.Timestamp.now(),
      },
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Reconcile pending payouts for this driver (pending_driver_onboarding)
    const pendingTransfers = await db
      .collection('transfers')
      .where('driverId', '==', authenticatedUserId)
      .where('status', '==', 'pending_driver_onboarding')
      .get();

    let reconciledCount = 0;
    for (const doc of pendingTransfers.docs) {
      const tData = doc.data();
      try {
        const transfer = await createRouteTransfer({
          paymentId: tData.paymentId,
          accountId: accountResult.accountId,
          amountPaise: tData.amountPaise,
          notes: { rideId: tData.rideId, bookingId: tData.bookingId, mode: 'reconciled' },
        });

        await doc.ref.update({
          transferId: transfer.id || doc.id,
          razorpayAccountId: accountResult.accountId,
          status: transfer.status || 'processed',
          reconciledAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        });
        reconciledCount++;
      } catch (err: any) {
        console.error(`[ROUTE RECONCILE] Failed pending transfer for booking ${tData.bookingId}:`, err);
      }
    }

    return res.json({
      success: true,
      message: 'Razorpay Linked Account configured successfully',
      accountId: accountResult.accountId,
      status: accountResult.status,
      reconciledPendingPayouts: reconciledCount,
    });
  } catch (error: any) {
    console.error('[API] /driver/payout-account error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to setup driver payout account',
    });
  }
}

/**
 * Get Driver Razorpay Linked Account Status
 */
export async function getDriverPayoutAccountStatus(req: Request, res: Response) {
  try {
    const authenticatedUserId = await getAuthenticatedUserId(req);
    const db = getDb();
    const userDoc = await db.collection('users').doc(authenticatedUserId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    const userData = userDoc.data()!;
    return res.json({
      success: true,
      razorpayAccountId: userData.razorpayAccountId || null,
      razorpayAccountStatus: userData.razorpayAccountStatus || 'unlinked',
      payoutMethod: userData.payoutMethod || null,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch payout account status',
    });
  }
}

/**
 * Server-Created Razorpay Orders for Ride Payment
 */
export async function handleCreateOrder(req: Request, res: Response) {
  try {
    const { bookingId, passengerId } = req.body;
    const authenticatedUserId = await getAuthenticatedUserId(req);

    if (!bookingId || !passengerId) {
      return res.status(400).json({ success: false, message: 'Missing booking parameters' });
    }
    if (authenticatedUserId !== passengerId) {
      return res.status(403).json({ success: false, message: 'Unauthorized booking payment request' });
    }

    const db = getDb();
    const result = await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingSnap = await transaction.get(bookingRef);

      if (!bookingSnap.exists) throw new Error('BOOKING_NOT_FOUND');
      const bookingData = bookingSnap.data()!;

      if (bookingData.passengerId !== passengerId) throw new Error('UNAUTHORIZED_BOOKING_ACCESS');
      if (bookingData.status !== 'accepted') throw new Error('BOOKING_NOT_ACCEPTED');
      if (bookingData.paymentStatus === 'paid') throw new Error('BOOKING_ALREADY_PAID');

      const rideRef = db.collection('rides').doc(bookingData.rideId);
      const rideSnap = await transaction.get(rideRef);
      if (!rideSnap.exists) throw new Error('RIDE_NOT_FOUND');
      const rideData = rideSnap.data()!;

      if (rideData.status !== 'active' && rideData.status !== 'in_progress') throw new Error('RIDE_NOT_ACTIVE');
      if (rideData.availableSeats < bookingData.seatsBooked) throw new Error('INSUFFICIENT_SEATS');

      const lockedAmountPaise = getStoredBookingAmountPaise(bookingData, true);

      // Create Razorpay order with payment_capture: 1 (auto-capture)
      const order = await createRazorpayOrder({
        amountPaise: lockedAmountPaise,
        receipt: `rcpt_car_${bookingData.rideId.substring(0, 8)}_${Date.now()}`,
        notes: {
          rideId: bookingData.rideId,
          passengerId,
          driverId: bookingData.driverId,
          bookingId,
          seatsBooked: String(bookingData.seatsBooked),
        },
      });

      transaction.update(bookingRef, {
        orderId: order.id,
        orderAmountPaise: order.amount,
        paymentStatus: 'pending',
        paymentInitiatedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      return {
        bookingId: bookingSnap.id,
        orderId: order.id,
        amount: order.amount,
        keyId: config.razorpay.keyId,
      };
    });

    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[API] /create-order error:', error);
    const message = error.message || 'Failed to initialize booking payment';
    return res.status(400).json({ success: false, message });
  }
}

/**
 * Server-Side Signature & Payment Verification + Razorpay Route Driver Payout
 */
export async function handleVerifyPayment(req: Request, res: Response) {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, bookingId } = req.body;
    const authenticatedUserId = await getAuthenticatedUserId(req);

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !bookingId) {
      return res.status(400).json({ success: false, message: 'Missing payment signature verification details' });
    }

    // 1. Verify HMAC Signature
    const isSignatureValid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isSignatureValid) {
      return res.status(400).json({ success: false, message: 'Payment verification failed: invalid signature' });
    }

    const db = getDb();
    const paymentBookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!paymentBookingDoc.exists) throw new Error('BOOKING_NOT_FOUND');
    const paymentBooking = paymentBookingDoc.data()!;

    if (paymentBooking.passengerId !== authenticatedUserId) throw new Error('UNAUTHORIZED_BOOKING_ACCESS');
    if (paymentBooking.orderId !== razorpay_order_id) throw new Error('ORDER_MISMATCH');

    const expectedAmountPaise = getStoredBookingAmountPaise(paymentBooking, true);

    // 2. Fetch Razorpay Payment details from Razorpay API
    let paymentDetails = await fetchRazorpayPayment(razorpay_payment_id);
    if (paymentDetails.order_id !== razorpay_order_id || Number(paymentDetails.amount) !== expectedAmountPaise) {
      throw new Error('PAYMENT_AMOUNT_MISMATCH');
    }

    // Capture payment if status is 'authorized'
    if (paymentDetails.status === 'authorized') {
      paymentDetails = await captureRazorpayPayment(razorpay_payment_id, expectedAmountPaise);
    }

    if (paymentDetails.status !== 'captured') {
      throw new Error(`PAYMENT_NOT_CAPTURED: status is ${paymentDetails.status}`);
    }

    // 3. Update Booking & Ride atomically in Firestore
    const result = await db.runTransaction(async (transaction) => {
      // ── PHASE 1: ALL READS FIRST ──────────────────────────────────────────
      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingDoc = await transaction.get(bookingRef);
      if (!bookingDoc.exists) throw new Error('BOOKING_NOT_FOUND');
      const bookingData = bookingDoc.data()!;

      if (bookingData.status === 'confirmed' && bookingData.paymentStatus === 'paid') {
        return { bookingId, rideId: bookingData.rideId, driverId: bookingData.driverId, alreadyProcessed: true };
      }

      const rideRef = db.collection('rides').doc(bookingData.rideId);
      const rideDoc = await transaction.get(rideRef);
      if (!rideDoc.exists) throw new Error('RIDE_NOT_FOUND');
      const rideData = rideDoc.data()!;

      const chatRef = db.collection('rideChats').doc(bookingData.rideId);
      const chatDoc = await transaction.get(chatRef);

      // ── PHASE 2: COMPUTE (no reads after this point) ─────────────────────
      const currentBookedSeats: any[] = rideData.bookedSeats || [];

      // Upsert this passenger into bookedSeats: update existing entry or append
      const alreadyInArray = currentBookedSeats.some((b: any) => b.passengerId === bookingData.passengerId);
      const updatedBookedSeats = alreadyInArray
        ? currentBookedSeats.map((b: any) =>
            b.passengerId === bookingData.passengerId
              ? { ...b, status: 'confirmed', paymentStatus: 'paid', paymentId: razorpay_payment_id }
              : b
          )
        : [
            ...currentBookedSeats,
            {
              passengerId: bookingData.passengerId,
              passengerName: bookingData.passengerName || '',
              seatsBooked: bookingData.seatsBooked,
              status: 'confirmed',
              paymentStatus: 'paid',
              paymentId: razorpay_payment_id,
            },
          ];

      // Explicit seat guard — must have seats available at time of payment confirmation
      if (bookingData.status !== 'confirmed' && rideData.availableSeats < bookingData.seatsBooked) {
        throw Object.assign(new Error('INSUFFICIENT_SEATS'), { code: 'INSUFFICIENT_SEATS' });
      }

      // Decrement availableSeats directly — canonical source of truth (not a recalculation)
      const newAvailableSeats = Math.max(0, rideData.availableSeats - bookingData.seatsBooked);

      // ── PHASE 3: ALL WRITES ───────────────────────────────────────────────
      transaction.update(bookingRef, {
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentId: razorpay_payment_id,
        paidAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      transaction.update(rideRef, {
        availableSeats: newAvailableSeats,
        bookedSeats: updatedBookedSeats,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Add passenger to group chat (chat access is gated on paid status)
      if (chatDoc.exists) {
        transaction.update(chatRef, {
          participants: admin.firestore.FieldValue.arrayUnion(bookingData.passengerId),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else {
        transaction.set(chatRef, {
          rideId: bookingData.rideId,
          rideType: 'carpool',
          participants: [bookingData.driverId, bookingData.passengerId],
          lastMessage: `${bookingData.passengerName || 'Passenger'} joined the ride`,
          lastMessageTime: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      // Post system join message
      const msgRef = chatRef.collection('messages').doc();
      transaction.set(msgRef, {
        rideId: bookingData.rideId,
        senderId: 'system',
        senderName: 'System',
        senderPhoto: '',
        text: `${bookingData.passengerName || 'Passenger'} joined the ride`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        type: 'system',
      });

      return {
        bookingId,
        rideId: bookingData.rideId,
        driverId: bookingData.driverId,
        passengerId: bookingData.passengerId,
        passengerName: bookingData.passengerName,
        totalPrice: bookingData.totalPrice,
        amountPaise: expectedAmountPaise,
        alreadyProcessed: false,
      };
    });

    // 4. Razorpay Route Payout Transfer to Driver (Idempotent)
    if (!result.alreadyProcessed) {
      await processRazorpayRoutePayout({
        db,
        paymentId: razorpay_payment_id,
        bookingId,
        rideId: result.rideId,
        driverId: result.driverId,
        amountPaise: expectedAmountPaise,
      });
    }

    return res.json({
      success: true,
      message: 'Payment verified and captured successfully via Razorpay',
      bookingId: result.bookingId,
      rideId: result.rideId,
    });
  } catch (error: any) {
    console.error('[API] /verify-payment error:', error);
    return res.status(400).json({
      success: false,
      code: error.code || 'PAYMENT_FAILED',
      message: error.message || 'Failed to verify payment',
    });
  }
}

/**
 * Processes Razorpay Route Transfer for driver earnings (Idempotent)
 */
export async function processRazorpayRoutePayout(params: {
  db: admin.firestore.Firestore;
  paymentId: string;
  bookingId: string;
  rideId: string;
  driverId: string;
  amountPaise: number;
}) {
  const { db, paymentId, bookingId, rideId, driverId, amountPaise } = params;

  // Check if transfer record already exists (Idempotency check)
  const transferDocRef = db.collection('transfers').doc(`trf_${bookingId}`);
  const existingTransfer = await transferDocRef.get();
  if (existingTransfer.exists && ['processed', 'pending_driver_onboarding'].includes(existingTransfer.data()?.status)) {
    console.log(`[ROUTE PAYOUT] Transfer for booking ${bookingId} already exists: ${existingTransfer.data()?.status}`);
    return existingTransfer.data();
  }

  // Calculate platform fee and driver share
  const commissionPercentage = config.commissionPercentage || 10;
  const platformFeePaise = Math.round((amountPaise * commissionPercentage) / 100);
  const driverSharePaise = amountPaise - platformFeePaise;

  const driverDoc = await db.collection('users').doc(driverId).get();
  const driverData = driverDoc.data();
  const razorpayAccountId = driverData?.razorpayAccountId;

  if (razorpayAccountId && String(razorpayAccountId).startsWith('acc_')) {
    try {
      const transfer = await createRouteTransfer({
        paymentId,
        accountId: razorpayAccountId,
        amountPaise: driverSharePaise,
        notes: {
          rideId,
          bookingId,
          driverId,
          platformFeePaise: String(platformFeePaise),
        },
      });

      const transferData = {
        id: `trf_${bookingId}`,
        transferId: transfer.id || `trf_${bookingId}`,
        paymentId,
        bookingId,
        rideId,
        driverId,
        razorpayAccountId,
        grossAmountPaise: amountPaise,
        platformFeePaise,
        driverSharePaise,
        status: transfer.status || 'processed',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      };

      await transferDocRef.set(transferData, { merge: true });
      return transferData;
    } catch (err: any) {
      console.error(`[ROUTE PAYOUT FAILED] Payment ${paymentId} for driver ${driverId}:`, err);
      const fallbackData = {
        id: `trf_${bookingId}`,
        paymentId,
        bookingId,
        rideId,
        driverId,
        razorpayAccountId,
        grossAmountPaise: amountPaise,
        platformFeePaise,
        driverSharePaise,
        status: 'failed',
        failureReason: err.message,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      };
      await transferDocRef.set(fallbackData, { merge: true });
      return fallbackData;
    }
  } else {
    console.log(`[ROUTE PAYOUT] Driver ${driverId} has no Linked Account yet. Marking pending_driver_onboarding.`);
    const pendingData = {
      id: `trf_${bookingId}`,
      paymentId,
      bookingId,
      rideId,
      driverId,
      razorpayAccountId: null,
      grossAmountPaise: amountPaise,
      platformFeePaise,
      driverSharePaise,
      status: 'pending_driver_onboarding',
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };
    await transferDocRef.set(pendingData, { merge: true });
    return pendingData;
  }
}

/**
 * Executes Real Razorpay Refund & Transfer Reversal on Cancellation
 */
export async function executeBookingRefundAndReversal(params: {
  db: admin.firestore.Firestore;
  bookingId: string;
  reason: string;
  isPassengerCancellation: boolean;
  departureTimeIso?: string;
}): Promise<{ refundId?: string; refundAmountPaise: number; status: string }> {
  const { db, bookingId, reason, isPassengerCancellation, departureTimeIso } = params;

  const bookingDoc = await db.collection('bookings').doc(bookingId).get();
  if (!bookingDoc.exists) throw new Error('BOOKING_NOT_FOUND');
  const bookingData = bookingDoc.data()!;

  if (bookingData.paymentStatus !== 'paid' || !bookingData.paymentId) {
    return { refundAmountPaise: 0, status: 'no_payment_to_refund' };
  }

  const paymentId = bookingData.paymentId;
  const totalAmountPaise = getStoredBookingAmountPaise(bookingData, true);

  // Determine refund ratio according to PullUp policy
  let refundPercentage = 100;
  if (isPassengerCancellation && departureTimeIso) {
    const departureTime = new Date(departureTimeIso).getTime();
    const oneHourBefore = departureTime - 60 * 60 * 1000;
    if (Date.now() > oneHourBefore) {
      refundPercentage = 80; // 80% refund for last minute passenger cancellation
    }
  }

  const refundAmountPaise = Math.round((totalAmountPaise * refundPercentage) / 100);

  if (refundAmountPaise <= 0) {
    return { refundAmountPaise: 0, status: 'no_refund_applicable' };
  }

  // 1. Issue real Razorpay refund
  const refund = await createRazorpayRefund({
    paymentId,
    amountPaise: refundAmountPaise,
    notes: { bookingId, reason, refundPercentage: String(refundPercentage) },
  });

  const refundId = refund.id || `ref_${bookingId}_${Date.now()}`;

  // 2. Reverse Razorpay Route transfer if driver share was transferred
  const transferDoc = await db.collection('transfers').doc(`trf_${bookingId}`).get();
  if (transferDoc.exists && transferDoc.data()?.status === 'processed' && transferDoc.data()?.transferId) {
    const tData = transferDoc.data()!;
    const reversalAmountPaise = Math.round((tData.driverSharePaise * refundPercentage) / 100);
    try {
      const reversal = await reverseRouteTransfer({
        transferId: tData.transferId,
        amountPaise: reversalAmountPaise,
        notes: { bookingId, reason: 'booking_cancelled' },
      });
      await transferDoc.ref.update({
        status: refundPercentage === 100 ? 'reversed' : 'partially_reversed',
        reversalId: reversal.id || `rev_${Date.now()}`,
        reversalAmountPaise,
        updatedAt: admin.firestore.Timestamp.now(),
      });
    } catch (err) {
      console.error(`[ROUTE REVERSAL FAILED] Transfer ${tData.transferId}:`, err);
    }
  }

  const refundStatus = refundPercentage === 100 ? 'refunded' : 'partially_refunded';

  await db.collection('refunds').doc(refundId).set({
    refundId,
    paymentId,
    bookingId,
    rideId: bookingData.rideId,
    passengerId: bookingData.passengerId,
    totalAmountPaise,
    refundAmountPaise,
    refundPercentage,
    reason,
    status: 'processed',
    createdAt: admin.firestore.Timestamp.now(),
  });

  await db.collection('bookings').doc(bookingId).update({
    paymentStatus: refundStatus,
    refundId,
    refundAmountPaise,
    refundedAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  });

  return { refundId, refundAmountPaise, status: refundStatus };
}

/**
 * Comprehensive Razorpay Webhook Handler
 */
export async function handleRazorpayWebhook(req: Request, res: Response) {
  try {
    const signature = String(req.headers['x-razorpay-signature'] || '');
    const eventId = String(req.headers['x-razorpay-event-id'] || req.body?.id || '');
    const rawBody = (req as any).rawBody as Buffer | undefined;

    if (!rawBody || !signature) {
      return res.status(400).json({ success: false, message: 'Missing webhook body or signature' });
    }

    // 1. HMAC Signature Verification
    const isValidSignature = verifyWebhookSignature(rawBody, signature);
    if (!isValidSignature) {
      console.warn('[RAZORPAY WEBHOOK] Invalid HMAC signature!');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body;
    const db = getDb();

    // 2. Strict Idempotency Check (x-razorpay-event-id)
    if (eventId) {
      const eventDocRef = db.collection('webhookEvents').doc(eventId);
      const eventSnap = await eventDocRef.get();
      if (eventSnap.exists) {
        console.log(`[RAZORPAY WEBHOOK] Duplicate event ${eventId} ignored.`);
        return res.json({ success: true, duplicate: true });
      }

      await eventDocRef.set({
        eventId,
        event: event.event,
        payload: event.payload,
        createdAt: admin.firestore.Timestamp.now(),
      });
    }

    console.log(`[RAZORPAY WEBHOOK] Received event: ${event.event}`);

    // 3. Event Processing & Reconcilation
    const payload = event.payload || {};

    if (event.event === 'payment.captured') {
      const payment = payload.payment?.entity;
      if (payment?.notes?.bookingId) {
        const bookingId = payment.notes.bookingId;
        const bookingDoc = await db.collection('bookings').doc(bookingId).get();
        if (bookingDoc.exists && bookingDoc.data()?.paymentStatus !== 'paid') {
          const bData = bookingDoc.data()!;
          await bookingDoc.ref.update({
            status: 'confirmed',
            paymentStatus: 'paid',
            paymentId: payment.id,
            paidAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
          });
          await processRazorpayRoutePayout({
            db,
            paymentId: payment.id,
            bookingId,
            rideId: bData.rideId,
            driverId: bData.driverId,
            amountPaise: Number(payment.amount),
          });
        }
      }
    } else if (event.event === 'payment.failed') {
      const payment = payload.payment?.entity;
      if (payment?.notes?.bookingId) {
        await db.collection('bookings').doc(payment.notes.bookingId).update({
          paymentStatus: 'failed',
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }
    } else if (event.event === 'refund.processed') {
      const refund = payload.refund?.entity;
      if (refund?.notes?.bookingId) {
        await db.collection('bookings').doc(refund.notes.bookingId).update({
          paymentStatus: 'refunded',
          refundId: refund.id,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }
    } else if (event.event === 'transfer.processed') {
      const transfer = payload.transfer?.entity;
      if (transfer?.id) {
        const tQuery = await db.collection('transfers').where('transferId', '==', transfer.id).get();
        tQuery.forEach(doc => doc.ref.update({ status: 'processed', updatedAt: admin.firestore.Timestamp.now() }));
      }
    } else if (event.event === 'transfer.failed') {
      const transfer = payload.transfer?.entity;
      if (transfer?.id) {
        const tQuery = await db.collection('transfers').where('transferId', '==', transfer.id).get();
        tQuery.forEach(doc => doc.ref.update({ status: 'failed', failureReason: transfer.failure_reason, updatedAt: admin.firestore.Timestamp.now() }));
      }
    } else if (event.event === 'transfer.reversed') {
      const transfer = payload.transfer?.entity;
      if (transfer?.id) {
        const tQuery = await db.collection('transfers').where('transferId', '==', transfer.id).get();
        tQuery.forEach(doc => doc.ref.update({ status: 'reversed', updatedAt: admin.firestore.Timestamp.now() }));
      }
    } else if (event.event?.startsWith('subscription.')) {
      const subscription = payload.subscription?.entity;
      if (subscription?.id) {
        const statusByEvent: Record<string, string> = {
          'subscription.authenticated': 'authenticated',
          'subscription.activated': 'active',
          'subscription.charged': 'active',
          'subscription.pending': 'pending',
          'subscription.paused': 'paused',
          'subscription.resumed': 'active',
          'subscription.halted': 'payment_failed',
          'subscription.cancelled': 'cancelled',
        };
        const status = statusByEvent[event.event] || subscription.status;
        const subRef = db.collection('subscriptions').doc(subscription.id);
        const snap = await subRef.get();
        if (snap.exists) {
          const sData = snap.data()!;
          await subRef.update({
            status,
            currentStart: subscription.current_start || null,
            currentEnd: subscription.current_end || null,
            nextChargeAt: subscription.charge_at || null,
            lastWebhookEvent: event.event,
            updatedAt: admin.firestore.Timestamp.now(),
          });
          await db.collection('users').doc(sData.userId).set(
            {
              subscriptionStatus: status === 'active' ? 'active' : status,
              subscriptionProvider: 'razorpay',
              subscriptionId: subscription.id,
              updatedAt: admin.firestore.Timestamp.now(),
            },
            { merge: true }
          );
        }
      }
    } else if (event.event === 'payment.dispute.created') {
      const dispute = payload.dispute?.entity;
      if (dispute?.payment_id) {
        await db.collection('disputes').doc(dispute.id).set({
          disputeId: dispute.id,
          paymentId: dispute.payment_id,
          amount: dispute.amount,
          status: dispute.status,
          createdAt: admin.firestore.Timestamp.now(),
        });
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[RAZORPAY WEBHOOK ERROR]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
