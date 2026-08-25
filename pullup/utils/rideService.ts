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
import { calculateDistance } from './locationUtils';

const SEARCH_ALIASES: Record<string, string[]> = {
  udupi: ['bhandup', 'udupi'],
  bhandup: ['bhandup', 'udupi'],
  powai: ['powai', 'hiranandani', 'iit', 'jvlr', 'lake homes'],
  atlas: ['atlas', 'skilltech', 'campus', 'gate'],
  college: ['atlas', 'skilltech', 'campus', 'college'],
  university: ['atlas', 'skilltech', 'campus', 'college'],
  metro: ['metro', 'station'],
};

export const normalizeLocationSearchText = (value?: string | null): string => {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const getLocationSearchTokens = (...values: Array<string | undefined | null>): string[] => {
  const tokens = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeLocationSearchText(value);
    if (!normalized) return;
    tokens.add(normalized);
    normalized.split(/\s+/).forEach((token) => {
      if (token.length >= 2) tokens.add(token);
      SEARCH_ALIASES[token]?.forEach((alias) => tokens.add(alias));
    });
  });
  return Array.from(tokens);
};

export const getRideSearchScore = (
  rideLike: any,
  queryText: string,
  options?: {
    distanceKm?: number;
    userLocation?: { latitude: number; longitude: number } | null;
  }
): number => {
  const cleanQuery = normalizeLocationSearchText(queryText);
  let score = 0;

  const pickup = rideLike.pickupLocation || rideLike.pickup || {};
  const drop = rideLike.dropLocation || rideLike.destination || rideLike.dropoff || {};
  const searchTokens = new Set<string>([
    ...getLocationSearchTokens(
      pickup.address,
      pickup.city,
      pickup.locality,
      pickup.placeId,
      drop.address,
      drop.city,
      drop.locality,
      drop.placeId,
      rideLike.driverName,
      rideLike.creatorName
    ),
    ...((rideLike.searchIndex || []) as string[]).map(normalizeLocationSearchText),
  ]);

  if (cleanQuery) {
    const queryTokens = getLocationSearchTokens(cleanQuery);
    const hasEveryToken = queryTokens.every((token) =>
      Array.from(searchTokens).some((idx) => idx === token || idx.includes(token) || token.includes(idx))
    );
    if (!hasEveryToken) return Number.NEGATIVE_INFINITY;
    score += queryTokens.reduce((total, token) => {
      const exactPlace = token && (pickup.placeId === token || drop.placeId === token);
      const exactToken = searchTokens.has(token);
      return total + (exactPlace ? 600 : exactToken ? 120 : 40);
    }, 0);
  }

  const distanceKm = options?.distanceKm;
  if (typeof distanceKm === 'number' && isFinite(distanceKm)) {
    score += Math.max(0, 80 - distanceKm * 8);
  } else if (options?.userLocation && pickup.latitude && pickup.longitude) {
    const computedDistance = calculateDistance(
      options.userLocation.latitude,
      options.userLocation.longitude,
      pickup.latitude,
      pickup.longitude
    );
    score += Math.max(0, 80 - computedDistance * 8);
  }

  const availableSeats = Number(rideLike.availableSeats ?? rideLike.seatsLeft ?? 0);
  score += Math.min(availableSeats, 4) * 8;

  const rating = Number(rideLike.driverRating ?? rideLike.creatorRating ?? rideLike.rating ?? 0);
  if (rating > 0) score += Math.min(rating, 5) * 6;

  const departureMs = new Date(rideLike.departureTime || rideLike.time || 0).getTime();
  if (departureMs > Date.now()) {
    const hoursAway = (departureMs - Date.now()) / 36e5;
    score += Math.max(0, 24 - hoursAway);
  }

  return score;
};

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
    departureTime: string;
    price?: number;
    availableSeats: number;
    totalSeats: number;
    carModel: string;
    fuelType?: 'Petrol' | 'Diesel' | 'EV';
    carColor?: string;
    description?: string;
    detourRadiusMeters?: number;
    routePolyline?: string;
    simplifiedCoordinates?: Array<{ latitude: number; longitude: number }>;
    baselineDistanceMeters?: number;
    baselineDurationSeconds?: number;
  }
): Promise<string> => {
  const createRideDirectlyInFirestore = async (): Promise<string> => {
    const generateSearchIndex = (pickup: Location, drop: Location, dName: string): string[] => {
      const tokens = new Set<string>();
      const addTokens = (text?: string) => {
        if (!text) return;
        const clean = text.toLowerCase().replace(/[^\w\s]/g, ' ');
        clean.split(/\s+/).forEach(t => { if (t.length >= 2) tokens.add(t); });
      };
      addTokens(pickup?.address); addTokens(pickup?.city); addTokens((pickup as any)?.locality);
      addTokens(drop?.address); addTokens(drop?.city); addTokens((drop as any)?.locality);
      addTokens(dName);
      if (pickup?.placeId) tokens.add(pickup.placeId.toLowerCase());
      if (drop?.placeId) tokens.add(drop.placeId.toLowerCase());
      return Array.from(tokens);
    };

    const firebaseRideData = {
      driverId,
      driverName,
      pickupLocation: rideData.pickupLocation,
      dropLocation: rideData.dropLocation,
      searchIndex: generateSearchIndex(rideData.pickupLocation, rideData.dropLocation, driverName),
      departureTime: rideData.departureTime,
      price: rideData.price || 0,
      availableSeats: rideData.availableSeats,
      totalSeats: rideData.totalSeats,
      carModel: rideData.carModel,
      fuelType: rideData.fuelType || 'Petrol',
      carColor: rideData.carColor || '',
      description: rideData.description || '',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      status: 'active',
      bookedSeats: [],
      detourRadiusMeters: rideData.detourRadiusMeters ?? 0,
      remainingDetourBudgetMeters: rideData.detourRadiusMeters ?? 0,
      routePolyline: rideData.routePolyline || '',
      simplifiedCoordinates: rideData.simplifiedCoordinates || [],
      baselineDistanceMeters: rideData.baselineDistanceMeters || 0,
      baselineDurationSeconds: rideData.baselineDurationSeconds || 0,
      currentDistanceMeters: rideData.baselineDistanceMeters || 0,
      currentDurationSeconds: rideData.baselineDurationSeconds || 0,
      acceptedWaypoints: [],
      routeVersion: 1,
      optimizationStatus: 'completed',
      lastOptimizedAt: new Date().toISOString(),
      optimizationSource: 'google',
    };

    console.warn('[RIDE SERVICE] Creating ride in Firestore with fuelType:', firebaseRideData.fuelType);
    const docRef = await addDoc(collection(db, 'rides'), firebaseRideData);

    try {
      if (rideData.carModel && driverId) {
        const userRef = doc(db, 'users', driverId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const existingSavedCars: Array<{ id: string; model: string; fuelType: 'Petrol' | 'Diesel' | 'EV' }> = Array.isArray(userData.savedCars) ? userData.savedCars : [];
          const fuel = rideData.fuelType || 'Petrol';
          const modelTrimmed = rideData.carModel.trim();
          
          const alreadySaved = existingSavedCars.some(c => c.model.toLowerCase() === modelTrimmed.toLowerCase() && c.fuelType === fuel);
          if (!alreadySaved) {
            const newCar = {
              id: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
              model: modelTrimmed,
              fuelType: fuel
            };
            await updateDoc(userRef, {
              savedCars: [...existingSavedCars, newCar],
              carModel: modelTrimmed,
              fuelType: fuel,
            });
          } else {
            await updateDoc(userRef, {
              carModel: modelTrimmed,
              fuelType: fuel,
            });
          }
        }
      }
    } catch (saveCarErr) {
      console.warn('[RIDE SERVICE] Failed to update user savedCars:', saveCarErr);
    }

    try {
      await initializeGroupChat(docRef.id, 'carpool', driverId, driverName);
    } catch (chatErr) {
      console.warn('[RIDE SERVICE] Failed to initialize group chat:', chatErr);
    }

    return docRef.id;
  };

  try {
    console.log('[RIDE SERVICE] Creating ride via backend for driver:', driverId);

    const response = await apiClient.post('/fare/create-ride', rideData);
    if (!response.data?.success || !response.data?.rideId) {
      throw new Error(response.data?.message || 'Failed to create ride');
    }

    console.log('[RIDE SERVICE] ✅ Ride created successfully with ID:', response.data.rideId);
    return response.data.rideId;
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
        route: data.route,
        pricing: data.pricing,
        searchIndex: data.searchIndex || [],
      });
    });

    const now = Date.now();
    const bookableRides = rides.filter((ride) =>
      ride.status === 'in_progress' || new Date(ride.departureTime).getTime() > now
    );

    // Sort client-side by departureTime ascending
    bookableRides.sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime());

    console.log('[RIDE SERVICE] Fetched', bookableRides.length, 'bookable active and in-progress rides');
    return bookableRides;
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
        route: data.route,
        pricing: data.pricing,
        searchIndex: data.searchIndex || [],
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
        route: data.route,
        pricing: data.pricing,
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
        route: data.route,
        pricing: data.pricing,
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
export const deleteExpiredRides = async (currentUserId?: string): Promise<number> => {
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
        if (
          departureDate.getTime() < sixHoursAgo.getTime() &&
          (!currentUserId || data.driverId === currentUserId)
        ) {
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
 * Auto-delete ongoing rides that have been in_progress for more than 5 hours.
 * Sends a push notification to the driver informing them that the ride was stopped.
 */
export const cleanupStaleInProgressRides = async (currentUserId?: string): Promise<number> => {
  try {
    console.log('[RIDE SERVICE] Checking for stale in-progress rides (>5 hrs)...');
    const now = new Date();
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000); // 5 hours

    const q = query(
      collection(db, 'rides'),
      where('status', '==', 'in_progress')
    );

    const querySnapshot = await getDocs(q);
    let count = 0;

    for (const docSnap of querySnapshot.docs) {
      try {
        const data = docSnap.data();
        if (currentUserId && data.driverId !== currentUserId) {
          continue;
        }

        const startTimeStr = data.startedAt || data.departureTime;
        if (!startTimeStr) continue;

        const startTime = new Date(startTimeStr);
        if (startTime.getTime() < fiveHoursAgo.getTime()) {
          const rideId = docSnap.id;
          const driverId = data.driverId;

          // Send notification to driver
          if (driverId) {
            await sendNotification(
              driverId,
              'ride_cancelled',
              'Ride Auto-Stopped ⚠️',
              'Your ride was automatically stopped as it exceeded 5 hours without reaching the destination.',
              rideId
            ).catch(err => console.warn('[RIDE SERVICE] Failed to notify driver of auto-stopped ride:', err));
          }

          // Delete stale ride document
          await deleteDoc(docSnap.ref);
          count++;
          console.log('[RIDE SERVICE] 🛑 Auto-deleted stale in-progress ride (>5h):', rideId);
        }
      } catch (err) {
        console.error('[RIDE SERVICE] Error cleaning up stale ride:', docSnap.id, err);
      }
    }

    return count;
  } catch (error: any) {
    console.error('[RIDE SERVICE] ❌ Failed to cleanup stale in-progress rides:', error);
    return 0;
  }
};

/**
 * Start a scheduled interval to automatically delete expired & stale rides
 * Runs every 5 minutes
 */
let rideCleanupInterval: any = null;

export const startRideCleanupScheduler = (currentUserId?: string): void => {
  if (rideCleanupInterval) {
    console.log('[RIDE SERVICE] Ride cleanup scheduler already running');
    return;
  }
  
  console.log('[RIDE SERVICE] Starting ride cleanup scheduler...');
  
  const runCleanups = () => {
    deleteExpiredRides(currentUserId).catch(err => console.error('[RIDE SERVICE] Expired cleanup failed:', err));
    cleanupStaleInProgressRides(currentUserId).catch(err => console.error('[RIDE SERVICE] Stale cleanup failed:', err));
  };

  // Run immediately on start
  runCleanups();
  
  // Then run every 5 minutes (300,000 ms)
  rideCleanupInterval = setInterval(runCleanups, 5 * 60 * 1000);
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
