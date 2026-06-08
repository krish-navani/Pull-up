import { useAppContext } from '@/context/AppContext';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function RootIndex() {
  const { auth, authInitializing } = useAppContext();
  
  // While initializing, show a loading indicator
  if (authInitializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F0F0F' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }
  
  // Use the same logic as the navigation guard in _layout.tsx
  const isSignedIn = auth.isSignedIn;
  const isProfileComplete = auth.user?.profileComplete ?? false;
  const isDriver = auth.user?.role === 'driver';
  const isLicenseVerified = auth.user?.licenseVerified === true || auth.user?.licenseVerificationStatus === 'verified';
  const isLicensePendingOrVerified = isLicenseVerified || auth.user?.licenseVerificationStatus === 'pending';
  const needsLicenseVerification = isDriver && !isLicensePendingOrVerified;
  const canAccessMainApp = isSignedIn && isProfileComplete && !needsLicenseVerification;
  
  // If fully authenticated, go to home
  if (canAccessMainApp) {
    return <Redirect href="/(tabs)/home" />;
  }
  
  // If authenticated driver needs license verification, go to license-upload
  if (isSignedIn && isProfileComplete && needsLicenseVerification) {
    return <Redirect href="/auth/license-upload" />;
  }
  
  // If not authenticated, go to signup
  return <Redirect href="/auth/signup" />;
}
