import { calculateDistance, getRideDirectionType, ATLAS_LOCATION } from './atlasLocationUtils';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { completeRide } from './rideService';
import { sendNotification } from './notificationService';

export const GEOFENCE_RADIUS_METERS = {
  PICKUP: 200,      // 200m for passenger pickup geofence
  COMPLETION: 2000,  // 2km for ride completion geofence
};

export class GeofenceEngine {
  /**
   * Check and handle ride completion based on direction.
   * - For home-to-atlas: check distance to Atlas.
   * - For atlas-to-home: check distance to driver dropLocation.
   */
  static async checkAndTriggerCompletion(
    rideId: string,
    currentCoords: { latitude: number; longitude: number }
  ): Promise<{ shouldComplete: boolean; message: string }> {
    try {
      const rideRef = doc(db, 'rides', rideId);
      const rideSnap = await getDoc(rideRef);
      if (!rideSnap.exists()) {
        return { shouldComplete: false, message: 'Ride not found' };
      }

      const ride = rideSnap.data();
      if (ride.status !== 'in_progress') {
        return { shouldComplete: false, message: `Ride status is ${ride.status}, not in_progress` };
      }

      const direction = getRideDirectionType(
        ride.pickupLocation.latitude,
        ride.pickupLocation.longitude,
        ride.dropLocation.latitude,
        ride.dropLocation.longitude
      );

      let distanceToDestination = 0;
      let destName = '';

      if (direction === 'home-to-atlas') {
        distanceToDestination = calculateDistance(
          currentCoords.latitude,
          currentCoords.longitude,
          ATLAS_LOCATION.latitude,
          ATLAS_LOCATION.longitude
        );
        destName = 'Atlas SkillTech University';
      } else if (direction === 'atlas-to-home') {
        distanceToDestination = calculateDistance(
          currentCoords.latitude,
          currentCoords.longitude,
          ride.dropLocation.latitude,
          ride.dropLocation.longitude
        );
        destName = ride.dropLocation.address || 'Driver Destination';
      } else {
        return { shouldComplete: false, message: 'Invalid or unsupported ride direction for geofencing' };
      }

      const completionThresholdKM = GEOFENCE_RADIUS_METERS.COMPLETION / 1000; // 2km

      console.log(`[GEOFENCE ENGINE] Distance to destination (${destName}): ${distanceToDestination.toFixed(2)} km`);

      if (distanceToDestination <= completionThresholdKM) {
        console.log(`[GEOFENCE ENGINE] Triggering auto-completion for ride ${rideId}`);
        
        // Call completeRide service which updates state on backend and credits wallets
        await completeRide(rideId);

        // Broadcast notifications to passengers on completion
        try {
          const bookingsQ = query(
            collection(db, 'bookings'),
            where('rideId', '==', rideId),
            where('status', '==', 'accepted')
          );
          const bookingsSnap = await getDocs(bookingsQ);
          const passengerIds = bookingsSnap.docs.map(docSnap => docSnap.data().passengerId);

          for (const passengerId of passengerIds) {
            await sendNotification(
              passengerId,
              'ride_completed',
              'Ride Completed!',
              `Your ride with ${ride.driverName} has completed successfully. Thank you for using PullUp!`,
              rideId
            );
          }
        } catch (notifyErr) {
          console.warn('[GEOFENCE ENGINE] Failed to notify passengers on completion:', notifyErr);
        }

        return {
          shouldComplete: true,
          message: `Arrived at ${destName}. Ride completed successfully!`,
        };
      }

      return {
        shouldComplete: false,
        message: `Still ${distanceToDestination.toFixed(2)} km away from ${destName}.`,
      };
    } catch (error: any) {
      console.error('[GEOFENCE ENGINE] Error in checkAndTriggerCompletion:', error);
      throw error;
    }
  }

  /**
   * Check and notify passengers when driver is nearby their pickup location (200m).
   */
  static async checkAndNotifyNearbyPickups(
    rideId: string,
    currentCoords: { latitude: number; longitude: number }
  ): Promise<void> {
    try {
      // Find accepted bookings for this ride that are not yet picked up
      const bookingsQ = query(
        collection(db, 'bookings'),
        where('rideId', '==', rideId),
        where('status', '==', 'accepted')
      );
      const bookingsSnap = await getDocs(bookingsQ);

      for (const bookingDoc of bookingsSnap.docs) {
        const booking = bookingDoc.data();
        const bookingId = bookingDoc.id;

        // Skip if already picked up or notified
        if (booking.pickedUp || booking.notifiedNearby) continue;

        const pickupLoc = booking.passengerPickupLocation;
        if (!pickupLoc) continue;

        const distanceToPickup = calculateDistance(
          currentCoords.latitude,
          currentCoords.longitude,
          pickupLoc.latitude,
          pickupLoc.longitude
        );

        const nearbyThresholdKM = GEOFENCE_RADIUS_METERS.PICKUP / 1000; // 0.2 km = 200m

        if (distanceToPickup <= nearbyThresholdKM) {
          console.log(`[GEOFENCE ENGINE] Driver is nearby pickup for booking ${bookingId} (${distanceToPickup.toFixed(3)} km)`);

          // Update booking document in Firestore to prevent double notifications
          const bookingRef = doc(db, 'bookings', bookingId);
          await updateDoc(bookingRef, { notifiedNearby: true });

          // Send notification to passenger
          await sendNotification(
            booking.passengerId,
            'booking_accepted',
            'Driver is nearby!',
            `Your driver is within 200m of your pickup location. Please be ready.`,
            rideId,
            bookingId
          );
        }
      }
    } catch (error) {
      console.error('[GEOFENCE ENGINE] Error in checkAndNotifyNearbyPickups:', error);
    }
  }
}
