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
// Skeleton shimmer card shown while history is loading
// ---------------------------------------------------------------------------
function HistorySkeletonCard({ delay = 0 }: { delay?: number }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(16)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered slide-in
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
          <View style={[styles.skeletonBlock, { width: 90, height: 26, borderRadius: 6 }]} />
          <View style={[styles.skeletonBlock, { width: 60, height: 16, borderRadius: 4 }]} />
        </View>
        {/* Route lines */}
        <View style={styles.skeletonRouteRow}>
          <View style={styles.skeletonRouteIndicator}>
            <View style={[styles.skeletonBlock, { width: 8, height: 8, borderRadius: 4 }]} />
            <View style={[styles.skeletonBlock, { width: 2, height: 44, borderRadius: 1 }]} />
            <View style={[styles.skeletonBlock, { width: 8, height: 8, borderRadius: 4 }]} />
          </View>
          <View style={{ flex: 1, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <View style={[styles.skeletonBlock, { width: 40, height: 10, borderRadius: 2 }]} />
              <View style={[styles.skeletonBlock, { width: '70%', height: 14, borderRadius: 4 }]} />
            </View>
            <View style={{ gap: 4 }}>
              <View style={[styles.skeletonBlock, { width: 50, height: 10, borderRadius: 2 }]} />
              <View style={[styles.skeletonBlock, { width: '60%', height: 14, borderRadius: 4 }]} />
            </View>
          </View>
        </View>
        {/* Bottom row */}
        <View style={styles.skeletonBottomRow}>
          <View style={[styles.skeletonBlock, { width: 36, height: 36, borderRadius: 6 }]} />
          <View style={{ flex: 1, gap: 4, marginLeft: 10 }}>
            <View style={[styles.skeletonBlock, { width: '45%', height: 12, borderRadius: 4 }]} />
            <View style={[styles.skeletonBlock, { width: '30%', height: 10, borderRadius: 3 }]} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={[styles.skeletonBlock, { width: 45, height: 16, borderRadius: 4 }]} />
            <View style={[styles.skeletonBlock, { width: 35, height: 10, borderRadius: 3 }]} />
          </View>
        </View>
        {/* Repeat Button Skeleton */}
        <View style={[styles.skeletonBlock, { width: '100%', height: 36, borderRadius: 10, marginTop: 12 }]} />
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Pressable card with spring scale + shadow lift on press
// ---------------------------------------------------------------------------
function PressableHistoryCard({ onPress, style, children, index = 0 }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  // Entry animation — staggered per card
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entrySlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const delay = index * 80;
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(entryOpacity, {
          toValue: 1,
          duration: 250,
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
        <Pressable onPressIn={onIn} onPressOut={onOut} onPress={onPress} style={{ borderRadius: 12, overflow: 'hidden' }}>
          {children}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Animated press button for Repeat Ride
// ---------------------------------------------------------------------------
function RepeatButtonAnimated({ onPress, style, children, disabled }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn = () =>
    Animated.spring(scale, { toValue: 0.94, damping: 12, stiffness: 300, mass: 0.5, useNativeDriver: true }).start();
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
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function RideHistoryScreen() {
  const router = useRouter();
  const { bookings, rides, auth, loadAllRidesIncludingHistory, loadPassengerBookings } = useAppContext();
  const [selectedFilter, setSelectedFilter] = useState<'ongoing' | 'completed' | 'cancelled'>('ongoing');
  const [isRepeating, setIsRepeating] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Filter tabs slide indicator
  const [containerWidth, setContainerWidth] = useState(0);
  const activeTabAnim = useRef(new Animated.Value(0)).current;

  // Staggered screen entry animations
  const headerAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const filterAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(18) }).current;
  const contentAnim = useRef({ opacity: new Animated.Value(0), translateY: new Animated.Value(22) }).current;

  // Empty state animations
  const emptyIconScale = useRef(new Animated.Value(0)).current;
  const emptyIconFloat = useRef(new Animated.Value(0)).current;
  const bookBtnBreath = useRef(new Animated.Value(1)).current;
  const bookBtnScale = useRef(new Animated.Value(1)).current;

  // Tab switching animation trigger
  useEffect(() => {
    const targetValue = selectedFilter === 'ongoing' ? 0 : selectedFilter === 'completed' ? 1 : 2;
    Animated.spring(activeTabAnim, {
      toValue: targetValue,
      damping: 22,
      stiffness: 200,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [selectedFilter]);

  // Initial cinematic stagger reveal
  useEffect(() => {
    Animated.stagger(80, [
      Animated.parallel([
        Animated.timing(headerAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(headerAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(filterAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(filterAnim.translateY, { toValue: 0, damping: 18, stiffness: 200, mass: 0.9, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentAnim.opacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(contentAnim.translateY, { toValue: 0, damping: 20, stiffness: 160, mass: 1, useNativeDriver: true }),
      ]),
    ]).start();

    // Floating idle animation for empty state icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(emptyIconFloat, { toValue: -7, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(emptyIconFloat, { toValue: 7, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Load bookings and rides on screen focus to get current statuses
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        try {
          setIsLoading(true);
          console.log('[RIDE HISTORY] Loading data for history view (rides & bookings)');
          const promises: Promise<any>[] = [loadAllRidesIncludingHistory()];
          if (auth.user?.id) {
            promises.push(loadPassengerBookings(auth.user.id));
          }
          await Promise.all(promises);
          console.log('[RIDE HISTORY] ✅ History data loaded');
        } catch (error) {
          console.error('[RIDE HISTORY] ❌ Failed to load history data:', error);
        } finally {
          setIsLoading(false);
        }
      };
      loadData();
    }, [auth.user?.id, loadAllRidesIncludingHistory, loadPassengerBookings])
  );

  // Get historical bookings where current user is the passenger
  const rawUserBookings = bookings.filter((b, idx, self) => {
    if (b.passengerId !== auth.user?.id) return false;
    // Deduplicate: if there's another booking with the exact same ID earlier in the list, skip this one
    return self.findIndex(o => o.id === b.id) === idx;
  });

  // Keep only the most relevant booking per rideId
  const userBookings = (() => {
    const groups: { [rideId: string]: Booking[] } = {};
    for (const b of rawUserBookings) {
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
  
  // Get ongoing bookings (where the ride is in_progress)
  const ongoingBookings = userBookings.filter(b => {
    const ride = rides.find(r => r.id === b.rideId);
    return ride && ride.status === 'in_progress';
  });
  
  // Get completed/cancelled/rejected/expired bookings
  const historicalBookings = userBookings.filter(b => {
    const ride = rides.find(r => r.id === b.rideId);
    const bStatus = b.status as string;
    const isTerminalBooking = bStatus === 'completed' || bStatus === 'cancelled' || bStatus === 'rejected' || bStatus === 'expired' || bStatus === 'no_show';
    const isTerminalRide = ride && (ride.status === 'completed' || ride.status === 'cancelled' || (ride.status as string) === 'expired');
    return isTerminalBooking || isTerminalRide;
  });

  const filteredBookings = 
    selectedFilter === 'ongoing' 
      ? ongoingBookings
      : historicalBookings.filter(b => {
          if (selectedFilter === 'completed' || selectedFilter === 'cancelled') {
            const ride = rides.find(r => r.id === b.rideId);
            return b.status === selectedFilter || (ride && ride.status === selectedFilter);
          }
          return true;
        });

  // Empty state animations trigger
  useEffect(() => {
    if (!isLoading && filteredBookings.length === 0) {
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
  }, [isLoading, filteredBookings.length]);

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const handleRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      console.log('[RIDE HISTORY] Refreshing history data (rides & bookings)...');
      const promises: Promise<any>[] = [loadAllRidesIncludingHistory()];
      if (auth.user?.id) {
        promises.push(loadPassengerBookings(auth.user.id));
      }
      await Promise.all(promises);
      console.log('[RIDE HISTORY] ✅ Refreshed history data');
    } catch (error) {
      console.error('[RIDE HISTORY] ❌ Failed to refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [auth.user?.id, loadAllRidesIncludingHistory, loadPassengerBookings]);

  const formatDate = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'in_progress':
        return { bg: '#FEF3C7', text: '#D97706', label: 'Ongoing', icon: 'play-circle' as const };
      case 'completed':
        return { bg: '#D1FAE5', text: '#059669', label: 'Completed', icon: 'check-circle' as const };
      case 'cancelled':
        return { bg: '#FEE2E2', text: '#DC2626', label: 'Cancelled', icon: 'close-circle' as const };
      default:
        return { bg: '#F3F4F6', text: '#4B5563', label: status, icon: 'circle-outline' as const };
    }
  };

  const handleRepeatRide = (ride: any) => {
    setIsRepeating(ride.id);
    // Navigate to booking confirmation with same ride details
    setTimeout(() => {
      router.push({ pathname: '/booking-confirmation', params: { rideId: ride.id } });
      setIsRepeating(null);
    }, 300);
  };

  const onBookNowIn = () =>
    Animated.spring(bookBtnScale, { toValue: 0.95, damping: 12, stiffness: 300, mass: 0.5, useNativeDriver: true }).start();
  const onBookNowOut = () =>
    Animated.spring(bookBtnScale, { toValue: 1, damping: 16, stiffness: 200, mass: 0.8, useNativeDriver: true }).start();

  const renderHistoryCard = (booking: any, index: number) => {
    const ride = rides.find(r => r.id === booking.rideId);
    if (!ride) return null;

    const statusConfig = getStatusConfig(ride.status);
    const departureDate = new Date(ride.departureTime);
    const isToday = new Date().toDateString() === departureDate.toDateString();
    const isYesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toDateString() === departureDate.toDateString();

    let dateText = formatDate(ride.departureTime);
    if (isToday) dateText = 'Today';
    if (isYesterday) dateText = 'Yesterday';

    return (
      <PressableHistoryCard
        key={`${selectedFilter}-${booking.id}`}
        index={index}
        style={styles.historyCard}
        onPress={() => router.push({ pathname: '/ride-details', params: { rideId: ride.id, bookingId: booking.id } })}
      >
        {/* Status Badge and Date */}
        <View style={styles.cardTopSection}>
          <View style={styles.statusBadgeContainer}>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <MaterialCommunityIcons 
                name={statusConfig.icon} 
                size={16} 
                color={statusConfig.text}
              />
              <Text style={[styles.statusBadgeText, { color: statusConfig.text }]}>{statusConfig.label}</Text>
            </View>
          </View>
          <Text style={styles.dateText}>{dateText}</Text>
        </View>

        {/* Route Section with indicator */}
        <View style={styles.routeSection}>
          <View style={styles.routeIndicator}>
            <View style={styles.routeDot} />
            <View style={styles.routeLine} />
            <View style={styles.routeDot} />
          </View>

          <View style={styles.routeDetails}>
            <View style={styles.locationDetail}>
              <Text style={styles.locationLabel}>PICKUP</Text>
              <Text style={styles.locationName} numberOfLines={1}>
                {ride.pickupLocation.address.split(',')[0]}
              </Text>
              <Text style={styles.locationTime}>{formatTime(ride.departureTime)}</Text>
            </View>
            <View style={styles.locationDetail}>
              <Text style={styles.locationLabel}>DROPOFF</Text>
              <Text style={styles.locationName} numberOfLines={1}>
                {ride.dropLocation.address.split(',')[0]}
              </Text>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.cardDivider} />

        {/* Driver Info and Price */}
        <View style={styles.cardBottomSection}>
          <View style={styles.driverSection}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverInitial}>{ride.driverName.charAt(0)}</Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{ride.driverName}</Text>
              <Text style={styles.carModel}>{ride.carModel}</Text>
            </View>
          </View>

          <View style={styles.priceSection}>
            <Text style={styles.price}>₹{(ride.price * booking.seatsBooked).toFixed(0)}</Text>
            <Text style={styles.priceLabel}>{booking.seatsBooked} seat{booking.seatsBooked > 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Repeat Ride Button */}
        <RepeatButtonAnimated
          style={styles.repeatButton}
          onPress={() => handleRepeatRide(ride)}
          disabled={isRepeating === ride.id}
        >
          {isRepeating === ride.id ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.repeatButtonText}>Repeat Ride</Text>
            </>
          )}
        </RepeatButtonAnimated>
      </PressableHistoryCard>
    );
  };

  const tabWidth = containerWidth > 0 ? (containerWidth - 32) / 3 : 0;
  const translateX = activeTabAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, tabWidth, tabWidth * 2],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={WARM_CORE.background} />

      {/* Header Section */}
      <Animated.View 
        style={[
          styles.headerSection,
          {
            opacity: headerAnim.opacity,
            transform: [{ translateY: headerAnim.translateY }],
          }
        ]}
      >
        <Text style={styles.headerTitle}>Ride History</Text>
        <Text style={styles.headerSubtitle}>Track your completed and ongoing rides</Text>
      </Animated.View>

      {/* Error Banner */}
      {auth.error && (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle" size={18} color="#E11D48" />
          <Text style={styles.errorBannerText}>{auth.error}</Text>
        </View>
      )}

      {/* Filter Tabs */}
      <Animated.View 
        style={[
          styles.filterContainerWrapper,
          {
            opacity: filterAnim.opacity,
            transform: [{ translateY: filterAnim.translateY }],
          }
        ]}
      >
        <View style={styles.filterContainer} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
          {containerWidth > 0 && (
            <Animated.View
              style={[
                styles.filterIndicatorAnimated,
                {
                  width: tabWidth,
                  transform: [{ translateX }],
                },
              ]}
            />
          )}

          <TouchableOpacity
            style={styles.filterTab}
            onPress={() => setSelectedFilter('ongoing')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, selectedFilter === 'ongoing' && styles.filterTextActive]}>
              Ongoing
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterTab}
            onPress={() => setSelectedFilter('completed')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, selectedFilter === 'completed' && styles.filterTextActive]}>
              Completed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterTab}
            onPress={() => setSelectedFilter('cancelled')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, selectedFilter === 'cancelled' && styles.filterTextActive]}>
              Cancelled
            </Text>
          </TouchableOpacity>
        </View>
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
              tintColor={WARM_CORE.primary}
              progressBackgroundColor={WARM_CORE.card}
            />
          }
        >
          {isLoading ? (
            <View style={{ paddingTop: 8 }}>
              <HistorySkeletonCard delay={0} />
              <HistorySkeletonCard delay={80} />
              <HistorySkeletonCard delay={160} />
            </View>
          ) : filteredBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Animated.View
                style={[
                  styles.emptyIconContainer,
                  { transform: [{ scale: emptyIconScale }, { translateY: emptyIconFloat }] },
                ]}
              >
                <MaterialCommunityIcons 
                  name={
                    selectedFilter === 'ongoing' ? 'play-circle-outline' :
                    selectedFilter === 'cancelled' ? 'close-circle-outline' : 'check-circle-outline'
                  } 
                  size={52} 
                  color={WARM_CORE.textSecondary} 
                />
              </Animated.View>
              <Text style={styles.emptyStateText}>
                {selectedFilter === 'ongoing' ? 'No Ongoing Rides' : selectedFilter === 'cancelled' ? 'No Cancelled Rides' : 'No Completed Rides'}
              </Text>
              <Text style={styles.emptyStateSubText}>
                {selectedFilter === 'ongoing'
                  ? 'Your active rides will appear here'
                  : selectedFilter === 'cancelled' 
                  ? 'Your cancelled rides will appear here' 
                  : 'Completed rides will appear here'}
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
                    <MaterialCommunityIcons name="car" size={18} color="#FFFFFF" />
                    <Text style={styles.bookNowButtonText}>Find a Ride</Text>
                  </TouchableOpacity>
                </Animated.View>
              </Animated.View>
            </View>
          ) : (
            filteredBookings.map((booking, index) => renderHistoryCard(booking, index))
          )}
        </ScrollView>
      </Animated.View>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  } as ViewStyle,

  /* Header Section */
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: -4,
  } as ViewStyle,
  errorBannerText: {
    color: '#E11D48',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
    flex: 1,
  } as TextStyle,

  /* Skeleton Loading */
  skeletonCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    marginBottom: 12,
    padding: 14,
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
    marginBottom: 14,
  } as ViewStyle,
  skeletonRouteRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
    paddingBottom: 14,
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

  /* Filter Tabs */
  filterContainerWrapper: {
    backgroundColor: WARM_CORE.background,
    borderBottomWidth: 1,
    borderBottomColor: WARM_CORE.border,
  } as ViewStyle,
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    position: 'relative',
  } as ViewStyle,
  filterTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,
  filterTextActive: {
    color: WARM_CORE.primary,
    fontWeight: '700',
  } as TextStyle,
  filterIndicatorAnimated: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    height: 2,
    backgroundColor: WARM_CORE.primary,
    borderRadius: 1,
  } as ViewStyle,

  /* History Card */
  historyCard: {
    backgroundColor: WARM_CORE.card,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: WARM_CORE.border,
    overflow: 'hidden',
  } as ViewStyle,

  /* Card Top Section - Status and Date */
  cardTopSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  } as ViewStyle,
  statusBadgeContainer: {
    flex: 1,
  } as ViewStyle,
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  } as ViewStyle,
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  } as TextStyle,
  dateText: {
    fontSize: 11,
    fontWeight: '600',
    color: WARM_CORE.textSecondary,
  } as TextStyle,

  /* Route Section */
  routeSection: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  } as ViewStyle,
  routeIndicator: {
    width: 10,
    alignItems: 'center',
    gap: 5,
    paddingTop: 3,
  } as ViewStyle,
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: WARM_CORE.primary,
    borderWidth: 2,
    borderColor: WARM_CORE.primary,
  } as ViewStyle,
  routeLine: {
    width: 2,
    height: 38,
    backgroundColor: WARM_CORE.border,
    borderRadius: 1,
  } as ViewStyle,
  routeDetails: {
    flex: 1,
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
  locationTime: {
    fontSize: 11,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    marginTop: 2,
  } as TextStyle,

  /* Card Divider */
  cardDivider: {
    height: 1,
    backgroundColor: WARM_CORE.border,
    marginHorizontal: 14,
  } as ViewStyle,

  /* Card Bottom Section - Driver and Price */
  cardBottomSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  } as ViewStyle,
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  } as ViewStyle,
  driverAvatar: {
    width: 38,
    height: 38,
    borderRadius: 8,
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

  /* Repeat Ride Button */
  repeatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: WARM_CORE.primary,
    borderWidth: 1,
    borderColor: WARM_CORE.primary,
    marginHorizontal: 14,
    marginBottom: 14,
  } as ViewStyle,
  repeatButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,

  /* Empty State */
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
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
  bookNowButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: WARM_CORE.white,
  } as TextStyle,
});

