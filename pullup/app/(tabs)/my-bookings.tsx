import { useAppContext } from '@/context/AppContext';
import { Booking } from '@/types';
import { WARM_CORE } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Modal,
    Pressable,
    RefreshControl,
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
import { subscribeToCreatorPools, subscribeToMemberPools, TaxiPool } from '@/utils/taxiPoolService';

// ---------------------------------------------------------------------------
// Skeleton shimmer card shown while bookings are loading
// ---------------------------------------------------------------------------
function BookingSkeletonCard({ delay = 0 }: { delay?: number }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(16)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered slide-in for each skeleton
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideIn, { toValue: 0, damping: 18, stiffness: 200, mass: 0.8, useNativeDriver: true }),
      ]).start();
    }, delay);

    // Shimmer loop
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
    <Animated.View style={{ opacity, transform: [{ translateY: slideIn }] }}>
      <Animated.View style={[styles.skeletonCard, { opacity: shimmerOp }]}>
        {/* Top row */}
        <View style={styles.skeletonTopRow}>
          <View style={[styles.skeletonBlock, { width: 80, height: 20, borderRadius: 6 }]} />
          <View style={[styles.skeletonBlock, { width: 70, height: 24, borderRadius: 10 }]} />
        </View>
        {/* Route lines */}
        <View style={styles.skeletonRouteRow}>
          <View style={styles.skeletonRouteIndicator}>
            <View style={[styles.skeletonBlock, { width: 10, height: 10, borderRadius: 5 }]} />
            <View style={[styles.skeletonBlock, { width: 2, height: 36, borderRadius: 1 }]} />
            <View style={[styles.skeletonBlock, { width: 10, height: 10, borderRadius: 5 }]} />
          </View>
          <View style={{ flex: 1, gap: 14 }}>
            <View style={[styles.skeletonBlock, { height: 14, borderRadius: 5, width: '75%' }]} />
            <View style={[styles.skeletonBlock, { height: 14, borderRadius: 5, width: '60%' }]} />
          </View>
        </View>
        {/* Bottom row */}
        <View style={styles.skeletonBottomRow}>
          <View style={[styles.skeletonBlock, { width: 36, height: 36, borderRadius: 18 }]} />
          <View style={{ flex: 1, gap: 6, marginLeft: 10 }}>
            <View style={[styles.skeletonBlock, { height: 12, borderRadius: 4, width: '50%' }]} />
            <View style={[styles.skeletonBlock, { height: 10, borderRadius: 4, width: '35%' }]} />
          </View>
          <View style={[styles.skeletonBlock, { width: 50, height: 28, borderRadius: 8 }]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Pressable card with spring scale + shadow lift on press
// ---------------------------------------------------------------------------
function PressableCard({ onPress, style, children, index = 0 }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  // Entry animation — staggered per card
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entrySlide = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    const delay = index * 80;
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
          transform: [{ scale }, { translateY: entrySlide }],
        },
      ]}
    >
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Pressable onPressIn={onIn} onPressOut={onOut} onPress={onPress} style={{ borderRadius: 20, overflow: 'hidden' }}>
          {children}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Pending badge with pulsing opacity
// ---------------------------------------------------------------------------
function PendingBadge({ label, bgColor, textColor }: { label: string; bgColor: string; textColor: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.statusBadge, { backgroundColor: bgColor, opacity: pulse }]}>
      <Text style={[styles.statusText, { color: textColor }]}>{label}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Animated press button (for chat / cancel action buttons)
