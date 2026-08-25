import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    runTransaction,
    setDoc,
    Timestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { Booking } from '../types';
import { db } from './firebase';
import { addBookingToRide, updateAvailableSeats, updateBookingStatusInRide } from './rideService';
import { sendNotification } from './notificationService';
import { addParticipantToGroupChat, removeParticipantFromGroupChat } from './rideGroupChatService';
import apiClient from './backendApiClient';

/**
 * Create a new booking in Firestore
 * Called when passenger books a ride
 */
export const createBookingInFirestore = async (
  rideId: string,
  passengerId: string,
  passengerName: string,
  passengerEmail: string,
  driverId: string,
  seatsBooked: number,
  passengerPickupLocation?: any,
  passengerDropLocation?: any,
  detourMeta?: {
    passengerOriginalLocation?: any;
    passengerSelectedPickup?: any;
    extraDistanceMeters?: number;
    extraDurationSeconds?: number;
    walkingDistanceMeters?: number;
  }
): Promise<string> => {
  try {
    const response = await apiClient.post('/fare/create-booking', {
      rideId,
      seatsBooked,
      pickupLocation: passengerPickupLocation,
      dropLocation: passengerDropLocation,
      detourMeta,
    });
    if (!response.data?.success || !response.data?.bookingId) {
      throw new Error(response.data?.message || 'Failed to create booking');
    }
    return response.data.bookingId;
  } catch (error: any) {
    console.error('[BOOKING SERVICE] Authoritative booking creation failed:', error);
    throw {
      code: error.code || 'CREATE_BOOKING_ERROR',
      message: error.message || 'Failed to create booking',
    };
  }
};

/**
 * Get all bookings for a passenger
 */
export const getPassengerBookings = async (passengerId: string): Promise<Booking[]> => {
  try {
    console.log('[BOOKING SERVICE] Fetching bookings for passenger:', passengerId);

    const q = query(
      collection(db, 'bookings'),
      where('passengerId', '==', passengerId)
    );

    const querySnapshot = await getDocs(q);
    const bookings: Booking[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      bookings.push({
        id: doc.id,
        rideId: data.rideId,
        passengerId: data.passengerId,
        driverId: data.driverId,
        seatsBooked: data.seatsBooked,
        status: data.status,
        bookedAt: data.bookedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        cancelledAt: data.cancelledAt?.toDate?.()?.toISOString?.() || undefined,
        penaltyApplied: data.penaltyApplied,
        passengerPickupLocation: data.passengerPickupLocation || undefined,
        passengerDropLocation: data.passengerDropLocation || undefined,
        pickedUp: data.pickedUp,
        droppedOff: data.droppedOff,
        paymentStatus: data.paymentStatus,
        totalPrice: data.totalPrice,
        orderId: data.orderId,
        fare: data.fare,
        fareStatus: data.fareStatus,
        orderAmountPaise: data.orderAmountPaise,
      });
    });

    // Sort client-side by bookedAt descending
    bookings.sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime());

    console.log('[BOOKING SERVICE] ✅ Fetched', bookings.length, 'bookings for passenger');
    return bookings;
  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to fetch passenger bookings:', error);
    throw {
      code: error.code || 'FETCH_BOOKINGS_ERROR',
      message: error.message || 'Failed to fetch bookings',
    };
  }
};

/**
 * Get all bookings for a driver's rides
 */
