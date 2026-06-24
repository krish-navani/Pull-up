import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';
import { Booking, Ride, User } from '../types';
import { auth, db } from './firebase';
import { signInAnonymously } from 'firebase/auth';

/**
 * Get profile statistics for a driver
 */
export const getDriverStats = async (driverId: string) => {
  try {
    console.log('[PROFILE] Fetching driver stats for:', driverId);

    // Get all rides by this driver
    const ridesQuery = query(
      collection(db, 'rides'),
      where('driverId', '==', driverId)
    );
    const ridesSnapshot = await getDocs(ridesQuery);
    const rides = ridesSnapshot.docs.map(doc => doc.data() as Ride);

    // Calculate stats
    const totalRides = rides.length;
    const completedRides = rides.filter(r => r.status === 'completed').length;
    const totalEarnings = rides.reduce((sum, ride) => {
      const bookedCount = ride.bookedSeats?.length || 0;
      return sum + (ride.price * bookedCount);
    }, 0);

    // Get unique passengers served
    const passengersServed = new Set<string>();
    rides.forEach(ride => {
      ride.bookedSeats?.forEach(booking => {
        if (booking.status === 'accepted') {
          passengersServed.add(booking.passengerId);
        }
      });
    });

    // Calculate trust metrics based on received booking requests
    let totalBookingsReceived = 0;
    let acceptedBookings = 0;
    let respondedBookings = 0;

    rides.forEach(ride => {
      if (ride.bookedSeats) {
        ride.bookedSeats.forEach(booking => {
          totalBookingsReceived++;
          if (booking.status === 'accepted' || booking.status === 'confirmed') {
            acceptedBookings++;
            respondedBookings++;
          } else if (booking.status === 'rejected') {
            respondedBookings++;
          } else if (booking.status === 'cancelled') {
            // Cancelled by passenger: doesn't hurt the driver's response rate, count as responded
            respondedBookings++;
          }
        });
      }
    });

    const stats = {
      totalRides,
      completedRides,
      totalEarnings: Math.round(totalEarnings),
      passengersServed: passengersServed.size,
      averageRating: 4.8, // TODO: Implement rating system
      acceptanceRate: totalBookingsReceived > 0 ? Math.round((acceptedBookings / totalBookingsReceived) * 100) : 100,
      responseRate: totalBookingsReceived > 0 ? Math.round((respondedBookings / totalBookingsReceived) * 100) : 100,
    };

    console.log('[PROFILE] ✅ Driver stats:', stats);
    return stats;
  } catch (error) {
    console.error('[PROFILE] ❌ Failed to get driver stats:', error);
    throw error;
  }
};

/**
 * Get profile statistics for a passenger
 */
export const getPassengerStats = async (passengerId: string) => {
  try {
    console.log('[PROFILE] Fetching passenger stats for:', passengerId);

    // Get all bookings by this passenger
    const bookingsQuery = query(
      collection(db, 'bookings'),
      where('passengerId', '==', passengerId)
    );
    const bookingsSnapshot = await getDocs(bookingsQuery);
    const bookings = bookingsSnapshot.docs.map(doc => doc.data() as Booking);

    // Calculate stats
    const acceptedBookings = bookings.filter(b => b.status === 'accepted');
    const totalRides = acceptedBookings.length;

    // Get total spent and savings
    let totalSpent = 0;
    let totalSavings = 0;
    let completedRides = 0;

    // Get ride documents for pricing
    for (const booking of bookings) {
      if (booking.status === 'accepted') {
        const rideDoc = await getDoc(doc(db, 'rides', booking.rideId));
        if (rideDoc.exists()) {
          const rideData = rideDoc.data() as Ride;
          const cost = rideData.price * (booking.seatsBooked || 1);
          totalSpent += cost;
          // Estimate savings: assume individual travel would cost 2x
          totalSavings += cost * 0.5; // 50% savings from sharing

          if (rideData.status === 'completed') {
            completedRides++;
          }
        }
      }
    }

    const totalBookingsRequested = bookings.length;
    const acceptedOrConfirmedBookings = bookings.filter(b => b.status === 'accepted' || b.status === 'confirmed').length;

    const stats = {
      totalRides,
      completedRides,
      totalSpent: Math.round(totalSpent),
      totalSavings: Math.round(totalSavings),
      averageRating: 4.9, // TODO: Implement rating system
      cancelledRides: bookings.filter(b => b.status === 'cancelled').length,
      acceptanceRate: totalBookingsRequested > 0 ? Math.round((acceptedOrConfirmedBookings / totalBookingsRequested) * 100) : 100,
      responseRate: totalBookingsRequested > 0
        ? Math.round(((totalBookingsRequested - bookings.filter(b => b.status === 'cancelled').length) / totalBookingsRequested) * 100)
        : 100,
    };

    console.log('[PROFILE] ✅ Passenger stats:', stats);
    return stats;
  } catch (error) {
    console.error('[PROFILE] ❌ Failed to get passenger stats:', error);
    throw error;
  }
};

