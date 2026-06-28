import { useAppContext } from '@/context/AppContext';
import { formatTime } from '@/utils/mockData';
import { getTimeBasedGreeting } from '@/utils/stringUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
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
  Platform,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';

import { calculateDistance, formatDistance, getCurrentLocation } from '@/utils/locationUtils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WARM_CORE } from '@/constants/theme';
import { subscribeToActivePools, subscribeToPassengerRequests, TaxiPool, PoolRequest } from '@/utils/taxiPoolService';
import PoolCard from '@/components/PoolCard';

import GreetingBanner from '@/components/GreetingBanner';
import UserAvatar from '@/components/UserAvatar';
import { getRideSearchScore } from '@/utils/rideService';

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

function UnifiedFeedCard({ item, onPress }: { item: any; onPress: () => void }) {
  const formattedTime = new Date(item.time).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isTaxi = item.type === 'taxi';

  return (
    <TouchableOpacity
      style={[
        styles.newCard,
        isTaxi ? styles.newCardTaxi : styles.newCardCar,
      ]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {isTaxi ? (
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFF2E6' }]}
        />
      ) : (
        <View
          style={[
            styles.cardGradientOverlay,
            styles.cardGradientOverlayCar,
          ]}
          pointerEvents="none"
        />
      )}

      {/* Top Header Row */}
      <View style={styles.cardHeaderRow}>
        <View style={[
          styles.typePill,
          isTaxi ? styles.typePillTaxi : styles.typePillCar
        ]}>
          <Text style={[
            styles.typePillText,
            isTaxi ? styles.typePillTextTaxi : styles.typePillTextCar
          ]}>
            {isTaxi ? 'TAXI POOL' : 'CAR POOL'}
          </Text>
        </View>
        <Text style={styles.cardTimeText}>{formattedTime}</Text>
      </View>

      {/* Body Route Section */}
      <View style={styles.cardBodyRow}>
        <View style={styles.cardRouteSection}>
          <View style={styles.cardRouteLine}>
            <View style={styles.cardRouteHollowCircle} />
            <View style={styles.cardRouteConnector} />
            <View style={styles.cardRouteSolidCircle} />
          </View>
          
          <View style={styles.cardAddresses}>
            <Text style={styles.cardAddressText} numberOfLines={1}>{item.pickup}</Text>
            <Text style={styles.cardAddressText} numberOfLines={1}>{item.dropoff}</Text>
          </View>
        </View>

        {/* Price Box */}
        <View style={styles.cardPriceBox}>
          <Text style={styles.cardPriceText}>₹{item.price}</Text>
          <Text style={styles.cardPriceLabel}>/seat</Text>
        </View>
      </View>

      <View style={styles.cardDivider} />

      {/* Footer Info Row */}
      <View style={styles.cardFooterRow}>
        <View style={styles.cardCreatorInfo}>
          <UserAvatar userId={item.creatorId} imageUrl={item.creatorImage} name={item.creatorName} size={26} />
          <Text style={styles.cardUserText} numberOfLines={1}>
            {item.creatorName}  ·  ★ {item.creatorRating}
          </Text>
        </View>
        <Text style={styles.cardSeatsText}>
          {item.seatsLeft} {item.seatsLeft === 1 ? 'seat' : 'seats'} left →
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string }>();
  const { rides, auth, notifications, loadAllAvailableRides, authInitializing, switchRolePersistent } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [rideDistances, setRideDistances] = useState<Record<string, number>>({});
  const [isLoadingRides, setIsLoadingRides] = useState(false);

  // Taxi Pool States
  const [pools, setPools] = useState<TaxiPool[]>([]);
  const [passengerRequests, setPassengerRequests] = useState<PoolRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'rides' | 'pools'>('all');
  const [showRolePrompt, setShowRolePrompt] = useState(false);
  const [joinLoading, setJoinLoading] = useState<Record<string, boolean>>({});
  const [poolDistances, setPoolDistances] = useState<Record<string, number>>({});

  useEffect(() => {
    if (params.search) {
      setSearchQuery(params.search);
    }
  }, [params]);

  // Combine rides and pools into a unified list
  const combinedFeed = useMemo(() => {
    const feed: any[] = [];
    
    // 1. Car Pools (Rides)
    (rides ?? []).forEach(ride => {
      if (ride.status === 'active' && ride.driverId !== auth.user?.id) {
        const distanceVal = rideDistances[ride.id] ?? Infinity;
        
        // Make clean addresses
        const pickupAddr = ride.pickupLocation.address.split(',')[0];
        const dropoffAddr = ride.dropLocation.address.split(',')[0];
        
        feed.push({
          id: ride.id,
          type: 'car',
          pickup: pickupAddr,
          dropoff: dropoffAddr,
          time: ride.departureTime,
          price: ride.price,
          seatsLeft: ride.availableSeats,
          totalSeats: ride.totalSeats,
          creatorName: ride.driverName,
          creatorId: ride.driverId,
          creatorImage: (ride as any).driverImage || (ride as any).driverProfileImage || null,
          creatorRating: (ride as any).driverRating || (ride as any).rating || 'New',
          rawItem: ride,
          distance: distanceVal,
        });
      }
    });

    // 2. Taxi Pools
    (pools ?? []).forEach(pool => {
      if ((pool.status === 'OPEN' || pool.status === 'FULL') && pool.creatorId !== auth.user?.id) {
        const distanceVal = poolDistances[pool.id] ?? Infinity;
        const priceVal = (pool as any).price ?? 40;
        
        let pickupVal = 'Atlas Gate';
        let dropoffVal = 'Atlas Gate';

        if ((pool as any).pickupLocation && pool.destination) {
          pickupVal = (pool as any).pickupLocation.address.split(',')[0];
          dropoffVal = pool.destination.address.split(',')[0];
        } else {
          const isToAtlas = pool.destination.address.includes('Atlas') || 
                            pool.destination.address.includes('SkillTech') ||
                            pool.destination.address.includes('Gate') ||
                            pool.destination.address.includes('Campus');
          const cleanDest = pool.destination.address.split(',')[0];
          pickupVal = isToAtlas ? cleanDest : 'Atlas Gate';
          dropoffVal = isToAtlas ? 'Atlas Gate' : cleanDest;
        }
        
        feed.push({
          id: pool.id,
          type: 'taxi',
          pickup: pickupVal,
          dropoff: dropoffVal,
          time: pool.departureTime,
          price: priceVal,
          seatsLeft: pool.maxMembers - pool.memberCount,
          totalSeats: pool.maxMembers,
          creatorName: pool.creatorName,
          creatorId: pool.creatorId,
          creatorImage: (pool as any).creatorImage || (pool as any).creatorProfileImage || null,
          creatorRating: (pool as any).creatorRating || (pool as any).rating || 'New',
          rawItem: pool,
          distance: distanceVal,
        });
      }
    });

    // Filter by tab
    let filtered = feed;
    if (activeTab === 'rides') {
      filtered = feed.filter(item => item.type === 'car');
    } else if (activeTab === 'pools') {
      filtered = feed.filter(item => item.type === 'taxi');
    }

    const scored = filtered
      .map((item) => ({
        ...item,
        searchScore: getRideSearchScore(item.rawItem, searchQuery, {
          distanceKm: item.distance,
          userLocation,
        }),
      }))
      .filter((item) => item.searchScore !== Number.NEGATIVE_INFINITY);

    return scored.sort((a, b) => {
      if (searchQuery.trim() && a.searchScore !== b.searchScore) {
        return b.searchScore - a.searchScore;
      }
      if (a.distance !== b.distance) {
        return (a.distance ?? Infinity) - (b.distance ?? Infinity);
      }
      return new Date(a.time).getTime() - new Date(b.time).getTime();
    });
  }, [rides, pools, activeTab, searchQuery, rideDistances, poolDistances, userLocation]);

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

  // Subscribe to taxi pools in real time
  useEffect(() => {
    if (authInitializing || !auth.user) return;
    
    console.log('[HOME] Subscribing to real-time active taxi pools...');
    const unsubscribePools = subscribeToActivePools((updatedPools) => {
      setPools(updatedPools);
    });

    console.log('[HOME] Subscribing to real-time passenger requests...');
    const unsubscribeRequests = subscribeToPassengerRequests(auth.user.id, (requests) => {
      setPassengerRequests(requests);
    });

    return () => {
      unsubscribePools();
      unsubscribeRequests();
    };
  }, [authInitializing, auth.user]);

  // Calculate distance for all pools and sort them
  useEffect(() => {
    const safePools = pools ?? [];
    if (userLocation && safePools.length > 0) {
      const distances: Record<string, number> = {};
      safePools.forEach(pool => {
        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          pool.destination.latitude,
          pool.destination.longitude
        );
        distances[pool.id] = distance;
      });
      setPoolDistances(distances);
    }
  }, [userLocation, pools]);

  // Search filter and sort pools by distance
  const sortedAndFilteredPools = (pools ?? []).filter(pool => {
    const matchesQuery = searchQuery === '' ||
      pool.destination.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pool.creatorName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesQuery;
  }).sort((a, b) => {
    const distA = poolDistances[a.id] ?? Infinity;
    const distB = poolDistances[b.id] ?? Infinity;
    return distA - distB;
  });

  const handlePostRideSelect = () => {
    if (auth.user?.role === 'driver') {
      router.push('/(tabs)/post-ride' as any);
    } else {
      setShowRolePrompt(true);
    }
  };

  const handleSwitchToDriver = async () => {
    setShowRolePrompt(false);
    try {
      if (switchRolePersistent) {
        await switchRolePersistent('driver');
        router.replace('/(tabs)/home' as any);
      }
    } catch (err) {
      console.error('[HOME] Failed to switch role:', err);
    }
  };

  const handleJoinPool = async (poolId: string, creatorId: string) => {
    if (!auth.user) return;
    
    setJoinLoading(prev => ({ ...prev, [poolId]: true }));
    try {
      const { createJoinRequest } = await import('@/utils/taxiPoolService');
      await createJoinRequest(
        poolId,
        {
          id: auth.user.id,
          fullName: auth.user.fullName,
          profileImage: auth.user.profileImage || undefined,
          course: auth.user.course || 'BBA',
          division: auth.user.division || 'A'
        },
        creatorId
      );
      alert('Join request submitted successfully! The pool creator has been notified.');
    } catch (error: any) {
      console.error('[HOME] Join pool request failed:', error);
      alert(error.message || 'Failed to submit join request. Please try again.');
    } finally {
      setJoinLoading(prev => ({ ...prev, [poolId]: false }));
    }
  };

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
  const sortedAndFilteredRides = (rides ?? []).filter(ride => {
    const isStatusValid = (ride.status as string) === 'active' || (ride.status as string) === 'in_progress' || (ride.status as string) === 'booking_open' || (ride.status as string) === 'published';
    const isNotExpired = !ride.departureTime || new Date(ride.departureTime).getTime() > (Date.now() - 6 * 60 * 60 * 1000);
    const hasSeats = (ride.availableSeats ?? 0) > 0;
    const cleanQuery = searchQuery.trim().toLowerCase().replace(/[^\w\s]/g, '');
    let matchesSearch = cleanQuery === '';
    if (!matchesSearch) {
      const tokens = cleanQuery.split(/\s+/);
      const searchIdx: string[] = (ride as any).searchIndex || [];
      const pickupStr = (ride.pickupLocation?.address || '').toLowerCase();
      const dropStr = (ride.dropLocation?.address || '').toLowerCase();
      const driverStr = (ride.driverName || '').toLowerCase();

      matchesSearch = tokens.every(token => 
        searchIdx.some(idx => idx.includes(token)) ||
        pickupStr.includes(token) ||
        dropStr.includes(token) ||
        driverStr.includes(token)
      );
    }
    return isStatusValid && isNotExpired && hasSeats && matchesSearch;
  }).sort((a, b) => {
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

  const firstName = auth.user?.fullName ? auth.user.fullName.trim().split(' ')[0] : 'there';

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

            {/* LEFT: Headline */}
            <View style={styles.headerLeft}>
              <GreetingBanner firstName={firstName} style={{ paddingHorizontal: 0, paddingVertical: 0 }} />
            </View>

            {/* RIGHT: Bell Icon & Profile Circle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity
                onPress={() => router.push('/notifications')}
                onPressIn={onNotifPressIn}
                onPressOut={onNotifPressOut}
                activeOpacity={0.7}
                style={{ padding: 4, position: 'relative' }}
              >
                <Animated.View style={{ transform: [{ scale: notifScale }] }}>
                  <MaterialCommunityIcons name="bell-outline" size={26} color={WARM_CORE.text} />
                  {unreadNotifications > 0 && (
                    <View style={{
                      position: 'absolute',
                      right: -3,
                      top: -3,
                      backgroundColor: WARM_CORE.primary,
                      borderRadius: 9,
                      minWidth: 18,
                      height: 18,
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingHorizontal: 3,
                      borderWidth: 1.5,
                      borderColor: WARM_CORE.background,
                    }}>
                      <Text style={{
                        color: WARM_CORE.white,
                        fontSize: 9,
                        fontWeight: '800',
                        textAlign: 'center'
                      }}>{unreadNotifications}</Text>
                    </View>
                  )}
                </Animated.View>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => router.push('/(tabs)/profile')}
                activeOpacity={0.8}
              >
                <UserAvatar imageUrl={auth.user?.profileImage} name={auth.user?.fullName} size={44} />
              </TouchableOpacity>
            </View>

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

          {/* Segmented Control */}
          <View style={styles.segmentContainer}>
            <TouchableOpacity 
              style={[styles.segmentButton, activeTab === 'all' && styles.segmentButtonActive]} 
              onPress={() => setActiveTab('all')}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, activeTab === 'all' && styles.segmentTextActive]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentButton, activeTab === 'rides' && styles.segmentButtonActive]} 
              onPress={() => setActiveTab('rides')}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, activeTab === 'rides' && styles.segmentTextActive]}>Car Pool</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentButton, activeTab === 'pools' && styles.segmentButtonActive]} 
              onPress={() => setActiveTab('pools')}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, activeTab === 'pools' && styles.segmentTextActive]}>Taxi Pool</Text>
            </TouchableOpacity>
          </View>

          {/* Combined Feed List */}
          {combinedFeed.length > 0 ? (
            <View style={{ marginTop: 12, paddingHorizontal: 20 }}>
              {combinedFeed.map(item => (
                <UnifiedFeedCard
                  key={`${item.type}_${item.id}`}
                  item={item}
                  onPress={() => {
                    if (item.type === 'car') {
                      router.push({ pathname: '/ride-details', params: { rideId: item.id } } as any);
                    } else {
                      router.push({ pathname: '/taxi-pool-details', params: { poolId: item.id } } as any);
                    }
                  }}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Animated.View style={{ transform: [{ scale: emptyIconScale }, { translateY: emptyIconFloat }] }}>
                <MaterialCommunityIcons name="car-off" size={64} color={WARM_CORE.textSecondary} />
              </Animated.View>
              <Text style={styles.emptyStateText}>No commutes found</Text>
              <Text style={styles.emptyStateSubText}>Try clearing search or change category</Text>
            </View>
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
  segmentContainer: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 10,
    gap: 10,
  } as ViewStyle,
  segmentButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
    backgroundColor: '#FFF8F0',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  segmentButtonActive: {
    backgroundColor: WARM_CORE.primary,
    borderColor: WARM_CORE.primary,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  } as ViewStyle,
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  segmentTextActive: {
    color: WARM_CORE.white,
  } as TextStyle,
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  } as ViewStyle,
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30,18,13,0.4)',
    justifyContent: 'flex-end',
    zIndex: 999,
  } as ViewStyle,
  actionSheet: {
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
  } as ViewStyle,
  actionSheetHeader: {
    alignItems: 'center',
    marginBottom: 20,
  } as ViewStyle,
  actionSheetKnob: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: WARM_CORE.border,
    marginBottom: 14,
  } as ViewStyle,
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
  } as TextStyle,
  actionSheetButtons: {
    gap: 12,
    marginBottom: 16,
  } as ViewStyle,
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  actionIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  } as ViewStyle,
  actionButtonText: {
    flex: 1,
  } as ViewStyle,
  actionButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  actionButtonDesc: {
    fontSize: 12,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  } as TextStyle,
  cancelActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  cancelActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  rolePromptModal: {
    backgroundColor: WARM_CORE.background,
    borderRadius: 28,
    marginHorizontal: 32,
    padding: 24,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 24,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  rolePromptTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.text,
    textAlign: 'center',
    marginBottom: 8,
  } as TextStyle,
  rolePromptDesc: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  } as TextStyle,
  rolePromptButtons: {
    flexDirection: 'row',
    gap: 12,
  } as ViewStyle,
  rolePromptButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  rolePromptButtonText: {
    fontSize: 14,
    fontWeight: '700',
  } as TextStyle,
  // ── Unified Feed & Headline Styles ──
  subtitleText: {
    fontSize: 11,
    fontWeight: '800',
    color: WARM_CORE.textSecondary,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  } as TextStyle,
  headlineText: {
    fontSize: 34,
    fontWeight: '900',
    color: WARM_CORE.text,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
    letterSpacing: -2.0,
    lineHeight: 38,
    transform: [{ scaleX: 1.15 }],
    alignSelf: 'flex-start',
  } as TextStyle,
  headlineTextHighlight: {
    color: WARM_CORE.primary,
  } as TextStyle,
  topRightCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  topRightAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  topRightInitialBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WARM_CORE.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  topRightInitialText: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.white,
  } as TextStyle,
  newCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    shadowColor: '#C2703A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
    position: 'relative',
  } as ViewStyle,
  // Taxi Pool card: warm peach-orange base
  newCardTaxi: {
    backgroundColor: '#FFEEDE',
    borderColor: '#F5C9A0',
  } as ViewStyle,
  // Car Pool card: off-white cream base
  newCardCar: {
    backgroundColor: '#FFF8F0',
    borderColor: '#EFE0CC',
  } as ViewStyle,
  // Gradient overlay sits on top of the base, adds a top-left brighten
  cardGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22,
    // Direction: top-left corner fades to transparent toward bottom-right
  } as ViewStyle,
  cardGradientOverlayTaxi: {
    // Top-left: bright warm white tint fading toward bottom-right deep orange
    backgroundColor: 'rgba(255,255,255,0.38)',
    // Clip to top-left quadrant using border radii trick
    borderBottomRightRadius: 200,
  } as ViewStyle,
  cardGradientOverlayCar: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderBottomRightRadius: 200,
  } as ViewStyle,
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  } as ViewStyle,
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  } as ViewStyle,
  typePillCar: {
    backgroundColor: WARM_CORE.primary,
  } as ViewStyle,
  typePillTaxi: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: WARM_CORE.primary,
  } as ViewStyle,
  typePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  } as TextStyle,
  typePillTextCar: {
    color: WARM_CORE.white,
  } as TextStyle,
  typePillTextTaxi: {
    color: WARM_CORE.primary,
  } as TextStyle,
  cardTimeText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  cardBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  } as ViewStyle,
  cardRouteSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  } as ViewStyle,
  cardRouteLine: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'space-between',
    paddingVertical: 2,
  } as ViewStyle,
  cardRouteHollowCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: WARM_CORE.primary,
    backgroundColor: 'transparent',
  } as ViewStyle,
  cardRouteConnector: {
    width: 2,
    flex: 1,
    backgroundColor: WARM_CORE.primary,
    marginVertical: 2,
  } as ViewStyle,
  cardRouteSolidCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WARM_CORE.primary,
  } as ViewStyle,
  cardAddresses: {
    flex: 1,
    justifyContent: 'space-between',
    height: 48,
  } as ViewStyle,
  cardAddressText: {
    fontSize: 15,
    fontWeight: '800',
    color: WARM_CORE.text,
  } as TextStyle,
  cardPriceBox: {
    alignItems: 'flex-end',
  } as ViewStyle,
  cardPriceText: {
    fontSize: 24,
    fontWeight: '900',
    color: WARM_CORE.primary,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-black',
    letterSpacing: -1.0,
    transform: [{ scaleX: 1.15 }],
  } as TextStyle,
  cardPriceLabel: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
    fontWeight: '700',
    marginTop: -2,
  } as TextStyle,
  cardDivider: {
    height: 0.5,
    backgroundColor: WARM_CORE.border,
    marginBottom: 12,
  } as ViewStyle,
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,
  cardCreatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 10,
  } as ViewStyle,
  cardUserText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    flex: 1,
  } as TextStyle,
  cardSeatsText: {
    fontSize: 12,
    fontWeight: '800',
    color: WARM_CORE.primary,
  } as TextStyle,
});
