import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Location, Ride } from '../types';
import { db } from './firebase';
import apiClient from './backendApiClient';
import { initializeGroupChat } from './rideGroupChatService';
import { sendNotification } from './notificationService';

/**
 * Create a new ride in Firestore
 * Called when driver posts a ride
 */
export const createRideInFirestore = async (
  driverId: string,
  driverName: string,
  rideData: {
    pickupLocation: Location;
    dropLocation: Location;
    departureTime: string; // ISO format
    price: number;
    availableSeats: number;
    totalSeats: number;
    carModel: string;
    carColor?: string;
    description?: string;
    detourRadiusMeters?: number;
  }
): Promise<string> => {
  try {
    console.log('[RIDE SERVICE] Creating ride for driver:', driverId);

    const firebaseRideData = {
      driverId,
      driverName,
      pickupLocation: rideData.pickupLocation,
      dropLocation: rideData.dropLocation,
      departureTime: rideData.departureTime,
      price: rideData.price,
      availableSeats: rideData.availableSeats,
      totalSeats: rideData.totalSeats,
      carModel: rideData.carModel,
      carColor: rideData.carColor || '',
      description: rideData.description || '',
      createdAt: Timestamp.now(),
      status: 'active',
      bookedSeats: [],
      detourRadiusMeters: rideData.detourRadiusMeters ?? 0,
    };

    console.log('[RIDE SERVICE] Ride data to save:', firebaseRideData);

    // Add document to rides collection (auto-generates ID)
    const docRef = await addDoc(collection(db, 'rides'), firebaseRideData);
    
    // Initialize group chat for the ride
    try {
      await initializeGroupChat(docRef.id, 'carpool', driverId, driverName);
    } catch (chatErr) {
      console.warn('[RIDE SERVICE] Failed to initialize group chat:', chatErr);
    }

    console.log('[RIDE SERVICE] ✅ Ride created successfully with ID:', docRef.id);
    return docRef.id;
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to create ride:', error);
    throw {
      code: error.code || 'CREATE_RIDE_ERROR',
      message: error.message || 'Failed to create ride',
    };
  }
};

/**
 * Get all active and in-progress rides (for passengers searching and tracking)
 * Fetches rides with status 'active' (posted but not started) OR 'in_progress' (started by driver)
 */
export const getAllRides = async (): Promise<Ride[]> => {
  try {
    console.log('[RIDE SERVICE] Fetching all active and in-progress rides');

    // Use 'in' operator to query both 'active' and 'in_progress' statuses.
    // NOTE: combining where('status', 'in', [...]) with orderBy() requires a
    // composite index. To avoid the misleading 'permission-denied' error that
    // Firestore throws when the index is missing, we skip orderBy here and
    // sort the results client-side instead.
    const q = query(
      collection(db, 'rides'),
      where('status', 'in', ['active', 'in_progress'])
    );

    const querySnapshot = await getDocs(q);
    const rides: Ride[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      rides.push({
        id: doc.id,
        driverId: data.driverId,
        driverName: data.driverName,
        pickupLocation: data.pickupLocation,
        dropLocation: data.dropLocation,
        departureTime: data.departureTime,
        price: data.price,
        availableSeats: data.availableSeats,
        totalSeats: data.totalSeats,
        carModel: data.carModel,
        carColor: data.carColor,
        description: data.description,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        status: data.status,
        bookedSeats: data.bookedSeats || [],
        detourRadiusMeters: data.detourRadiusMeters || 0,
      });
    });

    // Sort client-side by departureTime ascending
    rides.sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime());

    console.log('[RIDE SERVICE] ✅ Fetched', rides.length, 'active and in-progress rides');
    return rides;
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to fetch rides:', error);
    throw {
      code: error.code || 'FETCH_RIDES_ERROR',
      message: error.message || 'Failed to fetch rides',
    };
  }
};

/**
 * Get ALL rides including history (active, in-progress, completed, cancelled)
 * Used for ride history view to show all user's rides across all statuses
 */
