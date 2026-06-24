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
  pricePerSeat: number,
  passengerPickupLocation?: any,
  passengerDropLocation?: any
): Promise<string> => {
  try {
    console.log('[BOOKING SERVICE] Creating booking for ride:', rideId);

    // VALIDATION 1: Check if passenger is the ride creator
    if (passengerId === driverId) {
      console.error('[BOOKING SERVICE] ❌ Passenger cannot book their own ride');
      throw {
        code: 'OWN_RIDE_BOOKING',
        message: 'You cannot book your own ride',
      };
    }

    // VALIDATION 2: Check for duplicate bookings (only block active bookings)
    const existingBookingQuery = query(
      collection(db, 'bookings'),
      where('rideId', '==', rideId),
      where('passengerId', '==', passengerId)
    );
    const existingBookings = await getDocs(existingBookingQuery);
    
    const activeBooking = existingBookings.docs.find(doc => {
      const status = doc.data().status;
      return status === 'pending' || status === 'accepted';
    });
    
    if (activeBooking) {
      console.error('[BOOKING SERVICE] ❌ Duplicate active booking detected');
      throw {
        code: 'DUPLICATE_BOOKING',
        message: 'You have already booked this ride',
      };
    }

    const bookingData = {
      rideId,
      passengerId,
      passengerName,
      passengerEmail,
      driverId,
      seatsBooked,
      pricePerSeat,
      totalPrice: seatsBooked * pricePerSeat,
      status: 'pending' as const,
      paymentStatus: 'pending' as const,
      bookedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      passengerPickupLocation: passengerPickupLocation || null,
      passengerDropLocation: passengerDropLocation || null,
    };

    console.log('[BOOKING SERVICE] Booking data:', bookingData);

    // Set explicitly to bookingDocId = `${rideId}_${passengerId}`
    const bookingId = `${rideId}_${passengerId}`;
    const docRef = doc(db, 'bookings', bookingId);
    await setDoc(docRef, bookingData);
    
    // Also add to ride's bookedSeats array for driver view
    await addBookingToRide(rideId, passengerId, passengerName, seatsBooked);

    // Notify the driver about the new booking request
    await sendNotification(
      driverId,
      'booking_request',
      'New Booking Request 🚗',
      `${passengerName} requested ${seatsBooked} seat(s) on your ride.`,
      rideId,
      bookingId,
      passengerId,
      passengerName
    ).catch(err => console.error('[BOOKING SERVICE] Failed to send booking_request notification to driver:', err));

    console.log('[BOOKING SERVICE] ✅ Booking created successfully with ID:', bookingId);
    return bookingId;
  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to create booking:', error);
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
    console.log('[BOOKING SERVICE] Atomic acceptBookingAsDriver:', bookingId);

    let passengerName = 'Passenger';

    await runTransaction(db, async (transaction) => {
      const bookingRef = doc(db, 'bookings', bookingId);
      const rideRef = doc(db, 'rides', rideId);

      const bookingSnap = await transaction.get(bookingRef);
      const rideSnap = await transaction.get(rideRef);

      if (!bookingSnap.exists()) throw new Error('Booking not found');
      if (!rideSnap.exists()) throw new Error('Ride not found');

      const bookingData = bookingSnap.data()!;
      passengerName = bookingData.passengerName || 'Passenger';

      const rideData = rideSnap.data()!;
      const bookedSeats = rideData.bookedSeats || [];
      const updatedBookedSeats = bookedSeats.map((b: any) => {
        if (b.passengerId === passengerId) {
          return { ...b, status: 'accepted' };
        }
        return b;
      });

      transaction.update(bookingRef, {
        status: 'accepted',
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)),
        updatedAt: Timestamp.now(),
      });

      // Do NOT reduce availableSeats here! Only update bookedSeats status to 'accepted'.
      transaction.update(rideRef, {
        bookedSeats: updatedBookedSeats,
        updatedAt: Timestamp.now(),
      });
    });

    console.log('[BOOKING SERVICE] ✅ Transaction committed. Sending notification to passenger...');

    // Send real Firestore notification to passenger (notifying them to complete payment)
    await sendNotification(
      passengerId,
      'booking_accepted',
      'Booking Approved 🎉',
      `${driverName} accepted your booking. Please complete payment to confirm your seat.`,
      rideId,
      bookingId,
      driverId,
      driverName
    ).catch(err => console.error('[BOOKING SERVICE] Failed to send notification:', err));

  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to accept booking:', error);
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
