import { ThemeProvider } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AppProvider, useAppContext } from '@/context/AppContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { WARM_CORE, WarmNavigationTheme } from '@/constants/theme';
import SplashScreen from '@/components/SplashScreen';

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
        // User is fully authenticated — redirect out of auth group to home
        console.log('[NAV GUARD] ✅ User can access main app, redirecting to home');
        router.replace('/(tabs)/home');
      } else if (!canAccessMainApp && !inAuthGroup) {
        // User shouldn't be in the main app — redirect to appropriate auth screen
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
      } else if (!canAccessMainApp && inAuthGroup && currentAuthScreen === 'license-upload') {
        // User is already on license-upload and still needs verification — do nothing.
        // This prevents the guard from interfering while the polling waits for admin approval.
        console.log('[NAV GUARD] ⏳ Already on license-upload, awaiting verification — no redirect');
      }
      // All other cases (in auth group correctly, or in main app with access) — do nothing.
    } catch (navError) {
      console.error('[ROOT LAYOUT] Navigation error:', navError);
    }
  }, [auth.isSignedIn, auth.user?.profileComplete, auth.user?.role, auth.user?.licenseVerified, auth.user?.licenseVerificationStatus, authInitializing, segments]);

  const [showSplash, setShowSplash] = React.useState(true);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={WarmNavigationTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="ride-details" options={{
            headerShown: false,
            presentation: 'card',
          }} />
          <Stack.Screen name="create-taxi-pool" options={{
            headerShown: false,
            presentation: 'card',
          }} />
          <Stack.Screen name="taxi-pool-details" options={{
            headerShown: false,
            presentation: 'card',
          }} />
          <Stack.Screen name="chat" options={{
            headerShown: false,
            presentation: 'card',
          }} />
          <Stack.Screen name="notifications" options={{
            headerShown: false,
            presentation: 'card',
          }} />
          <Stack.Screen name="car-owner-calculator" options={{
            headerShown: false,
            presentation: 'card',
          }} />
          <Stack.Screen name="driver-calculator" options={{
            headerShown: false,
            presentation: 'card',
          }} />
          <Stack.Screen name="booking-confirmation" options={{
            headerShown: false,
            presentation: 'card',
          }} />
          <Stack.Screen name="profile-edit" options={{
            headerShown: false,
            presentation: 'card',
          }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
        {showSplash && (
          <SplashScreen
            onFinish={() => setShowSplash(false)}
          />
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <GlobalErrorBoundary>
      <AppProvider>
        <RootLayoutContent />
      </AppProvider>
    </GlobalErrorBoundary>
  );
}
