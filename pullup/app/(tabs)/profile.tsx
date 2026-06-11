import { useAppContext } from '@/context/AppContext';
import { DriverStats, PassengerStats, UpcomingRide } from '@/types';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';

interface ProfileState {
  driverStats: DriverStats | null;
  passengerStats: PassengerStats | null;
  upcomingRidePassenger: UpcomingRide | null;
  upcomingRideDriver: UpcomingRide | null;
  isLoading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Skeleton shimmer card shown while profile is loading
// ---------------------------------------------------------------------------
function ProfileSkeleton() {
  const shimmer = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(slideIn, { toValue: 0, damping: 18, stiffness: 200, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const shimmerOp = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.25, 0.55, 0.25],
  });

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: slideIn }], flex: 1 }}>
      {/* ID Card Shimmer */}
      <Animated.View style={[styles.skeletonCard, { height: 168, borderRadius: 20, marginBottom: 20, opacity: shimmerOp }]} />
      {/* Action Row Shimmer */}
      <Animated.View style={[styles.skeletonCard, { height: 40, borderRadius: 10, marginBottom: 24, opacity: shimmerOp }]} />
      {/* Stats Grid Shimmer */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        <Animated.View style={[styles.skeletonCard, { flex: 1, height: 86, borderRadius: 16, opacity: shimmerOp }]} />
        <Animated.View style={[styles.skeletonCard, { flex: 1, height: 86, borderRadius: 16, opacity: shimmerOp }]} />
        <Animated.View style={[styles.skeletonCard, { flex: 1, height: 86, borderRadius: 16, opacity: shimmerOp }]} />
      </View>
      {/* Quick Settings Shimmer */}
      <View style={{ gap: 10 }}>
        <Animated.View style={[styles.skeletonCard, { height: 54, borderRadius: 16, opacity: shimmerOp }]} />
        <Animated.View style={[styles.skeletonCard, { height: 54, borderRadius: 16, opacity: shimmerOp }]} />
        <Animated.View style={[styles.skeletonCard, { height: 54, borderRadius: 16, opacity: shimmerOp }]} />
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Pressable card with spring scale + shadow lift on press
// ---------------------------------------------------------------------------
function PressableCard({ onPress, style, children, index = 0, delayOffset = 0 }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entrySlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const delay = index * 80 + delayOffset;
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(entryOpacity, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(entrySlide, {
          toValue: 0,
          damping: 20,
          stiffness: 180,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
  }, []);

  const onIn = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.975, damping: 14, stiffness: 260, mass: 0.6, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 2, damping: 14, stiffness: 260, mass: 0.6, useNativeDriver: true }),
    ]).start();
  };
  const onOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 180, mass: 1, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 180, mass: 1, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: entryOpacity,
          transform: [{ translateY: entrySlide }],
        },
      ]}
    >
      <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
        <Pressable onPressIn={onIn} onPressOut={onOut} onPress={onPress} style={{ width: '100%' }}>
          {children}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Animated press button (for general action buttons like Logout)
