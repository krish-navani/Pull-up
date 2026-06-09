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
  const { bookings, rides, auth, cancelBooking, loadPassengerBookings, loadAllAvailableRides } = useAppContext();
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [isCancelingBooking, setIsCancelingBooking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Load passenger bookings AND rides on screen focus
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        if (auth.user?.id) {
          try {
            setIsLoading(true);
            await Promise.all([
              loadPassengerBookings(auth.user.id),
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
    }, [auth.user?.id, loadPassengerBookings, loadAllAvailableRides])
  );

  // Handle pull-to-refresh
  const handleRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      if (auth.user?.id) {
        await Promise.all([
          loadPassengerBookings(auth.user.id),
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
          <Text style={styles.headerTitle}>My Bookings</Text>
          <Text style={styles.headerSubtitle}>Your upcoming and ongoing rides</Text>
        </Animated.View>

        <Animated.View
          style={{
            flex: 1,
            opacity: contentAnim.opacity,
            transform: [{ translateY: contentAnim.translateY }],
          }}
        >
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#FFFFFF"
                progressBackgroundColor="#1E1E1E"
              />
            }
          >
            {isLoading ? (
              <View style={{ paddingTop: 8 }}>
                <BookingSkeletonCard delay={0} />
                <BookingSkeletonCard delay={80} />
                <BookingSkeletonCard delay={160} />
              </View>
            ) : passengerBookings.length === 0 ? (
              <View style={styles.emptyState}>
                <Animated.View
                  style={[
                    styles.emptyIconContainer,
                    { transform: [{ scale: emptyIconScale }, { translateY: emptyIconFloat }] },
                  ]}
                >
                  <MaterialCommunityIcons name="calendar-blank" size={52} color={WARM_CORE.textSecondary} />
                </Animated.View>
                <Text style={styles.emptyStateText}>No Active Bookings</Text>
                <Text style={styles.emptyStateSubText}>
                  You don{"'"}t have any upcoming or ongoing rides
                </Text>
                <Animated.View style={{ transform: [{ scale: bookBtnBreath }] }}>
                  <Animated.View style={{ transform: [{ scale: bookBtnScale }] }}>
                    <TouchableOpacity
                      style={styles.bookNowButton}
                      onPress={() => router.push('/(tabs)/home')}
                      onPressIn={onBookNowIn}
                      onPressOut={onBookNowOut}
                      activeOpacity={1}
                    >
                      <MaterialCommunityIcons name="plus-circle-outline" size={18} color={WARM_CORE.white} />
                      <Text style={styles.bookNowButtonText}>Book a Ride Now</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </Animated.View>
              </View>
            ) : (
              <View>
                {passengerBookings.map((booking, index) => renderBookedRideCard(booking, index))}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </>
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
});

