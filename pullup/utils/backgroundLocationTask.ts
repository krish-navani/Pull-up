/**
 * backgroundLocationTask.ts
 *
 * Defines the TaskManager background location task for PullUp.
 *
 * CRITICAL: This file MUST be imported at the very top of index.js (the Expo
 * entry point) so that the OS can wake and execute the task when the app is
 * backgrounded or the phone is locked.
 *
 * Architecture:
 *   iOS/Android OS → TaskManager wakes JS thread → reads rideId from AsyncStorage
 *                  → fetch() → Vercel /update-location → Firebase Admin → Firestore
 *
 * The Firebase JS SDK cannot be used here because background tasks run in a
 * stripped JS context without a DOM/browser runtime.
 */

import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OTP_BACKEND_URL } from '@/config/environment';
import { auth } from '@/utils/firebase';

export const BACKGROUND_LOCATION_TASK = 'pullup-background-location';

// Keys used to share state between the UI and the background task
export const BG_TASK_RIDE_ID_KEY      = 'pullup_bg_active_ride_id';
export const BG_TASK_LAST_UPDATE_KEY  = 'pullup_bg_last_location_update';

/**
 * Shared config for startLocationUpdatesAsync — used by navigation.tsx and
 * the fail-safe recovery in _layout.tsx so intervals are always consistent.
 * Intervals: 10 seconds OR 20 metres (whichever comes first).
 */
export const BG_LOCATION_CONFIG = {
  timeInterval: 10000,   // 10 seconds — balanced for college commute distances
  distanceInterval: 20,  // 20 metres
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false as const,
  foregroundService: {
    notificationTitle: 'PullUp \u2014 Live tracking active',
    notificationBody: 'Sharing your ride location with passengers',
    notificationColor: '#D4500A',   // WARM_CORE.primary (can't import theme here)
    killServiceOnDestroy: false,
  },
};

/**
 * Define the background task.
 * Called every time the OS delivers a location update while the app is backgrounded.
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[BG TASK] Error received from OS:', error.message);
    return;
  }

  if (!data) {
    console.warn('[BG TASK] No data received from OS');
    return;
  }

  const { locations } = data as { locations: Array<{ coords: { latitude: number; longitude: number; heading: number | null; speed: number | null; accuracy: number | null } }> };

  if (!locations || locations.length === 0) {
    return;
  }

  // Use the most recent location from the batch
  const loc = locations[locations.length - 1];
  const { latitude, longitude, heading, speed, accuracy } = loc.coords;

  // Read the active rideId that was stored when tracking started
  let rideId: string | null = null;
  try {
    rideId = await AsyncStorage.getItem(BG_TASK_RIDE_ID_KEY);
  } catch (storageErr) {
    console.error('[BG TASK] Failed to read rideId from AsyncStorage:', storageErr);
    return;
  }

  if (!rideId) {
    console.warn('[BG TASK] No active rideId found — stopping background updates');
    return;
  }

  const backendUrl = OTP_BACKEND_URL;

  if (!backendUrl) {
    console.error('[BG TASK] Missing EXPO_PUBLIC_OTP_BACKEND_URL env var');
    return;
  }

  const firebaseUser = auth.currentUser;
  if (!firebaseUser || firebaseUser.isAnonymous) {
    console.warn('[BG TASK] No authenticated Firebase user available for background location update');
    return;
  }

  try {
    const idToken = await firebaseUser.getIdToken();
    const response = await fetch(`${backendUrl}/api/otp/update-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        rideId,
        latitude,
        longitude,
        heading: heading ?? 0,
        speed: speed ?? 0,
        accuracy: accuracy ?? null,
      }),
    });

    const now = new Date().toISOString();

    if (response.ok) {
      // Store timestamp of last successful write so the UI can compute signal strength
      await AsyncStorage.setItem(BG_TASK_LAST_UPDATE_KEY, now);
      console.log(`[BG TASK] ✅ Location updated for ride ${rideId}: ${latitude.toFixed(5)},${longitude.toFixed(5)}`);
    } else {
      const body = await response.text().catch(() => '');
      console.warn(`[BG TASK] ⚠️ Backend returned ${response.status}: ${body}`);
    }
  } catch (fetchErr: any) {
    console.error('[BG TASK] fetch() failed:', fetchErr.message);
  }
});