export const getAllRidesIncludingHistory = async (): Promise<Ride[]> => {
  try {
    console.log('[RIDE SERVICE] Fetching all rides including history (all statuses)');

    // Fetch rides with ALL statuses: active, in_progress, completed, cancelled.
    // Sorting is done client-side to avoid needing a composite index.
    const q = query(
      collection(db, 'rides'),
      where('status', 'in', ['active', 'in_progress', 'completed', 'cancelled'])
    );

    const querySnapshot = await getDocs(q);
    const rides: Ride[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      rides.push({
        id: doc.id,
        driverId: data.driverId,
        driverName: data.driverName,
        pickupLocation: data.pickupLocation,
        dropLocation: data.dropLocation,
        departureTime: data.departureTime,
        price: data.price,
        availableSeats: data.availableSeats,
        totalSeats: data.totalSeats,
        carModel: data.carModel,
        carColor: data.carColor,
        description: data.description,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        status: data.status,
        bookedSeats: data.bookedSeats || [],
        detourRadiusMeters: data.detourRadiusMeters || 0,
      });
    });

    // Sort client-side by departureTime descending
    rides.sort((a, b) => new Date(b.departureTime).getTime() - new Date(a.departureTime).getTime());

    console.log('[RIDE SERVICE] ✅ Fetched', rides.length, 'rides (all statuses: active, in-progress, completed, cancelled)');
    return rides;
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to fetch rides with history:', error);
    throw {
      code: error.code || 'FETCH_RIDES_HISTORY_ERROR',
      message: error.message || 'Failed to fetch rides with history',
    };
  }
};

/**
 * Get rides posted by a specific driver
 */
export const getDriverRides = async (driverId: string): Promise<Ride[]> => {
  try {
    console.log('[RIDE SERVICE] Fetching rides for driver:', driverId);

    // Single-field where + orderBy on a different field also needs an index.
    // Sort client-side to keep things index-free.
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', driverId)
    );

    const querySnapshot = await getDocs(q);
    const rides: Ride[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      rides.push({
        id: doc.id,
        driverId: data.driverId,
        driverName: data.driverName,
        pickupLocation: data.pickupLocation,
        dropLocation: data.dropLocation,
        departureTime: data.departureTime,
        price: data.price,
        availableSeats: data.availableSeats,
        totalSeats: data.totalSeats,
        carModel: data.carModel,
        carColor: data.carColor,
        description: data.description,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        status: data.status,
        bookedSeats: data.bookedSeats || [],
        detourRadiusMeters: data.detourRadiusMeters || 0,
      });
    });

    // Sort client-side by departureTime descending
    rides.sort((a, b) => new Date(b.departureTime).getTime() - new Date(a.departureTime).getTime());

    console.log('[RIDE SERVICE] ✅ Fetched', rides.length, 'rides for driver');
    return rides;
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to fetch driver rides:', error);
    throw {
      code: error.code || 'FETCH_DRIVER_RIDES_ERROR',
      message: error.message || 'Failed to fetch driver rides',
    };
  }
};

/**
 * Get a specific ride by ID
 */
export const getRideById = async (rideId: string): Promise<Ride | null> => {
  try {
    console.log('[RIDE SERVICE] Fetching ride:', rideId);

    const docRef = doc(db, 'rides', rideId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.warn('[RIDE SERVICE] ⚠️ Ride not found:', rideId);
      return null;
    }

    const data = docSnap.data();
    const ride: Ride = {
      id: docSnap.id,
      driverId: data.driverId,
      driverName: data.driverName,
      pickupLocation: data.pickupLocation,
      dropLocation: data.dropLocation,
      departureTime: data.departureTime,
      price: data.price,
      availableSeats: data.availableSeats,
      totalSeats: data.totalSeats,
      carModel: data.carModel,
      carColor: data.carColor,
      description: data.description,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
      status: data.status,
      bookedSeats: data.bookedSeats || [],
      detourRadiusMeters: data.detourRadiusMeters || 0,
    };

    console.log('[RIDE SERVICE] ✅ Ride fetched:', ride);
    return ride;
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to fetch ride:', error);
    throw {
      code: error.code || 'FETCH_RIDE_ERROR',
      message: error.message || 'Failed to fetch ride',
    };
  }
};

/**
 * Update ride status (active, completed, cancelled)
 */
