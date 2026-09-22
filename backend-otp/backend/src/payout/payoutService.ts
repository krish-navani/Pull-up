import admin from 'firebase-admin';
import { PayoutRecord, RefundRecord, RefundReason, PayoutStatus } from './types.js';
import { defaultPayoutProvider } from './deferredPayoutProvider.js';
import { createRazorpayRefund } from '../razorpayService.js';

/**
 * Creates or updates a pending payout ledger record when a passenger pays for a booking.
 * Idempotent: If payout record already exists, it is not duplicated.
 */
export async function createPendingPayoutRecord(
  db: admin.firestore.Firestore,
  params: {
    bookingId: string;
    rideId: string;
    driverId: string;
    passengerId: string;
    paymentId: string;
    orderId: string;
    totalAmountPaise: number;
    platformFeePaise?: number;
  }
): Promise<PayoutRecord> {
  const {
    bookingId,
    rideId,
    driverId,
    passengerId,
    paymentId,
    orderId,
    totalAmountPaise,
  } = params;

  const platformFeePaise = params.platformFeePaise ?? 1000; // Default ₹10 (1000 paise)
  const driverSharePaise = Math.max(0, totalAmountPaise - platformFeePaise);

  const payoutRef = db.collection('payouts').doc(`payout_${bookingId}`);
  const existing = await payoutRef.get();

  if (existing.exists) {
    console.log(`[PAYOUT SERVICE] Payout record already exists for booking ${bookingId}`);
    return existing.data() as PayoutRecord;
  }

  const now = admin.firestore.Timestamp.now();
  const record: PayoutRecord = {
    id: `payout_${bookingId}`,
    bookingId,
    rideId,
    driverId,
    passengerId,
    paymentId,
    orderId,
    amountPaise: totalAmountPaise,
    driverSharePaise,
    platformFeePaise,
    currency: 'INR',
    status: 'pending_completion',
    provider: defaultPayoutProvider.name,
    providerPayoutId: null,
    failureReason: null,
    retryCount: 0,
    voidedReason: null,
    voidedAt: null,
    clearedAt: null,
    paidAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await payoutRef.set(record);
  console.log(`[PAYOUT SERVICE] Created pending_completion payout record for booking ${bookingId}: driverShare=₹${(driverSharePaise / 100).toFixed(2)}, fee=₹${(platformFeePaise / 100).toFixed(2)}`);
  return record;
}

/**
 * Transitions pending payouts for a completed ride to 'ready_for_payout'
 * and passes them to the payout provider abstraction.
 */
export async function clearPayoutsForCompletedRide(
  db: admin.firestore.Firestore,
  rideId: string
): Promise<Array<{ bookingId: string; status: PayoutStatus; amount: number }>> {
  const payoutsSnap = await db
    .collection('payouts')
    .where('rideId', '==', rideId)
    .where('status', '==', 'pending_completion')
    .get();

  const results: Array<{ bookingId: string; status: PayoutStatus; amount: number }> = [];

  for (const doc of payoutsSnap.docs) {
    const payout = doc.data() as PayoutRecord;
    const now = admin.firestore.Timestamp.now();

    try {
      // Get driver UPI / account details if stored
      const driverDoc = await db.collection('users').doc(payout.driverId).get();
      const driverData = driverDoc.data() || {};
      const destinationUpiVpa = driverData.upiId || null;
      const destinationAccountId = driverData.razorpayAccountId || null;

      const providerResult = await defaultPayoutProvider.createPayout({
        payoutId: payout.id,
        bookingId: payout.bookingId,
        rideId: payout.rideId,
        driverId: payout.driverId,
        driverSharePaise: payout.driverSharePaise,
        currency: payout.currency,
        destinationUpiVpa,
        destinationAccountId,
        notes: {
          rideId: payout.rideId,
          bookingId: payout.bookingId,
        },
      });

      await doc.ref.update({
        status: providerResult.status,
        providerPayoutId: providerResult.providerPayoutId || null,
        clearedAt: now,
        updatedAt: now,
      });

      results.push({
        bookingId: payout.bookingId,
        status: providerResult.status,
        amount: payout.driverSharePaise,
      });

      console.log(`[PAYOUT SERVICE] Cleared payout for booking ${payout.bookingId} -> ${providerResult.status}`);
    } catch (err: any) {
      console.error(`[PAYOUT SERVICE] Failed to clear payout for booking ${payout.bookingId}:`, err);
      await doc.ref.update({
        status: 'failed',
        failureReason: err.message || 'Payout clearance failed',
        retryCount: (payout.retryCount || 0) + 1,
        updatedAt: now,
      });
      results.push({
        bookingId: payout.bookingId,
        status: 'failed',
        amount: payout.driverSharePaise,
      });
    }
  }

  return results;
}

/**
 * Cancels / Voids a payout and executes a Razorpay refund for a booking.
 * Idempotent: Never allows duplicate refunds.
 */
export async function voidPayoutAndExecuteRefund(
  db: admin.firestore.Firestore,
  params: {
    bookingId: string;
    reason: RefundReason;
    initiatedBy: string;
    customAmountPaise?: number;
  }
): Promise<{ success: boolean; refundId?: string; message: string }> {
  const { bookingId, reason, initiatedBy, customAmountPaise } = params;

  const bookingRef = db.collection('bookings').doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    return { success: false, message: 'Booking not found' };
  }

  const bookingData = bookingSnap.data()!;

  // If already refunded, return success idempotently
  if (bookingData.paymentStatus === 'refunded') {
    return { success: true, message: 'Booking is already refunded' };
  }

  if (bookingData.paymentStatus !== 'paid' || !bookingData.paymentId) {
    return { success: false, message: `Booking cannot be refunded (paymentStatus is ${bookingData.paymentStatus})` };
  }

  const paymentId = bookingData.paymentId;
  const refundAmountPaise = customAmountPaise ?? (
    bookingData.orderAmountPaise ||
    (bookingData.fare?.totalAmountPaise) ||
    Math.round((bookingData.totalPrice || 0) * 100)
  );

  if (!refundAmountPaise || refundAmountPaise <= 0) {
    return { success: false, message: 'Invalid refund amount calculated' };
  }

  const now = admin.firestore.Timestamp.now();
  const refundDocId = `ref_${bookingId}_${Date.now()}`;
  const refundRef = db.collection('refunds').doc(refundDocId);

  // 1. Check & Void the Payout Record first so the driver can never be paid
  const payoutRef = db.collection('payouts').doc(`payout_${bookingId}`);
  const payoutSnap = await payoutRef.get();

  if (payoutSnap.exists) {
    const payoutData = payoutSnap.data() as PayoutRecord;
    if (payoutData.status === 'paid') {
      return { success: false, message: 'Cannot refund: driver has already been paid for this ride' };
    }
    await payoutRef.update({
      status: 'voided',
      voidedReason: reason,
      voidedAt: now,
      updatedAt: now,
    });
    console.log(`[PAYOUT SERVICE] Voided payout for booking ${bookingId} due to ${reason}`);
  }

  // 2. Record Refund as 'initiated'
  const refundRecord: RefundRecord = {
    id: refundDocId,
    bookingId,
    rideId: bookingData.rideId,
    passengerId: bookingData.passengerId,
    driverId: bookingData.driverId,
    paymentId,
    orderId: bookingData.orderId || undefined,
    amountPaise: refundAmountPaise,
    reason,
    status: 'initiated',
    razorpayRefundId: null,
    failureReason: null,
    initiatedBy,
    createdAt: now,
    processedAt: null,
    updatedAt: now,
  };

  await refundRef.set(refundRecord);

  // 3. Call Razorpay Refund API
  try {
    const rzpRefund = await createRazorpayRefund({
      paymentId,
      amountPaise: refundAmountPaise,
      notes: {
        bookingId,
        rideId: bookingData.rideId,
        reason,
        initiatedBy,
      },
    });

    const rzpRefundId = rzpRefund?.id || `rzp_ref_${Date.now()}`;

    // 4. Update Refund Record to 'processed'
    await refundRef.update({
      status: 'processed',
      razorpayRefundId: rzpRefundId,
      processedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // 5. Update Booking status to 'refunded'
    await bookingRef.update({
      paymentStatus: 'refunded',
      refundId: rzpRefundId,
      refundedAt: admin.firestore.Timestamp.now(),
      refundReason: reason,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // 6. Update Ride's bookedSeats status if applicable
    const rideRef = db.collection('rides').doc(bookingData.rideId);
    const rideSnap = await rideRef.get();
    if (rideSnap.exists) {
      const rideData = rideSnap.data()!;
      const updatedSeats = (rideData.bookedSeats || []).map((seat: any) =>
        seat.passengerId === bookingData.passengerId
          ? { ...seat, paymentStatus: 'refunded', status: 'cancelled' }
          : seat
      );
      await rideRef.update({
        bookedSeats: updatedSeats,
        updatedAt: admin.firestore.Timestamp.now(),
      });
    }

    console.log(`[PAYOUT SERVICE] Successfully processed Razorpay refund ${rzpRefundId} for booking ${bookingId}`);
    return { success: true, refundId: rzpRefundId, message: 'Refund processed successfully' };
  } catch (err: any) {
    console.error(`[PAYOUT SERVICE] Razorpay refund failed for booking ${bookingId}:`, err);
    await refundRef.update({
      status: 'failed',
      failureReason: err.message || 'Razorpay refund API call failed',
      updatedAt: admin.firestore.Timestamp.now(),
    });
    return { success: false, message: err.message || 'Refund failed' };
  }
}
