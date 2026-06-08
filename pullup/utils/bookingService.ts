import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    Timestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { Booking } from '../types';
import { db } from './firebase';
import { addBookingToRide, updateAvailableSeats, updateBookingStatusInRide } from './rideService';

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
  pricePerSeat: number
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
      bookedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    console.log('[BOOKING SERVICE] Booking data:', bookingData);

    // Add to bookings collection
    const docRef = await addDoc(collection(db, 'bookings'), bookingData);
    
    // Also add to ride's bookedSeats array for driver view
    await addBookingToRide(rideId, passengerId, passengerName, seatsBooked);

    console.log('[BOOKING SERVICE] ✅ Booking created successfully with ID:', docRef.id);
    return docRef.id;
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

    const q = query(
      collection(db, 'bookings'),
      where('rideId', '==', rideId),
      where('passengerId', '==', passengerId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn('[BOOKING SERVICE] ⚠️ Booking not found for ride:', rideId, 'passenger:', passengerId);
      return null;
    }

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
      });
    });

    // Sort client-side by bookedAt descending (latest first)
    bookings.sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime());

    // Prefer an active booking (pending or accepted) if one exists
    const activeBooking = bookings.find(b => b.status === 'pending' || b.status === 'accepted');
    const selectedBooking = activeBooking || bookings[0];

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

    // Calculate penalty (50 if cancelled within 20 minutes of departure)
    const departureTimeDate = new Date(departureTime);
    const now = new Date();
    const minutesBefore = (departureTimeDate.getTime() - now.getTime()) / (1000 * 60);
    const penalty = minutesBefore <= 20 ? 50 : 0;

    // Update booking status to cancelled with penalty
    await updateBookingStatus(bookingId, rideId, passengerId, 'cancelled', penalty);

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
  currentAvailableSeats: number
): Promise<void> => {
  try {
    console.log('[BOOKING SERVICE] Driver accepting booking:', bookingId);

    // Update booking status to accepted
    await updateBookingStatus(bookingId, rideId, passengerId, 'accepted');

    // Reduce available seats in the ride
    const newAvailableSeats = Math.max(0, currentAvailableSeats - seatsToReduce);
    await updateAvailableSeats(rideId, newAvailableSeats);

    console.log('[BOOKING SERVICE] ✅ Booking accepted, available seats updated');
  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to accept booking:', error);
    throw {
      code: error.code || 'ACCEPT_BOOKING_ERROR',
      message: error.message || 'Failed to accept booking',
    };
  }
};

/**
 * Reject a booking as driver
 */
export const rejectBookingAsDriver = async (
  bookingId: string,
  rideId: string,
  passengerId: string
): Promise<void> => {
  try {
    console.log('[BOOKING SERVICE] Driver rejecting booking:', bookingId);

    await updateBookingStatus(bookingId, rideId, passengerId, 'rejected');

    console.log('[BOOKING SERVICE] ✅ Booking rejected');
  } catch (error: any) {
    console.error('[BOOKING SERVICE] ❌ Failed to reject booking:', error);
    throw {
      code: error.code || 'REJECT_BOOKING_ERROR',
      message: error.message || 'Failed to reject booking',
    };
  }
};