// ---------------------------------------------------------------------------
function AnimatedPressButton({ onPress, style, children, disabled }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn = () =>
    Animated.spring(scale, { toValue: 0.95, damping: 12, stiffness: 300, mass: 0.5, useNativeDriver: true }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, damping: 16, stiffness: 200, mass: 0.8, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }], width: '100%' }}>
      <TouchableOpacity
        style={style}
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={1}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Animated Counter to count up numbers from 0 on load/focus
// ---------------------------------------------------------------------------
function AnimatedCounter({ value, duration = 800, prefix = '' }: { value: number; duration?: number; prefix?: string }) {
  const [displayVal, setDisplayVal] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (end === 0) {
      setDisplayVal(0);
      return;
    }
    
    const range = end - start;
    let current = start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.max(Math.floor(duration / Math.abs(range)), 15);
    
    const timer = setInterval(() => {
      current += Math.ceil(range / (duration / stepTime));
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        setDisplayVal(end);
        clearInterval(timer);
      } else {
        setDisplayVal(current);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <Text>{prefix}{displayVal.toLocaleString()}</Text>;
}

// ---------------------------------------------------------------------------
// Pulsing Ring surrounding verified user avatar
// ---------------------------------------------------------------------------
function PulsingAvatarRing({ children, isVerified }: { children: React.ReactNode; isVerified: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!isVerified) return;
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulse, { toValue: 1.18, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulse, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, [isVerified]);

  if (!isVerified) return <>{children}</>;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 68,
          height: 68,
          borderRadius: 34,
          borderWidth: 2,
          borderColor: '#22C55E',
          opacity: opacity,
          transform: [{ scale: pulse }],
        }}
      />
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Custom sliding background role toggle
// ---------------------------------------------------------------------------
function SlidingRoleToggle({ isDriver, onToggle, isSwitching }: { isDriver: boolean; onToggle: () => void; isSwitching: boolean }) {
  const [width, setWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(isDriver ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isDriver ? 0 : 1,
      damping: 24,
      stiffness: 180,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [isDriver]);

  const targetRight = width > 0 ? width / 2 : 160;

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, targetRight],
  });

  return (
    <View 
      style={styles.roleToggleContainer}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View
          style={[
            styles.roleToggleHighlight,
            {
              width: width / 2 - 2,
              transform: [{ translateX }],
            },
          ]}
        />
      )}
      <TouchableOpacity
        style={styles.roleToggleButton}
        onPress={() => !isDriver && onToggle()}
        disabled={isSwitching}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name="steering"
          size={14}
          color={isDriver ? '#0F0F0F' : '#8A8A8A'}
        />
        <Text style={[styles.roleToggleText, isDriver && styles.roleToggleTextActive]}>
          Car Owner
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.roleToggleButton}
        onPress={() => isDriver && onToggle()}
        disabled={isSwitching}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name="briefcase"
          size={14}
          color={!isDriver ? '#0F0F0F' : '#8A8A8A'}
        />
        <Text style={[styles.roleToggleText, !isDriver && styles.roleToggleTextActive]}>
          Passenger
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Role switching animation with rotating loading ring and pulsing icon
// ---------------------------------------------------------------------------
function RoleSwitchingAnimation({ targetRole }: { targetRole: 'driver' | 'passenger' }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1500,
        easing: Easing.bezier(0.4, 0, 0.2, 1), // high-end professional swap acceleration
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.subtleSpinnerContainer}>
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <MaterialCommunityIcons name="swap-horizontal" size={76} color={WARM_CORE.primary} />
      </Animated.View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { auth, logout, getDriverStats, getPassengerStats, getUpcomingRide } = useAppContext();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState>({
    driverStats: null,
    passengerStats: null,
    upcomingRidePassenger: null,
    upcomingRideDriver: null,
    isLoading: true,
    error: null,
  });

  const [activeRole, setActiveRole] = useState<'driver' | 'passenger'>(auth.user?.role === 'driver' ? 'driver' : 'passenger');
  const [isWiping, setIsWiping] = useState(false);

  // Sync with auth.user.role if it changes from outside
  useEffect(() => {
    if (auth.user?.role) {
      setActiveRole(auth.user.role === 'driver' ? 'driver' : 'passenger');
    }
  }, [auth.user?.role]);

  const isDriver = activeRole === 'driver';

  // Entry animations values
  const profileCardAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const actionRowAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const mainContentAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(22) }).current;

  // Load profile data callback
  const loadProfileData = useCallback(async () => {
    if (!auth.user) return;
    
    setProfileState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const [passengerStats, driverStats, upcomingRidePassenger, upcomingRideDriver] = await Promise.all([
        getPassengerStats(auth.user.id),
        getDriverStats(auth.user.id),
        getUpcomingRide(auth.user.id, 'passenger'),
        getUpcomingRide(auth.user.id, 'driver'),
      ]);
      
      setProfileState(prev => ({
        ...prev,
        passengerStats,
        driverStats,
        upcomingRidePassenger,
        upcomingRideDriver,
        isLoading: false,
      }));
    } catch (error: any) {
      console.error('[PROFILE] Error loading data:', error);
      setProfileState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to load profile data',
      }));
    }
  }, [auth.user, getDriverStats, getPassengerStats, getUpcomingRide]);

  // Load data on mount and focus
  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [loadProfileData])
  );

  // Play entry reveal stagger once data loading is done
  useEffect(() => {
    if (!profileState.isLoading) {
      profileCardAnim.opacity.setValue(0);
      profileCardAnim.translateY.setValue(18);
      actionRowAnim.opacity.setValue(0);
      actionRowAnim.translateY.setValue(18);
      mainContentAnim.opacity.setValue(0);
      mainContentAnim.translateY.setValue(22);

      Animated.stagger(80, [
        Animated.parallel([
          Animated.timing(profileCardAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.spring(profileCardAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(actionRowAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.spring(actionRowAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(mainContentAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.spring(mainContentAnim.translateY, { toValue: 0, damping: 20, stiffness: 160, mass: 1, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [profileState.isLoading]);

  // Early return if not authenticated
  if (!auth.user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
        <View style={styles.container}>
          <ActivityIndicator size="large" color={WARM_CORE.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Full-screen overlay while role persistence api is switching in the background
  if (isSwitching) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
        <View style={styles.switchingContainer}>
          <RoleSwitchingAnimation targetRole={activeRole} />
          <Text style={styles.switchingTitle}>
            Switching to {activeRole === 'driver' ? 'Car Owner' : 'Passenger'}
          </Text>
          <Text style={styles.switchingSubtitle}>
            Configuring your customized experience...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Logout',
        onPress: async () => {
          setIsLoggingOut(true);
          try {
            await logout();
            router.replace('/auth/signup');
          } catch (error) {
            console.error('Logout error:', error);
            Alert.alert('Error', 'Failed to logout. Please try again.');
            setIsLoggingOut(false);
          }
        },
      },
    ]);
  };



  const handleWipeData = async () => {
    Alert.alert(
      'Wipe Test Data?',
      'This will delete all rides, bookings, taxi pools, requests, members, and chat rooms from the Firestore database. Users and profiles will remain intact. This action CANNOT be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Database',
          style: 'destructive',
          onPress: async () => {
            setIsWiping(true);
            try {
              const { wipeAllFirestoreCommutes } = require('@/utils/resetDbService');
              const res = await wipeAllFirestoreCommutes();
              Alert.alert('Success', `Database wiped successfully! Deleted ${res.count} documents.`);
            } catch (error: any) {
              Alert.alert('Wipe Failed', error.message || 'An error occurred while wiping database.');
            } finally {
              setIsWiping(false);
            }
          }
        }
      ]
    );
  };

  const handleRoleSwitch = () => {
    const newRole = isDriver ? 'passenger' : 'driver';
    setActiveRole(newRole);
  };

  const handleEditProfile = () => {
    router.push('/profile-edit');
  };

  const driverStats = profileState.driverStats;
  const passengerStats = profileState.passengerStats;
  const upcomingRide = isDriver ? profileState.upcomingRideDriver : profileState.upcomingRidePassenger;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Error Message */}
        {profileState.error && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle" size={16} color={WARM_CORE.error} />
            <Text style={styles.errorText}>{profileState.error}</Text>
          </View>
        )}

        {profileState.isLoading ? (
          <ProfileSkeleton />
        ) : (
          <>
            {/* DIGITAL ID CARD */}
            <Animated.View
              style={[
                styles.idCard,
                {
                  opacity: profileCardAnim.opacity,
                  transform: [{ translateY: profileCardAnim.translateY }],
                },
              ]}
            >
              <View style={styles.idCardGlow} />
              
              <View style={styles.idCardHeaderRow}>
                <PulsingAvatarRing isVerified={auth.user?.licenseVerified === true || auth.user?.licenseVerificationStatus === 'verified'}>
                  <View style={styles.avatar}>
                    {auth.user.profileImage ? (
                      <Image
                        source={{ uri: auth.user.profileImage }}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Text style={styles.avatarText}>
                        {auth.user.fullName.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                </PulsingAvatarRing>

                <View style={styles.userInfoContainer}>
                  <Text style={styles.fullName}>{auth.user.fullName}</Text>
                  <View style={styles.verifiedBadge}>
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={12}
                      color={WARM_CORE.success}
                    />
                    <Text style={styles.verifiedText}>Atlas Verified</Text>
                  </View>
                </View>
              </View>

              <View style={styles.academicTagRow}>
                <View style={styles.academicTag}>
                  <Text style={styles.academicTagLabel}>Course</Text>
                  <Text style={styles.academicTagValue}>{auth.user.course}</Text>
                </View>
                <View style={styles.academicTagDivider} />
                <View style={styles.academicTag}>
                  <Text style={styles.academicTagLabel}>Year</Text>
                  <Text style={styles.academicTagValue}>{auth.user.year}</Text>
                </View>
                <View style={styles.academicTagDivider} />
                <View style={styles.academicTag}>
                  <Text style={styles.academicTagLabel}>Division</Text>
                  <Text style={styles.academicTagValue}>{auth.user.division}</Text>
                </View>
              </View>
            </Animated.View>

            {/* ACTION ROW: Edit and Sliding Switcher */}
            <Animated.View
              style={[
                styles.actionRow,
                {
                  opacity: actionRowAnim.opacity,
                  transform: [{ translateY: actionRowAnim.translateY }],
                },
              ]}
            >

              <SlidingRoleToggle
                isDriver={isDriver}
                onToggle={handleRoleSwitch}
                isSwitching={isSwitching}
              />
            </Animated.View>

            {/* LICENSE VERIFICATION (Driver role only) */}
            {isDriver && (
              <Animated.View
                style={{
                  opacity: actionRowAnim.opacity,
                  transform: [{ translateY: actionRowAnim.translateY }],
                }}
              >
                {auth.user?.licenseVerificationStatus === 'pending' && (
                  <View style={[styles.licenseStatusBadge, styles.licensePending]}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={WARM_CORE.accent} />
                    <View style={styles.licenseStatusContent}>
                      <Text style={styles.licenseStatusTitle}>Pending Verification</Text>
                      <Text style={styles.licenseStatusText}>
                        Your license is under review. You can still book rides but cannot post rides yet.
                      </Text>
                    </View>
                  </View>
                )}
                {auth.user?.licenseVerificationStatus === 'verified' && (
                  <View style={[styles.licenseStatusBadge, styles.licenseVerified]}>
                    <MaterialCommunityIcons name="check-circle" size={16} color={WARM_CORE.success} />
                    <View style={styles.licenseStatusContent}>
                      <Text style={styles.licenseStatusTitle}>License Verified</Text>
                      <Text style={styles.licenseStatusText}>
                        You are all set! You can now post rides on PullUp!
                      </Text>
                    </View>
                  </View>
                )}
                {auth.user?.licenseVerificationStatus === 'rejected' && (
                  <View style={[styles.licenseStatusBadge, styles.licenseRejected]}>
                    <MaterialCommunityIcons name="alert-circle" size={16} color={WARM_CORE.error} />
                    <View style={styles.licenseStatusContent}>
                      <Text style={styles.licenseStatusTitle}>License Not Approved</Text>
                      <Text style={styles.licenseStatusText}>
                        Your license submission was declined. Please contact support for more information.
                      </Text>
                    </View>
                  </View>
                )}
                {(auth.user?.licenseVerificationStatus === null || auth.user?.licenseVerificationStatus === undefined) && (
                  <TouchableOpacity
                    style={[styles.licenseStatusBadge, styles.licensePending]}
                    onPress={() => router.push('/auth/license-upload')}
                  >
                    <MaterialCommunityIcons name="file-document-outline" size={18} color={WARM_CORE.accent} />
                    <View style={styles.licenseStatusContent}>
                      <Text style={styles.licenseStatusTitle}>Verification Required</Text>
                      <Text style={styles.licenseStatusText}>
                        Tap here to upload your driving license and start hosting rides.
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={WARM_CORE.accent} style={{ alignSelf: 'center' }} />
                  </TouchableOpacity>
                )}
              </Animated.View>
            )}

            {/* LICENSE VERIFICATION PROMPT CARD FOR PASSENGER */}
            {!isDriver && !(auth.user?.licenseVerified === true || auth.user?.licenseVerificationStatus === 'verified') && (
              <Animated.View
                style={{
                  opacity: actionRowAnim.opacity,
                  transform: [{ translateY: actionRowAnim.translateY }],
                }}
              >
                <TouchableOpacity
                  style={styles.licensePromoCard}
                  onPress={() => router.push('/auth/license-upload')}
                >
                  <View style={styles.licensePromoGradient} />
                  <View style={styles.licensePromoHeader}>
                    <MaterialCommunityIcons name="steering" size={24} color={WARM_CORE.primary} />
                    <Text style={styles.licensePromoTitle}>Share Your Empty Seats!</Text>
                  </View>
                  <Text style={styles.licensePromoText}>
                    {auth.user?.licenseVerificationStatus === 'pending'
                      ? 'Your license is under review. Once verified, you will be able to host car pools.'
                      : 'Verify your driving license to host car pools, share fuel costs, and earn rewards.'}
                  </Text>
                  <View style={styles.licensePromoButton}>
                    <Text style={styles.licensePromoButtonText}>
                      {auth.user?.licenseVerificationStatus === 'pending' ? 'Verification Pending' : 'Get Verified'}
                    </Text>
                    <MaterialCommunityIcons 
                      name={auth.user?.licenseVerificationStatus === 'pending' ? 'clock-outline' : 'arrow-right'} 
                      size={16} 
                      color={WARM_CORE.white} 
                    />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* MAIN CONTENT BLOCK */}
            <Animated.View
              style={[
                styles.mainContent,
                {
                  opacity: mainContentAnim.opacity,
                  transform: [{ translateY: mainContentAnim.translateY }],
                },
              ]}
            >
              {/* STATS SECTION */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>
                  {isDriver ? 'Car Owner Stats' : 'Passenger Stats'}
                </Text>
              </View>

              {isDriver ? (
                driverStats && driverStats.totalRides > 0 ? (
                  <View style={styles.statsGrid}>
                    <View style={styles.statMiniCard}>
                      <MaterialCommunityIcons name="steering" size={18} color={WARM_CORE.textSecondary} style={styles.statIcon} />
                      <Text style={styles.statLabel}>Rides Given</Text>
                      <Text style={styles.statValue}>
                        <AnimatedCounter value={driverStats.totalRides} />
                      </Text>
                    </View>
                    <View style={styles.statMiniCard}>
                      <MaterialCommunityIcons name="cash-multiple" size={18} color={WARM_CORE.success} style={styles.statIcon} />
                      <Text style={styles.statLabel}>Earnings</Text>
                      <Text style={[styles.statValue, { color: WARM_CORE.success }]}>
                        <AnimatedCounter value={driverStats.totalEarnings} prefix="₹" />
                      </Text>
                    </View>
                    <View style={styles.statMiniCard}>
                      <MaterialCommunityIcons name="account-group-outline" size={18} color={WARM_CORE.textSecondary} style={styles.statIcon} />
                      <Text style={styles.statLabel}>Passengers</Text>
                      <Text style={styles.statValue}>
                        <AnimatedCounter value={driverStats.passengersServed} />
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyStateContainer}>
                    <MaterialCommunityIcons name="car" size={32} color="#4B5563" />
                    <Text style={styles.emptyStateTitle}>No Rides Given Yet</Text>
                    <Text style={styles.emptyStateText}>
                      Start earning by posting your first ride on PullUp
                    </Text>
                  </View>
                )
              ) : (
                passengerStats && passengerStats.totalRides > 0 ? (
                  <View style={styles.statsGrid}>
                    <View style={styles.statMiniCard}>
                      <MaterialCommunityIcons name="car-multiple" size={18} color={WARM_CORE.textSecondary} style={styles.statIcon} />
                      <Text style={styles.statLabel}>Rides Taken</Text>
                      <Text style={styles.statValue}>
                        <AnimatedCounter value={passengerStats.totalRides} />
                      </Text>
                    </View>
                    <View style={styles.statMiniCard}>
                      <MaterialCommunityIcons name="wallet-outline" size={18} color={WARM_CORE.textSecondary} style={styles.statIcon} />
                      <Text style={styles.statLabel}>Money Spent</Text>
                      <Text style={styles.statValue}>
                        <AnimatedCounter value={passengerStats.totalSpent} prefix="₹" />
                      </Text>
                    </View>
                    <View style={styles.statMiniCard}>
                      <MaterialCommunityIcons name="piggy-bank-outline" size={18} color={WARM_CORE.success} style={styles.statIcon} />
                      <Text style={styles.statLabel}>Savings</Text>
                      <Text style={[styles.statValue, { color: WARM_CORE.success }]}>
                        <AnimatedCounter value={passengerStats.totalSavings} prefix="₹" />
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyStateContainer}>
                    <MaterialCommunityIcons name="bookmark-plus" size={32} color="#4B5563" />
                    <Text style={styles.emptyStateTitle}>No Bookings Yet</Text>
                    <Text style={styles.emptyStateText}>
                      Book rides and start saving on your daily commutes
                    </Text>
                  </View>
                )
              )}

              {/* UPCOMING RIDE */}
              {upcomingRide && (
                <View style={styles.activitySection}>
                  <Text style={styles.sectionTitle}>Upcoming Ride</Text>
                  <PressableCard
                    onPress={() => router.push('/(tabs)/my-bookings')}
                    style={styles.activityCard}
                  >
                    <View style={styles.activityCardContent}>
                      <View style={styles.activityIcon}>
                        <MaterialCommunityIcons
                          name="map-marker-check"
                          size={18}
                          color={WARM_CORE.success}
                        />
                      </View>
                      <View style={styles.activityContent}>
                        <Text style={styles.activityRoute} numberOfLines={1}>{upcomingRide.route}</Text>
                        <Text style={styles.activityTime}>{upcomingRide.time}</Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={WARM_CORE.textSecondary}
                      />
                    </View>
                  </PressableCard>
                </View>
              )}

              {/* QUICK ACTIONS MENU */}
              <View style={styles.menuSection}>
                <Text style={styles.sectionTitle}>Account & Settings</Text>
                
                <PressableCard
                  onPress={() => router.push('/(tabs)/ride-history')}
                  style={styles.menuItemCard}
                  index={1}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconBox, { backgroundColor: 'rgba(212, 80, 10, 0.08)' }]}>
                      <MaterialCommunityIcons name="history" size={20} color={WARM_CORE.primary} />
                    </View>
                    <Text style={styles.menuItemText}>Ride History</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={WARM_CORE.textSecondary} />
                  </View>
                </PressableCard>

                <PressableCard
                  onPress={() => router.push('/(tabs)/my-bookings')}
                  style={styles.menuItemCard}
                  index={2}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconBox, { backgroundColor: 'rgba(255, 122, 51, 0.1)' }]}>
                      <MaterialCommunityIcons name="car-back" size={20} color={WARM_CORE.accent} />
                    </View>
                    <Text style={styles.menuItemText}>My Bookings</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={WARM_CORE.textSecondary} />
                  </View>
                </PressableCard>

                <PressableCard
                  onPress={handleEditProfile}
                  style={styles.menuItemCard}
                  index={3}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconBox, { backgroundColor: 'rgba(163, 58, 8, 0.08)' }]}>
                      <MaterialCommunityIcons name="account-cog-outline" size={20} color={WARM_CORE.deepAccent} />
                    </View>
                    <Text style={styles.menuItemText}>Edit Credentials</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={WARM_CORE.textSecondary} />
                  </View>
                </PressableCard>

                <PressableCard
                  onPress={() => Alert.alert('Support', 'For support, please contact the campus coordinator at support@pullup.edu')}
                  style={styles.menuItemCard}
                  index={4}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconBox, { backgroundColor: 'rgba(110, 86, 80, 0.1)' }]}>
                      <MaterialCommunityIcons name="help-circle-outline" size={20} color={WARM_CORE.textSecondary} />
                    </View>
                    <Text style={styles.menuItemText}>Help & Support</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={WARM_CORE.textSecondary} />
                  </View>
                </PressableCard>

                <PressableCard
                  onPress={handleWipeData}
                  style={styles.menuItemCard}
                  index={5}
                  disabled={isWiping}
                >
                  <View style={styles.menuItemContent}>
                    <View style={[styles.menuItemIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}>
                      <MaterialCommunityIcons name="database-remove" size={20} color="#EF4444" />
                    </View>
                    <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Wipe Test Data</Text>
                    {isWiping ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#EF4444" />
                    )}
                  </View>
                </PressableCard>
              </View>

              {/* LOGOUT BUTTON */}
              <AnimatedPressButton
                style={styles.logoutButton}
                onPress={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator color="#EF4444" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="logout" size={18} color="#EF4444" />
                    <Text style={styles.logoutButtonText}>Logout</Text>
                  </>
                )}
              </AnimatedPressButton>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  } as ViewStyle,

  /* SKELETON LOADERS */
  skeletonCard: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,

  /* DIGITAL ID CARD */
  idCard: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 20,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 20,
  } as ViewStyle,
  idCardGlow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: WARM_CORE.primary,
    opacity: 0.08,
  } as ViewStyle,
  idCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  } as ViewStyle,
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: WARM_CORE.card,
    borderWidth: 2,
    borderColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  } as ViewStyle,
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  } as any,
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: WARM_CORE.primary,
  } as TextStyle,
  userInfoContainer: {
    justifyContent: 'center',
    flex: 1,
  } as ViewStyle,
  fullName: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 6,
    letterSpacing: -0.2,
  } as TextStyle,
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 6,
    alignSelf: 'flex-start',
  } as ViewStyle,
  verifiedText: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.success,
    letterSpacing: 0.1,
  } as TextStyle,

  /* ACADEMIC INFO */
  academicTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
  } as ViewStyle,
  academicTag: {
    flex: 1,
    alignItems: 'center',
  } as ViewStyle,
  academicTagLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  } as TextStyle,
  academicTagValue: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.primary,
  } as TextStyle,
  academicTagDivider: {
    width: 1,
    height: 22,
    backgroundColor: WARM_CORE.border,
  } as ViewStyle,

  /* ACTION ROW */
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 24,
  } as ViewStyle,
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    backgroundColor: WARM_CORE.card,
  } as ViewStyle,
  editButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.primary,
  } as TextStyle,

  /* ROLE SLIDER TOGGLE */
  roleToggleContainer: {
    flexDirection: 'row',
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 10,
    padding: 2,
    position: 'relative',
    width: '100%',
    height: 40,
    alignItems: 'center',
  } as ViewStyle,
  roleToggleHighlight: {
    position: 'absolute',
    left: 0,
    top: 2,
    height: 34,
    borderRadius: 8,
    backgroundColor: WARM_CORE.primary,
  } as ViewStyle,
  roleToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: '100%',
    zIndex: 1,
  } as ViewStyle,
  roleToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  roleToggleTextActive: {
    color: WARM_CORE.white,
  } as TextStyle,

  /* LICENSE STATUS BADGE */
  licenseVerificationSection: {
    marginBottom: 24,
  } as ViewStyle,
  licenseStatusBadge: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  } as ViewStyle,
  licensePending: {
    backgroundColor: 'rgba(212, 80, 10, 0.06)',
    borderColor: 'rgba(212, 80, 10, 0.25)',
  } as ViewStyle,
  licenseVerified: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  } as ViewStyle,
  licenseRejected: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  } as ViewStyle,
  licenseStatusContent: {
    flex: 1,
  } as ViewStyle,
  licenseStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 4,
  } as TextStyle,
  licenseStatusText: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    lineHeight: 18,
    fontWeight: '500',
  } as TextStyle,

  /* MAIN CONTENT BLOCK */
  mainContent: {
    gap: 12,
  } as ViewStyle,
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 6,
  } as ViewStyle,
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: WARM_CORE.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  } as TextStyle,

  /* STATS GRID */
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  } as ViewStyle,
  statMiniCard: {
    flex: 1,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  } as ViewStyle,
  statIcon: {
    marginBottom: 6,
  } as any,
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    marginBottom: 4,
    textAlign: 'center',
  } as TextStyle,
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: WARM_CORE.text,
    textAlign: 'center',
  } as TextStyle,
  emptyStateContainer: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  } as ViewStyle,
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginTop: 10,
    marginBottom: 4,
  } as TextStyle,
  emptyStateText: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  } as TextStyle,

  /* ACTIVITY SECTION (UPCOMING RIDE) */
  activitySection: {
    marginBottom: 20,
  } as ViewStyle,
  activityCard: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 16,
    overflow: 'hidden',
  } as ViewStyle,
  activityCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  } as ViewStyle,
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  activityContent: {
    flex: 1,
  } as ViewStyle,
  activityRoute: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  activityTime: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    marginTop: 3,
    fontWeight: '500',
  } as TextStyle,

  /* SETTINGS MENU */
  menuSection: {
    marginBottom: 20,
    gap: 10,
  } as ViewStyle,
  menuItemCard: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 16,
    overflow: 'hidden',
  } as ViewStyle,
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  } as ViewStyle,
  menuItemIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
    flex: 1,
  } as TextStyle,

  /* LOGOUT BUTTON */
  logoutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 40,
  } as ViewStyle,
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.error,
    letterSpacing: 0.2,
  } as TextStyle,

  /* ERROR */
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  } as ViewStyle,
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.error,
    flex: 1,
  } as TextStyle,

  /* SWITCHING OVERLAY */
  switchingContainer: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  } as ViewStyle,
  subtleSpinnerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    width: 120,
    marginBottom: 24,
  } as ViewStyle,
  switchingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.2,
  } as TextStyle,
  switchingSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 240,
  } as TextStyle,
  licensePromoCard: {
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  } as ViewStyle,
  licensePromoGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: WARM_CORE.primary,
  } as ViewStyle,
  licensePromoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  } as ViewStyle,
  licensePromoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: WARM_CORE.text,
    letterSpacing: -0.2,
  } as TextStyle,
  licensePromoText: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 12,
  } as TextStyle,
  licensePromoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: WARM_CORE.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  } as ViewStyle,
  licensePromoButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,
});
