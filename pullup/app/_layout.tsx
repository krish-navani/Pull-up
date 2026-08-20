import { ThemeProvider } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AppProvider, useAppContext } from '@/context/AppContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { WARM_CORE, WarmNavigationTheme } from '@/constants/theme';
import SplashScreen from '@/components/SplashScreen';
import {
  BACKGROUND_LOCATION_TASK,
  BG_TASK_RIDE_ID_KEY,
  BG_LOCATION_CONFIG,
} from '@/utils/backgroundLocationTask';

import Constants from 'expo-constants';

// FCM messaging — loaded lazily so we degrade gracefully in Expo Go
let messaging: any = null;
try {
  const isExpoGo = Constants.appOwnership === 'expo' || (Constants as any).executionEnvironment === 'storeClient';
  if (Platform.OS !== 'web' && !isExpoGo) {
    messaging = require('@react-native-firebase/messaging').default;
  }
} catch (e) {
  console.warn('[FCM] @react-native-firebase/messaging not available in _layout (Expo Go).');
}

// Global Error Boundary to prevent app crashes in production
class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[GLOBAL ERROR BOUNDARY] Caught error:', error);
    console.error('[GLOBAL ERROR BOUNDARY] Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: WARM_CORE.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: WARM_CORE.primary, fontSize: 48, marginBottom: 16 }}>⚠️</Text>
          <Text style={{ color: WARM_CORE.text, fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ color: WARM_CORE.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            The app encountered an unexpected error.{"\n"}Please try again.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: WARM_CORE.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: WARM_CORE.white, fontSize: 15, fontWeight: '700' }}>Reload App</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const { auth, authInitializing } = useAppContext();
  const segments = useSegments();
  const router = useRouter();

  // Handle FCM notification taps for deep-linking (background + cold-boot)
  useEffect(() => {
    const handleNotificationRouting = (data: any) => {
      try {
        const { targetScreen, targetId, rideId, rideType, type } = data;
        const resolvedRideId = rideId || targetId;

        console.log('[FCM DEEP LINK] Handling notification route. Screen:', targetScreen, 'Id:', resolvedRideId, 'Type:', type);

        let resolvedScreen = targetScreen;
        if (!resolvedScreen && type) {
          if (['chat_message', 'message', 'sos', 'SOS', 'group_message', 'group-message'].includes(type)) {
            resolvedScreen = 'group-chat';
          } else if (['booking_request', 'booking_accepted', 'booking_rejected', 'ride_started', 'ride_completed', 'ride_cancelled', 'payment_confirmed', 'payment_required', 'payment-required', 'booking_expired', 'waitlist_joined', 'waitlist_promoted', 'waitlist_expired', 'cancellation'].includes(type)) {
            resolvedScreen = 'ride-details';
          } else if (['pool_request', 'pool_accepted', 'pool_rejected', 'pool_joined', 'pool_full'].includes(type)) {
            resolvedScreen = 'taxi-pool-details';
          } else if (['withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_completed'].includes(type)) {
            resolvedScreen = 'wallet';
          } else if (type === 'marketing') {
            resolvedScreen = 'notifications';
          } else if (['driver_arrived', 'passenger_confirmed_pickup', 'ride_started', 'live_tracking', 'live-tracking', 'location_update'].includes(type)) {
            // Live tracking events — open the navigation screen directly
            resolvedScreen = 'navigation';
          }
        }

        if (!resolvedScreen && resolvedRideId) {
          resolvedScreen = rideType === 'taxipool' ? 'taxi-pool-details' : 'ride-details';
        }

        if (resolvedScreen === 'group-chat') {
          router.push({ pathname: '/group-chat', params: { rideId: resolvedRideId, rideType: rideType || 'carpool' } } as any);
        } else if (resolvedScreen === 'navigation') {
          // Live tracking — open the navigation screen directly
          router.push({ pathname: '/navigation', params: { rideId: resolvedRideId } } as any);
        } else if (resolvedScreen === 'ride-details') {
          router.push({ pathname: '/ride-details', params: { rideId: resolvedRideId } } as any);
        } else if (resolvedScreen === 'taxi-pool-details') {
          router.push({ pathname: '/taxi-pool-details', params: { poolId: resolvedRideId } } as any);
        } else if (resolvedScreen === 'wallet') {
          router.push('/wallet' as any);
        } else if (resolvedScreen === 'notifications') {
          router.push('/notifications' as any);
        } else if (resolvedScreen === 'my-bookings' || resolvedScreen === 'bookings') {
          router.push({ pathname: '/(tabs)/my-bookings', params: { bookingId: targetId || '' } } as any);
        }
      } catch (err) {
        console.error('[FCM DEEP LINK] Error in handleNotificationRouting:', err);
      }
    };

    let unsubBackground: (() => void) | null = null;
    if (messaging) {
      // Cold-boot: app opened by tapping a notification while killed
      messaging().getInitialNotification().then((remoteMessage: any) => {
        if (remoteMessage?.data) {
          console.log('[FCM DEEP LINK] Cold-boot notification tapped:', remoteMessage.data);
          handleNotificationRouting(remoteMessage.data);
        }
      }).catch((err: any) => {
        console.error('[FCM DEEP LINK] getInitialNotification error:', err);
      });

      // Background: app was in background and brought to foreground by tap
      unsubBackground = messaging().onNotificationOpenedApp((remoteMessage: any) => {
        if (remoteMessage?.data) {
          console.log('[FCM DEEP LINK] Background notification tapped:', remoteMessage.data);
          handleNotificationRouting(remoteMessage.data);
        }
      });
    }

    Notifications.requestPermissionsAsync().catch(() => {});
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'PullUp alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#D4500A',
        sound: 'default',
        showBadge: true,
      }).catch(() => {});
    }

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const data = response?.notification?.request?.content?.data;
        if (data) {
          console.log('[EXPO DEEP LINK] Cold/background notification tapped:', data);
          handleNotificationRouting(data);
        }
      })
      .catch((err) => console.error('[EXPO DEEP LINK] getLastNotificationResponseAsync error:', err));

    const expoResponseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data) {
        console.log('[EXPO DEEP LINK] Notification response received:', data);
        handleNotificationRouting(data);
      }
    });

    return () => {
      if (unsubBackground) unsubBackground();
      expoResponseSub.remove();
    };
  }, [router]);

  // Request location permission on app launch
  useEffect(() => {
    const requestLocationPermission = async () => {
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch (error) {
        // Silently handle location permission errors
        console.warn('[ROOT LAYOUT] Location permission request failed:', error);
      }
    };

    requestLocationPermission();
  }, []);

  // ─── Fail-safe background tracking recovery ──────────────────────────────────
  // Scenario: driver had an active ride, phone restarted / app was killed by Android.
  // On next app open this checks AsyncStorage for a saved rideId and restarts the
  // background task if it is no longer running — the driver never has to do anything.
  useEffect(() => {
    if (authInitializing) return; // wait until auth is settled
    if (!auth.isSignedIn) return; // only relevant for signed-in drivers

    const recoverTracking = async () => {
      try {
        const savedRideId = await AsyncStorage.getItem(BG_TASK_RIDE_ID_KEY);
        if (!savedRideId) return; // no active ride was stored — nothing to recover

        const isAlreadyRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
        if (isAlreadyRunning) {
          console.log('[RECOVERY] Background task already running for ride:', savedRideId);
          return;
        }

        console.log('[RECOVERY] ⚠️ Detected orphaned ride tracking for:', savedRideId, '— attempting recovery');

        // We need background permission to restart the task
        const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();

        if (fgStatus !== 'granted' || bgStatus !== 'granted') {
          console.warn('[RECOVERY] Cannot recover — location permissions not granted');
          // Clean up stale rideId so we don't attempt recovery again
          await AsyncStorage.removeItem(BG_TASK_RIDE_ID_KEY);
          return;
        }

        // Stop any half-registered stale task first
        const taskExists = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
        if (taskExists) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
        }

        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          ...BG_LOCATION_CONFIG,
        });

        console.log('[RECOVERY] ✅ Background tracking resumed for ride:', savedRideId);
      } catch (err) {
        console.error('[RECOVERY] Failed to recover background tracking:', err);
      }
    };

    // Small delay so the app finishes rendering before attempting recovery
    const t = setTimeout(recoverTracking, 2000);
    return () => clearTimeout(t);
  }, [authInitializing, auth.isSignedIn]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (authInitializing) return;

    try {
      const segs = segments as string[];
      const inAuthGroup = segs[0] === 'auth';
      const currentAuthScreen = segs[1]; // e.g., 'license-upload', 'signup'

      // Determine if user has full access to the main app
      const isSignedIn = auth.isSignedIn;
      const isProfileComplete = auth.user?.profileComplete ?? false;
      const isDriver = auth.user?.role === 'driver';
      const isLicenseVerified = auth.user?.licenseVerified === true || auth.user?.licenseVerificationStatus === 'verified';
      
      // A driver needs license verification to host rides.
      // However, they can explore other app features if their license status is pending or verified.
      const isLicensePendingOrVerified = isLicenseVerified || auth.user?.licenseVerificationStatus === 'pending';
      const needsLicenseVerification = isDriver && !isLicensePendingOrVerified;
      const canAccessMainApp = isSignedIn && isProfileComplete && !needsLicenseVerification;

      console.log('[NAV GUARD]', {
        segments: segments.join('/'),
        inAuthGroup,
        isSignedIn,
        isProfileComplete,
        isDriver,
        isLicenseVerified,
        needsLicenseVerification,
        canAccessMainApp,
      });

      if (canAccessMainApp && inAuthGroup) {
        if (currentAuthScreen === 'license-upload') {
          if (isLicenseVerified) {
            console.log('[NAV GUARD] ✅ License is verified, redirecting to home');
            router.replace('/(tabs)/home');
          } else {
            console.log('[NAV GUARD] ⏳ On license-upload and not yet verified — letting user stay');
          }
        } else {
          console.log('[NAV GUARD] ✅ User can access main app, redirecting to home');
          router.replace('/(tabs)/home');
        }
      } else if (!canAccessMainApp && !inAuthGroup) {
        if (isSignedIn && isProfileComplete && needsLicenseVerification) {
          console.log('[NAV GUARD] 🔒 Driver needs license verification, redirecting to license-upload');
          router.replace('/auth/license-upload');
        } else if (isSignedIn && !isProfileComplete) {
          console.log('[NAV GUARD] 📝 Profile incomplete, redirecting to signup');
          router.replace('/auth/signup');
        } else {
          console.log('[NAV GUARD] 🔐 Not authenticated, redirecting to signup');
          router.replace('/auth/signup');
        }
      }
    } catch (navError) {
      console.error('[ROOT LAYOUT] Navigation error:', navError);
    }
  }, [auth.isSignedIn, auth.user?.profileComplete, auth.user?.role, auth.user?.licenseVerified, auth.user?.licenseVerificationStatus, authInitializing, segments]);

  const [showSplash, setShowSplash] = React.useState(!globalHasColdLaunched);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={WarmNavigationTheme}>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="ride-details" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="navigation" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="create-taxi-pool" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="taxi-pool-details" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="chat" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="group-chat" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="notifications" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="car-owner-calculator" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="driver-calculator" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="booking-confirmation" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="profile-edit" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="wallet" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="driver-subscription" options={{ headerShown: false, presentation: 'card' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
        {showSplash && (
          <SplashScreen
            onFinish={() => {
              globalHasColdLaunched = true;
              setShowSplash(false);
            }}
          />
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

let globalHasColdLaunched = false;

export default function RootLayout() {
  return (
    <GlobalErrorBoundary>
      <AppProvider>
        <RootLayoutContent />
      </AppProvider>
    </GlobalErrorBoundary>
  );
}