// ---------------------------------------------------------------------------
function AnimatedPressButton({ onPress, style, children, activeOpacity = 0.7 }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn = () =>
    Animated.spring(scale, { toValue: 0.94, damping: 12, stiffness: 300, mass: 0.5, useNativeDriver: true }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, damping: 16, stiffness: 200, mass: 0.8, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={style}
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={onPress}
        activeOpacity={activeOpacity}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Accepted driver avatar with animated ring
// ---------------------------------------------------------------------------
function AcceptedDriverAvatar({ initial }: { initial: string }) {
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, { toValue: 1.22, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);
  return (
    <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      {/* Pulsing ring */}
      <Animated.View
        style={{
          position: 'absolute',
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 2,
          borderColor: '#10B981',
          opacity: ringOpacity,
          transform: [{ scale: ringScale }],
        }}
      />
      <View style={[styles.driverAvatar, { borderColor: '#10B981', borderWidth: 2 }]}>
        <Text style={styles.driverInitial}>{initial}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Time remaining badge with animated clock icon
// ---------------------------------------------------------------------------
function TimeRemainingBadge({ text }: { text: string }) {
  const iconRotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(iconRotate, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);
  const rotate = iconRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={styles.timeRemainingBadge}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <MaterialCommunityIcons name="clock" size={15} color={WARM_CORE.primary} />
      </Animated.View>
      <Text style={styles.timeRemainingText}>{text}</Text>
    </View>
  );
}

const getTimeRemaining = (departureTimeStr: string) => {
  try {
    const departureDate = new Date(departureTimeStr);
    const nowMs = new Date().getTime();
    const diffMs = departureDate.getTime() - nowMs;

    if (diffMs <= 0) return 'Ride starts soon';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ${diffHours % 24} hr${diffHours % 24 !== 1 ? 's' : ''} till the ride`;
    }

    if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ${diffMins} min${diffMins !== 1 ? 's' : ''} till the ride`;
    }

    return `${diffMins} min${diffMins !== 1 ? 's' : ''} till the ride`;
  } catch (e) {
    return '';
  }
};

export default function MyBookingsScreen() {
  const router = useRouter();
  const { 
    bookings, 
    rides, 
    auth, 
    cancelBooking, 
    loadPassengerBookings, 
    loadAllAvailableRides,
    loadDriverRides,
    acceptBooking,
    rejectBooking,
    cancelRide,
    startRide,
    completeRide
  } = useAppContext();
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [isCancelingBooking, setIsCancelingBooking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Switcher states for Rides screen
  const [activeTab, setActiveTab] = useState<'riding' | 'hosting'>('riding');
  const [subTab, setSubTab] = useState<'car' | 'taxi'>('car');
  const [selectedRideForDetails, setSelectedRideForDetails] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'active' | 'in_progress' | 'completed' | 'cancelled'>('active');
  const [joinedTaxiPools, setJoinedTaxiPools] = useState<TaxiPool[]>([]);
  const [createdTaxiPools, setCreatedTaxiPools] = useState<TaxiPool[]>([]);

  // ── Entry animations (3-stage stagger like home.tsx) ────────────────────
  const headerAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const contentAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(22) }).current;

  // Empty state
  const emptyIconScale = useRef(new Animated.Value(0)).current;
  const emptyIconFloat = useRef(new Animated.Value(0)).current;
  const bookBtnBreath = useRef(new Animated.Value(1)).current;
  const bookBtnScale = useRef(new Animated.Value(1)).current;

  // Modal animations
  const modalSlide = useRef(new Animated.Value(60)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  // Subscribe to taxi pools in real time
  useEffect(() => {
    if (!auth.user?.id) return;
    
    console.log('[MY COMMUTES] Subscribing to member pools for:', auth.user.id);
    const unsubJoined = subscribeToMemberPools(auth.user.id, (pools) => {
      setJoinedTaxiPools(pools);
    });

    console.log('[MY COMMUTES] Subscribing to creator pools for:', auth.user.id);
    const unsubCreated = subscribeToCreatorPools(auth.user.id, (pools) => {
      setCreatedTaxiPools(pools);
    });

    return () => {
      unsubJoined();
      unsubCreated();
    };
  }, [auth.user?.id]);

  // Cinematic 2-stage stagger on mount
  useEffect(() => {
    Animated.stagger(80, [
      Animated.parallel([
        Animated.timing(headerAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(headerAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(contentAnim.translateY, { toValue: 0, damping: 20, stiffness: 160, mass: 1, useNativeDriver: true }),
      ]),
    ]).start();

    // Empty state float
    Animated.loop(
      Animated.sequence([
        Animated.timing(emptyIconFloat, { toValue: -7, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(emptyIconFloat, { toValue: 7, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Load passenger bookings AND driver rides on screen focus
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        if (auth.user?.id) {
          try {
            setIsLoading(true);
            await Promise.all([
              loadPassengerBookings(auth.user.id),
              loadDriverRides(auth.user.id),
              loadAllAvailableRides(),
            ]);
          } catch (error) {
            console.error('[MY BOOKINGS] ❌ Failed to load data:', error);
          } finally {
            setIsLoading(false);
          }
        }
      };
      loadData();
    }, [auth.user?.id, loadPassengerBookings, loadDriverRides, loadAllAvailableRides])
  );

  // Handle pull-to-refresh
  const handleRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      if (auth.user?.id) {
        await Promise.all([
          loadPassengerBookings(auth.user.id),
          loadDriverRides(auth.user.id),
          loadAllAvailableRides(),
        ]);
      }
    } catch (error) {
      console.error('[MY BOOKINGS] ❌ Failed to refresh data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [auth.user?.id, loadPassengerBookings, loadAllAvailableRides]);

  // Get bookings where current user is the passenger AND ride is active, in_progress, completed or cancelled
  const rawPassengerBookings = (bookings ?? []).filter((b, idx, self) => {
    if (b.passengerId !== auth.user?.id) return false;
    const ride = (rides ?? []).find(r => r.id === b.rideId);
    const isRideActive = ride && (ride.status === 'active' || ride.status === 'in_progress' || ride.status === 'completed' || ride.status === 'cancelled');
    if (!isRideActive) return false;

    // Deduplicate duplicate document IDs
    return self.findIndex(o => o.id === b.id) === idx;
  });

  // Keep only the most relevant booking per rideId
  const passengerBookings = (() => {
    const groups: { [rideId: string]: Booking[] } = {};
    for (const b of rawPassengerBookings) {
      if (!groups[b.rideId]) {
        groups[b.rideId] = [];
      }
      groups[b.rideId].push(b);
    }

    const result: Booking[] = [];
    for (const rideId in groups) {
      const rideBookings = groups[rideId];
      if (rideBookings.length === 1) {
        result.push(rideBookings[0]);
      } else {
        const active = rideBookings.find(b => b.status === 'pending' || b.status === 'accepted');
        if (active) {
          result.push(active);
        } else {
          rideBookings.sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime());
          result.push(rideBookings[0]);
        }
      }
    }
    return result;
  })();

  const hostedCarPools = (rides ?? []).filter(r => r.driverId === auth.user?.id);
  const filteredHostedCarPools = hostedCarPools
    .filter(ride => ride.status === selectedStatus)
    .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime());

  // Empty state animations
  useEffect(() => {
    if (!isLoading && passengerBookings.length === 0) {
      Animated.spring(emptyIconScale, { toValue: 1, damping: 8, stiffness: 130, mass: 0.7, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(bookBtnBreath, { toValue: 1.025, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bookBtnBreath, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    } else {
      emptyIconScale.setValue(0);
    }
  }, [isLoading, passengerBookings.length]);

  // Modal slide animation
  useEffect(() => {
    if (cancelBookingId !== null) {
      modalSlide.setValue(60);
      modalOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(modalSlide, { toValue: 0, damping: 22, stiffness: 200, mass: 0.9, useNativeDriver: true }),
        Animated.timing(modalOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [cancelBookingId]);

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const getStatusConfig = (bookingStatus: string, rideStatus?: string) => {
    if (bookingStatus === 'cancelled') {
      return { bg: '#F3F4F6', text: '#6B7280', label: 'Cancelled' };
    }
    if (bookingStatus === 'rejected') {
      return { bg: '#FEE2E2', text: '#DC2626', label: 'Rejected' };
    }
    if (rideStatus === 'cancelled') {
      return { bg: '#FEE2E2', text: '#DC2626', label: 'Ride Cancelled' };
    }
    if (rideStatus === 'completed') {
      return { bg: '#D1FAE5', text: '#059669', label: 'Completed' };
    }
    if (rideStatus === 'in_progress') {
      return { bg: '#FEF3C7', text: '#D97706', label: 'Ongoing' };
    }
    switch (bookingStatus) {
      case 'accepted':
        return { bg: '#D1FAE5', text: '#059669', label: 'Accepted' };
      case 'pending':
        return { bg: '#FEF3C7', text: '#D97706', label: 'Ride Requested' };
      default:
        return { bg: '#F3F4F6', text: '#4B5563', label: bookingStatus };
    }
  };

  // Calculate penalty for cancellation
  const calculateCancellationPenalty = (departureTimeString: string) => {
    const departureTime = new Date(departureTimeString);
    const now = new Date();
    const minutesBefore = (departureTime.getTime() - now.getTime()) / (1000 * 60);
    const penalty = minutesBefore <= 20 ? 50 : 0;
    return { minutesBefore, penalty };
  };

  const getDriverStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return { label: 'Upcoming', color: WARM_CORE.primary, bgColor: 'rgba(212, 80, 10, 0.1)' };
      case 'in_progress':
        return { label: 'Ongoing', color: '#F59E0B', bgColor: 'rgba(245, 158, 11, 0.1)' };
      case 'completed':
        return { label: 'Completed', color: WARM_CORE.success, bgColor: 'rgba(16, 185, 129, 0.1)' };
      case 'cancelled':
        return { label: 'Cancelled', color: WARM_CORE.error, bgColor: 'rgba(239, 68, 68, 0.1)' };
      default:
        return { label: status, color: WARM_CORE.textSecondary, bgColor: WARM_CORE.border };
    }
  };

  const getDriverTimeRemaining = (departureTimeStr: string) => {
    try {
      const departureDate = new Date(departureTimeStr);
      const nowMs = new Date().getTime();
      const diffMs = departureDate.getTime() - nowMs;
      
      if (diffMs <= 0) return 'Ride starts soon';
      
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffDays > 0) {
        return `Starts in ${diffDays}d ${diffHours % 24}h`;
      }
      if (diffHours > 0) {
        return `Starts in ${diffHours}h ${diffMins}m`;
      }
      return `Starts in ${diffMins}m`;
    } catch (e) {
      return '';
    }
  };

  const getDriverRideEarnings = (ride: any) => {
    const acceptedSeatsCount = ride.bookedSeats
      .filter((bs: any) => bs.status === 'accepted')
      .reduce((sum: number, bs: any) => sum + bs.seatsBooked, 0);
    return acceptedSeatsCount * ride.price;
  };

  const getDetailedRide = (rideId: string) => {
    return rides.find(r => r.id === rideId);
  };

  const getCurrentRidePassengers = (rideId: string) => {
    return bookings.filter(b => b.rideId === rideId);
  };

  // Render hosted car pools (driver view)
  const renderHostedCarPoolCard = (ride: any, index: number) => {
    const statusBadge = getDriverStatusBadge(ride.status);
    const confirmedSeats = ride.totalSeats - ride.availableSeats;
    const earnings = getDriverRideEarnings(ride);
    const pendingCount = ride.bookedSeats.filter((b: any) => b.status === 'pending').length;

    return (
      <PressableCard
        key={ride.id}
        index={index}
        style={styles.rideCard}
        onPress={() => setSelectedRideForDetails(ride.id)}
      >
        {/* Top Section: Status Badge and Time */}
        <View style={styles.cardTopSection}>
          <View style={styles.timeSection}>
            <Text style={styles.departureTime}>{formatTime(ride.departureTime)}</Text>
            <Text style={styles.departureDate}>
              {new Date(ride.departureTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusBadge.bgColor }]}>
            {ride.status === 'in_progress' && (
              <View style={styles.statusDot} />
            )}
            <Text style={[styles.statusText, { color: statusBadge.color }]}>
              {statusBadge.label}
            </Text>
          </View>
        </View>

        {/* Middle Section: Route with indicator */}
        <View style={styles.routeSection}>
          <View style={styles.routeIndicator}>
            <View style={[styles.routeDot, { backgroundColor: WARM_CORE.primary, borderColor: WARM_CORE.primary }]} />
            <View style={styles.routeLine} />
            <View style={[styles.routeDot, { backgroundColor: WARM_CORE.textSecondary, borderColor: WARM_CORE.textSecondary }]} />
          </View>

          <View style={styles.routeDetails}>
            <View style={styles.locationDetail}>
              <Text style={styles.locationLabel}>PICKUP</Text>
              <Text style={styles.locationName} numberOfLines={1}>
                {ride.pickupLocation.address.split(',')[0]}
              </Text>
            </View>
            <View style={styles.locationDetail}>
              <Text style={[styles.locationLabel, { color: WARM_CORE.textSecondary }]}>DROP-OFF</Text>
              <Text style={styles.locationName} numberOfLines={1}>
                {ride.dropLocation.address.split(',')[0]}
              </Text>
            </View>
          </View>
        </View>

        {/* Time Remaining Badge */}
        {ride.status === 'active' && (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <TimeRemainingBadge text={getDriverTimeRemaining(ride.departureTime)} />
          </View>
        )}

        {/* Bottom Section: Seats & Earnings */}
        <View style={styles.cardBottomSection}>
          <View style={styles.driverSection}>
            <View style={styles.driverAvatar}>
              <MaterialCommunityIcons name="account-group" size={20} color={WARM_CORE.primary} />
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{confirmedSeats} / {ride.totalSeats} seats booked</Text>
              <Text style={styles.carModel}>{ride.carModel}</Text>
            </View>
          </View>

          <View style={styles.priceSection}>
            <Text style={styles.price}>₹{earnings.toFixed(0)}</Text>
            <Text style={styles.priceLabel}>Earnings</Text>
          </View>
        </View>

        {/* Pending Requests Alert Banner */}
        {ride.status === 'active' && pendingCount > 0 && (
          <View style={styles.pendingRequestsBanner}>
            <MaterialCommunityIcons name="bell-alert" size={13} color="#D97706" />
            <Text style={styles.pendingRequestsText}>
              {pendingCount} pending request{pendingCount > 1 ? 's' : ''} — Tap to manage
            </Text>
          </View>
        )}
      </PressableCard>
    );
  };

  // Render booked rides (passenger view)
  const renderBookedRideCard = (booking: any, index: number) => {
    const ride = rides.find(r => r.id === booking.rideId);
    if (!ride) return null;

    const statusConfig = getStatusConfig(booking.status, ride.status);
    const canCancel = booking.status === 'accepted' && ride.status === 'active';
    const { minutesBefore, penalty } = calculateCancellationPenalty(ride.departureTime);
    const timeRemaining = getTimeRemaining(ride.departureTime);

    return (
      <PressableCard
        key={booking.id}
        index={index}
        style={styles.rideCard}
        onPress={() => router.push({ pathname: '/ride-details', params: { rideId: ride.id, bookingId: booking.id } })}
      >

        {/* Top Section: Status Badge and Time */}
        <View style={styles.cardTopSection}>
          <View style={styles.timeSection}>
            <Text style={styles.departureTime}>{formatTime(ride.departureTime)}</Text>
            <Text style={styles.departureDate}>
              {new Date(ride.departureTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>

          {booking.status === 'pending' ? (
            <PendingBadge
              label={statusConfig.label}
              bgColor={statusConfig.bg}
              textColor={statusConfig.text}
            />
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              {booking.status === 'accepted' && ride.status === 'active' && (
                <View style={styles.statusDot} />
              )}
              <Text style={[styles.statusText, { color: statusConfig.text }]}>
                {statusConfig.label}
              </Text>
            </View>
          )}
        </View>

        {/* Middle Section: Route with indicator */}
        <View style={styles.routeSection}>
          <View style={styles.routeIndicator}>
            <View style={[styles.routeDot, { backgroundColor: WARM_CORE.primary, borderColor: WARM_CORE.primary }]} />
            <View style={styles.routeLine} />
            <View style={[styles.routeDot, { backgroundColor: WARM_CORE.textSecondary, borderColor: WARM_CORE.textSecondary }]} />
          </View>

          <View style={styles.routeDetails}>
            <View style={styles.locationDetail}>
              <Text style={styles.locationLabel}>PICKUP</Text>
              <Text style={styles.locationName} numberOfLines={1}>
                {ride.pickupLocation.address.split(',')[0]}
              </Text>
            </View>
            <View style={styles.locationDetail}>
              <Text style={[styles.locationLabel, { color: WARM_CORE.textSecondary }]}>DROP-OFF</Text>
              <Text style={styles.locationName} numberOfLines={1}>
                {ride.dropLocation.address.split(',')[0]}
              </Text>
            </View>
          </View>
        </View>

        {/* Time Remaining Badge */}
        {ride.status === 'active' && (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <TimeRemainingBadge text={timeRemaining} />
          </View>
        )}

        {/* Bottom Section: Driver Info */}
        <View style={styles.cardBottomSection}>
          <View style={styles.driverSection}>
            {booking.status === 'accepted' ? (
              <AcceptedDriverAvatar initial={ride.driverName.charAt(0)} />
            ) : (
              <View style={styles.driverAvatar}>
                <Text style={styles.driverInitial}>{ride.driverName.charAt(0)}</Text>
              </View>
            )}
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{ride.driverName}</Text>
              <Text style={styles.carModel}>{ride.carModel}</Text>
            </View>
          </View>

          <View style={styles.priceSection}>
            <Text style={styles.price}>₹{(ride.price).toFixed(0)}</Text>
            <Text style={styles.priceLabel}>Total</Text>
          </View>
        </View>

        {/* Actions — Only show for accepted bookings that are not completed/cancelled */}
        {booking.status === 'accepted' && ride.status !== 'completed' && ride.status !== 'cancelled' && (
          <View style={styles.acceptedActionsContainer}>
            {/* Penalty warning — only within 20 min window and only if ride is active */}
            {ride.status === 'active' && minutesBefore > 0 && minutesBefore <= 20 && (
              <View style={styles.penaltyWarningBanner}>
                <MaterialCommunityIcons name="alert" size={13} color={WARM_CORE.primary} />
                <Text style={styles.penaltyWarningText}>
                  Cancelling now incurs a 50% penalty — ₹{Math.round(ride.price * 0.5)} will be charged
                </Text>
              </View>
            )}

            {/* Message Driver */}
            {(ride.status === 'active' || ride.status === 'in_progress') && (
              <AnimatedPressButton
                style={styles.chatButton}
                onPress={() => router.push({ pathname: '/chat', params: { rideId: ride.id, bookingId: booking.id } })}
              >
                <MaterialCommunityIcons name="message-text-outline" size={16} color={WARM_CORE.white} />
                <Text style={styles.chatButtonText}>Message Driver</Text>
              </AnimatedPressButton>
            )}

            {/* Cancel Booking — only if ride is active */}
            {ride.status === 'active' && (
              <AnimatedPressButton
                style={styles.cancelActionButton}
                onPress={() => setCancelBookingId(booking.id)}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={15} color="#EF4444" />
                <Text style={styles.cancelActionButtonText}>Cancel Booking</Text>
                {minutesBefore > 0 && minutesBefore <= 20 && (
                  <View style={styles.penaltyPill}>
                    <Text style={styles.penaltyPillText}>50% fee</Text>
                  </View>
                )}
              </AnimatedPressButton>
            )}
          </View>
        )}

        {/* Penalty Info if Cancelled */}
        {booking.status === 'cancelled' && booking.penaltyApplied && booking.penaltyApplied > 0 && (
          <View style={styles.penaltySection}>
            <MaterialCommunityIcons name="alert-circle" size={14} color="#EF4444" />
            <Text style={styles.penaltyText}>
              Penalty Applied: ₹{(ride.price * (booking.penaltyApplied / 100)).toFixed(0)}
            </Text>
          </View>
        )}
      </PressableCard>
    );
  };

  const renderTaxiPoolCard = (pool: TaxiPool, isHosting: boolean) => {
    const seatsLeft = pool.maxMembers - pool.memberCount;
    const depTime = new Date(pool.departureTime);
    
    // Status colors
    let statusBg = 'rgba(16, 185, 129, 0.1)';
    let statusText = '#10B981';
    if (pool.status === 'FULL') {
      statusBg = 'rgba(245, 158, 11, 0.1)';
      statusText = '#F59E0B';
    } else if (pool.status === 'CANCELLED') {
      statusBg = 'rgba(239, 68, 68, 0.1)';
      statusText = '#EF4444';
    } else if (pool.status === 'CLOSED') {
      statusBg = 'rgba(107, 114, 128, 0.1)';
      statusText = '#6B7280';
    }

    return (
      <TouchableOpacity
        key={pool.id}
        style={styles.taxiPoolCard}
        onPress={() => router.push({ pathname: '/taxi-pool-details', params: { poolId: pool.id } } as any)}
        activeOpacity={0.85}
      >
        <View style={styles.taxiCardHeader}>
          <View style={styles.taxiCardHeaderLeft}>
            <View style={styles.taxiIconContainer}>
              <MaterialCommunityIcons name="taxi" size={20} color={WARM_CORE.primary} />
            </View>
            <View>
              <Text style={styles.taxiDestText} numberOfLines={1}>
                To {pool.destination.address.split(',')[0]}
              </Text>
              <Text style={styles.taxiTimeText}>
                {depTime.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {depTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
          
          <View style={[styles.taxiStatusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.taxiStatusText, { color: statusText }]}>
              {pool.status}
            </Text>
          </View>
        </View>

        <View style={styles.taxiCardBottom}>
          <View style={styles.taxiCardInfoGroup}>
            <View style={styles.taxiStatItem}>
              <MaterialCommunityIcons name="account-group-outline" size={16} color={WARM_CORE.textSecondary} />
              <Text style={styles.taxiStatText}>{pool.memberCount}/{pool.maxMembers} members</Text>
            </View>
            <Text style={styles.taxiDotSeparator}>•</Text>
            <View style={styles.taxiStatItem}>
              <MaterialCommunityIcons name="account-multiple-plus" size={16} color={WARM_CORE.textSecondary} />
              <Text style={styles.taxiStatText}>{seatsLeft} seats left</Text>
            </View>
          </View>

          <View style={styles.taxiDetailsAction}>
            <Text style={styles.taxiDetailsActionText}>
              {isHosting ? 'Manage Pool' : 'View Pool'}
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color={WARM_CORE.primary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Handle booking cancellation
  const handleCancelBooking = async () => {
    if (!cancelBookingId) return;
    setIsCancelingBooking(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      cancelBooking(cancelBookingId);
      setCancelBookingId(null);
    } catch (error) {
      console.error('Error cancelling booking:', error);
    } finally {
      setIsCancelingBooking(false);
    }
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalSlide, { toValue: 60, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(modalOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setCancelBookingId(null));
  };

  // Get booking and ride for modal
  const bookingToCancel = cancelBookingId ? bookings.find(b => b.id === cancelBookingId) : null;
  const rideForBooking = bookingToCancel ? rides.find(r => r.id === bookingToCancel.rideId) : null;
  const penaltyInfo = bookingToCancel && rideForBooking ? calculateCancellationPenalty(rideForBooking.departureTime) : null;
  const penaltyAmount = penaltyInfo && bookingToCancel
    ? Math.round(rideForBooking!.price * (penaltyInfo.penalty / 100))
    : 0;

  // Book now button press
  const onBookNowIn = () =>
    Animated.spring(bookBtnScale, { toValue: 0.95, damping: 12, stiffness: 300, mass: 0.5, useNativeDriver: true }).start();
  const onBookNowOut = () =>
    Animated.spring(bookBtnScale, { toValue: 1, damping: 16, stiffness: 200, mass: 0.8, useNativeDriver: true }).start();

  return (
    <>
      {/* Cancel Booking Confirmation Modal */}
      <Modal
        transparent
        animationType="none"
        visible={cancelBookingId !== null}
        onRequestClose={closeModal}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: modalOpacity }]}>
          <Animated.View
            style={[
              styles.modalContent,
              { transform: [{ translateY: modalSlide }] },
            ]}
          >
            {/* Drag Handle */}
            <View style={styles.modalHandle} />

            {/* Header with Icon and Title */}
            <View style={styles.modalIconWrapper}>
              <View style={styles.modalIconBackground}>
                <MaterialCommunityIcons name="alert-circle" size={26} color="#EF4444" />
              </View>
            </View>

            <Text style={styles.modalTitle}>Cancel Booking?</Text>
            <Text style={styles.modalSubtitle}>Please review cancellation details</Text>

            {bookingToCancel && rideForBooking && penaltyInfo && (
              <View style={styles.modalBody}>
                {/* Time Until Ride */}
                <View style={styles.modalInfoSection}>
                  <View style={styles.infoHeader}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color={WARM_CORE.textSecondary} />
                    <Text style={styles.infoTitle}>Time Until Ride</Text>
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoPrimaryValue}>{Math.max(0, penaltyInfo.minutesBefore).toFixed(0)}</Text>
                    <Text style={styles.infoSecondaryValue}>minutes remaining</Text>
                  </View>
                </View>

                {/* Fare Amount */}
                <View style={styles.modalInfoSection}>
                  <View style={styles.infoHeader}>
                    <MaterialCommunityIcons name="currency-inr" size={16} color={WARM_CORE.textSecondary} />
                    <Text style={styles.infoTitle}>Total Fare</Text>
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoPrimaryValue}>₹{(rideForBooking.price).toFixed(0)}</Text>
                    <Text style={styles.infoSecondaryValue}>{bookingToCancel.seatsBooked} seat{bookingToCancel.seatsBooked > 1 ? 's' : ''}</Text>
                  </View>
                </View>

                {/* Penalty or No Penalty */}
                {penaltyInfo.penalty > 0 ? (
                  <View style={[styles.modalInfoSection, styles.modalPenaltyCard]}>
                    <View style={styles.infoHeader}>
                      <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
                      <Text style={[styles.infoTitle, { color: '#EF4444' }]}>Penalty ({penaltyInfo.penalty}%)</Text>
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoPrimaryValue, { color: '#EF4444' }]}>-₹{penaltyAmount.toFixed(0)}</Text>
                      <Text style={[styles.infoSecondaryValue, { color: '#EF4444' }]}>Will be deducted from refund</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.modalInfoSection, styles.successSection]}>
                    <View style={styles.infoHeader}>
                      <MaterialCommunityIcons name="check-circle" size={16} color={WARM_CORE.success} />
                      <Text style={[styles.infoTitle, { color: WARM_CORE.success }]}>No Penalty</Text>
                    </View>
                    <Text style={styles.successText}>You can cancel for free</Text>
                  </View>
                )}
              </View>
            )}

            {/* Divider */}
            <View style={styles.modalDivider} />

            {/* Action Buttons — stacked, destructive confirm at bottom */}
            <View style={styles.modalFooter}>
              {/* Ghost secondary: Keep my booking */}
              <AnimatedPressButton
                style={[styles.modalSecondaryBtn, isCancelingBooking && styles.buttonDisabled]}
                onPress={closeModal}
              >
                <Text style={styles.modalSecondaryBtnText}>Keep My Booking</Text>
              </AnimatedPressButton>

              {/* Dominant red confirm cancel */}
              <AnimatedPressButton
                style={[styles.modalPrimaryBtn, isCancelingBooking && styles.buttonDisabled]}
                onPress={handleCancelBooking}
              >
                {isCancelingBooking ? (
                  <>
                     <ActivityIndicator size="small" color="#FFFFFF" />
                     <Text style={styles.modalPrimaryBtnText}>Cancelling...</Text>
                  </>
                ) : (
                  <>
                    <MaterialCommunityIcons name="close-circle-outline" size={17} color="#FFFFFF" />
                    <Text style={styles.modalPrimaryBtnText}>
                      {penaltyAmount > 0 ? `Cancel & Pay ₹${penaltyAmount}` : 'Yes, Cancel Booking'}
                    </Text>
                  </>
                )}
              </AnimatedPressButton>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Main Content */}
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />

        {/* Animated Header Section */}
        <Animated.View
          style={[
            styles.headerSection,
            {
              opacity: headerAnim.opacity,
              transform: [{ translateY: headerAnim.translateY }],
            },
          ]}
        >
          <Text style={styles.headerTitle}>My Commutes</Text>
          <Text style={styles.headerSubtitle}>Manage your riding and hosting schedules</Text>
        </Animated.View>

        <Animated.View
          style={{
            flex: 1,
            opacity: contentAnim.opacity,
            transform: [{ translateY: contentAnim.translateY }],
          }}
        >
          {/* Top Level Tab Selector (Riding vs Hosting) */}
          <View style={styles.topTabContainer}>
            <TouchableOpacity
              style={[styles.topTab, activeTab === 'riding' && styles.topTabActive]}
              onPress={() => setActiveTab('riding')}
              activeOpacity={0.8}
            >
              <Text style={[styles.topTabLabel, activeTab === 'riding' && styles.topTabLabelActive]}>
                Riding (Joined)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.topTab, activeTab === 'hosting' && styles.topTabActive]}
              onPress={() => setActiveTab('hosting')}
              activeOpacity={0.8}
            >
              <Text style={[styles.topTabLabel, activeTab === 'hosting' && styles.topTabLabelActive]}>
                Hosting (Created)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sub-tab selector */}
          <View style={styles.subTabContainer}>
            <TouchableOpacity
              style={[styles.subTabButton, subTab === 'car' && styles.subTabButtonActive]}
              onPress={() => setSubTab('car')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="car" size={16} color={subTab === 'car' ? WARM_CORE.white : WARM_CORE.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.subTabText, subTab === 'car' && styles.subTabTextActive]}>Car Pools</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTabButton, subTab === 'taxi' && styles.subTabButtonActive]}
              onPress={() => setSubTab('taxi')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="taxi" size={16} color={subTab === 'taxi' ? WARM_CORE.white : WARM_CORE.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.subTabText, subTab === 'taxi' && styles.subTabTextActive]}>Taxi Pools</Text>
            </TouchableOpacity>
          </View>

          {/* Status Tab Filter (Only if Hosting -> Car Pools is active) */}
          {activeTab === 'hosting' && subTab === 'car' && (
            <View style={styles.driverTabContainer}>
              {(['active', 'in_progress', 'completed', 'cancelled'] as const).map(status => {
                const isSelected = selectedStatus === status;
                let statusLabel = '';
                if (status === 'active') statusLabel = 'Upcoming';
                else if (status === 'in_progress') statusLabel = 'Ongoing';
                else statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
                
                return (
                  <TouchableOpacity
                    key={status}
                    style={[styles.driverTab, isSelected && styles.driverTabActive]}
                    onPress={() => setSelectedStatus(status)}
                  >
                    <Text style={[styles.driverTabLabel, isSelected && styles.driverTabLabelActive]}>
                      {statusLabel}
                    </Text>
                    {isSelected && <View style={styles.driverTabUnderline} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={WARM_CORE.primary}
                progressBackgroundColor={WARM_CORE.card}
              />
            }
          >
            {isLoading ? (
              <View style={{ paddingTop: 8 }}>
                <BookingSkeletonCard delay={0} />
                <BookingSkeletonCard delay={80} />
              </View>
            ) : activeTab === 'riding' ? (
              subTab === 'car' ? (
                passengerBookings.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Animated.View
                      style={[
                        styles.emptyIconContainer,
                        { transform: [{ scale: emptyIconScale }, { translateY: emptyIconFloat }] },
                      ]}
                    >
                      <MaterialCommunityIcons name="car-off" size={48} color={WARM_CORE.textSecondary} />
                    </Animated.View>
                    <Text style={styles.emptyStateText}>No Joined Car Pools</Text>
                    <Text style={styles.emptyStateSubText}>
                      {"You haven't booked any car pool seats yet"}
                    </Text>
                    <TouchableOpacity
                      style={styles.bookNowButton}
                      onPress={() => router.push('/(tabs)/home')}
                    >
                      <MaterialCommunityIcons name="magnify" size={16} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                      <Text style={styles.bookNowButtonText}>Find Car Pools</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    {passengerBookings.map((booking, index) => renderBookedRideCard(booking, index))}
                  </View>
                )
              ) : (
                joinedTaxiPools.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Animated.View
                      style={[
                        styles.emptyIconContainer,
                        { transform: [{ scale: emptyIconScale }, { translateY: emptyIconFloat }] },
                      ]}
                    >
                      <MaterialCommunityIcons name="taxi" size={48} color={WARM_CORE.textSecondary} />
                    </Animated.View>
                    <Text style={styles.emptyStateText}>No Joined Taxi Pools</Text>
                    <Text style={styles.emptyStateSubText}>
                      {"You haven't joined any taxi pools yet"}
                    </Text>
                    <TouchableOpacity
                      style={styles.bookNowButton}
                      onPress={() => router.push('/(tabs)/home')}
                    >
                      <MaterialCommunityIcons name="magnify" size={16} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                      <Text style={styles.bookNowButtonText}>Find Taxi Pools</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    {joinedTaxiPools.map((pool) => renderTaxiPoolCard(pool, false))}
                  </View>
                )
              )
            ) : (
              subTab === 'car' ? (
                filteredHostedCarPools.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Animated.View
                      style={[
                        styles.emptyIconContainer,
                        { transform: [{ scale: emptyIconScale }, { translateY: emptyIconFloat }] },
                      ]}
                    >
                      <MaterialCommunityIcons name="car-off" size={48} color={WARM_CORE.textSecondary} />
                    </Animated.View>
                    <Text style={styles.emptyStateText}>
                      {selectedStatus === 'active' ? 'No Upcoming Car Pools' : `No ${selectedStatus} Car Pools`}
                    </Text>
                    <Text style={styles.emptyStateSubText}>
                      {selectedStatus === 'active'
                        ? 'Post a car pool from the + option to get started'
                        : 'Your rides will appear here'}
                    </Text>
                  </View>
                ) : (
                  <View>
                    {filteredHostedCarPools.map((ride, index) => renderHostedCarPoolCard(ride, index))}
                  </View>
                )
              ) : (
                createdTaxiPools.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Animated.View
                      style={[
                        styles.emptyIconContainer,
                        { transform: [{ scale: emptyIconScale }, { translateY: emptyIconFloat }] },
                      ]}
                    >
                      <MaterialCommunityIcons name="plus-circle-outline" size={48} color={WARM_CORE.textSecondary} />
                    </Animated.View>
                    <Text style={styles.emptyStateText}>No Hosted Taxi Pools</Text>
                    <Text style={styles.emptyStateSubText}>
                      {"You haven't created any taxi pools yet"}
                    </Text>
                    <TouchableOpacity
                      style={styles.bookNowButton}
                      onPress={() => router.push('/create-taxi-pool')}
                    >
                      <MaterialCommunityIcons name="plus" size={18} color={WARM_CORE.white} style={{ marginRight: 6 }} />
                      <Text style={styles.bookNowButtonText}>Create a Taxi Pool</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    {createdTaxiPools.map((pool) => renderTaxiPoolCard(pool, true))}
                  </View>
                )
              )
            )}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>

      {/* RIDE DETAILS MODAL */}
      {selectedRideForDetails && (
        <RideDetailsModal
          ride={getDetailedRide(selectedRideForDetails)!}
          passengers={getCurrentRidePassengers(selectedRideForDetails)}
          earnings={getDriverRideEarnings(getDetailedRide(selectedRideForDetails)!)}
          onClose={() => setSelectedRideForDetails(null)}
          onAcceptPassenger={async (passengerId) => {
            if (selectedRideForDetails) {
              await acceptBooking(selectedRideForDetails, passengerId);
            }
          }}
          onRejectPassenger={async (passengerId) => {
            if (selectedRideForDetails) {
              await rejectBooking(selectedRideForDetails, passengerId);
            }
          }}
          onCancelRide={async (rideId) => {
            await cancelRide(rideId);
            setSelectedRideForDetails(null);
          }}
          onStartRide={async (rideId) => {
            await startRide(rideId);
          }}
          onCompleteRide={async (rideId) => {
            await completeRide(rideId);
          }}
          router={router}
        />
      )}
    </>
  );
}

// RIDE DETAILS MODAL COMPONENT (FOR DRIVER)
interface RideDetailsModalProps {
  ride: any;
  passengers: any[];
  earnings: number;
  onClose: () => void;
  onAcceptPassenger: (bookingId: string) => Promise<void>;
  onRejectPassenger: (bookingId: string) => Promise<void>;
  onCancelRide: (rideId: string) => Promise<void>;
  onStartRide: (rideId: string) => Promise<void>;
  onCompleteRide: (rideId: string) => Promise<void>;
  router: any;
}

function RideDetailsModal({ ride, passengers, earnings, onClose, onAcceptPassenger, onRejectPassenger, onCancelRide, onStartRide, onCompleteRide, router }: RideDetailsModalProps) {
  const [processingBooking, setProcessingBooking] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const formatModalTime = (timeString: string) => {
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return '';
    }
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.driverModalContainer}>
        <ScrollView
          style={styles.driverModalContent}
          contentContainerStyle={styles.driverModalContentPadded}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.driverModalHeader}>
            <TouchableOpacity onPress={onClose} style={styles.driverCloseButton}>
              <MaterialCommunityIcons name="chevron-down" size={28} color={WARM_CORE.text} />
            </TouchableOpacity>
            <Text style={styles.driverModalTitle}>Ride Details</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* RIDE INFO SECTION */}
          <View style={styles.driverModalSection}>
            <Text style={styles.driverSectionTitle}>ROUTE & TIMING</Text>
            
            <View style={styles.driverRouteBox}>
              <View style={styles.driverFullRouteIndicator}>
                <View style={styles.driverFullRouteDot} />
                <View style={styles.driverFullRouteLine} />
                <View style={styles.driverFullRouteDot} />
              </View>

              <View style={styles.driverFullLocationsContainer}>
                <View>
                  <Text style={styles.driverRouteLabelBold}>PICKUP</Text>
                  <Text style={styles.driverRouteValueText}>{ride.pickupLocation.address}</Text>
                </View>
                <View style={styles.driverRouteSpacing} />
                <View>
                  <Text style={styles.driverRouteLabelBold}>DROP-OFF</Text>
                  <Text style={styles.driverRouteValueText}>{ride.dropLocation.address}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* DATE, TIME & PRICE */}
          <View style={styles.driverModalSection}>
            <View style={styles.driverInfoGridRow}>
              <View style={styles.driverInfoGridItem}>
                <Text style={styles.driverInfoGridLabel}>Date & Time</Text>
                <Text style={styles.driverInfoGridValue}>{formatModalTime(ride.departureTime)}</Text>
              </View>
              <View style={styles.driverInfoGridItem}>
                <Text style={styles.driverInfoGridLabel}>Price/Seat</Text>
                <Text style={styles.driverInfoGridValue}>₹{ride.price}</Text>
              </View>
              <View style={styles.driverInfoGridItem}>
                <Text style={styles.driverInfoGridLabel}>Total Seats</Text>
                <Text style={styles.driverInfoGridValue}>{ride.totalSeats}</Text>
              </View>
            </View>
          </View>

          {/* PASSENGER LIST SECTION */}
          <View style={styles.driverModalSection}>
            <Text style={styles.driverSectionTitle}>PASSENGERS ({passengers.length})</Text>
            
            {passengers.length > 0 ? (
              <View style={styles.driverPassengersList}>
                {passengers.map((passenger, index) => (
                  <View key={index} style={styles.driverPassengerCard}>
                    <View style={styles.driverPassengerAvatar}>
                      <Text style={styles.driverPassengerAvatarText}>
                        {passenger.passengerName.charAt(0)}
                      </Text>
                    </View>

                    <View style={styles.driverPassengerInfo}>
                      <Text style={styles.driverPassengerName}>{passenger.passengerName}</Text>
                      <Text style={styles.driverPassengerDetail}>{passenger.year} • {passenger.course}</Text>
                    </View>

                    {passenger.status === 'pending' ? (
                      <View style={styles.driverPassengerActions}>
                        <TouchableOpacity
                          style={[styles.driverActionButton, styles.driverAcceptButton]}
                          onPress={async () => {
                            setProcessingBooking(passenger.passengerId);
                            try {
                              await onAcceptPassenger(passenger.passengerId);
                            } finally {
                              setProcessingBooking(null);
                            }
                          }}
                          disabled={processingBooking === passenger.passengerId}
                        >
                          <MaterialCommunityIcons name="check" size={16} color={WARM_CORE.white} />
                          <Text style={styles.driverSuccessButtonText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.driverActionButton, styles.driverRejectButton]}
                          onPress={async () => {
                            setProcessingBooking(passenger.passengerId);
                            try {
                              await onRejectPassenger(passenger.passengerId);
                            } finally {
                              setProcessingBooking(null);
                            }
                          }}
                          disabled={processingBooking === passenger.passengerId}
                        >
                          <MaterialCommunityIcons name="close" size={16} color={WARM_CORE.white} />
                          <Text style={styles.driverDangerButtonText}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.driverStatusIndicator,
                          {
                            backgroundColor:
                              passenger.status === 'accepted'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : passenger.status === 'pending'
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(239, 68, 68, 0.15)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.driverStatusIndicatorText,
                            {
                              color:
                                passenger.status === 'accepted'
                                  ? WARM_CORE.success
                                  : passenger.status === 'pending'
                                  ? '#F59E0B'
                                  : WARM_CORE.error,
                            },
                          ]}
                        >
                          {passenger.status === 'pending' ? 'Ride Requested' : passenger.status.charAt(0).toUpperCase() + passenger.status.slice(1)}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.driverNoPssengerState}>
                <MaterialCommunityIcons name="account-off" size={40} color={WARM_CORE.textSecondary} />
                <Text style={styles.driverNoPassengerText}>No passengers yet</Text>
              </View>
            )}
          </View>

          {/* EARNINGS SECTION */}
          <View style={styles.driverModalSection}>
            <Text style={styles.driverSectionTitle}>EARNINGS BREAKDOWN</Text>
            
            <View style={styles.driverEarningsBreakdown}>
              <View style={styles.driverEarningsRow}>
                <Text style={styles.driverEarningsRowLabel}>Confirmed Passengers</Text>
                <Text style={styles.driverEarningsRowValue}>
                  {passengers.filter(p => p.status === 'accepted').length}
                </Text>
              </View>
              
              <View style={styles.driverEarningsRow}>
                <Text style={styles.driverEarningsRowLabel}>Price per Seat</Text>
                <Text style={styles.driverEarningsRowValue}>₹{ride.price}</Text>
              </View>

              <View style={styles.driverEarningsDivider} />

              <View style={styles.driverEarningsRow}>
                <Text style={styles.driverEarningsTotalLabel}>Total Savings</Text>
                <Text style={styles.driverEarningsTotalValue}>₹{earnings}</Text>
              </View>
            </View>
          </View>

          {/* ACTION BUTTONS */}
          <View style={styles.driverActionButtonsSection}>
            {/* START RIDE BUTTON */}
            {ride.status === 'active' && (
              <TouchableOpacity 
                style={[styles.driverSuccessButton, { flex: 1, marginBottom: 12 }, isStarting && { opacity: 0.6 }]}
                onPress={async () => {
                  setIsStarting(true);
                  try {
                    await onStartRide(ride.id);
                    onClose();
                  } catch (error) {
                    console.error('Failed to start ride:', error);
                  } finally {
                    setIsStarting(false);
                  }
                }}
                disabled={isStarting || isCanceling}
              >
                <MaterialCommunityIcons 
                  name={isStarting ? "loading" : "play-circle-outline"} 
                  size={18} 
                  color={WARM_CORE.success} 
                />
                <Text style={styles.driverSuccessButtonText}>{isStarting ? 'Starting...' : 'Start Ride'}</Text>
              </TouchableOpacity>
            )}

            {/* CHAT BUTTON */}
            {(ride.status === 'active' || ride.status === 'in_progress') && passengers.some(p => p.status === 'accepted') && (
              <TouchableOpacity 
                style={[styles.driverInfoButton, { flex: 1, marginBottom: 12 }]}
                onPress={() => {
                  const firstAcceptedPassenger = passengers.find(p => p.status === 'accepted');
                  if (firstAcceptedPassenger) {
                    onClose();
                    router.push({
                      pathname: '/chat',
                      params: {
                        rideId: ride.id,
                        bookingId: firstAcceptedPassenger.passengerId,
                      },
                    });
                  }
                }}
              >
                <MaterialCommunityIcons name="message-outline" size={18} color="#0EA5E9" />
                <Text style={styles.driverInfoButtonText}>Chat with Passenger</Text>
              </TouchableOpacity>
            )}

            {/* FINISH RIDE BUTTON */}
            {ride.status === 'in_progress' && (
              <TouchableOpacity 
                style={[styles.driverSuccessButton, { flex: 1, marginBottom: 12 }, isCompleting && { opacity: 0.6 }]}
                onPress={async () => {
                  setIsCompleting(true);
                  try {
                    await onCompleteRide(ride.id);
                    onClose();
                  } catch (error) {
                    console.error('Failed to complete ride:', error);
                  } finally {
                    setIsCompleting(false);
                  }
                }}
                disabled={isCompleting || isCanceling}
              >
                <MaterialCommunityIcons 
                  name={isCompleting ? "loading" : "check-circle-outline"} 
                  size={18} 
                  color={WARM_CORE.success}
                />
                <Text style={styles.driverSuccessButtonText}>{isCompleting ? 'Completing...' : 'Finish Ride'}</Text>
              </TouchableOpacity>
            )}

            {/* CANCEL RIDE BUTTON */}
            {ride.status !== 'completed' && (
              <TouchableOpacity 
                style={[styles.driverDangerButton, { flex: 1 }, isCanceling && { opacity: 0.6 }]}
                onPress={async () => {
                  setIsCanceling(true);
                  try {
                    await onCancelRide(ride.id);
                  } finally {
                    setIsCanceling(false);
                  }
                }}
                disabled={isCanceling || isStarting || isCompleting}
              >
                <MaterialCommunityIcons 
                  name={isCanceling ? "loading" : "trash-can-outline"} 
                  size={18} 
                  color={WARM_CORE.error} 
                />
                <Text style={styles.driverDangerButtonText}>{isCanceling ? 'Canceling...' : 'Cancel Ride'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
    paddingBottom: 48,
  } as ViewStyle,

  /* ── Header ─────────────────────────────────────────────────────────────── */
  headerSection: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: WARM_CORE.background,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  } as ViewStyle,
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  } as TextStyle,
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.1,
  } as TextStyle,

  /* ── Skeleton ────────────────────────────────────────────────────────────── */
  skeletonCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  skeletonBlock: {
    backgroundColor: '#E4D5C1',
  } as ViewStyle,
  skeletonTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  } as ViewStyle,
  skeletonRouteRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  } as ViewStyle,
  skeletonRouteIndicator: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  } as ViewStyle,
  skeletonBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,

  /* ── Ride Card ───────────────────────────────────────────────────────────── */
  rideCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 5,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  acceptedStripe: {
    height: 3,
    backgroundColor: WARM_CORE.success,
    borderRadius: 2,
  } as ViewStyle,

  /* ── Card Top Section ────────────────────────────────────────────────────── */
  cardTopSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  } as ViewStyle,
  timeSection: {
    alignItems: 'flex-start',
  } as ViewStyle,
  departureTime: {
    fontSize: 19,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 2,
    letterSpacing: -0.3,
  } as TextStyle,
  departureDate: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.2,
  } as TextStyle,
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  } as ViewStyle,
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: WARM_CORE.success,
  } as ViewStyle,
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  } as TextStyle,

  /* ── Route Section ───────────────────────────────────────────────────────── */
  routeSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
    gap: 12,
  } as ViewStyle,
  routeIndicator: {
    alignItems: 'center',
    gap: 5,
    paddingTop: 3,
  } as ViewStyle,
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WARM_CORE.white,
    borderWidth: 2,
    borderColor: WARM_CORE.white,
  } as ViewStyle,
  routeLine: {
    width: 2,
    height: 38,
    backgroundColor: WARM_CORE.border,
    borderRadius: 1,
  } as ViewStyle,
  routeDetails: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 12,
  } as ViewStyle,
  locationDetail: {
    justifyContent: 'center',
  } as ViewStyle,
  locationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: WARM_CORE.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 3,
  } as TextStyle,
  locationName: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,

  /* ── Time Remaining ──────────────────────────────────────────────────────── */
  timeRemainingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 80, 10, 0.18)',
    marginTop: 28,
    marginBottom: 8,
  } as ViewStyle,
  timeRemainingText: {
    color: WARM_CORE.primary,
    fontSize: 12,
    fontWeight: '600',
  } as TextStyle,

  /* ── Card Bottom Section ─────────────────────────────────────────────────── */
  cardBottomSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  } as ViewStyle,

  /* ── Driver Section ──────────────────────────────────────────────────────── */
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  } as ViewStyle,
  driverAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: WARM_CORE.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  driverInitial: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  driverInfo: {
    flex: 1,
  } as ViewStyle,
  driverName: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 2,
  } as TextStyle,
  carModel: {
    fontSize: 11,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
  } as TextStyle,

  /* ── Seats Section ───────────────────────────────────────────────────────── */
  seatsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginHorizontal: 10,
  } as ViewStyle,
  seatsText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,

  /* ── Price Section ───────────────────────────────────────────────────────── */
  priceSection: {
    alignItems: 'flex-end',
  } as ViewStyle,
  price: {
    fontSize: 17,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 1,
    letterSpacing: -0.3,
  } as TextStyle,
  priceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,

  /* ── Action Row ──────────────────────────────────────────────────────────── */
  acceptedActionsContainer: {
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 10,
  } as ViewStyle,
  actionDivider: {
    height: 1,
    backgroundColor: WARM_CORE.border,
    marginHorizontal: 16,
  } as ViewStyle,
  actionRowContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    alignItems: 'center',
  } as ViewStyle,
  chatButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: WARM_CORE.primary,
    gap: 8,
  } as ViewStyle,
  chatButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.white,
    letterSpacing: -0.1,
  } as TextStyle,
  cancelActionButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.15)',
  } as ViewStyle,
  cancelActionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
    letterSpacing: -0.1,
  } as TextStyle,
  penaltyWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212, 80, 10, 0.18)',
  } as ViewStyle,
  penaltyWarningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.primary,
    lineHeight: 17,
  } as TextStyle,
  penaltyPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  } as ViewStyle,
  penaltyPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.3,
  } as TextStyle,

  /* ── Penalty Section ─────────────────────────────────────────────────────── */
  penaltySection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(239, 68, 68, 0.15)',
  } as ViewStyle,
  penaltyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
    flex: 1,
  } as TextStyle,

  /* ── Empty State ─────────────────────────────────────────────────────────── */
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 24,
  } as ViewStyle,
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: WARM_CORE.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1.5,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  emptyStateText: {
    fontSize: 20,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  } as TextStyle,
  emptyStateSubText: {
    fontSize: 14,
    color: WARM_CORE.textSecondary,
    marginBottom: 36,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 21,
  } as TextStyle,
  bookNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_CORE.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    gap: 8,
    shadowColor: WARM_CORE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
  bookNowButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,

  /* ── Modal ───────────────────────────────────────────────────────────────── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 18, 13, 0.6)',
    justifyContent: 'flex-end',
  } as ViewStyle,
  modalContent: {
    backgroundColor: WARM_CORE.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 14,
    borderTopWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: WARM_CORE.border,
    alignSelf: 'center',
    marginBottom: 28,
  } as ViewStyle,
  modalIconWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  } as ViewStyle,
  modalIconBackground: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  } as ViewStyle,
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: WARM_CORE.text,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.4,
  } as TextStyle,
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  } as TextStyle,
  modalBody: {
    marginBottom: 20,
  } as ViewStyle,

  /* ── Modal Info Sections ─────────────────────────────────────────────────── */
  modalInfoSection: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  } as ViewStyle,
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  infoContent: {
    marginLeft: 24,
  } as ViewStyle,
  infoPrimaryValue: {
    fontSize: 17,
    fontWeight: '800',
    color: WARM_CORE.text,
    marginBottom: 2,
    letterSpacing: -0.3,
  } as TextStyle,
  infoSecondaryValue: {
    fontSize: 12,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  modalPenaltyCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderColor: 'rgba(239, 68, 68, 0.15)',
  } as ViewStyle,
  successSection: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.18)',
  } as ViewStyle,
  successText: {
    fontSize: 12,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    marginLeft: 24,
    marginTop: 2,
  } as TextStyle,
  modalDivider: {
    height: 1,
    backgroundColor: WARM_CORE.border,
    marginHorizontal: -24,
    marginBottom: 24,
  } as ViewStyle,

  /* Modal Footer — stacked buttons */
  modalFooter: {
    flexDirection: 'column',
    gap: 10,
  } as ViewStyle,
  /* Dominant red button — confirm destructive action */
  modalPrimaryBtn: {
    flexDirection: 'row',
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  } as ViewStyle,
  modalPrimaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.white,
    letterSpacing: -0.1,
  } as TextStyle,
  /* Ghost secondary — keep booking */
  modalSecondaryBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WARM_CORE.card,
  } as ViewStyle,
  modalSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  } as TextStyle,
  buttonDisabled: {
    opacity: 0.5,
  } as ViewStyle,

  /* ── Switcher Tabs ─────────────────────────────────────────────────────── */
  topTabContainer: {
    flexDirection: 'row',
    backgroundColor: WARM_CORE.card,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  } as ViewStyle,
  topTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  } as ViewStyle,
  topTabActive: {
    borderBottomColor: WARM_CORE.primary,
  } as ViewStyle,
  topTabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  topTabLabelActive: {
    color: WARM_CORE.primary,
    fontWeight: '800',
  } as TextStyle,
  subTabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  subTabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: WARM_CORE.card,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
  } as ViewStyle,
  subTabButtonActive: {
    backgroundColor: WARM_CORE.primary,
    borderColor: WARM_CORE.primary,
  } as ViewStyle,
  subTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  subTabTextActive: {
    color: WARM_CORE.white,
    fontWeight: '700',
  } as TextStyle,

  /* ── Taxi Pool Card ──────────────────────────────────────────────────────── */
  taxiPoolCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: WARM_CORE.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  } as ViewStyle,
  taxiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  } as ViewStyle,
  taxiCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  } as ViewStyle,
  taxiIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 80, 10, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  taxiDestText: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
    letterSpacing: -0.2,
    marginBottom: 2,
    maxWidth: 180,
  } as TextStyle,
  taxiTimeText: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  taxiStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  } as ViewStyle,
  taxiStatusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  } as TextStyle,
  taxiCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: WARM_CORE.border,
  } as ViewStyle,
  taxiCardInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  taxiStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  taxiStatText: {
    fontSize: 12,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  taxiDotSeparator: {
    fontSize: 12,
    color: WARM_CORE.border,
  } as TextStyle,
  taxiDetailsAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  taxiDetailsActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.primary,
  } as TextStyle,

  // ===== DRIVER & MODAL STYLES =====
  driverTabContainer: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  } as ViewStyle,
  driverTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  } as ViewStyle,
  driverTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: WARM_CORE.primary,
    marginBottom: -1,
  } as ViewStyle,
  driverTabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  driverTabLabelActive: {
    color: WARM_CORE.primary,
  } as TextStyle,
  driverTabUnderline: {
    position: 'absolute',
    bottom: -1,
    height: 2,
    width: '100%',
    backgroundColor: WARM_CORE.primary,
  } as ViewStyle,

  pendingRequestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(217, 119, 6, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.18)',
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  } as ViewStyle,
  pendingRequestsText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
    lineHeight: 17,
  } as TextStyle,

  driverModalContainer: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  driverModalContent: {
    flex: 1,
    backgroundColor: WARM_CORE.background,
  } as ViewStyle,
  driverModalContentPadded: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  } as ViewStyle,
  driverModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  } as ViewStyle,
  driverCloseButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  driverModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  driverModalSection: {
    marginBottom: 24,
  } as ViewStyle,
  driverSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.primary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as TextStyle,
  driverRouteBox: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 16,
    flexDirection: 'row',
    gap: 16,
  } as ViewStyle,
  driverFullRouteIndicator: {
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  driverFullRouteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WARM_CORE.primary,
  } as ViewStyle,
  driverFullRouteLine: {
    width: 2,
    height: 48,
    backgroundColor: WARM_CORE.border,
  } as ViewStyle,
  driverFullLocationsContainer: {
    flex: 1,
    justifyContent: 'space-between',
  } as ViewStyle,
  driverRouteLabelBold: {
    fontSize: 11,
    fontWeight: '700',
    color: WARM_CORE.primary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as TextStyle,
  driverRouteValueText: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.text,
  } as TextStyle,
  driverRouteSpacing: {
    height: 8,
  } as ViewStyle,
  driverInfoGridRow: {
    flexDirection: 'row',
    gap: 12,
  } as ViewStyle,
  driverInfoGridItem: {
    flex: 1,
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 12,
    alignItems: 'center',
  } as ViewStyle,
  driverInfoGridLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  } as TextStyle,
  driverInfoGridValue: {
    fontSize: 15,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  driverPassengersList: {
    gap: 10,
  } as ViewStyle,
  driverPassengerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 14,
    gap: 12,
  } as ViewStyle,
  driverPassengerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: WARM_CORE.border,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  driverPassengerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.primary,
  } as TextStyle,
  driverPassengerInfo: {
    flex: 1,
  } as ViewStyle,
  driverPassengerName: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
    marginBottom: 2,
  } as TextStyle,
  driverPassengerDetail: {
    fontSize: 11,
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  driverPassengerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  } as ViewStyle,
  driverActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  } as ViewStyle,
  driverAcceptButton: {
    backgroundColor: WARM_CORE.success,
  } as ViewStyle,
  driverRejectButton: {
    backgroundColor: WARM_CORE.error,
  } as ViewStyle,
  driverSuccessButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    gap: 8,
  } as ViewStyle,
  driverSuccessButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.success,
  } as TextStyle,
  driverDangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    gap: 8,
  } as ViewStyle,
  driverDangerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.error,
  } as TextStyle,
  driverInfoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.2)',
    gap: 8,
  } as ViewStyle,
  driverInfoButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0EA5E9',
  } as TextStyle,
  driverEarningsBreakdown: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 16,
    gap: 12,
  } as ViewStyle,
  driverEarningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,
  driverEarningsRowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  driverEarningsRowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: WARM_CORE.text,
  } as TextStyle,
  driverEarningsDivider: {
    height: 1,
    backgroundColor: WARM_CORE.border,
  } as ViewStyle,
  driverEarningsTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: WARM_CORE.text,
  } as TextStyle,
  driverEarningsTotalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: WARM_CORE.success,
  } as TextStyle,
  driverActionButtonsSection: {
    marginTop: 8,
  } as ViewStyle,
  driverNoPssengerState: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  driverNoPassengerText: {
    fontSize: 13,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  driverStatusIndicator: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  } as ViewStyle,
  driverStatusIndicatorText: {
    fontSize: 12,
    fontWeight: '700',
  } as TextStyle,
});