/**
 * Get upcoming ride for user (next ride by departure time)
 */
export const getUpcomingRide = async (userId: string, role: 'driver' | 'passenger') => {
  try {
    console.log('[PROFILE] Fetching upcoming ride for:', userId, role);

    const now = new Date();

    if (role === 'driver') {
      // Get driver's upcoming rides
      const ridesQuery = query(
        collection(db, 'rides'),
        where('driverId', '==', userId)
      );
      const ridesSnapshot = await getDocs(ridesQuery);
      const rides = ridesSnapshot.docs
        .map(doc => doc.data() as Ride)
        .filter(ride => {
          const departureTime = new Date(ride.departureTime);
          return departureTime > now && ride.status !== 'cancelled';
        })
        .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime());

      if (rides.length > 0) {
        const nextRide = rides[0];
        return {
          type: 'driver' as const,
          rideId: nextRide.id,
          route: `${nextRide.pickupLocation.address} → ${nextRide.dropLocation.address}`,
          time: formatTime(new Date(nextRide.departureTime)),
          departureTime: nextRide.departureTime,
          price: nextRide.price,
          seatsAvailable: nextRide.availableSeats,
        };
      }
    } else {
      // Get passenger's upcoming bookings/rides
      const bookingsQuery = query(
        collection(db, 'bookings'),
        where('passengerId', '==', userId),
        where('status', '==', 'accepted')
      );
      const bookingsSnapshot = await getDocs(bookingsQuery);

      if (bookingsSnapshot.docs.length > 0) {
        const bookings = bookingsSnapshot.docs.map(doc => doc.data() as Booking);

        // Get the ride details for each booking and find the upcoming one
        for (const booking of bookings) {
          const rideDoc = await getDoc(doc(db, 'rides', booking.rideId));
          if (rideDoc.exists()) {
            const ride = rideDoc.data() as Ride;
            const departureTime = new Date(ride.departureTime);
            if (departureTime > now) {
              return {
                type: 'passenger' as const,
                rideId: ride.id,
                driverName: ride.driverName,
                route: `${ride.pickupLocation.address} → ${ride.dropLocation.address}`,
                time: formatTime(departureTime),
                departureTime: ride.departureTime,
                price: ride.price * (booking.seatsBooked || 1),
              };
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[PROFILE] ❌ Failed to get upcoming ride:', error);
    return null;
  }
};

/**
 * Ensure user data from Firestore has safe defaults for critical fields.
 * This prevents navigation guard mismatches when fields are undefined.
 */
const ensureUserDefaults = (firestoreData: Record<string, any>): User => {
  const isStatusVerified = firestoreData?.licenseVerificationStatus === 'verified';
  return {
    ...firestoreData,
    profileComplete: firestoreData?.profileComplete ?? true,
    licenseVerified: firestoreData?.licenseVerified === true || isStatusVerified,
    licenseVerificationStatus: firestoreData?.licenseVerificationStatus ?? undefined,
    role: firestoreData?.role ?? 'passenger',
    notificationPreferences: firestoreData?.notificationPreferences ?? {
      rideUpdates: true,
      paymentUpdates: true,
      chatUpdates: true,
      poolUpdates: true,
      marketingUpdates: false,
    },
    mutedChats: firestoreData?.mutedChats ?? {},
  } as User;
};

/**
 * Ensures a valid Firebase Auth session is active before performing Firestore write/update operations.
 * If auth.currentUser is null, it re-establishes an anonymous session.
 */
const ensureAuthSession = async () => {
  if (!auth.currentUser) {
    console.log('[PROFILE] No active Firebase Auth session. Signing in anonymously...');
    const credential = await signInAnonymously(auth);
    console.log('[PROFILE] ✅ Anonymous session established:', credential.user.uid);
  }
};

/**
 * Update user profile
 */
export const updateUserProfile = async (
  userId: string,
  updates: Partial<User>
) => {
  try {
    console.log('[PROFILE] Updating user profile:', userId);
    await ensureAuthSession();

    const userRef = doc(db, 'users', userId);
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(userRef, updateData, { merge: true });
    console.log('[PROFILE] ✅ Profile updated/created successfully');

    // Return updated user with safe defaults
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return ensureUserDefaults(userDoc.data());
    }
    throw new Error('Failed to fetch updated user data');
  } catch (error) {
    console.error('[PROFILE] ❌ Failed to update profile:', error);
    throw error;
  }
};

/**
 * Get ride history for driver or passenger
 */
export const getRideHistory = async (
  userId: string,
  role: 'driver' | 'passenger',
  limit: number = 10
) => {
  try {
    console.log('[PROFILE] Fetching ride history for:', userId, role);

    if (role === 'driver') {
      const ridesQuery = query(
        collection(db, 'rides'),
        where('driverId', '==', userId)
      );
      const ridesSnapshot = await getDocs(ridesQuery);
      const rides = ridesSnapshot.docs
        .map(doc => doc.data() as Ride)
        .sort((a, b) => new Date(b.departureTime).getTime() - new Date(a.departureTime).getTime())
        .slice(0, limit);

      return rides.map(ride => ({
        id: ride.id,
        pickupLocation: ride.pickupLocation.address,
        dropLocation: ride.dropLocation.address,
        departureTime: ride.departureTime,
        status: ride.status,
        price: ride.price,
        passengersCount: ride.bookedSeats?.length || 0,
      }));
    } else {
      const bookingsQuery = query(
        collection(db, 'bookings'),
        where('passengerId', '==', userId)
      );
      const bookingsSnapshot = await getDocs(bookingsQuery);
      const rawBookings = bookingsSnapshot.docs.map(doc => doc.data() as Booking);

      // Deduplicate bookings: keep only the most relevant booking per rideId
      const groups: { [rideId: string]: Booking[] } = {};
      for (const b of rawBookings) {
        if (!groups[b.rideId]) {
          groups[b.rideId] = [];
        }
        groups[b.rideId].push(b);
      }

      const uniqueBookings: Booking[] = [];
      for (const rideId in groups) {
        const rideBookings = groups[rideId];
        if (rideBookings.length === 1) {
          uniqueBookings.push(rideBookings[0]);
        } else {
          const active = rideBookings.find(b => b.status === 'pending' || b.status === 'accepted');
          if (active) {
            uniqueBookings.push(active);
          } else {
            rideBookings.sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime());
            uniqueBookings.push(rideBookings[0]);
          }
        }
      }

      const history = [];
      for (const booking of uniqueBookings) {
        const rideDoc = await getDoc(doc(db, 'rides', booking.rideId));
        if (rideDoc.exists()) {
          const ride = rideDoc.data() as Ride;
          history.push({
            id: ride.id,
            pickupLocation: ride.pickupLocation.address,
            dropLocation: ride.dropLocation.address,
            departureTime: ride.departureTime,
            status: booking.status,
            price: ride.price * (booking.seatsBooked || 1),
            driverName: ride.driverName,
          });
        }
      }

      return history
        .sort((a, b) => new Date(b.departureTime).getTime() - new Date(a.departureTime).getTime())
        .slice(0, limit);
    }
  } catch (error) {
    console.error('[PROFILE] ❌ Failed to get ride history:', error);
    throw error;
  }
};

/**
 * Get vehicle information for driver
 */
export const getVehicleInfo = async (driverId: string) => {
  try {
    console.log('[PROFILE] Fetching vehicle info for driver:', driverId);

    const userDoc = await getDoc(doc(db, 'users', driverId));
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const userData = userDoc.data() as User;
    
    // TODO: Implement proper vehicle data storage
    // For now, return default vehicle info
    return {
      seats: 4,
      carModel: 'Vehicle',
      licensePlate: userData.phone || 'N/A',
      verified: userData.licenseVerified || false,
    };
  } catch (error) {
    console.error('[PROFILE] ❌ Failed to get vehicle info:', error);
    throw error;
  }
};

/**
 * Helper function to format time
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Switch user role and persist to database
 */
export const switchUserRole = async (userId: string, newRole: 'driver' | 'passenger') => {
  try {
    console.log('[PROFILE] 📍 Switching role for user:', userId, 'to:', newRole);
    await ensureAuthSession();
    console.log('[PROFILE] 📍 User ID type:', typeof userId, 'Value:', userId);

    const userRef = doc(db, 'users', userId);
    console.log('[PROFILE] 📍 User ref path:', userRef.path);

    const updateData: Record<string, any> = {
      role: newRole,
      updatedAt: new Date().toISOString(),
    };

    // When switching to driver, ensure license fields are set.
    // Reset to unverified state if the license hasn't been verified yet.
    // This handles passengers (licenseVerified=false) as well as truly new drivers (undefined).
    const existingDoc = await getDoc(userRef);
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      if (newRole === 'driver') {
        const isVerified = existingData.licenseVerified === true || existingData.licenseVerificationStatus === 'verified';
        if (!isVerified) {
          // Not yet verified — explicitly reset so the nav guard has definitive values
          console.log('[PROFILE] 📍 Switching to driver (unverified) - resetting license fields');
          updateData.licenseVerified = false;
          updateData.licenseVerificationStatus = existingData.licenseVerificationStatus ?? null;
        } else {
          console.log('[PROFILE] 📍 Switching to driver (already verified) - keeping verified status');
        }
      }
    } else {
      // Document does not exist in database (e.g. wiped) - initialize it with defaults from AsyncStorage local user
      console.log('[PROFILE] 📍 User document does not exist in Firestore. Initializing with defaults.');
      updateData.licenseVerified = false;
      updateData.licenseVerificationStatus = null;
      updateData.profileComplete = true;
      updateData.createdAt = new Date().toISOString();
      
      try {
        const storedStr = await AsyncStorage.getItem('pullup_user_data');
        if (storedStr) {
          const storedUser = JSON.parse(storedStr);
          updateData.email = storedUser.email;
          updateData.fullName = storedUser.fullName;
          updateData.phone = storedUser.phone || '';
          updateData.year = storedUser.year;
          updateData.course = storedUser.course;
          updateData.division = storedUser.division;
          updateData.profileImage = storedUser.profileImage || null;
        }
      } catch (storageError) {
        console.error('[PROFILE] Failed to load user from AsyncStorage for recovery:', storageError);
      }
    }
    
    console.log('[PROFILE] 📍 Attempting to update/create with data:', updateData);
    
    await setDoc(userRef, updateData, { merge: true });

    console.log('[PROFILE] ✅ Role switched successfully');

    // Return updated user with safe defaults
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const updatedUser = ensureUserDefaults(userDoc.data());
      
      // Also persist to AsyncStorage for offline access and faster reloads
      try {
        await AsyncStorage.setItem('pullup_user_data', JSON.stringify(updatedUser));
        await AsyncStorage.setItem('pullup_user_role', newRole);
        console.log('[PROFILE] ✅ Role persisted to local storage');
      } catch (storageError) {
        console.error('[PROFILE] ⚠️ Failed to persist role to local storage:', storageError);
        // Don't throw - Firestore update succeeded, local cache failure is non-blocking
      }
      
      return updatedUser;
    }
    throw new Error('Failed to fetch updated user data');
  } catch (error) {
    console.error('[PROFILE] ❌ Failed to switch role:', error);
    throw error;
  }
};
