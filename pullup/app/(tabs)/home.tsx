import { useAppContext } from '@/context/AppContext';
import { formatTime } from '@/utils/mockData';
import { getTimeBasedGreeting } from '@/utils/stringUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle
} from 'react-native';

import { calculateDistance, formatDistance, getCurrentLocation } from '@/utils/locationUtils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Skeleton shimmer row shown while rides are loading
// ---------------------------------------------------------------------------
function RideSkeletonRow() {
  const shimmer = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);
  const shimmerStyle = {
    opacity: shimmer.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.35, 0.7, 0.35] }),
  };
  return (
    <View style={{ flexDirection: 'row', gap: 16, marginHorizontal: -24, paddingHorizontal: 24, marginBottom: 24 }}>
      {[0, 1].map(i => (
        <Animated.View key={i} style={[{ width: 300, height: 200, backgroundColor: WARM_CORE.card, borderRadius: 20, borderWidth: 0.5, borderColor: WARM_CORE.border }, shimmerStyle]} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pressable ride card with spring scale on press
// ---------------------------------------------------------------------------
function PressableRideCard({ onPress, children }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const shadowOpacity = useRef(new Animated.Value(0.25)).current;
  const onIn = () => {
    Animated.spring(scale, { toValue: 0.965, damping: 14, stiffness: 260, mass: 0.6, useNativeDriver: true }).start();
    Animated.timing(shadowOpacity, { toValue: 0.1, duration: 120, useNativeDriver: true }).start();
  };
  const onOut = () => {
    Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 180, mass: 1, useNativeDriver: true }).start();
    Animated.timing(shadowOpacity, { toValue: 0.25, duration: 200, useNativeDriver: true }).start();
  };
  return (
    <Animated.View style={[styles.rideCardWrapper, { transform: [{ scale }] }]}>
      <View style={styles.rideCard}>
        <Pressable onPressIn={onIn} onPressOut={onOut} onPress={onPress} style={{ flex: 1 }}>
          {children}
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
export default function HomeScreen() {
  const router = useRouter();
  const { rides, auth, notifications, loadAllAvailableRides, authInitializing } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [rideDistances, setRideDistances] = useState<Record<string, number>>({});
  const [isLoadingRides, setIsLoadingRides] = useState(false);

  // ── Entry animations ─────────────────────────────────────────────────────
  // All three groups start invisible and slide up together as a clean stagger
  const headerRowAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const searchAnim    = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const contentAnim   = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(22) }).current;

  // Notification badge pulse
  const notifPulse = useRef(new Animated.Value(1)).current;
  // Notification bell press
  const notifScale = useRef(new Animated.Value(1)).current;

  // Savings calculator breathing CTA
  const calcBreath = useRef(new Animated.Value(1)).current;
  // Savings button press
  const calcScale = useRef(new Animated.Value(1)).current;

  // View all button press
  const viewAllScale = useRef(new Animated.Value(1)).current;

  // Empty state icon
  const emptyIconScale = useRef(new Animated.Value(0)).current;
  const emptyIconFloat = useRef(new Animated.Value(0)).current;

  // Load user location once on mount (no auth required)
  useEffect(() => {
    console.log('[HOME] Component mounted, initializing...');
    getCurrentLocation()
      .then(location => {
        if (location) {
          setUserLocation(location);
          console.log('[HOME] Location loaded:', location);
        }
      })
      .catch(error => console.error('[HOME] Failed to get location:', error));

    // ── Cinematic 3-stage stagger (Uber/Rapido style) ────────────────────
    // Stage 1: Entire header row (avatar + text + bell) as ONE unit
    // Stage 2: Search bar
    // Stage 3: ALL content below (section header, cards/skeleton, empty, savings calc)
    // Nothing is visible until its stage starts.
    Animated.stagger(90, [
      Animated.parallel([
        Animated.timing(headerRowAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(headerRowAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(searchAnim.opacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(searchAnim.translateY, { toValue: 0, damping: 18, stiffness: 180, mass: 1, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(contentAnim.translateY, { toValue: 0, damping: 20, stiffness: 160, mass: 1, useNativeDriver: true }),
      ]),
    ]).start();

    // Savings calculator subtle breathing
    Animated.loop(Animated.sequence([
      Animated.timing(calcBreath, { toValue: 1.018, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(calcBreath, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();

    // Empty state float
    Animated.loop(Animated.sequence([
      Animated.timing(emptyIconFloat, { toValue: -6, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(emptyIconFloat, { toValue: 6, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

  // Load rides only once auth is confirmed (requires signed-in user for Firestore)
  useEffect(() => {
    if (authInitializing || !auth.user) return; // wait until auth is settled

    const loadRides = async () => {
      try {
        console.log('[HOME] Loading rides...');
        setIsLoadingRides(true);
        await loadAllAvailableRides();
        console.log('[HOME] Rides loaded successfully');
      } catch (error) {
        console.error('[HOME] Failed to load rides:', error);
      } finally {
        setIsLoadingRides(false);
      }
    };

    loadRides();
  }, [authInitializing, auth.user, loadAllAvailableRides]);

  // Notification badge pulse effect
  useEffect(() => {
    const unread = notifications.filter(n => !n.read).length;
    if (unread > 0) {
      Animated.loop(Animated.sequence([
        Animated.timing(notifPulse, { toValue: 1.3, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(notifPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
    } else {
      notifPulse.setValue(1);
    }
  }, [notifications]);

  // Empty state icon spring reveal
  useEffect(() => {
    if (!Array.isArray(rides)) return;
    const nearby = rides.filter(ride => ride.status === 'active');
    if (!isLoadingRides && nearby.length === 0) {
      Animated.spring(emptyIconScale, { toValue: 1, damping: 8, stiffness: 130, mass: 0.7, useNativeDriver: true }).start();
    } else {
      emptyIconScale.setValue(0);
    }
  }, [isLoadingRides, rides]);

  // Spring press handlers
  const onNotifPressIn = () => Animated.spring(notifScale, { toValue: 0.88, damping: 12, stiffness: 300, mass: 0.6, useNativeDriver: true }).start();
  const onNotifPressOut = () => Animated.spring(notifScale, { toValue: 1, damping: 16, stiffness: 200, mass: 0.9, useNativeDriver: true }).start();
  const onCalcPressIn = () => Animated.spring(calcScale, { toValue: 0.97, damping: 12, stiffness: 280, mass: 0.6, useNativeDriver: true }).start();
  const onCalcPressOut = () => Animated.spring(calcScale, { toValue: 1, damping: 18, stiffness: 180, mass: 1, useNativeDriver: true }).start();
  const onViewAllPressIn = () => Animated.spring(viewAllScale, { toValue: 0.92, damping: 10, stiffness: 300, mass: 0.5, useNativeDriver: true }).start();
  const onViewAllPressOut = () => Animated.spring(viewAllScale, { toValue: 1, damping: 16, stiffness: 200, mass: 0.8, useNativeDriver: true }).start();

  // Refresh rides when screen is focused — only when authenticated
  useFocusEffect(
    useCallback(() => {
      if (authInitializing || !auth.user) return;
      const refreshRides = async () => {
        try {
          await loadAllAvailableRides();
        } catch (error) {
          console.error('[HOME] Failed to refresh rides:', error);
        }
      };
      refreshRides();
    }, [authInitializing, auth.user, loadAllAvailableRides])
  );

  // Calculate distances for all rides when userLocation or rides change
  useEffect(() => {
    const safeRides = rides ?? [];
    if (userLocation && safeRides.length > 0) {
      const distances: Record<string, number> = {};
      safeRides.forEach(ride => {
        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          ride.pickupLocation.latitude,
          ride.pickupLocation.longitude
        );
        distances[ride.id] = distance;
      });
      setRideDistances(distances);
    }
  }, [userLocation, rides]);

  // Filter and sort rides by distance — guard for undefined rides
  const sortedAndFilteredRides = (rides ?? []).filter(ride =>
    ride.status === 'active' &&
    (searchQuery === '' ||
      ride.pickupLocation.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ride.dropLocation.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ride.driverName.toLowerCase().includes(searchQuery.toLowerCase()))
  ).sort((a, b) => {
    const distA = rideDistances[a.id] ?? Infinity;
    const distB = rideDistances[b.id] ?? Infinity;
    return distA - distB;
  });

  // Nearby rides = within 10km (or all if no user location yet)
  const nearbyRides = sortedAndFilteredRides.filter(ride => {
    const dist = rideDistances[ride.id];
    if (dist === undefined) return true; // show if distance not calculated yet
    return dist <= 10;
  });

  console.log('[HOME] Render state - Total rides:', rides.length, 'Nearby rides:', nearbyRides.length);

  const unreadNotifications = notifications.filter(n => !n.read).length;

  const handleRidePress = (rideId: string) => {
    console.log('[HOME] Ride pressed, navigating to ride-details:', rideId);
    router.push({ pathname: '/ride-details', params: { rideId } } as any);
  };

  const handleViewAll = () => {
    router.push('/all-rides' as any);
  };

  const handleSavingsCalculator = () => {
    router.push('/car-owner-calculator');
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadAllAvailableRides();
    } catch (error) {
      console.error('[HOME] Failed to refresh rides:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={WARM_CORE.primary}
            colors={[WARM_CORE.primary]}
            progressBackgroundColor={WARM_CORE.card}
          />
        }
      >
        {/* Error Banner */}
        {auth.error && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={WARM_CORE.error} />
            <Text style={styles.errorBannerText}>{auth.error}</Text>
          </View>
        )}

        {/* Header Section — entire row animates as ONE unit */}
        <Animated.View style={[
          styles.headerSection,
          { opacity: headerRowAnim.opacity, transform: [{ translateY: headerRowAnim.translateY }] },
        ]}>
          <View style={styles.headerRow}>

            {/* LEFT: Avatar + Welcome Text side by side */}
            <View style={styles.headerLeft}>
              <View style={styles.headerAvatarContainer}>
                <View style={styles.avatar}>
                  {auth.user?.profileImage ? (
                    <Image source={{ uri: auth.user.profileImage }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarText}>
                      {(auth.user?.fullName || 'U').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.headerTextContainer}>
                <Text style={styles.welcomeText}>WELCOME BACK</Text>
                <View style={styles.greetingRow}>
                  <Text style={styles.greetingText} numberOfLines={1}>
                    {getTimeBasedGreeting(auth.user?.fullName?.split(' ')[0] || 'Student')}
                  </Text>
                </View>
              </View>
            </View>

            {/* RIGHT: Notification bell */}
            <Animated.View style={{ transform: [{ scale: notifScale }] }}>
              <Pressable
                style={styles.notificationButton}
                onPressIn={onNotifPressIn}
                onPressOut={onNotifPressOut}
                onPress={() => router.push('/notifications')}
              >
                <MaterialCommunityIcons name="bell" size={22} color={WARM_CORE.text} />
                {unreadNotifications > 0 && (
                  <Animated.View style={[styles.notificationDot, { transform: [{ scale: notifPulse }] }]} />
                )}
              </Pressable>
            </Animated.View>

          </View>
        </Animated.View>

        {/* Search Bar */}
        <Animated.View style={{ opacity: searchAnim.opacity, transform: [{ translateY: searchAnim.translateY }] }}>
          <View style={styles.searchSection}>
            <View style={[styles.searchContainer, searchFocused && styles.searchContainerFocused]}>
              <MaterialCommunityIcons
                name="magnify"
                size={22}
                color={searchFocused ? WARM_CORE.primary : WARM_CORE.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Tell us your route"
                placeholderTextColor="#8D807B"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={WARM_CORE.textSecondary} />
                </Pressable>
              )}
              {searchQuery.length === 0 && (
                <MaterialCommunityIcons
                  name="map-marker"
                  size={20}
                  color={searchFocused ? WARM_CORE.primary : WARM_CORE.textSecondary}
                  style={styles.micIcon}
                />
              )}
            </View>
          </View>
        </Animated.View>

        {/* ALL content below search wrapped in contentAnim — nothing visible until stage 3 */}
        <Animated.View style={{ opacity: contentAnim.opacity, transform: [{ translateY: contentAnim.translateY }] }}>

          {/* Nearby Rides Section Header */}
          <View style={styles.nearbyRidesHeader}>
            <Text style={styles.nearbyRidesTitle}>
              {searchQuery ? 'Search Results' : `Nearby Rides${!isLoadingRides ? ` (${nearbyRides.length})` : ''}`}
            </Text>
            <Animated.View style={{ transform: [{ scale: viewAllScale }] }}>
              <Pressable
                style={styles.viewAllButton}
                onPressIn={onViewAllPressIn}
                onPressOut={onViewAllPressOut}
                onPress={handleViewAll}
              >
                <Text style={styles.viewAllText}>View All</Text>
              </Pressable>
            </Animated.View>
          </View>

          {/* Loading State — skeleton shimmer */}
          {isLoadingRides && <RideSkeletonRow />}

          {/* Rides Horizontal Scroll */}
          {!isLoadingRides && nearbyRides.length > 0 ? (
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContent}
                style={styles.horizontalScroll}
              >
              {nearbyRides.map(ride => (
                <PressableRideCard key={ride.id} onPress={() => handleRidePress(ride.id)}>

                    {/* Main Content with Route Lines */}
                    <View style={styles.rideCardContent}>
                      <View style={styles.contentWithRoute}>
                        {/* Route Indicator Lines */}
                        <View style={styles.routeIndicator}>
                          <View style={styles.routeLineDot} />
                          <View style={styles.routeLineConnector} />
                          <View style={[styles.routeLineDot, { backgroundColor: WARM_CORE.textSecondary, borderColor: WARM_CORE.textSecondary }]} />
                        </View>

                        {/* Location Content */}
                        <View style={styles.locationsContainer}>
                          {/* Pickup Section */}
                          <View style={styles.locationSection}>
                            <Text style={styles.pickupBadge}>PICKUP</Text>
                            <Text style={styles.locationMainText} numberOfLines={1}>
                              {ride.pickupLocation.address}
                            </Text>
                          </View>

                          {/* Dropoff Section */}
                          <View style={styles.locationSection}>
                            <Text style={styles.dropoffBadge}>DROP-OFF</Text>
                            <Text style={styles.locationMainText} numberOfLines={1}>
                              {ride.dropLocation.address}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Footer Info */}
                      <View style={styles.footerInfo}>
                        <View style={styles.driverInfo}>
                          <View style={styles.driverAvatar}>
                            <Text style={styles.driverInitial}>
                              {ride.driverName.charAt(0)}
                            </Text>
                          </View>
                          <View style={styles.carAndTime}>
                            <View style={styles.carRow}>
                              <Text style={styles.carModelText} numberOfLines={1} ellipsizeMode="tail">
                                {ride.carModel}
                              </Text>
                            </View>
                            <View style={styles.timeSeatRow}>
                              <Text style={styles.footerTimeText}>{formatTime(ride.departureTime)}</Text>
                              <Text style={styles.dotSeparator}> • </Text>
                              <Text style={styles.seatsInfoText}>{ride.availableSeats} Seats</Text>
                              {rideDistances[ride.id] !== undefined && (
                                <>
                                  <Text style={styles.dotSeparator}> • </Text>
                                  <Text style={styles.distanceText}>{formatDistance(rideDistances[ride.id])}</Text>
                                </>
                              )}
                            </View>
                          </View>
                        </View>
                        {/* Price Badge */}
                        <View style={styles.priceBadge}>
                          <Text style={styles.badgePriceText}>₹{ride.price}</Text>
                          <Text style={styles.badgePriceLabel}>Per Seat</Text>
                        </View>
                      </View>
                    </View>
                  </PressableRideCard>
              ))}
              </ScrollView>
            </View>
          ) : (
            !isLoadingRides && (
              <View style={styles.emptyState}>
                <Animated.View style={{ transform: [{ scale: emptyIconScale }, { translateY: emptyIconFloat }] }}>
                  <MaterialCommunityIcons name="car-off" size={64} color={WARM_CORE.textSecondary} />
                </Animated.View>
                <Text style={styles.emptyStateText}>No rides nearby</Text>
                <Text style={styles.emptyStateSubText}>Try searching for other locations</Text>
              </View>
            )
          )}

          {/* Quick Actions Section */}
          <View style={styles.quickActionsSection}>
            <Animated.View style={{ transform: [{ scale: calcBreath }] }}>
              <Animated.View style={{ transform: [{ scale: calcScale }] }}>
                <Pressable
                  style={styles.savingsCalcButton}
                  onPressIn={onCalcPressIn}
                  onPressOut={onCalcPressOut}
                  onPress={handleSavingsCalculator}
                >
                  <View style={styles.savingsCalcLeft}>
                    <MaterialCommunityIcons name="calculator-variant" size={24} color={WARM_CORE.primary} />
                    <View style={styles.savingsCalcText}>
                      <Text style={styles.savingsCalcTitle}>Savings Calculator</Text>
                      <Text style={styles.savingsCalcSubtitle}>See your savings</Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={24} color={WARM_CORE.textSecondary} />
                </Pressable>
              </Animated.View>
            </Animated.View>
          </View>

        </Animated.View>
      </ScrollView>
      <StatusBar barStyle="dark-content" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: WARM_CORE.card,
    borderWidth: 2,
    borderColor: WARM_CORE.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: WARM_CORE.primary,
  },
  safeArea: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  container: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
  } as ViewStyle,
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE8E8',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  } as ViewStyle,
  errorBannerText: {
    color: WARM_CORE.error,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 10,
    flex: 1,
  } as TextStyle,
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  } as ViewStyle,
  notificationButton: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WARM_CORE.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  notificationDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WARM_CORE.primary,
    borderWidth: 1.5,
    borderColor: WARM_CORE.card,
  } as ViewStyle,
  searchSection: {
    marginBottom: 28,
  } as ViewStyle,
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    backgroundColor: WARM_CORE.card,
    borderRadius: 28,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  searchContainerFocused: {
    borderColor: WARM_CORE.primary,
    backgroundColor: WARM_CORE.card,
  } as ViewStyle,
  searchIcon: {
    marginRight: 12,
  } as any,
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: WARM_CORE.text,
    padding: 0,
  } as TextStyle,
  micIcon: {
    marginLeft: 12,
  } as any,
  actionPillsContainer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: WARM_CORE.card,
  } as ViewStyle,
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    backgroundColor: WARM_CORE.background,
    borderRadius: 22,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  } as ViewStyle,
  pillIcon: {} as ViewStyle,
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  } as TextStyle,
  nearbyRidesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  } as ViewStyle,
  nearbyRidesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  viewAllButton: {
    backgroundColor: WARM_CORE.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 24,
  } as ViewStyle,
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,
  horizontalScroll: {
    marginHorizontal: -24,
  } as ViewStyle,
  horizontalScrollContent: {
    paddingHorizontal: 24,
    gap: 16,
  } as ViewStyle,
  rideCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    minWidth: 340,
    maxWidth: 340,
    minHeight: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
  },
  rideCardWrapper: {
    marginBottom: 20,
    borderRadius: 20,
    backgroundColor: WARM_CORE.card,
    elevation: 6,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
    overflow: 'hidden',
  },
  priceBadge: {
    alignItems: 'center',
    zIndex: 10,
  } as ViewStyle,
  badgePriceText: {
    fontSize: 24,
    fontWeight: '800',
    color: WARM_CORE.text,
  } as TextStyle,
  badgePriceLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginTop: 1,
  } as TextStyle,
  rideCardContent: {
    padding: 16,
    paddingTop: 20,
    flex: 1,
    justifyContent: 'space-between',
  } as ViewStyle,
  contentWithRoute: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
  },
  routeIndicator: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  } as ViewStyle,
  routeLineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WARM_CORE.primary,
    borderWidth: 2,
    borderColor: WARM_CORE.primary,
  } as ViewStyle,
  routeLineConnector: {
    width: 2.5,
    height: 56,
    backgroundColor: WARM_CORE.border,
  } as ViewStyle,
  locationsContainer: {
    flex: 1,
  } as ViewStyle,
  locationSection: {
    marginBottom: 38,
  } as ViewStyle,
  pickupBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.primary,
    letterSpacing: 0.6,
    marginBottom: 5,
  } as TextStyle,
  dropoffBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 5,
  } as TextStyle,
  locationMainText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
    lineHeight: 19,
  } as TextStyle,
  footerInfo: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
    justifyContent: 'space-between',
    flexDirection: 'row',
  } as ViewStyle,
  carAndTime: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
  } as ViewStyle,
  rideCardTop: {
    flexDirection: 'row',
    padding: 18,
    paddingBottom: 14,
  } as ViewStyle,
  routeSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  } as ViewStyle,
  locationDetailsContainer: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 14,
  } as ViewStyle,
  locationTimeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  } as ViewStyle,
  timeLocation: {
    flex: 1,
  } as ViewStyle,
  locationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 3,
  } as TextStyle,
  locationNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  timeValue: {
    fontSize: 16,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginTop: 6,
  } as TextStyle,
  timeValueSecondary: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginTop: 6,
  } as TextStyle,
  routeLine: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  } as ViewStyle,
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WARM_CORE.primary,
  } as ViewStyle,
  routeConnector: {
    width: 2,
    height: 32,
    backgroundColor: WARM_CORE.border,
  } as ViewStyle,
  rideInfo: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: 14,
    marginLeft: 12,
  } as ViewStyle,
  priceContainer: {
    alignItems: 'flex-end',
  } as ViewStyle,
  priceText: {
    fontSize: 22,
    fontWeight: '800',
    color: WARM_CORE.text,
  } as TextStyle,
  perSeatText: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  seatsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  seatsText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  rideCardDivider: {
    height: 0.8,
    backgroundColor: WARM_CORE.border,
  } as ViewStyle,
  rideCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  } as ViewStyle,
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  } as ViewStyle,
  driverAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: WARM_CORE.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  driverInitial: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  driverName: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  } as TextStyle,
  carModel: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    marginTop: 2,
  } as TextStyle,
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: WARM_CORE.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  } as ViewStyle,
  bookButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    backgroundColor: WARM_CORE.card,
    marginVertical: 24,
    borderRadius: 16,
  } as ViewStyle,
  emptyStateText: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginTop: 20,
    letterSpacing: -0.3,
  } as TextStyle,
  emptyStateSubText: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    marginTop: 10,
    fontWeight: '500',
  } as TextStyle,
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: WARM_CORE.card,
    marginVertical: 24,
    borderRadius: 16,
  } as ViewStyle,
  loadingText: {
    fontSize: 16,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
  } as TextStyle,
  headerSection: {
    marginBottom: 28,
  } as ViewStyle,
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  } as ViewStyle,
  headerAvatarContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
    position: 'relative',
    zIndex: 1,
  } as ViewStyle,
  headerTextContainer: {
    flex: 1,
    justifyContent: 'center',
  } as ViewStyle,
  welcomeText: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 3,
    textTransform: 'uppercase',
  } as TextStyle,
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  greetingText: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.text,
    letterSpacing: -0.4,
  } as TextStyle,
  waveEmoji: {
    fontSize: 20,
    marginLeft: 6,
  } as TextStyle,
  iconContainer: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 24,
  } as ViewStyle,
  headerAvatarWrapper: {
    marginRight: 14,
  } as ViewStyle,
  headerAvatarOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: WARM_CORE.border,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  headerAvatarInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: WARM_CORE.card,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  headerAvatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: WARM_CORE.primary,
  } as TextStyle,
  carRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  timeSeatRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  carIcon: {
    marginRight: 6,
  },
  carModelText: {
    fontSize: 14,
    fontWeight: "600",
    color: WARM_CORE.text,
  },
  footerTimeText: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
  },
  dotSeparator: {
    fontSize: 12,
    color: WARM_CORE.border,
  },
  seatsInfoText: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
  },
  distanceText: {
    fontSize: 12,
    color: WARM_CORE.primary,
    fontWeight: "600",
  },
  promotionalBanner: {
    marginHorizontal: -24,
    paddingHorizontal: 24,
    paddingTop: 30,
  } as ViewStyle,
  bannerContent: {
    flexDirection: 'row',
    backgroundColor: WARM_CORE.card,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    overflow: 'hidden',
  } as ViewStyle,
  bannerTextSection: {
    flex: 1,
    justifyContent: 'space-between',
  } as ViewStyle,
  bannerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: WARM_CORE.text,
    lineHeight: 34,
    marginBottom: 12,
  } as TextStyle,
  bannerSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  } as TextStyle,
  getStartedButton: {
    alignSelf: 'flex-start',
    backgroundColor: WARM_CORE.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 24,
  } as ViewStyle,
  getStartedText: {
    fontSize: 14,
    fontWeight: '800',
    color: WARM_CORE.white,
    letterSpacing: 0.5,
  } as TextStyle,
  bannerIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  bannerIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 60,
    backgroundColor: WARM_CORE.accent,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  quickActionsSection: {
    marginTop: 20,
    marginBottom: 32,
  } as ViewStyle,
  savingsCalcButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  } as ViewStyle,
  savingsCalcLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  } as ViewStyle,
  savingsCalcText: {
    flex: 1,
  } as ViewStyle,
  savingsCalcTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: WARM_CORE.text,
  } as TextStyle,
  savingsCalcSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  } as TextStyle,
});