export const getDriverBookings = async (driverId: string): Promise<Booking[]> => {
  try {
    console.log('[BOOKING SERVICE] Fetching bookings for driver:', driverId);

    const q = query(
      collection(db, 'bookings'),
      where('driverId', '==', driverId)
    );

    const querySnapshot = await getDocs(q);
    const bookings: Booking[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      bookings.push({
        id: doc.id,
        rideId: data.rideId,
        passengerId: data.passengerId,
        driverId: data.driverId,
        seatsBooked: data.seatsBooked,
        status: data.status,
        bookedAt: data.bookedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        cancelledAt: data.cancelledAt?.toDate?.()?.toISOString?.() || undefined,
        penaltyApplied: data.penaltyApplied,
        passengerPickupLocation: data.passengerPickupLocation || undefined,
        passengerDropLocation: data.passengerDropLocation || undefined,
        pickedUp: data.pickedUp,
        droppedOff: data.droppedOff,
        paymentStatus: data.paymentStatus,
        totalPrice: data.totalPrice,
        orderId: data.orderId,
        fare: data.fare,
        fareStatus: data.fareStatus,
        orderAmountPaise: data.orderAmountPaise,
      });
    });

    // Sort client-side by bookedAt descending
    bookings.sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime());

    console.log('[BOOKING SERVICE] ✅ Fetched', bookings.length, 'bookings for driver');
    return bookings;
  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to fetch driver bookings:', error);
    throw {
      code: error.code || 'FETCH_DRIVER_BOOKINGS_ERROR',
      message: error.message || 'Failed to fetch driver bookings',
    };
  }
};

/**
 * Get a specific booking by ID
 */
export const getBookingById = async (bookingId: string): Promise<Booking | null> => {
  try {
    console.log('[BOOKING SERVICE] Fetching booking:', bookingId);

    const docRef = doc(db, 'bookings', bookingId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.warn('[BOOKING SERVICE] ⚠️ Booking not found:', bookingId);
      return null;
    }

    const data = docSnap.data();
    const booking: Booking = {
      id: docSnap.id,
      rideId: data.rideId,
      passengerId: data.passengerId,
      driverId: data.driverId,
      seatsBooked: data.seatsBooked,
      status: data.status,
      bookedAt: data.bookedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
      cancelledAt: data.cancelledAt?.toDate?.()?.toISOString?.() || undefined,
      penaltyApplied: data.penaltyApplied,
      passengerPickupLocation: data.passengerPickupLocation || undefined,
      passengerDropLocation: data.passengerDropLocation || undefined,
      pickedUp: data.pickedUp,
      droppedOff: data.droppedOff,
      paymentStatus: data.paymentStatus,
      totalPrice: data.totalPrice,
      orderId: data.orderId,
        fare: data.fare,
        fareStatus: data.fareStatus,
        orderAmountPaise: data.orderAmountPaise,
    };

    console.log('[BOOKING SERVICE] ✅ Booking fetched');
    return booking;
  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to fetch booking:', error);
    throw {
      code: error.code || 'FETCH_BOOKING_ERROR',
      message: error.message || 'Failed to fetch booking',
    };
  }
};

/**
 * Get a booking by rideId and passengerId
 * Used by driver to accept/reject bookings
 */
export const getBookingByRideAndPassenger = async (
  rideId: string,
  passengerId: string
): Promise<Booking | null> => {
  try {
    console.log('[BOOKING SERVICE] Fetching booking for ride:', rideId, 'passenger:', passengerId);

    const bookingId = `${rideId}_${passengerId}`;
    const docRef = doc(db, 'bookings', bookingId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.warn('[BOOKING SERVICE] ⚠️ Booking not found for ride:', rideId, 'passenger:', passengerId);
      return null;
    }

    const data = docSnap.data();
    const selectedBooking: Booking = {
      id: docSnap.id,
      rideId: data.rideId,
      passengerId: data.passengerId,
      driverId: data.driverId,
      seatsBooked: data.seatsBooked,
      status: data.status,
      bookedAt: data.bookedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
      cancelledAt: data.cancelledAt?.toDate?.()?.toISOString?.() || undefined,
      penaltyApplied: data.penaltyApplied,
      passengerPickupLocation: data.passengerPickupLocation || undefined,
      passengerDropLocation: data.passengerDropLocation || undefined,
      pickedUp: data.pickedUp,
      droppedOff: data.droppedOff,
      paymentStatus: data.paymentStatus,
      totalPrice: data.totalPrice,
      orderId: data.orderId,
        fare: data.fare,
        fareStatus: data.fareStatus,
        orderAmountPaise: data.orderAmountPaise,
    };

    console.log('[BOOKING SERVICE] ✅ Booking fetched:', selectedBooking.id, 'with status:', selectedBooking.status);
    return selectedBooking;
  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to fetch booking by ride and passenger:', error);
    throw {
      code: error.code || 'FETCH_BOOKING_ERROR',
      message: error.message || 'Failed to fetch booking',
    };
  }
};