export const updateRideStatus = async (
  rideId: string,
  status: 'active' | 'completed' | 'cancelled'
): Promise<void> => {
  try {
    console.log('[RIDE SERVICE] Updating ride', rideId, 'status to:', status);

    const docRef = doc(db, 'rides', rideId);
    await updateDoc(docRef, {
      status,
      updatedAt: Timestamp.now(),
    });

    console.log('[RIDE SERVICE] ✅ Ride status updated');
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to update ride status:', error);
    throw {
      code: error.code || 'UPDATE_RIDE_STATUS_ERROR',
      message: error.message || 'Failed to update ride status',
    };
  }
};

/**
 * Update available seats in a ride (when booking is accepted)
 */
export const updateAvailableSeats = async (
  rideId: string,
  availableSeats: number
): Promise<void> => {
  try {
    console.log('[RIDE SERVICE] Updating available seats for ride', rideId, ':', availableSeats);

    const docRef = doc(db, 'rides', rideId);
    await updateDoc(docRef, {
      availableSeats: Math.max(0, availableSeats),
      updatedAt: Timestamp.now(),
    });

    console.log('[RIDE SERVICE] ✅ Available seats updated');
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to update available seats:', error);
    throw {
      code: error.code || 'UPDATE_SEATS_ERROR',
      message: error.message || 'Failed to update available seats',
    };
  }
};

/**
 * Add a booking to ride's bookedSeats array
 */
export const addBookingToRide = async (
  rideId: string,
  passengerId: string,
  passengerName: string,
  seatsBooked: number
): Promise<void> => {
  try {
    console.log('[RIDE SERVICE] Adding booking to ride', rideId);

    const docRef = doc(db, 'rides', rideId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Ride not found');
    }

    const ride = docSnap.data();
    // Filter out any existing booking entries for this passenger to avoid duplicate entries when re-booking
    const cleanBookedSeats = (ride.bookedSeats || []).filter(
      (b: any) => b.passengerId !== passengerId
    );

    const newBooking = {
      passengerId,
      passengerName,
      seatsBooked,
      status: 'pending' as const,
      bookedAt: new Date().toISOString(),
    };

    await updateDoc(docRef, {
      bookedSeats: [...cleanBookedSeats, newBooking],
      updatedAt: Timestamp.now(),
    });

    console.log('[RIDE SERVICE] ✅ Booking added to ride');
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to add booking:', error);
    throw {
      code: error.code || 'ADD_BOOKING_ERROR',
      message: error.message || 'Failed to add booking to ride',
    };
  }
};

/**
 * Update booking status in ride's bookedSeats array
 */
export const updateBookingStatusInRide = async (
  rideId: string,
  passengerId: string,
  newStatus: 'pending' | 'accepted' | 'rejected' | 'cancelled'
): Promise<void> => {
  try {
    console.log('[RIDE SERVICE] Updating booking status for ride', rideId, 'passenger', passengerId);

    const docRef = doc(db, 'rides', rideId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Ride not found');
    }

    const ride = docSnap.data();
    const bookedSeats = ride.bookedSeats || [];

    const updatedBookedSeats = bookedSeats.map((booking: any) => {
      if (booking.passengerId === passengerId) {
        return { ...booking, status: newStatus };
      }
      return booking;
    });

    await updateDoc(docRef, {
      bookedSeats: updatedBookedSeats,
      updatedAt: Timestamp.now(),
    });

    console.log('[RIDE SERVICE] ✅ Booking status updated');
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to update booking status:', error);
    throw {
      code: error.code || 'UPDATE_BOOKING_STATUS_ERROR',
      message: error.message || 'Failed to update booking status',
    };
  }
};

/**
 * Start a ride (driver clicks START button)
 * Changes status from 'active' to 'in_progress'
 */