/**
 * Update booking status (accept, reject, cancel)
 */
export const updateBookingStatus = async (
  bookingId: string,
  rideId: string,
  passengerId: string,
  newStatus: 'pending' | 'accepted' | 'rejected' | 'cancelled',
  penalty?: number
): Promise<void> => {
  try {
    console.log('[BOOKING SERVICE] Updating booking', bookingId, 'to status:', newStatus);

    const docRef = doc(db, 'bookings', bookingId);
    const updateData: Record<string, any> = {
      status: newStatus,
      updatedAt: Timestamp.now(),
    };

    // Add penalty if provided
    if (penalty !== undefined) {
      updateData.penaltyApplied = penalty;
    }

    // Add cancellation timestamp if status is cancelled
    if (newStatus === 'cancelled') {
      updateData.cancelledAt = Timestamp.now();
    }

    await updateDoc(docRef, updateData);

    // Also update the booking status in the ride's bookedSeats array
    await updateBookingStatusInRide(rideId, passengerId, newStatus);

    console.log('[BOOKING SERVICE] ✅ Booking status updated');
  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to update booking status:', error);
    throw {
      code: error.code || 'UPDATE_BOOKING_STATUS_ERROR',
      message: error.message || 'Failed to update booking status',
    };
  }
};

/**
 * Cancel a booking with penalty calculation
 */
export const cancelBookingWithPenalty = async (
  bookingId: string,
  rideId: string,
  passengerId: string,
  departureTime: string
): Promise<number> => {
  try {
    console.log('[BOOKING SERVICE] Canceling booking:', bookingId);

    // Fetch booking details to get passengerName and paymentStatus
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingSnap = await getDoc(bookingRef);
    if (!bookingSnap.exists()) throw new Error('Booking not found');
    
    const bookingData = bookingSnap.data()!;
    const passengerName = bookingData.passengerName || 'Passenger';
    const isPaid = bookingData.paymentStatus === 'paid';
    const seatsBooked = bookingData.seatsBooked || 1;

    // Calculate penalty (50 if cancelled within 20 minutes of departure)
    const departureTimeDate = new Date(departureTime);
    const now = new Date();
    const minutesBefore = (departureTimeDate.getTime() - now.getTime()) / (1000 * 60);
    const penalty = minutesBefore <= 20 ? 50 : 0;

    // Update booking status to cancelled with penalty
    const updateData: Record<string, any> = {
      status: 'cancelled',
      updatedAt: Timestamp.now(),
      cancelledAt: Timestamp.now(),
      penaltyApplied: penalty
    };
    if (isPaid) {
      updateData.refundStatus = 'pending';
      const refundAmount = penalty > 0 ? Math.max(0, (bookingData.totalPrice || 0) - penalty) : (bookingData.totalPrice || 0);
      updateData.refundAmount = refundAmount;
    }

    await updateDoc(bookingRef, updateData);

    // Also update the booking status in the ride's bookedSeats array
    await updateBookingStatusInRide(rideId, passengerId, 'cancelled');

    // Trigger background route re-optimization asynchronously (Verification 4)
    try {
      await apiClient.post('/trigger-reoptimization', { rideId });
    } catch (reoptErr) {
      console.warn('[BOOKING SERVICE] Failed to trigger background re-optimization:', reoptErr);
    }

    // If booking was paid, restore seat capacity on the ride document!
    if (isPaid) {
      const rideRef = doc(db, 'rides', rideId);
      await runTransaction(db, async (transaction) => {
        const rideSnap = await transaction.get(rideRef);
        if (rideSnap.exists()) {
          const rideData = rideSnap.data()!;
          const currentAvailable = rideData.availableSeats || 0;
          const totalSeats = rideData.totalSeats || 0;
          const newAvailable = Math.min(totalSeats, currentAvailable + seatsBooked);
          
          transaction.update(rideRef, {
            availableSeats: newAvailable,
            updatedAt: Timestamp.now()
          });
        }
      });
    }

    // Remove passenger from group chat
    try {
      await removeParticipantFromGroupChat(rideId, passengerId, passengerName);
    } catch (chatErr) {
      console.warn('[BOOKING SERVICE] Failed to remove passenger from group chat:', chatErr);
    }

    console.log('[BOOKING SERVICE] ✅ Booking cancelled with penalty:', penalty);
    return penalty;
  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to cancel booking:', error);
    throw {
      code: error.code || 'CANCEL_BOOKING_ERROR',
      message: error.message || 'Failed to cancel booking',
    };
  }
};

/**
 * Accept a booking as driver (update status and reduce available seats)
 */
export const acceptBookingAsDriver = async (
  bookingId: string,
  rideId: string,
  passengerId: string,
  seatsToReduce: number,
  currentAvailableSeats: number,
  driverId: string,
  driverName: string
): Promise<void> => {
  try {
    const response = await apiClient.post('/fare/accept-booking', { bookingId });
    if (!response.data?.success) throw new Error(response.data?.message || 'Failed to accept booking');
  } catch (error: any) {
    console.error('[BOOKING SERVICE] Authoritative booking acceptance failed:', error);
    throw {
      code: error.code || 'ACCEPT_BOOKING_ERROR',
      message: error.message || 'Failed to accept booking',
    };
  }
};

export const rejectBookingAsDriver = async (
  bookingId: string,
  rideId: string,
  passengerId: string,
  driverId: string,
  driverName: string
): Promise<void> => {
  try {
    console.log('[BOOKING SERVICE] Atomic rejectBookingAsDriver:', bookingId);

    await runTransaction(db, async (transaction) => {
      const bookingRef = doc(db, 'bookings', bookingId);
      const rideRef = doc(db, 'rides', rideId);

      const bookingSnap = await transaction.get(bookingRef);
      const rideSnap = await transaction.get(rideRef);

      if (!bookingSnap.exists()) throw new Error('Booking not found');
      if (!rideSnap.exists()) throw new Error('Ride not found');

      const rideData = rideSnap.data()!;
      const bookedSeats = rideData.bookedSeats || [];
      const updatedBookedSeats = bookedSeats.map((b: any) => {
        if (b.passengerId === passengerId) {
          return { ...b, status: 'rejected' };
        }
        return b;
      });

      transaction.update(bookingRef, {
        status: 'rejected',
        updatedAt: Timestamp.now(),
      });

      transaction.update(rideRef, {
        bookedSeats: updatedBookedSeats,
        updatedAt: Timestamp.now(),
      });
    });

    console.log('[BOOKING SERVICE] ✅ Transaction committed. Sending rejection notification to passenger:', passengerId);

    // Send real Firestore notification to passenger
    await sendNotification(
      passengerId,
      'booking_rejected',
      'Booking Rejected',
      `${driverName} rejected your booking request.`,
      rideId,
      bookingId,
      driverId,
      driverName
    ).catch(err => console.error('[BOOKING SERVICE] Failed to send notification:', err));

  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to reject booking:', error);
    throw {
      code: error.code || 'REJECT_BOOKING_ERROR',
      message: error.message || 'Failed to reject booking',
    };
  }
};