export const startRide = async (rideId: string): Promise<void> => {
  try {
    console.log('[RIDE SERVICE] Starting ride:', rideId);

    const docRef = doc(db, 'rides', rideId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Ride not found');
    }

    const ride = docSnap.data();
    if (ride.status !== 'active') {
      throw new Error(`Cannot start ride with status: ${ride.status}`);
    }

    const now = Timestamp.now();
    await updateDoc(docRef, {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      updatedAt: now,
    });

    console.log('[RIDE SERVICE] ✅ Ride started. Notifying passengers...');

    // Notify all confirmed passengers
    const activeSeats = (ride.bookedSeats || []).filter(
      (seat: any) => seat.status === 'accepted' || seat.status === 'confirmed'
    );

    for (const seat of activeSeats) {
      await sendNotification(
        seat.passengerId,
        'ride_started',
        'Ride Started 🚀',
        `${ride.driverName || 'The driver'} has started the ride. Track location now.`,
        rideId
      ).catch(err => console.error('[RIDE SERVICE] Failed to notify passenger', seat.passengerId, 'on ride start:', err));
    }
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to start ride:', error);
    throw {
      code: error.code || 'START_RIDE_ERROR',
      message: error.message || 'Failed to start ride',
    };
  }
};

/**
 * Complete a ride (driver clicks FINISH button)
 * Changes status from 'in_progress' to 'completed'
 */
export const completeRide = async (rideId: string): Promise<void> => {
  try {
    console.log('[RIDE SERVICE] Completing ride via backend API:', rideId);
    await apiClient.post('/complete-ride', { rideId });
    console.log('[RIDE SERVICE] ✅ Ride completed successfully via backend');
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to complete ride:', error);
    throw {
      code: error.code || 'COMPLETE_RIDE_ERROR',
      message: error.message || 'Failed to complete ride',
    };
  }
};

/**
 * Delete rides that have expired (departure time is more than 6 hours in the past)
 * Called periodically to clean up old/expired rides from the database
 */
export const deleteExpiredRides = async (): Promise<number> => {
  try {
    console.log('[RIDE SERVICE] Checking for expired rides...');
    
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6 hours = 21,600,000 ms
    
    // Query for all active rides (single-field equality, index-free)
    const q = query(
      collection(db, 'rides'),
      where('status', '==', 'active')
    );
    
    const querySnapshot = await getDocs(q);
    let deletedCount = 0;
    
    // Filter and delete each expired ride client-side
    for (const doc of querySnapshot.docs) {
      try {
        const data = doc.data();
        const departureDate = new Date(data.departureTime);
        if (departureDate.getTime() < sixHoursAgo.getTime()) {
          await deleteDoc(doc.ref);
          deletedCount++;
          console.log('[RIDE SERVICE] ✅ Deleted expired ride:', doc.id);
        }
      } catch (err) {
        console.error('[RIDE SERVICE] Failed to delete ride:', doc.id, err);
      }
    }
    
    console.log('[RIDE SERVICE] ✅ Deleted', deletedCount, 'expired rides');
    return deletedCount;
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to delete expired rides:', error);
    throw {
      code: error.code || 'DELETE_EXPIRED_RIDES_ERROR',
      message: error.message || 'Failed to delete expired rides',
    };
  }
};

/**
 * Start a scheduled interval to automatically delete expired rides
 * Runs every 5 minutes to check for rides older than 6 hours
 * Call this once in your app initialization (e.g., in AppContext or main app file)
 */
let rideCleanupInterval: any = null;

export const startRideCleanupScheduler = (): void => {
  if (rideCleanupInterval) {
    console.log('[RIDE SERVICE] Ride cleanup scheduler already running');
    return;
  }
  
  console.log('[RIDE SERVICE] Starting ride cleanup scheduler...');
  
  // Run immediately on start
  deleteExpiredRides().catch(err => console.error('[RIDE SERVICE] Initial cleanup failed:', err));
  
  // Then run every 5 minutes (300,000 ms)
  rideCleanupInterval = setInterval(() => {
    deleteExpiredRides().catch(err => console.error('[RIDE SERVICE] Scheduled cleanup failed:', err));
  }, 5 * 60 * 1000);
};

/**
 * Stop the scheduled ride cleanup
 * Call this when app is shutting down or user logs out
 */
export const stopRideCleanupScheduler = (): void => {
  if (rideCleanupInterval) {
    clearInterval(rideCleanupInterval);
    rideCleanupInterval = null;
    console.log('[RIDE SERVICE] Ride cleanup scheduler stopped');
  }
};
